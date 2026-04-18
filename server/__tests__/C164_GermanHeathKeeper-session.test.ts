import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/C/C164_GermanHeathKeeper'

const CARD_ID = 'C164_GermanHeathKeeper'

describe('C164_GermanHeathKeeper session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession()
    const state = session.getState().state
    // GermanHeathKeeper is a 4+ player card, keep all 4 players
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)

    // Ensure pig-market is open and has resources
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (!pigMarket) throw new Error('pig-market space missing')
    pigMarket.resources.boar = 1

    session.loadState(state)
    return session
  }

  it('owner gains 1 sheep when owner uses pig-market', () => {
    const session = setup(0)
    const sheepBefore = session.getState().state.players[0]!.resources.sheep

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)

    // Handle animalReorg for boar from pig-market
    if (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(0, [
        { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ])
    }

    // Handle player switch if needed (sheep gain from card)
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    // Handle animalReorg for sheep from card
    if (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(0, [
        { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.sheep).toBe(sheepBefore + 1)
  })

  it('owner gains 1 sheep when opponent uses pig-market', () => {
    const session = setup(1)
    const sheepBefore = session.getState().state.players[0]!.resources.sheep

    let resp = session.takeAction(1, 'pig-market')
    expect(resp.ok).toBe(true)

    // Handle animalReorg for opponent's boar
    if (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(1, [
        { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ])
    }

    // Handle player switch to owner for sheep gain
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    // Handle animalReorg for owner's sheep
    if (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(0, [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }

    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.sheep).toBe(sheepBefore + 1)
  })

  it('does not trigger for non-pig-market spaces', () => {
    const session = setup(1)
    const sheepBefore = session.getState().state.players[0]!.resources.sheep

    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.sheep).toBe(sheepBefore)
  })
})
