import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  applyReplayDelta,
  canonicalJson,
  createReplayDelta,
  decodeReplayFrame,
  encodeReplayFrame,
  frameHash,
  type JsonValue,
} from '../replay-codec.ts'

describe('replay codec', () => {
  it('canonicalizes object keys recursively while preserving array order', () => {
    const left = { z: 1, a: { y: 2, x: 3 }, list: [{ b: 1, a: 2 }, 4] }
    const right = { list: [{ a: 2, b: 1 }, 4], a: { x: 3, y: 2 }, z: 1 }

    expect(canonicalJson(left)).toBe(canonicalJson(right))
    expect(frameHash(left)).toBe(frameHash(right))
    expect(frameHash({ ...right, list: [4, { a: 2, b: 1 }] })).not.toBe(frameHash(left))
  })

  it('round-trips object and array changes with deterministic RFC 6902 operations', () => {
    const before: JsonValue = {
      players: [
        { id: 'p1', food: 1 },
        { id: 'p2', food: 2 },
        { id: 'p3', food: 3 },
      ],
      round: 1,
      obsolete: true,
    }
    const after: JsonValue = {
      players: [
        { id: 'p1', food: 2 },
        { id: 'p2', food: 2 },
      ],
      round: 2,
      added: { value: 1 },
    }

    const delta = createReplayDelta(before, after)

    expect(delta).toEqual([
      { op: 'add', path: '/added', value: { value: 1 } },
      { op: 'remove', path: '/obsolete' },
      { op: 'replace', path: '/players/0/food', value: 2 },
      { op: 'remove', path: '/players/2' },
      { op: 'replace', path: '/round', value: 2 },
    ])
    expect(applyReplayDelta(before, delta)).toEqual(after)
  })

  it('uses Step 0 and every sixteenth step as checkpoints', () => {
    const stable = 'x'.repeat(500)
    const step0 = encodeReplayFrame({
      frame: { stable, value: 0 },
      previousFrame: null,
      stepNo: 0,
      previousCheckpointStepNo: 0,
    })
    const step1 = encodeReplayFrame({
      frame: { stable, value: 1 },
      previousFrame: { stable, value: 0 },
      stepNo: 1,
      previousCheckpointStepNo: 0,
    })
    const step16 = encodeReplayFrame({
      frame: { stable, value: 16 },
      previousFrame: { stable, value: 15 },
      stepNo: 16,
      previousCheckpointStepNo: 0,
    })

    expect(step0.payloadKind).toBe('checkpoint')
    expect(step0.checkpointStepNo).toBe(0)
    expect(step1.payloadKind).toBe('delta')
    expect(step1.checkpointStepNo).toBe(0)
    expect(step16.payloadKind).toBe('checkpoint')
    expect(step16.checkpointStepNo).toBe(16)
    expect(decodeReplayFrame(null, step0)).toEqual({ stable, value: 0 })
    expect(decodeReplayFrame({ stable, value: 0 }, step1)).toEqual({ stable, value: 1 })
    expect(decodeReplayFrame(null, step16)).toEqual({ stable, value: 16 })
  })

  it('starts an early checkpoint when the raw delta is not smaller than the frame', () => {
    const encoded = encodeReplayFrame({
      frame: { value: 'b' },
      previousFrame: { value: 'a' },
      stepNo: 1,
      previousCheckpointStepNo: 0,
    })

    expect(encoded.payloadKind).toBe('checkpoint')
    expect(encoded.checkpointStepNo).toBe(1)
    expect(JSON.parse(gunzipSync(encoded.payloadGzip).toString())).toEqual({ value: 'b' })
  })

  it('rejects corrupt gzip and reconstructed frames with the wrong hash', () => {
    const encoded = encodeReplayFrame({
      frame: { stable: true, value: 2 },
      previousFrame: { stable: true, value: 1 },
      stepNo: 1,
      previousCheckpointStepNo: 0,
    })

    expect(() => decodeReplayFrame(
      { stable: true, value: 1 },
      { ...encoded, payloadGzip: Buffer.from('not-gzip') },
    )).toThrow('invalid replay payload')
    expect(() => decodeReplayFrame(
      { stable: true, value: 1 },
      { ...encoded, frameHash: '0'.repeat(64) },
    )).toThrow('replay frame hash mismatch')
  })
})
