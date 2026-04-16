import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E51_WhaleOil'

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

// After using Fishing: place 1 food on this card
const fishingListener: CardListenerRegistration = {
  id: 'E51-whale-oil-after-collect-fishing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    // Check if this is the Fishing action space
    if (context.space?.id !== 'fishing') return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    const newCount = foodCount + 1
    writeCardExtraData(context.player, CARD_ID, 'foodCount', newCount)
    updateInfobox(context.player, newCount)
  },
}

// Before playing an occupation: get food equal to the amount on card
const occupationListener: CardListenerRegistration = {
  id: 'E51-whale-oil-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    writeCardExtraData(context.player, CARD_ID, 'foodCount', 0)
    updateInfobox(context.player, 0)
    return { flow: gainLeaf(CARD_ID, { food: foodCount }), sourceCard: CARD_ID }
  },
}

registerCardListener(fishingListener)
registerCardListener(occupationListener)

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'foodCount', 0)
    updateInfobox(player, 0)
  },
})

export const E51_WhaleOil = new MinorImprovement({
  id: CARD_ID,
  name: 'Whale Oil',
  deck: 'E',
  number: 51,
  category: 'FOOD',
  desc: ['Each time you use __Fishing__, place 1 <FOOD> from the general supply on this card. Each time before you play an occupation, you get <FOOD> equal to the amount on this card.'],
  cost: { wood: 1 },
})
