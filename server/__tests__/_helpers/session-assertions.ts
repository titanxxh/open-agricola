import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'

export function assertRejectedUnchanged(session: GameSession, command: () => SessionResponse): SessionResponse {
  const current = session.getState()
  const before = JSON.stringify({ state: current.state, interaction: current.interaction, scores: current.scores })
  const response = command()
  assert.equal(response.ok, false)
  assert.equal(JSON.stringify({ state: response.state, interaction: response.interaction, scores: response.scores }), before)
  return response
}

export function undoRuleSnapshot(response: SessionResponse): string {
  const { publicEventArchive: _archive, nextPublicEventArchivePacketSeq: _sequence, ...state } = response.state
  return JSON.stringify({ state, scores: response.scores })
}

export function assertUndoRestored(before: string, after: SessionResponse): void {
  assert.equal(after.ok, true, after.error)
  assert.deepEqual(JSON.parse(undoRuleSnapshot(after)), JSON.parse(before))
  const packet = after.state.publicEventArchive.at(-1)
  assert.ok(packet?.type === 'publicEvents.canceled')
  assert.equal(packet.reason, 'undoAction')
}
