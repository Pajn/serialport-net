import createLogger from 'pino'
import SerialPort from 'serialport'
import WebSocket from 'ws'
import {Request, Response} from './messages'

const logger = createLogger()

const portIsNotOpen = (port: string, requestId: string): Response => ({
  requestId,
  cmd: 'error',
  message: `Port is not open :${port}`,
})

async function listDevices() {
  const devices = await SerialPort.list()

  return devices.map(device => ({
    port: device.comName,
    manufacturer: device.manufacturer,
    serialNumber: device.serialNumber,
    pnpId: device.pnpId,
    locationId: device.locationId,
    vid: device.vendorId,
    pid: device.productId,
  }))
}

const wss = new WebSocket.Server({
  port: 8080,
  handleProtocols: ['serialport-net'],
})

wss.on('connection', (client, req) => {
  const clientLogger = logger.child({client: req.socket.remoteAddress})
  const openPorts = new Map<string, SerialPort>()

  const sendResponse = (request: Request | undefined, response: Response) =>
    new Promise((resolve, reject) => {
      const logger =
        request === undefined
          ? clientLogger
          : clientLogger.child({requestId: request.requestId})

      logger.trace({response}, 'Sending Response')
      client.send(JSON.stringify(response), err => {
        if (err) {
          logger.error({err, response}, 'Error sending response')
          reject(err)
        } else {
          logger.trace({response}, 'Sent Response')
          resolve()
        }
      })
    })

  async function handleRequest(request: Request) {
    const requestLogger = clientLogger.child({requestId: request.requestId})

    switch (request.cmd) {
      case 'listDevices':
        const devices = await listDevices()
        return sendResponse(request, {
          requestId: request.requestId,
          cmd: 'listDevices',
          devices,
        })
      case 'open':
        let port: SerialPort
        try {
          port = await new Promise((resolve, reject) => {
            const port = new SerialPort(
              request.port,
              {baudRate: request.baudRate},
              err => {
                if (err) reject(err)
                else resolve(port)
              },
            )
          })
        } catch (err) {
          requestLogger.warn({err, port: request.port}, 'Error opening port')
          return sendResponse(request, {
            cmd: 'error',
            message: `Error opening port: ${err}`,
          })
        }

        const portName = request.port
        openPorts.set(portName, port)

        port.on('data', async (data: Buffer) => {
          try {
            await sendResponse(undefined, {
              cmd: 'data',
              port: portName,
              data: data.toJSON().data,
            })
          } catch (err) {
            requestLogger.error({err}, `Error sending received data to client`)
            sendResponse(undefined, {
              cmd: 'error',
              message: `Error sending received data`,
            })
          }
        })
        port.on('error', err => {
          requestLogger.error({err}, `Serialport error`)
          sendResponse(undefined, {
            cmd: 'error',
            message: `Serialport error: ${err}`,
          })
        })
        port.on('close', async reason => {
          requestLogger.warn({reason}, `Serialport disconnected`)
          try {
            await sendResponse(undefined, {
              cmd: 'closed',
              port: portName,
            })
          } catch (err) {
            requestLogger.error(
              {err},
              `Error sending disconnect event to client`,
            )
          }
        })

        requestLogger.debug({port: portName}, 'Serialport opened')

        return sendResponse(request, {
          requestId: request.requestId,
          cmd: 'success',
        })
      case 'write':
        if (!openPorts.has(request.port))
          return sendResponse(
            request,
            portIsNotOpen(request.port, request.requestId),
          )

        try {
          await new Promise((resolve, reject) =>
            openPorts.get(request.port)!.write(request.data, err => {
              if (err) return reject(err)
              else return resolve()
            }),
          )
        } catch (err) {
          requestLogger.warn({err, port: request.port}, 'Error writing to port')
          return sendResponse(request, {
            cmd: 'error',
            message: `Error writing to port: ${err}`,
          })
        }

        await sendResponse(request, {
          requestId: request.requestId,
          cmd: 'success',
        })
        return
      case 'close':
        if (!openPorts.has(request.port))
          return sendResponse(
            request,
            portIsNotOpen(request.port, request.requestId),
          )

        try {
          await new Promise((resolve, reject) =>
            openPorts.get(request.port)!.close(err => {
              if (err) return reject(err)
              else return resolve()
            }),
          )
        } catch (err) {
          requestLogger.warn({err, port: request.port}, 'Error closing port')
          return sendResponse(request, {
            cmd: 'error',
            message: `Error closing port: ${err}`,
          })
        }

        await sendResponse(request, {
          requestId: request.requestId,
          cmd: 'success',
        })
        requestLogger.debug({port: request.port}, 'Serialport closed')
        return
    }
  }

  clientLogger.info('Client Connected')

  client.on('message', async data => {
    try {
      const message = JSON.parse(data.toString('utf8'))

      try {
        await handleRequest(message)
      } catch (err) {
        clientLogger.error({err}, 'Uncaught request error')
        sendResponse(undefined, {
          cmd: 'error',
          message: `Internal server error`,
        })
      }
    } catch (err) {
      sendResponse(undefined, {
        cmd: 'error',
        message: `Error parsing JSON: ${err}`,
      })
    }
  })

  client.on('ping', data => {
    clientLogger.trace('Client Ping')
    client.pong(data)
  })

  client.on('close', reason => {
    clientLogger.info({reason}, 'Client disconnected')

    for (const port of openPorts.values()) {
      port.close()
    }
  })
})
