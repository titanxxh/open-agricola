import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B137_Wholesaler } from '../../cards-display/B/B137_Wholesaler'

const CARD_ID = B137_Wholesaler.id

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

const setWholesalerDataLeaf = (value: WholesalerData): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: 'wholesaler', value },
})

const takeRewardFlow = (value: WholesalerData, reward: Parameters<typeof gainLeaf>[1]): ActionFlow => ({
  type: 'seq',
  children: [
    setWholesalerDataLeaf(value),
    gainLeaf(CARD_ID, reward),
  ],
})

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
    return {
      flow: takeRewardFlow({ ...data, vegetableTaken: true }, { vegetable: 1 }),
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
    return {
      flow: takeRewardFlow({ ...data, boarTaken: true }, { boar: 1 }),
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
    return {
      flow: takeRewardFlow({ ...data, stoneTaken: true }, { stone: 1 }),
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
    return {
      flow: takeRewardFlow({ ...data, cattleTaken: true }, { cattle: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

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
