import { describe, expect, it } from 'vitest'
import { isExperimentalFeatureAvailable, type AvailabilityStage } from '../experimental-features'

const accounts = [
  { name: 'anonymous', account: null },
  { name: 'ordinary', account: { isAdmin: false, betaAccess: false } },
  { name: 'beta', account: { isAdmin: false, betaAccess: true } },
  { name: 'admin', account: { isAdmin: true, betaAccess: false } },
]
const rows: Array<{ stage: AvailabilityStage; declared: boolean[] }> = [
  { stage: 'off', declared: [false, false, false, false] },
  { stage: 'beta', declared: [false, false, true, true] },
  { stage: 'general', declared: [false, true, true, true] },
]
const development = [false, true, true, true]

describe('experimental feature availability', () => {
  for (const { stage, declared } of rows) for (const [index, { name, account }] of accounts.entries()) {
    it(`${stage} for ${name} follows production declarations and development defaults`, () => {
      expect(isExperimentalFeatureAvailable({ stage, account, nodeEnv: 'production' })).toBe(declared[index])
      expect(isExperimentalFeatureAvailable({ stage, account, nodeEnv: 'production', devExperimentalFeatures: 'general' })).toBe(declared[index])
      expect(isExperimentalFeatureAvailable({ stage, account, nodeEnv: 'test' })).toBe(development[index])
      expect(isExperimentalFeatureAvailable({ stage, account, nodeEnv: 'development', devExperimentalFeatures: 'declared' })).toBe(declared[index])
    })
  }
})
