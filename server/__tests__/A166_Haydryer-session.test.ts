import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A166_Haydryer'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'

import { confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A166_Haydryer'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, pastures = 1, food = 10, round = 4 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5166, options: { playerCount: 4 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    if (played || index !== 0) markAllWorkersUsed(state, player)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources.food = food
  player.resources.cattle = 0
  player.houseAnimals = {};
  player.stableAnimals = {}
  player.pastures = Array.from({ length: pastures }, (_, index) => ({ id: `haydryer-pasture-${index}`, tiles: [{ row: 0, col: index + 1 }], animalType: null, animalCount: 0 }))
  const edges = new Set<string>()
  for (let col = 1; col <= pastures; col++) {
    for (const edge of [`H-0-${col}`, `H-1-${col}`, `V-0-${col}`, `V-0-${col + 1}`]) edges.add(edge)
  }
  expect(edges.size).toBeLessThanOrEqual(15)
  player.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
  if (!played) setWorkersAtHome(state, player, 2)
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

const acceptHaydryer = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) =>
    candidate.sourceCard === CARD_ID && candidate.value !== '__skip__')
    ?? getChoiceOptions(response)?.find((candidate) => candidate.value !== '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const placeCattle = (session: GameSession, response: SessionResponse, pastures: number) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const zone = pastures > 0
    ? response.interaction.request.zones.find((candidate) => candidate.id === 'haydryer-pasture-0')
    : response.interaction.request.zones.find((candidate) => candidate.zoneType === 'house')
  expect(zone).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', {
    zones: [{ ...zone!, animalType: 'cattle', animalCount: 1 }],
  })
}

describe('A166 Haydryer parity', () => {
  it('A166 S1: Haydryer is played as the first occupation without paying food in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(10)
  })

  it('A166 S2: zero through three pastures reduce the cattle price from four food to one', () => {
    for (let pastures = 0; pastures <= 3; pastures++) {
      const session = setup({ pastures, food: 10 })

      let response = acceptHaydryer(session, session.performRoundEnd())

      expect(response.state.players[0]!.resources.food, `${pastures} pastures`).toBe(10 - (4 - pastures))
      expect(response.state.players[0]!.resources.cattle, `${pastures} pastures`).toBe(1)
      response = placeCattle(session, response, pastures)
      const player = response.state.players[0]!
      expect(player.resources.food, `${pastures} pastures after feeding`).toBe(10 - (4 - pastures) - 4)
      expect(Object.values(player.houseAnimals).length + player.pastures.reduce((sum, pasture) =>
        sum + pasture.animalCount, 0)).toBe(1)
    }
  })

  it('A166 S3: a positive-cost cattle purchase may be declined', () => {
    const session = setup({ pastures: 2, food: 10 })
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(6)
  })

  it('A166 S4: with only two food a three-food Haydryer purchase cannot complete', () => {
    const session = setup({ pastures: 1, food: 2 })
    let response = session.performRoundEnd()
    if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 2 })
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })

  it('A166 S5: four pastures make the cattle gain mandatory and free', () => {
    const session = setup({ pastures: 4, food: 4 })

    let response = session.performRoundEnd()

    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, cattle: 1 })
    response = placeCattle(session, response, 4)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      animalType: 'cattle', animalCount: 1,
    })
  })

  it('A166 S6: a round without a harvest does not offer or grant cattle', () => {
    const response = setup({ pastures: 4, food: 10, round: 3 }).performRoundEnd()

    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.round).toBe(4)
  })
})

describe("A166 command boundaries", () => {
  const HAY = 'A166_Haydryer'
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
        p.occupationPlayed = played ? [HAY] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [HAY, 'A110_Roughcaster']
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
  function finish(s: GameSession, r: SessionResponse, accept = true, noHaydryerOffer = false) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (noHaydryerOffer) {
        assert.notEqual(i.sourceCard, HAY, JSON.stringify(i))
        if (i.request.kind === 'choice' || i.request.kind === 'select-trigger') assert.ok(i.request.options.every(option => option.sourceCard !== HAY || option.disabled))
      }
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'feed')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'select-trigger') {
          const triggers = i.request.options.filter(option => option.sourceCard === HAY && !option.disabled)
          assert.equal(triggers.length, 1, JSON.stringify(i))
          const trigger = triggers[0]!
          r = ok(s.resolveChoice(i.playerIndex, trigger.value))
          continue
        }
        assert.ok(i.request.kind === 'choice', JSON.stringify(i))
        assert.equal(i.sourceCard, HAY)
        assert.equal(i.playerIndex, 0)
        const o = i.request.options.find(o => accept ? !o.disabled && o.value !== '__skip__' && o.value !== '__done__' : o.value === '__skip__' || o.value === '__done__') ?? (accept ? i.request.options.find(o => !o.disabled && o.value !== '__skip__' && o.value !== '__done__') : undefined)
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
    }
    assert.ok(r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'), JSON.stringify(r.interaction))
    return r
  }
  function material(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.resources
  }
  const EIGHT = ['grain-seeds', 'day-laborer', 'forest', 'reed-bank', 'clay-pit', 'fishing', 'hollow-4', 'traveling-players']
  function pastures(state: GameState, count: number, animals = 0, stable = false) {
    const p = state.players[0]!
    const edges = new Set<string>()
    for (let col = 1; col <= count; col++) {
      for (const edge of [`H-0-${col}`, `H-1-${col}`, `V-0-${col}`, `V-0-${col + 1}`])
        edges.add(edge)
    }
    assert.ok(edges.size <= 15)
    p.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: p.id } }))
    p.pastures = Array.from({ length: count }, (_, n) => ({ id: 'p' + n, tiles: [{ row: 0, col: n + 1 }], animalType: n === 0 && animals ? 'boar' as const : null, animalCount: n === 0 ? animals : 0 }))
    p.stableTiles = stable ? [{ row: 0, col: 1 }] : []
    p.resources.boar = animals
  }
  function phaseSetup(round: number, pastureCount: number, pigs = 0, played = true, food = 60, stable = false) {
    return setup({ food }, played, state => {
      state.round = round
      pastures(state, pastureCount, pigs, stable)
    })
  }
  function end(s: GameSession, accept = true, noHaydryerOffer = false) {
    let r = s.getState()
    const nextRound = r.state.round + 1
    for (const [n, space] of EIGHT.entries()) {
      r = turn(s, n % 4, space)
      if (n < EIGHT.length - 1)
        r = finish(s, r, accept, noHaydryerOffer)
    }
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    const pending = r
    const done = finish(s, r, accept, noHaydryerOffer)
    assert.equal(done.interaction.stateId, 'idle', JSON.stringify(done.interaction))
    assert.equal(done.state.currentPlayerIndex, 0)
    assert.equal(done.state.roundPhase, 'work')
    assert.equal(done.state.round, nextRound)
    return { pending, r: done }
  }
  it("natural harvest charges four minus pasture count food for one cattle", () => {
    for (const count of [0, 1, 3]) {
      const s = phaseSetup(4, count)
      const { pending, r } = end(s)
      assert.equal(r.state.round, 5)
      assert.equal(material(r).cattle, 1)
      const control = end(phaseSetup(4, count, 0, false)).r
      assert.equal(material(r).food - material(control).food, -(4 - count))
      save(`A166-N1-${count}`, { pending, r, control })
    }
  })
  it("decline unaffordable hand and nonharvest cannot grant cattle", () => {
    const { pending: declineOffer, r: declined } = end(phaseSetup(4, 1), false)
    assert.ok(declineOffer.interaction.stateId === 'wait')
    assert.equal(declineOffer.interaction.sourceCard, HAY)
    assert.equal(declineOffer.interaction.playerIndex, 0)
    assert.equal(material(declined).cattle, 0)
    const poor = end(phaseSetup(4, 1, 0, true, 0), false, true).r
    assert.equal(poor.state.round, 5)
    assert.equal(poor.state.roundPhase, 'work')
    assert.equal(poor.interaction.stateId, 'idle')
    assert.equal(material(poor).food, 0)
    assert.equal(material(poor).cattle, 0)
    const hand = end(phaseSetup(4, 1, 0, false)).r
    assert.equal(material(hand).cattle, 0)
    const ordinary = end(phaseSetup(3, 1)).r
    assert.equal(material(ordinary).cattle, 0)
    save('A166-N2', { declined, poor, hand, ordinary })
  })
  it("four pastures clamp free cattle cost without creating food", () => {
    const on = end(phaseSetup(4, 4)).r, off = end(phaseSetup(4, 4, 0, false)).r
    assert.equal(material(on).cattle, 1)
    assert.equal(material(on).food, material(off).food)
    save('A166-N3', { on, off, limitation: 'Runtime free grant is automatic; printed optionality remains unadjudicated here' })
  })
})
