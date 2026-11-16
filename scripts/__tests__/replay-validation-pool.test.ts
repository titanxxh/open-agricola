import { availableParallelism } from 'node:os'
import { describe, expect, it } from 'vitest'
import { encodeReplayFrame, type JsonValue } from '../../server/game/replay-codec'
import type { ReplayHeaderRow, ReplayStepRow } from '../replay-integrity'
import { MAX_STORAGE_VALIDATION_CONCURRENCY, storageValidationConcurrency, validateReplays } from '../replay-validation-pool'

const replay = (roomId: string, length: number): { header: ReplayHeaderRow; rows: ReplayStepRow[] } => {
  let previous: JsonValue | null = null
  let checkpoint = 0
  const rows = Array.from({ length }, (_, stepNo): ReplayStepRow => {
    const frame: JsonValue = { roomId, round: Math.floor(stepNo / 4), log: Array.from({ length: stepNo }, (_, index) => ({ index, text: `step ${index}` })) }
    const encoded = encodeReplayFrame({ frame, previousFrame: previous, stepNo, previousCheckpointStepNo: checkpoint })
    previous = frame; checkpoint = encoded.checkpointStepNo
    return { room_id: roomId, step_no: stepNo, checkpoint_step_no: encoded.checkpointStepNo, payload_kind: encoded.payloadKind,
      payload_gzip: encoded.payloadGzip, frame_hash: encoded.frameHash, intent_json: '{}' }
  })
  return { rows, header: { room_id: roomId, lifecycle: 'completed', replay_status: null, status: 'completed', latest_step_no: length - 1,
    schema_version: 1, viewer_build_id: '', missing_prefix: 0, custom_cards_json: '[]' } }
}

const library = (lengths: number[]) => {
  const replays = new Map(lengths.map((length, index) => [`room-${index}`, replay(`room-${index}`, length)]))
  const loads: string[] = []
  return {
    replays, loads,
    headers: [...replays.values()].map(entry => entry.header),
    load: async (header: ReplayHeaderRow) => { loads.push(header.room_id); return replays.get(header.room_id)!.rows },
  }
}

describe('validateReplays', () => {
  it('counts the same steps and segments in worker threads as on the calling thread, loading each replay once', async () => {
    const serial = library([1, 3, 17, 40, 5, 33, 2])
    const parallel = library([1, 3, 17, 40, 5, 33, 2])

    const expected = await validateReplays(serial.headers, serial.load, 1)
    const actual = await validateReplays(parallel.headers, parallel.load, 3)

    expect(expected.stepCount).toBe(101)
    expect(expected.segmentCount).toBeGreaterThanOrEqual(12)
    expect(actual).toEqual(expected)
    expect(parallel.loads.toSorted()).toEqual(serial.loads.toSorted())
    expect(parallel.loads[0]).toBe('room-3')
  })

  it('reports a corrupt step with the same message in worker threads and on the calling thread', async () => {
    for (const concurrency of [1, 3]) {
      const corrupt = library([4, 20, 6, 9])
      corrupt.replays.get('room-1')!.rows[5]!.frame_hash = '0'.repeat(64)
      await expect(validateReplays(corrupt.headers, corrupt.load, concurrency)).rejects.toThrow('replay segment integrity failed at room-1 step 5')
    }
  })

  it('stops with a step-loading failure', async () => {
    const failing = library([4, 20, 6, 9])
    const load = async (header: ReplayHeaderRow) => {
      if (header.room_id === 'room-2') throw new Error('step query failed')
      return failing.load(header)
    }
    await expect(validateReplays(failing.headers, load, 2)).rejects.toThrow('step query failed')
  })

  it('rejects an invalid worker count before loading anything', async () => {
    const replays = library([2, 2])
    for (const concurrency of [0, 1.5, MAX_STORAGE_VALIDATION_CONCURRENCY + 1]) {
      await expect(validateReplays(replays.headers, replays.load, concurrency)).rejects.toThrow('Invalid storage validation concurrency')
    }
    expect(replays.loads).toEqual([])
  })
})

describe('storageValidationConcurrency', () => {
  it('keeps one thread unless a positive count or auto is configured', () => {
    expect(storageValidationConcurrency(undefined)).toBe(1)
    expect(storageValidationConcurrency('')).toBe(1)
    expect(storageValidationConcurrency('4')).toBe(4)
    expect(storageValidationConcurrency('auto')).toBe(Math.min(availableParallelism(), MAX_STORAGE_VALIDATION_CONCURRENCY))
    for (const value of ['0', '-1', '1.5', '08', 'x', String(MAX_STORAGE_VALIDATION_CONCURRENCY + 1)]) {
      expect(() => storageValidationConcurrency(value)).toThrow('Invalid STORAGE_VALIDATION_CONCURRENCY')
    }
  })
})
