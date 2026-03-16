import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/B/B70_NewPurchase'
import '../../shared/cards/A/A166_Haydryer'
import '../../shared/cards/D/D99_EarthenwarePotter'

const chooseFirstOption = (session: GameSession, playerIndex: number) => {
  const pending = session.getState().pending
  expect(pending.type).toBe('choice')
  if (pending.type !== 'choice') {
    throw new Error('expected pending choice')
  }
  return session.resolveChoice(playerIndex, pending.options[0]!.value)
}

describe('stage hook flows', () => {
  it('runs B70_NewPurchase through before-start-of-turn flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3
    state.players.forEach((player) => {
      player.workersAvailable = 0
    })

    const player = state.players[0]!
    player.occupationPlayed.push('B70_NewPurchase')
    player.playedCards.push('occupation:B70_NewPurchase')
    player.resources.food = 6

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionNewPurchaseGrain')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionNewPurchaseVegetable')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(4)
    expect(resp.state.phase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.cardStates?.B70_NewPurchase?.counters?.triggerCount).toBe(2)
  })

  it('runs A166_Haydryer through before-harvest flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      player.workersAvailable = 0
    })

    const player = state.players[0]!
    player.occupationPlayed.push('A166_Haydryer')
    player.playedCards.push('occupation:A166_Haydryer')
    player.resources.food = 10
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionHaydryer')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('animalReorg')

    resp = session.confirmAnimalReorg(0, [
      { id: 'p1', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
    ])

    expect(resp.pending.type).toBe('none')
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(resp.state.players[0]!.cardStates?.A166_Haydryer?.counters?.triggerCount).toBe(1)
  })

  it('runs D99_EarthenwarePotter through after-harvest flow on round 14', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 14
    state.players.forEach((player) => {
      player.workersAvailable = 0
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D99_EarthenwarePotter')
    player.playedCards.push('occupation:D99_EarthenwarePotter')
    player.resources.food = 10
    player.resources.clay = 2
    player.cardStates = {
      ...player.cardStates,
      D99_EarthenwarePotter: { counters: { earlyBuy: 1 } },
    }

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionEarthenwarePotter')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('none')
    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.cardStates?.D99_EarthenwarePotter?.counters?.bonusVp).toBe(2)
    expect(resp.state.players[0]!.cardStates?.D99_EarthenwarePotter?.counters?.triggerCount).toBe(1)
  })
})
