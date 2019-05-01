import SerialPort from 'serialport'
import WebSocket from 'ws'
import {Request, Response, Device} from './messages'
import * as Stream from 'stream'

function request(client: WebSocket, request: Request): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let isSettled = false

    const requestId = `${Date.now()}::${Math.random()}`

    const listener = (data: WebSocket.Data) => {
      try {
        const message: Response = JSON.parse(data.toString('utf8'))

        if (message.requestId === requestId) {
          if (!isSettled) {
            isSettled = true
            resolve(message)
          }
          client.off('message', listener)
        }
      } catch (err) {
        if (!isSettled) {
          isSettled = true
          reject(err)
        }
        client.off('message', listener)
      }
    }

    client.on('message', listener)

    client.send(
      JSON.stringify({
        requestId,
        ...request,
      }),
      err => {
        if (err && !isSettled) {
          reject(err)
          isSettled = true
        }
      },
    )
  })
}

export class WebSocketSerialPort extends Stream.Duplex implements SerialPort {
  isOpen = false
  binding = null as any

  private responseListener = (response: Response) => {
    if ((response as any).port === this.path) {
      switch (response.cmd) {
        case 'error':
          this.emit('error', Error(response.message))
          break
        case 'data':
          this.emit('data', Buffer.from(response.data))
          break
        case 'closed':
          this.emit('close')
          break
      }
    }
  }

  constructor(
    private client: WebSocket,
    public readonly path: string,
    public readonly baudRate: number,
  ) {
    super()
  }

  write(
    data: string | number[] | Buffer,
    callback?: (error: any, bytesWritten: number) => void,
  ): boolean
  write(
    data: string | number[] | Buffer,
    encoding?:
      | 'ascii'
      | 'utf8'
      | 'utf16le'
      | 'ucs2'
      | 'base64'
      | 'binary'
      | 'hex',
    callback?: (error: any, bytesWritten: number) => void,
  ): boolean
  write(
    buffer: string | number[] | Buffer,
    encoding?:
      | 'ascii'
      | 'utf8'
      | 'utf16le'
      | 'ucs2'
      | 'base64'
      | 'binary'
      | 'hex'
      | ((error: any, bytesWritten: number) => void),
    callback?: (error: any, bytesWritten: number) => void,
  ) {
    let data: number[] | undefined

    if (Array.isArray(buffer)) data = buffer
    else if (typeof buffer === 'string') {
      if (typeof encoding === 'string') {
        buffer = Buffer.from(buffer, encoding)
      } else {
        buffer = Buffer.from(buffer)
      }
    }
    if (Buffer.isBuffer(buffer)) {
      data = buffer.toJSON().data
    }

    if (!data) throw Error('Unsupported message type')

    if (typeof encoding === 'function') {
      callback = encoding
    }

    request(this.client, {requestId: '', cmd: 'write', port: this.path, data})
      .then(response => {
        if (response.cmd !== 'success')
          throw Error('Enexpected response from server')
        if (callback) callback(null, data!.length)
      })
      .catch(err => {
        if (callback) callback(err, 0)
        else this.emit('error', err)
      })
    return false
  }

  async open(callback?: SerialPort.ErrorCallback) {
    const response = await request(this.client, {
      requestId: '',
      cmd: 'open',
      port: this.path,
      baudRate: this.baudRate,
    })

    if (response.cmd !== 'success')
      throw Error('Unexpected response from server')

    this.client.on('message', this.responseListener)

    this.isOpen = true
    if (callback) (callback as any)()
  }

  async close(callback?: (error: Error) => void) {
    const response = await request(this.client, {
      requestId: '',
      cmd: 'close',
      port: this.path,
    })

    if (response.cmd !== 'closed' || response.port !== this.path) {
      const error = Error('Unexpected response from server')
      if (callback) callback(error)
      else this.emit('error', error)
    }

    this.client.off('message', this.responseListener)

    this.isOpen = false
    if (callback) (callback as any)()
    this.emit('close')
  }

  update() {
    throw Error('unimplemented')
  }
  read(): null {
    throw Error('unimplemented')
  }
  set() {
    throw Error('unimplemented')
  }
  get() {
    throw Error('unimplemented')
  }
  flush() {
    throw Error('unimplemented')
  }
  drain() {
    throw Error('unimplemented')
  }
  pause(): this {
    throw Error('unimplemented')
  }
  resume(): this {
    throw Error('unimplemented')
  }
}

export function createClient(address: string) {
  const client = new WebSocket(address, 'serialport-net')

  return {
    listPorts: async (): Promise<Array<Device>> => {
      const response = await request(client, {
        requestId: '',
        cmd: 'listDevices',
      })

      if (response.cmd !== 'listDevices')
        throw Error('Unexpected response from server')

      return response.devices
    },
    openPort: async (
      port: string,
      options: {autoOpen?: boolean; baudRate: number},
    ) => {
      const serialport = new WebSocketSerialPort(client, port, options.baudRate)

      if (options.autoOpen || options.autoOpen === undefined) {
        await serialport.open()
      }

      return serialport
    },
  }
}
