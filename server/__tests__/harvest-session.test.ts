import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/D/D060_LargePottery'
import '../../shared/cards/B/B104_SheepWalker'
import '../../shared/cards/E/E058_LunchtimeBeer'
import '../../shared/cards/M/M081_PeatBoat'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
describe('harvest session flow', () => {
  it('uses start-player harvest order and logs reap/feed/breed details with begging', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 0
    })

    const playerA = state.players[0]!
    const playerB = state.players[1]!

    playerA.startPlayer = false
    playerB.startPlayer = true

    playerA.name = 'PlayerA'
    playerB.name = 'PlayerB'

    playerA.fields = [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    playerB.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]

    playerA.resources.boar = 2
    playerB.resources.sheep = 2
    playerA.pastures = [
      {
        id: 'a-pasture',
        size: 3,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
        stables: 1,
        animalType: 'boar',
        animalCount: 2,
      },
    ]
    playerB.pastures = [
      {
        id: 'b-pasture',
        size: 3,
        tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
        stables: 1,
        animalType: 'sheep',
        animalCount: 2,
      },
    ]

    playerB.resources.grain = 1

    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) {
      throw new Error('expected harvestFeed pending')
    }
    expect(resp.interaction.playerIndex).toBe(1)
    expect(resp.interaction.request.remaining).toBe(2)

    resp = session.resolveChoice(1, 'confirm', { selections: [
      { sourceId: '__basic__', exchangeIndex: 0, count: 1, sourceName: '基础转化' },
    ] })

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) {
      throw new Error('expected second harvestFeed pending')
    }
    expect(resp.interaction.playerIndex).toBe(0)

    resp = session.resolveChoice(0, 'confirm', { selections: [] })

    resp = autoAdvanceRoundEnd(session)

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')

    const eventTypes = resp.state.events.map((event) => event.type)
    expect(eventTypes).toEqual(expect.arrayContaining([
      'returnHome.started',
      'worker.returned',
      'harvest.started',
      'harvest.phaseStarted',
      'harvest.feedConverted',
      'resource.paid',
      'farm.animalBred',
      'round.started',
      'action.revealed',
      'action.accumulated',
      'work.started',
    ]))
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'harvest.phaseStarted', harvestPhase: 'field' }),
      expect.objectContaining({ type: 'harvest.phaseStarted', harvestPhase: 'feeding' }),
      expect.objectContaining({ type: 'harvest.phaseStarted', harvestPhase: 'breeding' }),
      expect.objectContaining({
        type: 'harvest.feedConverted',
        playerId: playerB.id,
        source: '__basic__',
        cost: { grain: 1 },
        food: { food: 1 },
      }),
      expect.objectContaining({
        type: 'resource.paid',
        actorPlayerId: playerB.id,
        paymentFor: 'feeding',
        resources: expect.objectContaining({ grain: 1, begging: 1 }),
      }),
    ]))

    expect(resp.state.players[0]!.resources.begging).toBe(2)
    expect(resp.state.players[1]!.resources.begging).toBe(1)

    expect(resp.state.log.some((entry) => entry.key === 'log.harvestPhaseReap')).toBe(true)
    expect(resp.state.log.some((entry) => entry.key === 'log.harvestPhaseFeed')).toBe(true)
    expect(resp.state.log.some((entry) => entry.key === 'log.harvestPhaseBreed')).toBe(true)

    const reapLogs = resp.state.log.filter((entry) => entry.key === 'log.reapDetail')
    expect(reapLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: expect.objectContaining({
            player: 'PlayerA',
            resources: expect.objectContaining({ vegetable: 1 }),
          }),
        }),
        expect.objectContaining({
          params: expect.objectContaining({
            player: 'PlayerB',
            resources: expect.objectContaining({ grain: 1 }),
          }),
        }),
      ]),
    )

    expect(resp.state.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'log.harvestFeedConvert',
          params: expect.objectContaining({
            player: 'PlayerB',
            source: '__basic__',
          }),
        }),
        expect.objectContaining({
          key: 'log.harvestFeedDetail',
          params: expect.objectContaining({
            player: 'PlayerA',
            resources: expect.objectContaining({ food: 0, begging: 2 }),
          }),
        }),
        expect.objectContaining({
          key: 'log.harvestFeedDetail',
          params: expect.objectContaining({
            player: 'PlayerB',
            resources: expect.objectContaining({ grain: 1, begging: 1 }),
          }),
        }),
      ]),
    )

    const breedLogs = resp.state.log.filter((entry) => entry.key === 'log.harvestBreedDetail')
    expect(breedLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: expect.objectContaining({
            player: 'PlayerA',
            resources: expect.objectContaining({ boar: 1 }),
          }),
        }),
        expect.objectContaining({
          params: expect.objectContaining({
            player: 'PlayerB',
            resources: expect.objectContaining({ sheep: 1 }),
          }),
        }),
      ]),
    )
  })

  it('emits a game-ended event when the last round completes', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 14
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
      player.resources.food = 10
    })
    session.loadState(state)

    const resp = autoAdvanceRoundEnd(session, { maxIterations: 80 })

    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.events).toContainEqual(expect.objectContaining({ type: 'game.ended' }))
  })

  // Helper for the new sourceId+exchangeIndex tests below: build a 2-player
  // session at round 4 where playerA has familySize=1 (needs 2 food) and
  // playerB has 0 active workers (no feed pending). Caller can set up
  // playerA's resources / cards before performRoundEnd.
  const setupSinglePlayerHarvest = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 0
    })
    const playerA = state.players[0]!
    const playerB = state.players[1]!
    playerA.startPlayer = true
    playerB.startPlayer = false
    playerA.name = 'PlayerA'
    playerB.name = 'PlayerB'
    setActiveWorkerCount(playerB, 0)
    return { session, state, playerA, playerB }
  }

  const skipPostReapAnytime = (
    session: GameSession,
    resp: ReturnType<GameSession['performRoundEnd']>,
  ) => {
    expect(resp.state.roundPhase).toBe('harvest')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected post-reap anytime window')
    return session.resolveChoice(resp.interaction.playerIndex, '__skip__')
  }

  it('basic conversion via sourceId="__basic__" idx=0 converts grain to food', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    playerA.resources.grain = 2
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.request.remaining).toBe(2)

    resp = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: '__basic__', exchangeIndex: 0, count: 2, sourceName: 'Basic conversion' },
    ] })

    const p = resp.state.players[0]!
    expect(p.resources.grain).toBe(0)
    expect(p.resources.food).toBe(0)
    expect(p.resources.begging).toBe(0)
    const convertLog = resp.state.log.find((e) => e.key === 'log.harvestFeedConvert')
    expect(convertLog).toBeDefined()
    expect((convertLog as any).params.cost).toEqual({ grain: 2 })
    expect((convertLog as any).params.food).toEqual({ food: 2 })
  })

  it('calculates automatic feeding from resources changed in the post-reap anytime window', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    playerA.minorPlayed.push('D060_LargePottery')
    playerA.resources.clay = 2
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')

    resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, 'bulk:0=1')

    expect(resp.state.players[0]!.resources).toMatchObject({ clay: 1, food: 2, begging: 0 })
    expect(resp.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')

    resp = skipPostReapAnytime(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) {
      throw new Error('expected harvestFeed pending')
    }
    expect(resp.interaction.request).toMatchObject({ remaining: 0, foodUsed: 2 })
    expect(resp.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')

    resp = session.resolveChoice(0, 'confirm', { selections: [] })
    expect(resp.state.players[0]!.resources).toMatchObject({ clay: 1, food: 0, begging: 0 })
    expect(resp.state.log.some((entry) => entry.key === 'log.harvestFeedDetail')).toBe(true)
    expect(resp.scores).toHaveLength(2)
    expect(resp.state.round).toBe(5)
  })

  it('anytime exchange (D60 LargePottery clay->food) usable in harvest feed', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    playerA.minorPlayed.push('D060_LargePottery')
    playerA.resources.clay = 2
    session.loadState(state)

    let resp = skipPostReapAnytime(session, session.performRoundEnd())
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    resp = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'D060_LargePottery', exchangeIndex: 0, count: 1, sourceName: 'Large Pottery' },
    ] })

    const p = resp.state.players[0]!
    // 1 clay -> 2 food; need 2 food, all consumed; no begging
    expect(p.resources.clay).toBe(1)
    expect(p.resources.food).toBe(0)
    expect(p.resources.begging).toBe(0)
    const convertLog = resp.state.log.find((e) => e.key === 'log.harvestFeedConvert')
    expect(convertLog).toBeDefined()
    expect((convertLog as any).params.cost).toEqual({ clay: 1 })
    expect((convertLog as any).params.food).toEqual({ food: 2 })
  })

  it('anytime non-cookery exchange (B104 SheepWalker sheep->stone) usable in feed', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    // family of 1 -> needs 2 food. SheepWalker provides anytime
    // sheep->{boar|vegetable|stone}; a non-food (stone) trade still must be
    // selectable but produces no food, leaving full 2-food deficit -> begging.
    // The single sheep must already be on a pasture so we don't divert into
    // animalReorg before harvestFeed.
    playerA.occupationPlayed.push('B104_SheepWalker')
    playerA.resources.sheep = 1
    playerA.resources.stone = 0
    playerA.pastures = [
      {
        id: 'a-pasture',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 1,
      },
    ]
    session.loadState(state)

    let resp = skipPostReapAnytime(session, session.performRoundEnd())
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    // SheepWalker exchanges: idx 0 sheep->boar, idx 1 sheep->vegetable, idx 2 sheep->stone
    // Test sheep->stone: produces no food; full deficit goes to begging.
    resp = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'B104_SheepWalker', exchangeIndex: 2, count: 1, sourceName: 'Sheep Walker' },
    ] })

    const p = resp.state.players[0]!
    expect(p.resources.sheep).toBe(0)
    expect(p.resources.stone).toBe(1)
    expect(p.pastures[0]).toMatchObject({ animalType: null, animalCount: 0 })
    // No food produced -> full 2-food deficit goes to begging.
    expect(p.resources.begging).toBe(2)
  })

  it('publishes placed balances and rejects a farmyard trade after cooking the only placed sheep', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    state.enableFarmersOfTheMoor = true
    playerA.improvements.push('Major_Fireplace1')
    playerA.occupationPlayed.push('B104_SheepWalker')
    playerA.minorPlayed.push('M081_PeatBoat')
    playerA.resources.sheep = 1
    playerA.resources.fuel = 2
    playerA.houseAnimalType = 'sheep'
    playerA.houseAnimalCount = 1
    session.loadState(state)
    const pending = skipPostReapAnytime(session, session.performRoundEnd())
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: {
      kind: 'feed', placedAnimals: { sheep: 1 }, maxTradeTimesBySourceId: { B104_SheepWalker: 1 },
    } })
    const fireplace = { sourceId: 'Major_Fireplace1', exchangeIndex: 0, count: 1 }
    const peat = { sourceId: 'M081_PeatBoat', exchangeIndex: 4, count: 1 }
    const rejected = session.resolveChoice(0, 'confirm', { selections: [
      peat, fireplace, { sourceId: 'B104_SheepWalker', exchangeIndex: 2, count: 1 },
    ] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)
    expect(rejected.interaction).toEqual(pending.interaction)
    const accepted = session.resolveChoice(0, 'confirm', { selections: [peat, fireplace] })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.resources).toMatchObject({ sheep: 1, stone: 0, begging: 0 })
  })

  it.each([0, 1])('does not spend newly acquired sheep through B104 in the same feed batch with %i placed sheep', (placed) => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    state.enableFarmersOfTheMoor = true
    playerA.occupationPlayed.push('B104_SheepWalker')
    playerA.minorPlayed.push('M081_PeatBoat')
    playerA.resources.fuel = 2
    playerA.resources.sheep = placed
    playerA.houseAnimalType = placed ? 'sheep' : null
    playerA.houseAnimalCount = placed
    session.loadState(state)
    const pending = skipPostReapAnytime(session, session.performRoundEnd())
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: {
      kind: 'feed', maxTradeTimesBySourceId: { B104_SheepWalker: placed },
    } })
    const peatTrade = { sourceId: 'M081_PeatBoat', exchangeIndex: 4, count: 1 }
    const walkerTrade = { sourceId: 'B104_SheepWalker', exchangeIndex: 2, count: 1 }
    const rejected = session.resolveChoice(0, 'confirm', { selections: [
      peatTrade, ...Array.from({ length: placed + 1 }, () => walkerTrade),
    ] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)
    expect(rejected.interaction).toEqual(pending.interaction)
    const accepted = session.resolveChoice(0, 'confirm', { selections: [
      peatTrade, ...Array.from({ length: placed }, () => walkerTrade),
    ] })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.resources).toMatchObject({ sheep: 1, stone: placed })
  })

  it('reorganizes a boar gained from B104 during the final harvest feed', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    state.round = 14
    playerA.occupationPlayed.push('B104_SheepWalker')
    playerA.resources.sheep = 1
    playerA.pastures = [{
      id: 'a-pasture',
      size: 2,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 1,
    }]
    session.loadState(state)

    let resp = skipPostReapAnytime(session, session.performRoundEnd())
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) {
      throw new Error('expected harvestFeed pending')
    }
    resp = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'B104_SheepWalker', exchangeIndex: 0, count: 1, sourceName: 'Sheep Walker' },
    ] })

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected animal reorganization')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    expect(resp.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1 })
    expect(resp.state.players[0]!.pastures[0]).toMatchObject({ animalType: null, animalCount: 0 })

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'a-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
    ])

    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'boar', animalCount: 1 })
  })

  it('reorganizes a B104 boar before scoring when E058 skips breeding', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    state.round = 14
    playerA.minorPlayed.push('E058_LunchtimeBeer')
    playerA.occupationPlayed.push('B104_SheepWalker')
    playerA.resources.sheep = 1
    playerA.pastures = [{
      id: 'a-pasture',
      size: 2,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 1,
    }]
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected E058 choice')
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    if (!accept) throw new Error('expected E058 accept option')
    resp = session.resolveChoice(0, accept.value)

    resp = skipPostReapAnytime(session, resp)
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) {
      throw new Error('expected harvestFeed pending')
    }
    resp = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'B104_SheepWalker', exchangeIndex: 0, count: 1, sourceName: 'Sheep Walker' },
    ] })

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected animal reorganization')
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'a-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
    ])

    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'boar', animalCount: 1 })
  })
})
