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

export const getDueScheduledOffers = (state: GameState, player: PlayerState, cardId: string): ScheduledOffer[] =>
  readScheduledOffers(player, cardId).filter(offer => !offer.consumed && offer.dueRound === state.round)

export const hasDueScheduledOffers = (state: GameState, player: PlayerState): boolean =>
  Object.keys(player.cardStates).some(cardId => getDueScheduledOffers(state, player, cardId).length > 0)

export const expireDueScheduledOffers = (state: GameState, player: PlayerState): void => {
  for (const cardId of Object.keys(player.cardStates)) {
    const due = new Set(getDueScheduledOffers(state, player, cardId).map(offer => offer.id))
    if (!due.size) continue
    writeScheduledOffers(player, cardId, readScheduledOffers(player, cardId).map(offer => due.has(offer.id)
      ? { ...offer, consumed: true, consumedRound: state.round } : offer))
  }
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
  const offers = getDueScheduledOffers(state, player, cardId)
  if (offers.length === 0) return undefined
  const children = offers.map((offer) => scheduledOfferNode(cardId, offer.id))
  return children.length === 1 ? { ...children[0]!, optional: true } : { type: 'seq', children, optional: true }
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
  if (!canAffordOffer(player, offer.cost)) return []
  return [{
    value: `buy:${offer.animal}`,
    labelKey: `resources.${offer.animal}`,
    effectPreview: {
      kind: 'resourceExchange',
      resourcesPaid: offer.cost,
      resourcesGained: { [offer.animal]: 1 },
    },
  }]
}

const canAffordOffer = (player: PlayerState, cost: Partial<Resource>): boolean =>
  extendedResourceKeyList.every(resource => (player.resources[resource] ?? 0) >= (cost[resource] ?? 0))

const resourcePurchaseOptions = (
  player: PlayerState,
  offer: Extract<ScheduledOffer, { kind: 'resource-purchase' }>,
): ActionChoiceOption[] => canAffordOffer(player, offer.cost) ? [{
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

const currentOfferOptions = (state: GameState, player: PlayerState, offer: ScheduledOffer): ActionChoiceOption[] => {
  const playerIndex = state.players.findIndex(candidate => candidate.id === player.id)
  if (playerIndex < 0) return []
  return offer.kind === 'moor-special-action'
    ? moorSpecialActionOptions(state, player, playerIndex, offer)
    : offer.kind === 'animal-purchase' ? animalPurchaseOptions(player, offer) : resourcePurchaseOptions(player, offer)
}

const purchasedOfferFlow = (cardId: string, offer: Exclude<ScheduledOffer, { kind: 'moor-special-action' }>): ActionFlow => ({
  type: 'seq', children: [
    payLeaf({ cardId, cost: offer.cost }),
    { type: 'leaf', actionId: ACTION_ID, sourceCard: cardId, params: { cardId, offerId: offer.id, consume: true } },
    { type: 'leaf', actionId: 'receive', sourceCard: cardId,
      params: { entries: [{ cardId, round: offer.dueRound,
        resources: offer.kind === 'animal-purchase' ? { [offer.animal]: 1 } : offer.resources }] } },
  ],
})

export const scheduledOfferAction: ActionDefinition = {
  id: ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) => {
    if (context?.params?.consume === true) return true
    const cardId = typeof context?.params?.cardId === 'string' ? context.params.cardId : context?.sourceCard
    if (!cardId) return false
    const offer = getDueScheduledOffers(state, player, cardId).find(offer => offer.id === context?.params?.offerId)
    return !!offer && currentOfferOptions(state, player, offer).length > 0
  },
  execute: ({ state, player, params, sourceCard }) => {
    const cardId = typeof params?.cardId === 'string' ? params.cardId : sourceCard
    const offerId = typeof params?.offerId === 'string' ? params.offerId : undefined
    if (!cardId || !offerId) return { type: 'ok' }
    if (params?.consume === true) {
      markOfferConsumed(state, player, cardId, offerId)
      return { type: 'ok' }
    }
    const offer = getDueScheduledOffers(state, player, cardId).find(offer => offer.id === offerId)
    if (!offer) return { type: 'fail', errorKey: 'scheduled offer unavailable', recoverable: true }
    const options = currentOfferOptions(state, player, offer)
    if (!options.length) return { type: 'fail', errorKey: 'scheduled offer unavailable', recoverable: true }
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
  resolveChoice: ({ state, player, sourceCard, params }, choice) => {
    const cardId = typeof params?.cardId === 'string' ? params.cardId : sourceCard
    if (!cardId) return { type: 'fail', errorKey: 'scheduled offer unavailable', recoverable: true }
    const offer = getDueScheduledOffers(state, player, cardId).find(offer => offer.id === params?.offerId)
    if (!offer) return { type: 'fail', errorKey: 'scheduled offer unavailable', recoverable: true }
    if (choice === '__skip__') {
      markOfferConsumed(state, player, cardId, offer.id)
      return { type: 'ok' }
    }
    if (!currentOfferOptions(state, player, offer).some(option => option.value === choice)) {
      return { type: 'fail', errorKey: 'scheduled offer unavailable', recoverable: true }
    }

    if (choice.startsWith('purchase:')) {
      if (offer.kind !== 'resource-purchase') return { type: 'fail', errorKey: 'scheduled offer unavailable', recoverable: true }
      return { type: 'flow', flow: purchasedOfferFlow(cardId, offer) }
    }

    const moorChoice = parseMoorChoice(choice)
    if (moorChoice) {
      if (offer.kind !== 'moor-special-action') return { type: 'fail', errorKey: 'special action unavailable', recoverable: true }
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
        flow: { type: 'seq', children: [
          { type: 'leaf', actionId: MOOR_SPECIAL_ACTION_APPLY_ACTION_ID, sourceCard: cardId,
            params: { cardId: moorChoice.cardId, actionId: moorChoice.actionId, payload: moorChoice.payload } },
          { type: 'leaf', actionId: ACTION_ID, sourceCard: cardId, params: { cardId, offerId: offer.id, consume: true } },
        ] },
      }
    }

    const animal = parseAnimalChoice(choice)
    if (!animal || offer.kind !== 'animal-purchase') return { type: 'fail', errorKey: 'scheduled offer unavailable', recoverable: true }
    return { type: 'flow', flow: purchasedOfferFlow(cardId, offer) }
  },
}
