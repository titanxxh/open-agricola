import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import assert from 'node:assert/strict'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { type GameState } from '../../shared/contract/types'

import { confirmNext } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A165_PigBreeder'

const setup = (round: number, boar: number, capacity = true) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 2165, configure: state => {
    state.round = round
    state.players.forEach(player => { player.resources.food = 60; markAllWorkersUsed(state, player) })
    const owner = state.players[0]!
    owner.occupationPlayed = [CARD_ID]
    owner.resources.boar = boar
    owner.fenceSegments = capacity ? ['H-0-2', 'H-0-3', 'H-1-2', 'H-1-3', 'V-0-2', 'V-0-4'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } })) : []
    owner.pastures = capacity ? [{ id: 'boar-pasture', tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }], animalType: boar ? 'boar' : null, animalCount: Math.min(boar, 4) }] : []
    if (boar > 4) { owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, boar - 4).map(tile => [`${tile.row}-${tile.col}`, 'boar'])); }
    if (!capacity && boar) { owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, boar).map(tile => [`${tile.row}-${tile.col}`, 'boar'])); }
  } }))
  expect(session.state.players).toHaveLength(2)

  return session
}

describe('Pig Breeder due breeding', () => {
  it('round twelve breeds only boar and keeps the card as source', () => {
    const response = setup(12, 2).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(3)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Missing animal arrangement')
    expect(response.interaction.playerIndex).toBe(0)
    expect(response.state.events.some(event => event.type === 'farm.animalBred' && event.sourceCardId === CARD_ID)).toBe(true)
    expect(response.scores).toBeDefined()
  })
  it.each([0, 1])('round twelve does not breed %i boar', count => {
    const response = setup(12, count).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(count)
    expect(response.state.events.some(event => event.type === 'farm.animalBred' && event.sourceCardId === CARD_ID)).toBe(false)
  })
  it('a full pasture does not receive an extra animal', () => {
    const response = setup(12, 5).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(5)
  })
  it('round ten has no extra breeding', () => {
    const response = setup(10, 2).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })
})

describe("A165 command boundaries", () => {
  const PIG = 'A165_PigBreeder'
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
        p.occupationPlayed = played ? [PIG] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [PIG, 'A110_Roughcaster']
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
      else if (i.request.kind === 'feed')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
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
  function end(s: GameSession, accept = true) {
    let r = s.getState()
    for (const [n, space] of EIGHT.entries()) {
      r = turn(s, n % 4, space)
      if (n < EIGHT.length - 1)
        r = finish(s, r, accept)
    }
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    const pending = r
    return { pending, r: finish(s, r, accept) }
  }
  it("playing through actual Lessons immediately gains one pig and housing", () => {
    const s = setup({ food: 2 }, false)
    let pending = turn(s, 0, 'lessons')
    if (!pending.state.players[0]!.occupationPlayed.includes(PIG))
      pending = ok(s.resolveChoice(0, PIG))
    const r = finish(s, pending)
    assert.ok(r.state.players[0]!.occupationPlayed.includes(PIG))
    assert.equal(material(r).boar, 1)
    assert.equal(material(r).sheep, 0)
    save('A165-N1', { pending, r })
  })
  it("natural end of round twelve with capacity breeds exactly one extra pig", () => {
    const s = phaseSetup(12, 1, 2, true, 60, true)
    const { pending, r } = end(s)
    assert.equal(r.state.round, 13)
    assert.equal(material(r).boar, 3)
    assert.ok(r.state.events.some(e => e.type === 'farm.animalBred' && e.sourceCardId === PIG))
    save('A165-N2', { pending, r })
  })
  it("wrong round single pig and unplayed hand cannot breed an extra pig", () => {
    for (const [round, pigs, played] of [[10, 2, true], [12, 1, true], [12, 2, false]] as const) {
      const s = phaseSetup(round, 1, pigs, played, 60, true)
      const { r } = end(s)
      assert.equal(material(r).boar, pigs)
      save(`A165-N3-${round}-${pigs}-${played}`, r)
    }
  })
  it("full two pig pasture and other species house leave no extra pig capacity", () => {
    const s = setup({ food: 60 }, true, state => {
      state.round = 12
      pastures(state, 1, 2, false)
      const p = state.players[0]!
      p.resources.sheep = 1
      p.houseAnimals = { '2-0': 'sheep' }
    })
    const { r } = end(s)
    assert.equal(material(r).boar, 2)
    assert.equal(material(r).sheep, 1)
    save('A165-N4', r)
  })
})
