// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { ActionAccumulatedEvent } from '../../../../shared/contract/events'
import { eventsToLogEntries } from '../../../../shared/events/log-mapper'
import { ActionLog } from '../ActionLog'

const accumulation = (zero: boolean): ActionAccumulatedEvent => ({
  schemaVersion: 1, id: 'season-accumulation', occurrenceId: 'season-accumulation', seq: 1, round: 11, phase: 'preparation', visibility: 'public', type: 'action.accumulated',
  spaceId: zero ? 'reed-bank' : 'forest',
  resources: zero ? {} : { wood: 2 },
  normalResources: zero ? { reed: 1 } : { wood: 3 },
  seasonalAdjustments: [{ season: zero ? 'winter' : 'spring', resources: zero ? { reed: -1 } : { wood: -1 } }],
})

describe('seasonal accumulation in Action Log', () => {
  it('omits an explanation when the recorded seasonal adjustment had no actual effect', () => {
    const event: ActionAccumulatedEvent = { ...accumulation(false), resources: { wood: 3 }, seasonalAdjustments: [{ season: 'spring', resources: { wood: 0 } }] }
    const log = eventsToLogEntries([event], { playerNames: {}, actionNames: { forest: 'actions.forest.name' } })
    const { container } = render(<ActionLog locale="zh" log={log} currentRound={11} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).not.toHaveTextContent(/春季|常规/)
    expect(container.querySelectorAll('[data-resource="wood"][data-amount="3"]')).toHaveLength(1)
  })

  it.each(['zh', 'en'] as const)('shows the frozen season, normal amount and net amount in one %s row', locale => {
    const log = eventsToLogEntries([accumulation(false)], { playerNames: {}, actionNames: { forest: 'actions.forest.name' } })
    const { container, rerender } = render(<ActionLog locale={locale} log={log} currentRound={11} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(locale === 'zh' ? '春季' : 'Spring')
    expect(container).toHaveTextContent(locale === 'zh' ? '常规' : 'normal')
    expect(container).toHaveTextContent('−')
    expect(container.querySelectorAll('[data-resource="wood"][data-amount="2"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-resource="wood"][data-amount="3"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-resource="wood"][data-amount="1"]')).toHaveLength(1)
    rerender(<ActionLog locale={locale} log={log} currentRound={14} />)
    expect(container).toHaveTextContent(locale === 'zh' ? '春季' : 'Spring')
    expect(container).not.toHaveTextContent(/through-the-seasons:|\{\w+\}/)
  })

  it.each(['zh', 'en'] as const)('shows a positive summer contribution in %s on the original fishing row', locale => {
    const event: ActionAccumulatedEvent = { ...accumulation(false), spaceId: 'fishing', resources: { food: 2 }, normalResources: { food: 1 }, seasonalAdjustments: [{ season: 'summer', resources: { food: 1 } }] }
    const log = eventsToLogEntries([event], { playerNames: {}, actionNames: { fishing: 'actions.fishing.name' } })
    const { container } = render(<ActionLog locale={locale} log={log} currentRound={11} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(locale === 'zh' ? '夏季 +' : 'Summer +')
    expect(container.querySelectorAll('[data-resource="food"][data-amount="2"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-resource="food"][data-amount="1"]')).toHaveLength(2)
  })

  it.each(['zh', 'en'] as const)('retains explained zero accumulation in %s without another result row', locale => {
    const log = eventsToLogEntries([accumulation(true)], { playerNames: {}, actionNames: { 'reed-bank': 'actions.reed-bank.name' } })
    const { container } = render(<ActionLog locale={locale} log={log} currentRound={11} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(locale === 'zh' ? '冬季' : 'Winter')
    expect(container).toHaveTextContent(locale === 'zh' ? /累积\s*0/ : /accumulates\s*0/)
    expect(container.querySelectorAll('[data-resource="reed"][data-amount="1"]')).toHaveLength(2)
  })
})
