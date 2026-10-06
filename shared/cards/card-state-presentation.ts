import type { CardStatePresentation } from '../contract/card-state'
import type { PlayerState } from '../contract/types'
import { getCardEffect } from './card-effects'
import { normalizeCardStatePresentation } from '../projections/card-state-presentation'
import { getCardDefinitionById } from './helpers/card-type'
import { projectDeclaredCardState } from './helpers/state-presentation'

/** Called only by authoritative serialization; viewers consume the recorded facts. */
export const collectCardStatePresentation = (player: PlayerState): Record<string, CardStatePresentation> => {
  const presentation: Record<string, CardStatePresentation> = {}
  const sources = new Set([
    ...player.improvements, ...player.minorPlayed, ...player.occupationPlayed,
    ...Object.keys(player.cardStates ?? {}),
  ])
  for (const cardId of sources) {
    const query = getCardEffect(cardId)?.getStatePresentation
    // Registered metadata-only sources (including cookeries) still participate
    // in the explicit public infobox/resource-statistics adapter contract.
    if (!query && !getCardDefinitionById(cardId)) continue
    const input = JSON.parse(JSON.stringify(player)) as PlayerState
    const facts = normalizeCardStatePresentation(query ? query(input) : projectDeclaredCardState(input, cardId))
    if (Object.keys(facts).length > 0) presentation[cardId] = facts
  }
  return presentation
}
