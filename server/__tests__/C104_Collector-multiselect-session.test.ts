import { describe, expect, it } from 'vitest'

import '../../shared/cards/C/C104_Collector'

import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import type {
  ActionExecutionContext,
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../shared/game/types'

const CARD_ID = 'C104_Collector'

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

const buildSpaceForPlayer = (state: GameState, ownerId: string): ActionSpace => {
  const spaces = createPlayerActionSpaces(state)
  const space = spaces.find((s) => s.id === CARD_ID)
  if (!space) {
    throw new Error(`expected player action space for ${CARD_ID} (owner=${ownerId})`)
  }
  return space
}

describe('C104 — multi-select session (player action space)', () => {
  it('1st use: emits choice with needed=6 and resolves to begging+6 distinct goods', () => {
    const player = createPlayer()
    const state = createState([player])
    const space = buildSpaceForPlayer(state, player.id)
    const ctx = {
      state,
      player,
      space,
      params: {},
    } as unknown as ActionExecutionContext

    const initial = space.execute(ctx)
    expect(initial.type).toBe('request')
    if (initial.type !== 'request') return
    expect(initial.request.kind).toBe('choice')
    if (initial.request.kind !== 'choice') return
    expect(initial.promptKey).toBe('ui.interactionCollectorSelect')
    expect(initial.promptParams).toEqual({ needed: 6 })
    expect(initial.request.options).toHaveLength(10)
    expect(initial.request.options.every((o) => o.sourceCard === CARD_ID)).toBe(true)

    const resolved = space.resolveChoice!(ctx, 'wood,clay,reed,stone,food,grain')
    expect(resolved.type).toBe('flow')
    if (resolved.type !== 'flow') return
    const flow = resolved.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.children).toHaveLength(2)
    const incLeaf = flow.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(incLeaf.actionId).toBe('special-effect')
    expect(incLeaf.params).toEqual({ kind: 'increment-extra-data', key: 'used', amount: 1 })
    const gainLeaf = flow.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gainLeaf.actionId).toBe('gain')
    expect(gainLeaf.sourceCard).toBe(CARD_ID)
    expect(gainLeaf.params).toEqual({
      begging: 1,
      wood: 1, clay: 1, reed: 1, stone: 1, food: 1, grain: 1,
    })
  })

  it('2nd use: needed=7 (after first use bumps the counter)', () => {
    const player = createPlayer()
    writeCardExtraData(player, CARD_ID, 'used', 1)
    const state = createState([player])
    const space = buildSpaceForPlayer(state, player.id)
    const ctx = {
      state,
      player,
      space,
      params: {},
    } as unknown as ActionExecutionContext

    const initial = space.execute(ctx)
    expect(initial.type).toBe('request')
    if (initial.type !== 'request') return
    expect(initial.request.kind).toBe('choice')
    expect(initial.promptParams).toEqual({ needed: 7 })

    const resolved = space.resolveChoice!(
      ctx,
      'wood,clay,reed,stone,food,grain,vegetable',
    )
    expect(resolved.type).toBe('flow')
    if (resolved.type !== 'flow') return
    const flow = resolved.flow as Extract<ActionFlow, { type: 'seq' }>
    const gainLeaf = flow.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gainLeaf.params).toEqual({
      begging: 1,
      wood: 1, clay: 1, reed: 1, stone: 1, food: 1, grain: 1, vegetable: 1,
    })
  })

  it('insufficient selections: re-emits same choice (needed unchanged, no flow)', () => {
    const player = createPlayer()
    const state = createState([player])
    const space = buildSpaceForPlayer(state, player.id)
    const ctx = {
      state,
      player,
      space,
      params: {},
    } as unknown as ActionExecutionContext

    // 1st use needs 6, but submit only 5 distinct
    const reEmit = space.resolveChoice!(ctx, 'wood,clay,reed,stone,food')
    expect(reEmit.type).toBe('request')
    if (reEmit.type !== 'request') return
    expect(reEmit.request.kind).toBe('choice')
    if (reEmit.request.kind !== 'choice') return
    expect(reEmit.promptKey).toBe('ui.interactionCollectorSelect')
    expect(reEmit.promptParams).toEqual({ needed: 6 })
    expect(reEmit.request.options).toHaveLength(10)
    // Player resources untouched (mutation deferred to engine via flow)
    expect(player.resources.wood).toBe(0)
    expect(player.resources.begging).toBe(0)
  })
})
