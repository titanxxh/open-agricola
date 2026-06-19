import type { PrivateGameEvent } from '../contract/private-events'
import type {
  GameState,
  OrdinaryCardDrawChoice,
  OrdinaryCardType,
  PlayerState,
} from '../contract/types'

type StartOrdinaryCardDrawChoiceInput = {
  playerId: string
  cardType: OrdinaryCardType
  count: number
  sourceCard?: string
  sourceActionId?: string
}

type ResolveOrdinaryCardDrawChoiceInput = {
  playerId: string
  choiceId: string
  keepCardId: string
}

type Result<T> = { ok: true } & T | { ok: false; error: string }

const handFor = (player: PlayerState, cardType: OrdinaryCardType): string[] =>
  cardType === 'occupation' ? player.occupationHand : player.minorHand

const nextChoiceId = (state: GameState): string => {
  const next = state.nextOrdinaryCardDrawChoiceSeq ?? 1
  state.nextOrdinaryCardDrawChoiceSeq = next + 1
  return `ordinary-card-draw-${next}`
}

export const startOrdinaryCardDrawChoice = (
  state: GameState,
  input: StartOrdinaryCardDrawChoiceInput,
): Result<{ choice: OrdinaryCardDrawChoice }> => {
  const player = state.players.find((entry) => entry.id === input.playerId)
  if (!player) return { ok: false, error: `unknown player ${input.playerId}` }
  if (!Number.isInteger(input.count) || input.count <= 0) {
    return { ok: false, error: 'draw count must be a positive integer' }
  }
  const deck = state.ordinaryCardDecks[input.cardType]
  if (deck.length < input.count) {
    return { ok: false, error: `not enough ${input.cardType} cards in draw deck` }
  }
  const candidates = deck.splice(0, input.count)
  const choice: OrdinaryCardDrawChoice = {
    id: nextChoiceId(state),
    playerId: player.id,
    cardType: input.cardType,
    candidates,
    ...(input.sourceCard ? { sourceCard: input.sourceCard } : {}),
    ...(input.sourceActionId ? { sourceActionId: input.sourceActionId } : {}),
  }
  state.ordinaryCardDrawChoices[choice.id] = choice
  return { ok: true, choice }
}

export const hasPendingOrdinaryCardDrawChoice = (state: GameState): boolean =>
  Object.keys(state.ordinaryCardDrawChoices ?? {}).length > 0

export const resolveOrdinaryCardDrawChoice = (
  state: GameState,
  input: ResolveOrdinaryCardDrawChoiceInput,
): Result<{ privateEvents: PrivateGameEvent[] }> => {
  const choice = state.ordinaryCardDrawChoices[input.choiceId]
  if (!choice) return { ok: false, error: `unknown draw choice ${input.choiceId}` }
  if (choice.playerId !== input.playerId) {
    return { ok: false, error: 'draw choice belongs to another player' }
  }
  if (!choice.candidates.includes(input.keepCardId)) {
    return { ok: false, error: 'kept card is not in draw choice' }
  }
  const player = state.players.find((entry) => entry.id === input.playerId)
  if (!player) return { ok: false, error: `unknown player ${input.playerId}` }
  const hand = handFor(player, choice.cardType)
  hand.push(input.keepCardId)
  delete state.ordinaryCardDrawChoices[input.choiceId]
  const event: PrivateGameEvent = {
    schemaVersion: 1,
    type: 'private.handChanged',
    recipientPlayerId: player.id,
    cardIds: [...hand],
    cardType: choice.cardType,
    reason: 'card-effect',
    ...(choice.sourceCard ? { sourceCard: choice.sourceCard } : {}),
    ...(choice.sourceActionId ? { sourceActionId: choice.sourceActionId } : {}),
  }
  return {
    ok: true,
    privateEvents: [event],
  }
}
