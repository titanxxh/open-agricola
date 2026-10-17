import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionExecutionContext, ActionSpace, GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/B/B146_Illusionist'
import { getActionDefinition } from '../../shared/actions/index'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit29Exchanges from './_helpers/audit/ae-negative-29-exchanges'

const DISCARD_ACTION_ID = 'card_B146_Illusionist_discard-from-hand'


const CARD_ID = 'B146_Illusionist'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
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
    fields: [], fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createSpace = (
  id: string,
  resources: Partial<{ wood: number; clay: number; reed: number; stone: number }>,
): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {
      wood: resources.wood ?? 0,
      clay: resources.clay ?? 0,
      reed: resources.reed ?? 0,
      stone: resources.stone ?? 0,
      food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: [],
  }) as unknown as ActionSpace

const createState = (
  players: PlayerState[],
  spaces: ActionSpace[],
): GameState =>
  ({
    round: 3,
    currentPlayerIndex: 0,
    players,
    actionSpaces: spaces,
    log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

const findListener = (ruleOwner: TestCardRegistry) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find(
    (l) => l.id === 'B146-illusionist-before-collect',
  )
  return withActiveRegistry(ruleOwner, lookupRule1)
}

describe('B146_Illusionist listener registration', () => {
  it('is registered on collect before (player scope)', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('collect')
    expect(listener!.phases).toContain('before')
    expect(listener!.scope).toBe('player')
  })
})

describe('B146_Illusionist listener handler', () => {

  it('does nothing when hand is empty', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('does nothing when Lantern House (C35) is played', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.minorPlayed.push('C035_LanternHouse')
    player.occupationHand = ['A009_SheepFarmer']
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('does nothing on a non-building-resource space (food accumulation)', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A009_SheepFarmer']
    const fishing = createSpace('fishing', {})
    // fishing accumulates food — no wood/clay/reed/stone.
    fishing.resources.food = 2
    fishing.takenBy = player.id
    const state = createState([player], [fishing])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: fishing,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('returns optional seq [discard-from-hand, gain wood 1] for forest', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A009_SheepFarmer']
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(2)
    expect(flow.children[0].actionId).toBe(DISCARD_ACTION_ID)
    expect(flow.children[0].sourceCard).toBe(CARD_ID)
    expect(flow.children[1].actionId).toBe('gain')
    expect(flow.children[1].params).toEqual({ wood: 1 })
    expect(flow.children[1].sourceCard).toBe(CARD_ID)
  })

  it('still triggers when a played card does not prevent hand discard', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.minorPlayed.push('B068_Beanfield')
    player.occupationHand = ['A009_SheepFarmer']
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
  })

  it('picks clay when accumulating clay', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.minorHand = ['A001_AnimalPen']
    const clayPit = createSpace('clay-pit', { clay: 2 })
    clayPit.takenBy = player.id
    const state = createState([player], [clayPit])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: clayPit,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[1].params).toEqual({ clay: 1 })
  })

  it('picks reed when accumulating reed', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A009_SheepFarmer']
    const reedBank = createSpace('reed-bank', { reed: 1 })
    reedBank.takenBy = player.id
    const state = createState([player], [reedBank])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: reedBank,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[1].params).toEqual({ reed: 1 })
  })

  it('picks stone when accumulating stone', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A009_SheepFarmer']
    const quarry = createSpace('eastern-quarry', { stone: 1 })
    quarry.takenBy = player.id
    const state = createState([player], [quarry])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: quarry,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[1].params).toEqual({ stone: 1 })
  })

  it('accepts minor-hand cards as discard candidates too', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = []
    player.minorHand = ['A001_AnimalPen']
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
  })
})

// Direct tests of the discard-from-hand action registration (leaf payload).
describe('discard-from-hand action', () => {
  it('is registered via internalActionDefinitions and exposes choice', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const def = getActionDefinition(DISCARD_ACTION_ID)
    expect(def).toBeDefined()

    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper']
    player.minorHand = ['A001_AnimalPen']

    const forest = createSpace('forest', { wood: 3 })
    const state = createState([player], [forest])
    const result = withActiveRegistry(ruleRegistry, () => def!.execute({ state, player, space: forest, params: {} } as unknown as ActionExecutionContext))
    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    if (result.request.kind !== 'choice') return
    expect(result.request.options).toHaveLength(3)
    expect(result.request.options.map((o) => o.value)).toEqual([
      'occ:A009_SheepFarmer',
      'occ:A124_Knapper',
      'min:A001_AnimalPen',
    ])
  })

  it('resolveChoice removes the chosen occupation from hand', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const def = getActionDefinition(DISCARD_ACTION_ID)!
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper']

    const forest = createSpace('forest', { wood: 3 })
    const state = createState([player], [forest])
    const result = withActiveRegistry(ruleRegistry, () => def.resolveChoice!(
      { state, player, space: forest, params: {} } as unknown as ActionExecutionContext,
      'occ:A009_SheepFarmer',
    ))
    expect(result.type).toBe('ok')
    expect(player.occupationHand).toEqual(['A124_Knapper'])
  })

  it('resolveChoice removes the chosen minor card from hand', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const def = getActionDefinition(DISCARD_ACTION_ID)!
    const player = createPlayer('p1')
    player.minorHand = ['A001_AnimalPen', 'A002_Basket']

    const forest = createSpace('forest', { wood: 3 })
    const state = createState([player], [forest])
    const result = withActiveRegistry(ruleRegistry, () => def.resolveChoice!(
      { state, player, space: forest, params: {} } as unknown as ActionExecutionContext,
      'min:A002_Basket',
    ))
    expect(result.type).toBe('ok')
    expect(player.minorHand).toEqual(['A001_AnimalPen'])
  })

  it('resolveChoice fails when choice points at a card not in hand', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const def = getActionDefinition(DISCARD_ACTION_ID)!
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer']

    const forest = createSpace('forest', { wood: 3 })
    const state = createState([player], [forest])
    const result = withActiveRegistry(ruleRegistry, () => def.resolveChoice!(
      { state, player, space: forest, params: {} } as unknown as ActionExecutionContext,
      'occ:NotInHand',
    ))
    expect(result.type).toBe('fail')
  })
})

describe('ae-negative-29-exchanges', () => {
  const { sessions, save, ok, finish, action, pending, choose, illusion } = audit29Exchanges
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B146 N1 real discard rejects a played card and discards exactly one hand card before receiving one extra wood', () => { const s = illusion(), p = pending(s, ok(s.takeAction(0, 'forest')), 'B146_Illusionist'), accepted = choose(s, p, o => o.value !== '__skip__'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'occ:B146_Illusionist')), r = finish(s, ok(s.resolveChoice(0, 'occ:A116_WoodCutter'))); assert.equal(r.state.players[0]!.resources.wood, 4); assert.deepEqual(r.state.players[0]!.occupationHand, []); assert.deepEqual(r.state.players[0]!.minorHand, ['C004_WritingBoards']); assert.ok(r.state.players[0]!.occupationPlayed.includes('B146_Illusionist')); save('B146-N1', { p, accepted, bad, r }); });
  it('B146 N2 decline and Lantern House preserve the actual hand without bonus wood', () => { const s = illusion(), p = pending(s, ok(s.takeAction(0, 'forest')), 'B146_Illusionist'), decline = finish(s, choose(s, p, o => o.value === '__skip__')); assert.equal(decline.state.players[0]!.resources.wood, 3); assert.deepEqual(decline.state.players[0]!.occupationHand, ['A116_WoodCutter']); const t = illusion(true, true), blocked = action(t, 0, 'forest'); assert.equal(blocked.state.players[0]!.resources.wood, 3); assert.deepEqual(blocked.state.players[0]!.occupationHand, ['A116_WoodCutter']); save('B146-N2', { p, decline, blocked }); });
  it('B146 N3 held Illusionist actual opponent wood and food accumulation cannot discard the owner hand', () => { const s = illusion(false), hand = action(s, 0, 'forest'); assert.equal(hand.state.players[0]!.resources.wood, 3); const t = illusion(), first = action(t, 0, 'grain-seeds'), opponent = action(t, 1, 'forest'); assert.equal(opponent.state.players[1]!.resources.wood, 3); assert.deepEqual(opponent.state.players[0]!.occupationHand, ['A116_WoodCutter']); const q = illusion(), food = action(q, 0, 'fishing'); assert.deepEqual(food.state.players[0]!.occupationHand, ['A116_WoodCutter']); save('B146-N3', { hand, first, opponent, food }); });
})
