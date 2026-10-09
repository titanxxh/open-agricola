import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/E/E036_HerbalGarden'

const CARD_ID = 'E036_HerbalGarden'

const setup = (animalCounts: [number, number]) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources.sheep = animalCounts[0] + animalCounts[1]
  player.pastures = [
    {
      id: 'pasture-1',
      tiles: [{ row: 0, col: 0 }],
      size: 1,
      stables: 0,
      animalType: animalCounts[0] > 0 ? 'sheep' : null,
      animalCount: animalCounts[0],
    },
    {
      id: 'pasture-2',
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
      size: 2,
      stables: 0,
      animalType: animalCounts[1] > 0 ? 'sheep' : null,
      animalCount: animalCounts[1],
    },
  ]
  session.loadState(state)
  const loadedState = session.getState().state
  return { state: loadedState, player: loadedState.players[0]! }
}

describe('E036_HerbalGarden animal zones', () => {
  it('groups every pasture without changing capacity', () => {
    const { state, player } = setup([1, 0])
    const pastures = computeAnimalZones(player, state).filter((zone) => zone.zoneType === 'pasture')
    const groupId = pastures[0]!.requiredEmptyZoneGroupIds?.[0]

    expect(groupId).toBeTypeOf('string')
    expect(pastures.every((zone) => zone.requiredEmptyZoneGroupIds?.includes(groupId!))).toBe(true)
    expect(pastures.map((zone) => zone.capacity)).toEqual([2, 4])
    expect(pastures.every((zone) => zone.blocked !== true)).toBe(true)
  })

  it('requires a mandatory reorganization only while every pasture is occupied', () => {
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
