import { afterEach, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = 'C073_SeaweedFertilizer'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function make(otherEmptyField = true) {
  const session = createWorkSession({ configure(state) {
    state.round = 4
    state.players.forEach(player => { player.resources.food = 20 })
    const owner = state.players[0]!
    owner.minorPlayed = [CARD, 'D071_Changeover']
    owner.resources.vegetable = 1
    owner.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    if (otherEmptyField) owner.fields.push({ row: 0, col: 1, stacks: [] })
  } })
  sessions.push(session)
  return session
}
function finish(session: GameSession, response: SessionResponse) {
  for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    const request = interaction.request
    if (interaction.spaceId === '__subflow:post-reap-anytime' && interaction.anytimeActions.some(action => action.sourceCard === 'D071_Changeover')) return response
    if (request.kind === 'confirm-next-player' || request.kind === 'farm-select' || request.kind === 'selection') return response
    if (request.kind === 'choice' || request.kind === 'select-trigger') {
      const option = request.options.find(option => !['__skip__', '__pass__', '__done__'].includes(option.value))
      expect(option, JSON.stringify(interaction)).toBeDefined()
      response = session.resolveChoice(interaction.playerIndex, option!.value)
    } else if (request.kind === 'confirm-player-switch') response = session.resolveChoice(interaction.playerIndex, 'confirm')
    else throw new Error(`Unexpected interaction: ${JSON.stringify(interaction)}`)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}
function changeover(session: GameSession) {
  let response = session.getState()
  for (const space of ['day-laborer', 'clay-pit', 'reed-bank', 'forest']) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
      expect(response.ok, response.error).toBe(true)
    }
    response = session.takeAction(response.state.currentPlayerIndex, space)
    expect(response.ok, response.error).toBe(true)
    response = finish(session, response)
  }
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-next-player') throw new Error('Missing handoff')
  response = finish(session, session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm'))
  expect(response.state.round).toBe(4)
  expect(response.state.players[0]!.resources.grain).toBe(1)
  const change = response.interaction.anytimeActions.find(action => action.sourceCard === 'D071_Changeover')
  expect(change).toBeDefined()
  response = session.takeAnytimeAction(0, change!.id)
  expect(response.ok, response.error).toBe(true)
  response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }] })
  expect(response.ok, response.error).toBe(true)
  return finish(session, response)
}
it('Changeover restricted to one of two eligible fields grants no Seaweed grain', () => {
  const session = make()
  const pending = changeover(session)
  expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
  const rejected = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] })
  expect(rejected.ok).toBe(false)
  expect(rejected.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
  const response = finish(session, session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'vegetable' }] }))
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.grain).toBe(1)
  expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[{ kind: 'vegetable', remaining: 2 }], []])
})

it('a selected-field scope covering the only eligible field remains unconditional', () => {
  const session = make(false)
  changeover(session)
  const response = finish(session, session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'vegetable' }] }))
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 0 })
})

it.each([{ played: true, actor: 0, grain: 1 }, { played: false, actor: 0, grain: 0 }, { played: true, actor: 1, grain: 0 }])(
  'ordinary Sow grants only a played owner Seaweed reward: played=$played actor=$actor',
  ({ played, actor, grain }) => {
    const session = createWorkSession({ configure(state) {
      state.round = 10
      state.currentPlayerIndex = actor
      const owner = state.players[0]!
      owner.minorPlayed = played ? [CARD] : []
      if (!played) owner.minorHand = [CARD]
      state.players[actor]!.resources.grain = 1
      state.players[actor]!.fields = [{ row: 0, col: 0, stacks: [] }]
    } })
    sessions.push(session)
    const pending = finish(session, session.takeAction(actor, 'grain-utilization'))
    expect(pending.ok, pending.error).toBe(true)
    const response = finish(session, session.commitSelectionChoice(actor, { crops: [{ row: 0, col: 0, crop: 'grain' }] }))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(grain)
    expect(response.state.players[actor]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    if (!played || actor !== 0) {
      const rejected = session.resolveChoice(0, CARD)
      expect(rejected.ok).toBe(false)
      expect(rejected.state.players[0]!.resources.grain).toBe(grain)
    }
  },
)
