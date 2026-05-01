import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { rollAndCacheCardPick } from '../helpers/card-random'
import type { ActionFlow, PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A3_PaperKnife'
const KEY_PICK = 'pick'
const EFFECT_ID = 'paper-knife-random-play'

/**
 * A3 Paper Knife (Minor Improvement, A, 3):
 *
 * BGA rule (A3_PaperKnife.php lines 33-115): "Select 3 occupations in your
 * hand. Select one of them randomly, which you can play immediately without
 * paying an occupation cost." Requires ≥3 occupations in hand (isBuyable).
 * BGA implements it as: actSelectOccs(3-card subset) → rand(0,2) → playOcc
 * with cost=[]; the other two stay in hand.
 *
 * Flow:
 *   onBuy → emit 'selection' leaf (occupation-hand, min=max=3, selectionEffect=EFFECT_ID)
 *   resolveChoice(3 ids) → selectionEffect fires:
 *     rollAndCacheCardPick → stores pick in cardStates[CARD_ID].extraData.pick
 *     state.pendingUndoBoundary = true
 *     returns play-occupation leaf { costOverride: {}, allowedCards: [pick] }
 *   play-occupation auto-resolves (single option) → occupation played for free + onBuy fires
 *
 * Prerequisite: named "3 Occupations In Hand" — matches BGA's isBuyable
 * check `getHand(OCCUPATION) >= 3`.
 */

registerPrerequisite(
  '3 Occupations In Hand',
  (player: PlayerState) => (player.occupationHand?.length ?? 0) >= 3,
)

registerSelectionEffect(EFFECT_ID, ({ state, player, positions, sourceCard }): ActionFlow | void => {
  if (!sourceCard || sourceCard !== CARD_ID) return
  if (positions.length !== 3) return
  const pick = rollAndCacheCardPick(state, player, CARD_ID, KEY_PICK, positions)
  state.pendingUndoBoundary = true
  return {
    type: 'leaf',
    actionId: 'play-occupation',
    sourceCard: CARD_ID,
    params: { costOverride: {}, allowedCards: [pick] },
  }
})

export const A3_PaperKnife = new MinorImprovement({
  id: CARD_ID,
  name: 'Paper Knife',
  deck: 'A',
  number: 3,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Select 3 occupations in your hand. Select one of them randomly, which you can play immediately without paying an occupation cost.',
  ],
  cost: { wood: 1 },
  passing: true,
  prerequisite: '3 Occupations In Hand',
})

export const A3_PaperKnife_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player): ActionFlow | void => {
    if ((player.occupationHand?.length ?? 0) < 3) return
    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      actionContext: {
        selectionKind: 'occupation-hand',
        selectableCards: [...player.occupationHand],
        minSelections: 3,
        maxSelections: 3,
        selectionEffect: EFFECT_ID,
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
