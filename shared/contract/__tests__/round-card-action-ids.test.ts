import { describe, expect, it } from 'vitest'

import { roundCardActionIds, roundStageActions, roundStageSlots } from '../state-constants'

describe('roundCardActionIds', () => {
  it('lists every round card once', () => {
    expect(roundCardActionIds).toHaveLength(14)
    expect(new Set(roundCardActionIds).size).toBe(14)
    expect([...roundCardActionIds].sort()).toEqual(Object.values(roundStageActions).flat().sort())
  })

  it('matches the fourteen round slots', () => {
    expect(roundStageSlots.reduce((total, { count }) => total + count, 0)).toBe(14)
  })
})
