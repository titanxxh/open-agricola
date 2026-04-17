import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../B/B143_ClayWarden'
import '../A/A153_PigOwner'
import '../C/C30_HalfTimberedHouse'
import '../D/D34_LuxuriousHostel'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (playerCount: number, ...players: PlayerState[]): GameState => {
  const ps = players.length ? players : [createPlayer('p1')]
  while (ps.length < playerCount) ps.push(createPlayer(`p${ps.length + 1}`))
  return ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players: ps,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState
}

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

// ===== B143 Clay Warden — player count bonus =====
describe('B143_ClayWarden opponent hollow bonus', () => {
  const runListener = (playerCount: number) => {
    const listener = findListener('B143-clay-warden-opponent-hollow')!
    const p1 = createPlayer('p1')
    p1.occupationPlayed = ['B143_ClayWarden']
    const p2 = createPlayer('p2')
    const state = createState(playerCount, p1, p2)
    return executeCardListener(listener, {
      state, player: p1, space: createSpace('hollow-4'),
      actionId: 'place-farmer', phase: 'after',
      triggerPlayer: p2,
    } as any)
  }

  it('2 players: 1 clay', () => {
    const r = runListener(2) as any
    expect(r?.flow?.params).toEqual({ clay: 1 })
  })
  it('3 players: 2 clay (+1 additional clay)', () => {
    const r = runListener(3) as any
    expect(r?.flow?.params).toEqual({ clay: 2 })
  })
  it('4 players: 1 clay + 1 food (additional food)', () => {
    const r = runListener(4) as any
    expect(r?.flow?.params).toEqual({ clay: 1, food: 1 })
  })
})

// ===== A153 Pig Owner — on-farm pig count =====
describe('A153_PigOwner trigger uses on-farm pig count', () => {
  const listener = () => findListener('A153-pig-owner-anytime')!
  it('does not trigger with 5 pigs only in supply (resources.boar)', () => {
    const p = createPlayer()
    p.occupationPlayed = ['A153_PigOwner']
    p.resources.boar = 5 // supply total but none on farm
    const state = createState(2, p)
    const r = executeCardListener(listener(), {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(r).toBeUndefined()
  })
  it('triggers with 5 pigs in pasture', () => {
    const p = createPlayer()
    p.occupationPlayed = ['A153_PigOwner']
    p.pastures = [{ animalType: 'boar', animalCount: 5 } as any]
    const state = createState(2, p)
    const r = executeCardListener(listener(), {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(r?.flow?.type).toBe('seq')
  })
  it('triggers with 2 pigs pasture + 2 pigs house + 1 pig unfenced stable', () => {
    const p = createPlayer()
    p.occupationPlayed = ['A153_PigOwner']
    p.pastures = [{ animalType: 'boar', animalCount: 2 } as any]
    p.houseAnimalType = 'boar'
    p.houseAnimalCount = 2
    p.stableAnimals = { 's1': 'boar' }
    const state = createState(2, p)
    const r = executeCardListener(listener(), {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(r?.flow?.type).toBe('seq')
  })
  it('does not trigger with only 4 pigs on farm', () => {
    const p = createPlayer()
    p.occupationPlayed = ['A153_PigOwner']
    p.pastures = [{ animalType: 'boar', animalCount: 4 } as any]
    const state = createState(2, p)
    const r = executeCardListener(listener(), {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(r).toBeUndefined()
  })
})

// ===== C30 + D34 stone-house bonus exclusivity =====
describe('stone-house-bonus exclusivity (C30 vs D34)', () => {
  const c30 = () => getCardEffect('C30_HalfTimberedHouse')!
  const d34 = () => getCardEffect('D34_LuxuriousHostel')!
  const state = () => createState(2, createPlayer())

  it('only C30 played: C30 scores normally', () => {
    const p = createPlayer()
    p.minorPlayed = ['C30_HalfTimberedHouse']
    p.houseType = 'stone'
    p.rooms = 3
    expect(c30().computeBonusScore!(state(), p)).toBe(3)
  })
  it('only D34 played: D34 scores 4', () => {
    const p = createPlayer()
    p.minorPlayed = ['D34_LuxuriousHostel']
    p.houseType = 'stone'
    p.rooms = 3
    p.familySize = 2
    expect(d34().computeBonusScore!(state(), p)).toBe(4)
  })
  it('both played, C30 scores more (5 rooms > D34=4): C30 wins, D34 gets 0', () => {
    const p = createPlayer()
    p.minorPlayed = ['C30_HalfTimberedHouse', 'D34_LuxuriousHostel']
    p.houseType = 'stone'
    p.rooms = 5
    p.familySize = 2
    expect(c30().computeBonusScore!(state(), p)).toBe(5)
    expect(d34().computeBonusScore!(state(), p)).toBe(0)
  })
  it('both played, D34 scores more (2 stone rooms vs D34=4): D34 wins, C30 gets 0', () => {
    const p = createPlayer()
    p.minorPlayed = ['C30_HalfTimberedHouse', 'D34_LuxuriousHostel']
    p.houseType = 'stone'
    p.rooms = 3
    p.familySize = 2
    // C30 would give 3, D34 gives 4. D34 wins.
    expect(c30().computeBonusScore!(state(), p)).toBe(0)
    expect(d34().computeBonusScore!(state(), p)).toBe(4)
  })
  it('both played, tie: first declared (C30) wins', () => {
    const p = createPlayer()
    p.minorPlayed = ['C30_HalfTimberedHouse', 'D34_LuxuriousHostel']
    p.houseType = 'stone'
    p.rooms = 4
    p.familySize = 2
    // C30=4, D34=4 → C30 wins by tie-break
    expect(c30().computeBonusScore!(state(), p)).toBe(4)
    expect(d34().computeBonusScore!(state(), p)).toBe(0)
  })
  it('neither scored (wood house): both 0', () => {
    const p = createPlayer()
    p.minorPlayed = ['C30_HalfTimberedHouse', 'D34_LuxuriousHostel']
    p.houseType = 'wood'
    p.rooms = 5
    expect(c30().computeBonusScore!(state(), p)).toBe(0)
    expect(d34().computeBonusScore!(state(), p)).toBe(0)
  })
})
