// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { FarmFieldPlowedEvent } from '../../../../shared/contract/events'
import { eventsToLogEntries } from '../../../../shared/events/log-mapper'
import { ActionLog } from '../ActionLog'

const plowed: FarmFieldPlowedEvent = {
  schemaVersion: 1, id: 'winter-plow', seq: 2, round: 1, phase: 'work', visibility: 'public',
  actorPlayerId: 'p1', type: 'farm.fieldPlowed', sourceActionId: 'farmland',
  fields: [{ playerId: 'p1', row: 0, col: 0 }], newlyUsedTiles: [{ playerId: 'p1', row: 0, col: 0 }],
  payment: { resources: { food: 1 }, seasonalAdjustments: [{ season: 'winter', resources: { food: 1 } }] },
}

describe('winter plow log', () => {
  it.each(['zh', 'en'] as const)('renders the payment, field and winter cost together in %s', locale => {
    const log = eventsToLogEntries([plowed], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale={locale} log={log} currentRound={1} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(locale === 'zh' ? '冬季额外支付' : 'Winter: extra cost')
    expect(container).toHaveTextContent(locale === 'zh' ? '开垦 1 块田地' : 'Plow 1 field(s)')
    expect(container).toHaveTextContent(locale === 'zh' ? '支付' : 'Pays')
    expect(container.querySelectorAll('[data-resource="food"][data-amount="1"]')).toHaveLength(2)
    expect(container).not.toHaveTextContent('through-the-seasons')
  })

  it('does not infer a winter cost for older field facts', () => {
    const { payment: _payment, ...olderPlow } = plowed
    const log = eventsToLogEntries([olderPlow], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale="en" log={log} currentRound={1} />)
    expect(container).toHaveTextContent('Plow 1 field(s)')
    expect(container).not.toHaveTextContent('Winter')
    expect(container.querySelectorAll('[data-resource="food"]')).toHaveLength(0)
  })
})
