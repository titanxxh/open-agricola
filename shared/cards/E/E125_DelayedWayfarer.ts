import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E125_DelayedWayfarer'

/**
 * E125 Delayed Wayfarer (Occupation):
 *
 * BGA rule (E125_DelayedWayfarer.php):
 *   When you play this card, you immediately get 1 building resource of your
 *   choice and, once all people have been placed this round, you can place a
 *   person from your supply.
 *
 *   The "once all people have been placed" trigger in BGA is a deferred hook
 *   (canBeActivated + getExtraPlacementNode) that polls every player for
 *   remaining placements and fires when all placements are exhausted.
 *
 * SIMPLIFICATION:
 *   - onBuy: XOR choice of 1 building resource (wood/clay/reed/stone) —
 *     exactly mirrors the BGA gainNode XOR (lines 37-44).
 *   - Skip the "end of placements this round" deferred trigger. Instead,
 *     queue a future-meeple entry for the NEXT round so the player gets the
 *     extra placement opportunity at the start of that round (via
 *     onRoundStart), matching the D22 Work Permit pattern. This changes the
 *     timing from "end of this round's work phase" to "start of next round's
 *     work phase" but preserves the net "one extra farmer placement" reward.
 *
 *   Drops:
 *     - the within-same-round timing semantic
 *     - the "still in same turn" canBeActivated check (our placement fires
 *       on the subsequent round start regardless of activity)
 */

const buildingChoiceFlow = (): ActionFlow => ({
  type: 'xor',
  children: [
    gainLeaf(CARD_ID, { wood: 1 }),
    gainLeaf(CARD_ID, { clay: 1 }),
    gainLeaf(CARD_ID, { reed: 1 }),
    gainLeaf(CARD_ID, { stone: 1 }),
  ],
})

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const nextRound = state.round + 1
    if (nextRound > 14) {
      // No further rounds — only the building-resource gain applies.
      return buildingChoiceFlow()
    }
    // Queue an empty-resource future-meeple entry so onRoundStart fires next round.
    return {
      type: 'seq',
      children: [
        buildingChoiceFlow(),
        queueFutureMeeplesFlow(state, {
          cardId: CARD_ID,
          playerId: player.id,
          entries: [{ round: nextRound, resources: {} }],
        }),
      ],
    }
  },
  onRoundStart: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    // Only fire on the one round after the card was played; guard with flag
    // so it never repeats.
    if (isCardFlagged(player, CARD_ID)) return
    const matches = state.futureMeeples.some(
      (entry) =>
        entry.playerId === player.id &&
        entry.cardId === CARD_ID &&
        entry.round === state.round,
    )
    if (!matches) return
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
})

export const E125_DelayedWayfarer = new Occupation({
  id: CARD_ID,
  name: 'Delayed Wayfarer',
  deck: 'E',
  number: 125,
  category: 'BUILDING_RESOURCES_-_ALL',
  desc: [
    'When you play this card, you immediately get 1 building resource of your choice and, once all people have been placed this round, you can place a person from your supply.',
  ],
  cost: {},
  players: '1+',
})
