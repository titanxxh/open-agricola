import type { ActionFlow, GameState, PlayerState } from '../../../game/types'
import type { MajorCardEffect, MajorEffectHook } from './types'
import { basketmaker } from './basketmaker'
import { clayOven } from './clay-oven'
import { cookingHearth1, cookingHearth2 } from './cooking-hearth'
import { fireplace1, fireplace2 } from './fireplace'
import { joinery } from './joinery'
import { pottery } from './pottery'
import { stoneOven } from './stone-oven'
import { well } from './well'

export const majorCardEffects: MajorCardEffect[] = [
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

const majorEffectMap = new Map<string, MajorCardEffect>(
  majorCardEffects.map((effect) => [effect.id, effect]),
)

export const getMajorCardEffect = (id: string) => majorEffectMap.get(id)

export const applyMajorEffectForImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  hook: MajorEffectHook,
): ActionFlow | null => {
  const effect = majorEffectMap.get(improvementId)
  const handler = effect?.[hook]
  if (handler) {
    return handler(state, player) ?? null
  }
  return null
}

export const applyMajorEffectsForPlayer = (
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
