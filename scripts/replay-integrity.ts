import { decodeReplayFrame, type JsonValue } from '../server/game/replay-codec'
export type ReplayHeaderRow = { room_id: string; lifecycle: string; replay_status: string | null; status: string; latest_step_no: number; schema_version: number; viewer_build_id: string; missing_prefix: number; custom_cards_json: string }
export type ReplayStepRow = { room_id: string; step_no: number; checkpoint_step_no: number; payload_kind: 'checkpoint' | 'delta'; payload_gzip: Buffer; frame_hash: string; intent_json: string }
export const validateReplay = (
  header: ReplayHeaderRow,
  rows: Iterable<ReplayStepRow>,
): { segmentCount: number; stepCount: number } => {
  let segmentCount = 0
  let stepCount = 0
  let previousFrame: JsonValue | null = null
  let checkpointStepNo = -1
  let previousStepNo: number | null = null
  let firstStepNo: number | null = null
  for (const row of rows) {
    firstStepNo ??= row.step_no
    if (header.lifecycle !== 'expired' && previousStepNo !== null && row.step_no !== previousStepNo + 1) {
      throw new Error(`replay step gap at ${header.room_id} step ${row.step_no}`)
    }
    if (row.payload_kind === 'checkpoint') {
      if (row.checkpoint_step_no !== row.step_no) {
        throw new Error(`invalid replay checkpoint at ${header.room_id} step ${row.step_no}`)
      }
      segmentCount += 1
      checkpointStepNo = row.step_no
      previousFrame = null
    } else if (previousFrame === null || row.checkpoint_step_no !== checkpointStepNo) {
      throw new Error(`invalid replay segment at ${header.room_id} step ${row.step_no}`)
    }
    try {
      JSON.parse(row.intent_json)
    } catch {
      throw new Error(`replay step metadata invalid at ${header.room_id} step ${row.step_no}`)
    }
    try {
      previousFrame = decodeReplayFrame(previousFrame, {
        payloadKind: row.payload_kind,
        payloadGzip: row.payload_gzip,
        checkpointStepNo: row.checkpoint_step_no,
        frameHash: row.frame_hash,
      })
    } catch {
      throw new Error(`replay segment integrity failed at ${header.room_id} step ${row.step_no}`)
    }
    previousStepNo = row.step_no
    stepCount += 1
  }
  if (stepCount === 0) throw new Error(`replay has no steps: ${header.room_id}`)
  if (header.lifecycle !== 'expired' && header.missing_prefix !== 1 && firstStepNo !== 0) {
    throw new Error(`replay does not start at step 0: ${header.room_id}`)
  }
  if (previousStepNo !== header.latest_step_no) {
    throw new Error(`replay head step mismatch: ${header.room_id}`)
  }
  return { segmentCount, stepCount }
}

