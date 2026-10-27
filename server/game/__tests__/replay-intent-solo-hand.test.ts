import assert from 'node:assert/strict'
import { expect, it } from 'vitest'
import type { ClientCommand } from '../../../shared/contract/protocol/ws'
import { createOpeningSession } from '../../__tests__/_helpers/session-fixtures'
import { replayIntentFromCommand } from '../room-committer'

it('records only accepted hand-selection fields after a real solo opening command', () => {
  const session = createOpeningSession({ seed: 42,
    options: { playerCount: 1, soloHandMode: 'choose-7' },
    expected: { phase: 'solo-hand-selection', roundPhase: 'work', interaction: {
      stateId: 'wait', kind: 'solo-hand-selection', playerIndex: 0,
    } },
  })
  try {
    const candidates = session.getState().state.soloHandSelection
    assert.ok(candidates)
    const groups = candidates.groups.map(group => ({ kind: group.kind,
      cardIds: group.cardIds.slice(0, group.keepCount), userId: 'private-site-user-id',
    }))
    const expected = { groups: groups.map(group => ({ kind: group.kind, cardIds: [...group.cardIds] })) }
    const selection = { groups, token: 'private-token', requestId: 'private-selection-request' }
    const command = { type: 'soloHandSubmit', playerIndex: 0,
      requestId: 'transport-request', selection,
    } satisfies ClientCommand
    const response = session.submitSoloHandSelection(0, selection)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.phase).toBe('playing')
    expect(response.state.soloHandSelection?.kept).toEqual(expected)
    expect(response.state.players[0]!.occupationHand).toEqual(expected.groups[0]!.cardIds)
    expect(response.state.players[0]!.minorHand).toEqual(expected.groups[1]!.cardIds)
    const replay = replayIntentFromCommand(command)
    assert.ok(replay)
    expect(replay.commandType).toBe('soloHandSubmit')
    expect(JSON.parse(replay.intentJson)).toEqual({ selection: expected })
  } finally { session.dispose() }
})
