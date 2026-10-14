import { afterEach, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = 'E073_Scythe'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function make(cropFields = false, played = true) {
  const session = createWorkSession({ configure(state) {
    state.round = 4
    state.players.forEach(player => { player.resources.food = 20 })
    const owner = state.players[0]!
    owner.minorPlayed = played ? [CARD, 'D075_WoodField'] : ['D075_WoodField']
    if (!played) owner.minorHand = [CARD]
    owner.occupationPlayed = ['A100_Curator']
    owner.resources.wood = 2
    if (cropFields) owner.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]
  } })
  sessions.push(session)
  return session
}
function finish(session: GameSession, response: SessionResponse, accept = true) {
  for (let step = 0; step < 30 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    const request = interaction.request
    if (request.kind === 'confirm-next-player') return response
    if (request.kind === 'farm-select' && request.farm.farmType === 'sow') {
      const crops = request.farm.selectableFields.filter(field => field.allowedCrops.includes('wood'))
        .map(field => ({ row: field.tile.row, col: field.tile.col, crop: 'wood' as const }))
      expect(crops).toHaveLength(2)
      response = session.commitSelectionChoice(interaction.playerIndex, { crops })
    } else if (request.kind === 'choice' || request.kind === 'select-trigger') {
      const option = request.options.find(option => option.value === 'sow' || option.labelKey === 'actions.sow.name')
        ?? request.options.find(option => accept ? !['__skip__', '__pass__', '__done__'].includes(option.value) : ['__skip__', '__pass__', '__done__'].includes(option.value))
      expect(option, JSON.stringify(interaction)).toBeDefined()
      response = session.resolveChoice(interaction.playerIndex, option!.value)
    } else if (request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(interaction.playerIndex, 'confirm')
    } else throw new Error(`Unexpected interaction: ${JSON.stringify(interaction)}`)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}
function harvest(session: GameSession, accept = true) {
  let response = session.getState()
  for (const space of ['grain-utilization', 'reed-bank', 'clay-pit', 'forest']) {
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
it('Scythe cannot fully harvest wood planted by a real Wood Field Sow', () => {
  const response = harvest(make())
  expect(response.state.round).toBe(5)
  expect(response.state.players[0]!.resources.wood).toBe(2)
  expect(response.state.players[0]!.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
    { crop: 'wood', remaining: 2 }, { crop: 'wood', remaining: 2 },
  ])
})

it('Scythe fully harvests one grain field while the other field and Wood Field harvest normally', () => {
  const response = harvest(make(true))
  const owner = response.state.players[0]!
  expect(owner.resources).toMatchObject({ grain: 3, vegetable: 1, wood: 2 })
  expect(owner.fields.map(field => field.stacks)).toEqual([[], [{ kind: 'vegetable', remaining: 1 }]])
  expect(owner.cardStates[CARD]?.extraData?.fullReapPosition).toBeUndefined()
})

it('declining Scythe preserves the ordinary one-crop harvest on every field', () => {
  const response = harvest(make(true), false)
  const owner = response.state.players[0]!
  expect(owner.resources).toMatchObject({ grain: 1, vegetable: 1, wood: 2 })
  expect(owner.fields.map(field => field.stacks)).toEqual([
    [{ kind: 'grain', remaining: 2 }], [{ kind: 'vegetable', remaining: 1 }],
  ])
})

it('a Scythe in hand cannot fully harvest the crop field', () => {
  const session = make(true, false)
  const response = harvest(session)
  expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, wood: 2 })
  const rejected = session.resolveChoice(0, CARD)
  expect(rejected.ok).toBe(false)
  expect(rejected.state.players[0]!.resources.grain).toBe(1)
})
