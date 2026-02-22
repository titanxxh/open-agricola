import { describe, expect, it } from 'vitest'
import { actionDefinitions } from '../index'
import { actionHookPhases } from '../hooks'
import { buildHookMatrix } from '../hook-matrix'

describe('hook matrix', () => {
  it('covers all actions with all phases', () => {
    const matrix = buildHookMatrix(actionDefinitions)
    expect(matrix.length).toBe(actionDefinitions.length)
    matrix.forEach((entry) => {
      expect(entry.phases).toEqual(actionHookPhases)
    })
  })
})
