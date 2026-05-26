import { describe, expect, it } from 'vitest'

import '../../shared/cards/C/C146_WorkshopAssistant'

import { GameSession } from '../game/authoritative-session'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import {
  readCardExtraData,
  readCardResourceStats,
} from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
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

const setupRenovationWithStoredPairs = (
  pairs: string[],
  actionId: 'house-redevelopment' | 'farm-redevelopment' = 'house-redevelopment',
) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = actionId === 'farm-redevelopment' ? 10 : 6
  state.currentPlayerIndex = 1
  const space = state.actionSpaces.find((entry) => entry.id === actionId)
  if (space) {
    space.roundAvailable = 1
    space.takenBy = []
  }
  const owner = state.players[0]!
  const actor = state.players[1]!
  owner.occupationPlayed.push(CARD_ID)
  owner.playedCards = [`occupation:${CARD_ID}`]
  owner.cardStates = { [CARD_ID]: { extraData: { pairs } } }
  for (const player of [owner, actor]) {
    player.resources.clay = 10
    player.resources.reed = 10
    player.resources.stone = 10
    player.resources.wood = 10
    player.resources.food = 10
    player.houseType = 'wood'
    player.rooms = 2
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  session.loadState(state)
  return { session, owner, actor }
}

const driveOpponentRenovationToC146 = (
  session: GameSession,
  actionId: 'house-redevelopment' | 'farm-redevelopment' = 'house-redevelopment',
) => {
  let resp = session.takeAction(1, actionId)
  let safety = 20
  while (resp.interaction.stateId === 'wait' && safety-- > 0) {
    if (resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
      continue
    }
    if (resp.interaction.sourceCard === CARD_ID) return resp
    const options = resp.interaction.options ?? []
    const skip = options.find((option) => option.value === '__skip__')
    if (skip) {
      resp = session.resolveChoice(resp.interaction.playerIndex, '__skip__')
      continue
    }
    const clay = options.find((option) => option.value === 'clay')
    const first = clay ?? options[0]
    if (!first) break
    resp = session.resolveChoice(resp.interaction.playerIndex, first.value)
  }
  return resp
}

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

  it('n=6 (>=6 improvements): auto-stores all 6 pairs without emitting choice', () => {
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
    expect(player.resources.wood).toBe(0)
    expect(player.resources.clay).toBe(0)
    expect(player.resources.reed).toBe(0)
    expect(player.resources.stone).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.extraData?.pairs).toEqual(['WC', 'WR', 'WS', 'CR', 'CS', 'RS'])
  })

  it('n=3: emits choice with needed=3, accepts WC,CS,RS and stores pairs', () => {
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
    expect(player.resources.wood).toBe(0)
    expect(player.resources.clay).toBe(0)
    expect(player.resources.reed).toBe(0)
    expect(player.resources.stone).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.extraData?.pairs).toEqual(['WC', 'CS', 'RS'])
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

  it('session onBuy accepts comma-joined n=3 pair selection', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID]
    player.minorPlayed = ['M1', 'M2', 'M3']
    player.resources.food = 10
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    if (resp.interaction.sourceCard !== CARD_ID) {
      expect(resp.interaction.options?.some((option) => option.value === CARD_ID)).toBe(true)
      resp = session.resolveChoice(0, CARD_ID)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
    }
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.promptKey).toBe('ui.interactionWorkshopAssistantSelect')

    resp = session.resolveChoice(0, 'WC,CS,RS')
    expect(resp.ok).toBe(true)
    const livePlayer = resp.state.players[0]!
    expect(readCardExtraData<string[]>(livePlayer, CARD_ID, 'pairs')).toEqual(['WC', 'CS', 'RS'])
    expect(livePlayer.resources.wood).toBe(0)
    expect(livePlayer.resources.clay).toBe(0)
    expect(livePlayer.resources.reed).toBe(0)
    expect(livePlayer.resources.stone).toBe(0)
  })

  it('opponent renovation lets owner take one stored pair', () => {
    const { session } = setupRenovationWithStoredPairs(['WC'])
    const resp = driveOpponentRenovationToC146(session)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.options?.some((option) => option.value !== '__skip__')).toBe(true)
  })

  it('opponent farm-redevelopment renovation also lets owner take one stored pair', () => {
    const { session } = setupRenovationWithStoredPairs(['WC'], 'farm-redevelopment')
    const resp = driveOpponentRenovationToC146(session, 'farm-redevelopment')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
  })

  it('card-sourced opponent renovation also lets owner take one stored pair', () => {
    const { session } = setupRenovationWithStoredPairs(['WC'])
    const state = session.getState().state
    const owner = state.players[0]!
    const actor = state.players[1]!
    const listener = getRegisteredCardListeners().find((entry) => entry.id === 'C146-workshop-assistant-after-opponent-renovation')!
    const result = executeCardListener(listener, {
      state,
      player: actor,
      ownerPlayer: owner,
      space: { id: 'B1_UpscaleLifestyle' },
      actionId: 'renovate-house',
      phase: 'after',
      sourceCard: 'B1_UpscaleLifestyle',
      transactionEvents: [],
    } as unknown as CardListenerContext)
    expect(result?.sourceCard).toBe(CARD_ID)
    expect(result?.flow).toBeDefined()
  })

  it('owner self renovation does not trigger stored pair take', () => {
    const { session } = setupRenovationWithStoredPairs(['WC'])
    const state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'house-redevelopment')
    const liveOwner = session.getState().state.players[0]!
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
    expect(readCardExtraData<string[]>(liveOwner, CARD_ID, 'pairs')).toEqual(['WC'])
  })

  it('opponent renovation does not trigger when there are no stored pairs', () => {
    const { session } = setupRenovationWithStoredPairs([])
    const resp = driveOpponentRenovationToC146(session)
    const liveOwner = session.getState().state.players[0]!
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(readCardExtraData<string[]>(liveOwner, CARD_ID, 'pairs')).toEqual([])
    expect(readCardResourceStats(liveOwner, CARD_ID)?.used ?? 0).toBe(0)
  })

  it('skipping opponent renovation take leaves stored pairs and used stats unchanged', () => {
    const { session } = setupRenovationWithStoredPairs(['WC'])
    const resp = driveOpponentRenovationToC146(session)
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    session.resolveChoice(0, '__skip__')
    const liveOwner = session.getState().state.players[0]!
    expect(readCardExtraData<string[]>(liveOwner, CARD_ID, 'pairs')).toEqual(['WC'])
    expect(readCardResourceStats(liveOwner, CARD_ID)?.used ?? 0).toBe(0)
  })

  it('accepting opponent renovation take removes exactly one pair and records use', () => {
    const { session } = setupRenovationWithStoredPairs(['WC', 'RS'])
    const beforeOwner = session.getState().state.players[0]!
    const beforeWood = beforeOwner.resources.wood
    const beforeClay = beforeOwner.resources.clay
    const resp = driveOpponentRenovationToC146(session)
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    session.resolveChoice(0, accept!.value)
    const liveOwner = session.getState().state.players[0]!
    expect(readCardExtraData<string[]>(liveOwner, CARD_ID, 'pairs')).toEqual(['RS'])
    expect(liveOwner.resources.wood).toBe(beforeWood + 1)
    expect(liveOwner.resources.clay).toBe(beforeClay + 1)
    expect(readCardResourceStats(liveOwner, CARD_ID)?.used ?? 0).toBe(1)
    expect(readCardResourceStats(liveOwner, CARD_ID)?.gained).toMatchObject({ wood: 1, clay: 1 })
  })
})
