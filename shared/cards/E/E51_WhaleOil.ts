import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E51_WhaleOil } from '../../cards-display/E/E51_WhaleOil'

const CARD_ID = E51_WhaleOil.id

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

const fishingListener: CardListenerRegistration = {
  id: 'E51-whale-oil-after-collect-fishing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Check if this is the Fishing action space
    if (context.space?.id !== 'fishing') return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    const newCount = foodCount + 1
    writeCardExtraData(context.player, CARD_ID, 'foodCount', newCount)
    updateInfobox(context.player, newCount)
  },
}

const occupationListener: CardListenerRegistration = {
  id: 'E51-whale-oil-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    writeCardExtraData(context.player, CARD_ID, 'foodCount', 0)
    updateInfobox(context.player, 0)
    return { flow: gainLeaf(CARD_ID, { food: foodCount }), sourceCard: CARD_ID }
  },
}

export const E51_WhaleOil_impl = {
  listeners: [fishingListener, occupationListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'foodCount', 0)
    updateInfobox(player, 0)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
