import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { writeCardExtraData, writeCardInfobox } from '../helpers/card-state'

const CARD_ID = 'B23_FinalScenario'

/**
 * B23 Final Scenario:
 * Reveal the action space card for round 14. Only you can use it until round 14 starts.
 *
 * BGA:
 * - isBuyable: only if round < 14
 * - onBuy: reveal round 14 action space, set exclusive use to the buyer
 * - afterRevealAction (round 14): remove exclusive use
 *
 * Implementation limitations:
 * - Round action reveal and exclusive-use restriction are not yet supported in
 *   the engine's action space visibility/access system.
 * - We store the round 14 action space info in extraData so the infobox shows it.
 * - The exclusive use restriction is tracked via extraData but enforcement
 *   requires infrastructure changes to place-farmer action checking.
 *
 * Partial implementation: stores info, shows infobox, but can't enforce exclusivity.
 */

registerCardEffect({
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
})

export const B23_FinalScenario = new MinorImprovement({
  id: CARD_ID,
  name: 'Final Scenario',
  deck: 'B',
  number: 23,
  category: 'ACTIONS_BOOSTER',
  desc: ['Reveal the action space card for round 14. Only you can use it until round 14 starts.'],
  cost: {},
  prerequisite: 'Round 13 or Before',
  evenMoreSet: true,
})
