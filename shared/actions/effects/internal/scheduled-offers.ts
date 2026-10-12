import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionFlow,
  GameState,
  PlayerState,
  ChoiceEffectPreview,
  Resource,
} from '../../../contract/types'
import type { AnimalKey } from '../../../contract/animals'
import { ALL_ANIMAL_KEYS } from '../../../contract/animals'
import { extendedResourceKeyList } from '../../../contract/state-constants'
import { payLeaf } from '../../../cards/helpers/pay-gain-node'
import { readCardExtraData, writeCardExtraData } from '../../../cards/helpers/card-state'
import { MOOR_SPECIAL_ACTION_APPLY_ACTION_ID } from '../../../moor/special-action-flow'
import {
  validateMoorSpecialAction,
  type MoorSpecialActionPayload,
} from '../../../moor/special-actions'
import type { MoorSpecialActionId } from '../../../moor/types'

const ACTION_ID = 'scheduled-offer'
const EXTRA_DATA_KEY = 'scheduledOffers'

export type ScheduledOffer =
  | {
      id: string
      kind: 'resource-purchase'
      dueRound: number
      resources: Partial<Resource>
      cost: Partial<Resource>
      consumed: boolean
      consumedRound?: number
    }
  | {
      id: string
      kind: 'moor-special-action'
      dueRound: number
      actionId: MoorSpecialActionId
      cost?: Partial<Resource>
      consumed: boolean
      consumedRound?: number
    }
  | {
      id: string
      kind: 'animal-purchase'
      dueRound: number
      animal: AnimalKey
      cost: Partial<Resource>
      consumed: boolean
      consumedRound?: number
    }

const isResources = (value: unknown): value is Partial<Resource> => !!value && typeof value === 'object' &&
  Object.entries(value).every(([key, amount]) => extendedResourceKeyList.some(resource => resource === key) && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0)

const isScheduledOffer = (value: unknown): value is ScheduledOffer => {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' ||
    !('dueRound' in value) || typeof value.dueRound !== 'number' || !Number.isInteger(value.dueRound) ||
    !('consumed' in value) || typeof value.consumed !== 'boolean' || !('kind' in value)) return false
  if (value.kind === 'resource-purchase') return 'resources' in value && isResources(value.resources) && 'cost' in value && isResources(value.cost)
  if (value.kind === 'animal-purchase') return 'animal' in value && ALL_ANIMAL_KEYS.some(animal => animal === value.animal) && 'cost' in value && isResources(value.cost)
  if (value.kind === 'moor-special-action') return 'actionId' in value &&
    ['cut-peat', 'fell-trees', 'slash-and-burn', 'hiring-fair', 'horse-market', 'black-market', 'illicit-work'].some(action => action === value.actionId) &&
    (!('cost' in value) || value.cost === undefined || isResources(value.cost))
  return false
}

export const describeScheduledOffers = (offers: readonly ScheduledOffer[]): ChoiceEffectPreview => ({
  kind: 'futureOffers', entries: offers.map(offer => ({
    round: offer.dueRound, resourcesPaid: offer.cost ?? {},
    resources: offer.kind === 'animal-purchase' ? { [offer.animal]: 1 } : offer.kind === 'resource-purchase' ? offer.resources : {},
    ...(offer.kind === 'moor-special-action' ? { actionNameKey: `moor.specialActions.${offer.actionId}` } : {}),
  })),
})

export const readScheduledOffers = (
  player: PlayerState,
  cardId: string,
): ScheduledOffer[] => {
  const raw = readCardExtraData<unknown>(player, cardId, EXTRA_DATA_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter(isScheduledOffer)
}

export const writeScheduledOffers = (
  player: PlayerState,
  cardId: string,
  offers: ScheduledOffer[],
): void => {
  writeCardExtraData(player, cardId, EXTRA_DATA_KEY, offers)
}

export const scheduledOfferNode = (
  cardId: string,
  offerId: string,
): ActionFlow => ({
  type: 'leaf',
  actionId: ACTION_ID,
  sourceCard: cardId,
  params: { cardId, offerId },
})

export const scheduledOffersRoundStartFlow = (
  state: GameState,
  player: PlayerState,
  cardId: string,
): ActionFlow | undefined => {
  const offers = readScheduledOffers(player, cardId)
    .filter((offer) => !offer.consumed && offer.dueRound === state.round)
  if (offers.length === 0) return undefined
  const children = offers.map((offer) => scheduledOfferNode(cardId, offer.id))
  return children.length === 1 ? children[0] : { type: 'seq', children }
}

const markOfferConsumed = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  offerId: string,
): ScheduledOffer | null => {
  const offers = readScheduledOffers(player, cardId)
  const index = offers.findIndex((offer) =>
    offer.id === offerId && !offer.consumed && offer.dueRound === state.round
  )
  if (index === -1) return null
  const consumed: ScheduledOffer = { ...offers[index]!, consumed: true, consumedRound: state.round }
  offers[index] = consumed
  writeScheduledOffers(player, cardId, offers)
  return consumed
}

const payloadsForAction = (
  player: PlayerState,
  actionId: MoorSpecialActionId,
): MoorSpecialActionPayload[] => {
  if (actionId !== 'cut-peat' && actionId !== 'fell-trees' && actionId !== 'slash-and-burn') {
    return [{}]
  }
  const kind = actionId === 'cut-peat' ? 'moor' : 'forest'
  return (player.farmTerrain ?? [])
    .filter((tile) => tile.kind === kind)
    .map(({ row, col }) => ({ tile: { row, col } }))
}

const moorSpecialActionOptions = (
  state: GameState,
  player: PlayerState,
  playerIndex: number,
  offer: Extract<ScheduledOffer, { kind: 'moor-special-action' }>,
): ActionChoiceOption[] =>
  (state.farmersOfTheMoor?.specialActionCards ?? [])
    .filter((card) => card.actions.includes(offer.actionId))
    .flatMap((card) =>
      payloadsForAction(player, offer.actionId).flatMap((payload) => {
        const validation = validateMoorSpecialAction(state, playerIndex, card.id, offer.actionId, payload)
        if (!validation.ok) return []
        const tile = payload.tile
        return [{
          value: tile
            ? `offer:${offer.id}:moor:${card.id}:${offer.actionId}:${tile.row}:${tile.col}`
            : `offer:${offer.id}:moor:${card.id}:${offer.actionId}`,
          labelKey: `moor.specialActions.${offer.actionId}`,
          targetCard: { cardId: card.id, actionNameKeys: card.actions.map((actionId) => `moor.specialActions.${actionId}`) },
          ...(tile ? { target: { kind: 'farm-cell' as const, playerId: player.id, positions: [{ ...tile }] } } : {}),
        }]
      }),
    )

const animalPurchaseOptions = (
  player: PlayerState,
  offer: Extract<ScheduledOffer, { kind: 'animal-purchase' }>,
): ActionChoiceOption[] => {
  const foodCost = offer.cost.food ?? 0
  if (foodCost > 0 && player.resources.food < foodCost) return []
  return [{
    value: `buy:${offer.animal}`,
    labelKey: `resources.${offer.animal}`,
    effectPreview: {
      kind: 'resourceExchange',
      resourcesPaid: { food: foodCost },
      resourcesGained: { [offer.animal]: 1 },
    },
  }]
}

const resourcePurchaseOptions = (
  player: PlayerState,
  offer: Extract<ScheduledOffer, { kind: 'resource-purchase' }>,
): ActionChoiceOption[] => extendedResourceKeyList.every((resource) =>
  (player.resources[resource] ?? 0) >= (offer.cost[resource] ?? 0)) ? [{
    value: `purchase:${offer.id}`,
    labelKey: 'ui.interactionResourceExchange',
    effectPreview: { kind: 'resourceExchange', resourcesPaid: offer.cost, resourcesGained: offer.resources },
  }] : []

const parseMoorChoice = (
  choice: string,
): { offerId: string; cardId: string; actionId: MoorSpecialActionId; payload: MoorSpecialActionPayload } | null => {
  const parts = choice.split(':')
  if (parts[0] !== 'offer' || parts[2] !== 'moor') return null
  const offerId = parts[1]
  const cardId = parts[3]
  const actionId = parts[4]
  if (!offerId || !cardId || !actionId) return null
  if (actionId !== 'cut-peat' && actionId !== 'fell-trees' && actionId !== 'slash-and-burn' &&
    actionId !== 'hiring-fair' && actionId !== 'horse-market' && actionId !== 'black-market' &&
    actionId !== 'illicit-work') return null
  if (parts.length === 7) {
    const row = Number(parts[5])
    const col = Number(parts[6])
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null
    return { offerId, cardId, actionId, payload: { tile: { row, col } } }
  }
  return { offerId, cardId, actionId, payload: {} }
}

const parseAnimalChoice = (choice: string): AnimalKey | null => {
  if (!choice.startsWith('buy:')) return null
  const animal = choice.slice('buy:'.length)
  return (ALL_ANIMAL_KEYS as readonly string[]).includes(animal)
    ? animal as AnimalKey
    : null
}

export const scheduledOfferAction: ActionDefinition = {
  id: ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, sourceCard }) => {
    const cardId = typeof params?.cardId === 'string' ? params.cardId : sourceCard
    const offerId = typeof params?.offerId === 'string' ? params.offerId : undefined
    if (!cardId || !offerId) return { type: 'ok' }
    const offer = markOfferConsumed(state, player, cardId, offerId)
    if (!offer) return { type: 'ok' }

    const playerIndex = state.players.indexOf(player)
    if (playerIndex < 0) return { type: 'ok' }
    const options = offer.kind === 'moor-special-action'
      ? moorSpecialActionOptions(state, player, playerIndex, offer)
      : offer.kind === 'animal-purchase' ? animalPurchaseOptions(player, offer)
        : resourcePurchaseOptions(player, offer)
    if (options.length === 0) return { type: 'ok' }
    return {
      type: 'request',
      request: {
        kind: 'choice',
        options: [
          ...options,
          { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
        ],
      },
      promptKey: 'ui.interactionOptionalAction',
      sourceCard: cardId,
    }
  },
  resolveChoice: ({ state, player, sourceCard, eventSink }, choice) => {
    if (choice === '__skip__') return { type: 'ok' }
    const cardId = sourceCard
    if (!cardId) return { type: 'fail', errorKey: 'scheduled offer unavailable' }

    if (choice.startsWith('purchase:')) {
      const offer = readScheduledOffers(player, cardId).find((candidate) =>
        candidate.id === choice.slice('purchase:'.length) && candidate.consumed &&
        candidate.consumedRound === state.round)
      if (!offer || offer.kind !== 'resource-purchase' || !resourcePurchaseOptions(player, offer).length) {
        return { type: 'fail', errorKey: 'scheduled offer unavailable' }
      }
      return { type: 'flow', flow: { type: 'seq', children: [
        payLeaf({ cardId, cost: offer.cost }),
        { type: 'leaf', actionId: 'receive', sourceCard: cardId,
          params: { entries: [{ cardId, round: state.round, resources: offer.resources }] } },
      ] } }
    }

    const moorChoice = parseMoorChoice(choice)
    if (moorChoice) {
      const playerIndex = state.players.indexOf(player)
      if (playerIndex < 0) return { type: 'fail', errorKey: 'special action unavailable' }
      const validation = validateMoorSpecialAction(
        state,
        playerIndex,
        moorChoice.cardId,
        moorChoice.actionId,
        moorChoice.payload,
      )
      if (!validation.ok) return { type: 'fail', errorKey: validation.error }
      return {
        type: 'flow',
        flow: {
          type: 'leaf',
          actionId: MOOR_SPECIAL_ACTION_APPLY_ACTION_ID,
          sourceCard: cardId,
          params: {
            cardId: moorChoice.cardId,
            actionId: moorChoice.actionId,
            payload: moorChoice.payload,
          },
        },
      }
    }

    const animal = parseAnimalChoice(choice)
    if (!animal) return { type: 'fail', errorKey: 'scheduled offer unavailable' }
    if (player.resources.food < 1) return { type: 'fail', errorKey: 'not enough food' }
    player.resources.food -= 1
    player.resources[animal] = (player.resources[animal] ?? 0) + 1
    eventSink?.emit<'resource.paid'>({
      type: 'resource.paid',
      actorPlayerId: player.id,
      sourceCardId: cardId,
      resources: { food: 1 },
      to: { kind: 'supply' },
      paymentFor: 'cardEffect',
    })
    eventSink?.emit<'resource.moved'>({
      type: 'resource.moved',
      actorPlayerId: player.id,
      sourceCardId: cardId,
      resources: { [animal]: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: player.id },
      reason: 'cardEffect',
    })
    return {
      type: 'flow',
      flow: {
        type: 'leaf',
        actionId: 'reorganize',
        sourceCard: cardId,
        actionContext: { trigger: 'anytime' },
      },
    }
  },
}
