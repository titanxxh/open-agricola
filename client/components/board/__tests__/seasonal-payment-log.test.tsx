// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { ResourcePaidEvent } from '../../../../shared/contract/events'
import { eventsToLogEntries } from '../../../../shared/events/log-mapper'
import { ActionLog } from '../ActionLog'

const payment: ResourcePaidEvent = {
  schemaVersion: 1, id: 'spring-payment', seq: 2, round: 7, phase: 'work', visibility: 'public',
  actorPlayerId: 'p1', type: 'resource.paid', paymentFor: 'fencing', sourceActionId: 'fencing',
  resources: { wood: 5 }, seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }],
}

describe('seasonal payment log', () => {
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
