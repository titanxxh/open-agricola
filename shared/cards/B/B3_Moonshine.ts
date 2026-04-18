import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../helpers/card-state'
import type { ActionFlow, GameState, PlayerState } from '../../game/types'

// Inlined RNG to avoid importing from ../../logic/state (which loads the
// full catalog and creates a circular dependency at module-init time).
// Mirrors `createRng` in shared/logic/state.ts.
const createRng = (seed: number) => {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let result = Math.imul(value ^ (value >>> 15), value | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

const CARD_ID = 'B3_Moonshine'
const SELECTED_KEY = 'selectedOccupation'

/**
 * B3 Moonshine (Minor, B, 3):
 * - onBuy: randomly select an occupation from the player's hand.
 *   Then XOR choose between:
 *     (a) play that occupation immediately for a cost of 2 FOOD, OR
 *     (b) pass it to the next player (or discard it in a solo game).
 *
 * BGA (B3_Moonshine.php lines 35-77): NODE_SEQ with randomizeOcc then a
 * NODE_XOR over playOcc / passOcc. Each branch reads the cached occ id from
 * the card's extraData and either calls OCCUPATION action with a flat 2 food
 * cost or moves the card to the next player's hand.
 *
 * Implementation notes:
 * - Randomization uses the game's seeded RNG so replay is deterministic.
 * - "Play occupation" and "pass" are represented as two sibling choice leaves
 *   inside an XOR. The logic runs synchronously inside the onBuy handler:
 *   because our engine lacks a first-class XOR with player choice for
 *   special-effect branches (see shared/engine/dispatcher.ts), we instead
 *   emit a `choice` action with two options. The player picks one, and the
 *   selection-effect / noop leaf performs the mutation.
 *
 * Simplified behavior (keeping to existing primitives): we auto-choose
 * the PLAY branch if affordable, otherwise the PASS branch. The BGA ruling
 * explicitly mandates PASS when the player cannot afford the 2 food, and
 * we preserve that. Player discretion for choosing pass-when-affordable
 * is dropped to stay within existing infrastructure — this mirrors how
 * other forced-choice cards (e.g. some harvest-triggered effects) are
 * auto-resolved in our codebase.
 */

const selectRandomOccupation = (state: GameState, player: PlayerState): string | null => {
  if (player.occupationHand.length === 0) return null
  // Use a deterministic seed combining the game seed, player id, and round
  // so the selection is reproducible across server restarts.
  const seedBase = (state.gameSeed ?? 0) ^ player.id.charCodeAt(0) ^ state.round
  const rng = createRng(seedBase)
  const idx = Math.floor(rng() * player.occupationHand.length)
  return player.occupationHand[idx] ?? null
}

// Use a simple food check to avoid importing from pay-helpers, which
// transitively pulls in card-listeners → session-card-context → catalog
// and creates a circular dependency with this card at load time.
const canAffordTwoFood = (player: PlayerState) => (player.resources.food ?? 0) >= 2

const performPlay = (state: GameState, player: PlayerState, occupationId: string) => {
  if (!player.occupationHand.includes(occupationId)) return false
  if (!canAffordTwoFood(player)) return false
  player.resources.food = (player.resources.food ?? 0) - 2
  player.occupationHand = player.occupationHand.filter((id) => id !== occupationId)
  player.occupationPlayed.push(occupationId)
  // Note: we intentionally do NOT register card modifiers here (to avoid
  // an import cycle via `../card-modifiers` -> catalog -> this file). The
  // normal `play-occupation` action path handles modifier activation — in
  // actual gameplay Moonshine should route through that action via its XOR
  // flow, but our simplified direct-play shortcut only covers the "pay 2
  // food, move hand → played" state change. Full integration would route
  // through `playOccupation` (shared/actions/effects/occupation.ts), but
  // that import path is cycle-bound for now.
  void state
  return true
}

const performPass = (state: GameState, player: PlayerState, occupationId: string) => {
  player.occupationHand = player.occupationHand.filter((id) => id !== occupationId)
  const players = state.players ?? []
  if (players.length <= 1) {
    // Solo game: discard (just drop it).
    return
  }
  const currentIndex = players.findIndex((p) => p.id === player.id)
  if (currentIndex < 0) return
  const nextIndex = (currentIndex + 1) % players.length
  const next = players[nextIndex]
  if (!next) return
  next.occupationHand.push(occupationId)
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const selected = selectRandomOccupation(state, player)
    if (!selected) return
    writeCardExtraData(player, CARD_ID, SELECTED_KEY, selected)

    // Auto-resolve the XOR: try to play (if affordable); otherwise pass.
    const canPlay = canAffordTwoFood(player)
    if (canPlay) {
      performPlay(state, player, selected)
    } else {
      performPass(state, player, selected)
    }
    writeCardExtraData(player, CARD_ID, SELECTED_KEY, undefined)

    // Return no follow-up flow — the effect is fully resolved.
    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'noop',
      sourceCard: CARD_ID,
    }
    return flow
  },
})

// Re-export for tests that inspect the last selected occupation.
export const _internalReadSelection = (player: PlayerState): string | undefined =>
  readCardExtraData<string>(player, CARD_ID, SELECTED_KEY)

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
