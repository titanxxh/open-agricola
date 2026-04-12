import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'D36_BreedRegistry'

// Track sheep gained from non-breeding sources (collect action on sheep spaces)
const afterCollectListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const gained = context.result?.type === 'ok'
      ? (context.result.resourcesGained?.sheep ?? 0)
      : 0
    if (gained <= 0) return
    const current = readCardExtraData<number>(context.player, CARD_ID, 'sheepGained') ?? 0
    writeCardExtraData(context.player, CARD_ID, 'sheepGained', current + gained)
  },
}

// Track sheep-to-food conversion: snapshot sheep before exchange
const beforeExchangeListener: CardListenerRegistration = {
  id: 'D36-breed-registry-before-exchange',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['anytime-exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    writeCardExtraData(context.player, CARD_ID, 'sheepBeforeExchange', context.player.resources.sheep)
  },
}

// After exchange: if sheep count decreased, mark as converted
const afterExchangeListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['anytime-exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const sheepBefore = readCardExtraData<number>(context.player, CARD_ID, 'sheepBeforeExchange') ?? 0
    if (context.player.resources.sheep < sheepBefore) {
      writeCardExtraData(context.player, CARD_ID, 'sheepConverted', true)
    }
  },
}

registerCardListener(afterCollectListener)
registerCardListener(beforeExchangeListener)
registerCardListener(afterExchangeListener)

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const gained = readCardExtraData<number>(player, CARD_ID, 'sheepGained') ?? 0
    const converted = readCardExtraData<boolean>(player, CARD_ID, 'sheepConverted') ?? false
    if (converted) return 0
    return gained <= 2 ? 3 : 0
  },
})

export const D36_BreedRegistry = new MinorImprovement({
  id: CARD_ID,
  name: "Breed Registry",
  deck: "D",
  number: 36,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you gained at most 2 <SHEEP> from sources other than breeding during the game and have not turned any sheep into food, you get 3 bonus <SCORE>."],
  cost: {},
  prerequisite: "No Sheep",
})
