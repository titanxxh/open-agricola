import { describe, expect, it } from 'vitest'
import { getPlayerDisplayName } from '../player-name'

describe('localized default player names', () => {
  it('localizes server defaults and missing seat names', () => {
    expect(getPlayerDisplayName('zh', 'Player 2')).toBe('玩家 2')
    expect(getPlayerDisplayName('zh', undefined, 1)).toBe('玩家 2')
    expect(getPlayerDisplayName('en', undefined, 1)).toBe('Player 2')
    expect(getPlayerDisplayName('zh', undefined)).toBe('')
  })

  it('localizes every letter-form hotseat and sandbox default', () => {
    for (const [index, letter] of [...'ABCDEF'].entries()) {
      for (const prefix of ['Player', 'player']) {
        expect(getPlayerDisplayName('zh', `${prefix}${letter}`, index)).toBe(`玩家 ${index + 1}`)
        expect(getPlayerDisplayName('en', `${prefix}${letter}`, index)).toBe(`Player ${index + 1}`)
        expect(getPlayerDisplayName('zh', `${prefix}${letter}`)).toBe(`玩家 ${index + 1}`)
      }
    }
  })

  it.each(['zh', 'en'] as const)('preserves chosen names in %s', (locale) => {
    for (const name of ['张三', 'Alice', 'Player One', 'PlayerG', 'playerAlice']) {
      expect(getPlayerDisplayName(locale, name, 1)).toBe(name)
    }
  })
})
