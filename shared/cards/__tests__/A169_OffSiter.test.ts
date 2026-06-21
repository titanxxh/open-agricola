import { describe, expect, it } from 'vitest'
import './setup-register-all'
import { getExtraRoomCapacity } from '../card-effects'
import type { PlayerState } from '../../contract/types'

const player = (improvements: string[], minorPlayed: string[] = []): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  rooms: 2,
  familySize: 2,
  fields: [],
  pastures: [],
  stables: [],
  improvements,
  minorPlayed,
  occupationPlayed: ['A169_OffSiter'],
  minorHand: [],
  occupationHand: [],
  activeModifiers: [],
  cardStates: {},
  hasBeggingCard: false,
  usedWorkers: 0,
  totalWorkers: 2,
})

describe('A169 Off-Siter', () => {
  it('provides room for 1 person once played major improvements total 9 printed building resources', () => {
    expect(getExtraRoomCapacity(player(['Major_Well', 'Major_ClayOven', 'Major_Fireplace1']))).toBe(1)
  })

  it('does not provide room at 8 printed building resources', () => {
    expect(getExtraRoomCapacity(player(['Major_Well', 'Major_ClayOven']))).toBe(0)
  })

  it('counts only major improvements and minor cards that also count as major', () => {
    expect(getExtraRoomCapacity(player(['Major_Well', 'Major_ClayOven'], ['D60_LargePottery']))).toBe(1)
    expect(getExtraRoomCapacity(player(['Major_Well', 'Major_ClayOven'], ['A1_Shelter']))).toBe(0)
  })
})
