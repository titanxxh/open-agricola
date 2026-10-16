import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/A/A160_Lutenist'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'

import { assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function assertTurnFinished(response: SessionResponse) {
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player', JSON.stringify(response.interaction))
}

const CARD_ID = 'A160_Lutenist'

const FILLER = '__test_placeholder__'

const setup = ({ actor = 1, food = 1, played = true } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5160, options: { playerCount: 4 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.wood = 0
    player.resources.vegetable = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  const travelingPlayers = state.actionSpaces.find((space) => space.id === 'traveling-players')
  if (!travelingPlayers) throw new Error('traveling-players missing')
  travelingPlayers.resources.food = 3
  travelingPlayers.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const enterLutenistChoice = (session: GameSession, response: SessionResponse) => {
  while (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

const acceptPurchase = (session: GameSession, response: SessionResponse) => {
  response = enterLutenistChoice(session, response)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const purchase = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
  expect(purchase, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, purchase!.value)
}

describe('A160 Lutenist parity', () => {
  it('A160 S1: Lutenist is played as the first occupation without paying food in a four-player game', () => {
    const response = playOccupation(setup({ actor: 0, food: 0, played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A160 S2: after an opponent uses Traveling Players the owner gains food and wood and may buy a vegetable', () => {
    const session = setup()
    let response = session.takeAction(1, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 1, vegetable: 0 })
    response = acceptPurchase(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1, vegetable: 1 })
  })

  it('A160 S3: the owner may decline the vegetable purchase after receiving the automatic reward', () => {
    const session = setup()
    let response = enterLutenistChoice(session, session.takeAction(1, 'traveling-players'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 1, vegetable: 0 })
  })

  it('A160 S4: with no initial food the automatic reward resolves but the vegetable purchase is unavailable', () => {
    const session = setup({ food: 0 })
    const response = enterLutenistChoice(session, session.takeAction(1, 'traveling-players'))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 1, vegetable: 0 })
    expect(response.interaction.stateId === 'wait'
      ? (getChoiceOptions(response)?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })

  it('A160 S5: the owner using Traveling Players does not trigger Lutenist', () => {
    const response = setup({ actor: 0 }).takeAction(0, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, wood: 0, vegetable: 0 })
    expect(response.interaction.stateId === 'wait'
      ? (getChoiceOptions(response)?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })

  it('A160 S6: an opponent using a non-Traveling-Players space does not trigger Lutenist', () => {
    const response = setup().takeAction(1, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, vegetable: 0 })
    expect(response.interaction.stateId === 'wait'
      ? (getChoiceOptions(response)?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })
})

describe("A160 command boundaries", () => {
  const LUTE = 'A160_Lutenist'
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
        p.occupationPlayed = played ? [LUTE] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [LUTE, 'A110_Roughcaster']
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
          const trigger = i.request.options[0]
          assert.ok(trigger)
          r = ok(s.resolveChoice(i.playerIndex, trigger.value))
          continue
        }
        assert.ok(i.request.kind === 'choice', JSON.stringify(i))
        const o = i.request.options.find(o => accept ? !o.disabled && o.value !== '__skip__' && o.value !== '__done__' : o.value === '__skip__' || o.value === '__done__')
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
    }
    assert.ok(r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'), JSON.stringify(r.interaction))
    return r
  }
  function offer(s: GameSession, space: string) {
    finish(s, turn(s, 0, 'day-laborer'))
    return turn(s, 1, space)
  }
  function material(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.resources
  }
  it("mandatory food and wood arrive before optional two food buys exactly one vegetable", () => {
    const s = setup({ food: 1 })
    turn(s, 0, 'grain-seeds')
    const pending = turn(s, 1, 'traveling-players')
    assert.equal(material(pending).food, 2)
    assert.equal(material(pending).wood, 1)
    const r = finish(s, pending)
    assert.equal(material(r).food, 0)
    assert.equal(material(r).wood, 1)
    assert.equal(material(r).vegetable, 1)
    assert.equal(material(r, 1).vegetable, 0)
    save('A160-N1', { pending, r })
  })
  it("decline and zero initial food retain mandatory gain without free vegetable", () => {
    for (const food of [0, 2]) {
      const s = setup({ food })
      turn(s, 0, 'grain-seeds')
      const pending = turn(s, 1, 'traveling-players')
      if (food === 0)
        assertTurnFinished(pending)
      const r = finish(s, pending, false)
      assert.equal(material(r).food, food + 1)
      assert.equal(material(r).wood, 1)
      assert.equal(material(r).vegetable, 0)
      save(`A160-N2-${food}`, { pending, r })
    }
  })
  it("hand own and unrelated opponent cannot grant mandatory owner goods", () => {
    for (const [played, own, space] of [[false, false, 'traveling-players'], [true, true, 'traveling-players'], [true, false, 'fishing']] as const) {
      const s = setup({}, played)
      const r = own ? turn(s, 0, space) : finish(s, offer(s, space))
      assert.equal(material(r).wood, 0)
      assert.equal(material(r).vegetable, 0)
      assertTurnFinished(r)
      save(`A160-N3-${played}-${own}`, r)
    }
  })
  it("wrong actor illegal and stale purchase cannot spend or produce twice", () => {
    const s = setup({ food: 3 })
    turn(s, 0, 'grain-seeds')
    let pending = turn(s, 1, 'traveling-players')
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'confirm-player-switch')
    assert.equal(pending.interaction.request.fromPlayerIndex, 1)
    assert.equal(pending.interaction.request.toPlayerIndex, 0)
    pending = ok(s.resolveChoice(1, 'confirm'))
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assert.equal(pending.interaction.playerIndex, 0)
    assert.equal(pending.interaction.sourceCard, LUTE)
    const vegetable = getChoiceOptions(pending).find(option => !option.disabled && option.value !== '__skip__' && option.value !== '__done__')
    assert.ok(vegetable)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, vegetable.value))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'buy-two'))
    const r = finish(s, pending)
    assert.equal(material(r).food, 2)
    assert.equal(material(r).vegetable, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'buy'))
    save('A160-N4', r)
  })
})
