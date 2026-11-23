import { defineMinorCard } from '../card-source'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import type { DraftGameEvent, GameEvent } from '../../contract/events'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import { gainLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import { foodCraftBuildingResource, isFoodCraftBuilding, playerFoodCraftBuildingIds } from './moor-batch1-helpers'

const CARD_ID = 'M091_RoutineWork'
/** Craft buildings used in one harvest, keyed by its round so each harvest starts empty. */
const usedCraftBuildingIdsKey = (round: number) => `usedCraftBuildingIds:${round}`

type QueryableEvent = GameEvent | DraftGameEvent
type ExchangeEvent = Extract<QueryableEvent, { type: 'resource.exchanged' }>

const specialEffect = (round: number, value: string[]): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: usedCraftBuildingIdsKey(round), value },
})

const usedCraftBuildingIds = (player: CardListenerContext['player'], round: number) =>
  readCardExtraData<string[]>(player, CARD_ID, usedCraftBuildingIdsKey(round)) ?? []

const mergedUsedCraftBuildingIds = (
  player: CardListenerContext['player'],
  round: number,
  ids: readonly string[],
) => [...new Set([...usedCraftBuildingIds(player, round), ...ids])]

const isExchangeEvent = (event: QueryableEvent): event is ExchangeEvent =>
  event.type === 'resource.exchanged'

const usedCraftBuildingIdsFromExchangeEvents = (events: readonly QueryableEvent[]) =>
  events.flatMap((event) => {
    if (!isExchangeEvent(event)) return []
    const sourceId = event.exchangeSource
    if (!sourceId) return []
    const resource = foodCraftBuildingResource(sourceId)
    if (!resource) return []
    if ((event.paid[resource] ?? 0) <= 0) return []
    if ((event.gained.food ?? 0) <= 0) return []
    return [sourceId]
  })

const afterExchangeListener: CardListenerRegistration = {
  id: 'M091-routine-work-after-exchange',
  cardIds: [CARD_ID],
  actions: ['exchange'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ids = usedCraftBuildingIdsFromExchangeEvents(context.actionEvents ?? context.transactionEvents)
    if (ids.length === 0) return
    return {
      flow: specialEffect(context.state.round, mergedUsedCraftBuildingIds(context.player, context.state.round, ids)),
      sourceCard: CARD_ID,
    }
  },
}

const tradeAppliedListener: CardListenerRegistration = {
  id: 'M091-routine-work-trade-applied',
  cardIds: [CARD_ID],
  actions: ['trade-applied'],
  phases: ['immediatelyAfter' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const sourceId = context.extraData?.sourceId
    if (typeof sourceId !== 'string') return
    if (!isFoodCraftBuilding(sourceId)) return
    return {
      flow: specialEffect(context.state.round, mergedUsedCraftBuildingIds(context.player, context.state.round, [sourceId])),
      sourceCard: CARD_ID,
    }
  },
}

const rewardChoice = (): ActionFlow => ({
  type: 'xor',
  optional: true,
  children: [
    gainLeaf(CARD_ID, { fuel: 1 }),
    gainLeaf(CARD_ID, { food: 1 }),
  ],
})

const cardImpl = {
  listeners: [afterExchangeListener, tradeAppliedListener],
  effect: {
    id: CARD_ID,
    onEndHarvestFeedingPhase: (state, player) => {
      const used = usedCraftBuildingIds(player, state.round)
      const unused = playerFoodCraftBuildingIds(player).filter((id) => !used.includes(id))
      if (unused.length === 0) return
      return {
        type: 'seq',
        children: unused.map(() => rewardChoice()),
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M091_RoutineWork = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Routine Work",
    deck: "M",
    number: 91,
    category: "GOODS_PROVIDER",
    desc: [
        "Each harvest, you get your choice of 1 <FUEL> or 1 <FOOD> for each of your craft buildings (Joinery, Pottery, and Basketmaker's Workshop) that you choose not to use to turn a building resource into <FOOD>."
    ],
    cost: {
        "vegetable": 1
    },
    prerequisite: "No Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M091_RoutineWork_impl = M091_RoutineWork.impl
