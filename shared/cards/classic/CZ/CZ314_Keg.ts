import { defineMinorCard } from '../../card-source'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { grantGuestLeaf } from '../../helpers/guest-flow'
import { isWorkEndWindowOpen } from '../../../domain/guests'
import type { TimedRule } from '../../../contract/rule-plans'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CZ314_Keg'
const PLAYED_ROUND_KEY = 'playedRound'
/** Each purchase in the round books its own Guest; a player can buy the passed card again before the window. */
const GUESTS_KEY = 'guests'

/** Once everyone has placed, the buyer may place a Guest. It stays the buyer's after the card is passed on. */
const workEndGuest = {
  retainAfterCardLeaves: true,
  key: 'work-end-guest',
  at: { kind: 'card-round', fact: PLAYED_ROUND_KEY, phase: 'onAllWorkersPlaced' },
  body: { kind: 'operation', operation: { kind: 'guest-placement', countFact: GUESTS_KEY } },
} satisfies TimedRule

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      // Bought within the work-end window, everyone has already placed: the Guest comes now.
      if (isWorkEndWindowOpen(state)) return grantGuestLeaf(CARD_ID)
      const booked = readCardExtraData<unknown>(player, CARD_ID, PLAYED_ROUND_KEY) === state.round
      const guests = readCardExtraData<unknown>(player, CARD_ID, GUESTS_KEY)
      writeCardExtraData(player, CARD_ID, PLAYED_ROUND_KEY, state.round)
      writeCardExtraData(player, CARD_ID, GUESTS_KEY, booked && typeof guests === 'number' ? guests + 1 : 1)
    },
    timedRules: [workEndGuest],
  },
} satisfies CardImpl

export const CZ314_Keg = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Keg',
    deck: 'CZ',
    number: 314,
    desc: ['After everyone has placed their people this round, you may place a Guest to take an extra action. Pass this card to the player on your left to add to their hand.'],
    cost: { wood: 1 },
    passing: true,
    implemented: true,
  },
  impl: cardImpl,
})

export const CZ314_Keg_impl = CZ314_Keg.impl
