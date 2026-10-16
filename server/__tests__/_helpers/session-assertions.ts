import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import type { ActionChoiceOption } from '../../../shared/contract/types'

export function getChoiceOptions(response: SessionResponse): ActionChoiceOption[] {
  const interaction = response.interaction
  if (interaction.stateId !== 'wait') return []
  const request = interaction.request
  switch (request.kind) {
    case 'choice':
    case 'select-trigger': return request.options
    case 'farm-select':
    case 'selection': return request.options ?? []
    default: return []
  }
}

export function confirmNext(session: GameSession, response: SessionResponse): SessionResponse {
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait')
  const request = response.interaction.request
  assert.ok(request.kind === 'confirm-next-player')
  const result = session.resolveChoice(request.nextPlayerIndex, 'confirm')
  assert.equal(result.ok, true, result.error)
  return result
}

/** Pass system exchanges while leaving card decisions to their scenario. */
export function passPreparationExchanges(session: GameSession, initial: SessionResponse): SessionResponse {
  let response = initial
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger'; step++) {
    const options = response.interaction.request.options
    const enabled = options.filter(option => option.value !== '__pass__')
    if (enabled.some(option => option.labelKey !== 'actions.exchange.name')) break
    const pass = options.find(option => option.value === '__pass__')
    assert.ok(pass, JSON.stringify(response.interaction))
    response = session.resolveChoice(response.interaction.playerIndex, pass.value)
    assert.equal(response.ok, true, response.error)
  }
  return response
}

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
