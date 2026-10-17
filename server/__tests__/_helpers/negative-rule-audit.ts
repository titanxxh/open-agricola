import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'

export function assertRuleOutcome<T>(actual: T, expected: T, known?: { id: string; observed: T }): void {
  if (!known || process.env.AGRICOLA_NEGATIVE_RAW === '1') {
    assert.deepEqual(actual, expected, known?.id)
    return
  }
  assert.deepEqual(actual, known.observed, `${known.id}: observed failure changed; reclassify`)
  assert.notDeepEqual(actual, expected, `${known.id}: rule now passes; remove expected failure`)
}

export function assertRejectedUnchanged(session: GameSession, command: () => SessionResponse): SessionResponse {
  const current = session.getState()
  const before = { state: JSON.stringify(current.state), interaction: JSON.stringify(current.interaction), scores: JSON.stringify(current.scores) }
  const response = command()
  assert.equal(response.ok, false)
  assert.equal(JSON.stringify(response.state), before.state)
  assert.equal(JSON.stringify(response.interaction), before.interaction)
  assert.equal(JSON.stringify(response.scores), before.scores)
  return response
}

export function assertEmptyAccumulationRejected(session: GameSession, actor: number, spaceId: string): SessionResponse {
  let current = session.getState()
  if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'confirm-next-player') current = confirmNext(session, current)
  assert.equal(current.interaction.stateId, 'idle', JSON.stringify(current.interaction))
  assert.equal(current.state.currentPlayerIndex, actor)
  const space = current.state.actionSpaces.find(candidate => candidate.id === spaceId)
  assert.ok(space)
  assert.ok(Object.values(space.resources).every(amount => amount === 0), JSON.stringify(space.resources))
  assert.equal(session.getActionAvailability(actor)[spaceId], false)
  return assertRejectedUnchanged(session, () => session.takeAction(actor, spaceId))
}

export function confirmNext(session: GameSession, response: SessionResponse): SessionResponse {
  assert.equal(response.ok, true, response.error)
  assert.equal(response.interaction.stateId, 'wait')
  assert.ok(response.interaction.stateId === 'wait')
  const request = response.interaction.request
  assert.equal(request.kind, 'confirm-next-player')
  assert.ok(request.kind === 'confirm-next-player')
  const result = session.resolveChoice(request.nextPlayerIndex, 'confirm')
  assert.equal(result.ok, true, result.error)
  return result
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

/** Finish only the system exchange sources; card decisions remain explicit in each scenario. */
export function passPreparationExchanges(session: GameSession, response: SessionResponse): SessionResponse {
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger'; step++) {
    const request = response.interaction.request
    const enabled = request.options.filter(option => !('disabled' in option && option.disabled) && option.value !== '__pass__')
    if (enabled.some(option => option.labelKey !== 'actions.exchange.name')) break
    const pass = request.options.find(option => option.value === '__pass__' && !('disabled' in option && option.disabled))
    assert.ok(pass, JSON.stringify(response.interaction))
    response = session.resolveChoice(response.interaction.playerIndex, pass.value)
    assert.equal(response.ok, true, response.error)
  }
  return response
}
