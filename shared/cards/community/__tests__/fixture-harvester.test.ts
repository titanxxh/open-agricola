import { describe, it, expect } from 'vitest'
import { CUSTOM_FixtureHarvester, CUSTOM_FixtureHarvester_impl } from '../CUSTOM_FixtureHarvester'

describe('CUSTOM_FixtureHarvester — community deck fixture', () => {
  it('exports a MinorImprovement with deck=community', () => {
    expect(CUSTOM_FixtureHarvester).toBeDefined()
    expect(CUSTOM_FixtureHarvester.id).toBe('CUSTOM_FixtureHarvester')
    expect(CUSTOM_FixtureHarvester.deck).toBe('community')
    expect(CUSTOM_FixtureHarvester.name).toBeTruthy()
  })

  it('exports a CardImpl with an onHarvest hook', () => {
    expect(CUSTOM_FixtureHarvester_impl).toBeDefined()
    expect(CUSTOM_FixtureHarvester_impl.effect?.id).toBe('CUSTOM_FixtureHarvester')
    expect(typeof CUSTOM_FixtureHarvester_impl.effect?.onHarvest).toBe('function')
  })

  it('onHarvest returns a gain-food leaf', () => {
    const handler = CUSTOM_FixtureHarvester_impl.effect!.onHarvest!
    // Minimal fake state/player; the hook body doesn't deeply inspect them
    const result = handler({} as never, {} as never)
    expect(result).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 1 },
      sourceCard: 'CUSTOM_FixtureHarvester',
    })
  })
})
