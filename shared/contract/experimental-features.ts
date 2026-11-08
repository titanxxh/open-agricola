export type ExperimentalFeatureId = 'team-modes'
export type AvailabilityStage = 'off' | 'beta' | 'general'

export const EXPERIMENTAL_FEATURES: Readonly<Record<ExperimentalFeatureId, AvailabilityStage>> = {
  'team-modes': 'beta',
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
