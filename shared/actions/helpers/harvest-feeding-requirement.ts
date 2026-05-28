import type { GameState, PlayerState } from '../../contract/types'
import { familySize, newbornCount } from '../../domain/player'

export type HarvestFeedingRequirementModifierContext = {
  state: GameState
  player: PlayerState
  familySize: number
  newbornCount: number
  baseRequired: number
}

export type HarvestFeedingRequirementModifier = (
  context: HarvestFeedingRequirementModifierContext,
) => number | undefined

const modifiers = new Map<string, HarvestFeedingRequirementModifier>()

const hasPlayedCard = (player: PlayerState, cardId: string): boolean =>
  (player.improvements ?? []).includes(cardId)
  || (player.minorPlayed ?? []).includes(cardId)
  || (player.occupationPlayed ?? []).includes(cardId)

export const registerHarvestFeedingRequirementModifier = (
  cardId: string,
  modifier: HarvestFeedingRequirementModifier,
) => {
  modifiers.set(cardId, modifier)
}

export const computeHarvestFeedingRequirement = (
  state: GameState,
  player: PlayerState,
): number => {
  const size = familySize(player)
  const newborns = Math.min(newbornCount(player), size)
  const baseRequired = Math.max(0, size * 2 - newborns)
  let required = baseRequired

  for (const [cardId, modifier] of modifiers) {
    if (!hasPlayedCard(player, cardId)) continue
    required += modifier({
      state,
      player,
      familySize: size,
      newbornCount: newborns,
      baseRequired,
    }) ?? 0
  }

  return Math.max(0, Math.floor(required))
}
