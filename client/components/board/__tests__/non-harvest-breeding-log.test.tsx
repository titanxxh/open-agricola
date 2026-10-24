// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { FarmAnimalBredEvent } from '../../../../shared/contract/events'
import { eventsToLogEntries } from '../../../../shared/events/log-mapper'
import { ActionLog } from '../ActionLog'

const birth = (sourceCardId?: string): FarmAnimalBredEvent => ({
  schemaVersion: 1, id: 'birth', occurrenceId: 'birth-occurrence', seq: 1, round: 1, phase: 'work',
  visibility: 'public', type: 'farm.animalBred', actorPlayerId: 'p1', source: 'cardEffect',
  sourceCardId, animals: { sheep: 1, boar: 1, cattle: 1 },
})

describe('non-harvest birth results in Action Log', () => {
  it.each(['zh', 'en'] as const)('renders actual newborn quantities and the frozen spring source in %s', locale => {
    const log = eventsToLogEntries([birth('through-the-seasons:spring')], { playerNames: { p1: 'Alice' } })
    const { container, rerender } = render(<ActionLog locale={locale} log={log} currentRound={1} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(locale === 'zh' ? 'Alice 通过 春季 新生' : /Alice breeds.*via Spring/)
    for (const animal of ['sheep', 'boar', 'cattle']) {
      expect(container.querySelectorAll(`[data-resource="${animal}"][data-amount="1"]`)).toHaveLength(1)
      expect(container.querySelectorAll(`[data-resource="${animal}"][data-amount="3"]`)).toHaveLength(0)
    }
    rerender(<ActionLog locale={locale} log={log} currentRound={14} />)
    expect(container).toHaveTextContent(locale === 'zh' ? '春季' : 'Spring')
    expect(container).not.toHaveTextContent(/through-the-seasons:|\{\w+\}/)
  })

  it.each(['zh', 'en'] as const)('shows the card source in %s without replacing the newborn count with stock', locale => {
    const event: FarmAnimalBredEvent = { ...birth('A165_PigBreeder'), round: 12, animals: { boar: 1 } }
    const log = eventsToLogEntries([event], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale={locale} log={log} currentRound={12} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(locale === 'zh' ? '养猪人' : 'Pig Breeder')
    expect(container.querySelectorAll('[data-resource="boar"][data-amount="1"]')).toHaveLength(1)
    expect(container).not.toHaveTextContent(/A165_|through-the-seasons:|\{\w+\}/)
  })

  it('renders an unattributed birth without inventing a source', () => {
    const log = eventsToLogEntries([birth()], { playerNames: { p1: 'Alice' } })
    const { container } = render(<ActionLog locale="en" log={log} currentRound={1} />)
    expect(container).toHaveTextContent('Alice breeds')
    expect(container).not.toHaveTextContent(/via|undefined|\{\w+\}/)
  })
})
