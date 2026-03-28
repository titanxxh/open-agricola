import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

describe('harvest session flow', () => {
  it('uses start-player harvest order and logs reap/feed/breed details with begging', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      player.workersAvailable = 0
      player.familySize = 1
      player.resources.food = 0
    })

    const playerA = state.players[0]!
    const playerB = state.players[1]!

    playerA.startPlayer = false
    playerB.startPlayer = true

    playerA.name = 'PlayerA'
    playerB.name = 'PlayerB'

    playerA.fields = [{ row: 0, col: 0, crop: 'vegetable', remaining: 1 }]
    playerB.fields = [{ row: 0, col: 0, crop: 'grain', remaining: 1 }]

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
    expect(resp.pending.type).toBe('harvestFeed')
    if (resp.pending.type !== 'harvestFeed') {
      throw new Error('expected harvestFeed pending')
    }
    expect(resp.pending.playerIndex).toBe(1)
    expect(resp.pending.remaining).toBe(2)

    resp = session.confirmHarvestFeed(1, [
      { resourceKey: 'grain', count: 1, food: 1, sourceName: '基础转化' },
    ])

    expect(resp.pending.type).toBe('harvestFeed')
    if (resp.pending.type !== 'harvestFeed') {
      throw new Error('expected second harvestFeed pending')
    }
    expect(resp.pending.playerIndex).toBe(0)

    resp = session.confirmHarvestFeed(0, [])

    while (resp.pending.type === 'animalReorg') {
      expect(resp.interaction.stateId).toBe('animalReorg')
      if (resp.interaction.stateId !== 'animalReorg') {
        throw new Error('expected animalReorg interaction')
      }
      resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones)
    }

    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(5)
    expect(resp.state.phase).toBe('work')

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
})
