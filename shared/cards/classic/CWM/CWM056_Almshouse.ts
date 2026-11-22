import { defineMinorCard } from '../../card-source'
import type { GameState, PlayerState } from '../../../contract/types'
import type { CardImpl } from '../../registry'
import { payLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM056_Almshouse'

/** Begging cards received for feeding and not yet discarded, read in order: a discard
 * before any feeding marker exists removes a card-issued marker, not a later feeding one. */
const feedingBeggingRemaining = (state: GameState, player: PlayerState): number =>
  state.events.reduce((count, event) => {
    if (event.type !== 'resource.paid' || event.actorPlayerId !== player.id) return count
    const amount = event.resources.begging ?? 0
    return Math.max(0, count + (event.paymentFor === 'feeding' ? amount : -amount))
  }, 0)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onEndHarvestFeedingPhase: (state, player) =>
      player.resources.begging > 0 && feedingBeggingRemaining(state, player) > 0
        ? payLeaf({ cardId: CARD_ID, cost: { begging: 1 } })
        : undefined,
  },
} satisfies CardImpl

export const CWM056_Almshouse = defineMinorCard({
  meta: {
    id: 'CWM056_Almshouse',
    name: "Almshouse",
    deck: 'CWM',
    number: 56,
    desc: ["After each harvest feeding phase, you may discard 1 begging card received in any harvest for failing to feed your family."],
    cost: {
      reed: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM056.png',
  },
  impl: cardImpl,
})

export const CWM056_Almshouse_impl = CWM056_Almshouse.impl
