import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B048_ForestStone'
const updateInfobox = (player: PlayerState, count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

const setStoredFoodFlow = (count: number): ActionFlow[] => [
  {
    type: 'leaf',
    actionId: 'special-effect',
    sourceCard: CARD_ID,
    params: { kind: 'set-extra-data', key: 'foodCount', value: count },
  },
  {
    type: 'leaf',
    actionId: 'special-effect',
    sourceCard: CARD_ID,
    params: { kind: 'set-counter', key: 'foodCount', value: count },
  },
  {
    type: 'leaf',
    actionId: 'special-effect',
    sourceCard: CARD_ID,
    params: { kind: 'set-infobox', text: `${count} Food` },
  },
]

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const isStoneAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.stone ?? 0) > 0

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
    return {
      flow: {
        type: 'seq',
        children: [
          ...setStoredFoodFlow(newCount),
          gainLeaf(CARD_ID, { food: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const stoneCollectListener: CardListenerRegistration = {
  id: 'B48-forest-stone-after-collect-stone',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isStoneAccumulationSpace(context.space)) return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    const newCount = foodCount + 2
    return {
      flow: {
        type: 'seq',
        children: setStoredFoodFlow(newCount),
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
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

export const B048_ForestStone = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Forest Stone',
    deck: 'B',
    number: 48,
    category: 'FOOD_PROVIDER',
    desc: ['Place 2 <FOOD> on this card. Each time you use a <WOOD> accumulation space, move 1 of these <FOOD> to your supply. Each time you use a <STONE> accumulation space, add 2 <FOOD> to this card.'],
    altCosts: [{ wood: 2 }, { stone: 1 }],
    vp: 1,
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const B048_ForestStone_impl = B048_ForestStone.impl
