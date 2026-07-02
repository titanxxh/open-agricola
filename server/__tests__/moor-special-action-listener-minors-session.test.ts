import { afterEach, describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { gainAction } from '../../shared/actions/effects/gain'
import { registerActionHook, unregisterActionHook } from '../../shared/actions/hooks'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { ActionFlow, ActionSpace, PlayerState, Resource } from '../../shared/contract/types'
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

const setup = (playerCount = 2, round = 5) => {
  const session = new GameSession(380, undefined, {
    playerCount,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
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
  const option = resp.interaction.options?.find((entry) => entry.value !== '__skip__')
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
  gainAction.execute({
    state: session.state,
    player,
    space: { id: 'test' } as ActionSpace,
    params: flow.params,
    sourceCard: flow.sourceCard,
  })
}

afterEach(() => {
  unregisterActionHook(TEST_ACTION_HOOK_ID)
  requireActiveCardRegistry('moor-special-action-test-cleanup')
    .removeListenersWhere((listener) =>
      listener.id === TEST_BEFORE_LISTENER_ID ||
      listener.id === TEST_PLACE_FARMER_LISTENER_ID)
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
    registerActionHook({
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
      actions: ['cut-peat'],
      phases: ['before'],
      handler: (context) => {
        expect(context.actionId).toBe('cut-peat')
        expect(context.extraData?.specialActionCardId).toEqual(expect.any(String))
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
    requireActiveCardRegistry('moor-special-action-test').registerListener(beforeProbe)
    requireActiveCardRegistry('moor-special-action-test').registerListener(placeFarmerProbe)
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
    executeGainLeaf(runCardEffectHook(session.state, player, 'M083_CoalSeam', 'onBuy'), session, player)
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
    expect(meetsCardPrerequisites(player, M116_MoorBirchTrees, session.state.round, session.state)).toBe(false)
    player.rooms = 3
    expect(meetsCardPrerequisites(player, M116_MoorBirchTrees, session.state.round, session.state)).toBe(true)
    expect(meetsCardPrerequisites(player, M122_WillowBank, session.state.round, session.state)).toBe(true)
    expect(meetsCardPrerequisites(player, M127_Wheelbarrow, session.state.round, session.state)).toBe(true)
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

  it('M121 rewards Hiring Fair only when exactly one worker remains at home and prerequisite is met', () => {
    const { session, player } = setup()
    player.minorPlayed.push('M121_Loam', 'A001_Shelter')
    setWorkersAtHome(session.state, player, 1)
    expect(meetsCardPrerequisites(player, M121_Loam, session.state.round, session.state)).toBe(true)

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
    expect(meetsCardPrerequisites(noPrereq.player, M121_Loam, noPrereq.state.round, noPrereq.state)).toBe(false)
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
