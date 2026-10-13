import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'

const CARD_ID = 'A165_PigBreeder'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (round: number, boar: number, capacity = true) => {
  const session = createWorkSession({ seed: 2165, configure: state => {
    state.round = round
    state.players.forEach(player => { player.resources.food = 60; markAllWorkersUsed(state, player) })
    const owner = state.players[0]!
    owner.occupationPlayed = [CARD_ID]
    owner.resources.boar = boar
    owner.pastures = capacity ? [{ id: 'boar-pasture', tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }], stables: 0, animalType: boar ? 'boar' : null, animalCount: Math.min(boar, 4) }] : []
    if (boar > 4) { owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, boar - 4).map(tile => [`${tile.row}-${tile.col}`, 'boar'])); }
    if (!capacity && boar) { owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, boar).map(tile => [`${tile.row}-${tile.col}`, 'boar'])); }
  } })
  expect(session.state.players).toHaveLength(2)
  sessions.push(session)
  return session
}

describe('Pig Breeder due breeding', () => {
  it('round twelve breeds only boar and keeps the card as source', () => {
    const response = setup(12, 2).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(3)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Missing animal arrangement')
    expect(response.interaction.playerIndex).toBe(0)
    expect(response.state.events.some(event => event.type === 'farm.animalBred' && event.sourceCardId === CARD_ID)).toBe(true)
    expect(response.scores).toBeDefined()
  })
  it.each([0, 1])('round twelve does not breed %i boar', count => {
    const response = setup(12, count).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(count)
    expect(response.state.events.some(event => event.type === 'farm.animalBred' && event.sourceCardId === CARD_ID)).toBe(false)
  })
  it('a full pasture does not receive an extra animal', () => {
    const response = setup(12, 5).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(5)
  })
  it('round ten has no extra breeding', () => {
    const response = setup(10, 2).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })
})
