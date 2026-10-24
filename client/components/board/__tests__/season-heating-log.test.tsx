// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { GameEvent } from '../../../../shared/contract/events'
import { eventsToLogEntries } from '../../../../shared/events/log-mapper'
import { buildActionLogTimelineRows } from '../../../app/action-log-timeline'
import { ActionLog } from '../ActionLog'

it.each(['zh', 'en'] as const)('renders the frozen summer heating waiver once in %s', locale => {
  const event: GameEvent = {
    schemaVersion: 1, id: 'heating-waiver', occurrenceId: 'heating-waiver', seq: 1,
    round: 4, phase: 'harvest', visibility: 'public', actorPlayerId: 'p1',
    type: 'harvest.heated', playerId: 'p1', required: 0, fuelUsed: 0, woodToFuel: 0, sickWorkerIds: [],
    seasonalWaiver: { season: 'summer', normalRequired: 3, waived: 3 },
  }
  const context = { playerNames: { p1: 'Alice' } }
  const cachedLog = eventsToLogEntries([event], context)
  const timelineBuckets = buildActionLogTimelineRows({
    entries: [{ key: event.id, kind: 'event', packetSeq: 1, packetLocalIndex: 0, event,
      status: 'active', payloadSource: 'currentEvents', replayable: true }],
    stateLog: cachedLog, currentRound: 8, locale, ...context,
  })
  const { container } = render(<ActionLog locale={locale} log={cachedLog} timelineBuckets={timelineBuckets} currentRound={8} />)
  expect(container.querySelectorAll('li')).toHaveLength(1)
  expect(container).toHaveTextContent(locale === 'zh'
    ? 'Alice 供暖：夏季豁免 3 燃料需求（原需 3）'
    : 'Alice heats home: Summer waives 3 fuel requirement (normally 3)')
  expect(container).not.toHaveTextContent(locale === 'zh' ? '转换' : 'converts')
  expect(container).not.toHaveTextContent('through-the-seasons')
})
