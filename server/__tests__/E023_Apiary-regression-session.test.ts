import { afterEach, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = 'E023_Apiary'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function make({ played = true, woodField = false, seeds = true, seaweed = false } = {}) {
  const session = createWorkSession({ configure(state) {
    state.round = 5
    state.players.forEach(player => { player.resources.food = 20 })
    const owner = state.players[0]!
    owner.minorPlayed = played ? [CARD] : []
    if (!played) owner.minorHand = [CARD]
    if (woodField) owner.minorPlayed.push('D075_WoodField')
    if (seaweed) owner.minorPlayed.push('C073_SeaweedFertilizer')
    owner.occupationPlayed = ['A100_Curator', 'A110_Roughcaster', 'A116_WoodCutter', 'A125_Priest']
    owner.resources.grain = seeds ? 2 : 0
    owner.resources.vegetable = seeds ? 1 : 0
    owner.resources.wood = 2
    owner.fields = [{ row: 0, col: 0, stacks: [] }, { row: 0, col: 1, stacks: [] }]
  } })
  sessions.push(session)
  return session
}
function finish(session: GameSession, response: SessionResponse, accept = true) {
  for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    const request = interaction.request
    if (request.kind === 'confirm-next-player' || request.kind === 'farm-select') return response
    if (request.kind === 'choice' || request.kind === 'select-trigger') {
      const option = request.options.find(option => accept
        ? !['__skip__', '__pass__', '__done__'].includes(option.value)
        : ['__skip__', '__pass__', '__done__'].includes(option.value))
      if (!option && request.kind === 'choice' && request.options.length === 1 && request.options[0]!.value === '__skip__') {
        response = session.resolveChoice(interaction.playerIndex, '__skip__')
        expect(response.ok, response.error).toBe(true)
        continue
      }
      expect(option, JSON.stringify(interaction)).toBeDefined()
      response = session.resolveChoice(interaction.playerIndex, option!.value)
    } else if (request.kind === 'confirm-player-switch') response = session.resolveChoice(interaction.playerIndex, 'confirm')
    else throw new Error(`Unexpected interaction: ${JSON.stringify(interaction)}`)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}
function enter(session: GameSession, accept = true) {
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
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-next-player') throw new Error('Missing final handoff')
  response = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
  expect(response.ok, response.error).toBe(true)
  return finish(session, response, accept)
}
it('Apiary rejects two fields before allowing exactly one seed on one field', () => {
  const session = make()
  const pending = enter(session)
  expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
  const rejected = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }, { row: 0, col: 1, crop: 'grain' }] })
  expect(rejected.ok).toBe(false)
  expect(rejected.state.players[0]!.resources.grain).toBe(2)
  expect(rejected.state.players[0]!.fields.map(field => field.stacks)).toEqual([[], []])
  const response = finish(session, session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] }))
  expect(response.ok, response.error).toBe(true)
  expect(response.state.round).toBe(6)
  expect(response.state.players[0]!.resources.grain).toBe(1)
  expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[{ kind: 'grain', remaining: 3 }], []])
})

it('Apiary crop permissions exclude Wood Field wood in both candidates and submitted selections', () => {
  const session = make({ woodField: true })
  const pending = enter(session)
  if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'farm-select' || pending.interaction.request.farm.farmType !== 'sow') throw new Error('Expected Apiary Sow')
  expect(pending.interaction.request.farm.selectableFields.some(field => field.allowedCrops.includes('wood'))).toBe(false)
  const rejected = session.commitSelectionChoice(0, { crops: [{ row: -1, col: 4075, crop: 'wood' }] })
  expect(rejected.ok).toBe(false)
  expect(rejected.state.players[0]!.resources).toMatchObject({ wood: 2, grain: 2, vegetable: 1 })
  const response = finish(session, session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'vegetable' }] }))
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, grain: 2, vegetable: 0 })
  expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'vegetable', remaining: 2 }])
})

it('empty input and another actor are rejected before an owner vegetable retry', () => {
  const session = make()
  enter(session)
  for (const rejected of [session.commitSelectionChoice(0, { crops: [] }), session.commitSelectionChoice(1, { crops: [{ row: 0, col: 0, crop: 'vegetable' }] })]) {
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 1 })
    expect(rejected.state.players[0]!.fields.map(field => field.stacks)).toEqual([[], []])
  }
  const response = finish(session, session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'vegetable' }] }))
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.vegetable).toBe(0)
})

it('declining Apiary leaves both fields empty and preserves every seed', () => {
  const response = enter(make(), false)
  expect(response.state.round).toBe(6)
  expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 1 })
  expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[], []])
})

it('wood alone cannot provide an Apiary crop selection', () => {
  const session = make({ seeds: false, woodField: true })
  const pending = enter(session)
  expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow', selectableFields: [] } } })
  const rejected = session.commitSelectionChoice(0, { crops: [{ row: -1, col: 4075, crop: 'wood' }] })
  expect(rejected.ok).toBe(false)
  expect(rejected.state.players[0]!.resources.wood).toBe(2)
  const undone = session.undoStep()
  expect(undone.ok, undone.error).toBe(true)
  const response = undone
  expect(response.state.players[0]!.resources.wood).toBe(2)
  expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[], []])
})

it('an Apiary in hand cannot provide its end-of-work Sow', () => {
  const session = make({ played: false })
  const response = enter(session)
  expect(response.state.players[0]!.resources.grain).toBe(2)
  const rejected = session.takeAction(0, CARD)
  expect(rejected.ok).toBe(false)
  expect(rejected.state.players[0]!.fields.map(field => field.stacks)).toEqual([[], []])
})

it('Apiary restricted Sow does not earn an unconditional Seaweed bonus', () => {
  const session = make({ seaweed: true })
  enter(session)
  const response = finish(session, session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] }))
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.grain).toBe(1)
})
