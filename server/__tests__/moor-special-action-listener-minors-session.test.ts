import { afterEach, describe, expect, it } from 'vitest'

import { createWorkSession } from './_helpers/session-fixtures'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { gainAction } from '../../shared/actions/effects/gain'

import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption, ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../shared/contract/types'
import { M116_MoorBirchTrees } from '../../shared/cards/M/M116_MoorBirchTrees'
import { M121_Loam } from '../../shared/cards/M/M121_Loam'
import { M122_WillowBank } from '../../shared/cards/M/M122_WillowBank'
import { M127_Wheelbarrow } from '../../shared/cards/M/M127_Wheelbarrow'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

const FILLER = '__test_placeholder__'
const TEST_PLACE_FARMER_CARD = 'TEST_PlaceFarmerProbe'
const TEST_ACTION_HOOK_ID = 'test-special-action-ordinary-hook-probe'
const TEST_BEFORE_LISTENER_ID = 'test-special-action-before-probe'
const TEST_PLACE_FARMER_LISTENER_ID = 'test-place-farmer-probe-after'

const baseResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
})

const sessions: GameSession[] = []

const setup = (playerCount = 2, round = 5) => {
  const session = new GameSession(380, undefined, {
    playerCount,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  sessions.push(session)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.resources = baseResources()
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'moor' },
      { row: 0, col: 1, kind: 'moor' },
      { row: 1, col: 0, kind: 'forest' },
      { row: 1, col: 1, kind: 'forest' },
    ]
    setActiveWorkerCount(player, index === 0 ? 3 : 0)
    setWorkersAtHome(state, player, index === 0 ? 3 : 0)
  })
  session.loadState(state)
  return { session, state: session.state, player: session.state.players[0]! }
}

const findSpecialCard = (
  session: GameSession,
  actionId: string,
) => session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
  card.actions.includes(actionId as never),
)!

const takeSpecial = (
  session: GameSession,
  actionId: 'cut-peat' | 'fell-trees' | 'hiring-fair',
) => {
  const player = session.state.players[0]!
  const card = findSpecialCard(session, actionId)
  const terrainKind = actionId === 'cut-peat' ? 'moor' : 'forest'
  const tile = player.farmTerrain?.find((entry) => entry.kind === terrainKind)
  return session.takeSpecialAction(0, card.id, actionId, tile ? { tile } : undefined)
}

const acceptFirstNonSkip = (
  session: GameSession,
  resp: ReturnType<GameSession['takeSpecialAction']> | ReturnType<GameSession['takeAction']>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  const option = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const confirmNext = (session: GameSession) => {
  const pending = session.getState().interaction
  expect(pending.stateId).toBe('wait')
  if (pending.stateId !== 'wait') throw new Error('expected wait')
  expect(pending.request.kind).toBe('confirm-next-player')
  return session.resolveChoice(pending.request.nextPlayerIndex, 'confirm')
}

const counter = (player: PlayerState, cardId: string) =>
  player.cardStates?.[cardId]?.counters?.usage ?? 0

const executeGainLeaf = (flow: ActionFlow | null, session: GameSession, player: PlayerState) => {
  expect(flow).toMatchObject({ type: 'leaf', actionId: 'gain' })
  if (!flow || flow.type !== 'leaf') throw new Error('expected gain leaf')
  session.withCtx(() => gainAction.execute({
    state: session.state,
    player,
    space: { id: 'test' } as ActionSpace,
    params: flow.params,
    sourceCard: flow.sourceCard,
  }))
}

afterEach(() => {
  sessions.splice(0).forEach(session => session.dispose())
})

describe('FoM special action listener minors', () => {
  it('dispatches special action listeners without ordinary place-farmer/action-space hooks', () => {
    const { session, player } = setup()
    player.minorPlayed.push('M116_MoorBirchTrees', TEST_PLACE_FARMER_CARD)
    player.improvements.push('Major_Moor_PeatCharcoalKiln')
    player.rooms = 3
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
    let beforeListenerCalls = 0
    let actionHookCalls = 0
    session.actionHooks.register({
      id: TEST_ACTION_HOOK_ID,
      actions: ['cut-peat'],
      phases: ['after'],
      handler: () => {
        actionHookCalls += 1
      },
    })
    const placeFarmerProbe: CardListenerRegistration = {
      id: TEST_PLACE_FARMER_LISTENER_ID,
      cardIds: [TEST_PLACE_FARMER_CARD],
      actions: ['place-farmer'],
      phases: ['after'],
      handler: (context) => ({
        flow: {
          type: 'leaf',
          actionId: 'gain',
          params: { stone: 1 },
          sourceCard: context.ownerCardId,
        },
      }),
    }
    const beforeProbe: CardListenerRegistration = {
      id: TEST_BEFORE_LISTENER_ID,
      cardIds: [TEST_PLACE_FARMER_CARD],
      actions: ['moor-action'],
      phases: ['before'],
      handler: (context) => {
        expect(context.actionId).toBe('moor-action')
        expect(context.moorAction?.actionId).toBe('cut-peat')
        expect(context.moorAction?.specialActionCardId).toEqual(expect.any(String))
        beforeListenerCalls += 1
        return {
          flow: {
            type: 'leaf',
            actionId: 'gain',
            params: { stone: 1 },
            sourceCard: context.ownerCardId,
          },
        }
      },
    }
    session.withCtx(() => requireActiveCardRegistry('moor-special-action-test').registerListener(beforeProbe))
    session.withCtx(() => requireActiveCardRegistry('moor-special-action-test').registerListener(placeFarmerProbe))
    session.loadState(session.state)

    const resp = takeSpecial(session, 'cut-peat')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.fuel).toBe(4)
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
    expect(beforeListenerCalls).toBe(1)
    expect(actionHookCalls).toBe(0)
  })

  it('M077 schedules fuel three rounds after Cut Peat and drops past round 14', () => {
    const { session, player } = setup(2, 8)
    player.minorPlayed.push('M077_DryingField')
    let resp = takeSpecial(session, 'cut-peat')

    expect(resp.ok).toBe(true)
    expect(resp.state.futureMeeples).toEqual([
      expect.objectContaining({
        cardId: 'M077_DryingField',
        playerId: player.id,
        round: 11,
        resources: { fuel: 2 },
      }),
    ])

    const late = setup(2, 12)
    late.player.minorPlayed.push('M077_DryingField')
    resp = takeSpecial(late.session, 'cut-peat')
    expect(resp.ok).toBe(true)
    expect(resp.state.futureMeeples.some((entry) => entry.cardId === 'M077_DryingField')).toBe(false)
  })

  it('M083 gives fuel on play, Hiring Fair special action, and Day Laborer action space', () => {
    const { session, player } = setup()
    player.minorPlayed.push('M083_CoalSeam')
    executeGainLeaf(session.withCtx(() => runCardEffectHook(session.state, player, 'M083_CoalSeam', 'onBuy')), session, player)
    expect(player.resources.fuel).toBe(1)

    let resp = takeSpecial(session, 'hiring-fair')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[0]!.resources.fuel).toBe(2)

    confirmNext(session)
    session.state.currentPlayerIndex = 0
    setWorkersAtHome(session.state, player, 1)
    resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.resources.fuel).toBe(3)
  })

  it('M083 keeps Day Laborer separate from a granted Cut Peat nested under that space', () => {
    const source = 'TEST_DayLaborerMoorGrant'
    const session = createWorkSession({ seed: 1293, options: { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      state.round = 8
      for (const player of state.players) {
        player.resources = baseResources()
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        setWorkersAtHome(state, player, 2)
      }
      state.players[0]!.minorPlayed = ['M083_CoalSeam', source]
      state.players[0]!.farmTerrain = [{ row: 2, col: 0, kind: 'moor' }]
    } })
    sessions.push(session)
    session.withCtx(() => requireActiveCardRegistry('day-laborer-moor-source-test').registerListener({
      id: source, cardIds: [source], actionSpaces: ['day-laborer'], phases: ['after'], mandatory: true,
      handler: () => ({ sourceCard: source, flow: { type: 'leaf', actionId: 'moor-special-action-choice', sourceCard: source,
        actionContext: { mode: 'take-action', actionIds: ['cut-peat'] } } }),
    }))
    let response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    response = resolveTriggerIfPresent(session, response, source)
    const peat = response.interaction.request.options?.find(option => option.value === 'action:cut-peat:2:0')
    if (peat) response = session.resolveChoice(0, peat.value)
    response = resolveTriggerIfPresent(session, response, 'M083_CoalSeam')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 4, food: 2 })
    expect(response.state.players[1]!.resources.fuel).toBe(0)
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged')).toMatchObject([{ sourceActionId: 'cut-peat' }])
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'M083_CoalSeam')).toHaveLength(1)
  })

  it('M094 and M099 trigger from Infirmary only for their conditions', () => {
    const { session, player } = setup()
    player.minorPlayed.push('M094_PeatBath', 'M099_HealingClay')
    player.sickWorkerIds = ['3']
    setWorkersAtHome(session.state, player, 1)

    let resp = session.takeAction(0, 'moor-infirmary')
    resp = resolveTriggerIfPresent(session, resp, 'M094_PeatBath')
    resp = resolveTriggerIfPresent(session, resp, 'M099_HealingClay')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.futureMeeples.filter((entry) => entry.cardId === 'M094_PeatBath')).toEqual([
      expect.objectContaining({ round: 6, resources: { food: 1 } }),
      expect.objectContaining({ round: 7, resources: { food: 1 } }),
    ])

    const healthy = setup()
    healthy.player.minorPlayed.push('M099_HealingClay')
    setWorkersAtHome(healthy.state, healthy.player, 1)
    const noSick = healthy.session.takeAction(0, 'moor-infirmary')
    expect(noSick.ok).toBe(true)
    expect(noSick.state.players[0]!.resources.food).toBe(1)
  })

  it('M097 gives food at returning home only with no special action card in front', () => {
    const noCard = setup()
    noCard.player.minorPlayed.push('M097_VillageHall')
    noCard.state.players.forEach((entry) => markAllWorkersUsed(noCard.state, entry))

    let resp = noCard.session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)

    const withCard = setup()
    withCard.player.minorPlayed.push('M097_VillageHall')
    resp = takeSpecial(withCard.session, 'hiring-fair')
    expect(resp.ok).toBe(true)
    confirmNext(withCard.session)
    withCard.state.players.forEach((entry) => markAllWorkersUsed(withCard.state, entry))
    resp = withCard.session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })

  it('M116, M119, M122, and M127 handle special terrain action bonuses and prerequisites', () => {
    const { session, player } = setup()
    player.minorPlayed.push('M119_AlderSwamp', 'M122_WillowBank', 'M127_Wheelbarrow')
    player.improvements.push('Major_Well')
    player.minorPlayed.push('A001_Shelter')
    session.loadState(session.state)

    let resp = takeSpecial(session, 'fell-trees')
    resp = acceptFirstNonSkip(session, resp)

    expect(resp.state.players[0]!.resources.wood).toBe(3)
    expect(resp.state.players[0]!.resources.reed).toBe(1)

    const cut = setup()
    cut.player.minorPlayed.push('M127_Wheelbarrow')
    cut.player.improvements.push('Major_Well')
    cut.session.loadState(cut.state)
    resp = takeSpecial(cut.session, 'cut-peat')
    resp = acceptFirstNonSkip(cut.session, resp)

    expect(resp.state.players[0]!.resources.fuel).toBe(3)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(session.withCtx(() => meetsCardPrerequisites(player, M116_MoorBirchTrees, session.state.round, session.state))).toBe(false)
    player.rooms = 3
    expect(session.withCtx(() => meetsCardPrerequisites(player, M116_MoorBirchTrees, session.state.round, session.state))).toBe(true)
    expect(session.withCtx(() => meetsCardPrerequisites(player, M122_WillowBank, session.state.round, session.state))).toBe(true)
    expect(session.withCtx(() => meetsCardPrerequisites(player, M127_Wheelbarrow, session.state.round, session.state))).toBe(true)
  })

  it('M118 offers fuel upgrade when affordable and falls back to one wood without fuel', () => {
    const { session, player } = setup()
    player.minorPlayed.push('M118_TimberMill')
    player.resources.fuel = 1

    let resp = takeSpecial(session, 'fell-trees')

    expect(resp.interaction.stateId).toBe('wait')
    resp = acceptFirstNonSkip(session, resp)
    expect(resp.state.players[0]!.resources.fuel).toBe(0)
    expect(resp.state.players[0]!.resources.wood).toBe(4)

    const noFuel = setup()
    noFuel.player.minorPlayed.push('M118_TimberMill')
    const noFuelResp = takeSpecial(noFuel.session, 'fell-trees')
    expect(noFuelResp.ok).toBe(true)
    expect(noFuelResp.state.players[0]!.resources.wood).toBe(3)
    expect(noFuelResp.interaction.stateId === 'wait' ? noFuelResp.interaction.sourceCard : undefined)
      .not.toBe('M118_TimberMill')
  })

  it('M118 and M127 trigger from accumulation collects at four matching building resources', () => {
    const { session, state, player } = setup()
    player.minorPlayed.push('M118_TimberMill', 'M127_Wheelbarrow')
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources.wood = 4
    setWorkersAtHome(state, player, 1)
    session.loadState(state)

    let resp = session.takeAction(0, 'forest')
    resp = resolveTriggerIfPresent(session, resp, 'M118_TimberMill')
    resp = resolveTriggerIfPresent(session, resp, 'M127_Wheelbarrow')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.state.players[0]!.resources.fuel).toBe(1)

    const low = setup()
    low.player.minorPlayed.push('M118_TimberMill', 'M127_Wheelbarrow')
    const lowForest = low.state.actionSpaces.find((space) => space.id === 'forest')!
    lowForest.resources.wood = 3
    setWorkersAtHome(low.state, low.player, 1)
    low.session.loadState(low.state)
    const lowResp = low.session.takeAction(0, 'forest')
    expect(lowResp.state.players[0]!.resources.wood).toBe(3)
    expect(lowResp.state.players[0]!.resources.fuel).toBe(0)
  })

  it.each([['M118_TimberMill', 5, 1], ['M127_Wheelbarrow', 6, 0]] as const)(
    'preserves collect ordering with %s first and no initial fuel', (first, wood, fuel) => {
      const session = createWorkSession({ seed: 1293, options: { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
        state.round = 8
        state.currentPlayerIndex = 0
        for (const player of state.players) {
          player.resources = baseResources()
          player.minorPlayed = []
          player.occupationPlayed = []
          player.improvements = []
          player.cardStates = {}
          setWorkersAtHome(state, player, 2)
        }
        state.players[0]!.minorPlayed = ['M118_TimberMill', 'M127_Wheelbarrow']
        state.actionSpaces.forEach(space => { space.takenBy = [] })
        state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 4
      } })
      sessions.push(session)
      let response = session.takeAction(0, 'forest')
      expect(response.interaction.request.kind).toBe('select-trigger')
      response = resolveTriggerIfPresent(session, response, first)
      const second = first === 'M118_TimberMill' ? 'M127_Wheelbarrow' : 'M118_TimberMill'
      response = resolveTriggerIfPresent(session, response, second)
      if (first === 'M127_Wheelbarrow') {
        expect(response.interaction.sourceCard).toBe('M118_TimberMill')
        const upgrade = response.interaction.request.options.find(option => option.effectPreview?.resourcesGained?.wood === 2)
        expect(upgrade).toBeDefined()
        response = session.resolveChoice(0, upgrade!.value)
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood, fuel })
      expect(response.state.players[1]!.resources).toMatchObject({ wood: 0, fuel: 0 })
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'M118_TimberMill')).toHaveLength(1)
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'M127_Wheelbarrow')).toHaveLength(1)
      expect(response.state.farmersOfTheMoor!.specialActionCards.every(card => card.location.kind === 'market')).toBe(true)
    },
  )

  it('M121 rewards Hiring Fair only when exactly one worker remains at home and prerequisite is met', () => {
    const { session, player } = setup()
    player.minorPlayed.push('M121_Loam', 'A001_Shelter')
    setWorkersAtHome(session.state, player, 1)
    expect(session.withCtx(() => meetsCardPrerequisites(player, M121_Loam, session.state.round, session.state))).toBe(true)

    let resp = takeSpecial(session, 'hiring-fair')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(1)

    const blocked = setup()
    blocked.player.minorPlayed.push('M121_Loam', 'A001_Shelter')
    setWorkersAtHome(blocked.state, blocked.player, 2)
    resp = takeSpecial(blocked.session, 'hiring-fair')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)

    const noPrereq = setup()
    expect(session.withCtx(() => meetsCardPrerequisites(noPrereq.player, M121_Loam, noPrereq.state.round, noPrereq.state))).toBe(false)
  })

  it('M123 initializes player-count counters and stops after the quarry is empty', () => {
    const three = setup(3)
    three.player.minorHand = ['M123_StoneQuarry']
    three.session.devPlayCard(0, 'M123_StoneQuarry')
    expect(counter(three.player, 'M123_StoneQuarry')).toBe(3)

    const { session, player } = setup()
    player.minorHand = ['M123_StoneQuarry']
    session.devPlayCard(0, 'M123_StoneQuarry')
    expect(counter(player, 'M123_StoneQuarry')).toBe(5)
    player.cardStates!.M123_StoneQuarry!.counters!.usage = 1

    let resp = takeSpecial(session, 'hiring-fair')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
    expect(counter(resp.state.players[0]!, 'M123_StoneQuarry')).toBe(0)

    const empty = setup()
    empty.player.minorHand = ['M123_StoneQuarry']
    empty.session.devPlayCard(0, 'M123_StoneQuarry')
    empty.player.cardStates!.M123_StoneQuarry!.counters!.usage = 0
    resp = takeSpecial(empty.session, 'hiring-fair')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
  })
})

describe('Moor Special Action extra benefits resolve before the action (#1334)', () => {
  const TERRAIN_CARD = 'moor-special-1-2-terrain'
  const MARKET_CARD = 'moor-special-1-2-market-work'
  const MOOR_TILE = { row: 2, col: 0 }
  const FOREST_TILE = { row: 0, col: 0 }

  const beforeSession = (cards: string[], configure?: (state: GameState) => void) => {
    const session = createWorkSession({ seed: 1293, options: {
      playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, configure: state => {
      state.round = 8
      state.currentPlayerIndex = 0
      for (const space of state.actionSpaces) space.takenBy = []
      for (const player of state.players) {
        player.resources = baseResources()
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.rooms = 2
        player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
        player.farmTerrain = [{ ...FOREST_TILE, kind: 'forest' }, { ...MOOR_TILE, kind: 'moor' }]
        player.fields = []
        player.pastures = []
        player.stableTiles = []
        setWorkersAtHome(state, player, 2)
      }
      state.players[0]!.minorPlayed = [...cards]
      configure?.(state)
    } })
    sessions.push(session)
    return session
  }

  const special = (session: GameSession, actionId: 'cut-peat' | 'fell-trees' | 'hiring-fair') => {
    const response = actionId === 'hiring-fair'
      ? session.takeSpecialAction(0, MARKET_CARD, actionId)
      : session.takeSpecialAction(0, TERRAIN_CARD, actionId, { tile: actionId === 'cut-peat' ? MOOR_TILE : FOREST_TILE })
    expect(response.ok, response.error).toBe(true)
    return response
  }

  const cardEventIndex = (state: GameState, cardId: string, type: 'resource.moved' | 'resource.paid' | 'futureMeeple.queued' = 'resource.moved') =>
    state.events.findIndex(event => event.type === type && event.sourceCardId === cardId)
  const terrainIndex = (state: GameState, actionId: 'cut-peat' | 'fell-trees') =>
    state.events.findIndex(event => event.type === 'farm.terrainChanged' && event.sourceActionId === actionId)
  const hasTile = (player: PlayerState, tile: { row: number; col: number }) =>
    (player.farmTerrain ?? []).some(entry => entry.row === tile.row && entry.col === tile.col)
  const choose = (session: GameSession, response: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) => {
    const option = response.interaction.stateId === 'wait' ? response.interaction.request.options?.find(predicate) : undefined
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    const next = session.resolveChoice(0, option!.value)
    expect(next.ok, next.error).toBe(true)
    return next
  }

  it('M127 grants its building resource before Cut Peat clears the moor; its four-goods clause stays after', () => {
    const session = beforeSession(['M127_Wheelbarrow'])
    let response = special(session, 'cut-peat')
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M127_Wheelbarrow', request: { kind: 'choice' } })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(hasTile(response.state.players[0]!, MOOR_TILE)).toBe(true)
    expect(terrainIndex(response.state, 'cut-peat')).toBe(-1)

    response = choose(session, response, option => option.effectPreview?.resourcesGained?.stone === 1)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, fuel: 3 })
    expect(hasTile(response.state.players[0]!, MOOR_TILE)).toBe(false)
    expect(cardEventIndex(response.state, 'M127_Wheelbarrow')).toBeGreaterThanOrEqual(0)
    expect(cardEventIndex(response.state, 'M127_Wheelbarrow')).toBeLessThan(terrainIndex(response.state, 'cut-peat'))
    expect(response.state.players[1]!.resources).toMatchObject({ stone: 0, fuel: 0 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')

    const fell = special(beforeSession(['M127_Wheelbarrow']), 'fell-trees')
    expect(fell.interaction.request.kind).toBe('confirm-next-player')
    expect(fell.state.players[0]!.resources).toMatchObject({ wood: 2, fuel: 0, stone: 0 })
    expect(cardEventIndex(fell.state, 'M127_Wheelbarrow')).toBe(-1)

    const collect = beforeSession(['M127_Wheelbarrow'], state => {
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 4
    })
    const collected = collect.takeAction(0, 'forest')
    expect(collected.ok, collected.error).toBe(true)
    expect(collected.state.players[0]!.resources).toMatchObject({ wood: 4, fuel: 1 })
    const taken = collected.state.events.findIndex(event => event.type === 'resource.moved' && event.from.kind === 'actionSpace' && event.from.spaceId === 'forest')
    expect(taken).toBeGreaterThanOrEqual(0)
    expect(cardEventIndex(collected.state, 'M127_Wheelbarrow')).toBeGreaterThan(taken)
  }, 30_000)

  it('M118 pays for its Fell Trees upgrade before the forest is felled; its four-wood clause stays after', () => {
    const session = beforeSession(['M118_TimberMill'], state => { state.players[0]!.resources.fuel = 1 })
    let response = special(session, 'fell-trees')
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M118_TimberMill' })
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 1 })
    expect(hasTile(response.state.players[0]!, FOREST_TILE)).toBe(true)
    expect(terrainIndex(response.state, 'fell-trees')).toBe(-1)

    response = choose(session, response, option => option.effectPreview?.resourcesGained?.wood === 2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, fuel: 0 })
    expect(hasTile(response.state.players[0]!, FOREST_TILE)).toBe(false)
    const felled = terrainIndex(response.state, 'fell-trees')
    expect(cardEventIndex(response.state, 'M118_TimberMill', 'resource.paid')).toBeGreaterThanOrEqual(0)
    expect(cardEventIndex(response.state, 'M118_TimberMill', 'resource.paid')).toBeLessThan(felled)
    expect(cardEventIndex(response.state, 'M118_TimberMill')).toBeLessThan(felled)
    expect(response.interaction.request.kind).toBe('confirm-next-player')

    const peat = special(beforeSession(['M118_TimberMill'], state => { state.players[0]!.resources.fuel = 1 }), 'cut-peat')
    expect(peat.interaction.request.kind).toBe('confirm-next-player')
    expect(peat.state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 4 })
    expect(cardEventIndex(peat.state, 'M118_TimberMill')).toBe(-1)

    const collect = beforeSession(['M118_TimberMill'], state => {
      state.players[0]!.resources.fuel = 1
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 4
    })
    let collected = collect.takeAction(0, 'forest')
    expect(collected.ok, collected.error).toBe(true)
    expect(collected.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M118_TimberMill' })
    expect(collected.state.players[0]!.resources).toMatchObject({ wood: 4, fuel: 1 })
    collected = choose(collect, collected, option => option.effectPreview?.resourcesGained?.wood === 1)
    expect(collected.state.players[0]!.resources).toMatchObject({ wood: 5, fuel: 1 })
  }, 30_000)

  it('M119 and M118 both resolve before Fell Trees in the owner\'s order, without Pass', () => {
    const session = beforeSession(['M118_TimberMill', 'M119_AlderSwamp', 'M127_Wheelbarrow'])
    let response = special(session, 'fell-trees')
    expect(response.interaction.request.kind).toBe('select-trigger')
    const options = response.interaction.request.options ?? []
    expect(options.filter(option => option.sourceCard).map(option => option.sourceCard).sort()).toEqual(['M118_TimberMill', 'M119_AlderSwamp'])
    expect(options.find(option => option.value === '__pass__')?.disabled).toBe(true)
    expect(hasTile(response.state.players[0]!, FOREST_TILE)).toBe(true)

    response = choose(session, response, option => option.sourceCard === 'M119_AlderSwamp')
    expect(response.interaction.sourceCard).toBe('M119_AlderSwamp')
    response = choose(session, response, option => option.effectPreview?.resourcesGained?.reed === 1)
    response = resolveTriggerIfPresent(session, response, 'M118_TimberMill')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, reed: 1, fuel: 0 })
    const alder = cardEventIndex(response.state, 'M119_AlderSwamp')
    const timber = cardEventIndex(response.state, 'M118_TimberMill')
    expect(alder).toBeGreaterThanOrEqual(0)
    expect(timber).toBeGreaterThan(alder)
    expect(terrainIndex(response.state, 'fell-trees')).toBeGreaterThan(timber)
    expect(cardEventIndex(response.state, 'M127_Wheelbarrow')).toBe(-1)
  }, 30_000)

  it('M109 turns grain into food before a borrowed Cut Peat pays its food', () => {
    const borrowed = (grain: number) => beforeSession(['M109_Malthouse'], state => {
      Object.assign(state.players[0]!.resources, { food: 2, grain })
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location = { kind: 'playerFaceUp', playerId: state.players[1]!.id }
    })
    const session = borrowed(1)
    let response = special(session, 'cut-peat')
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M109_Malthouse' })
    expect(response.interaction.request.options?.some(option => option.value === '__skip__')).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 1, fuel: 0 })
    expect(hasTile(response.state.players[0]!, MOOR_TILE)).toBe(true)

    response = choose(session, response, option => option.value !== '__skip__')
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, grain: 0, fuel: 3 })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location)
      .toEqual({ kind: 'playerFaceDown', playerId: response.state.players[0]!.id })
    const malt = cardEventIndex(response.state, 'M109_Malthouse')
    const fee = response.state.events.findIndex(event => event.type === 'resource.paid' && event.sourceActionId === 'cut-peat')
    expect(malt).toBeGreaterThanOrEqual(0)
    expect(terrainIndex(response.state, 'cut-peat')).toBeGreaterThan(malt)
    expect(fee).toBeGreaterThan(terrainIndex(response.state, 'cut-peat'))
    expect(response.state.events[fee]).toMatchObject({ resources: { food: 2 } })

    const noGrain = special(borrowed(0), 'cut-peat')
    expect(noGrain.interaction.request.kind).toBe('confirm-next-player')
    expect(noGrain.state.players[0]!.resources).toMatchObject({ food: 0, fuel: 3 })
    const hiring = special(beforeSession(['M109_Malthouse'], state => { state.players[0]!.resources.grain = 1 }), 'hiring-fair')
    expect(hiring.interaction.request.kind).toBe('confirm-next-player')
    expect(hiring.state.players[0]!.resources).toMatchObject({ food: 1, grain: 1 })
    expect(cardEventIndex(hiring.state, 'M109_Malthouse')).toBe(-1)
  }, 30_000)

  it('M048 and M077 queue their future goods before Cut Peat clears the moor', () => {
    const cards = ['M048_ForestSwamp', 'M077_DryingField']
    const session = beforeSession(cards)
    let response = special(session, 'cut-peat')
    expect(response.interaction.request.kind).toBe('select-trigger')
    const options = response.interaction.request.options ?? []
    expect(options.filter(option => option.sourceCard).map(option => option.sourceCard).sort()).toEqual(cards)
    expect(options.find(option => option.value === '__pass__')?.disabled).toBe(true)
    expect(hasTile(response.state.players[0]!, MOOR_TILE)).toBe(true)
    expect(response.state.futureMeeples).toEqual([])

    response = resolveTriggerIfPresent(session, response, 'M077_DryingField')
    response = resolveTriggerIfPresent(session, response, 'M048_ForestSwamp')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expect(response.state.futureMeeples).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: 'M048_ForestSwamp', playerId: 'p1', round: 12, resources: { forest: 1 } }),
      expect.objectContaining({ cardId: 'M077_DryingField', playerId: 'p1', round: 11, resources: { fuel: 2 } }),
    ]))
    const peat = terrainIndex(response.state, 'cut-peat')
    for (const cardId of cards) {
      expect(cardEventIndex(response.state, cardId, 'futureMeeple.queued')).toBeGreaterThanOrEqual(0)
      expect(cardEventIndex(response.state, cardId, 'futureMeeple.queued')).toBeLessThan(peat)
    }

    const fell = special(beforeSession(cards), 'fell-trees')
    expect(fell.interaction.request.kind).toBe('confirm-next-player')
    expect(fell.state.futureMeeples).toEqual([])
  }, 30_000)

  it('M121 and M123 give their Hiring Fair goods before the Hiring Fair food', () => {
    const cards = ['M121_Loam', 'M123_StoneQuarry']
    const hiringSession = (usage: number, atHome: number) => beforeSession(cards, state => {
      state.players[0]!.cardStates = { M123_StoneQuarry: { counters: { usage } } }
      setWorkersAtHome(state, state.players[0]!, atHome)
    })
    const session = hiringSession(5, 1)
    let response = special(session, 'hiring-fair')
    expect(response.interaction.request.kind).toBe('select-trigger')
    const options = response.interaction.request.options ?? []
    expect(options.filter(option => option.sourceCard).map(option => option.sourceCard).sort()).toEqual(cards)
    expect(options.find(option => option.value === '__pass__')?.disabled).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)

    response = resolveTriggerIfPresent(session, response, 'M123_StoneQuarry')
    response = resolveTriggerIfPresent(session, response, 'M121_Loam')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, stone: 1, food: 1 })
    expect(counter(response.state.players[0]!, 'M123_StoneQuarry')).toBe(4)
    const hiringFood = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceActionId === 'hiring-fair')
    for (const cardId of cards) {
      expect(cardEventIndex(response.state, cardId)).toBeGreaterThanOrEqual(0)
      expect(cardEventIndex(response.state, cardId)).toBeLessThan(hiringFood)
    }

    const idle = special(hiringSession(0, 2), 'hiring-fair')
    expect(idle.interaction.request.kind).toBe('confirm-next-player')
    expect(idle.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0, food: 1 })
    const peat = special(hiringSession(5, 1), 'cut-peat')
    expect(peat.interaction.request.kind).toBe('confirm-next-player')
    expect(peat.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0, fuel: 3 })
    expect(counter(peat.state.players[0]!, 'M123_StoneQuarry')).toBe(5)
  }, 30_000)
})
