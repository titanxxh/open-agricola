import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { checkCustomPrerequisite } from '../../shared/cards/helpers/prerequisite-registry'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getPlayedCardKeys } from '../../shared/game/player'
import type { GameState, PlayerState } from '../../shared/game/types'

import '../../shared/cards/A/A3_PaperKnife'
import { A3_PaperKnife } from '../../shared/cards/A/A3_PaperKnife'

const CARD_ID = 'A3_PaperKnife'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('A3_PaperKnife prerequisite', () => {
  it('registers "3 Occupations In Hand" as a custom prerequisite', () => {
    const player = createPlayer('p1')
    player.occupationHand = []
    expect(checkCustomPrerequisite('3 Occupations In Hand', player)).toBe(false)

    player.occupationHand = ['A1', 'A2']
    expect(checkCustomPrerequisite('3 Occupations In Hand', player)).toBe(false)

    player.occupationHand = ['A1', 'A2', 'A3']
    expect(checkCustomPrerequisite('3 Occupations In Hand', player)).toBe(true)

    player.occupationHand = ['A1', 'A2', 'A3', 'A4']
    expect(checkCustomPrerequisite('3 Occupations In Hand', player)).toBe(true)
  })

  it('is enforced by meetsCardPrerequisites on the card definition', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer', 'A124_Knapper']
    expect(meetsCardPrerequisites(player, A3_PaperKnife)).toBe(false)

    player.occupationHand.push('A27_OvenSite')
    expect(meetsCardPrerequisites(player, A3_PaperKnife)).toBe(true)
  })
})

describe('A3_PaperKnife onBuy', () => {
  it('does nothing when fewer than 3 occupations in hand', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer', 'A124_Knapper']
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
    // Hand unchanged.
    expect(player.occupationHand).toEqual(['A9_SheepFarmer', 'A124_Knapper'])
    expect(player.occupationPlayed).toEqual([])
  })

  it('plays one of the occupations in hand for free when ≥3 are held', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer', 'A124_Knapper', 'A27_OvenSite']
    const handSnapshot = [...player.occupationHand]
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any).type).toBe('leaf')
    expect((flow as any).actionId).toBe('noop')

    // Exactly one occupation moved hand → played.
    expect(player.occupationPlayed).toHaveLength(1)
    expect(player.occupationHand).toHaveLength(2)
    const played = player.occupationPlayed[0]!
    expect(handSnapshot).toContain(played)
    expect(player.occupationHand).not.toContain(played)
    expect(getPlayedCardKeys(player)).toContain(`occupation:${played}`)
  })

  it('does not consume any resources (free play)', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer', 'A124_Knapper', 'A27_OvenSite']
    player.resources.food = 5
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    // Food untouched.
    expect(player.resources.food).toBe(5)
  })

  it('selection is deterministic given the same seed + hand + round', () => {
    const a = createPlayer('p1')
    const b = createPlayer('p1')
    a.occupationHand = ['A9_SheepFarmer', 'A124_Knapper', 'A27_OvenSite']
    b.occupationHand = ['A9_SheepFarmer', 'A124_Knapper', 'A27_OvenSite']
    const stateA = createState([a])
    const stateB = createState([b])
    const effect = getCardEffect(CARD_ID)!
    effect.onBuy!(stateA, a)
    effect.onBuy!(stateB, b)
    expect(a.occupationPlayed[0]).toBe(b.occupationPlayed[0])
  })
})
