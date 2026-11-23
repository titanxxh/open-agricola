import { describe, expect, it } from 'vitest'
import { installOfficialCardRegistry } from '../../../../shared/cards/__tests__/card-environment'
import { ALL_CARD_IMPLS } from '../../../../shared/cards/register-all'
import type { PlayerState } from '../../../../shared/contract/types'
import { emptyResources } from '../../../../shared/contract/state-constants'
import { getLoadedLocales, t } from '../../../../shared/i18n'
import { cardCounterLabel } from '../card-counter-label'

installOfficialCardRegistry()

/** Every counter key a card can publish: declared keys read 1 through a permissive counter map. */
const publishedCounterKeys = (): Map<string, string[]> => {
  const keys = new Map<string, string[]>()
  const anyCounter = new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? 1 : undefined) })
  for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
    const query = impl.effect?.getStatePresentation
    if (!query) continue
    const player = {
      id: 'p1', resources: { ...emptyResources }, fields: [], pastures: [], minorPlayed: [], occupationPlayed: [], improvements: [],
      cardStates: { [cardId]: { counters: anyCounter, extraData: {} } },
    } as unknown as PlayerState
    let counters: Record<string, number> | undefined
    try {
      counters = query(player).counters
    } catch {
      continue
    }
    for (const key of Object.keys(counters ?? {})) keys.set(key, [...(keys.get(key) ?? []), cardId])
  }
  return keys
}

describe('card counter labels', () => {
  it('names every non-resource counter a card publishes in each language', () => {
    const counters = publishedCounterKeys()
    expect([...counters.keys()]).toEqual(expect.arrayContaining(['uses', 'reserved', 'trades', 'usage', 'cards']))
    const unlabelled = getLoadedLocales().flatMap(locale => [...counters]
      .filter(([key]) => key !== 'bonusVp' && !(key in emptyResources))
      .filter(([key]) => t(locale, `ui.cardCounters.${key}`) === `ui.cardCounters.${key}`)
      .map(([key, cards]) => `${locale} ${key} (${cards.join(', ')})`))
    expect(unlabelled).toEqual([])
  })

  it('reads a declared key as its label and an undeclared key as a plain count', () => {
    expect(cardCounterLabel('zh', 'uses', 3)).toBe('剩余 3 次')
    expect(cardCounterLabel('en', 'reserved', 2)).toBe('2 family members reserved')
    expect(cardCounterLabel('zh', 'notDeclaredAnywhere', 4)).toBe('计数 4')
    expect(cardCounterLabel('en', 'notDeclaredAnywhere', 4)).toBe('count 4')
  })
})
