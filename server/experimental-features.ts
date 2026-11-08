import {
  EXPERIMENTAL_FEATURES, isExperimentalFeatureAvailable,
  type ExperimentalFeatureId,
} from '../shared/contract/experimental-features'
import { isAdmin } from './auth'
import { getDb } from './db'
import type { PostgresDatabase } from './database/postgres'

export type ExperimentalFeatureAccess = (userId: string | undefined, feature: ExperimentalFeatureId) => Promise<boolean>

export async function canUseExperimentalFeature(userId: string | undefined, feature: ExperimentalFeatureId, db?: PostgresDatabase): Promise<boolean> {
  if (!userId) return false
  const account = await (db ?? getDb()).prepare(`SELECT u.username, b.user_id IS NOT NULL AS beta_access
    FROM users u LEFT JOIN beta_access b ON b.user_id=u.id WHERE u.id=?`).get<{ username: string; beta_access: boolean }>(userId)
  return isExperimentalFeatureAvailable({
    stage: EXPERIMENTAL_FEATURES[feature],
    account: account ? { isAdmin: isAdmin(account.username), betaAccess: account.beta_access } : null,
    nodeEnv: process.env.NODE_ENV,
    devExperimentalFeatures: process.env.DEV_EXPERIMENTAL_FEATURES,
  })
}

export async function availableExperimentalFeatures(userId: string): Promise<ExperimentalFeatureId[]> {
  const features = Object.keys(EXPERIMENTAL_FEATURES).filter(
    (feature): feature is ExperimentalFeatureId => Object.hasOwn(EXPERIMENTAL_FEATURES, feature),
  )
  const available: ExperimentalFeatureId[] = []
  for (const feature of features) if (await canUseExperimentalFeature(userId, feature)) available.push(feature)
  return available
}
