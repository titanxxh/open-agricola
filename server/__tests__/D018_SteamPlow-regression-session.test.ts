import { afterEach, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const CARD = 'D018_SteamPlow'

function make(wood = 2, played = true, fullFarm = false) {
  const session = createWorkSession({ configure(state) {
    state.round = 13
    state.players.forEach(player => { player.resources.food = 20 })
    const owner = state.players[0]!
    owner.minorPlayed = played ? [CARD, 'C020_MolePlow'] : ['C020_MolePlow']
    if (!played) owner.minorHand = [CARD]
    owner.resources.wood = wood
    if (fullFarm) {
      owner.minorPlayed = [CARD]
      const rooms = new Set(owner.roomTiles.map(tile => `${tile.row}-${tile.col}`))
      owner.fields = Array.from({ length: 15 }, (_, index) => ({ row: Math.floor(index / 5), col: index % 5, stacks: [] }))
        .filter(tile => !rooms.has(`${tile.row}-${tile.col}`))
    }
  } })
  sessions.push(session)
  return session
}

function finish(session: GameSession, response: SessionResponse, accept = true, absentSource?: string): SessionResponse {
  for (let step = 0; step < 30 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    const request = interaction.request
    if (absentSource) expect(JSON.stringify(interaction)).not.toContain(absentSource)
    if (request.kind === 'confirm-next-player') return response
    if (request.kind === 'farm-select' && request.farm.farmType === 'plow') {
      response = session.commitSelectionChoice(interaction.playerIndex, { tile: request.farm.selectableTiles[0]! })
    } else if (request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(interaction.playerIndex, 'confirm')
    } else if (request.kind === 'choice' || request.kind === 'select-trigger') {
      const option = request.options.find(option => accept
        ? !['__skip__', '__pass__', '__done__'].includes(option.value)
        : ['__skip__', '__pass__', '__done__'].includes(option.value))
      expect(option, JSON.stringify(interaction)).toBeDefined()
      response = session.resolveChoice(interaction.playerIndex, option!.value)
    } else {
      throw new Error(`Unexpected interaction: ${JSON.stringify(interaction)}`)
    }
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

function round(session: GameSession, occupiedFarmland = false, accept = true, absentSource?: string) {
  let response = session.getState()
  const spaces = ['grain-seeds', occupiedFarmland ? 'farmland' : 'forest', 'clay-pit', 'reed-bank']
  for (const space of spaces) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.interaction.stateId).toBe('idle')
    response = session.takeAction(response.state.currentPlayerIndex, space)
    expect(response.ok, response.error).toBe(true)
    response = finish(session, response)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-next-player') throw new Error('Expected last turn handoff')
  response = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
  expect(response.ok, response.error).toBe(true)
  return finish(session, response, accept, absentSource)
}

it('paid workerless Farmland use triggers Mole Plow without placing another person', () => {
  const response = round(make())
  expect(response.state.round).toBe(14)
  expect(response.state.players[0]!.fields).toHaveLength(2)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 15 })
  expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(4)
})

it('workerless use also works while the opponent occupies Farmland', () => {
  const response = round(make(), true)
  expect(response.state.players[0]!.fields).toHaveLength(2)
  expect(response.state.players[1]!.fields).toHaveLength(1)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 15 })
  expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(4)
})

it('declining Steam Plow leaves its payment and both plows unused', () => {
  const response = round(make(), false, false)
  expect(response.state.players[0]!.fields).toHaveLength(0)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 16 })
})

it('one wood cannot pay for a Farmland use', () => {
  const response = round(make(1))
  expect(response.state.players[0]!.fields).toHaveLength(0)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 16 })
})

it('a Steam Plow in hand cannot provide its return-home use', () => {
  const session = make(2, false)
  const response = round(session)
  expect(response.state.players[0]!.fields).toHaveLength(0)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 16 })
  const rejected = session.takeAction(0, CARD)
  expect(rejected.ok).toBe(false)
  expect(rejected.state.players[0]!.fields).toHaveLength(0)
})

it('a full legal farm offers no Steam Plow payment and continues to the next round', () => {
  const session = make(2, true, true)
  const before = session.getState()
  expect(before.state.players[0]!.roomTiles).toHaveLength(2)
  expect(before.state.players[0]!.fields).toHaveLength(13)
  const response = round(session, false, true, CARD)
  expect(response.state.round).toBe(14)
  expect(response.state.players[0]!.fields).toHaveLength(13)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 16 })
  expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(4)
})
