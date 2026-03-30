import { describe, expect, it } from 'vitest'

import { shouldSkipImmediateListenerLog } from '../card-listeners'

describe('shouldSkipImmediateListenerLog', () => {
  it('skips redundant gain logs for sourceCard gain flows', () => {
    expect(
      shouldSkipImmediateListenerLog({
        logKey: 'log.cardEffectGain',
        flow: {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1 },
          sourceCard: 'A55_JunkRoom',
        },
      }),
    ).toBe(true)
  })

  it('skips redundant take-from-card logs', () => {
    expect(
      shouldSkipImmediateListenerLog({
        logKey: 'log.cardEffectGain',
        flow: {
          type: 'leaf',
          actionId: 'take-from-card',
          params: { clay: 2 },
          sourceCard: 'C120_AgriculturalLabourer',
        },
      }),
    ).toBe(true)
  })

  it('does not skip custom logs for unrelated actions', () => {
    expect(
      shouldSkipImmediateListenerLog({
        logKey: 'log.cardEffectTrigger',
        flow: {
          type: 'leaf',
          actionId: 'return-first-worker-home',
          sourceCard: 'D150_GodlySpouse',
        },
      }),
    ).toBe(false)
  })

  it('does not skip logs when the flow has no source card', () => {
    expect(
      shouldSkipImmediateListenerLog({
        logKey: 'log.cardEffectGain',
        flow: {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1 },
        },
      }),
    ).toBe(false)
  })
})
