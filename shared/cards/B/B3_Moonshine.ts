import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { rollAndCacheCardPick } from '../helpers/card-random'
import { passOccupationToNextPlayer } from '../helpers/pass-occupation'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'B3_Moonshine'
const KEY_OCC = 'occ'

/**
 * B3 Moonshine (Minor, B, 3):
 *
 * onBuy → randomly pick one occupation from the player's hand via
 *   `rollAndCacheCardPick` (writes to player.cardStates[CARD_ID].extraData.occ),
 *   set pendingUndoBoundary so the roll cannot be undone, then emit a pending
 *   choice (via `emit-choice` leaf) with two options:
 *     • play  — play that occupation for 2 FOOD (disabled when food < 2)
 *     • pass  — pass the occupation to the next player (or discard solo)
 *
 * resolveChoice (CardEffect hook, called from GameSession.resolvePendingChoice):
 *   • 'play' → return a play-occupation leaf (costOverride: {food: 2},
 *               allowedCards: [pick]); the session auto-resolves the single-
 *               option choice emitted by play-occupation.
 *   • 'pass' → call passOccupationToNextPlayer inline (no follow-up flow).
 *
 * BGA reference: B3_Moonshine.php — NODE_SEQ with randomizeOcc then a
 * NODE_XOR over playOcc (OCCUPATION action, flat 2-food cost) / passOcc.
 *
 * Storage: the picked occupation ID lives at
 *   player.cardStates[CARD_ID].extraData.occ  (written by rollAndCacheCardPick)
 * Access it via readCardExtraData / writeCardExtraData.
 */

registerCardEffect({
  id: CARD_ID,

  onBuy: (state, player) => {
    if (player.occupationHand.length === 0) return

    // Roll and cache via Task-1.1 helper (writes to extraData.occ).
    rollAndCacheCardPick(state, player, CARD_ID, KEY_OCC, player.occupationHand)

    state.pendingUndoBoundary = true

    const canPlay = (player.resources.food ?? 0) >= 2

    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'emit-choice',
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
      writeCardExtraData(player, CARD_ID, KEY_OCC, undefined)
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
