import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B137_Wholesaler'

type WholesalerData = {
  vegetableTaken: boolean
  boarTaken: boolean
  stoneTaken: boolean
  cattleTaken: boolean
}

const INITIAL_DATA: WholesalerData = {
  vegetableTaken: false,
  boarTaken: false,
  stoneTaken: false,
  cattleTaken: false,
}

const getData = (context: CardListenerContext): WholesalerData =>
  readCardExtraData<WholesalerData>(context.player, CARD_ID, 'wholesaler') ?? { ...INITIAL_DATA }

/**
 * After using VegetableSeeds, gain 1 vegetable from card.
 */
const afterVegetableSeedsListener: CardListenerRegistration = {
  id: 'B137-wholesaler-after-vegetable-seeds',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'vegetable-seeds') return
    const data = getData(context)
    if (data.vegetableTaken) return
    data.vegetableTaken = true
    writeCardExtraData(context.player, CARD_ID, 'wholesaler', data)
    return {
      flow: gainLeaf(CARD_ID, { vegetable: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

/**
 * After using PigMarket, gain 1 boar from card.
 */
const afterPigMarketListener: CardListenerRegistration = {
  id: 'B137-wholesaler-after-pig-market',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'pig-market') return
    const data = getData(context)
    if (data.boarTaken) return
    data.boarTaken = true
    writeCardExtraData(context.player, CARD_ID, 'wholesaler', data)
    return {
      flow: gainLeaf(CARD_ID, { boar: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

/**
 * After using EasternQuarry, gain 1 stone from card.
 */
const afterEasternQuarryListener: CardListenerRegistration = {
  id: 'B137-wholesaler-after-eastern-quarry',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'eastern-quarry') return
    const data = getData(context)
    if (data.stoneTaken) return
    data.stoneTaken = true
    writeCardExtraData(context.player, CARD_ID, 'wholesaler', data)
    return {
      flow: gainLeaf(CARD_ID, { stone: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

/**
 * After using CattleMarket, gain 1 cattle from card.
 */
const afterCattleMarketListener: CardListenerRegistration = {
  id: 'B137-wholesaler-after-cattle-market',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'cattle-market') return
    const data = getData(context)
    if (data.cattleTaken) return
    data.cattleTaken = true
    writeCardExtraData(context.player, CARD_ID, 'wholesaler', data)
    return {
      flow: gainLeaf(CARD_ID, { cattle: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

export const B137_Wholesaler = new Occupation({
  id: CARD_ID,
  name: 'Wholesaler',
  deck: 'B',
  number: 137,
  category: 'GOODS_PROVIDER',
  desc: ['Place 1 <VEGETABLE>, 1 <PIG>, 1 <STONE>, and 1 <CATTLE> on this card. Each time you use an action space card on round spaces 8 to 11, you get the corresponding good from this card.'],
  cost: {},
  players: '3+',
})

export const B137_Wholesaler_impl = {
  listeners: [afterVegetableSeedsListener, afterPigMarketListener, afterEasternQuarryListener, afterCattleMarketListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'wholesaler', { ...INITIAL_DATA })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
