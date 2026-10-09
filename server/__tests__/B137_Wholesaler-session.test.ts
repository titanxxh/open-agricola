import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B137_Wholesaler'

describe('B137_Wholesaler session', () => {
  /**
   * Setup with B137_Wholesaler already played.
   * Uses 2-player game (action spaces exist regardless of player count).
   * Player 0 gets a large pasture so animal-giving actions work.
   */
  const setup = (round = 1) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.occupationPlayed.push('B137_Wholesaler')
    if (!player.cardStates) player.cardStates = {}
    player.cardStates['B137_Wholesaler'] = {
      extraData: {
        wholesaler: {
          vegetableTaken: false,
          boarTaken: false,
          stoneTaken: false,
          cattleTaken: false,
        },
      },
    }

    // Give player 0 two large pastures so animals can be placed
    player.pastures = [
      {
        id: 'p1',
        size: 4,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 1,
        animalType: null,
        animalCount: 0,
      },
      {
        id: 'p2',
        size: 4,
        tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 3, col: 0 }, { row: 3, col: 1 }],
        stables: 1,
        animalType: null,
        animalCount: 0,
      },
    ]

    // Ensure pig-market and cattle-market have accumulated resources
    const pigMarket = state.actionSpaces.find(s => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 2
    const cattleMarket = state.actionSpaces.find(s => s.id === 'cattle-market')
    if (cattleMarket) cattleMarket.resources.cattle = 2
    // eastern-quarry accumulates stone
    const easternQuarry = state.actionSpaces.find(s => s.id === 'eastern-quarry')
    if (easternQuarry) easternQuarry.resources.stone = 2

    session.loadState(state)
    return session
  }

  it('initial data has all goods not taken', () => {
    const session = setup()
    const state = session.getState().state
    const data = readCardExtraData<{
      vegetableTaken: boolean
      boarTaken: boolean
      stoneTaken: boolean
      cattleTaken: boolean
    }>(state.players[0]!, 'B137_Wholesaler', 'wholesaler')
    expect(data).toEqual({
      vegetableTaken: false,
      boarTaken: false,
      stoneTaken: false,
      cattleTaken: false,
    })
  })

  it('using vegetable-seeds gives extra vegetable from card', () => {
    const session = setup()
    const state = session.getState().state
    const initialVeg = state.players[0]!.resources.vegetable
    session.loadState(state)

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'B137_Wholesaler')

    const p = resp.state.players[0]!
    // vegetable-seeds gives 1 vegetable, card gives 1 more
    expect(p.resources.vegetable).toBe(initialVeg + 2)

    const data = readCardExtraData<{ vegetableTaken: boolean }>(
      p, 'B137_Wholesaler', 'wholesaler',
    )
    expect(data!.vegetableTaken).toBe(true)
  })

  it('using vegetable-seeds second time does NOT give extra vegetable', () => {
    const session = setup()
    const state = session.getState().state
    // Mark vegetable as already taken
    state.players[0]!.cardStates!['B137_Wholesaler']!.extraData!.wholesaler = {
      vegetableTaken: true,
      boarTaken: false,
      stoneTaken: false,
      cattleTaken: false,
    }
    session.loadState(state)

    const vegBefore = state.players[0]!.resources.vegetable
    const resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)

    // Only the base gain of 1 vegetable
    expect(resp.state.players[0]!.resources.vegetable).toBe(vegBefore + 1)
  })

  it('using pig-market gives extra boar from card', () => {
    const session = setup()
    const state = session.getState().state
    const initialBoar = state.players[0]!.resources.boar
    session.loadState(state)

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)

    // pig-market is accumulating — triggers animalReorg
    expect(resp.interaction.stateId).toBe('wait')
    // Place all boar (2 from pig-market) into pasture p1
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 2 },
    ])
    resp = resolveTriggerIfPresent(session, resp, 'B137_Wholesaler')

    // After reorg, card after-hook fires and gives +1 boar
    // This may trigger another animalReorg
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
      ])
    }

    const p = resp.state.players[0]!
    // pig-market accumulated 2 boar + 1 extra from card = 3
    expect(p.resources.boar).toBe(initialBoar + 2 + 1)

    const data = readCardExtraData<{ boarTaken: boolean }>(
      p, 'B137_Wholesaler', 'wholesaler',
    )
    expect(data!.boarTaken).toBe(true)
  })

  it('using eastern-quarry gives extra stone from card', () => {
    const session = setup()
    const state = session.getState().state
    const initialStone = state.players[0]!.resources.stone
    session.loadState(state)

    let resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'B137_Wholesaler')

    const p = resp.state.players[0]!
    // eastern-quarry accumulated 2 stone + 1 from card
    expect(p.resources.stone).toBe(initialStone + 2 + 1)

    const data = readCardExtraData<{ stoneTaken: boolean }>(
      p, 'B137_Wholesaler', 'wholesaler',
    )
    expect(data!.stoneTaken).toBe(true)
  })

  it('using cattle-market gives extra cattle from card', () => {
    const session = setup()
    const state = session.getState().state
    const initialCattle = state.players[0]!.resources.cattle
    session.loadState(state)

    let resp = session.takeAction(0, 'cattle-market')
    expect(resp.ok).toBe(true)

    // cattle-market triggers animalReorg
    expect(resp.interaction.stateId).toBe('wait')
    // Place all cattle (2 from cattle-market) into pasture p2
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p2', zoneType: 'pasture', animalType: 'cattle', animalCount: 2 },
    ])
    resp = resolveTriggerIfPresent(session, resp, 'B137_Wholesaler')

    // After reorg, card after-hook fires and gives +1 cattle
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'p2', zoneType: 'pasture', animalType: 'cattle', animalCount: 3 },
      ])
    }

    const p = resp.state.players[0]!
    // cattle-market accumulated 2 cattle + 1 from card = 3
    expect(p.resources.cattle).toBe(initialCattle + 2 + 1)

    const data = readCardExtraData<{ cattleTaken: boolean }>(
      p, 'B137_Wholesaler', 'wholesaler',
    )
    expect(data!.cattleTaken).toBe(true)
  })

  it('using farmland does not trigger any wholesaler bonus', () => {
    const session = setup()
    const state = session.getState().state
    session.loadState(state)

    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    // Wholesaler data unchanged
    const data = readCardExtraData<{
      vegetableTaken: boolean
      boarTaken: boolean
      stoneTaken: boolean
      cattleTaken: boolean
    }>(resp.state.players[0]!, 'B137_Wholesaler', 'wholesaler')
    expect(data!.vegetableTaken).toBe(false)
    expect(data!.boarTaken).toBe(false)
    expect(data!.stoneTaken).toBe(false)
    expect(data!.cattleTaken).toBe(false)
  })
})
