import { describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation } from './_helpers/card-regression-session'

const CARD = 'E138_LivestockExpert'
const farm = (state: GameState, animal: 'sheep' | 'boar' | 'cattle', mode: 'pasture' | 'mixed') => {
  const p = state.players[0]!
  p.pastures = [{ id: 'livestock', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], animalType: animal, animalCount: 2 }]
  p.fenceSegments = ['H-0-1','H-0-2','H-1-1','H-1-2','V-0-1','V-0-3']
    .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  p.stableTiles = [{ row: 0, col: 1 }]
  p.resources[animal] = 2
  if (mode === 'mixed') {
    p.houseAnimals = { '1-0': animal }
    p.stableTiles.push({ row: 0, col: 3 })
    p.stableAnimals = { '0-3': animal }
    p.resources[animal] = 4
  }
}
const setup = (round: number, animal: 'sheep' | 'boar' | 'cattle', mode: 'pasture' | 'mixed') => createWorkSession({
  seed: 1166, options: { playerCount: 3 }, configure: state => {
    state.round = round
    state.players.forEach(p => { p.occupationHand = ['__test_placeholder__']; p.minorHand = ['__test_placeholder__'] })
    state.players[0]!.occupationHand = [CARD]
    farm(state, animal, mode)
  },
})

describe('E138 counts owned placed farm animals exactly once', () => {
  it.each(['sheep','boar','cattle'] satisfies Array<'sheep' | 'boar' | 'cattle'>)('real round-eleven Lessons doubles two %s before any reorganization', animal => {
    const session = setup(11, animal, 'pasture')
    const reward = playOccupation(session, CARD)
    expect(reward.ok, reward.error).toBe(true)
    // This assertion precedes reorg: discarding an over-award cannot make it pass.
    expect(reward.state.players[0]!.resources[animal]).toBe(4)
    expect(reward.interaction.stateId).toBe('wait')
    if (reward.interaction.stateId !== 'wait' || reward.interaction.request.kind !== 'animal-reorg') throw new Error('Expected animal placement')
    const zones = reward.interaction.request.zones.map(zone => zone.id === 'livestock' ? { ...zone, animalType: animal, animalCount: 4 } : zone)
    const placed = session.resolveChoice(0,'confirm',{zones})
    expect(placed.ok,placed.error).toBe(true)
    expect(placed.state.players[0]!.resources[animal]).toBe(4)
    expect(placed.state.players[0]!.pastures[0]!.animalCount).toBe(4)
    session.dispose()
  })

  it('a house pet and loose-stable animal are counted alongside the pasture', () => {
    const session = setup(11,'sheep','mixed')
    const reward = playOccupation(session,CARD)
    expect(reward.ok,reward.error).toBe(true)
    expect(reward.state.players[0]!.resources.sheep).toBe(8)
    session.dispose()
  })

  it('round twelve buys the occupation without multiplying existing farm animals', () => {
    const session = setup(12,'sheep','pasture')
    const response = playOccupation(session,CARD)
    expect(response.ok,response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    session.dispose()
  })
})
