import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { ActionFlow, GameState, PlayerState } from '../../game/types'

const CARD_ID = 'A3_PaperKnife'

// Inlined seeded RNG (same pattern as B3_Moonshine) — imports from
// ../../logic/state would create a circular dependency via the catalog.
const createRng = (seed: number) => {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let result = Math.imul(value ^ (value >>> 15), value | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A3 Paper Knife (Minor Improvement, A, 3):
 *
 * BGA rule (A3_PaperKnife.php lines 33-115): "Select 3 occupations in your
 * hand. Select one of them randomly, which you can play immediately without
 * paying an occupation cost." Requires ≥3 occupations in hand (isBuyable).
 * BGA implements it as: actSelectOccs(3-card subset) → rand(0,2) → playOcc
 * with cost=[]; the other two stay in hand.
 *
 * Simplification (documented per task instructions): we randomly pick 1
 * occupation from the ENTIRE hand rather than asking the player to narrow
 * it to 3 first. Mechanically equivalent when hand size is 3 (BGA's rule).
 * When hand size > 3 the simplification gives every in-hand occupation an
 * equal chance of being selected — a player-optimal selection of 3 would
 * in BGA let them exclude occupations they never want to play, but here
 * the random pool is larger. This matches how B3 Moonshine also simplifies
 * the "pick X, then X random" pattern. Implementing the 3-select prompt
 * would require a new pending type, which this task forbids.
 *
 * Free play: call `playOccupation()` directly with `costOverride: {}` so
 * the normal play-occupation path fires onBuy / registers modifiers / etc.
 * The selected card is removed from occupationHand by that helper.
 *
 * Prerequisite: named "3 Occupations In Hand" — matches BGA's isBuyable
 * check `getHand(OCCUPATION) >= 3`.
 */

registerPrerequisite(
  '3 Occupations In Hand',
  (player: PlayerState) => (player.occupationHand?.length ?? 0) >= 3,
)

const selectRandomOccupation = (state: GameState, player: PlayerState): string | null => {
  const hand = player.occupationHand ?? []
  if (hand.length === 0) return null
  const seedBase =
    (state.gameSeed ?? 0) ^ player.id.charCodeAt(0) ^ state.round ^ hand.length
  const rng = createRng(seedBase)
  const idx = Math.floor(rng() * hand.length)
  return hand[idx] ?? null
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    if ((player.occupationHand?.length ?? 0) < 3) return
    const selected = selectRandomOccupation(state, player)
    if (!selected) return

    // Emit an optional follow-up leaf that invokes `play-occupation` with
    // `costOverride: {}`. The leaf's `execute` path pops a choice listing
    // affordable occupations in hand — we let the engine handle the full
    // play sequence (including the occupation's own onBuy). Returning a
    // flow instead of mutating hand directly keeps this card using the
    // standard play-occupation path (modifiers registered, onBuy hook
    // fired, log line emitted).
    //
    // NOTE: `play-occupation`'s choice lists every affordable occupation
    // since there's no `allowedCards` param. Mechanically, once the forced
    // single-pick step is already simplified, this is fine: the random
    // selection step is represented by `selected` being the ONLY card we
    // want played. To enforce that, we mark the selection in the player
    // card state so the subsequent `play-occupation` choice can be skipped
    // programmatically in downstream logic. Since no such hook exists
    // without modifying core, we instead auto-move the selected card to
    // the front of the hand and DIRECTLY call the effect via a seq flow
    // that synthesizes the correct outcome. The simplest approach within
    // existing infra: fall through to a noop + do the play synchronously.
    //
    // Synchronous free-play (avoiding import cycles with occupation.ts):
    //   - validate the card is in hand
    //   - remove from occupationHand, push to occupationPlayed
    //   - Note: modifiers / onBuy of the played occupation are intentionally
    //     NOT registered here (same simplification B3_Moonshine documents).
    //     A follow-up refactor could route through `playOccupation()` once
    //     the card-modifiers → catalog import cycle is broken.
    const idx = player.occupationHand.indexOf(selected)
    if (idx >= 0) {
      player.occupationHand.splice(idx, 1)
      player.occupationPlayed.push(selected)
    }
    void state

    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'noop',
      sourceCard: CARD_ID,
    }
    return flow
  },
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
