import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/E/E033_BeaverColony'

const CARD_ID = 'E033_BeaverColony'

const setup = (stabledCounts: [number, number]) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources.sheep = stabledCounts[0] + stabledCounts[1] + 1
  player.pastures = [
    {
      id: 'stabled-1',
      tiles: [{ row: 0, col: 0 }],
      size: 1,
      stables: 1,
      animalType: stabledCounts[0] > 0 ? 'sheep' : null,
      animalCount: stabledCounts[0],
    },
    {
      id: 'unstabled',
      tiles: [{ row: 0, col: 1 }],
      size: 1,
      stables: 0,
      animalType: 'sheep',
      animalCount: 1,
    },
    {
      id: 'stabled-2',
      tiles: [{ row: 0, col: 2 }],
      size: 1,
      stables: 1,
      animalType: stabledCounts[1] > 0 ? 'sheep' : null,
      animalCount: stabledCounts[1],
    },
  ]
  player.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 2 }]
  session.loadState(state)
  const loadedState = session.getState().state
  return { state: loadedState, player: loadedState.players[0]! }
}

describe('E033_BeaverColony animal zones', () => {
  it('groups every stabled pasture without changing capacity', () => {
    const { state, player } = setup([1, 0])
    const pastures = computeAnimalZones(player, state).filter((zone) => zone.zoneType === 'pasture')
    const groupId = pastures[0]!.requiredEmptyZoneGroupIds?.[0]

    expect(groupId).toBeTypeOf('string')
    expect(pastures[0]!.requiredEmptyZoneGroupIds).toContain(groupId)
    expect(pastures[1]!.requiredEmptyZoneGroupIds).toBeUndefined()
    expect(pastures[2]!.requiredEmptyZoneGroupIds).toContain(groupId)
    expect(pastures.map((zone) => zone.capacity)).toEqual([4, 2, 4])
    expect(pastures.every((zone) => zone.blocked !== true)).toBe(true)
  })

  it('requires a mandatory reorganization only while every stabled pasture is occupied', () => {
    const occupied = setup([1, 1])
    expect(getCardEffect(CARD_ID)!.onBuy!(occupied.state, occupied.player)).toMatchObject({
      type: 'leaf',
      actionId: 'reorganize',
      sourceCard: CARD_ID,
    })

    const alreadyValid = setup([1, 0])
    expect(getCardEffect(CARD_ID)!.onBuy!(alreadyValid.state, alreadyValid.player)).toBeUndefined()
  })
})
