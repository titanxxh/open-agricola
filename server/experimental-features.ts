import type { TeamConfiguration } from '../shared/contract/team'
import {
  EXPERIMENTAL_FEATURES, isExperimentalFeatureAvailable, teamExperimentalFeatures,
  type ExperimentalFeatureId,
} from '../shared/contract/experimental-features'
import { isAdmin } from './auth'
import { getDb } from './db'
import type { PostgresDatabase } from './database/postgres'

export type ExperimentalFeatureAccess = (userId: string | undefined, feature: ExperimentalFeatureId) => Promise<boolean>
type AccountQualification = { isAdmin: boolean; betaAccess: boolean }

async function readAccountQualification(userId: string, db: PostgresDatabase): Promise<AccountQualification | null> {
  const account = await db.prepare(`SELECT u.username, b.user_id IS NOT NULL AS beta_access
    FROM users u LEFT JOIN beta_access b ON b.user_id=u.id WHERE u.id=?`).get<{ username: string; beta_access: boolean }>(userId)
  return account ? { isAdmin: isAdmin(account.username), betaAccess: account.beta_access } : null
}

const isAvailable = (feature: ExperimentalFeatureId, account: AccountQualification | null) => isExperimentalFeatureAvailable({
  stage: EXPERIMENTAL_FEATURES[feature],
  account,
  nodeEnv: process.env.NODE_ENV,
  devExperimentalFeatures: process.env.DEV_EXPERIMENTAL_FEATURES,
})

export async function canUseExperimentalFeature(userId: string | undefined, feature: ExperimentalFeatureId, db?: PostgresDatabase): Promise<boolean> {
  if (!userId) return false
  return isAvailable(feature, await readAccountQualification(userId, db ?? getDb()))
}

/** One fresh qualification read answers both Beta Access and every feature for `/api/auth/me`. */
export async function experimentalAccountState(userId: string, db?: PostgresDatabase): Promise<{
  betaAccess: boolean
  experimentalFeatures: ExperimentalFeatureId[]
}> {
  const account = await readAccountQualification(userId, db ?? getDb())
  const features = Object.keys(EXPERIMENTAL_FEATURES).filter(
    (feature): feature is ExperimentalFeatureId => Object.hasOwn(EXPERIMENTAL_FEATURES, feature),
  )
  return {
    betaAccess: !!account && (account.isAdmin || account.betaAccess),
    experimentalFeatures: features.filter(feature => isAvailable(feature, account)),
  }
}

export async function unavailableTeamFeature(userId: string | undefined, configuration: Pick<TeamConfiguration, 'cooperationRules'> | undefined, access: ExperimentalFeatureAccess = canUseExperimentalFeature): Promise<ExperimentalFeatureId | undefined> {
  for (const feature of teamExperimentalFeatures(configuration)) if (!await access(userId, feature)) return feature
  return undefined
}
