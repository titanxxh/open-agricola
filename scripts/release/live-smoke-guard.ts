import type { BrowserContext } from '@playwright/test'
import type { ClientCommand } from '../../shared/contract/protocol/ws'

export const LIVE_READ_COMMANDS = [
  'auth', 'getCommandScope', 'getCommandReceipt', 'joinRoom', 'getState', 'getHistory', 'getGameEndProposal', 'quoteFenceSelection',
] satisfies readonly ClientCommand['type'][]
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

export function permitsLiveSmokeRequest(input: { apiOrigin: string; url: string; method: string; body: unknown; participantRoomId: string | null }): boolean {
  const url = new URL(input.url)
  if (safeMethods.has(input.method)) return true
  if (url.origin !== input.apiOrigin || input.method !== 'POST' || url.search || url.hash) return false
  if (['/api/auth/login', '/api/auth/logout', '/api/observability/telemetry'].includes(url.pathname)) return true
  const body = input.body
  return url.pathname === '/api/rooms/locate' && input.participantRoomId !== null
    && typeof body === 'object' && body !== null && !Array.isArray(body)
    && Object.keys(body).join(',') === 'roomId' && 'roomId' in body && body.roomId === input.participantRoomId
}

export function liveSmokeBrowserGuard({ apiOrigin, readTypes }: { apiOrigin: string; readTypes: readonly string[] }): void {
    const NativeWebSocket = window.WebSocket
    const expected = new URL(apiOrigin)
    expected.protocol = expected.protocol === 'https:' ? 'wss:' : 'ws:'
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const destination = new URL(url, location.href)
        if (destination.origin !== expected.origin || !/^\/nodes\/[A-Za-z0-9-]+\/ws$/.test(destination.pathname) || destination.search || destination.hash) {
          const binding: unknown = Reflect.get(window, '__oaLiveSmokeBlocked')
          if (typeof binding === 'function') void Promise.resolve(binding()).catch(() => {})
          throw new Error('Live acceptance blocked a non-read operation')
        }
        super(url, protocols)
      }
      send(data: Parameters<WebSocket['send']>[0]) {
        let message: unknown
        try { message = JSON.parse(String(data)) } catch { message = null }
        const type = typeof message === 'object' && message !== null && 'type' in message ? message.type : undefined
        let permitted = typeof type === 'string' && readTypes.some(allowed => allowed === type)
        if (type === 'joinRoom') permitted = typeof message === 'object' && message !== null
          && 'roomId' in message && message.roomId === Reflect.get(window, '__oaLiveSmokeRoom')
          && 'intent' in message && (message.intent === 'resume' || message.intent === 'join')
          && Object.keys(message).every(key => ['type', 'roomId', 'intent', 'name', 'requestedPlayerIndex', 'requestId'].includes(key))
          && (!('name' in message) || typeof message.name === 'string')
          && (!('requestId' in message) || typeof message.requestId === 'string')
          && (!('requestedPlayerIndex' in message) || typeof message.requestedPlayerIndex === 'number'
            && Number.isInteger(message.requestedPlayerIndex) && message.requestedPlayerIndex >= 0 && message.requestedPlayerIndex < 6)
        if (!permitted) {
          const binding: unknown = Reflect.get(window, '__oaLiveSmokeBlocked')
          if (typeof binding === 'function') void Promise.resolve(binding()).catch(() => {})
          throw new Error('Live acceptance blocked a non-read operation')
        }
        const binding: unknown = Reflect.get(window, '__oaLiveSmokeSent')
        if (typeof binding === 'function') void Promise.resolve(binding(type)).catch(() => {})
        super.send(data)
      }
    }
}

export async function installLiveSmokeGuard(context: BrowserContext, apiOrigin: string) {
  let participantRoomId: string | null = null
  const blocked: Array<'websocket' | 'http'> = []
  const sentTypes = new Set<string>()
  await context.exposeBinding('__oaLiveSmokeBlocked', () => { blocked.push('websocket') })
  await context.exposeBinding('__oaLiveSmokeSent', (_source, type: unknown) => {
    if (typeof type === 'string' && LIVE_READ_COMMANDS.some(allowed => allowed === type)) sentTypes.add(type)
  })
  await context.addInitScript(liveSmokeBrowserGuard, { apiOrigin, readTypes: [...LIVE_READ_COMMANDS] })
  await context.route('**/*', async route => {
    const request = route.request()
    let body: unknown
    if (request.method() === 'POST') {
      try { body = request.postDataJSON() } catch { body = undefined }
    }
    if (!permitsLiveSmokeRequest({ apiOrigin, url: request.url(), method: request.method(), body, participantRoomId })) {
      blocked.push('http'); await route.abort('blockedbyclient'); return
    }
    await route.continue()
  })
  return {
    async authorizeParticipantRoom(roomId: string) {
      participantRoomId = roomId
      await context.addInitScript(roomId => { Object.defineProperty(window, '__oaLiveSmokeRoom', { value: roomId }) }, roomId)
    },
    snapshot: () => ({ blocked: [...blocked], readCommandTypes: [...sentTypes].sort() }),
  }
}
