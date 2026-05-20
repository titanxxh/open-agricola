import type {
  ActionDefinition,
  ActionFlow,
  FutureMeepleRequest,
  GameState,
  Resource,
} from '../../../contract/types'
import type { EventSink } from '../../../contract/events'

export const futureMeeplesNode = (request?: FutureMeepleRequest): ActionFlow => ({
  type: 'leaf',
  actionId: 'future-meeples',
  ...(request ? { params: { __futureMeepleRequest: request } } : {}),
})

export const queueFutureMeeples = (
  state: GameState,
  request: FutureMeepleRequest,
) => {
  state.pendingFutureMeeples = [...state.pendingFutureMeeples, request]
}

export const queueFutureMeeplesFlow = (
  state: GameState,
  request: FutureMeepleRequest,
): ActionFlow => {
  queueFutureMeeples(state, request)
  return futureMeeplesNode()
}

const clampRound = (round: number) => Math.max(1, Math.min(14, round))

const addResourceCounts = (
  target: Partial<Resource>,
  addition: Partial<Resource>,
) => {
  Object.entries(addition).forEach(([key, value]) => {
    const amount = value ?? 0
    if (amount <= 0) return
    const typedKey = key as keyof Resource
    target[typedKey] = (target[typedKey] ?? 0) + amount
  })
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
  items: { offset: number; resources: Partial<Resource> }[],
): { round: number; resources: Partial<Resource> }[] =>
  items.map(({ offset, resources }) => ({ round: baseRound + offset, resources }))

export const resolveFutureMeepleRequests = (state: GameState, eventSink?: EventSink) => {
  if (state.pendingFutureMeeples.length === 0) return
  const requests = [...state.pendingFutureMeeples]
  state.pendingFutureMeeples = []
  const nextEntries = [...state.futureMeeples]
  requests.forEach((request, requestIndex) => {
    const queuedEntries: { round: number; resources?: Partial<Resource>; roomType?: NonNullable<GameState['futureMeeples'][number]['roomType']> }[] = []
    if ('entries' in request) {
      for (const entry of request.entries) {
        const round = clampRound(entry.round)
        if (round <= state.round) continue
        const resources: Partial<Resource> = {}
        if (entry.resources) addResourceCounts(resources, entry.resources)
        const queued = {
          round,
          ...(Object.keys(resources).length > 0 ? { resources } : {}),
          ...(entry.roomType ? { roomType: entry.roomType } : {}),
        }
        queuedEntries.push(queued)
        nextEntries.push({
          id: `${request.cardId}-${request.playerId}-${round}-${requestIndex}`,
          cardId: request.cardId,
          playerId: request.playerId,
          round,
          actionId: state.roundActionOrder[round - 1] ?? null,
          resources,
          ...(entry.roomType ? { roomType: entry.roomType } : {}),
        })
      }
    } else {
      const startRound = clampRound(request.startRound)
      const endRound = clampRound(request.startRound + request.count - 1)
      for (let round = startRound; round <= endRound; round += 1) {
        const actionId = state.roundActionOrder[round - 1] ?? null
        const resources: Partial<Resource> = {}
        addResourceCounts(resources, request.resources)
        const queued = {
          round,
          ...(Object.keys(resources).length > 0 ? { resources } : {}),
        }
        queuedEntries.push(queued)
        nextEntries.push({
          id: `${request.cardId}-${request.playerId}-${round}-${requestIndex}`,
          cardId: request.cardId,
          playerId: request.playerId,
          round,
          actionId,
          resources,
        })
      }
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
