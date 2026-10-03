import type { ActionChoiceOption } from '../../../shared/contract/types'
import { t, type Locale } from '../../../shared/i18n'
import { getParentCardDefinition, type FatherCardDefinition, type FatherReward, type MotherCardDefinition } from '../../../shared/parents'

export const getMotherCardText = (locale: Locale, card: MotherCardDefinition): string => {
  if (locale === 'en') return card.text
  const { gain, round } = card
  const params = { round, amount: gain.amount }
  if (gain.type === 'resource') {
    return t(locale, 'ui.parentCard.motherResourceText', {
      ...params,
      resource: t(locale, `resources.${gain.resource}`),
    })
  }
  const key = gain.type === 'field'
    ? 'motherFieldText'
    : gain.freeBuild ? 'motherFreeStableText' : 'motherStableText'
  return t(locale, `ui.parentCard.${key}`, params)
}

export const getFatherRequirementText = (
  locale: Locale,
  card: FatherCardDefinition,
  reward: FatherReward,
): string => {
  if (locale === 'en' || !('amount' in reward.requirement)) return reward.requirementText
  return t(locale, `ui.parentCard.fatherRequirement.${card.id}`, { amount: reward.requirement.amount })
}

export const getFatherRewardText = (
  locale: Locale,
  card: FatherCardDefinition,
  reward: FatherReward,
): string => {
  if (locale === 'en') return reward.rewardText
  if (reward.effects.every((effect) => effect.type === 'gain-resources')) {
    const resources = reward.effects.flatMap((effect) =>
      effect.type === 'gain-resources'
        ? Object.entries(effect.resources).map(([resource, amount]) => `${amount} ${t(locale, `resources.${resource}`)}`)
        : [],
    ).join(t(locale, 'ui.parentCard.fatherReward.resourceJoin'))
    return t(locale, 'ui.parentCard.fatherReward.resources', { resources })
  }
  const key = card.id === 'PS03' ? `PS03.tier${reward.tier}` : card.id
  return t(locale, `ui.parentCard.fatherReward.${key}`, { tier: reward.tier })
}

/** Translate only the tier already offered by the server; this does not evaluate eligibility. */
export const getParentFatherOptionText = (locale: Locale, option: ActionChoiceOption): string | undefined => {
  if (locale === 'en' || option.labelKey !== 'ui.cards.parentFatherComplete.tier') return undefined
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
