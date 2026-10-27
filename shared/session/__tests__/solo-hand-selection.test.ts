import { describe, expect, it } from 'vitest'
import { createSoloHandGroups } from '../solo-hand-selection'

const occupations = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10']
const minors = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
const moorMinors = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']

describe('solo opening pool capacity', () => {
  it('partitions deduplicated minors before taking candidates and reports each exact shortage', () => {
    expect(createSoloHandGroups('choose-7', {
      occupation: [...occupations, 'o1'], minor: ['m1', 'a', 'a', 'b', 'c', 'd'], moorMinor: [...moorMinors, 'm1'],
    }, true)).toEqual([
      { kind: 'occupation', keepCount: 7, cardIds: occupations },
      { kind: 'minor', keepCount: 3, cardIds: ['a', 'b', 'c', 'd'] },
      { kind: 'moor-minor', keepCount: 4, cardIds: moorMinors },
    ])
    expect(() => createSoloHandGroups('choose-7', {
      occupation: [...occupations.slice(0, 9), 'o1'], minor: minors, moorMinor: moorMinors,
    }, false)).toThrow('Solo occupation pool has 9 cards; need 10')
    expect(() => createSoloHandGroups('choose-7', {
      occupation: occupations, minor: ['a', 'b', 'c', 'm1'], moorMinor: moorMinors,
    }, true)).toThrow('Solo minor pool has 3 cards; need 4')
    expect(() => createSoloHandGroups('choose-7', {
      occupation: occupations, minor: minors, moorMinor: ['m1', 'm2', 'm3', 'm4', 'm5', 'm1'],
    }, true)).toThrow('Solo moor-minor pool has 5 cards; need 6')
    expect(() => createSoloHandGroups('random', {
      occupation: occupations, minor: minors.slice(0, 6), moorMinor: moorMinors,
    }, false)).toThrow('Solo minor pool has 6 cards; need 7')
    expect(() => createSoloHandGroups('random', {
      occupation: occupations, minor: minors, moorMinor: moorMinors.slice(0, 3),
    }, true)).toThrow('Solo moor-minor pool has 3 cards; need 4')
  })
})
