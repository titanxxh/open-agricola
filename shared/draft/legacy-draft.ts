import type { DraftPool, DraftStage, DraftStageKind, DraftStageSpec, DraftState } from './types'
import { draftSeatProgress } from '../projections/draft-progress'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const invalid = (): never => { throw new Error('Invalid legacy global-round draft') }
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : invalid()
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value) || !value.every((id): id is string => typeof id === 'string')) return invalid()
  return [...value]
}
const positive = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid()
const pool = (value: unknown): DraftPool => {
  const body = record(value)
  return { occ: strings(body.occ), minor: strings(body.minor) }
}
const kind = (value: unknown): DraftStageKind => {
  switch (value) {
    case 'standard': case 'occupation': case 'farmersOfTheMoorMinor': case 'publishedMinor': return value
    default: return invalid()
  }
}
const usesOcc = (stage: DraftStageKind) => stage === 'standard' || stage === 'occupation'
const usesMinor = (stage: DraftStageKind) => stage !== 'occupation'

/** Upgrade the pre-asynchronous format only; current drafts retain their identity. */
export function migrateLegacyDraft(value: unknown): DraftState | undefined {
  if (!isRecord(value) || !('pendingPicks' in value)) return undefined
  if (Array.isArray(value.stages) && value.stages.length > 0
    && value.stages.every(stage => isRecord(stage) && isRecord(stage.seats))) return undefined
  if (value.mode !== 'simultaneous') return invalid()
  const seatOrder = strings(value.seatOrder)
  if (!seatOrder.length || new Set(seatOrder).size !== seatOrder.length) return invalid()
  const pools = record(value.pools)
  const kept = record(value.kept)
  const pending = record(value.pendingPicks)
  const round = positive(value.round)
  const activeIndex = value.stages === undefined ? 0
    : typeof value.stageIndex === 'number' && Number.isSafeInteger(value.stageIndex) && value.stageIndex >= 0
      ? value.stageIndex : invalid()
  const stageValues = value.stages === undefined
    ? [{ kind: value.stage ?? 'standard', poolSize: value.poolSize, totalRounds: value.totalRounds, pools }]
    : Array.isArray(value.stages) ? value.stages : invalid()
  const specs: DraftStageSpec[] = stageValues.map(raw => {
    const body = record(raw)
    const stageKind = kind(body.kind)
    const poolSize = positive(body.poolSize)
    const totalRounds = positive(body.totalRounds)
    if (totalRounds > poolSize) return invalid()
    const initialPools = record(body.pools)
    return { kind: stageKind, poolSize, totalRounds,
      pools: Object.fromEntries(seatOrder.map(id => {
        const cards = pool(initialPools[id])
        if (value.stages !== undefined && (cards.occ.length !== (usesOcc(stageKind) ? poolSize : 0)
          || cards.minor.length !== (usesMinor(stageKind) ? poolSize : 0))) return invalid()
        return [id, cards]
      })) }
  })
  const active = specs[activeIndex]
  if (!active || round > active.totalRounds || positive(value.totalRounds) !== active.totalRounds
    || positive(value.poolSize) !== active.poolSize || (value.stage !== undefined && value.stage !== active.kind)) return invalid()
  const selected = new Map(seatOrder.map(id => {
    const pick = record(pending[id])
    const occ = pick.occ === null ? null : typeof pick.occ === 'string' ? pick.occ : invalid()
    const minor = pick.minor === null ? null : typeof pick.minor === 'string' ? pick.minor : invalid()
    if ((!usesOcc(active.kind) && occ !== null) || (!usesMinor(active.kind) && minor !== null)
      || (active.kind === 'standard' && (occ === null) !== (minor === null))) return invalid()
    return [id, { occ, minor, submitted: usesOcc(active.kind) ? occ !== null : minor !== null }]
  }))
  const offsets = { occ: 0, minor: 0 }
  const stages: DraftStage[] = specs.map((spec, index) => {
    const seats = Object.fromEntries(seatOrder.map(id => {
      const cards = pool(kept[id])
      const pick = selected.get(id)
      if (!pick) return invalid()
      const count = index < activeIndex ? spec.totalRounds : index === activeIndex ? round - 1 + Number(pick.submitted) : 0
      const occCount = usesOcc(spec.kind) ? count : 0
      const minorCount = usesMinor(spec.kind) ? count : 0
      const saved = { occ: cards.occ.slice(offsets.occ, offsets.occ + occCount),
        minor: cards.minor.slice(offsets.minor, offsets.minor + minorCount) }
      if (saved.occ.length !== occCount || saved.minor.length !== minorCount) return invalid()
      const inbox: Record<number, DraftPool> = {}
      if (index > activeIndex) inbox[1] = spec.pools[id]
      if (index === activeIndex) {
        if (cards.occ.length !== offsets.occ + occCount || cards.minor.length !== offsets.minor + minorCount) return invalid()
        if (pick.submitted && ((usesOcc(spec.kind) && saved.occ.at(-1) !== pick.occ)
          || (usesMinor(spec.kind) && saved.minor.at(-1) !== pick.minor))) return invalid()
        const remaining = pool(pools[id])
        if (remaining.occ.length !== (usesOcc(spec.kind) ? spec.poolSize - count : 0)
          || remaining.minor.length !== (usesMinor(spec.kind) ? spec.poolSize - count : 0)) return invalid()
        if (!pick.submitted) inbox[round] = remaining
      }
      return [id, { kept: saved, inbox }]
    }))
    if (index <= activeIndex) {
      if (usesOcc(spec.kind)) offsets.occ += spec.totalRounds
      if (usesMinor(spec.kind)) offsets.minor += spec.totalRounds
    }
    return { kind: spec.kind, poolSize: spec.poolSize, totalRounds: spec.totalRounds, seats }
  })
  if (round < active.totalRounds) for (const [index, id] of seatOrder.entries()) {
    if (selected.get(id)?.submitted) {
      const nextId = seatOrder[(index + 1) % seatOrder.length]
      stages[activeIndex].seats[nextId].inbox[round + 1] = pool(pools[id])
    }
  }
  return { mode: 'simultaneous', seatOrder, stages, lastManualPickerId: null, legacyReplay: true }
}

/** Retained games keep their original Viewer, whose draft table reads these fields. */
export function draftForLegacyReplay(draft: DraftState) {
  if (!draft.legacyReplay) return undefined
  const progress = draft.seatOrder.map(id => ({ id, value: draftSeatProgress(draft, id) }))
  const unfinished = progress.flatMap(({ value }) => value.kind === 'finished' ? [] : [value.stageIndex])
  const stageIndex = unfinished.length ? Math.min(...unfinished) : draft.stages.length - 1
  const active = draft.stages[stageIndex]
  const round = Math.min(active.totalRounds, 1 + Math.min(...draft.seatOrder.map(id => {
    const kept = active.seats[id].kept
    return usesOcc(active.kind) ? kept.occ.length : kept.minor.length
  })))
  const empty = (): DraftPool => ({ occ: [], minor: [] })
  return {
    ...draft,
    stage: active.kind, stageIndex, round, totalRounds: active.totalRounds, poolSize: active.poolSize,
    pools: Object.fromEntries(progress.map(({ id, value }) => [id, value.kind === 'selecting' ? value.pool : empty()])),
    kept: Object.fromEntries(progress.map(({ id, value }) => [id, value.kept])),
    pendingPicks: Object.fromEntries(draft.seatOrder.map(id => {
      const saved = active.seats[id].kept
      return [id, { occ: usesOcc(active.kind) ? saved.occ[round - 1] ?? null : null,
        minor: usesMinor(active.kind) ? saved.minor[round - 1] ?? null : null }]
    })),
    stages: draft.stages.map(stage => ({ ...stage,
      pools: Object.fromEntries(draft.seatOrder.map(id => {
        const seat = stage.seats[id]
        const count = usesOcc(stage.kind) ? seat.kept.occ.length : seat.kept.minor.length
        return [id, seat.inbox[count + 1] ?? empty()]
      })),
    })),
  }
}
