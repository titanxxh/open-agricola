import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

// Force registration of card effects / listeners for these cards
import '../E/E105_Pioneer'
import '../B/B26_AgrarianFences'
import '../C/C35_LanternHouse'
import '../C/C39_StudioBoat'
import '../C/C46_Mandoline'
import '../D/D14_HammerCrusher'

import { C35_LanternHouse } from '../C/C35_LanternHouse'
import { C39_StudioBoat } from '../C/C39_StudioBoat'
import { C46_Mandoline } from '../C/C46_Mandoline'
import { D14_HammerCrusher } from '../D/D14_HammerCrusher'

// ---- minimal factories (mirror those in batch-bga-align-7.test.ts) ----

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
  const ps = players.length ? players : [createPlayer()]
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

// ---- E105 Pioneer ----

describe('E105_Pioneer (verification)', () => {
  it('has onBuy XOR producing 4 building-resource + food options', () => {
    const effect = getCardEffect('E105_Pioneer')
    expect(effect?.onBuy).toBeDefined()
    const flow: any = effect!.onBuy!({} as any, createPlayer())
    expect(flow.type).toBe('xor')
    expect(flow.children.length).toBe(4)
  })

  it('registers the after-place-farmer listener', () => {
    const listener = findListener('E105-pioneer-after-place-farmer')
    expect(listener).toBeDefined()
    expect(listener!.phases).toContain('after')
    expect(listener!.actions).toContain('place-farmer')
  })

  it('triggers when place-farmer targets the most recently revealed space', () => {
    const listener = findListener('E105-pioneer-after-place-farmer')!
    const p = createPlayer()
    p.occupationPlayed = ['E105_Pioneer']
    const state = createState(2, p)
    // round=3 → the most recently revealed space is roundActionOrder[2]
    state.roundActionOrder[2] = 'action-card-round3' as any
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('action-card-round3'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result!.flow as any).type).toBe('xor')
  })

  it('does not trigger when acting on a different space', () => {
    const listener = findListener('E105-pioneer-after-place-farmer')!
    const p = createPlayer()
    p.occupationPlayed = ['E105_Pioneer']
    const state = createState(2, p)
    state.roundActionOrder[2] = 'action-card-round3' as any
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('other-space'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ---- B26 AgrarianFences ----

describe('B26_AgrarianFences (verification + bake-bread fix)', () => {
  it('replaces sow within grain-utilization', () => {
    const listener = findListener('B26-agrarian-fences-replace-sow-on-grain-utilization')
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('sow')
    expect(listener!.phases).toContain('computeReplace')
  })

  it('BGA parity: replaces bake-bread within grain-utilization', () => {
    const listener = findListener('B26-agrarian-fences-replace-bake-on-grain-utilization')
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('bake-bread')
    expect(listener!.phases).toContain('computeReplace')
  })

  it('bake-bread replacement offers fence or seq(bake-bread, fence)', () => {
    const listener = findListener('B26-agrarian-fences-replace-bake-on-grain-utilization')!
    const p = createPlayer()
    p.minorPlayed = ['B26_AgrarianFences']
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('grain-utilization'),
      actionId: 'bake-bread', phase: 'computeReplace',
    } as any)
    expect(result?.decline).toBe(true)
    const flow = result!.alternativeFlow as any
    expect(flow.type).toBe('xor')
    expect(flow.children.length).toBe(2)
    expect(flow.children[0].actionId).toBe('fence')
    expect(flow.children[1].type).toBe('seq')
    expect(flow.children[1].children.map((c: any) => c.actionId)).toEqual(['bake-bread', 'fence'])
  })

  it('bake-bread listener no-ops outside grain-utilization', () => {
    const listener = findListener('B26-agrarian-fences-replace-bake-on-grain-utilization')!
    const p = createPlayer()
    p.minorPlayed = ['B26_AgrarianFences']
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('bake-bread'),
      actionId: 'bake-bread', phase: 'computeReplace',
    } as any)
    expect(result).toBeUndefined()
  })

  it('bake-bread isDoable listener is registered', () => {
    const listener = findListener('B26-agrarian-fences-isdoable-bake')
    expect(listener).toBeDefined()
  })
})

// ---- C35 LanternHouse ----

describe('C35_LanternHouse (verification + prerequisite fix)', () => {
  it('BGA parity: has occupationPrerequisites { max: 0 }', () => {
    expect((C35_LanternHouse as any).occupationPrerequisites).toEqual({ max: 0 })
  })

  it('BGA parity: has "No Occupations" text prerequisite', () => {
    expect((C35_LanternHouse as any).prerequisite).toBe('No Occupations')
  })

  it('scoring: -1 VP per card remaining in hand when played', () => {
    const effect = getCardEffect('C35_LanternHouse')
    expect(effect?.computeBonusScore).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['C35_LanternHouse']
    p.minorHand = ['x', 'y'] as any
    p.occupationHand = ['z'] as any
    const score = effect!.computeBonusScore!(createState(2, p), p)
    expect(score).toBe(-3)
  })

  it('scoring: 0 when card not played', () => {
    const effect = getCardEffect('C35_LanternHouse')
    const p = createPlayer()
    p.minorHand = ['x'] as any
    const score = effect!.computeBonusScore!(createState(2, p), p)
    expect(score).toBe(0)
  })
})

// ---- C39 StudioBoat ----

describe('C39_StudioBoat (verification)', () => {
  it('is a PlayerActionCard with onBuy and onRoundStart', () => {
    const effect = getCardEffect('C39_StudioBoat')
    expect(effect?.onBuy).toBeDefined()
    expect(effect?.onRoundStart).toBeDefined()
  })

  it('restricted to 1-3 players per BGA', () => {
    expect((C39_StudioBoat as any).players).toBe('1-3')
  })

  it('onRoundStart accumulates 1 food when played', () => {
    const effect = getCardEffect('C39_StudioBoat')!
    const p = createPlayer()
    p.minorPlayed = ['C39_StudioBoat']
    const state = createState(2, p)
    const space = createSpace('C39_StudioBoat')
    space.resources.food = 2
    state.actionSpaces.push(space)
    effect.onRoundStart!(state, p)
    expect(space.resources.food).toBe(3)
  })

  it('onRoundStart no-ops when card not played', () => {
    const effect = getCardEffect('C39_StudioBoat')!
    const p = createPlayer()
    const state = createState(2, p)
    const space = createSpace('C39_StudioBoat')
    space.resources.food = 2
    state.actionSpaces.push(space)
    effect.onRoundStart!(state, p)
    expect(space.resources.food).toBe(2)
  })
})

// ---- C46 Mandoline ----

describe('C46_Mandoline (verification)', () => {
  it('anytime listener is registered', () => {
    const listener = findListener('C46-mandoline-anytime')
    expect(listener).toBeDefined()
    expect(listener!.phases).toContain('anytime')
  })

  it('onBeforeStartOfTurn unflags the card', () => {
    const effect = getCardEffect('C46_Mandoline')
    expect(effect?.onBeforeStartOfTurn).toBeDefined()
  })

  it('not offered when player has no vegetable', () => {
    const listener = findListener('C46-mandoline-anytime')!
    const p = createPlayer()
    p.minorPlayed = ['C46_Mandoline']
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(result).toBeUndefined()
  })

  it('offered when player has at least 1 vegetable and is not flagged', () => {
    const listener = findListener('C46-mandoline-anytime')!
    const p = createPlayer()
    p.minorPlayed = ['C46_Mandoline']
    p.resources.vegetable = 1
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(result?.flow).toBeDefined()
    const flow = result!.flow as any
    expect(flow.type).toBe('seq')
    // seq contains pay, bonus-vp, future-meeples, flag-card
    const leafActions = flow.children
      .filter((c: any) => c.type === 'leaf')
      .map((c: any) => c.actionId)
    expect(leafActions).toContain('bonus-vp')
    expect(leafActions).toContain('flag-card')
  })

  it('category FOOD_PROVIDER matches (BGA parity)', () => {
    expect((C46_Mandoline as any).category).toBe('FOOD_PROVIDER')
  })
})

// ---- D14 HammerCrusher ----

describe('D14_HammerCrusher (verification)', () => {
  it('before-renovate-house listener is registered', () => {
    const listener = findListener('D14-hammer-crusher-before-renovate')
    expect(listener).toBeDefined()
    expect(listener!.phases).toContain('before')
    expect(listener!.actions).toContain('renovate-house')
  })

  it('triggers when player has clay house and renovates', () => {
    const listener = findListener('D14-hammer-crusher-before-renovate')!
    const p = createPlayer()
    p.minorPlayed = ['D14_HammerCrusher']
    p.houseType = 'clay'
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'before',
    } as any)
    expect(result?.flow).toBeDefined()
    const flow = result!.flow as any
    expect(flow.type).toBe('seq')
    // 2 clay + 1 reed gain node, then optional construct
    expect(flow.children.length).toBe(2)
    const construct = flow.children[1]
    expect(construct.actionId).toBe('construct')
    expect(construct.optional).toBe(true)
  })

  it('does not trigger when player is not on clay house', () => {
    const listener = findListener('D14-hammer-crusher-before-renovate')!
    const p = createPlayer()
    p.minorPlayed = ['D14_HammerCrusher']
    p.houseType = 'wood'
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })

  it('isDoable override makes stone renovation possible', () => {
    const listener = findListener('D14-hammer-crusher-isdoable-renovate')
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['D14_HammerCrusher']
    p.houseType = 'clay'
    const result = executeCardListener(listener!, {
      state: createState(2, p), player: p, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'isDoable', doable: false,
    } as any)
    expect(result?.doable).toBe(true)
  })

  it('category FARM_PLANNER matches (BGA parity)', () => {
    expect((D14_HammerCrusher as any).category).toBe('FARM_PLANNER')
  })
})
