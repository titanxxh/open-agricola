import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'
import { registerCardEffect } from '../card-effects'
import { roundStageSlots } from '../../logic/state'

const CARD_ID = 'E101_Blighter'

const getRemainingFullStages = (round: number) => {
  let totalRounds = 0
  for (const slot of roundStageSlots) {
    totalRounds += slot.count
    if (round <= totalRounds) {
      return Math.max(0, 6 - slot.stage)
    }
  }
  return 0
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const bonusVp = getRemainingFullStages(state.round)
    if (bonusVp <= 0) return
    incCounter(player, CARD_ID, 'bonusVp', bonusVp)
  },
})

const listener: CardListenerRegistration = {
  id: 'E101-blighter-isdoable-occupation',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { doable: false }
  },
}

registerCardListener(listener)

export const E101_Blighter = new Occupation({
  id: CARD_ID,
  name: "Blighter",
  deck: "E",
  number: 101,
  category: "POINTS_PROVIDER",
  desc: ["When you play this card, you get a number of bonus points equal to the number of full stages still left to play. You may no longer play occupations."],
  cost: {},
  players: "1+",
})
