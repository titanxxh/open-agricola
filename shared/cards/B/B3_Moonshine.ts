import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { ensureCardState, readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { rollAndCacheCardPick } from '../helpers/card-random'
import { passOccupationToNextPlayer } from '../helpers/pass-occupation'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'B3_Moonshine'
const KEY_OCC = 'occ'

/**
 * B3 Moonshine (Minor, B, 3):
 *
 * onBuy → randomly pick one occupation from the player's hand via
 *   `rollAndCacheCardPick`, set pendingUndoBoundary so the roll cannot be
 *   undone, then emit a pending choice with two options:
 *     • play  — play that occupation for 2 FOOD (disabled when food < 2)
 *     • pass  — pass the occupation to the next player (or discard solo)
 *
 * resolveChoice:
 *   • 'play' → return a play-occupation leaf (costOverride: {food: 2},
 *               allowedCards: [pick]); the session auto-resolves the single-
 *               option choice emitted by play-occupation.
 *   • 'pass' → call passOccupationToNextPlayer inline (no follow-up flow).
 *
 * BGA reference: B3_Moonshine.php — NODE_SEQ with randomizeOcc then a
 * NODE_XOR over playOcc (OCCUPATION action, flat 2-food cost) / passOcc.
 *
 * Storage: the picked occupation ID is stored in two places so both the
 * typed resolveChoice helper (readCardExtraData → extraData.occ) and the
 * test assertion (cardStates[CARD_ID].occ) work correctly:
 *   • player.cardStates[CARD_ID].extraData.occ  (via rollAndCacheCardPick)
 *   • player.cardStates[CARD_ID].occ            (top-level mirror)
 */

registerCardEffect({
  id: CARD_ID,

  onBuy: (state, player) => {
    if (player.occupationHand.length === 0) return

    // Roll and cache via Task-1.1 helper (writes to extraData.occ).
    const pick = rollAndCacheCardPick(state, player, CARD_ID, KEY_OCC, player.occupationHand)

    // Mirror at top-level so tests can read cardStates[CARD_ID]?.occ directly.
    ;(ensureCardState(player, CARD_ID) as Record<string, unknown>)[KEY_OCC] = pick

    state.pendingUndoBoundary = true

    const canPlay = (player.resources.food ?? 0) >= 2

    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'noop',
      sourceCard: CARD_ID,
      params: {
        promptKey: 'cards.B3_Moonshine.choice',
        options: [
          {
            value: 'play',
            labelKey: 'cards.B3_Moonshine.choicePlay',
            sourceCard: CARD_ID,
            disabled: !canPlay,
            ...(canPlay ? {} : { disabledReasonKey: 'cards.B3_Moonshine.choicePlayDisabled' }),
          },
          {
            value: 'pass',
            labelKey: 'cards.B3_Moonshine.choicePass',
            sourceCard: CARD_ID,
          },
        ],
      },
    }
    return flow
  },

  resolveChoice: (state, player, choice, _ctx) => {
    const pick = readCardExtraData<string>(player, CARD_ID, KEY_OCC)
    if (!pick) return

    if (choice === 'play') {
      // Clear both storage locations.
      writeCardExtraData(player, CARD_ID, KEY_OCC, undefined)
      delete (player.cardStates?.[CARD_ID] as Record<string, unknown> | undefined)?.[KEY_OCC]

      return {
        type: 'leaf',
        actionId: 'play-occupation',
        sourceCard: CARD_ID,
        params: { costOverride: { food: 2 }, allowedCards: [pick] },
      } satisfies ActionFlow
    }

    if (choice === 'pass') {
      passOccupationToNextPlayer(state, player, pick)
      writeCardExtraData(player, CARD_ID, KEY_OCC, undefined)
      delete (player.cardStates?.[CARD_ID] as Record<string, unknown> | undefined)?.[KEY_OCC]
    }
  },
})

export const B3_Moonshine = new MinorImprovement({
  id: CARD_ID,
  name: 'Moonshine',
  deck: 'B',
  number: 3,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Randomly select an occupation in your hand. Either play it for an occupation cost of 2 <FOOD>, or give it to the next player.',
  ],
  cost: {},
  passing: true,
})
