import { describe, expect, it } from 'vitest'
import './setup-register-all'
import { GameSession } from '../../../server/game/authoritative-session'
import { runCardEffectHook } from '../card-effects'
import { executeCardListener, getRegisteredCardListeners, runCardListeners, type CardListenerContext } from '../card-listeners'
import { getAllTilePositions } from '../../domain/farm'

const placeholderHands = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  session.loadState(state)
}

const setupOwner = (cardId: string, playerCount = 5) => {
  const session = new GameSession(42, undefined, { playerCount })
  placeholderHands(session)
  const state = session.getState().state
  state.players[0]!.occupationPlayed = [cardId]
  session.loadState(state)
  return session
}

const reapSummary = (grainFields: number) => ({
  resources: {},
  grainFields,
  vegetableFields: 0,
  harvestedCrops: [],
  harvestCountApplications: [],
})

const occupySpace = (session: GameSession, spaceId: string, playerId = 'p2') => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`missing action space ${spaceId}`)
  space.takenBy = [{ playerId, workerId: `${playerId}-w1` }]
  session.loadState(state)
}

const listener = (id: string) => getRegisteredCardListeners().find((registration) => registration.id === id)!

describe('5+ reveal and reaction occupation cards', () => {
  it('B170 Corral Builder offers a free one-space pasture when Pig Market is revealed', () => {
    const session = setupOwner('B170_CorralBuilder')
    const state = session.getState().state
    state.round = 3
    state.roundActionOrder[2] = 'pig-market'
    const owner = state.players[0]!

    const flow = runCardEffectHook(state, owner, 'B170_CorralBuilder', 'onBeforeStartOfTurn')

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'fence',
      sourceCard: 'B170_CorralBuilder',
      optional: true,
      actionContext: {
        fencePolicy: {
          segmentBounds: { total: { min: 1, max: 4 } },
          newPastureBounds: { count: { min: 1, max: 1 }, totalSize: { min: 1, max: 1 } },
          costPolicy: { fence: { wood: 0 } },
        },
      },
    })
  })

  it('B170 Corral Builder also triggers on Cattle Market reveal and ignores other reveals', () => {
    const cattle = setupOwner('B170_CorralBuilder')
    let state = cattle.getState().state
    state.round = 4
    state.roundActionOrder[3] = 'cattle-market'
    let owner = state.players[0]!

    expect(runCardEffectHook(state, owner, 'B170_CorralBuilder', 'onBeforeStartOfTurn')).toMatchObject({
      actionId: 'fence',
      sourceCard: 'B170_CorralBuilder',
    })

    const other = setupOwner('B170_CorralBuilder')
    state = other.getState().state
    state.round = 3
    state.roundActionOrder[2] = 'vegetable-seeds'
    owner = state.players[0]!

    expect(runCardEffectHook(state, owner, 'B170_CorralBuilder', 'onBeforeStartOfTurn')).toBeNull()
  })

  it('B170 Corral Builder does not trigger when no one-space pasture can be fenced', () => {
    const session = setupOwner('B170_CorralBuilder')
    const state = session.getState().state
    state.round = 3
    state.roundActionOrder[2] = 'pig-market'
    const owner = state.players[0]!
    const allTiles = getAllTilePositions()
    owner.roomTiles = allTiles.slice(0, 2)
    owner.rooms = 2
    owner.fields = allTiles.slice(2).map((tile) => ({ row: tile.row, col: tile.col, stacks: [] }))

    expect(runCardEffectHook(state, owner, 'B170_CorralBuilder', 'onBeforeStartOfTurn')).toBeNull()
  })

  it('B175 Field Overseer gives only the highest reached reward for other players harvested grain fields', () => {
    const session = setupOwner('B175_FieldOverseer')
    const state = session.getState().state
    const owner = state.players[0]!
    state.harvestReapSummary = {
      [owner.id]: reapSummary(4),
      [state.players[1]!.id]: reapSummary(2),
      [state.players[2]!.id]: reapSummary(4),
    }

    const flow = runCardEffectHook(state, owner, 'B175_FieldOverseer', 'onEndHarvestFieldPhase')

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: 'B175_FieldOverseer',
      params: { vegetable: 1 },
    })
  })

  it('B175 Field Overseer pays the 3 and 4 thresholds and ignores the owner harvest', () => {
    const session = setupOwner('B175_FieldOverseer')
    const state = session.getState().state
    const owner = state.players[0]!
    state.harvestReapSummary = {
      [owner.id]: reapSummary(6),
      [state.players[1]!.id]: reapSummary(3),
    }

    expect(runCardEffectHook(state, owner, 'B175_FieldOverseer', 'onEndHarvestFieldPhase')).toMatchObject({
      params: { food: 1 },
    })

    state.harvestReapSummary[state.players[1]!.id] = reapSummary(4)
    expect(runCardEffectHook(state, owner, 'B175_FieldOverseer', 'onEndHarvestFieldPhase')).toMatchObject({
      params: { grain: 1 },
    })

    state.harvestReapSummary[state.players[1]!.id] = reapSummary(2)
    expect(runCardEffectHook(state, owner, 'B175_FieldOverseer', 'onEndHarvestFieldPhase')).toBeNull()
  })

  it('B179 Wild Boar Hunter offers 1 wood for 1 boar before return home when 3 wood spaces are occupied', () => {
    const session = setupOwner('B179_WildBoarHunter')
    occupySpace(session, 'forest')
    occupySpace(session, 'copse-56')
    occupySpace(session, 'grove-56')
    const state = session.getState().state
    const owner = state.players[0]!
    owner.resources.wood = 1

    const flow = runCardEffectHook(state, owner, 'B179_WildBoarHunter', 'onBeforeReturnHome')

    expect(flow).toMatchObject({
      type: 'seq',
      optional: true,
      children: [
        { actionId: 'pay', params: { wood: 1 }, sourceCard: 'B179_WildBoarHunter' },
        { actionId: 'gain', params: { boar: 1 }, sourceCard: 'B179_WildBoarHunter' },
      ],
    })
  })

  it('B179 Wild Boar Hunter does not trigger below threshold or without wood', () => {
    const session = setupOwner('B179_WildBoarHunter')
    occupySpace(session, 'forest')
    occupySpace(session, 'copse-56')
    let state = session.getState().state
    let owner = state.players[0]!
    owner.resources.wood = 1

    expect(runCardEffectHook(state, owner, 'B179_WildBoarHunter', 'onBeforeReturnHome')).toBeNull()

    occupySpace(session, 'grove-56')
    state = session.getState().state
    owner = state.players[0]!
    owner.resources.wood = 0

    expect(runCardEffectHook(state, owner, 'B179_WildBoarHunter', 'onBeforeReturnHome')).toBeNull()
  })

  it('C170 Amateur Fencer offers a free one-space pasture on play only when the owner has no pastures', () => {
    const session = setupOwner('C170_AmateurFencer')
    const state = session.getState().state
    const owner = state.players[0]!

    expect(runCardEffectHook(state, owner, 'C170_AmateurFencer', 'onBuy')).toMatchObject({
      type: 'leaf',
      actionId: 'fence',
      sourceCard: 'C170_AmateurFencer',
      optional: true,
      actionContext: {
        fencePolicy: {
          newPastureBounds: { count: { min: 1, max: 1 }, totalSize: { min: 1, max: 1 } },
          costPolicy: { fence: { wood: 0 } },
        },
      },
    })

    owner.pastures = [{ cells: [{ row: 0, col: 0 }], stable: false, animals: {} }]
    expect(runCardEffectHook(state, owner, 'C170_AmateurFencer', 'onBuy')).toBeNull()
  })

  it('C173 Top-Outer collects all food from Traveling Players 5/6 after House Building 5/6 is used', () => {
    const session = setupOwner('C173_TopOuter')
    const state = session.getState().state
    const owner = state.players[0]!
    const houseBuilding = state.actionSpaces.find((space) => space.id === 'house-building-56')!
    const traveling = state.actionSpaces.find((space) => space.id === 'traveling-players-56')!
    traveling.resources.food = 4

    const result = executeCardListener(listener('C173-top-outer-after-house-building-56'), {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: houseBuilding,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'collect',
      sourceCard: 'C173_TopOuter',
      actionContext: { spaceId: 'traveling-players-56', resource: 'food', amount: 4 },
      targetPlayerId: owner.id,
    })
  })

  it('C173 Top-Outer also triggers when another player uses House Building 5/6', () => {
    const session = setupOwner('C173_TopOuter')
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    const houseBuilding = state.actionSpaces.find((space) => space.id === 'house-building-56')!
    const traveling = state.actionSpaces.find((space) => space.id === 'traveling-players-56')!
    traveling.resources.food = 4

    const [result] = runCardListeners({
      state,
      player: opponent,
      triggerPlayer: opponent,
      space: houseBuilding,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      actionId: 'collect',
      targetPlayerId: owner.id,
      actionContext: { spaceId: 'traveling-players-56', resource: 'food', amount: 4 },
    })
  })

  it('C173 Top-Outer does not trigger for other spaces or empty Traveling Players 5/6', () => {
    const session = setupOwner('C173_TopOuter')
    const state = session.getState().state
    const owner = state.players[0]!
    const houseBuilding = state.actionSpaces.find((space) => space.id === 'house-building-56')!
    const traveling = state.actionSpaces.find((space) => space.id === 'traveling-players-56')!
    traveling.resources.food = 0

    const topOuter = listener('C173-top-outer-after-house-building-56')
    expect(executeCardListener(topOuter, {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: houseBuilding,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)).toBeUndefined()

    traveling.resources.food = 3
    expect(executeCardListener(topOuter, {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: state.actionSpaces.find((space) => space.id === 'traveling-players-56')!,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)).toBeUndefined()
  })

  it('C169 Fast Mason offers only the matching no-reed renovation after clay or stone accumulation', () => {
    const session = setupOwner('C169_FastMason')
    const state = session.getState().state
    const owner = state.players[0]!
    owner.houseType = 'wood'
    owner.rooms = 2
    owner.resources.clay = 2
    const hollow = state.actionSpaces.find((space) => space.id === 'hollow-56')!

    const clayResult = executeCardListener(listener('C169-fast-mason-after-clay-stone-collect'), {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: hollow,
      actionId: 'collect',
      phase: 'after',
      actionEvents: [{
        type: 'resource.moved',
        resources: { clay: 3 },
        from: { kind: 'actionSpace', spaceId: 'hollow-56' },
        to: { kind: 'player', playerId: owner.id },
      }],
    } as unknown as CardListenerContext)

    expect(clayResult?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'renovate-house',
      sourceCard: 'C169_FastMason',
      optional: true,
      params: { selectedOption: 'clay' },
      actionContext: { exactCost: { clay: 2 } },
    })

    owner.houseType = 'clay'
    owner.resources.stone = 2
    const quarry = state.actionSpaces.find((space) => space.id === 'eastern-quarry')!
    const stoneResult = executeCardListener(listener('C169-fast-mason-after-clay-stone-collect'), {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: quarry,
      actionId: 'collect',
      phase: 'after',
      actionEvents: [{
        type: 'resource.moved',
        resources: { stone: 2 },
        from: { kind: 'actionSpace', spaceId: 'eastern-quarry' },
        to: { kind: 'player', playerId: owner.id },
      }],
    } as unknown as CardListenerContext)

    expect(stoneResult?.flow).toMatchObject({
      params: { selectedOption: 'stone' },
      actionContext: { exactCost: { stone: 2 } },
    })
  })

  it('C169 Fast Mason ignores non-matching or unaffordable accumulation collections', () => {
    const session = setupOwner('C169_FastMason')
    const state = session.getState().state
    const owner = state.players[0]!
    owner.houseType = 'clay'
    owner.rooms = 2
    owner.resources.clay = 5
    owner.resources.stone = 1
    const fastMason = listener('C169-fast-mason-after-clay-stone-collect')
    const hollow = state.actionSpaces.find((space) => space.id === 'hollow-56')!
    const quarry = state.actionSpaces.find((space) => space.id === 'eastern-quarry')!

    expect(executeCardListener(fastMason, {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: hollow,
      actionId: 'collect',
      phase: 'after',
      actionEvents: [{
        type: 'resource.moved',
        resources: { clay: 3 },
        from: { kind: 'actionSpace', spaceId: 'hollow-56' },
        to: { kind: 'player', playerId: owner.id },
      }],
    } as unknown as CardListenerContext)).toBeUndefined()

    expect(executeCardListener(fastMason, {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: quarry,
      actionId: 'collect',
      phase: 'after',
      actionEvents: [{
        type: 'resource.moved',
        resources: { stone: 2 },
        from: { kind: 'actionSpace', spaceId: 'eastern-quarry' },
        to: { kind: 'player', playerId: owner.id },
      }],
    } as unknown as CardListenerContext)).toBeUndefined()
  })

  it('D175 Countryman offers an optional exactly-one-field sow after action-space renovation', () => {
    const session = setupOwner('D175_Countryman')
    const state = session.getState().state
    const owner = state.players[0]!
    owner.resources.grain = 1
    owner.fields = [{ row: 0, col: 0, stacks: [] }]
    const space = state.actionSpaces.find((candidate) => candidate.id === 'house-redevelopment')!

    const result = executeCardListener(listener('D175-countryman-after-action-space-renovation'), {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space,
      actionId: 'renovate-house',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'sow',
      sourceCard: 'D175_Countryman',
      optional: true,
      targetPlayerId: owner.id,
      actionContext: { minSelections: 1, maxSelections: 1, trueAction: false },
    })
  })

  it('D175 Countryman reacts to opponent and card action-space renovations', () => {
    const session = setupOwner('D175_Countryman')
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.resources.grain = 1
    owner.fields = [{ row: 0, col: 0, stacks: [] }]
    state.actionSpaces.push({
      id: 'B171_GreenhouseBuilder',
      nameKey: 'cards.B171_GreenhouseBuilder.name',
      descriptionKey: 'cards.B171_GreenhouseBuilder.desc',
      roundAvailable: 1,
      gainPerRound: {},
      resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
      takenBy: [],
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    })
    const greenhouse = state.actionSpaces.find((candidate) => candidate.id === 'B171_GreenhouseBuilder')!

    const [result] = runCardListeners({
      state,
      player: opponent,
      triggerPlayer: opponent,
      space: greenhouse,
      actionId: 'renovate-house',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      actionId: 'sow',
      targetPlayerId: owner.id,
      actionContext: { minSelections: 1, maxSelections: 1, trueAction: false },
    })
  })

  it('D175 Countryman ignores non-action-space renovation and impossible one-field sow', () => {
    const session = setupOwner('D175_Countryman')
    const state = session.getState().state
    const owner = state.players[0]!
    owner.resources.grain = 1
    owner.fields = [{ row: 0, col: 0, stacks: [] }]
    const countryman = listener('D175-countryman-after-action-space-renovation')

    expect(executeCardListener(countryman, {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: { id: 'renovate-house' },
      actionId: 'renovate-house',
      phase: 'after',
    } as unknown as CardListenerContext)).toBeUndefined()

    owner.fields = []
    expect(executeCardListener(countryman, {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: state.actionSpaces.find((candidate) => candidate.id === 'farm-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'after',
    } as unknown as CardListenerContext)).toBeUndefined()
  })
})
