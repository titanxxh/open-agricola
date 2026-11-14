import {
  parseReplayBridgeContext, parseReplayBridgeReply, sameReplayBridgeContext, replayBridgeImageType,
  REPLAY_BRIDGE_HEARTBEAT_MS, REPLAY_BRIDGE_PARENT_TIMEOUT_MS, REPLAY_BRIDGE_MAX_REQUESTS,
  type ReplayBridgeContext, type ReplayBridgeRead, type ReplayBridgeRequest,
} from '../../shared/contract/protocol/replay-bridge'
import type { CustomCardDef } from '../../shared/contract/protocol/game'
import { clearCustomCardMetadata, registerCustomCardMetadata } from '../../shared/cards/custom-card-metadata'

export class ReplayBridgeTransport {
  readonly context: ReplayBridgeContext
  private port: MessagePort | undefined
  private sequence = 0
  private deadline = 0
  private parentDeadline = 0
  private retired = false
  private readonly pending = new Map<string, { resolve(response: Response): void; reject(error: Error): void; clean(): void }>()
  private readonly leases = new Map<string, number>()
  private readonly listeners = new Set<() => void>()
  private readonly blobUrls = new Set<string>()
  private readonly ready: Promise<void>
  private accept = () => {}
  private rejectReady = (_reason: Error) => {}
  private timer: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private handshake: ReturnType<typeof setInterval> | undefined
  private handshakeTimeout: ReturnType<typeof setTimeout> | undefined
  private readonly parentOrigin: string

  constructor(context: ReplayBridgeContext, parentOrigin: string) {
    this.context = context
    this.parentOrigin = parentOrigin
    this.ready = new Promise((resolve, reject) => { this.accept = resolve; this.rejectReady = reject })
    // A closed bridge can precede the first read during iframe initialization.
    void this.ready.catch(() => {})
    window.addEventListener('message', this.connect)
    window.addEventListener('pageshow', this.resume)
    document.addEventListener('visibilitychange', this.resume)
    const ready = () => window.parent.postMessage({ type: 'open-agricola-replay-bridge-ready', context }, parentOrigin)
    ready()
    this.handshake = setInterval(ready, 250)
    this.handshakeTimeout = setTimeout(this.close, 10_000)
  }

  private connect = (event: MessageEvent<unknown>) => {
    if (this.retired || this.port || event.source !== window.parent || event.origin !== this.parentOrigin
      || !event.data || typeof event.data !== 'object' || !('type' in event.data)
      || event.data.type !== 'open-agricola-replay-bridge-connect' || !('context' in event.data)
      || !sameReplayBridgeContext(this.context, event.data.context) || event.ports.length !== 1) return
    const port = event.ports[0]!
    this.port = port
    clearInterval(this.handshake)
    clearTimeout(this.handshakeTimeout)
    port.onmessage = this.receive
    port.onmessageerror = this.close
    port.start()
    this.requestLease()
    this.heartbeat = setInterval(this.requestLease, REPLAY_BRIDGE_HEARTBEAT_MS)
  }
  private send(request: ReplayBridgeRequest) { this.port?.postMessage(request) }
  private id() { return `r${++this.sequence}` }
  private requestLease = () => {
    if (this.retired || !this.port) return
    if (this.deadline && !this.check()) return
    // A missing reply expires the display; heartbeats cannot accumulate unbounded state.
    if (this.leases.size) return
    const requestId = this.id()
    this.leases.set(requestId, performance.now())
    this.send({ type: 'lease', nonce: this.context.nonce, requestId })
    if (!this.deadline) this.timer = setTimeout(this.close, REPLAY_BRIDGE_PARENT_TIMEOUT_MS)
  }
  private receive = (event: MessageEvent<unknown>) => {
    if (this.retired) return
    const reply = parseReplayBridgeReply(event.data)
    if (!reply || reply.nonce !== this.context.nonce || reply.type === 'close') { this.close(); return }
    if (reply.type === 'lease') {
      const sent = this.leases.get(reply.requestId)
      if (sent === undefined) { this.close(); return }
      this.leases.delete(reply.requestId)
      // The complete round trip is subtracted. A delayed message cannot create a later expiry.
      this.deadline = sent + reply.remainingMs
      this.parentDeadline = sent + REPLAY_BRIDGE_PARENT_TIMEOUT_MS
      if (!this.check()) return
      clearTimeout(this.timer)
      this.timer = setTimeout(this.close, Math.max(0, Math.min(this.deadline, this.parentDeadline) - performance.now()))
      this.accept()
      return
    }
    if (!this.check()) return
    const request = this.pending.get(reply.requestId)
    if (!request) return
    this.pending.delete(reply.requestId)
    request.clean()
    if (reply.type === 'error') request.reject(new Error(reply.code))
    else request.resolve(new Response(reply.bytes, { status: reply.status, headers: { 'Content-Type': reply.contentType, 'Cache-Control': 'no-store' } }))
  }
  check = (): boolean => {
    if (this.retired) return false
    if (!this.deadline || performance.now() >= this.deadline || performance.now() >= this.parentDeadline) { this.close(); return false }
    return true
  }
  private resume = () => {
    if (this.retired) return
    // Discard a background/bfcache display rather than showing data before a fresh lease check.
    this.close()
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    if (this.retired) listener()
    return () => { this.listeners.delete(listener) }
  }
  async read(read: ReplayBridgeRead, signal: AbortSignal): Promise<Response> {
    await this.ready
    if (!this.check() || signal.aborted) throw new DOMException('Replay bridge closed', 'AbortError')
    if (this.pending.size >= REPLAY_BRIDGE_MAX_REQUESTS) throw new Error('replay_bridge_busy')
    const requestId = this.id()
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(requestId)
        this.send({ type: 'cancel', nonce: this.context.nonce, requestId })
        reject(new DOMException('Replay read cancelled', 'AbortError'))
      }
      signal.addEventListener('abort', abort, { once: true })
      this.pending.set(requestId, { resolve, reject, clean: () => signal.removeEventListener('abort', abort) })
      this.send({ type: 'read', nonce: this.context.nonce, requestId, read })
    })
  }
  async cards(cards: CustomCardDef[], signal: AbortSignal): Promise<void> {
    for (const card of cards) {
      let artUrl: string | null = null
      if (card.artUrl) {
        const match = /^\/replay-assets\/([a-f0-9]{64})$/.exec(card.artUrl)
        if (!match) throw new Error('replay_asset_context_mismatch')
        const response = await this.read({ kind: 'asset', hash: match[1]! }, signal)
        const blob = await response.blob()
        if (!this.check() || signal.aborted || !replayBridgeImageType(blob.type)) throw new Error('replay_asset_unavailable')
        artUrl = URL.createObjectURL(blob)
        this.blobUrls.add(artUrl)
      }
      if (!this.check()) throw new Error('replay_bridge_expired')
      registerCustomCardMetadata({ ...card, artUrl })
    }
  }
  close = () => {
    if (this.retired) return
    this.retired = true
    clearTimeout(this.timer); clearTimeout(this.handshakeTimeout)
    clearInterval(this.heartbeat); clearInterval(this.handshake)
    this.port?.close(); this.port = undefined
    window.removeEventListener('message', this.connect)
    window.removeEventListener('pageshow', this.resume)
    document.removeEventListener('visibilitychange', this.resume)
    this.rejectReady(new Error('replay_bridge_expired'))
    for (const pending of this.pending.values()) { pending.clean(); pending.reject(new Error('replay_bridge_expired')) }
    this.pending.clear(); this.leases.clear()
    for (const url of this.blobUrls) URL.revokeObjectURL(url)
    this.blobUrls.clear()
    clearCustomCardMetadata()
    this.listeners.forEach(listener => listener())
    this.listeners.clear()
  }
}

export function bridgeFromLocation(): ReplayBridgeTransport | null {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('bridge')) return null
  let context: ReplayBridgeContext | null
  try { context = parseReplayBridgeContext(JSON.parse(params.get('bridge') ?? '')) } catch { context = null }
  const parentOrigin = params.get('parentOrigin') ?? ''
  if (!context || window.parent === window || new URL(parentOrigin).origin !== parentOrigin
    || context.roomId !== params.get('room') || context.viewerBuildId !== params.get('viewer')
    || context.mode.kind === 'evidence' && (params.get('mode') !== 'reported-evidence'
      || params.get('step') !== String(context.mode.stepNo) || params.get('perspective') !== context.mode.perspective)) throw new Error('invalid_replay_bridge')
  return new ReplayBridgeTransport(context, parentOrigin)
}
