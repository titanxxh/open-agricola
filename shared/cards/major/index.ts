import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { MajorCardData, MajorEffectHook } from './types'
import { basketmaker } from './basketmaker'
import { clayOven } from './clay-oven'
import { cookingHearth1, cookingHearth2 } from './cooking-hearth'
import { fireplace1, fireplace2 } from './fireplace'
import { joinery } from './joinery'
import { pottery } from './pottery'
import { stoneOven } from './stone-oven'
import { well } from './well'

export const majorCardDefinitions: MajorCardData[] = [
  fireplace1,
  fireplace2,
  cookingHearth1,
  cookingHearth2,
  clayOven,
  stoneOven,
  well,
  joinery,
  pottery,
  basketmaker,
]

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
