import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B137_Wholesaler'
import assert from 'node:assert/strict'
import * as audit29Timing from './_helpers/audit/ae-negative-29-timing'

const finishAnimals = (session: GameSession, response: SessionResponse, animal: 'boar' | 'cattle') => {
  for (let step = 0; step < 2 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg'; step++) {
    response = session.resolveChoice(0, 'confirm', { zones: [{
      id: 'p1', zoneType: 'pasture', animalType: animal, animalCount: response.state.players[0]!.resources[animal],
    }] })
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

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

    resp = finishAnimals(session, resp, 'boar')

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

    resp = finishAnimals(session, resp, 'cattle')

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

describe('ae-negative-29-timing', () => {
  const { sessions, save, action, lesson, progress, wholesale } = audit29Timing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B137 N1 actual purchase stores one of each good and each legal late action collects its matching good once', () => { const bought = lesson(wholesale(false), 'B137_Wholesaler'); assert.deepEqual(bought.state.players[0]!.cardStates.B137_Wholesaler?.extraData?.wholesaler, { vegetableTaken: false, boarTaken: false, stoneTaken: false, cattleTaken: false }); const rows = []; for (const [space, type, key] of [['vegetable-seeds', 'vegetable', 'vegetableTaken'], ['pig-market', 'boar', 'boarTaken'], ['eastern-quarry', 'stone', 'stoneTaken'], ['cattle-market', 'cattle', 'cattleTaken']] as const) {
      const s = wholesale(), r = action(s, 0, space);
      assert.equal(r.state.players[0]!.resources[type], 2);
      assert.ok(r.state.players[0]!.cardStates.B137_Wholesaler?.extraData?.wholesaler && JSON.stringify(r.state.players[0]!.cardStates.B137_Wholesaler.extraData.wholesaler).includes(`"${key}":true`));
      if (type === 'boar' || type === 'cattle')
          assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 2);
      rows.push(r);
  } save('B137-N1', { bought, rows }); });
  it('B137 N2 real repeat use across round thirteen and fourteen gives no second stored vegetable and an opponent cannot consume the owner store', () => { const s = wholesale(true, 13), first = action(s, 0, 'vegetable-seeds'), fourteen = progress(s, 14), r = action(s, 0, 'vegetable-seeds'); assert.equal(first.state.players[0]!.resources.vegetable, 2); assert.equal(r.state.players[0]!.resources.vegetable, 3); const t = wholesale(), start = action(t, 0, 'grain-seeds'), opponent = action(t, 1, 'vegetable-seeds'); assert.equal(opponent.state.players[0]!.resources.vegetable, 0); assert.equal(opponent.state.players[1]!.resources.vegetable, 1); save('B137-N2', { first, fourteen, r, start, opponent }); });
  it('B137 N3 held Wholesaler and unrelated Grain Seeds never collect stored goods', () => { const s = wholesale(false), hand = action(s, 0, 'vegetable-seeds'); assert.equal(hand.state.players[0]!.resources.vegetable, 1); const t = wholesale(), other = action(t, 0, 'grain-seeds'); assert.equal(other.state.players[0]!.resources.vegetable, 0); assert.equal(other.state.players[0]!.cardStates.B137_Wholesaler?.extraData?.wholesaler, undefined); save('B137-N3', { hand, other }); });
})
