import { describe, it, expect } from 'vitest'
import { formatCardStatsLines } from '../cardStatsFormat'
import { t } from '../../../../shared/i18n'
import type { CardResourceStats } from '../../../../shared/game/types'

const empty: CardResourceStats = {
  used: 0,
  gained: {},
  paid: {},
  saved: {},
  receivedPayment: {},
  paidToOthers: {},
}

describe('formatCardStatsLines', () => {
  it('returns empty array for an all-zero stats object', () => {
    expect(formatCardStatsLines(empty, 'C99', 'en')).toEqual([])
  })

  it('emits a used line when used > 0', () => {
    const stats: CardResourceStats = { ...empty, used: 3 }
    const lines = formatCardStatsLines(stats, 'C99', 'en')
    expect(lines).toEqual([
      { key: 'used', labelKey: 'ui.cardStats.used', value: 3 },
    ])
  })

  it('separates real-resource gained from pseudo-resource gained', () => {
    const stats: CardResourceStats = {
      ...empty,
      gained: { wood: 2, occupation: 1, roomWood: 1, stable: 1 },
    }
    const lines = formatCardStatsLines(stats, 'C99', 'en')
    const keys = lines.map((l) => l.key)
    expect(keys).toEqual([
      'gained-resources',
      'gained-occupation',
      'gained-rooms',
      'gained-stables',
    ])
    expect(lines[0]).toMatchObject({
      labelKey: 'ui.cardStats.gained',
      resources: { wood: 2 },
    })
    expect(lines[1]).toMatchObject({
      labelKey: 'ui.cardStats.gainedOccupation',
      value: 1,
    })
    expect(lines[2]).toMatchObject({
      labelKey: 'ui.cardStats.builtRoom',
      value: 1,
    })
    expect(lines[3]).toMatchObject({
      labelKey: 'ui.cardStats.builtStable',
      value: 1,
    })
  })

  it('emits gained.field as a Plows line', () => {
    const stats: CardResourceStats = { ...empty, gained: { field: 2 } }
    expect(formatCardStatsLines(stats, 'C99', 'en')).toEqual([
      { key: 'gained-field', labelKey: 'ui.cardStats.gainedField', value: 2 },
    ])
  })

  it('emits all 6 fields in BGA-aligned order', () => {
    const stats: CardResourceStats = {
      used: 1,
      gained: { wood: 1 },
      paid: { stone: 1 },
      saved: { wood: 1 },
      receivedPayment: { food: 1 },
      paidToOthers: { sheep: 1 },
    }
    const keys = formatCardStatsLines(stats, 'C99', 'en').map((l) => l.key)
    expect(keys).toEqual([
      'used',
      'gained-resources',
      'received',
      'paid',
      'paid-to-others',
      'saved',
    ])
  })

  it('drops keys whose values are 0', () => {
    const stats: CardResourceStats = { ...empty, used: 0, gained: { wood: 0 } }
    expect(formatCardStatsLines(stats, 'C99', 'en')).toEqual([])
  })

  it('translates ui.cardStats.* keys for both locales', () => {
    expect(t('zh', 'ui.cardStats.used')).toBe('使用次数')
    expect(t('en', 'ui.cardStats.used')).toBe('Used')
    expect(t('zh', 'ui.cardStats.gainedField')).toBe('开垦次数')
    expect(t('en', 'ui.cardStats.gainedField')).toBe('Plows')
    expect(t('zh', 'ui.cardStats.saved')).toBe('节省')
    expect(t('en', 'ui.cardStats.saved')).toBe('Saved')
  })

  it('sums roomWood + roomClay + roomStone into a single Built-rooms line', () => {
    const stats: CardResourceStats = {
      ...empty,
      gained: { roomWood: 1, roomClay: 1, roomStone: 1 },
    }
    expect(formatCardStatsLines(stats, 'C99', 'en')).toEqual([
      { key: 'gained-rooms', labelKey: 'ui.cardStats.builtRoom', value: 3 },
    ])
  })
})
