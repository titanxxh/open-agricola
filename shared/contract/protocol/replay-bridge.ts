import { REPLAY_BRIDGE_PROTOCOL_VERSION } from '../replay-viewer-build'

export const REPLAY_BRIDGE_MAX_BYTES = 8 * 1024 * 1024
export const REPLAY_BRIDGE_MAX_REQUESTS = 4
export const REPLAY_BRIDGE_HEARTBEAT_MS = 1_000
export const REPLAY_BRIDGE_PARENT_TIMEOUT_MS = 3_000

export type ReplayBridgeMode = { kind: 'archive' } | {
  kind: 'evidence'; stepNo: number; frameHash: string; perspective: `p${number}`
}
export type ReplayBridgeContext = {
  protocolVersion: 1
  nonce: string
  environment: 'prerelease'
  targetId: string
  appBuildId: string
  generationId: string
  roomId: string
  viewerBuildId: string
  schemaVersion: number
  mode: ReplayBridgeMode
}
export type ReplayBridgeRead =
  | { kind: 'manifest' }
  | { kind: 'segment'; checkpointStepNo: number }
  | { kind: 'anchor'; stepNo: number; frameHash: string }
  | { kind: 'asset'; hash: string }
  | { kind: 'evidence' }
export type ReplayBridgeRequest =
  | { type: 'read'; nonce: string; requestId: string; read: ReplayBridgeRead }
  | { type: 'cancel'; nonce: string; requestId: string }
  | { type: 'lease'; nonce: string; requestId: string }
export type ReplayBridgeReply =
  | { type: 'data'; nonce: string; requestId: string; bytes: ArrayBuffer; contentType: string; status: number }
  | { type: 'error'; nonce: string; requestId: string; code: 'unavailable' | 'denied' | 'cancelled' }
  | { type: 'lease'; nonce: string; requestId: string; remainingMs: number }
  | { type: 'close'; nonce: string }

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key))
const step = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
export const replayBridgeImageType = (value: string): boolean => /^image\/(png|jpeg|webp|gif)$/.test(value)

export function parseReplayBridgeContext(value: unknown): ReplayBridgeContext | null {
  if (!object(value) || !keys(value, ['protocolVersion', 'nonce', 'environment', 'targetId', 'appBuildId', 'generationId', 'roomId', 'viewerBuildId', 'schemaVersion', 'mode'])
    || value.protocolVersion !== REPLAY_BRIDGE_PROTOCOL_VERSION || value.environment !== 'prerelease'
    || typeof value.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(value.nonce) || !identifier(value.targetId)
    || typeof value.appBuildId !== 'string' || !/^[a-f0-9]{40}$/.test(value.appBuildId)
    || typeof value.generationId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.generationId)
    || !identifier(value.roomId) || !hash(value.viewerBuildId) || !step(value.schemaVersion) || value.schemaVersion < 1
    || !object(value.mode)) return null
  let mode: ReplayBridgeMode
  if (value.mode.kind === 'archive' && keys(value.mode, ['kind'])) mode = { kind: 'archive' }
  else if (value.mode.kind === 'evidence' && keys(value.mode, ['kind', 'stepNo', 'frameHash', 'perspective'])
    && step(value.mode.stepNo) && hash(value.mode.frameHash) && typeof value.mode.perspective === 'string'
    && /^p[1-9]\d*$/.test(value.mode.perspective)) {
    // The prefix is checked above, and construction keeps the template-literal type truthful.
    mode = { kind: 'evidence', stepNo: value.mode.stepNo, frameHash: value.mode.frameHash, perspective: `p${Number(value.mode.perspective.slice(1))}` }
  } else return null
  return { protocolVersion: 1, nonce: value.nonce, environment: 'prerelease', targetId: value.targetId,
    appBuildId: value.appBuildId, generationId: value.generationId, roomId: value.roomId,
    viewerBuildId: value.viewerBuildId, schemaVersion: value.schemaVersion, mode }
}

export function sameReplayBridgeContext(left: ReplayBridgeContext, right: unknown): boolean {
  const parsed = parseReplayBridgeContext(right)
  return parsed !== null && JSON.stringify(left) === JSON.stringify(parsed)
}

function parseRead(value: unknown): ReplayBridgeRead | null {
  if (!object(value)) return null
  if (value.kind === 'manifest' && keys(value, ['kind'])) return { kind: 'manifest' }
  if (value.kind === 'evidence' && keys(value, ['kind'])) return { kind: 'evidence' }
  if (value.kind === 'segment' && keys(value, ['kind', 'checkpointStepNo']) && step(value.checkpointStepNo)) return { kind: 'segment', checkpointStepNo: value.checkpointStepNo }
  if (value.kind === 'anchor' && keys(value, ['kind', 'stepNo', 'frameHash']) && step(value.stepNo) && hash(value.frameHash)) return { kind: 'anchor', stepNo: value.stepNo, frameHash: value.frameHash }
  if (value.kind === 'asset' && keys(value, ['kind', 'hash']) && hash(value.hash)) return { kind: 'asset', hash: value.hash }
  return null
}

export function parseReplayBridgeRequest(value: unknown): ReplayBridgeRequest | null {
  if (!object(value) || typeof value.nonce !== 'string' || !identifier(value.requestId)) return null
  if ((value.type === 'cancel' || value.type === 'lease') && keys(value, ['type', 'nonce', 'requestId'])) return { type: value.type, nonce: value.nonce, requestId: value.requestId }
  if (value.type !== 'read' || !keys(value, ['type', 'nonce', 'requestId', 'read'])) return null
  const read = parseRead(value.read)
  return read ? { type: 'read', nonce: value.nonce, requestId: value.requestId, read } : null
}

export function parseReplayBridgeReply(value: unknown): ReplayBridgeReply | null {
  if (!object(value) || typeof value.nonce !== 'string') return null
  if (value.type === 'close' && keys(value, ['type', 'nonce'])) return { type: 'close', nonce: value.nonce }
  if (!identifier(value.requestId)) return null
  if (value.type === 'lease' && keys(value, ['type', 'nonce', 'requestId', 'remainingMs'])
    && typeof value.remainingMs === 'number' && Number.isFinite(value.remainingMs) && value.remainingMs > 0 && value.remainingMs <= 30_000)
    return { type: 'lease', nonce: value.nonce, requestId: value.requestId, remainingMs: value.remainingMs }
  if (value.type === 'error' && keys(value, ['type', 'nonce', 'requestId', 'code'])
    && (value.code === 'unavailable' || value.code === 'denied' || value.code === 'cancelled')) return { type: 'error', nonce: value.nonce, requestId: value.requestId, code: value.code }
  if (value.type === 'data' && keys(value, ['type', 'nonce', 'requestId', 'bytes', 'contentType', 'status'])
    && value.bytes instanceof ArrayBuffer && value.bytes.byteLength <= REPLAY_BRIDGE_MAX_BYTES
    && typeof value.contentType === 'string' && (value.contentType === 'application/json' || replayBridgeImageType(value.contentType))
    && step(value.status) && value.status >= 200 && value.status <= 599) return { type: 'data', nonce: value.nonce, requestId: value.requestId,
      bytes: value.bytes, contentType: value.contentType, status: value.status }
  return null
}
