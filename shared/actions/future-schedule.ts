import { extendedResourceKeyList } from '../contract/state-constants'
import type { ChoiceEffectPreview, FutureMeepleRequest, FutureMeepleResourceMap, FutureMeepleRoomType } from '../contract/types'

export type FutureScheduleEntry = {
  round: number
  resources: FutureMeepleResourceMap
  roomType?: FutureMeepleRoomType
  actionContext?: Record<string, unknown>
}

/** Exact targets and prefixes keep their declared identity; never clamp to round 14. */
export const normalizeFutureSchedule = (currentRound: number, request: FutureMeepleRequest): FutureScheduleEntry[] => {
  const entries: { round: number; resources?: FutureMeepleResourceMap; roomType?: FutureMeepleRoomType; actionContext?: Record<string, unknown> }[] = []
  if ('entries' in request) {
    entries.push(...request.entries.filter((entry) => Number.isInteger(entry.round) && entry.round > currentRound && entry.round <= 14))
  } else {
    const startRound = Math.max(1, currentRound + 1, request.startRound)
    const endRound = Math.min(14, request.startRound + request.count - 1)
    for (let round = startRound; round <= endRound; round += 1) entries.push({ round, resources: request.resources, actionContext: request.actionContext })
  }
  return entries
    .map((entry) => ({
      round: entry.round,
      resources: Object.fromEntries(Object.entries(entry.resources ?? {}).filter(([, value]) => typeof value === 'number' && value > 0)),
      ...('roomType' in entry && entry.roomType ? { roomType: entry.roomType } : {}),
      ...(entry.actionContext ? { actionContext: entry.actionContext } : {}),
    }))
}

export type FutureSchedulePreviewEntry = Extract<ChoiceEffectPreview, { kind: 'futureSchedule' }>['entries'][number]

/** Rendering compression preserves order, quantity, optional actions and conditions. */
export const groupFutureSchedulePreview = (entries: FutureSchedulePreviewEntry[]): FutureSchedulePreviewEntry[] => {
  const grouped: FutureSchedulePreviewEntry[] = []
  for (const entry of entries) {
    const previous = grouped.at(-1)
    const sameEffect = previous && JSON.stringify({ ...previous, round: undefined, endRound: undefined }) === JSON.stringify({ ...entry, round: undefined, endRound: undefined })
    if (previous && (previous.endRound ?? previous.round) + 1 === entry.round && sameEffect) {
      previous.endRound = entry.round
    } else {
      grouped.push({ ...entry })
    }
  }
  return grouped
}

/** Query the executable request without an Engine or presentation data on cards. */
export const describeFutureSchedule = (currentRound: number, request: FutureMeepleRequest): ChoiceEffectPreview => ({
  kind: 'futureSchedule',
  entries: groupFutureSchedulePreview(normalizeFutureSchedule(currentRound, request).map(({ round, resources, roomType, actionContext }) => {
    const exactCost = actionContext?.exactCost
    const resourcesPaid = exactCost && typeof exactCost === 'object'
      ? Object.fromEntries(extendedResourceKeyList.flatMap((key) => {
          const amount = (exactCost as Record<string, unknown>)[key]
          return typeof amount === 'number' && amount > 0 ? [[key, amount]] : []
        })) : {}
    const actions = (['field', 'stable', 'forest', 'moor'] as const).flatMap((kind) => {
      const amount = Math.max(0, Math.floor(resources[kind] ?? 0))
      return amount > 0 ? [{ kind, amount, ...(Object.keys(resourcesPaid).length && (kind === 'field' || kind === 'stable') ? { resourcesPaid } : {}) }] : []
    })
    const condition = actionContext?.resourceCondition as Record<string, unknown> | undefined
    const resourceCondition = condition?.kind === 'min-resource' && extendedResourceKeyList.includes(condition.resource as typeof extendedResourceKeyList[number]) && typeof condition.amount === 'number' && Number.isFinite(condition.amount)
      ? { kind: 'min-resource' as const, resource: condition.resource as typeof extendedResourceKeyList[number], amount: Math.max(0, Math.floor(condition.amount)) } : undefined
    return {
      round,
      resources: Object.fromEntries(extendedResourceKeyList.flatMap((key) => (resources[key] ?? 0) > 0 ? [[key, resources[key]]] : [])),
      ...(actions.length ? { actions } : {}),
      ...(resourceCondition ? { resourceCondition } : {}),
      ...(roomType ? { roomType } : {}),
    }
  })),
})
