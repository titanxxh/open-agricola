// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { CardPlayedEvent, FarmFenceBuiltEvent, ResourcePaidEvent } from '../../../../shared/contract/events'
import { eventsToLogEntries } from '../../../../shared/events/log-mapper'
import { ActionLog } from '../ActionLog'

const payment: ResourcePaidEvent = {
  schemaVersion: 1, id: 'spring-payment', seq: 2, round: 7, phase: 'work', visibility: 'public',
  actorPlayerId: 'p1', type: 'resource.paid', paymentFor: 'fencing', sourceActionId: 'fencing',
  resources: { wood: 5 }, seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }],
}

describe('seasonal payment log', () => {
  it.each(['zh', 'en'] as const)('renders construction, actual payment and spring saving in one fence row in %s', locale => {
    for (const free of [false, true]) {
      const count = free ? 4 : 7
      const fence: FarmFenceBuiltEvent = {
        schemaVersion: 1, id: 'fence', seq: 1, round: 7, phase: 'work', visibility: 'public',
        actorPlayerId: 'p1', type: 'farm.fenceBuilt', sourceActionId: 'fence', paymentId: 'fence-payment',
        newlyUsedTiles: [], newlyEnclosedPastureTiles: [],
        fences: Array.from({ length: count }, () => ({ type: 'fence' })),
      }
      const log = eventsToLogEntries([fence, { ...payment, paymentId: 'fence-payment', resources: free ? {} : { wood: 5 } }],
        { playerNames: { p1: 'Alice' } })
      const view = render(<ActionLog locale={locale} log={log} currentRound={7} />)
      const row = view.container.querySelector('li')!
      expect(view.container.querySelectorAll('li')).toHaveLength(1)
      expect(row).toHaveTextContent(locale === 'zh' ? `建造 ${count} 段围栏` : `Build ${count} fence(s)`)
      expect(row).toHaveTextContent(new RegExp(`${locale === 'zh' ? '支付' : 'Pays'}.*${free ? 0 : 5}`))
      expect(row).toHaveTextContent(locale === 'zh' ? '春季减免' : 'Spring: costs')
      expect(row.querySelectorAll('[data-resource="wood"][data-amount="2"]')).toHaveLength(1)
      expect(row.querySelectorAll('[data-resource="wood"][data-amount="5"]')).toHaveLength(free ? 0 : 1)
      view.unmount()
    }
  })

  it.each(['zh', 'en'] as const)('keeps an autumn major saving in its owning purchase row in %s', locale => {
    const purchase: CardPlayedEvent = {
      schemaVersion: 1, id: 'autumn-purchase', seq: 3, round: 7, phase: 'work', visibility: 'public',
      actorPlayerId: 'p1', type: 'card.played', cardId: 'Major_Fireplace1', cardType: 'major',
      payment: { resources: { clay: 1 }, paymentId: 'autumn-payment',
        bonusSources: ['through-the-seasons:autumn'],
        seasonalAdjustments: [{ season: 'autumn', resources: { clay: -1 } }] },
    }
    const log = eventsToLogEntries([
      { ...payment, id: 'autumn-payment', paymentId: 'autumn-payment', paymentFor: 'major-improvement',
        resources: { clay: 1 }, seasonalAdjustments: [{ season: 'autumn', resources: { clay: -1 } }] },
      purchase,
    ], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale={locale} log={log} currentRound={7} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(locale === 'zh' ? '秋季减免' : 'Autumn: costs')
    expect(container.querySelectorAll('[data-resource="clay"][data-amount="1"]')).toHaveLength(2)
    expect(container).not.toHaveTextContent('through-the-seasons')
  })

  it.each(['zh', 'en'] as const)('explains a zero-price major without hiding its autumn saving in %s', locale => {
    const purchase: CardPlayedEvent = {
      schemaVersion: 1, id: 'autumn-free-purchase', seq: 3, round: 7, phase: 'work', visibility: 'public',
      actorPlayerId: 'p1', type: 'card.played', cardId: 'Major_Fireplace1', cardType: 'major',
      payment: { resources: {}, bonusSources: ['C122_Bricklayer', 'through-the-seasons:autumn'],
        seasonalAdjustments: [{ season: 'autumn', resources: { clay: -1 } }] },
    }
    const log = eventsToLogEntries([purchase], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale={locale} log={log} currentRound={7} />)
    const row = container.querySelector('li')!
    expect(row).toHaveTextContent(locale === 'zh' ? '支付 0' : 'Pays 0')
    expect(row).toHaveTextContent(locale === 'zh' ? '秋季减免' : 'Autumn: costs')
    expect(row.querySelectorAll('[data-resource="clay"][data-amount="1"]')).toHaveLength(1)
    expect(row).toHaveTextContent(locale === 'zh' ? '砌砖工' : 'Bricklayer')
    expect(row).not.toHaveTextContent('through-the-seasons')
  })

  it('does not infer an autumn amount from an older purchase source string', () => {
    const purchase: CardPlayedEvent = {
      schemaVersion: 1, id: 'old-autumn-purchase', seq: 3, round: 7, phase: 'work', visibility: 'public',
      actorPlayerId: 'p1', type: 'card.played', cardId: 'Major_Fireplace1', cardType: 'major',
      payment: { resources: { clay: 1 }, bonusSources: ['through-the-seasons:autumn'] },
    }
    const log = eventsToLogEntries([purchase], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale="en" log={log} currentRound={7} />)
    expect(container).not.toHaveTextContent('Autumn')
    expect(container.querySelectorAll('[data-resource="clay"]')).toHaveLength(1)
  })

  it.each([
    ['zh', '支付', '春季减免'],
    ['en', 'Pays', 'Spring: costs'],
  ] as const)('renders the actual payment and seasonal saving in %s', (locale, pays, season) => {
    const log = eventsToLogEntries([payment], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale={locale} log={log} currentRound={7} />)

    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(pays)
    expect(container).toHaveTextContent(season)
    expect(container).toHaveTextContent('5')
    expect(container).toHaveTextContent('2')
    expect(container.querySelectorAll('[data-resource="wood"]')).toHaveLength(2)
    expect(container.querySelector('[data-resource="wood"][data-amount="5"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="wood"][data-amount="2"]')).not.toBeNull()
    expect(container).not.toHaveTextContent('through-the-seasons')
  })

  it.each(['zh', 'en'] as const)('keeps a zero payment and its season explanation together in %s', locale => {
    const log = eventsToLogEntries([{ ...payment, resources: {}, bonusSources: ['A088_HedgeKeeper'] }], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale={locale} log={log} currentRound={7} />)
    const row = container.querySelector('li')!
    expect(row).toHaveTextContent(locale === 'zh' ? '春季减免' : 'Spring: costs')
    expect(row).toHaveTextContent('0')
    expect(row.querySelector('[data-resource="wood"]')).toHaveAttribute('data-amount', '2')
    expect(row).toHaveTextContent(locale === 'zh' ? '篱笆守护者' : 'Hedge Keeper')
  })

  it('retains the seasonal explanation on a card-granted payment', () => {
    const log = eventsToLogEntries([{ ...payment, sourceCardId: 'A150_Stagehand' }], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale="en" log={log} currentRound={7} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent('Spring: costs')
    expect(container).toHaveTextContent('Stagehand')
    expect(container.querySelectorAll('[data-resource="wood"]')).toHaveLength(2)
  })

  it('does not add an explanation to history without seasonal facts', () => {
    const { seasonalAdjustments: _adjustments, ...olderPayment } = payment
    const log = eventsToLogEntries([olderPayment], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale="en" log={log} currentRound={7} />)
    expect(container).not.toHaveTextContent('Spring')
    expect(container.querySelectorAll('[data-resource="wood"]')).toHaveLength(1)
  })
})
