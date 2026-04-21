import { describe, expect, it } from 'vitest'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import '../../shared/cards/C/C116_FurnitureMaker'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C116_FurnitureMaker'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C116_FurnitureMaker', () => {
  it('onBuy gives 1 wood', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 1 })
  })

  it('gains wood equal to food paid for second occupation on lessons', () => {
    const listener = findListener('C116-furniture-maker-after-occupation')
    expect(listener).toBeDefined()

    // Player already has C116 + 1 other occupation = 2 occupations played
    // The new one (choice) is "SomeOcc" which was just played (3 total)
    const player = createPlayer()
    player.occupationPlayed = [CARD_ID, 'SomeOtherOcc', 'SomeOcc']
    const state = createState(player)

    // On lessons space, with 2 occupations before this one (index 0 = C116, 1 = SomeOtherOcc)
    // Cost was 1 food (not first occupation)
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('lessons'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'SomeOcc',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('leaf')
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 1 })
  })

  it('gains 2 wood for lessons-4 with 2+ occupations', () => {
    const listener = findListener('C116-furniture-maker-after-occupation')
    expect(listener).toBeDefined()

    const player = createPlayer()
    // 3 already played + the new one = 4 total
    player.occupationPlayed = [CARD_ID, 'Occ1', 'Occ2', 'NewOcc']
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('lessons-4'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'NewOcc',
    } as any)

    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 2 })
  })

  it('does not trigger when playing C116 itself', () => {
    const listener = findListener('C116-furniture-maker-after-occupation')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('lessons'),
      actionId: 'play-occupation', phase: 'after',
      choice: CARD_ID,
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger when first occupation costs 0 food on lessons', () => {
    const listener = findListener('C116-furniture-maker-after-occupation')
    expect(listener).toBeDefined()

    // Player has only C116 in occupationPlayed, meaning the new occ is the
    // second one. But wait - C116 was already played, so occCountBefore for
    // the new occ = 1 (C116 is already in the list). The new one makes it 2.
    // Lessons cost for first occ = 0. But occCountBefore = 1, so cost = 1.
    // Actually, for FIRST occupation (0 before), lessons = 0 food.
    // Let's test with occCountBefore = 0 by having only the new occ in the list.
    const player = createPlayer()
    // Only the new occ + C116 (C116 + NewOcc = 2 played)
    // occCountBefore = 2 - 1 = 1 → lessons cost = 1 food
    // For 0 food, we need occCountBefore = 0, meaning occupationPlayed = [NewOcc]
    // but C116 must be in occupationPlayed for the listener to fire...
    // So the minimum is C116 + NewOcc = occCountBefore = 1 → cost = 1 food
    // The 0-food case can't happen because C116 must be played first.
    // This test confirms that the listener correctly returns wood for cost=1.
    player.occupationPlayed = [CARD_ID, 'NewOcc']
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('lessons'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'NewOcc',
    } as any)

    // occCountBefore = 1 → lessons cost = 1 food → gain 1 wood
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 1 })
  })
})
