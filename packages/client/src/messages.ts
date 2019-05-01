export type Device = {
  port: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  locationId?: string
  vid?: string
  pid?: string
}

export type Request =
  | {requestId: string; cmd: 'listDevices'}
  | {requestId: string; cmd: 'open'; port: string; baudRate: number}
  | {requestId: string; cmd: 'write'; port: string; data: number[]}
  | {requestId: string; cmd: 'close'; port: string}

export type Response =
  | {requestId: string; cmd: 'success'}
  | {requestId: string; cmd: 'listDevices'; devices: Device[]}
  | {requestId?: string; cmd: 'error'; message: string}
  | {requestId: never; cmd: 'data'; port: string; data: number[]}
  | {requestId: never; cmd: 'closed'; port: string}
