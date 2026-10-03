import { describe, expect, it } from 'vitest'
import { getAnyCardDisplayName } from '../cardText'

describe('season source card names', () => {
  it.each([
    ['spring', '春季', 'Spring'],
    ['summer', '夏季', 'Summer'],
    ['autumn', '秋季', 'Autumn'],
    ['winter', '冬季', 'Winter'],
  ])('localizes %s in interactions, payments and logs', (id, chinese, english) => {
    expect(getAnyCardDisplayName('zh', `through-the-seasons:${id}`)).toContain(chinese)
    expect(getAnyCardDisplayName('en', `through-the-seasons:${id}`)).toContain(english)
    expect(getAnyCardDisplayName('zh', `through-the-seasons:${id}`)).not.toContain('through-the-seasons:')
  })
})
