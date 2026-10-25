import type { ActionChoiceOption } from '../../../shared/contract/types'
import { t, type Locale } from '../../../shared/i18n'
import { getParentCardDefinition, type FatherCardDefinition, type FatherReward, type MotherCardDefinition } from '../../../shared/parents'

export const getMotherCardText = (locale: Locale, card: MotherCardDefinition): string =>
  t(locale, `parentFaces.${card.id}.text`)

export const getFatherRequirementText = (locale: Locale, card: FatherCardDefinition, reward: FatherReward): string =>
  t(locale, `parentFaces.${card.id}.rewards.${reward.tier}.requirement`)

export const getFatherRewardText = (locale: Locale, card: FatherCardDefinition, reward: FatherReward): string =>
  t(locale, `parentFaces.${card.id}.rewards.${reward.tier}.reward`)

/** Translate only the tier already offered by the server; this does not evaluate eligibility. */
export const getParentFatherOptionText = (locale: Locale, option: ActionChoiceOption): string | undefined => {
  if (option.labelKey !== 'ui.cards.parentFatherComplete.tier') return undefined
  const card = getParentCardDefinition(option.sourceCard ?? '')
  if (card?.kind !== 'father') return undefined
  const reward = card.rewards.find((entry) => entry.tier === option.labelParams?.tier)
  if (!reward) return undefined
  return t(locale, option.labelKey, {
    tier: reward.tier,
    requirement: getFatherRequirementText(locale, card, reward),
    reward: getFatherRewardText(locale, card, reward),
  })
}
