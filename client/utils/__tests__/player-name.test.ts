import { describe, expect, it } from 'vitest'
import { getPlayerDisplayName } from '../player-name'

describe('localized default player names', () => {
  it('localizes server defaults and missing seat names', () => {
    expect(getPlayerDisplayName('zh', 'Player 2', 1, true)).toBe('玩家 2')
    expect(getPlayerDisplayName('zh', undefined, 1)).toBe('玩家 2')
    expect(getPlayerDisplayName('en', undefined, 1)).toBe('Player 2')
    expect(getPlayerDisplayName('zh', undefined)).toBe('')
  })

  it('preserves letter-form account names regardless of seat or locale', () => {
    for (const [index, letter] of [...'ABCDEF'].entries()) {
      for (const prefix of ['Player', 'player']) {
        const name = `${prefix}${letter}`
        for (const locale of ['zh', 'en'] as const) {
          expect(getPlayerDisplayName(locale, name, index)).toBe(name)
          expect(getPlayerDisplayName(locale, name, 0)).toBe(name)
          expect(getPlayerDisplayName(locale, name)).toBe(name)
        }
      }
    }
  })

  it.each(['zh', 'en'] as const)('preserves chosen names in %s', (locale) => {
    for (const name of ['张三', 'Alice', 'Player One', 'PlayerA', 'PlayerG', 'playerAlice', 'Player 6', 'Player 1']) {
      expect(getPlayerDisplayName(locale, name, 1)).toBe(name)
    }
  })
})
