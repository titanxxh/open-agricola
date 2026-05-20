import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { rollAndCacheCardPick } from '../helpers/card-random'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A3_PaperKnife } from '../../cards-display/A/A3_PaperKnife'

const CARD_ID = A3_PaperKnife.id

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

registerSelectionEffect(EFFECT_ID, ({ state, player, positions, cards, sourceCard }): ActionFlow | void => {
  if (!sourceCard || sourceCard !== CARD_ID) return
  const selected = cards.length > 0 ? cards : positions
  if (selected.length !== 3) return
  const pick = rollAndCacheCardPick(state, player, CARD_ID, KEY_PICK, selected)
  state.pendingUndoBoundary = true
  return {
    type: 'leaf',
    actionId: 'play-occupation',
    sourceCard: CARD_ID,
    params: { costOverride: {}, allowedCards: [pick] },
  }
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
  prerequisiteCheck: (player: PlayerState) => (player.occupationHand?.length ?? 0) >= 3,
  reaches: [] as readonly string[],
} satisfies CardImpl
