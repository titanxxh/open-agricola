import type { GameState, PlayerState, Resource } from '../../contract/types'
import { getCardEffect } from '../card-effects'

export function purchaseResourceGrants(
  state: GameState,
  player: PlayerState,
  cardId: string,
  kind: 'minor' | 'major',
) {
  return [
    ...new Set([
      ...(player.improvements ?? []),
      ...(player.minorPlayed ?? []),
      ...(player.occupationPlayed ?? []),
    ]),
  ].flatMap((sourceCard) => {
    const choices =
      getCardEffect(sourceCard)?.computePurchaseResourceGrants?.(state, player, { cardId, kind }) ??
      []
    return choices.length ? [{ sourceCard, choices }] : []
  })
}

/** Keep each attainable combination with its sources for preview and persisted execution. */
export function purchaseResourceGrantAlternatives(
  state: GameState,
  player: PlayerState,
  cardId: string,
  kind: 'minor' | 'major',
) {
  let projections: Array<{
    player: PlayerState
    grants: Array<{ sourceCard: string; resources: Partial<Resource> }>
  }> = [{ player, grants: [] }]
  for (const grant of purchaseResourceGrants(state, player, cardId, kind)) {
    projections = projections.flatMap((projected) =>
      grant.choices.map((choice) => {
        const resources = { ...projected.player.resources }
        for (const [key, value] of Object.entries(choice))
          if (value && value > 0)
            resources[key as keyof Resource] = (resources[key as keyof Resource] ?? 0) + value
        return {
          player: { ...projected.player, resources },
          grants: [...projected.grants, { sourceCard: grant.sourceCard, resources: choice }],
        }
      }),
    )
  }
  return projections
}

/** Affordability never sums mutually exclusive choices. */
export function projectPurchaseResourceGrants(
  state: GameState,
  player: PlayerState,
  cardId: string,
  kind: 'minor' | 'major',
): PlayerState[] {
  return purchaseResourceGrantAlternatives(state, player, cardId, kind).map((value) => value.player)
}
