import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { workersAvailable } from '../../game/player'

const CARD_ID = 'C22_BasketChair'

/**
 * C22 Basket Chair (Minor Improvement, Even More set):
 *
 * BGA rule (C22_BasketChair.php lines 24-27, 85-164):
 *   When you play this card, you can immediately move the first person you
 *   placed this work phase to this card (unless it is on Meeting Place).
 *   If you do, immediately afterward, you can place another person.
 *   The card is also a PlayerActionCard (can be re-activated via 'active' action
 *   during the SAME turn in which it was bought — see canBePlayed guard on
 *   turnId matching current Globals::getTurnId()).
 *
 * SIMPLIFICATION:
 *   Moving a farmer mid-phase and retroactively freeing an action space requires
 *   changes to core placement paths that are out of scope for a single-card
 *   simplification. We therefore skip the "move first farmer to this card" step.
 *   Instead, at the start of each round (during the work phase) we offer the
 *   owner one extra optional place-farmer leaf — modelling the "place another
 *   person" upside only. This matches the spirit of an ACTIONS_BOOSTER but
 *   drops:
 *     - the recall of the first-placed farmer
 *     - the Meeting Place exclusion (irrelevant once recall is dropped)
 *     - the "only usable on the turn the card was played" semantics
 *     - the Day Laborer / Job Contract fake meeple cleanup (lines 128-136)
 *
 *   Owner still gets the 1 VP from the card definition.
 *
 * Fires once per round (guarded via card flag + reset inside the same hook).
 * Mirrors A22 Telegram exactly for the "extra placement" grant mechanics.
 */
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (workersAvailable(state, player) <= 0) return
    if (isCardFlagged(player, CARD_ID)) {
      // Reset for next round (this fires at the very start of each round).
      setCardFlag(player, CARD_ID, false)
    }
    setCardFlag(player, CARD_ID, true)
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    }
  },
  onRoundEnd: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    // Explicit per-round reset so the flag doesn't leak across rounds.
    setCardFlag(player, CARD_ID, false)
  },
})

export const C22_BasketChair = new MinorImprovement({
  id: CARD_ID,
  name: 'Basket Chair',
  deck: 'C',
  number: 22,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you can immediately move the first person you placed this work phase to this card (unless it is on __Meeting Place__). If you do, immediately afterward, you can place another person.',
  ],
  cost: { reed: 1 },
  vp: 1,
  evenMoreSet: true,
})
