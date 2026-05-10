import { describe, expect, it } from 'vitest'
import { CardRegistry } from '../registry'
import type { PlayerState } from '../../contract/types'

const dummyPlayer = {} as PlayerState

describe('CardRegistry prereqChecksByCard', () => {
  it('loadImpl stores prerequisiteCheck', () => {
    const r = new CardRegistry()
    const fn = (_p: PlayerState) => true
    r.loadImpl('X1_Test', { prerequisiteCheck: fn })
    expect(r.getPrerequisiteCheck('X1_Test')).toBe(fn)
  })

  it('getPrerequisiteCheck returns undefined for unknown card', () => {
    const r = new CardRegistry()
    expect(r.getPrerequisiteCheck('X1_Test')).toBeUndefined()
  })

  it('unload removes prereq check', () => {
    const r = new CardRegistry()
    r.loadImpl('X1_Test', { prerequisiteCheck: () => false })
    r.unload('X1_Test')
    expect(r.getPrerequisiteCheck('X1_Test')).toBeUndefined()
  })

  it('clone copies prereq checks', () => {
    const r = new CardRegistry()
    const fn = (_p: PlayerState) => false
    r.loadImpl('X1_Test', { prerequisiteCheck: fn })
    const c = r.clone()
    expect(c.getPrerequisiteCheck('X1_Test')).toBe(fn)
  })

  it('hasCard true when only prereq check is registered', () => {
    const r = new CardRegistry()
    r.loadImpl('X1_Test', { prerequisiteCheck: () => true })
    expect(r.hasCard('X1_Test')).toBe(true)
  })

  it('snapshot reports prereqCheckCount', () => {
    const r = new CardRegistry()
    r.loadImpl('X1_A', { prerequisiteCheck: () => true })
    r.loadImpl('X2_B', { prerequisiteCheck: () => false })
    expect(r.snapshot().prereqCheckCount).toBe(2)
  })
})
