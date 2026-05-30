import { describe, expect, it } from 'vitest'

import {
  farmHandCenterPostKey,
  farmHandTopLeftFromCenterKey,
} from '../farmHandCenter'

describe('farmHandCenterPostKey', () => {
  it.each([
    [{ row: 0, col: 0 }, '2-2'],
    [{ row: 0, col: 1 }, '2-4'],
    [{ row: 1, col: 0 }, '4-2'],
    [{ row: 1, col: 2 }, '4-6'],
    [{ row: 2, col: 4 }, '6-10'],
  ] as const)('maps 2x2 top-left %j to center post %s', (topLeft, expected) => {
    expect(farmHandCenterPostKey(topLeft)).toBe(expected)
  })
})

describe('farmHandTopLeftFromCenterKey', () => {
  it.each([
    ['2-2', { row: 0, col: 0 }],
    ['2-4', { row: 0, col: 1 }],
    ['4-2', { row: 1, col: 0 }],
    ['4-6', { row: 1, col: 2 }],
    ['6-10', { row: 2, col: 4 }],
  ] as const)('maps center post %s back to top-left %j', (postKey, expected) => {
    expect(farmHandTopLeftFromCenterKey(postKey)).toEqual(expected)
  })

  it('round-trips every top-left through its center post', () => {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const topLeft = { row, col }
        expect(
          farmHandTopLeftFromCenterKey(farmHandCenterPostKey(topLeft)),
        ).toEqual(topLeft)
      }
    }
  })

  it('returns null for non-post (tile/fence) grid keys', () => {
    expect(farmHandTopLeftFromCenterKey('1-1')).toBeNull()
    expect(farmHandTopLeftFromCenterKey('2-3')).toBeNull()
    expect(farmHandTopLeftFromCenterKey('0-0')).toBeNull()
    expect(farmHandTopLeftFromCenterKey('not-a-key')).toBeNull()
  })
})
