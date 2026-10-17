import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import type { ActionChoiceOption, PlayerState, ResourceKey } from '../../../shared/contract/types'

/** Absolute expectations must cover every seat and exactly the selected resource fields. */
export function assertSeatResources<const Field extends ResourceKey>({
  session, response, fields, expected,
}: {
  session: Pick<GameSession, 'state'>
  response: Pick<SessionResponse, 'state'>
  fields: readonly [Field, ...Field[]]
  expected: readonly {
    playerId: PlayerState['id']
    resources: Record<NoInfer<Field>, number>
  }[]
}): void {
  const selectedFields = new Set<string>(fields)
  assert.ok(fields.length > 0, 'resource fields must not be empty')
  assert.equal(selectedFields.size, fields.length, 'resource fields must not contain duplicates')
  for (const { scope, state } of [{ scope: 'returned', state: response.state }, { scope: 'live', state: session.state }]) {
    assert.equal(state.players.length, expected.length,
      `${scope} seat ${Math.min(state.players.length, expected.length)}: expected ${expected.length} seats, received ${state.players.length}`)
    for (let seat = 0; seat < expected.length; seat++) {
      const expectation = expected[seat]
      assert.ok(expectation, `${scope} seat ${seat}: missing expectation`)
      const { playerId, resources } = expectation
      const label = `${scope} seat ${seat} (${playerId})`
      const player = state.players[seat]
      assert.ok(player, `${label}: missing player`)
      assert.equal(player.id, playerId, `${label} playerId: identity or order changed`)
      for (const field of Object.keys(resources)) {
        assert.ok(selectedFields.has(field), `${label} field ${field}: extra expectation`)
      }
      for (const field of fields) {
        assert.ok(Object.hasOwn(resources, field), `${label} field ${field}: missing expectation`)
        assert.ok(Object.hasOwn(player.resources, field), `${label} field ${field}: missing resource`)
        assert.equal(player.resources[field], resources[field], `${label} field ${field}`)
      }
    }
  }
}

export function getChoiceOptions(response: Pick<SessionResponse, 'interaction'>): ActionChoiceOption[] {
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

export function getFarmSelection(response: SessionResponse) {
  const interaction = response.interaction
  return interaction.stateId === 'wait' && interaction.request.kind === 'farm-select'
    ? interaction.request.farm : undefined
}

export function expectFarmSelection(response: SessionResponse) {
  assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
  assert.ok(response.interaction.request.kind === 'farm-select', JSON.stringify(response.interaction))
  return response.interaction.request.farm
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

export function expectTileFarmSelection(response: SessionResponse, kind: 'plow' | 'room' | 'stable') {
  const farm = expectFarmSelection(response)
  assert.ok(farm.farmType === 'plow' || farm.farmType === 'room' || farm.farmType === 'stable')
  assert.equal(farm.farmType, kind)
  return farm
}
