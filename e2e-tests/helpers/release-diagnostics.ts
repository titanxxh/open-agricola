import type { Page, Request, Response, WebSocket } from '@playwright/test'

type Location = { origin: string; path: string }
type MessageType =
  | 'auth' | 'authOk' | 'getCommandScope' | 'commandScope' | 'getCommandReceipt' | 'commandReceipt'
  | 'createRoom' | 'roomCreated' | 'joinRoom' | 'roomJoined' | 'getState' | 'stateUpdate'
  | 'soloHandSubmit' | 'parentSubmit' | 'takeAction' | 'resolveChoice' | 'confirmNextPlayer'
  | 'seat_replaced' | 'error' | 'other' | 'unparseable'
type ErrorCategory = 'TypeError' | 'ReferenceError' | 'SyntaxError' | 'RangeError' | 'Error' | 'other'
type FailureCategory = 'cancelled' | 'timeout' | 'connection' | 'dns' | 'tls' | 'other'
type ResourceType = 'document' | 'api' | 'image' | 'font'
type FrameDetail = {
  messageType: MessageType
  roomId?: string
  sync?: 'snapshot' | 'delta' | 'other'
  joinIntent?: 'join' | 'resume' | 'other'
  playerIndex?: number
}
type DiagnosticEvent =
  | ({ kind: 'document-navigation' | 'same-document-navigation' } & Location)
  | ({ kind: 'socket-open'; socketId: number } & Location)
  | { kind: 'socket-close'; socketId: number }
  | ({ kind: 'frame'; socketId: number; direction: 'sent' | 'received' } & FrameDetail)
  | ({ kind: 'request-start'; requestId: number; navigation: boolean; resourceType: ResourceType } & Location)
  | { kind: 'response'; requestId: number; status: number }
  | { kind: 'request-failed'; requestId: number; category: FailureCategory }
  | { kind: 'page-error'; category: ErrorCategory }

export type ReleaseDiagnosticEntry = DiagnosticEvent & {
  sequence: number
  at: number
  pageId: number
  documentId: number
}
export type ReleaseDiagnosticSnapshot = { entries: ReleaseDiagnosticEntry[]; dropped: number }
export type ReleasePageDiagnostics = { snapshot(): ReleaseDiagnosticSnapshot; dispose(): void }

let pageSequence = 0
const roomIdPattern = /^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|dev[2-6](?:-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?)$/i
const locationOf = (value: string): Location => {
  try {
    const url = new URL(value)
    return { origin: url.origin, path: url.pathname }
  } catch { return { origin: 'unknown', path: 'unknown' } }
}
const documentUrl = (value: string): string | undefined => {
  try { const url = new URL(value); url.hash = ''; return url.href } catch { return undefined }
}
const messageType = (value: unknown): MessageType => {
  switch (value) {
    case 'auth': case 'authOk': case 'getCommandScope': case 'commandScope': case 'getCommandReceipt': case 'commandReceipt':
    case 'createRoom': case 'roomCreated': case 'joinRoom': case 'roomJoined': case 'getState': case 'stateUpdate':
    case 'soloHandSubmit': case 'parentSubmit': case 'takeAction': case 'resolveChoice': case 'confirmNextPlayer':
    case 'seat_replaced': case 'error': return value
    default: return 'other'
  }
}
const frameDetail = (payload: string | Buffer): FrameDetail => {
  let value: unknown
  try { value = JSON.parse(payload.toString()) } catch { return { messageType: 'unparseable' } }
  if (typeof value !== 'object' || value === null || !('type' in value)) return { messageType: 'unparseable' }
  const detail: FrameDetail = { messageType: messageType(value.type) }
  if ('roomId' in value && typeof value.roomId === 'string' && roomIdPattern.test(value.roomId)) detail.roomId = value.roomId
  if ('sync' in value) detail.sync = value.sync === 'snapshot' || value.sync === 'delta' ? value.sync : 'other'
  if ('intent' in value) detail.joinIntent = value.intent === 'join' || value.intent === 'resume' ? value.intent : 'other'
  if ('playerIndex' in value && typeof value.playerIndex === 'number' && Number.isInteger(value.playerIndex) && value.playerIndex >= 0 && value.playerIndex < 6) detail.playerIndex = value.playerIndex
  return detail
}
const errorCategory = (name: string): ErrorCategory => {
  switch (name) {
    case 'TypeError': case 'ReferenceError': case 'SyntaxError': case 'RangeError': case 'Error': return name
    default: return 'other'
  }
}
const failureCategory = (text: string): FailureCategory => {
  if (/abort|cancel/i.test(text)) return 'cancelled'
  if (/timeout|timed.out/i.test(text)) return 'timeout'
  if (/certificate|ssl|tls/i.test(text)) return 'tls'
  if (/name.not.resolved|dns/i.test(text)) return 'dns'
  if (/connection|connect/i.test(text)) return 'connection'
  return 'other'
}

/** Records transport evidence without retaining credentials, payloads or game state. */
export function observeReleasePage(page: Page, { capacity = 128 }: { capacity?: number } = {}): ReleasePageDiagnostics {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10_000) throw new Error('Diagnostic capacity must be an integer between 1 and 10000')
  const pageId = ++pageSequence, entries: ReleaseDiagnosticEntry[] = [], requests = new WeakMap<Request, number>()
  const socketDisposers = new Set<() => void>()
  let sequence = 0, requestSequence = 0, socketSequence = 0, documentId = 0, dropped = 0, disposed = false
  let pendingNavigation: { request: Request; responseReceived: boolean } | undefined
  const record = (event: DiagnosticEvent, sourceDocumentId = documentId) => {
    if (disposed) return
    entries.push({ sequence: ++sequence, at: Date.now(), pageId, documentId: sourceDocumentId, ...event })
    if (entries.length > capacity) { entries.shift(); dropped++ }
  }
  const onRequest = (request: Request) => {
    let navigation = false
    try { navigation = request.isNavigationRequest() && request.frame() === page.mainFrame() } catch { /* A worker request has no associated frame. */ }
    if (navigation) pendingNavigation = { request, responseReceived: false }
    const location = locationOf(request.url())
    const browserResourceType = request.resourceType()
    const resourceType = navigation ? 'document'
      : browserResourceType === 'image' || browserResourceType === 'font' ? browserResourceType
        : /^\/api(?:\/|$)/.test(location.path) ? 'api' : undefined
    if (!resourceType) return
    const requestId = ++requestSequence; requests.set(request, requestId)
    record({ kind: 'request-start', requestId, navigation, resourceType, ...location })
  }
  const onResponse = (response: Response) => {
    const request = response.request()
    if (pendingNavigation?.request === request) pendingNavigation.responseReceived = true
    const requestId = requests.get(request)
    if (requestId !== undefined) record({ kind: 'response', requestId, status: response.status() })
  }
  const onRequestFailed = (request: Request) => {
    if (pendingNavigation?.request === request) pendingNavigation = undefined
    const requestId = requests.get(request)
    if (requestId !== undefined) record({ kind: 'request-failed', requestId, category: failureCategory(request.failure()?.errorText ?? '') })
  }
  const onNavigation = (frame: ReturnType<Page['mainFrame']>) => {
    if (frame !== page.mainFrame()) return
    const committed = documentUrl(frame.url())
    if (pendingNavigation?.responseReceived && committed !== undefined && committed === documentUrl(pendingNavigation.request.url())) {
      pendingNavigation = undefined; documentId++
      record({ kind: 'document-navigation', ...locationOf(frame.url()) })
    } else record({ kind: 'same-document-navigation', ...locationOf(frame.url()) })
  }
  const onSocket = (socket: WebSocket) => {
    const socketId = ++socketSequence, sourceDocumentId = documentId
    record({ kind: 'socket-open', socketId, ...locationOf(socket.url()) }, sourceDocumentId)
    const sent = ({ payload }: { payload: string | Buffer }) => record({ kind: 'frame', socketId, direction: 'sent', ...frameDetail(payload) }, sourceDocumentId)
    const received = ({ payload }: { payload: string | Buffer }) => record({ kind: 'frame', socketId, direction: 'received', ...frameDetail(payload) }, sourceDocumentId)
    const detach = () => { socket.off('framesent', sent); socket.off('framereceived', received); socket.off('close', closed) }
    const closed = () => { record({ kind: 'socket-close', socketId }, sourceDocumentId); detach(); socketDisposers.delete(detach) }
    socket.on('framesent', sent); socket.on('framereceived', received); socket.on('close', closed)
    socketDisposers.add(detach)
  }
  const onPageError = (error: Error) => record({ kind: 'page-error', category: errorCategory(error.name) })
  page.on('request', onRequest); page.on('response', onResponse); page.on('requestfailed', onRequestFailed)
  page.on('framenavigated', onNavigation); page.on('websocket', onSocket); page.on('pageerror', onPageError)
  return {
    snapshot: () => ({ entries: entries.map(entry => ({ ...entry })), dropped }),
    dispose() {
      if (disposed) return
      disposed = true
      page.off('request', onRequest); page.off('response', onResponse); page.off('requestfailed', onRequestFailed)
      page.off('framenavigated', onNavigation); page.off('websocket', onSocket); page.off('pageerror', onPageError)
      for (const dispose of socketDisposers) dispose()
      socketDisposers.clear(); pendingNavigation = undefined
    },
  }
}
