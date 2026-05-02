import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'

import '../../shared/cards/B/B104_SheepWalker'

const CARD_ID = 'B104_SheepWalker'

describe('B104_SheepWalker session — last harvest enforcement', () => {
  const setupRound14Harvest = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 14
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
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

  it('forces animalReorg in last harvest even when no breeding occurs (single sheep)', () => {
    const { session, state, playerA } = setupRound14Harvest()
    playerA.occupationPlayed.push(CARD_ID)
    // 1 sheep on a pasture — not enough to breed (<2), but B104 must force reorg.
    playerA.resources.sheep = 1
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
    // Feed phase — playerA has 10 food, no begging.
    if (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(0, [])
    }

    // Without B104, breed phase ends here with no animals (1 sheep < 2). With
    // the fix, B104.enforceReorganizeOnLastHarvest must force animalReorg.
    expect(resp.pending.type).toBe('animalReorg')
    if (resp.pending.type !== 'animalReorg') return
    expect(resp.pending.playerIndex).toBe(0)

    // Confirm reorg leaving the sheep on its pasture.
    resp = session.confirmAnimalReorg(0, [
      { id: 'a-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
    ])

    expect(resp.state.gameOver).toBe(true)
  })

  it('does not enforce reorg when player has no sheep on board', () => {
    const { session, state, playerA } = setupRound14Harvest()
    playerA.occupationPlayed.push(CARD_ID)
    playerA.resources.sheep = 0
    session.loadState(state)

    let resp = session.performRoundEnd()
    if (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(0, [])
    }

    // No sheep -> no reorg forcing -> game ends normally.
    expect(resp.pending.type).toBe('none')
    expect(resp.state.gameOver).toBe(true)
  })

  it('does not enforce reorg in non-last harvest (round 4)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })
    const playerA = state.players[0]!
    playerA.startPlayer = true
    playerA.name = 'PlayerA'
    playerA.occupationPlayed.push(CARD_ID)
    playerA.resources.sheep = 1
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
    setActiveWorkerCount(state.players[1]!, 0)
    session.loadState(state)

    let resp = session.performRoundEnd()
    if (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(0, [])
    }
    // In a normal round, 1 sheep does not trigger reorg.
    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(5)
  })
})
