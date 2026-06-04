/**
 * Setup-phase pure helpers extracted from GameCore (S2 Task 9).
 *
 * Holds the side-effect-free portions of session bootstrap that don't
 * need direct access to GameCore's private engineStack / registry / state
 * fields. Constructor body still lives in GameCore (deeply coupled to
 * private initialization order); this module currently hosts only the
 * post-construction setup queries that GameCore can delegate to.
 *
 * Future expansion (Task 13 cleanup) may absorb `initActionRegistry`,
 * `initCardRegistry`, `initStateFromOptions` once GameCore exposes
 * read/write hooks for those fields.
 */

import type { PlayerState } from '../../contract/types.ts'
import type { CustomCardDef } from '../../contract/protocol/game.ts'
import type { SessionCardContext } from '../../cards/session-card-context.ts'

/**
 * Export the per-session custom-card definitions for the frontend. Pure
 * function over a SessionCardContext — no GameCore reference needed.
 */
export const getCustomCardDefs = (
  sessionCardContext: SessionCardContext | null,
): CustomCardDef[] => {
  if (!sessionCardContext) return []
  const defs: CustomCardDef[] = []
  const artUrls = sessionCardContext.customArtUrls
  for (const [id, card] of sessionCardContext.customMinors) {
    defs.push({ cardType: 'minor', cardJson: card, artUrl: artUrls.get(id) ?? null })
  }
  for (const [id, card] of sessionCardContext.customOccupations) {
    defs.push({ cardType: 'occupation', cardJson: card, artUrl: artUrls.get(id) ?? null })
  }
  return defs
}

/**
 * Apply a (possibly whitespace-padded) display name to a player. Trims
 * input and silently ignores empty strings — matches the legacy
 * GameCore.updatePlayerName behaviour.
 */
export const updatePlayerName = (
  player: PlayerState | undefined,
  name: string,
): void => {
  if (player && name.trim()) {
    player.name = name.trim()
  }
}
