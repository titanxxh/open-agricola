import { describe, expect, it } from 'vitest'
import { actionReferences, parseActionReference } from '../action-reference'
import { searchableCardText } from '../../projections/card-text-icons'

describe('printed action references', () => {
  it('keeps ordinary action emphasis distinct from typed space and Moor references', () => {
    expect(actionReferences('__Major Improvement__ action; __space:major-improvement|Major Improvement__ action space; __moor:cut-peat|挖泥炭__'))
      .toEqual([
        { kind: 'space', ids: ['major-improvement'], label: 'Major Improvement' },
        { kind: 'moor', ids: ['cut-peat'], label: '挖泥炭' },
      ])
    expect(parseActionReference('space:|Fishing')).toBeUndefined()
  })
  it('searches translated words without leaking internal target identifiers', () => {
    expect(searchableCardText('[Use __space:western-quarry,eastern-quarry|采石场__] and __moor:cut-peat|挖泥炭__', () => ''))
      .toBe('Use 采石场 and 挖泥炭')
  })
})
