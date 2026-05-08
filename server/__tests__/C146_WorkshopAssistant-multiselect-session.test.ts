import { describe, expect, it } from 'vitest'

import '../../shared/cards/C/C146_WorkshopAssistant'

import { runCardEffectHook } from '../../shared/cards/card-effects'
import { getActionDefinition } from '../../shared/actions/index'
import type {
  ActionExecutionContext,
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../shared/contract/types'

const CARD_ID = 'C146_WorkshopAssistant'
const CHOOSE_PAIRS_ACTION_ID = 'card_C146_WorkshopAssistant_choosePairs'

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
    ],
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0,
      food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: [],
  }) as unknown as ActionSpace

const createState = (players: PlayerState[]): GameState =>
  ({
    round: 3,
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('C146 — multi-select pairs (onBuy)', () => {
  it('n=0 (no improvements built): onBuy is a no-op', () => {
    const player = createPlayer()
    player.minorPlayed = []
    player.improvements = []
    const state = createState([player])

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).toBeNull()
  })

  it('n=6 (>=6 improvements): auto-gains all 6 pairs without emitting choice', () => {
    const player = createPlayer()
    // 8 improvements clamps to 6
    player.minorPlayed = Array.from({ length: 8 }, (_, i) => `FAKE_MINOR_${i}`)
    const state = createState([player])

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe(CHOOSE_PAIRS_ACTION_ID)
    expect(leaf.sourceCard).toBe(CARD_ID)

    const def = getActionDefinition(CHOOSE_PAIRS_ACTION_ID)
    expect(def).toBeDefined()
    const result = def!.execute({
      state,
      player,
      space: createSpace(CHOOSE_PAIRS_ACTION_ID),
      params: {},
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    // Each resource appears in 3 pairs out of 6 → +3 each
    expect(player.resources.wood).toBe(3)
    expect(player.resources.clay).toBe(3)
    expect(player.resources.reed).toBe(3)
    expect(player.resources.stone).toBe(3)
    expect(result.resourcesGained).toEqual({ wood: 3, clay: 3, reed: 3, stone: 3 })
  })

  it('n=3: emits choice with needed=3, accepts WC,CS,RS → gains wood+2*clay+stone+reed+stone', () => {
    const player = createPlayer()
    player.minorPlayed = ['M1', 'M2', 'M3']
    const state = createState([player])

    const def = getActionDefinition(CHOOSE_PAIRS_ACTION_ID)!
    const ctx = {
      state,
      player,
      space: createSpace(CHOOSE_PAIRS_ACTION_ID),
      params: {},
    } as unknown as ActionExecutionContext

    const initial = def.execute(ctx)
    expect(initial.type).toBe('request')
    if (initial.type !== 'request') return
    expect(initial.request.kind).toBe('choice')
    if (initial.request.kind !== 'choice') return
    expect(initial.promptKey).toBe('ui.interactionWorkshopAssistantSelect')
    expect(initial.promptParams).toEqual({ needed: 3 })
    expect(initial.request.options).toHaveLength(6)
    expect(initial.request.options.every((o) => o.sourceCard === CARD_ID)).toBe(true)
    expect(initial.request.options.map((o) => o.value)).toEqual([
      'WC', 'WR', 'WS', 'CR', 'CS', 'RS',
    ])

    const resolved = def.resolveChoice!(ctx, 'WC,CS,RS')
    expect(resolved.type).toBe('ok')
    if (resolved.type !== 'ok') return
    // WC: wood+1, clay+1; CS: clay+1, stone+1; RS: reed+1, stone+1
    expect(player.resources.wood).toBe(1)
    expect(player.resources.clay).toBe(2)
    expect(player.resources.reed).toBe(1)
    expect(player.resources.stone).toBe(2)
    expect(resolved.resourcesGained).toEqual({ wood: 1, clay: 2, reed: 1, stone: 2 })
  })

  it('n=3 with insufficient selections (WC only): re-emits same choice', () => {
    const player = createPlayer()
    player.minorPlayed = ['M1', 'M2', 'M3']
    const state = createState([player])

    const def = getActionDefinition(CHOOSE_PAIRS_ACTION_ID)!
    const ctx = {
      state,
      player,
      space: createSpace(CHOOSE_PAIRS_ACTION_ID),
      params: {},
    } as unknown as ActionExecutionContext

    const reEmit = def.resolveChoice!(ctx, 'WC')
    expect(reEmit.type).toBe('request')
    if (reEmit.type !== 'request') return
    expect(reEmit.request.kind).toBe('choice')
    if (reEmit.request.kind !== 'choice') return
    expect(reEmit.promptKey).toBe('ui.interactionWorkshopAssistantSelect')
    expect(reEmit.promptParams).toEqual({ needed: 3 })
    expect(reEmit.request.options).toHaveLength(6)
    // Player resources untouched
    expect(player.resources.wood).toBe(0)
    expect(player.resources.clay).toBe(0)
  })

  it('n=3: duplicate selections collapse and re-emit when unique count is short', () => {
    const player = createPlayer()
    player.minorPlayed = ['M1', 'M2', 'M3']
    const state = createState([player])

    const def = getActionDefinition(CHOOSE_PAIRS_ACTION_ID)!
    const ctx = {
      state,
      player,
      space: createSpace(CHOOSE_PAIRS_ACTION_ID),
      params: {},
    } as unknown as ActionExecutionContext

    const reEmit = def.resolveChoice!(ctx, 'WC,WC,WC')
    expect(reEmit.type).toBe('request')
    if (reEmit.type !== 'request') return
    expect(reEmit.request.kind).toBe('choice')
  })
})
