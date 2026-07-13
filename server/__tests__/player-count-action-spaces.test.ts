import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createInitialState, normalizeState } from '../../shared/session/state-bootstrap'
import { createActionSpaces } from '../../shared/actions'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

// ---- Helpers ----

const commonActionIds = (spaces: { id: string; roundAvailable?: number }[]) =>
  spaces.filter((s) => !s.roundAvailable || s.roundAvailable === 1).map((s) => s.id)

const BASE_10 = [
  'forest', 'clay-pit', 'reed-bank', 'fishing',
  'farm-expansion', 'meeting-place', 'grain-seeds',
  'farmland', 'day-laborer', 'lessons',
].sort()

const ONLY_3P = ['grove', 'hollow', 'resource-market', 'lessons-3']
const ONLY_4P = ['grove', 'copse', 'hollow-4', 'resource-market-4', 'lessons-4', 'traveling-players']
const SHARED_56 = [
  'lessons-56-2f',
  'copse-56',
  'lessons-56-variable',
  'modest-wish-children-56',
  'house-building-56',
  'traveling-players-56',
  'riverbank-forest-56',
  'grove-56',
  'hollow-56',
  'resource-market-56',
  'animal-market-56',
]
const ONLY_6P = [
  'farm-supplies-6',
  'resource-trade-6',
  'corral-6',
  'side-job-6',
  'improvement-6',
]

// ---- Action space filtering ----

describe('player-count action space filtering', () => {
  it('2P game has exactly 10 common action spaces', () => {
    const state = createInitialState(42, { playerCount: 2 })
    const common = commonActionIds(state.actionSpaces)
      .filter((id) => !['sheep-market', 'grain-utilization', 'fencing', 'major-improvement',
        'wish-children', 'western-quarry', 'house-redevelopment',
        'vegetable-seeds', 'pig-market', 'eastern-quarry', 'cattle-market',
        'cultivation', 'urgent-wish-children', 'farm-redevelopment'].includes(id))
    expect(common.sort()).toEqual(BASE_10)
    expect(common).toHaveLength(10)
  })

  it('2P game excludes all 3P and 4P variants', () => {
    const state = createInitialState(42, { playerCount: 2 })
    const ids = state.actionSpaces.map((s) => s.id)
    for (const id of [...ONLY_3P, ...ONLY_4P]) {
      expect(ids).not.toContain(id)
    }
  })

  it('3P game includes grove, hollow, resource-market, lessons-3', () => {
    const state = createInitialState(42, { playerCount: 3 })
    const ids = state.actionSpaces.map((s) => s.id)
    for (const id of ONLY_3P) {
      expect(ids).toContain(id)
    }
  })

  it('3P game excludes 4P-only variants', () => {
    const state = createInitialState(42, { playerCount: 3 })
    const ids = state.actionSpaces.map((s) => s.id)
    expect(ids).not.toContain('copse')
    expect(ids).not.toContain('hollow-4')
    expect(ids).not.toContain('resource-market-4')
    expect(ids).not.toContain('lessons-4')
    expect(ids).not.toContain('traveling-players')
  })

  it('4P game includes grove, copse, hollow-4, resource-market-4, lessons-4, traveling-players', () => {
    const state = createInitialState(42, { playerCount: 4 })
    const ids = state.actionSpaces.map((s) => s.id)
    for (const id of ONLY_4P) {
      expect(ids).toContain(id)
    }
  })

  it('4P game excludes 3P-only variants', () => {
    const state = createInitialState(42, { playerCount: 4 })
    const ids = state.actionSpaces.map((s) => s.id)
    expect(ids).not.toContain('hollow')
    expect(ids).not.toContain('resource-market')
    expect(ids).not.toContain('lessons-3')
  })

  it('all player counts have 14 round action slots', () => {
    for (const pc of [2, 3, 4, 5, 6]) {
      const state = createInitialState(42, { playerCount: pc })
      expect(state.roundActionOrder).toHaveLength(14)
    }
  })

  it('5P and 6P games keep the base common action spaces', () => {
    for (const pc of [5, 6]) {
      const state = createInitialState(42, { playerCount: pc })
      const ids = commonActionIds(state.actionSpaces)
        .filter((id) => !['sheep-market', 'grain-utilization', 'fencing', 'major-improvement',
          'wish-children', 'western-quarry', 'house-redevelopment',
          'vegetable-seeds', 'pig-market', 'eastern-quarry', 'cattle-market',
          'cultivation', 'urgent-wish-children', 'farm-redevelopment',
          ...SHARED_56, ...ONLY_6P].includes(id))
      expect(ids.sort()).toEqual(BASE_10)
    }
  })

  it('5P game includes shared 5/6 spaces and excludes 6-only spaces', () => {
    const state = createInitialState(42, { playerCount: 5 })
    const ids = state.actionSpaces.map((s) => s.id)
    for (const id of SHARED_56) {
      expect(ids).toContain(id)
    }
    for (const id of ONLY_6P) {
      expect(ids).not.toContain(id)
    }
    expect(ids).toContain('farm-expansion')
    expect(ids).toContain('house-building-56')
  })

  it('6P game includes shared 5/6 spaces and 6-only spaces', () => {
    const state = createInitialState(42, { playerCount: 6 })
    const ids = state.actionSpaces.map((s) => s.id)
    for (const id of [...SHARED_56, ...ONLY_6P]) {
      expect(ids).toContain(id)
    }
  })

  it('5/6 linked spaces carry group metadata and empty blocked state', () => {
    const state = createInitialState(42, { playerCount: 6 })
    const byId = new Map(state.actionSpaces.map((space) => [space.id, space]))
    expect(byId.get('lessons-56-2f')?.linkedGroupId).toBe('lessons-copse-56')
    expect(byId.get('copse-56')?.linkedGroupId).toBe('lessons-copse-56')
    expect(byId.get('lessons-56-variable')?.linkedGroupId).toBe('lessons-modest-children-56')
    expect(byId.get('modest-wish-children-56')?.linkedGroupId).toBe('lessons-modest-children-56')
    expect(byId.get('house-building-56')?.linkedGroupId).toBe('house-traveling-56')
    expect(byId.get('traveling-players-56')?.linkedGroupId).toBe('house-traveling-56')
    expect(byId.get('copse-56')?.blockedBy).toEqual([])
  })

  it('createActionSpaces() without playerCount returns all 49 definitions', () => {
    const all = createActionSpaces()
    expect(all).toHaveLength(49)
  })
})

// ---- 3P variant behavior ----

describe('3P hollow accumulation', () => {
  it('accumulates 1 clay per round', () => {
    const session = new GameSession(42, undefined, { playerCount: 3 })
    const state = session.getState().state
    const hollowSpace = state.actionSpaces.find((s) => s.id === 'hollow')
    expect(hollowSpace).toBeDefined()
    // After round 1 growth, hollow should have 1 clay
    expect(hollowSpace!.resources.clay).toBe(1)
  })
})

describe('3P resource-market XOR choice', () => {
  it('presents two XOR options (reed+food / stone+food)', () => {
    const session = new GameSession(42, undefined, { playerCount: 3 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'resource-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.options).toHaveLength(2)
    }
  })

  it('grants reed + food when first option chosen', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const p = state.players[0]!
    const reedBefore = p.resources.reed
    const foodBefore = p.resources.food
    session.loadState(state)

    const resp = session.takeAction(0, 'resource-market')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // First option is reed+food (action-gain-0)
    const resp2 = session.resolveChoice(0, resp.interaction.request.options[0]!.value)
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.reed).toBe(reedBefore + 1)
    expect(resp2.state.players[0]!.resources.food).toBe(foodBefore + 1)
  })

  it('grants stone + food when second option chosen', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const p = state.players[0]!
    const stoneBefore = p.resources.stone
    const foodBefore = p.resources.food
    session.loadState(state)

    const resp = session.takeAction(0, 'resource-market')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Second option is stone+food (action-gain-1)
    const resp2 = session.resolveChoice(0, resp.interaction.request.options[1]!.value)
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.stone).toBe(stoneBefore + 1)
    expect(resp2.state.players[0]!.resources.food).toBe(foodBefore + 1)
  })
})

describe('3P lessons-3 cost', () => {
  it('charges 2 food for first occupation', () => {
    const session = new GameSession(42, undefined, { playerCount: 3 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const p = state.players[0]!
    p.resources.food = 5
    p.occupationHand = ['A124_Knapper', 'A143_Stonecutter']
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons-3')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const occId = resp.interaction.request.options[0]!.value
      const resp2 = session.resolveChoice(0, occId)
      expect(resp2.ok).toBe(true)
      // Should have paid 2 food (started with 5)
      expect(resp2.state.players[0]!.resources.food).toBe(3)
    }
  })
})

// ---- Serialization ----

describe('normalizeState preserves player-count filtering', () => {
  it('3P state round-trips correctly', () => {
    const original = createInitialState(42, { playerCount: 3 })
    const serialized = JSON.parse(JSON.stringify(original))
    const restored = normalizeState(serialized)
    const originalIds = original.actionSpaces.map((s) => s.id).sort()
    const restoredIds = restored.actionSpaces.map((s) => s.id).sort()
    expect(restoredIds).toEqual(originalIds)
  })

  it('drops unsupported base action spaces from serialized 2P state', () => {
    const original = createInitialState(42, { playerCount: 2 })
    const serialized = JSON.parse(JSON.stringify(original))
    serialized.actionSpaces.push({
      ...serialized.actionSpaces[0],
      id: 'copse',
      nameKey: 'actions.copse.name',
      descriptionKey: 'actions.copse.description',
      roundAvailable: 1,
      gainPerRound: { wood: 1 },
      resources: { ...serialized.actionSpaces[0].resources, wood: 0 },
      takenBy: [],
    })

    const restored = normalizeState(serialized)
    expect(restored.actionSpaces.some((space) => space.id === 'copse')).toBe(false)
  })

  it('preserves caller-added pseudo action spaces during normalization', () => {
    const original = createInitialState(42, { playerCount: 2 })
    const serialized = JSON.parse(JSON.stringify(original))
    serialized.actionSpaces.push({
      ...serialized.actionSpaces[0],
      id: '__test-worker-sink__',
      nameKey: 'test.worker-sink.name',
      descriptionKey: 'test.worker-sink.description',
      takenBy: [],
    })

    const restored = normalizeState(serialized)
    expect(restored.actionSpaces.some((space) => space.id === '__test-worker-sink__')).toBe(true)
  })
})
