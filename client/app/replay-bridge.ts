import type { ReplayManifest, ReportedEvidence } from '../../shared/contract/protocol/replay'
import {
  parseReplayBridgeRequest, sameReplayBridgeContext, replayBridgeImageType,
  REPLAY_BRIDGE_MAX_BYTES, REPLAY_BRIDGE_MAX_REQUESTS,
  type ReplayBridgeContext, type ReplayBridgeRead, type ReplayBridgeReply,
} from '../../shared/contract/protocol/replay-bridge'
import { browserApiFetch } from '../services/browser-api'
import { assertPrereleaseAccess, getPrereleaseLeaseRemainingMs, getPrereleaseRevision, subscribePrereleaseAccess } from '../services/prerelease-runtime'
import { API_BASE } from '../config'

export type ReplayBridgePort = Pick<MessagePort, 'postMessage' | 'start' | 'close' | 'onmessage' | 'onmessageerror'>
type Source = ReplayManifest | ReportedEvidence
type Authority = { assert(): void; remainingMs(): number; revision(): number; subscribe(listener: () => void): () => void }
const runtimeAuthority: Authority = { assert: assertPrereleaseAccess, remainingMs: getPrereleaseLeaseRemainingMs,
  revision: getPrereleaseRevision, subscribe: subscribePrereleaseAccess }
const hashBytes = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
const sourceMatches = (source: Source, context: ReplayBridgeContext) => source.roomId === context.roomId
  && source.viewerBuildId === context.viewerBuildId && source.schemaVersion === context.schemaVersion
  && (context.mode.kind === 'archive' ? source.kind === 'replayManifest' : source.kind === 'reportedEvidence'
    && source.stepNo === context.mode.stepNo && source.frameHash === context.mode.frameHash && source.perspective === context.mode.perspective)

function readPath(context: ReplayBridgeContext, source: Source, read: ReplayBridgeRead): string | null {
  const root = `${API_BASE}/api/v1/replays/${encodeURIComponent(context.roomId)}`
  if (context.mode.kind === 'evidence') {
    if (read.kind !== 'asset') return null
    return `${API_BASE}/api/v1/game-contexts/${encodeURIComponent(context.roomId)}/evidence/${context.mode.stepNo}/assets/${read.hash}?frame=${context.mode.frameHash}`
  }
  if (source.kind !== 'replayManifest') return null
  switch (read.kind) {
    case 'segment': return source.segments.some(segment => segment.checkpointStepNo === read.checkpointStepNo)
      ? `${root}/segments/${read.checkpointStepNo}` : null
    case 'anchor': return source.steps.some(step => step.stepNo === read.stepNo && step.frameHash === read.frameHash)
      ? `${root}/anchors/${read.stepNo}?frame=${read.frameHash}` : null
    case 'asset': return `${root}/assets/${read.hash}`
    case 'manifest': case 'evidence': return null
  }
}

export function serveReplayBridge(port: ReplayBridgePort, context: ReplayBridgeContext, source: Source,
  options: { authority?: Authority; read?: typeof browserApiFetch } = {}): () => void {
  const authority = options.authority ?? runtimeAuthority, fetchData = options.read ?? browserApiFetch
  const revision = authority.revision()
  const pending = new Map<string, AbortController>()
  const assets = new Set(source.customCards.flatMap(card => {
    const match = /^\/replay-assets\/([a-f0-9]{64})$/.exec(card.artUrl ?? '')
    return match ? [match[1]!] : []
  }))
  let retired = false, lastRequest = 0, unsubscribe = () => {}, leaseTimer: ReturnType<typeof setTimeout> | undefined
  const post = (message: ReplayBridgeReply, transfer: Transferable[] = []) => { if (!retired) port.postMessage(message, transfer) }
  function close() {
    if (retired) return
    post({ type: 'close', nonce: context.nonce })
    retired = true
    clearTimeout(leaseTimer)
    unsubscribe()
    for (const controller of pending.values()) controller.abort()
    pending.clear()
    port.onmessage = null; port.onmessageerror = null; port.close()
  }
  function assert() {
    authority.assert()
    if (retired || authority.revision() !== revision || authority.remainingMs() <= 0 || !sourceMatches(source, context)) throw new Error('retired_replay_bridge')
  }
  function renewTimer() {
    clearTimeout(leaseTimer)
    try { assert(); leaseTimer = setTimeout(close, authority.remainingMs()) } catch { close() }
  }
  async function respond(requestId: string, read: ReplayBridgeRead, controller: AbortController) {
    try {
      assert()
      let bytes: ArrayBuffer, contentType = 'application/json', status = 200
      if (read.kind === 'manifest' && context.mode.kind === 'archive' || read.kind === 'evidence' && context.mode.kind === 'evidence') {
        bytes = new TextEncoder().encode(JSON.stringify(source)).buffer
      } else {
        if (read.kind === 'asset' && !assets.has(read.hash)) throw new Error('denied')
        const path = readPath(context, source, read)
        if (!path) throw new Error('denied')
        const response = await fetchData(path, { method: 'GET', credentials: 'include', cache: 'no-store', signal: controller.signal })
        assert()
        const length = Number(response.headers.get('content-length'))
        if (Number.isFinite(length) && length > REPLAY_BRIDGE_MAX_BYTES) throw new Error('unavailable')
        const reader = response.body?.getReader()
        const chunks: Uint8Array<ArrayBufferLike>[] = []
        let total = 0
        try {
          if (reader) for (;;) {
            const next = await reader.read()
            assert()
            if (next.done) break
            total += next.value.byteLength
            if (total > REPLAY_BRIDGE_MAX_BYTES) { void reader.cancel().catch(() => {}); throw new Error('unavailable') }
            chunks.push(next.value)
          }
        } finally { reader?.releaseLock() }
        const joined = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
        bytes = joined.buffer
        assert()
        status = response.status
        if (read.kind === 'asset') {
          contentType = response.headers.get('content-type')?.split(';')[0] ?? ''
          if (!response.ok || !replayBridgeImageType(contentType) || await hashBytes(bytes) !== read.hash) throw new Error('unavailable')
        } else {
          const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
          if (!value || typeof value !== 'object' || !('ok' in value) || typeof value.ok !== 'boolean') throw new Error('unavailable')
          if (value.ok && (!('roomId' in value) || value.roomId !== context.roomId || !('viewerBuildId' in value)
            || value.viewerBuildId !== context.viewerBuildId || !('schemaVersion' in value) || value.schemaVersion !== context.schemaVersion
            || read.kind === 'segment' && (!('kind' in value) || value.kind !== 'replaySegment' || !('checkpointStepNo' in value) || value.checkpointStepNo !== read.checkpointStepNo)
            || read.kind === 'anchor' && (!('kind' in value) || value.kind !== 'replayAnchor' || !('anchor' in value)
              || !value.anchor || typeof value.anchor !== 'object' || !('stepNo' in value.anchor) || value.anchor.stepNo !== read.stepNo
              || !('frameHash' in value.anchor) || value.anchor.frameHash !== read.frameHash))) throw new Error('unavailable')
        }
      }
      assert()
      if (controller.signal.aborted) return
      if (bytes.byteLength > REPLAY_BRIDGE_MAX_BYTES) throw new Error('unavailable')
      post({ type: 'data', nonce: context.nonce, requestId, bytes, contentType, status }, [bytes])
    } catch (error) {
      if (controller.signal.aborted || retired) return
      try { assert() } catch { close(); return }
      post({ type: 'error', nonce: context.nonce, requestId, code: error instanceof Error && error.message === 'denied' ? 'denied' : 'unavailable' })
    } finally { if (pending.get(requestId) === controller) pending.delete(requestId) }
  }
  port.onmessage = (event: MessageEvent<unknown>) => {
    const request = parseReplayBridgeRequest(event.data)
    if (!request || request.nonce !== context.nonce) { close(); return }
    try { assert() } catch { close(); return }
    if (request.type === 'cancel') { pending.get(request.requestId)?.abort(); pending.delete(request.requestId); return }
    // Strictly increasing sequence numbers give duplicate protection with constant memory.
    const sequence = /^r([1-9]\d*)$/.exec(request.requestId), number = sequence ? Number(sequence[1]) : NaN
    if (!Number.isSafeInteger(number) || number <= lastRequest) { close(); return }
    lastRequest = number
    if (request.type === 'lease') {
      post({ type: 'lease', nonce: context.nonce, requestId: request.requestId, remainingMs: Math.min(30_000, authority.remainingMs()) })
      return
    }
    if (pending.size >= REPLAY_BRIDGE_MAX_REQUESTS) { close(); return }
    const controller = new AbortController()
    pending.set(request.requestId, controller)
    void respond(request.requestId, request.read, controller)
  }
  port.onmessageerror = close
  unsubscribe = authority.subscribe(renewTimer)
  port.start()
  renewTimer()
  return close
}

export function attachReplayBridge(frame: HTMLIFrameElement, context: ReplayBridgeContext, source: Source): () => void {
  let stop: (() => void) | undefined, retired = false
  const onMessage = (event: MessageEvent<unknown>) => {
    if (retired || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object'
      || !('type' in event.data) || event.data.type !== 'open-agricola-replay-bridge-ready'
      || !('context' in event.data) || !sameReplayBridgeContext(context, event.data.context)) return
    stop?.()
    try { assertPrereleaseAccess() } catch { return }
    const channel = new MessageChannel()
    stop = serveReplayBridge(channel.port1, context, source)
    frame.contentWindow?.postMessage({ type: 'open-agricola-replay-bridge-connect', context }, '*', [channel.port2])
  }
  const onLoad = () => { stop?.(); stop = undefined }
  window.addEventListener('message', onMessage)
  frame.addEventListener('load', onLoad)
  return () => { retired = true; stop?.(); window.removeEventListener('message', onMessage); frame.removeEventListener('load', onLoad) }
}
