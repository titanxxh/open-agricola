import type {
  ActionDefinition,
  ActionFlow,
  FutureMeepleRequest,
  GameState,
  Resource,
} from '../../game/types'

export const futureMeeplesNode = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'future-meeples',
})

export const queueFutureMeeples = (
  state: GameState,
  request: FutureMeepleRequest,
) => {
  state.pendingFutureMeeples = [...state.pendingFutureMeeples, request]
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

export const resolveFutureMeepleRequests = (state: GameState) => {
  if (state.pendingFutureMeeples.length === 0) return
  const requests = [...state.pendingFutureMeeples]
  state.pendingFutureMeeples = []
  const nextEntries = [...state.futureMeeples]
  requests.forEach((request, requestIndex) => {
    const startRound = clampRound(request.startRound)
    const endRound = clampRound(request.startRound + request.count - 1)
    for (let round = startRound; round <= endRound; round += 1) {
      const actionId = state.roundActionOrder[round - 1] ?? null
      const resources: Partial<Resource> = {}
      addResourceCounts(resources, request.resources)
      nextEntries.push({
        id: `${request.cardId}-${request.playerId}-${round}-${requestIndex}`,
        cardId: request.cardId,
        playerId: request.playerId,
        round,
        actionId,
        resources,
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
  execute: ({ state }) => {
    resolveFutureMeepleRequests(state)
    return { type: 'ok' }
  },
}
