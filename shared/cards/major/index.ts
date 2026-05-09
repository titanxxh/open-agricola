import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { majorCardDisplayData } from '../../cards-display/major'
import type { MajorCardData, MajorEffectHook } from './types'
import { majorEffects } from './effects'

export const majorCardDefinitions: readonly MajorCardData[] =
  majorCardDisplayData.map((display) => ({
    ...display,
    ...(majorEffects[display.id] ?? {}),
  }))

const majorDefinitionMap = new Map<string, MajorCardData>(
  majorCardDefinitions.map((effect) => [effect.id, effect]),
)

/**
 * Lightweight major-only lookup. Server paths use the unified
 * `getCardDefinition` (which queries occupation / minor / major catalogs).
 * Card / frontend code that only needs majors metadata should import this
 * instead so vite tree-shaking can drop the rest of the catalog from the
 * client bundle (`getCardDefinition` triggers all three card-data sources
 * to be retained, ballooning the bundle).
 */
export const getMajorCard = (id: string): MajorCardData | undefined =>
  majorDefinitionMap.get(id)

const applyMajorEffectForImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  hook: MajorEffectHook,
): ActionFlow | null => {
  const effect = majorDefinitionMap.get(improvementId)
  const handler = effect?.[hook]
  if (handler) {
    return handler(state, player) ?? null
  }
  return null
}

const applyMajorEffectsForPlayer = (
  state: GameState,
  player: PlayerState,
  hook: MajorEffectHook,
) => {
  player.improvements.forEach((improvementId) => {
    applyMajorEffectForImprovement(state, player, improvementId, hook)
  })
}

export const applyMajorEffectsToAllPlayers = (
  state: GameState,
  hook: MajorEffectHook,
) => {
  state.players.forEach((player) => {
    applyMajorEffectsForPlayer(state, player, hook)
  })
}
