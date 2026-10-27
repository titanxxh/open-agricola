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
  if (command.type === 'joinRoom') {
    const joined = new Promise<Extract<ServerEvent, { type: 'roomJoined' }> | null>((resolve, reject) => {
      const timer = setTimeout(() => { ws.off('message', receive); reject(new Error('Join timed out')) }, 8000)
      const receive = (raw: WebSocket.RawData) => {
        const event = JSON.parse(raw.toString()) as ServerEvent
        if (event.type !== 'error' && (event.type !== 'roomJoined' || event.roomId !== command.roomId)) return
        clearTimeout(timer)
        ws.off('message', receive)
        resolve(event.type === 'roomJoined' ? event : null)
      }
      ws.on('message', receive)
    })
    ws.send(JSON.stringify(command))
    const event = await joined
    // This helper prepares a playable game. Raw admission checks send joinRoom
    // directly so they can assert the final player's confirmation gate.
    if (event?.status === 'waiting' && event.colorConfirmationPlayerIndex === event.playerIndex) {
      await sendCommand(ws, { type: 'confirmPlayerColor' })
    }
    return
  }
  if (['getState','getHistory','auth','getCommandScope','getCommandReceipt'].includes(command.type)) {
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
  const joined = inputs.get(ws)!.joined ?? ws.received.findLast(event => event.type === 'roomJoined' || event.type === 'roomCreated')
  const state = (inputs.get(ws)!.state ?? ws.received.findLast(event => event.type === 'stateUpdate'))
  const roomState = state?.roomId === joined?.roomId ? state : undefined
  ws.send(JSON.stringify({ ...command, commandContext: command.commandContext ?? {
    scopeId: result.scope.scopeId, commandId: randomUUID(),
    ...(command.type === 'createRoom' ? {} : { roomId: joined?.roomId,
      expectedVersion: roomState?.version ?? 0, inputWindowId: roomState?.inputWindow?.id }),
  } }))
}
