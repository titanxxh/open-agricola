import { writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { B23_FinalScenario } from '../../cards-display/B/B23_FinalScenario'

const CARD_ID = B23_FinalScenario.id

registerPrerequisite('Round 13 or Before', (_player, state) => {
  if (!state) return true
  return state.round <= 13
})

export const B23_FinalScenario_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Only works before round 14
    if (state.round >= 14) return
    const round14SpaceId = state.roundActionOrder[13]
    if (round14SpaceId) {
      writeCardExtraData(player, CARD_ID, 'round14Space', round14SpaceId)
      writeCardExtraData(player, CARD_ID, 'exclusiveOwnerId', player.id)
      writeCardInfobox(player, CARD_ID, `Round 14: ${round14SpaceId}`)
    }
  },
  onRoundStart: (state, player) => {
    // When round 14 starts, remove exclusive use
    if (state.round === 14) {
      writeCardExtraData(player, CARD_ID, 'exclusiveOwnerId', null)
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
