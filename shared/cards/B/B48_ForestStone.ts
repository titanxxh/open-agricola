import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B48_ForestStone'

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const isStoneAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.stone ?? 0) > 0

// After using a wood accumulation space: move 1 food from card to supply
const woodCollectListener: CardListenerRegistration = {
  id: 'B48-forest-stone-after-collect-wood',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    const newCount = foodCount - 1
    writeCardExtraData(context.player, CARD_ID, 'foodCount', newCount)
    updateInfobox(context.player, newCount)
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

// After using a stone accumulation space: add 2 food to card
const stoneCollectListener: CardListenerRegistration = {
  id: 'B48-forest-stone-after-collect-stone',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isStoneAccumulationSpace(context.space)) return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    const newCount = foodCount + 2
    writeCardExtraData(context.player, CARD_ID, 'foodCount', newCount)
    updateInfobox(context.player, newCount)
  },
}

export const B48_ForestStone = new MinorImprovement({
  id: CARD_ID,
  name: 'Forest Stone',
  deck: 'B',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: ['Place 2 <FOOD> on this card. Each time you use a wood accumulation space, move 1 of these <FOOD> to your supply. Each time you use a stone accumulation space, add 2 <FOOD> to this card.'],
  cost: { wood: 2, stone: 1 },
  vp: 1,
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})

export const B48_ForestStone_impl = {
  listeners: [woodCollectListener, stoneCollectListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'foodCount', 2)
    updateInfobox(player, 2)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
