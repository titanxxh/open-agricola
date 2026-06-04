import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { MajorCardData, MajorEffectHook } from './types'
import { majorCardDefinitionsList } from './generated'
import { majorCardSources } from './runtime.generated'

export const majorCardDefinitions: readonly MajorCardData[] =
  majorCardDefinitionsList.map((card) => {
    const source = majorCardSources.find((candidate) => candidate.meta.id === card.id)
    return {
      ...card,
      ...(source?.impl?.effect ?? {}),
    } as MajorCardData
  })

export const majorImprovementIds = majorCardDefinitions.map((card) => card.id)

const majorDefinitionMap = new Map<string, MajorCardData>(
  majorCardDefinitions.map((effect) => [effect.id, effect]),
)

export const getMajorCard = (id: string): MajorCardData | undefined =>
  majorDefinitionMap.get(id)

export const getMajorCardDisplay = getMajorCard

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
