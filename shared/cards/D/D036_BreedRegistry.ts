import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../contract/types'
import { readCardExtraData } from '../helpers/card-state'
import type {
  DraftGameEvent,
  FutureMeepleResolvedEvent,
  HarvestFeedConvertedEvent,
  ResourceExchangedEvent,
  ResourceMovedEvent,
} from '../../contract/events'
import type { CardImpl } from '../registry'
import { computeAnimalZones } from '../../domain/animal-zones'

const CARD_ID = 'D036_BreedRegistry'
const BOARD_SHEEP_KEY = 'boardSheep'
const CARD_SHEEP_KEY = 'cardSheep'
const CONVERTED_KEY = 'sheepConvertedToFood'

type QueryableResourceMovedEvent = ResourceMovedEvent | DraftGameEvent<'resource.moved'>
type QueryableResourceExchangedEvent = ResourceExchangedEvent | DraftGameEvent<'resource.exchanged'>
type QueryableFutureMeepleResolvedEvent =
  | FutureMeepleResolvedEvent
  | DraftGameEvent<'futureMeeple.resolved'>
type QueryableHarvestFeedConvertedEvent =
  | HarvestFeedConvertedEvent
  | DraftGameEvent<'harvest.feedConverted'>

const isResourceMovedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourceMovedEvent =>
  event.type === 'resource.moved'

const isResourceExchangedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourceExchangedEvent =>
  event.type === 'resource.exchanged'

const isFutureMeepleResolvedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableFutureMeepleResolvedEvent =>
  event.type === 'futureMeeple.resolved'

const isHarvestFeedConvertedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableHarvestFeedConvertedEvent =>
  event.type === 'harvest.feedConverted'

const readCount = (
  context: CardListenerContext,
  key: string,
): number =>
  readCardExtraData<number>(context.ownerPlayer ?? context.player, CARD_ID, key) ?? 0

const trackedSheep = (player: CardListenerContext['player']): number =>
  (readCardExtraData<number>(player, CARD_ID, BOARD_SHEEP_KEY) ?? 0)
  + (readCardExtraData<number>(player, CARD_ID, CARD_SHEEP_KEY) ?? 0)

const infoboxText = (count: number): string => `${count} / 2`

const specialEffectLeaf = (
  ownerPlayerId: string,
  params: { kind: 'set-extra-data'; key: string; value: unknown } | { kind: 'set-infobox'; text: string },
): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  actionContext: { targetPlayerId: ownerPlayerId },
  params,
})

const stateUpdateFlow = (
  context: CardListenerContext,
  updates: Array<{ key: string; value: unknown }>,
  nextTotal?: number,
): ActionFlow => {
  const owner = context.ownerPlayer ?? context.player
  const children: ActionFlow[] = updates.map((update) =>
    specialEffectLeaf(owner.id, { kind: 'set-extra-data', key: update.key, value: update.value }),
  )
  if (context.ownerCardZone === 'played' && nextTotal !== undefined) {
    children.push(specialEffectLeaf(owner.id, { kind: 'set-infobox', text: infoboxText(nextTotal) }))
  }
  return children.length === 1 ? children[0]! : { type: 'seq', children }
}

const sheepMovementDeltas = (context: CardListenerContext) => {
  const owner = context.ownerPlayer ?? context.player
  const events = context.actionEvents ?? context.transactionEvents
  let boardSheep = 0
  let cardSheep = 0
  for (const event of events) {
    if (isFutureMeepleResolvedEvent(event)) {
      const sheep = event.resources?.sheep ?? 0
      if (sheep > 0 && event.playerId === owner.id) cardSheep += sheep
      continue
    }
    if (!isResourceMovedEvent(event)) continue
    const sheep = event.resources.sheep ?? 0
    if (sheep <= 0) continue
    if (event.to.kind !== 'player' || event.to.playerId !== owner.id) continue
    if (event.from.kind === 'card' || event.sourceCardId) {
      cardSheep += sheep
    } else if (event.from.kind === 'actionSpace' || event.from.kind === 'supply') {
      boardSheep += sheep
    }
  }
  return { boardSheep, cardSheep }
}

const hasSheepConvertedToFood = (context: CardListenerContext): boolean => {
  const owner = context.ownerPlayer ?? context.player
  const events = context.actionEvents ?? context.transactionEvents
  return events.some((event) => {
    if (isResourceExchangedEvent(event)) {
      return (
        (event.paid.sheep ?? 0) > 0 &&
        (event.gained.food ?? 0) > 0 &&
        event.paidFrom.kind === 'player' &&
        event.paidFrom.playerId === owner.id &&
        event.gainedTo.kind === 'player' &&
        event.gainedTo.playerId === owner.id
      )
    }
    return (
      isHarvestFeedConvertedEvent(event) &&
      event.playerId === owner.id &&
      (event.cost.sheep ?? 0) > 0 &&
      (event.food.food ?? 0) > 0
    )
  })
}

const sheepGainHandler: CardListenerRegistration['handler'] = (context) => {
  const deltas = sheepMovementDeltas(context)
  if (deltas.boardSheep <= 0 && deltas.cardSheep <= 0) return undefined
  const nextBoardSheep = readCount(context, BOARD_SHEEP_KEY) + deltas.boardSheep
  const nextCardSheep = readCount(context, CARD_SHEEP_KEY) + deltas.cardSheep
  const updates: Array<{ key: string; value: unknown }> = []
  if (deltas.boardSheep > 0) updates.push({ key: BOARD_SHEEP_KEY, value: nextBoardSheep })
  if (deltas.cardSheep > 0) updates.push({ key: CARD_SHEEP_KEY, value: nextCardSheep })
  return {
    flow: stateUpdateFlow(context, updates, nextBoardSheep + nextCardSheep),
    sourceCard: CARD_ID,
    countCardUse: false,
  }
}

const afterSheepGainListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-sheep-gain',
  cardIds: [CARD_ID],
  zones: ['hand', 'played'],
  phases: ['after'],
  actions: ['collect', 'gain', 'pop-card-stack'],
  handler: sheepGainHandler,
}

const opponentSheepGainListener: CardListenerRegistration = {
  ...afterSheepGainListener,
  id: 'D36-breed-registry-after-opponent-sheep-gain',
  scope: 'opponent',
}

const futureMeepleSheepGainListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-future-meeple-sheep-gain',
  cardIds: [CARD_ID],
  zones: ['hand', 'played'],
  phases: ['immediatelyAfter'],
  actions: ['future-meeple-resolved'],
  handler: sheepGainHandler,
}

const opponentFutureMeepleSheepGainListener: CardListenerRegistration = {
  ...futureMeepleSheepGainListener,
  id: 'D36-breed-registry-after-opponent-future-meeple-sheep-gain',
  scope: 'opponent',
}

const sheepConversionHandler: CardListenerRegistration['handler'] = (context) => {
  if (!hasSheepConvertedToFood(context)) return undefined
  return {
    flow: stateUpdateFlow(context, [{ key: CONVERTED_KEY, value: true }]),
    sourceCard: CARD_ID,
    countCardUse: false,
  }
}

const afterSheepExchangeConversionListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-exchange-sheep-conversion',
  cardIds: [CARD_ID],
  zones: ['hand', 'played'],
  phases: ['after'],
  actions: ['exchange'],
  handler: sheepConversionHandler,
}

const opponentSheepExchangeConversionListener: CardListenerRegistration = {
  ...afterSheepExchangeConversionListener,
  id: 'D36-breed-registry-after-opponent-exchange-sheep-conversion',
  scope: 'opponent',
}

const afterHarvestSheepConversionListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-harvest-sheep-conversion',
  cardIds: [CARD_ID],
  zones: ['hand', 'played'],
  phases: ['immediatelyAfter'],
  actions: ['harvest-feed-conversion'],
  handler: sheepConversionHandler,
}

const opponentHarvestSheepConversionListener: CardListenerRegistration = {
  ...afterHarvestSheepConversionListener,
  id: 'D36-breed-registry-after-opponent-harvest-sheep-conversion',
  scope: 'opponent',
}

const cardImpl = {
  listeners: [
    afterSheepGainListener,
    opponentSheepGainListener,
    futureMeepleSheepGainListener,
    opponentFutureMeepleSheepGainListener,
    afterSheepExchangeConversionListener,
    opponentSheepExchangeConversionListener,
    afterHarvestSheepConversionListener,
    opponentHarvestSheepConversionListener,
  ],
  prerequisiteCheck: (player, state) =>
    computeAnimalZones(player, state)
      .every((zone) => zone.animalType !== 'sheep' || (zone.animalCount ?? 0) <= 0),
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) =>
      specialEffectLeaf(player.id, { kind: 'set-infobox', text: infoboxText(trackedSheep(player)) }),
    computeBonusScore: (_state, player) => {
      const converted = readCardExtraData<boolean>(player, CARD_ID, CONVERTED_KEY) ?? false
      if (converted) return 0
      return trackedSheep(player) <= 2 ? 3 : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D036_BreedRegistry = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Breed Registry",
    deck: "D",
    number: 36,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, if you gained at most 2 <SHEEP> from sources other than breeding during the game and have not turned any <SHEEP> into <FOOD>, you get 3 bonus <SCORE>."],
    cost: {},
    prerequisite: "No Sheep",
    extraVp: true,
  },
  impl: cardImpl,
})

export const D036_BreedRegistry_impl = D036_BreedRegistry.impl
