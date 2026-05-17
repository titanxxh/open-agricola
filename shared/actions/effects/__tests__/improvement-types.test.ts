import { describe, expect, it } from 'vitest'
import { readImprovementTypes, type ImprovementType } from '../improvement'

describe('readImprovementTypes', () => {
  it('defaults to ["major","minor"] when ctx is undefined', () => {
    expect(readImprovementTypes()).toEqual(['major', 'minor'])
  })

  it('defaults to ["major","minor"] when no types field present', () => {
    expect(readImprovementTypes({ params: { other: 'x' } })).toEqual(['major', 'minor'])
    expect(readImprovementTypes({ actionContext: { other: 'x' } })).toEqual(['major', 'minor'])
  })

  it('reads params.types when present', () => {
    expect(readImprovementTypes({ params: { types: ['minor'] } })).toEqual(['minor'])
  })

  it('falls back to actionContext.types when params lacks it', () => {
    expect(readImprovementTypes({ actionContext: { types: ['major'] } })).toEqual(['major'])
  })

  it('filters unknown values', () => {
    const result = readImprovementTypes({ params: { types: ['minor', 'banana', 42, null] } })
    expect(result).toEqual(['minor'])
  })

  it('dedupes', () => {
    const result = readImprovementTypes({ params: { types: ['major', 'minor', 'major'] } })
    expect(result.sort()).toEqual(['major', 'minor'])
  })

  it('falls back to default when filtered list is empty', () => {
    expect(readImprovementTypes({ params: { types: ['banana'] } })).toEqual(['major', 'minor'])
    expect(readImprovementTypes({ params: { types: [] } })).toEqual(['major', 'minor'])
  })

  it('reads non-array gracefully', () => {
    expect(readImprovementTypes({ params: { types: 'minor' as unknown as ImprovementType[] } })).toEqual(['major', 'minor'])
  })
})
