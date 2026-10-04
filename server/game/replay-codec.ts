import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { isCapturedHistoryRecord } from '../../shared/session/history-streams.ts'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ReplayDeltaOperation =
  | { op: 'add'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: JsonValue }

export type EncodedReplayFrame = {
  payloadKind: 'checkpoint' | 'delta'
  payloadGzip: Buffer
  checkpointStepNo: number
  frameHash: string
}

// Cache records, not growing history arrays: retained encodings then scale with
// live record content instead of duplicating every historical array prefix.
const canonicalHistoryRecords = new WeakMap<object, string>()

const canonical = (value: unknown, inArray: boolean): string | undefined => {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry, true) ?? 'null').join(',')}]`
  }
  if (typeof value === 'object') {
    const cacheable = isCapturedHistoryRecord(value)
    const cached = cacheable ? canonicalHistoryRecords.get(value) : undefined
    if (cached !== undefined) return cached
    let encodedObject = '{'
    let separator = ''
    for (const key of Object.keys(value).sort()) {
      const encoded = canonical((value as Record<string, unknown>)[key], false)
      if (encoded === undefined) continue
      encodedObject += `${separator}${JSON.stringify(key)}:${encoded}`
      separator = ','
    }
    const encoded = `${encodedObject}}`
    if (cacheable) canonicalHistoryRecords.set(value, encoded)
    return encoded
  }
  if (typeof value === 'bigint') throw new TypeError('BigInt is not JSON serializable')
  return inArray ? 'null' : undefined
}

export const canonicalJson = (value: unknown): string => {
  const encoded = canonical(value, false)
  if (encoded === undefined) throw new TypeError('value is not JSON serializable')
  return encoded
}

export const frameHash = (frame: unknown): string =>
  createHash('sha256').update(canonicalJson(frame)).digest('hex')

const isObject = (value: JsonValue): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1')

const buildDelta = (
  before: JsonValue,
  after: JsonValue,
  path: string,
  operations: ReplayDeltaOperation[],
): void => {
  if (Object.is(before, after)) return
  if (Array.isArray(before) && Array.isArray(after)) {
    const sharedLength = Math.min(before.length, after.length)
    for (let index = 0; index < sharedLength; index += 1) {
      buildDelta(before[index]!, after[index]!, `${path}/${index}`, operations)
    }
    for (let index = before.length - 1; index >= after.length; index -= 1) {
      operations.push({ op: 'remove', path: `${path}/${index}` })
    }
    for (let index = before.length; index < after.length; index += 1) {
      operations.push({ op: 'add', path: `${path}/${index}`, value: structuredClone(after[index]!) })
    }
    return
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    for (const key of keys) {
      const childPath = `${path}/${escapePointer(key)}`
      if (!Object.hasOwn(before, key)) {
        operations.push({ op: 'add', path: childPath, value: structuredClone(after[key]!) })
      } else if (!Object.hasOwn(after, key)) {
        operations.push({ op: 'remove', path: childPath })
      } else {
        buildDelta(before[key]!, after[key]!, childPath, operations)
      }
    }
    return
  }
  operations.push({ op: 'replace', path, value: structuredClone(after) })
}

export const createReplayDelta = (
  before: JsonValue,
  after: JsonValue,
): ReplayDeltaOperation[] => {
  const operations: ReplayDeltaOperation[] = []
  buildDelta(before, after, '', operations)
  return operations
}

const unescapePointer = (value: string): string => {
  if (/~(?:[^01]|$)/.test(value)) throw new Error('invalid JSON pointer')
  return value.replaceAll('~1', '/').replaceAll('~0', '~')
}

const pointerParts = (path: string): string[] => {
  if (path === '') return []
  if (!path.startsWith('/')) throw new Error('invalid JSON pointer')
  return path.slice(1).split('/').map(unescapePointer)
}

const arrayIndex = (raw: string, length: number, allowEnd: boolean): number => {
  if (!/^(0|[1-9]\d*)$/.test(raw)) throw new Error('invalid array index')
  const index = Number(raw)
  if (index > length || (!allowEnd && index >= length)) throw new Error('array index out of bounds')
  return index
}

export const applyReplayDelta = (
  frame: JsonValue,
  operations: readonly ReplayDeltaOperation[],
): JsonValue => {
  let result = structuredClone(frame)
  for (const operation of operations) {
    const parts = pointerParts(operation.path)
    if (parts.length === 0) {
      if (operation.op === 'remove') throw new Error('cannot remove replay frame root')
      result = structuredClone(operation.value)
      continue
    }
    let parent: JsonValue = result
    for (const part of parts.slice(0, -1)) {
      if (Array.isArray(parent)) {
        parent = parent[arrayIndex(part, parent.length, false)]!
      } else if (isObject(parent) && Object.hasOwn(parent, part)) {
        parent = parent[part]!
      } else {
        throw new Error('JSON pointer does not exist')
      }
    }
    const key = parts.at(-1)!
    if (Array.isArray(parent)) {
      const index = arrayIndex(key, parent.length, operation.op === 'add')
      if (operation.op === 'add') parent.splice(index, 0, structuredClone(operation.value))
      else if (operation.op === 'remove') parent.splice(index, 1)
      else parent[index] = structuredClone(operation.value)
    } else if (isObject(parent)) {
      if (operation.op === 'remove') {
        if (!Object.hasOwn(parent, key)) throw new Error('JSON pointer does not exist')
        delete parent[key]
      } else {
        if (operation.op === 'replace' && !Object.hasOwn(parent, key)) {
          throw new Error('JSON pointer does not exist')
        }
        Object.defineProperty(parent, key, {
          value: structuredClone(operation.value), enumerable: true, configurable: true, writable: true,
        })
      }
    } else {
      throw new Error('JSON pointer parent is not a container')
    }
  }
  return result
}

export const encodeReplayFrame = (input: {
  frame: JsonValue
  previousFrame: JsonValue | null
  stepNo: number
  previousCheckpointStepNo: number
}): EncodedReplayFrame => {
  const fullJson = canonicalJson(input.frame)
  const hash = createHash('sha256').update(fullJson).digest('hex')
  const scheduledCheckpoint = input.previousFrame === null || input.stepNo % 16 === 0
  if (!scheduledCheckpoint) {
    const deltaJson = JSON.stringify(createReplayDelta(input.previousFrame!, input.frame))
    if (Buffer.byteLength(deltaJson) < Buffer.byteLength(fullJson)) {
      return {
        payloadKind: 'delta',
        payloadGzip: gzipSync(deltaJson),
        checkpointStepNo: input.previousCheckpointStepNo,
        frameHash: hash,
      }
    }
  }
  return {
    payloadKind: 'checkpoint',
    payloadGzip: gzipSync(fullJson),
    checkpointStepNo: input.stepNo,
    frameHash: hash,
  }
}

const isReplayDelta = (value: unknown): value is ReplayDeltaOperation[] =>
  Array.isArray(value) && value.every((operation) => {
    if (!operation || typeof operation !== 'object') return false
    const candidate = operation as Record<string, unknown>
    if (typeof candidate.path !== 'string') return false
    if (candidate.op === 'remove') return true
    return (candidate.op === 'add' || candidate.op === 'replace') && 'value' in candidate
  })

export const decodeReplayFrame = (
  previousFrame: JsonValue | null,
  encoded: EncodedReplayFrame,
): JsonValue => {
  let parsed: unknown
  try {
    parsed = JSON.parse(gunzipSync(encoded.payloadGzip).toString('utf8')) as unknown
  } catch {
    throw new Error('invalid replay payload')
  }
  let frame: JsonValue
  if (encoded.payloadKind === 'checkpoint') {
    frame = parsed as JsonValue
  } else {
    if (previousFrame === null || !isReplayDelta(parsed)) throw new Error('invalid replay payload')
    try {
      frame = applyReplayDelta(previousFrame, parsed)
    } catch {
      throw new Error('invalid replay payload')
    }
  }
  if (frameHash(frame) !== encoded.frameHash) throw new Error('replay frame hash mismatch')
  return frame
}
