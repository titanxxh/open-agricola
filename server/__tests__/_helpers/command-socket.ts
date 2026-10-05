import { randomUUID } from 'node:crypto'
import type WebSocket from 'ws'
import type { ClientCommand, ServerEvent } from '../../../shared/contract/protocol/ws'

const inputs = new WeakMap<WebSocket, { state?: Extract<ServerEvent, { type: 'stateUpdate' }>; joined?: Extract<ServerEvent, { type: 'roomJoined' | 'roomCreated' }> }>()

/** Send through the public protocol with a server-issued scope and current input. */
export async function sendCommand(ws: WebSocket & { received: ServerEvent[] }, command: ClientCommand): Promise<void> {
  if (!inputs.has(ws)) {
    const input: NonNullable<ReturnType<typeof inputs.get>> = {}
    inputs.set(ws, input)
    ws.on('message', raw => {
      const event = JSON.parse(raw.toString()) as ServerEvent
      if (event.type === 'stateUpdate') input.state = event
      if (event.type === 'roomJoined' || event.type === 'roomCreated') input.joined = event
    })
  }
  if (['getState','getHistory','joinRoom','auth','getCommandScope','getCommandReceipt'].includes(command.type)) {
    ws.send(JSON.stringify(command)); return
  }
  const requestId = randomUUID()
  const scope = new Promise<Extract<ServerEvent, { type: 'commandScope' }>>((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', receive); reject(new Error('Command scope timed out')) }, 4000)
    const receive = (raw: WebSocket.RawData) => {
      const event = JSON.parse(raw.toString()) as ServerEvent
      if (!('requestId' in event) || event.requestId !== requestId) return
      clearTimeout(timer); ws.off('message', receive)
      if (event.type === 'commandScope') resolve(event)
      else reject(new Error(JSON.stringify(event)))
    }
    ws.on('message', receive)
  })
  ws.send(JSON.stringify({ type: 'getCommandScope', requestId }))
  const result = await scope
  const state = inputs.get(ws)!.state ?? ws.received.findLast(event => event.type === 'stateUpdate')
  const joined = inputs.get(ws)!.joined ?? ws.received.findLast(event => event.type === 'roomJoined' || event.type === 'roomCreated')
  ws.send(JSON.stringify({ ...command, commandContext: command.commandContext ?? {
    scopeId: result.scope.scopeId, commandId: randomUUID(),
    ...(command.type === 'createRoom' ? {} : { roomId: joined?.roomId,
      expectedVersion: state?.version ?? 0, inputWindowId: state?.inputWindow?.id }),
  } }))
}
