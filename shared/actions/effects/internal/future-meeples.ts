import type {
  ActionDefinition,
  ActionFlow,
  FutureMeepleResourceMap,
  FutureMeepleRequest,
  GameState,
} from '../../../contract/types'
import type { EventSink } from '../../../contract/events'
import { describeFutureSchedule, normalizeFutureSchedule } from '../../future-schedule'
import { assertEnabledResourceAmounts } from '../../../contract/resource-keys'
import { findPlayerById } from '../../../domain/player'

export const futureMeeplesNode = (request?: FutureMeepleRequest): Extract<ActionFlow, { type: 'leaf' }> => ({
  type: 'leaf',
  actionId: 'future-meeples',
  ...(request ? { params: { __futureMeepleRequest: request } } : {}),
})

export const queueFutureMeeples = (
  state: GameState,
  request: FutureMeepleRequest,
) => {
  const player = findPlayerById(state, request.playerId)
  if (player) for (const entry of normalizeFutureSchedule(state.round, request)) assertEnabledResourceAmounts(entry.resources, player.resources)
  state.pendingFutureMeeples = [...state.pendingFutureMeeples, request]
}

export const queueFutureMeeplesFlow = (
  state: GameState,
  request: FutureMeepleRequest,
): ActionFlow => {
  queueFutureMeeples(state, request)
  return { ...futureMeeplesNode(), params: { __queuedFutureMeepleRequest: request } }
}

export const removeFutureMeeples = (
  state: GameState,
  filter: { playerId: string; cardId: string; rounds?: number[] },
): void => {
  state.futureMeeples = state.futureMeeples.filter((entry) => {
    if (entry.playerId !== filter.playerId || entry.cardId !== filter.cardId) return true
    if (filter.rounds && !filter.rounds.includes(entry.round)) return true
    return false
  })
}

export const buildFutureEntries = (
  baseRound: number,
  items: { offset: number; resources: FutureMeepleResourceMap }[],
): { round: number; resources: FutureMeepleResourceMap }[] =>
  items.map(({ offset, resources }) => ({ round: baseRound + offset, resources }))

export const resolveFutureMeepleRequests = (state: GameState, eventSink?: EventSink) => {
  if (state.pendingFutureMeeples.length === 0) return
  const requests = [...state.pendingFutureMeeples]
  state.pendingFutureMeeples = []
  const nextEntries = [...state.futureMeeples]
  requests.forEach((request, requestIndex) => {
    const queuedEntries: { round: number; resources?: FutureMeepleResourceMap; roomType?: NonNullable<GameState['futureMeeples'][number]['roomType']> }[] = []
    for (const entry of normalizeFutureSchedule(state.round, request)) {
      const { round, resources, roomType, actionContext } = entry
      queuedEntries.push({ round, ...(Object.keys(resources).length ? { resources } : {}), ...(roomType ? { roomType } : {}) })
      nextEntries.push({
        id: `${request.cardId}-${request.playerId}-${round}-${requestIndex}`,
        cardId: request.cardId,
        playerId: request.playerId,
        round,
        actionId: state.roundActionOrder[round - 1] ?? null,
        resources,
        ...(roomType ? { roomType } : {}),
        ...(actionContext ? { actionContext } : {}),
      })
    }
    if (queuedEntries.length > 0) {
      eventSink?.emit<'futureMeeple.queued'>({
        type: 'futureMeeple.queued',
        playerId: request.playerId,
        cardId: request.cardId,
        sourceCardId: request.cardId,
        entries: queuedEntries,
        ...(request.sourceSummary ? { sourceSummary: request.sourceSummary } : {}),
      })
    }
  })
  state.futureMeeples = nextEntries
}

export const futureMeeplesAction: ActionDefinition = {
  id: 'future-meeples',
  nameKey: 'actions.future-meeples.name',
  descriptionKey: 'actions.future-meeples.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  previewEffect: ({ state, params }) => {
    const inline = params?.__futureMeepleRequest as FutureMeepleRequest | undefined
    const queued = params?.__queuedFutureMeepleRequest as FutureMeepleRequest | undefined
    const request = inline ?? (queued && state.pendingFutureMeeples.some((candidate) => JSON.stringify(candidate) === JSON.stringify(queued)) ? queued : undefined)
    return request ? describeFutureSchedule(state.round, request) : undefined
  },
  execute: ({ state, params, eventSink }) => {
    // If params contain an inline queue request (from anytime handlers), queue it first
    const inlineRequest = params?.__futureMeepleRequest as FutureMeepleRequest | undefined
    if (inlineRequest) {
      queueFutureMeeples(state, inlineRequest)
    }
    resolveFutureMeepleRequests(state, eventSink)
    return { type: 'ok' }
  },
}
