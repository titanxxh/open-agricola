import { defineOccupationCard } from '../../card-source'
import { writeCardExtraData } from '../../helpers/card-state'
import { timedExtraTurnResolution } from '../../timed-rule-obligations'
import type { TimedRule } from '../../../contract/rule-plans'
import type { GuestPlacementScope } from '../../../contract/types'

const CARD_ID = 'CFL040_Anatomist'
const GUEST_ROUNDS = [7, 10, 13] as const
const roundFact = (round: number) => `guestRound${round}`
const ACCUMULATION: GuestPlacementScope = { kind: 'accumulation' }

/**
 * One Guest in each booked round, as an extra turn once the owner's people are
 * placed. It may only go to an accumulation space, and the owner may decline it.
 */
const guestRules = GUEST_ROUNDS.map((round) => ({
  key: `guest-round-${round}`,
  at: { kind: 'card-round', fact: roundFact(round), phase: 'contributeExtraTurn' },
  body: { kind: 'operation', operation: { kind: 'guest-placement', where: ACCUMULATION } },
}) satisfies TimedRule)

export const CFL040_Anatomist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Anatomist',
    deck: 'CFL',
    number: 40,
    desc: ['Place 1 guest token on each unrevealed round space for rounds 7, 10, and 13. At the start of each of those rounds, take the guest token. You must place it on an accumulation space on your last turn of that round.'],
    players: '1+',
  },
  impl: {
    effect: {
      id: CARD_ID,
      onBuy: (state, player) => {
        // Only round spaces not yet revealed get a Guest.
        for (const round of GUEST_ROUNDS) {
          if (round > state.round) writeCardExtraData(player, CARD_ID, roundFact(round), round)
        }
      },
      timedRules: guestRules,
      contributeExtraTurn: (state, player) => timedExtraTurnResolution(state, player, CARD_ID, guestRules),
      extraTurnGuest: { where: ACCUMULATION },
    },
  },
})
