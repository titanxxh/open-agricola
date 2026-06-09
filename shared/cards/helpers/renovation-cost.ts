import type { Bonus, Resource } from '../../contract/types'
import { getRenovation } from '../../actions/effects/renovation'
import type { CardListenerContext } from '../card-listeners'

export const sourcedMandatoryBonus = (
  sourceId: string,
  discount: Partial<Resource>,
): Bonus => ({
  discount,
  optional: false,
  sources: [sourceId],
})

export const sourcedMandatoryBonusChoices = (
  sourceId: string,
  choices: Partial<Resource>[],
): Bonus => ({
  choices: choices.map((discount) => ({ discount, sources: [sourceId] })),
  optional: false,
  sources: [sourceId],
})

export const selectedRenovationTarget = (
  context: CardListenerContext,
): 'clay' | 'stone' | null => {
  const selected = (context.params as { selectedOption?: unknown } | undefined)?.selectedOption
  if (selected === 'clay' || selected === 'stone') return selected
  return getRenovation(context.player)?.nextType ?? null
}
