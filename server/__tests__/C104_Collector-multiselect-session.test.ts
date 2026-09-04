import { describe, expect, it } from 'vitest'

import '../../shared/cards/C/C104_Collector'

import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type {
  ActionExecutionContext,
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../shared/contract/types'

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

const createSession = (options: { used?: number; currentPlayerIndex?: number } = {}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = options.currentPlayerIndex ?? 0
  state.round = 1
  state.players[0]!.occupationPlayed.push(CARD_ID)
  if (options.used !== undefined) {
    writeCardExtraData(state.players[0]!, CARD_ID, 'used', options.used)
  }
  for (const space of createPlayerActionSpaces(state)) {
    if (!state.actionSpaces.some((entry) => entry.id === space.id)) {
      state.actionSpaces.push(space)
    }
  }
  session.loadState(state)
  return session
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

  it('resolves the browser multi-select value through GameSession', () => {
    const session = createSession()
    const before = { ...session.state.players[0]!.resources }

    const started = session.takeAction(0, CARD_ID)
    expect(started.ok).toBe(true)
    expect(started.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'choice' },
      promptParams: { needed: 6 },
    })
    expect(started.interaction.allowedCommands).toContain('resolveChoice')
    if (started.interaction.stateId !== 'wait' || started.interaction.request.kind !== 'choice') return
    expect(started.interaction.request.options).toHaveLength(10)

    const resolved = session.resolveChoice(0, 'wood,clay,reed,stone,food,grain')
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources).toMatchObject({
      wood: before.wood + 1,
      clay: before.clay + 1,
      reed: before.reed + 1,
      stone: before.stone + 1,
      food: before.food + 1,
      grain: before.grain + 1,
      begging: before.begging + 1,
    })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(1)
    expect(resolved.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toHaveLength(1)
    expect(resolved.state.log).toEqual(started.state.log)
    expect(resolved.scores).toHaveLength(2)
  })

  it('keeps waiting when fewer than six distinct goods are submitted through GameSession', () => {
    const session = createSession()
    const before = { ...session.state.players[0]!.resources }
    expect(session.takeAction(0, CARD_ID).ok).toBe(true)

    const resolved = session.resolveChoice(0, 'wood,clay,reed,stone,food,wood')
    expect(resolved.ok).toBe(true)
    expect(resolved.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'choice' },
      promptParams: { needed: 6 },
    })
    expect(resolved.state.players[0]!.resources).toEqual(before)
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBeUndefined()
  })

  it.each([
    {
      used: 1,
      needed: 7,
      selection: 'wood,clay,reed,stone,food,grain,vegetable',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable'],
    },
    {
      used: 2,
      needed: 8,
      selection: 'wood,clay,reed,stone,food,grain,vegetable,sheep',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep'],
    },
    {
      used: 3,
      needed: 9,
      selection: 'wood,clay,reed,stone,food,grain,vegetable,sheep,boar',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar'],
    },
  ])(
    'use $needed asks for and grants $needed distinct goods plus 1 begging through GameSession',
    ({ used, needed, selection, goods }) => {
      const session = createSession({ used })
      const before = { ...session.state.players[0]!.resources }

      const started = session.takeAction(0, CARD_ID)
      expect(started.ok).toBe(true)
      expect(started.interaction).toMatchObject({
        stateId: 'wait',
        playerIndex: 0,
        promptParams: { needed },
      })

      const resolved = session.resolveChoice(0, selection)

      expect(resolved.ok).toBe(true)
      for (const good of goods) {
        const key = good as keyof PlayerState['resources']
        expect(resolved.state.players[0]!.resources[key]).toBe((before[key] ?? 0) + 1)
      }
      expect(resolved.state.players[0]!.resources.begging).toBe(before.begging + 1)
      expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(used + 1)
    },
  )

  it('does not execute a fifth use through GameSession', () => {
    const session = createSession({ used: 4 })
    const before = { ...session.state.players[0]!.resources }

    const response = session.takeAction(0, CARD_ID)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.resources).toEqual(before)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(4)
  })

  it('does not execute the owner-only space for a non-owner through GameSession', () => {
    const session = createSession({ currentPlayerIndex: 1 })
    const before = { ...session.state.players[1]!.resources }

    const response = session.takeAction(1, CARD_ID)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[1]!.resources).toEqual(before)
    expect(response.state.players[1]!.cardStates[CARD_ID]?.extraData?.used).toBeUndefined()
  })
})
