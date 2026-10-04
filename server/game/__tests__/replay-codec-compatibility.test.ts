import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  createReplayDelta,
  decodeReplayFrame,
  encodeReplayFrame,
  frameHash,
  type JsonValue,
} from '../replay-codec.ts'

// The pre-#941 encoder is the byte oracle for persisted Frame hashes. Keep this
// independent of the optimized encoder, including its non-JSON input behavior.
const previousCanonical = (value: unknown, inArray: boolean): string | undefined => {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (Array.isArray(value)) {
    return `[${value.map((entry) => previousCanonical(entry, true) ?? 'null').join(',')}]`
  }
  if (typeof value === 'object') {
    const fields = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const encoded = previousCanonical((value as Record<string, unknown>)[key], false)
        return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`]
      })
    return `{${fields.join(',')}}`
  }
  if (typeof value === 'bigint') throw new TypeError('BigInt is not JSON serializable')
  return inArray ? 'null' : undefined
}

const previousCanonicalJson = (value: unknown): string => {
  const encoded = previousCanonical(value, false)
  if (encoded === undefined) throw new TypeError('value is not JSON serializable')
  return encoded
}

const hashJson = (json: string): string => createHash('sha256').update(json).digest('hex')

const compatibilityCases: { name: string; create: () => unknown }[] = [
  { name: 'null, booleans and finite or non-finite numbers', create: () => [
    null, true, false, 0, -0, 1e-7, 1e21, Number.MIN_VALUE, Number.MAX_VALUE, NaN, Infinity, -Infinity,
  ] },
  { name: 'numeric keys and omitted object values', create: () => ({
    2: 'two', 10: 'ten', 1: 'one', z: { omitted: undefined, fn: () => 1, symbol: Symbol('x'), a: 1 },
  }) },
  { name: 'UTF-16 key ordering and JSON string escaping', create: () => ({
    '\uE000': '\uD800', '\uD83D\uDE00': '\uDC00', '中': '\u2028\u2029', '~ /\n': '\t\r\b\f"\\',
  }) },
  { name: 'undefined, functions and symbols inside arrays', create: () => [undefined, () => 1, Symbol('x')] },
  { name: 'sparse array holes', create: () => {
    const value: unknown[] = []
    value.length = 5
    value[1] = undefined
    value[3] = 'x'
    return value
  } },
  { name: 'inherited sparse array entries', create: () => {
    const value: unknown[] = new Array(3)
    Object.setPrototypeOf(value, Object.assign(Object.create(Array.prototype), { 1: 'inherited' }))
    return value
  } },
  { name: 'custom array mapping', create: () => {
    const value = [1, 2]
    Object.defineProperty(value, 'map', { value: () => ['custom'] })
    return value
  } },
  { name: 'Date, boxed primitives and ignored toJSON hooks', create: () => ({
    date: new Date(0), boxed: Object(3), hook: { x: 1, toJSON: () => 'changed' },
  }) },
  { name: 'null prototypes and own prototype-like keys', create: () => Object.assign(
    Object.create(null), JSON.parse('{"__proto__":{"x":1},"constructor":2,"":3}'),
  ) },
  { name: 'sorted getter evaluation and ignored non-enumerable properties', create: () => {
    let next = 0
    return Object.defineProperties({}, {
      z: { enumerable: true, get: () => next++ },
      a: { enumerable: true, get: () => next++ },
      hidden: { get: () => { throw new Error('non-enumerable property read') } },
      [Symbol('hidden')]: { enumerable: true, get: () => { throw new Error('symbol property read') } },
    })
  } },
]

describe('Replay canonical byte compatibility', () => {
  it.each(compatibilityCases)('preserves $name', ({ create }) => {
    const expected = previousCanonicalJson(create())
    expect(Buffer.from(canonicalJson(create()), 'utf8')).toEqual(Buffer.from(expected, 'utf8'))
    expect(frameHash(create())).toBe(hashJson(expected))
  })

  it.each([
    { name: 'undefined', value: undefined, message: 'value is not JSON serializable' },
    { name: 'function', value: () => 1, message: 'value is not JSON serializable' },
    { name: 'symbol', value: Symbol('x'), message: 'value is not JSON serializable' },
    { name: 'BigInt', value: 1n, message: 'BigInt is not JSON serializable' },
    { name: 'nested BigInt', value: { array: [1n] }, message: 'BigInt is not JSON serializable' },
  ])('preserves errors for $name', ({ value, message }) => {
    expect(() => previousCanonicalJson(value)).toThrow(new TypeError(message))
    expect(() => canonicalJson(value)).toThrow(new TypeError(message))
  })

  it('preserves lexical integer-key order and the existing sparse-array bytes', () => {
    expect(canonicalJson({ 2: 'two', 10: 'ten', 1: 'one' }))
      .toBe('{"1":"one","10":"ten","2":"two"}')
    expect(canonicalJson(new Array(2))).toBe('[,]')
    expect(canonicalJson([undefined, undefined])).toBe('[null,null]')
  })

  it('observes nested changes beneath a shallow-frozen object', () => {
    const nested = { value: 1 }
    const value = Object.freeze({ nested })
    const before = frameHash(value)
    nested.value = 2
    expect(canonicalJson(value)).toBe(previousCanonicalJson(value))
    expect(frameHash(value)).toBe(hashJson(previousCanonicalJson(value)))
    expect(frameHash(value)).not.toBe(before)
  })

  it.each([2, 4])('preserves %ip recorded Frame bytes and encoding decisions', (players) => {
    const fixture = JSON.parse(readFileSync(new URL(
      `../../../scripts/bench/fixtures/room-performance/${players}p.json`, import.meta.url,
    ), 'utf8')) as { initial: { frame: Record<string, JsonValue>; sessionCursor: JsonValue } }
    for (const value of [fixture.initial.frame, fixture.initial.sessionCursor]) {
      const expected = previousCanonicalJson(value)
      expect(Buffer.from(canonicalJson(value))).toEqual(Buffer.from(expected))
      expect(frameHash(value)).toBe(hashJson(expected))
    }

    const frames: JsonValue[] = [fixture.initial.frame, { ...fixture.initial.frame, codecProbe: 1 }, { tiny: true }]
    for (const [index, frame] of frames.entries()) {
      const previousFrame = frames[index - 1] ?? null
      const fullJson = previousCanonicalJson(frame)
      const deltaJson = previousFrame === null ? null : JSON.stringify(createReplayDelta(previousFrame, frame))
      for (const stepNo of [index, 16]) {
        const expectedKind = previousFrame !== null && stepNo % 16 !== 0 &&
          Buffer.byteLength(deltaJson!) < Buffer.byteLength(fullJson) ? 'delta' : 'checkpoint'
        const encoded = encodeReplayFrame({ frame, previousFrame, stepNo, previousCheckpointStepNo: 0 })
        expect(encoded.payloadKind).toBe(expectedKind)
        expect(encoded.checkpointStepNo).toBe(expectedKind === 'delta' ? 0 : stepNo)
        expect(gunzipSync(encoded.payloadGzip)).toEqual(Buffer.from(expectedKind === 'delta' ? deltaJson! : fullJson))
        expect(encoded.frameHash).toBe(hashJson(fullJson))
        expect(decodeReplayFrame(previousFrame, encoded)).toEqual(frame)
      }
    }
  })
})
