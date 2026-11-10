import type { TeamConfiguration } from './team'

export type ExperimentalFeatureId = 'team-modes' | 'team-cooperation-rules'
export type AvailabilityStage = 'off' | 'beta' | 'general'

export const EXPERIMENTAL_FEATURES: Readonly<Record<ExperimentalFeatureId, AvailabilityStage>> = {
  'team-modes': 'beta',
  'team-cooperation-rules': 'off',
}

export function isExperimentalFeatureAvailable({ stage, account, nodeEnv, devExperimentalFeatures }: {
  stage: AvailabilityStage
  account: { isAdmin: boolean; betaAccess: boolean } | null
  nodeEnv?: string
  devExperimentalFeatures?: string
}): boolean {
  if (!account) return false
  const effectiveStage = nodeEnv !== 'production' && devExperimentalFeatures !== 'declared' ? 'general' : stage
  return effectiveStage === 'general' || (effectiveStage === 'beta' && (account.isAdmin || account.betaAccess))
}

export const teamExperimentalFeatures = (configuration: Pick<TeamConfiguration, 'cooperationRules'> | undefined): ExperimentalFeatureId[] =>
  configuration ? ['team-modes', ...(configuration.cooperationRules ? ['team-cooperation-rules' as const] : [])] : []
