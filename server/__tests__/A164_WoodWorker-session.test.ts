import { describe, expect, it } from 'vitest'
import { computeAnimalZones, type AnimalZone } from '../../shared/domain/animal-zones'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A164_WoodWorker'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'

import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext , getChoiceOptions , undoRuleSnapshot , assertUndoRestored } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function assertAnimalPlacement(session: GameSession, initial: SessionResponse, totals: [number, number, number], expected: Pick<AnimalZone, 'id' | 'animalType' | 'animalCount' | 'capacity'>[], actor = 0) {
  for (const response of [initial, session.getState()]) {
    const player = response.state.players[actor]!
    assert.deepEqual([player.resources.sheep, player.resources.boar, player.resources.cattle], totals)
    const zones = session.withCtx(() => computeAnimalZones(player, response.state))
    assert.deepEqual(zones.filter(zone => zone.animalCount !== undefined && zone.animalCount > 0).map(zone => ({ id: zone.id, animalType: zone.animalType, animalCount: zone.animalCount, capacity: zone.capacity })), expected)
  }
}

function assertStaleRejected(session: GameSession, command: () => SessionResponse) {
  const before = session.getState()
  const expected = { state: captureStateWithHistory(before.state), interaction: structuredClone(before.interaction), scores: structuredClone(before.scores) }
  const rejected = assertRejectedUnchanged(session, command)
  for (const response of [rejected, session.getState()]) {
    assert.deepEqual({ state: captureStateWithHistory(response.state), interaction: response.interaction, scores: response.scores }, expected)
  }
}

function assertTurnFinished(response: SessionResponse, actor: number) {
  assert.equal(response.ok, true, response.error)
  assert.equal(response.state.players.length, 4)
  assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
  assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: (actor + 1) % 4 })
  assert.equal(response.interaction.playerIndex, actor)
  assert.equal(response.state.currentPlayerIndex, actor)
  assert.equal(response.state.roundPhase, 'work')
}

const CARD_ID = 'A164_WoodWorker'

const FILLER = '__test_placeholder__'

const setup = ({
  woodOnSpace = 3,
  woodInSupply = 0,
  actor = 0,
  played = true,
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5164, options: { playerCount: 4 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.wood = 0
    player.resources.food = 0
    player.resources.sheep = 0
    player.houseAnimals = {};
    player.pastures = []
    player.stableAnimals = {}
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.wood = woodInSupply
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = woodOnSpace
  forest.takenBy = []
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

const cardOption = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return undefined
  return getChoiceOptions(response)?.find((option) =>
    option.sourceCard === CARD_ID && option.value !== '__skip__')
}

const accept = (session: GameSession, response: SessionResponse) => {
  const option = cardOption(response)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.stateId === 'wait'
    ? response.interaction.playerIndex : 0, option!.value)
}

const keepSheepInHouse = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    request: { kind: 'animal-reorg' },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  const house = response.interaction.request.zones.find((zone) => zone.zoneType === 'house')
  expect(house?.capacity).toBeGreaterThanOrEqual(1)
  return session.resolveChoice(0, 'confirm', { zones: [{
    id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1,
  }] })
}

describe('A164 Wood Worker parity', () => {
  it('A164 S1: Wood Worker is played as the first occupation without paying food in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A164 S2: after using Forest the owner may return one wood there for one sheep', () => {
    const session = setup()

    const response = keepSheepInHouse(session, accept(session, session.takeAction(0, 'forest')))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, sheep: 1 })
    expect((Object.values(response.state.players[0]!.houseAnimals)[0] ?? null)).toBe('sheep')
    expect(Object.values(response.state.players[0]!.houseAnimals).length).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(1)
  })

  it('A164 S3: the exchange after using Forest may be declined', () => {
    const session = setup()
    let response = session.takeAction(0, 'forest')
    expect(cardOption(response)).toBeDefined()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, sheep: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
  })

  it('A164 S4: an empty wood accumulation space is rejected despite wood already in supply', () => {
    const session = setup({ woodOnSpace: 0, woodInSupply: 1 })
    const before = session.getState()

    const response = session.takeAction(0, 'forest')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, sheep: 0 })
    session.dispose()
  })

  it('A164 S5: a non-wood accumulation space does not trigger Wood Worker', () => {
    const session = setup()
    const state = session.getState().state
    const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
    clayPit.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, sheep: 0 })
    expect(cardOption(response)).toBeUndefined()
  })

  it("A164 S6: an opponent taking wood does not trigger the owner's Wood Worker", () => {
    const session = setup({ actor: 1 })

    const response = session.takeAction(1, 'forest')

    expect(response.state.players[1]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(cardOption(response)).toBeUndefined()
  })
})

describe("A164 command boundaries", () => {
  const CARD = 'A164_WoodWorker'
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
        p.occupationPlayed = played ? [CARD] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [CARD, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  const beforeAction = new WeakMap<GameSession, { rules: string; interaction: string; actor: number }>()
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    beforeAction.set(s, { rules: undoRuleSnapshot(r), interaction: JSON.stringify(r.interaction), actor })
    return ok(s.takeAction(actor, space))
  }
  function undo(s: GameSession) {
    const before = beforeAction.get(s)
    assert.ok(before)
    const undone = s.undoAction()
    assertUndoRestored(before.rules, undone)
    assertUndoRestored(before.rules, s.getState())
    assert.equal(JSON.stringify(undone.interaction), before.interaction)
    assert.equal(JSON.stringify(s.getState().interaction), before.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, before.actor)
    return undone
  }
  function finish(s: GameSession, r: SessionResponse, accept = true, actor = 0) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'select-trigger') {
          const triggers = i.request.options.filter(option => option.sourceCard === CARD && !option.disabled)
          assert.equal(triggers.length, 1, JSON.stringify(i))
          const trigger = triggers[0]!
          r = ok(s.resolveChoice(i.playerIndex, trigger.value))
          continue
        }
        assert.ok(i.request.kind === 'choice', JSON.stringify(i))
        assert.equal(i.sourceCard, CARD)
        assert.equal(i.playerIndex, 0)
        const o = i.request.options.find(o => accept ? !o.disabled && o.value !== '__skip__' && o.value !== '__done__' : o.value === '__skip__' || o.value === '__done__') ?? (accept ? i.request.options.find(o => !o.disabled && o.value !== '__skip__' && o.value !== '__done__') : undefined)
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
    }
    assertTurnFinished(r, actor)
    return r
  }
  function offer(s: GameSession, space: string) {
    turn(s, 0, 'day-laborer')
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
  it("actual wood accumulations return one wood to original pile for exactly one sheep", () => {
    for (const space of ['forest', 'grove', 'copse'])
      for (const count of [1, 3]) {
        const s = setup({ wood: 0 }, true, state => {
          prepareHousing(state)
          state.actionSpaces.find(a => a.id === space)!.resources.wood = count
        })
        const pending = turn(s, 0, space), r = finish(s, pending)
        assert.equal(material(r).wood, count - 1)
        assert.equal(material(r).sheep, 1)
        assert.equal(r.state.actionSpaces.find(a => a.id === space)!.resources.wood, 1)
        assert.equal(material(r, 1).sheep, 0)
        assertAnimalPlacement(s, r, [1, 0, 0], [{ id: 'housing', animalType: 'sheep', animalCount: 1, capacity: 4 }])
        save(`A164-N1-${space}-${count}`, { pending, r })
      }
  })
  it("empty wood pile rejects with or without existing exchange supply", () => {
    for (const wood of [0, 1]) {
      const s = setup({ wood }, true, state => state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 0)
      const r = assertEmptyAccumulationRejected(s, 0, 'forest')
      assert.equal(r.interaction.stateId, 'idle')
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(material(r).wood, wood)
      assert.equal(material(r).sheep, 0)
      assert.equal(r.state.actionSpaces.find(a => a.id === 'forest')!.resources.wood, 0)
      save(`A164-N2-${wood}`, r)
    }
  })
  it("decline hand opponent and non wood action cannot exchange supply wood", () => {
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    const ds = setup({ wood: 1 }, true, state => state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 2)
    const decline = finish(ds, turn(ds, 0, 'forest'), false)
    assert.equal(material(decline).wood, 3)
    assert.equal(material(decline).sheep, 0)
    assertAnimalPlacement(ds, decline, [0, 0, 0], [])
    for (const actual of [decline, ds.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, wood: 3 }, baseline, baseline, baseline])
    for (const [played, own, space] of [[false, true, 'forest'], [true, false, 'forest'], [true, true, 'clay-pit']] as const) {
      const s = setup({ wood: 1 }, played)
      const r = own ? turn(s, 0, space) : offer(s, space)
      for (const actual of [r, s.getState()])
        assert.equal(material(actual).wood, own && space === 'forest' ? 4 : 1)
      assert.equal(material(r).sheep, 0)
      assertAnimalPlacement(s, r, [0, 0, 0], [])
      assert.equal(r.state.actionSpaces.find(a => a.id === space)!.resources.wood ?? 0, 0)
      assertTurnFinished(r, own ? 0 : 1)
      const owner = !own ? { ...baseline, wood: 1, food: 22 }
        : space === 'forest' ? { ...baseline, wood: 4 } : { ...baseline, wood: 1, clay: 1 }
      for (const actual of [r, s.getState()])
        assert.deepEqual(actual.state.players.map(player => player.resources), [owner, own ? baseline : { ...baseline, wood: 3 }, baseline, baseline])
      save(`A164-N3-${played}-${own}-${space}`, r)
    }
    save('A164-N3', decline)
  })
  it("illegal wrong actor stale and whole undo cannot duplicate exchange", () => {
    const s = setup({ wood: 0 }, true, state => state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3)
    const assertOutcome = (response: SessionResponse) => {
      for (const result of [response, s.getState()]) {
        const player = result.state.players[0]!
        assert.deepEqual(player.resources, { wood: 2, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 1, boar: 0, cattle: 0, begging: 0 })
        assert.equal(result.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood, 1)
      }
      assertAnimalPlacement(s, response, [1, 0, 0], [{ id: 'house:2-0', animalType: 'sheep', animalCount: 1, capacity: 1 }])
    }
    const pending = turn(s, 0, 'forest')
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'return-zero'))
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assert.equal(pending.interaction.playerIndex, 0)
    assert.equal(pending.interaction.sourceCard, CARD)
    const exchange = getChoiceOptions(pending).find(option => !option.disabled && option.value !== '__skip__' && option.value !== '__done__')
    assert.ok(exchange)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, exchange.value))
    const r = finish(s, pending)
    assertOutcome(r)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'exchange-again'))
    assertStaleRejected(s, () => s.resolveChoice(0, exchange.value))
    assert.equal(material(r).wood, 2)
    assert.equal(material(r).sheep, 1)
    assertAnimalPlacement(s, r, [1, 0, 0], [{ id: 'house:2-0', animalType: 'sheep', animalCount: 1, capacity: 1 }])
    assert.equal(r.state.actionSpaces.find(a => a.id === 'forest')!.resources.wood, 1)
    const undone = undo(s)
    assert.equal(material(undone).wood, 0)
    assert.equal(material(undone).sheep, 0)
    assert.equal(undone.state.actionSpaces.find(a => a.id === 'forest')!.resources.wood, 3)
    const retry = finish(s, turn(s, 0, 'forest'))
    assertOutcome(retry)
    assert.equal(material(retry).wood, 2)
    assert.equal(material(retry).sheep, 1)
    assertAnimalPlacement(s, retry, [1, 0, 0], [{ id: 'house:2-0', animalType: 'sheep', animalCount: 1, capacity: 1 }])
    save('A164-N4', { pending, r, undone, retry })
  })
})
