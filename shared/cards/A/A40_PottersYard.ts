import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { countUnusedFarmyardSpaces } from '../../game/farm'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A40_PottersYard'

// BGA isBuyable: count(getFreeZones()) > 7 → false (at most 7 unused spaces)
registerPrerequisite('At Most 7 Unused Farmyard Spaces', (player) =>
  countUnusedFarmyardSpaces(player) <= 7,
)

/**
 * A40 Potter's Yard:
 * - onBuy: place 1 clay on each unused farm space (tracked in extraData).
 * - After Plow/Construct/Fencing/Stables: collect clay from newly used spaces,
 *   offer optional exchange of N clay for 2N food.
 *
 * BGA: Tracks clay on individual farmyard tiles. When a tile becomes "used"
 * (by plowing, building, fencing, or placing stables), collect the clay and
 * optionally exchange for food.
 *
 * Implementation: We track the count of clay tokens remaining in extraData.
 * When spaces become used, we calculate how many clay are collected based on
 * the number of newly used tiles, and offer optional exchange.
 */

const FARM_ROWS = 3
const FARM_COLS = 5

const getUsedTiles = (player: CardListenerContext['player']): Set<string> => {
  const used = new Set<string>()
  player.roomTiles.forEach((t) => used.add(`${t.row},${t.col}`))
  player.fields.forEach((f) => used.add(`${f.row},${f.col}`))
  player.stableTiles.forEach((t) => used.add(`${t.row},${t.col}`))
  player.pastures.flatMap((p) => p.tiles ?? []).forEach((t) => used.add(`${t.row},${t.col}`))
  return used
}

const countFreeTiles = (player: CardListenerContext['player']): number => {
  const used = getUsedTiles(player)
  let count = 0
  for (let row = 0; row < FARM_ROWS; row++) {
    for (let col = 0; col < FARM_COLS; col++) {
      if (!used.has(`${row},${col}`)) count++
    }
  }
  return count
}

const getClayRemaining = (player: CardListenerContext['player']): number =>
  readCardExtraData<number>(player, CARD_ID, 'clayRemaining') ?? 0

const setClayRemaining = (player: CardListenerContext['player'], count: number) =>
  writeCardExtraData(player, CARD_ID, 'clayRemaining', Math.max(0, count))

const getUsedCountBefore = (player: CardListenerContext['player']): number =>
  readCardExtraData<number>(player, CARD_ID, 'usedCountBefore') ?? 0

const setUsedCountBefore = (player: CardListenerContext['player'], count: number) =>
  writeCardExtraData(player, CARD_ID, 'usedCountBefore', count)

const buildClayCollectFlow = (clayCollected: number): ActionHookResult | void => {
  if (clayCollected <= 0) return
  const children: ActionFlow[] = [
    gainLeaf(CARD_ID, { clay: clayCollected }),
  ]
  // Offer exchange: clay → 2 food per clay
  // BGA offers XOR of (exchange i clay for 2i food) for i from clayCollected down to 1
  const exchangeChoices: ActionFlow[] = []
  for (let i = clayCollected; i > 0; i--) {
    exchangeChoices.push({
      type: 'seq',
      children: [
        payLeaf({ cardId: CARD_ID, cost: { clay: i } }),
        gainLeaf(CARD_ID, { food: 2 * i }),
      ],
    })
  }
  children.push({
    type: 'xor',
    optional: true,
    children: exchangeChoices,
  })
  return {
    flow: {
      type: 'seq',
      children,
    },
    sourceCard: CARD_ID,
  }
}

// Before hooks: snapshot current used count
const beforePlowListener: CardListenerRegistration = {
  id: 'A40-potters-yard-before-plow',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['plow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getClayRemaining(context.player) <= 0) return
    setUsedCountBefore(context.player, getUsedTiles(context.player).size)
  },
}

const beforeConstructListener: CardListenerRegistration = {
  id: 'A40-potters-yard-before-construct',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getClayRemaining(context.player) <= 0) return
    setUsedCountBefore(context.player, getUsedTiles(context.player).size)
  },
}

const beforeFencingListener: CardListenerRegistration = {
  id: 'A40-potters-yard-before-fencing',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fencing'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getClayRemaining(context.player) <= 0) return
    setUsedCountBefore(context.player, getUsedTiles(context.player).size)
  },
}

const beforeStablesListener: CardListenerRegistration = {
  id: 'A40-potters-yard-before-stables',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getClayRemaining(context.player) <= 0) return
    setUsedCountBefore(context.player, getUsedTiles(context.player).size)
  },
}

// After hooks: calculate newly used tiles, collect clay
const createAfterHandler = (actionName: string): CardListenerRegistration => ({
  id: `A40-potters-yard-after-${actionName}`,
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: [actionName],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const clayRemaining = getClayRemaining(context.player)
    if (clayRemaining <= 0) return
    const usedBefore = getUsedCountBefore(context.player)
    const usedNow = getUsedTiles(context.player).size
    const newlyUsed = Math.max(0, usedNow - usedBefore)
    if (newlyUsed <= 0) return
    const clayCollected = Math.min(newlyUsed, clayRemaining)
    setClayRemaining(context.player, clayRemaining - clayCollected)
    return buildClayCollectFlow(clayCollected)
  },
})

export const A40_PottersYard = new MinorImprovement({
  id: CARD_ID,
  name: "Potter's Yard",
  deck: 'A',
  number: 40,
  category: 'GOODS_PROVIDER',
  desc: ["Immediately place 1 <CLAY> on each unused space in your farmyard. Each time you turn a space into a used space, you get the clay and you can immediately exchange it for 2 <FOOD>."],
  cost: { wood: 1, reed: 1 },
  prerequisite: 'At Most 7 Unused Farmyard Spaces',
  evenMoreSet: true,
})

export const A40_PottersYard_impl = {
  listeners: [beforePlowListener, beforeConstructListener, beforeFencingListener, beforeStablesListener, createAfterHandler('plow'), createAfterHandler('construct'), createAfterHandler('fencing'), createAfterHandler('stables')],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const freeCount = countFreeTiles(player)
    if (freeCount > 0) {
      setClayRemaining(player, freeCount)
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
