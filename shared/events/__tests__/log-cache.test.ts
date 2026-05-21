import { describe, expect, it } from 'vitest'
import type { GameState, LogEntry } from '../../contract/types'
import { prependDerivedLogEntries } from '../log-cache'

const makeState = (): Pick<GameState, 'log'> => ({
  log: [{ key: 'log.existing' }],
})

describe('prependDerivedLogEntries', () => {
  it('preserves entry order as the new log prefix', () => {
    const state = makeState() as GameState
    const entries: LogEntry[] = [
      { key: 'log.first' },
      { key: 'log.second' },
    ]

    prependDerivedLogEntries(state, entries)

    expect(state.log.map((entry) => entry.key)).toEqual([
      'log.first',
      'log.second',
      'log.existing',
    ])
  })

  it('does nothing for empty entry lists', () => {
    const state = makeState() as GameState

    prependDerivedLogEntries(state, [])

    expect(state.log.map((entry) => entry.key)).toEqual(['log.existing'])
  })
})
