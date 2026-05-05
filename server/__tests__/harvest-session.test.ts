import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import { isLegacyChoicePending } from './_helpers/legacy-confirms'
import '../../shared/cards/D/D60_LargePottery'
import '../../shared/cards/B/B104_SheepWalker'
describe('harvest session flow', () => {
  it('uses start-player harvest order and logs reap/feed/breed details with begging', () => {
    const session = new GameSession()
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
    expect(resp.interaction.remaining).toBe(2)

    resp = session.resolveChoice(1, 'confirm', { selections: [
      { sourceId: '__basic__', exchangeIndex: 0, count: 1, sourceName: '基础转化' },
    ] })

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) {
      throw new Error('expected second harvestFeed pending')
    }
    expect(resp.interaction.playerIndex).toBe(0)

    resp = session.resolveChoice(0, 'confirm', { selections: [] })

    while (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      const pi = resp.interaction.playerIndex
      const p = resp.state.players[pi]!
      const zones = p.pastures.map((pasture) => ({
        id: pasture.id,
        zoneType: 'pasture' as const,
        animalType: pasture.animalType ?? null,
        animalCount: pasture.animalCount + (pasture.animalType ? 1 : 0),
      }))
      resp = session.resolveChoice(pi, 'confirm', zones as unknown as Record<string, unknown>)
    }

    expect(isLegacyChoicePending(resp)).toBe(false)
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')

    expect(resp.state.players[0]!.resources.begging).toBe(2)
    expect(resp.state.players[1]!.resources.begging).toBe(1)

    expect(resp.state.log.some((entry) => entry.key === 'log.harvestPhaseReap')).toBe(true)
    expect(resp.state.log.some((entry) => entry.key === 'log.harvestPhaseFeed')).toBe(true)
    expect(resp.state.log.some((entry) => entry.key === 'log.harvestPhaseBreed')).toBe(true)

    const reapLogs = resp.state.log.filter((entry) => entry.key === 'log.harvestReapDetail')
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
            source: '基础转化',
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

  // Helper for the new sourceId+exchangeIndex tests below: build a 2-player
  // session at round 4 where playerA has familySize=1 (needs 2 food) and
  // playerB has 0 active workers (no feed pending). Caller can set up
  // playerA's resources / cards before performRoundEnd.
  const setupSinglePlayerHarvest = () => {
    const session = new GameSession()
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

  it('basic conversion via sourceId="__basic__" idx=0 converts grain to food', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    playerA.resources.grain = 2
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.remaining).toBe(2)

    resp = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: '__basic__', exchangeIndex: 0, count: 2, sourceName: 'Basic conversion' },
    ] })

    const p = resp.state.players[0]!
    expect(p.resources.grain).toBe(0)
    expect(p.resources.begging).toBe(0)
    const convertLog = resp.state.log.find((e) => e.key === 'log.harvestFeedConvert')
    expect(convertLog).toBeDefined()
    expect((convertLog as any).params.cost).toEqual({ grain: 2 })
    expect((convertLog as any).params.food).toEqual({ food: 2 })
  })

  it('anytime exchange (D60 LargePottery clay->food) usable in harvest feed', () => {
    const { session, state, playerA } = setupSinglePlayerHarvest()
    playerA.minorPlayed.push('D60_LargePottery')
    playerA.resources.clay = 2
    session.loadState(state)

    let resp = session.performRoundEnd()
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    resp = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'D60_LargePottery', exchangeIndex: 0, count: 1, sourceName: 'Large Pottery' },
    ] })

    const p = resp.state.players[0]!
    // 1 clay -> 2 food; need 2 food, all consumed; no begging
    expect(p.resources.clay).toBe(1)
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

    let resp = session.performRoundEnd()
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    // SheepWalker exchanges: idx 0 sheep->boar, idx 1 sheep->vegetable, idx 2 sheep->stone
    // Test sheep->stone: produces no food; full deficit goes to begging.
    resp = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'B104_SheepWalker', exchangeIndex: 2, count: 1, sourceName: 'Sheep Walker' },
    ] })

    const p = resp.state.players[0]!
    expect(p.resources.sheep).toBe(0)
    expect(p.resources.stone).toBe(1)
    // No food produced -> full 2-food deficit goes to begging.
    expect(p.resources.begging).toBe(2)
  })
})
