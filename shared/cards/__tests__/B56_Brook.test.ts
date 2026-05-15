import { describe, expect, it } from 'vitest'
import { meetsCardPrerequisites } from '../helpers/prerequisites'
import { getRegisteredMinorImprovement } from '../catalog'
import '../B/B56_Brook'
import type { GameState, PlayerState } from '../../contract/types'

const CARD_ID = 'B56_Brook'

const makePlayer = (id: string): PlayerState =>
  ({
    id,
    name: id,
    resources: { food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, wood: 0, clay: 0, reed: 0, stone: 0 },
    fields: [],
    pastures: [],
    roomTiles: [],
    stableTiles: [],
    fenceSegments: [],
    occupationHand: [],
    occupationPlayed: [],
    minorHand: [],
    minorPlayed: [],
    improvements: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    placedFarmers: 0,
    houseType: 'wood',
    familySize: 2,
    cardStates: {},
  }) as unknown as PlayerState

const makeState = (_player: PlayerState, fishingTakenBy: string[]): GameState =>
  ({
    actionSpaces: [
      {
        id: 'fishing',
        takenBy: fishingTakenBy.map((pid) => ({ playerId: pid, workerId: `${pid}-w1` })),
        resources: {},
      },
    ],
  }) as unknown as GameState

describe('B56_Brook prerequisite (BGA isBuyable: farmer on Fishing space)', () => {
  it('passes when the player has a farmer on the Fishing action space', () => {
    const card = getRegisteredMinorImprovement(CARD_ID)!
    const player = makePlayer('p1')
    const state = makeState(player, ['p1'])
    expect(meetsCardPrerequisites(player, card as never, 1, state)).toBe(true)
  })

  it('fails when only another player has a farmer on the Fishing space', () => {
    const card = getRegisteredMinorImprovement(CARD_ID)!
    const player = makePlayer('p1')
    const state = makeState(player, ['p2'])
    expect(meetsCardPrerequisites(player, card as never, 1, state)).toBe(false)
  })

  it('fails when the Fishing space is empty', () => {
    const card = getRegisteredMinorImprovement(CARD_ID)!
    const player = makePlayer('p1')
    const state = makeState(player, [])
    expect(meetsCardPrerequisites(player, card as never, 1, state)).toBe(false)
  })
})
