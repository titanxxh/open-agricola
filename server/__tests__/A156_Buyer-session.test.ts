import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A156_Buyer'
import { type ActionChoiceOption, type GameState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'

import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function assertTurnFinished(response: SessionResponse, actor: number) {
  assert.equal(response.ok, true, response.error)
  assert.equal(response.state.players.length, 4)
  assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
  assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: (actor + 1) % 4 })
  assert.equal(response.interaction.playerIndex, actor)
  assert.equal(response.state.currentPlayerIndex, actor)
  assert.equal(response.state.roundPhase, 'work')
}

describe('A156_Buyer session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push('A156_Buyer')
    owner.resources.food = 5

    // Ensure reed-bank has accumulated resources (base space, always open)
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 1

    // Ensure sheep-market is open in round 1
    state.roundActionOrder = state.roundActionOrder.map((id) =>
      id === 'sheep-market' ? null : id,
    )
    state.roundActionOrder[0] = 'sheep-market'

    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market space missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)
    return session
  }

  it('buyer can pay 1 food for 1 reed when opponent uses reed-bank', () => {
    const session = setup(1)
    const s = session.getState().state
    const foodBefore = s.players[0]!.resources.food
    const reedBefore = s.players[0]!.resources.reed
    const opponentFoodBefore = s.players[1]!.resources.food

    // Opponent (p1) uses reed-bank
    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.ok).toBe(true)

    // After opponent's action, after-hooks fire and create PlayerSwitch to buyer owner
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // The optional flow should present a choice to accept or skip
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      // Find the non-skip option (accept)
      const acceptOption = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      expect(acceptOption).toBeDefined()
      resp = session.resolveChoice(0, acceptOption!.value)
    }

    // Walk through any remaining player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Buyer lost 1 food and gained 1 reed
    expect(after.players[0]!.resources.food).toBe(foodBefore - 1)
    expect(after.players[0]!.resources.reed).toBe(reedBefore + 1)
    // Opponent gained 1 food from buyer's payment
    expect(after.players[1]!.resources.food).toBe(opponentFoodBefore + 1)
  })

  it('buyer can decline the optional exchange', () => {
    const session = setup(1)
    const s = session.getState().state
    const foodBefore = s.players[0]!.resources.food
    const reedBefore = s.players[0]!.resources.reed

    // Opponent (p1) uses reed-bank
    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.ok).toBe(true)

    // After opponent's action, after-hooks fire and create PlayerSwitch to buyer owner
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // The optional flow should present a choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      // Decline by choosing __skip__
      resp = session.resolveChoice(0, '__skip__')
    }

    // Walk through any remaining player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Buyer resources unchanged
    expect(after.players[0]!.resources.food).toBe(foodBefore)
    expect(after.players[0]!.resources.reed).toBe(reedBefore)
  })

  it('buyer can pay 1 food for 1 sheep when opponent uses sheep-market', () => {
    const session = setup(1)
    const s = session.getState().state
    const foodBefore = s.players[0]!.resources.food
    const sheepBefore = s.players[0]!.resources.sheep

    // Opponent (p1) uses sheep-market
    let resp = session.takeAction(1, 'sheep-market')
    expect(resp.ok).toBe(true)

    // Sheep collection triggers animalReorg for opponent first
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'animal-reorg') {
      resp = session.resolveChoice(1, 'confirm', { zones: [] })
    }

    // After opponent's action, after-hooks fire with PlayerSwitch
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Accept the optional exchange
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      const acceptOption = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      expect(acceptOption).toBeDefined()
      resp = session.resolveChoice(0, acceptOption!.value)
    }

    // Handle animalReorg for buyer if needed (gaining sheep requires placement)
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'animal-reorg') {
      expect(resp.interaction.playerIndex).toBe(0)
      resp = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ] })
    }

    // Walk through any remaining player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(foodBefore - 1)
    expect(after.players[0]!.resources.sheep).toBe(sheepBefore + 1)
  })

  it('buyer offer is not triggered for non-matching spaces', () => {
    const session = setup(1)
    const foodBefore = session.getState().state.players[0]!.resources.food

    // Opponent uses day-laborer (not a matching space)
    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches (there should be none for buyer)
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // No food should be lost
    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(foodBefore)
  })

  it('buyer offer is not triggered when owner uses matching space', () => {
    const session = setup(0)
    const foodBefore = session.getState().state.players[0]!.resources.food
    const reedBefore = session.getState().state.players[0]!.resources.reed

    // Owner (p0) uses reed-bank
    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Owner should have gained reed from the space but not triggered buyer's own-exchange
    const after = session.getState().state
    // Food should not decrease (no buyer exchange with self)
    expect(after.players[0]!.resources.food).toBe(foodBefore)
    // Reed should increase from the space accumulation, not from buyer
    expect(after.players[0]!.resources.reed).toBeGreaterThanOrEqual(reedBefore + 1)
  })
})

describe('A156 Buyer parity', () => {
  const CARD_ID = 'A156_Buyer'

  const FILLER = '__test_placeholder__'

  const setup = ({ actor = 1, food = 1, played = true } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6156, options: { playerCount: 4 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
      player.houseAnimals = {};
      player.pastures = []
      player.stableAnimals = {}
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.food = food
    for (const [id, resource, count] of [
      ['reed-bank', 'reed', 2],
      ['western-quarry', 'stone', 2],
      ['sheep-market', 'sheep', 1],
    ] as const) {
      const space = state.actionSpaces.find((candidate) => candidate.id === id)
      if (!space) throw new Error(`missing ${id}`)
      space.takenBy = []
      space.resources[resource] = count
    }
    session.loadState(state)
    return session
  }

  const enterBuyerChoice = (session: GameSession, response: SessionResponse) => {
    while (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    return response
  }

  const acceptPurchase = (session: GameSession, response: SessionResponse) => {
    response = enterBuyerChoice(session, response)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const purchase = getChoiceOptions(response)?.find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
      ?? getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(purchase, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, purchase!.value)
  }

  it('A156 S4: without food the Buyer owner receives no purchasable offer', () => {
    const session = setup({ food: 0 })
    const response = enterBuyerChoice(session, session.takeAction(1, 'reed-bank'))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, reed: 0 })
    expect(response.interaction.stateId === 'wait'
      ? getChoiceOptions(response)?.some((option) =>
        option.sourceCard === CARD_ID && option.value !== '__skip__') ?? false
      : false).toBe(false)
  })

  it('A156 S5: an opponent Western Quarry use can be bought as one stone', () => {
    const session = setup()
    const response = acceptPurchase(session, session.takeAction(1, 'western-quarry'))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 1 })
    expect(response.state.players[1]!.resources).toMatchObject({ food: 1, stone: 2 })
  })
})

describe("A156 command boundaries", () => {
  const BUYER = 'A156_Buyer'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(resources: Partial<GameState['players'][number]['resources']> = {}, played = true, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        const p = state.players[0]!
        Object.assign(p.resources, resources)
        p.occupationPlayed = played ? [BUYER] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [BUYER, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function finish(s: GameSession, r: SessionResponse, accept = true) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'select-trigger') {
          const triggers = i.request.options.filter(option => option.sourceCard === BUYER && !option.disabled)
          assert.equal(triggers.length, 1, JSON.stringify(i))
          const trigger = triggers[0]!
          r = ok(s.resolveChoice(i.playerIndex, trigger.value))
          continue
        }
        assert.ok(i.request.kind === 'choice', JSON.stringify(i))
        assert.equal(i.sourceCard, BUYER)
        assert.equal(i.playerIndex, 0)
        const o = i.request.options.find(o => accept ? !o.disabled && o.value !== '__skip__' && o.value !== '__done__' : o.value === '__skip__' || o.value === '__done__')
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
    }
    assertTurnFinished(r, 1)
    return r
  }
  function offer(s: GameSession, space: string) {
    assertTurnFinished(turn(s, 0, 'day-laborer'), 0)
    return turn(s, 1, space)
  }
  function material(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.resources
  }
  function prepareHousing(state: GameState) {
    const p = state.players[0]!
    p.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: p.id } }))
    p.pastures = [{ id: 'housing', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
    p.stableTiles = [{ row: 0, col: 2 }]
  }
  function pile(state: GameState, space: string, type: 'reed' | 'stone' | 'sheep' | 'boar' | 'food', count: number) {
    state.actionSpaces.find(a => a.id === space)!.resources[type] = count
  }
  it("actual opponent reed stone sheep and pig accumulation transfers one food for one matching good", () => {
    for (const [space, type] of [['reed-bank', 'reed'], ['western-quarry', 'stone'], ['eastern-quarry', 'stone'], ['sheep-market', 'sheep'], ['pig-market', 'boar']] as const) {
      const s = setup({ food: 1 }, true, state => {
        prepareHousing(state)
        pile(state, space, type, 1)
      })
      const pending = offer(s, space), r = finish(s, pending)
      assert.equal(material(r).food, 2)
      assert.equal(material(r, 1).food, 21)
      assert.equal(material(r)[type], 1)
      assert.equal(material(r, 2)[type], 0)
      save(`A156-N1-${space}`, { pending, r })
    }
  })
  it("decline zero food hand own and unrelated spaces cannot pay or gain", () => {
    const ds = setup({ food: 1 })
    const declined = finish(ds, offer(ds, 'reed-bank'), false)
    assert.equal(material(declined).reed, 0)
    assert.equal(material(declined).food, 3)
    const poor = setup({ food: 0 })
    turn(poor, 0, 'grain-seeds')
    const denied = turn(poor, 1, 'reed-bank')
    assertTurnFinished(denied, 1)
    assert.equal(material(denied).food, 0)
    assert.equal(material(denied).reed, 0)
    for (const played of [false, true]) {
      const s = setup({ food: 1 }, played)
      const r = played ? turn(s, 0, 'reed-bank') : offer(s, 'reed-bank')
      assert.equal(material(r).food, played ? 1 : 3)
      assert.equal(material(r, 1).food, 20)
      assertTurnFinished(r, played ? 0 : 1)
      save(`A156-N2-${played}`, r)
    }
    const unrelatedSession = setup({ food: 1 }, true, state => state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3)
    const unrelated = offer(unrelatedSession, 'forest')
    assertTurnFinished(unrelated, 1)
    assert.equal(material(unrelated).food, 3)
    assert.equal(material(unrelated).wood, 0)
    assert.equal(material(unrelated, 1).food, 20)
    assert.equal(material(unrelated, 1).wood, 3)
    save('A156-N2', { declined, denied, unrelated })
  })
  it("empty opponent pile rejects without a food transfer or general supply good", () => {
    const s = setup({ food: 1 }, true, state => pile(state, 'reed-bank', 'reed', 0))
    assertTurnFinished(turn(s, 0, 'day-laborer'), 0)
    const r = assertEmptyAccumulationRejected(s, 1, 'reed-bank')
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 1)
    assert.equal(material(r).reed, 0)
    assert.equal(material(r).food, 3)
    assert.equal(material(r, 1).reed, 0)
    assert.equal(material(r, 1).food, 20)
    save('A156-N3', r)
  })
  it("invalid wrong actor and stale commands cannot transfer food twice", () => {
    const s = setup({ food: 1 })
    let pending = offer(s, 'reed-bank')
    while (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'confirm-player-switch')
      pending = ok(s.resolveChoice(pending.interaction.request.fromPlayerIndex, 'confirm'))
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'buy-five'))
    const c = getChoiceOptions(pending).find(o => !o.disabled && o.sourceCard === BUYER && o.value !== '__skip__' && o.value !== '__done__')
    assert.ok(c)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, c.value))
    const r = finish(s, pending)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, c.value))
    assert.equal(material(r).reed, 1)
    assert.equal(material(r, 1).food, 21)
    save('A156-N4', r)
  })
})
