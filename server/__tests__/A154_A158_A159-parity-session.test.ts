import { describe, expect, it } from 'vitest'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/A/A154_Paymaster'
import '../../shared/cards/A/A158_CulinaryArtist'
import '../../shared/cards/A/A159_JoineroftheSea'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { descriptionEffects } from './_helpers/choice-description'

const sessionEvidence = createScenarioEvidence(import.meta.url)

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

const FILLER = '__test_placeholder__'

type ResourceName = 'wood' | 'grain' | 'vegetable' | 'sheep'

const setup = (cardId: string, resources: Partial<Record<ResourceName, number>> = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7159, options: { playerCount: 4 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 1
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 1 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [cardId]
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const setupInHand = (cardId: string) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7159, options: { playerCount: 4 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.occupationPlayed = []
    player.resources.food = 0
  })
  state.players[0]!.occupationHand = [cardId]
  session.loadState(state)
  return session
}

const playFirstOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const setAccumulation = (session: GameSession, spaceId: string) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources = { ...space.resources, ...(spaceId === 'reed-bank' ? { reed: 2 } : { food: 3 }) }
  space.takenBy = []
  session.loadState(state)
}

const switchToOwner = (session: GameSession, response: SessionResponse) => {
  while (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

const acceptReaction = (session: GameSession, response: SessionResponse) => {
  response = switchToOwner(session, response)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', playerIndex: 0, request: { kind: 'choice' },
  })
  if (response.interaction.stateId !== 'wait') throw new Error('expected card choice')
  const choice = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
  expect(choice).toBeDefined()
  return session.resolveChoice(0, choice!.value)
}

for (const cardId of ['A154_Paymaster', 'A158_CulinaryArtist', 'A159_JoineroftheSea']) {
  it(`${cardId.slice(0, 4)} S1: the occupation can be played as the first occupation in a four-player game`, () => {
    const response = playFirstOccupation(setupInHand(cardId), cardId)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(cardId)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
}

describe('A154 Paymaster parity', () => {
  it('A154 S2: after an opponent uses Fishing one grain may be given for one bonus point', () => {
    const session = setup('A154_Paymaster', { grain: 1 })
    setAccumulation(session, 'fishing')
    const response = acceptReaction(session, session.takeAction(1, 'fishing'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.cardStates.A154_Paymaster?.counters?.bonusVp).toBe(1)
  })

  it('A154 S3: the Paymaster exchange may be declined', () => {
    const session = setup('A154_Paymaster', { grain: 1 })
    setAccumulation(session, 'traveling-players')
    let response = switchToOwner(session, session.takeAction(1, 'traveling-players'))
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.cardStates.A154_Paymaster?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A154 S4: without grain no Paymaster exchange can occur', () => {
    const session = setup('A154_Paymaster')
    setAccumulation(session, 'fishing')
    const response = switchToOwner(session, session.takeAction(1, 'fishing'))
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.cardStates.A154_Paymaster?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('A158 Culinary Artist parity', () => {
  it.each([
    ['S2', 'grain', 4],
    ['S3', 'sheep', 5],
    ['S4', 'vegetable', 7],
  ] as const)('A158 %s: one %s may be exchanged for %i food', (_scenario, resource, food) => {
    const session = setup('A158_CulinaryArtist', { [resource]: 1 })
    setAccumulation(session, 'traveling-players')
    const response = acceptReaction(session, session.takeAction(1, 'traveling-players'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[resource]).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(food)
  })

  it('A158 S5: the Culinary Artist exchange may be declined', () => {
    const session = setup('A158_CulinaryArtist', { grain: 1 })
    setAccumulation(session, 'traveling-players')
    let response = switchToOwner(session, session.takeAction(1, 'traveling-players'))
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: 'A158_CulinaryArtist', request: { kind: 'choice' } })
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A158 S6: with none of the three goods no Culinary Artist exchange can occur', () => {
    const session = setup('A158_CulinaryArtist')
    setAccumulation(session, 'traveling-players')
    const response = switchToOwner(session, session.takeAction(1, 'traveling-players'))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A158_CulinaryArtist').toBe(true)
  })
})

describe('A159 Joiner of the Sea parity', () => {
  it.each([
    ['S2', 'fishing', 2],
    ['S3', 'reed-bank', 3],
  ] as const)('A159 %s: after an opponent uses %s one wood may be given for %i food', (_scenario, spaceId, food) => {
    const session = setup('A159_JoineroftheSea', { wood: 1 })
    setAccumulation(session, spaceId)
    const response = acceptReaction(session, session.takeAction(1, spaceId))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food })
    expect(response.state.players[1]!.resources.wood).toBe(1)
  })

  it('A159 S4: the Joiner of the Sea exchange may be declined', () => {
    const session = setup('A159_JoineroftheSea', { wood: 1 })
    setAccumulation(session, 'fishing')
    let response = switchToOwner(session, session.takeAction(1, 'fishing'))
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: 'A159_JoineroftheSea', request: { kind: 'choice' } })
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(response.state.players[1]!.resources.wood).toBe(0)
  })

  it('A159 S5: without wood no Joiner of the Sea exchange can occur', () => {
    const session = setup('A159_JoineroftheSea')
    setAccumulation(session, 'fishing')
    const response = switchToOwner(session, session.takeAction(1, 'fishing'))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources.wood).toBe(0)
  })

  it('A159 S6: an opponent using a non-Fishing non-Reed-Bank space grants nothing', () => {
    const session = setup('A159_JoineroftheSea', { wood: 1 })
    const response = session.takeAction(1, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })
})

describe("A154 command boundaries", () => {
  const CARD = 'A154_Paymaster'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(grain = 1, played = true, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.resources.grain = grain
        p.occupationPlayed = played ? [CARD] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [CARD, 'A110_Roughcaster']
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
  function finish(s: GameSession, r: SessionResponse, accept = true, actor = 1) {
    for (let n = 0; n < 12 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'choice' || i.request.kind === 'select-trigger') {
        assert.equal(i.playerIndex, 0)
        if (i.request.kind === 'choice') assert.equal(i.sourceCard, CARD)
        const o = i.request.options.find(o => accept ? !o.disabled && o.value !== '__skip__' && o.value !== '__done__' : o.value === '__skip__' || o.value === '__done__')
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
      else
        assert.fail(JSON.stringify(i))
    }
    assertTurnFinished(r, actor)
    return r
  }
  function vp(r: SessionResponse) {
    return r.state.players[0]!.cardStates[CARD]?.counters?.bonusVp ?? 0
  }
  function offer(s: GameSession, space = 'fishing') {
    turn(s, 0, 'day-laborer')
    return turn(s, 1, space)
  }
  it("real opponent food accumulation transfers exactly one owner grain for one owner bonus", () => {
    for (const space of ['fishing', 'traveling-players']) {
      const s = setup(2, true, state => state.actionSpaces.find(a => a.id === space)!.resources.food = 2)
      const expected = s.getState().state.players.map(player => ({ ...player.resources }))
      expected[0]!.food += 2
      expected[0]!.grain -= 1
      expected[1]!.food += 2
      expected[1]!.grain += 1
      const pending = offer(s, space), r = finish(s, pending)
      assert.deepEqual(r.state.players.map(player => player.resources), expected)
      assert.deepEqual(s.getState().state.players.map(player => player.resources), expected)
      assert.equal(r.state.players[0]!.resources.grain, 1)
      assert.equal(r.state.players[1]!.resources.grain, 1)
      assert.equal(r.state.players[2]!.resources.grain, 0)
      assert.equal(vp(r), 1)
      assert.equal(r.state.players[1]!.resources.food, 42)
      save(`A154-N1-${space}`, { pending, r })
    }
  })
  it("decline and no supply keep grain and bonus unchanged", () => {
    for (const grain of [0, 1]) {
      const s = setup(grain)
      const pending = offer(s)
      if (grain === 0)
        assertTurnFinished(pending, 1)
      const r = finish(s, pending, false)
      assert.equal(r.state.players[0]!.resources.grain, grain)
      assert.equal(r.state.players[1]!.resources.grain, 0)
      assert.equal(vp(r), 0)
      save(`A154-N2-${grain}`, { pending, r })
    }
  })
  it("own food accumulation non accumulation opponent and hand cannot trade", () => {
    const ownS = setup()
    const own = turn(ownS, 0, 'fishing')
    assert.equal(vp(own), 0)
    assert.equal(own.state.players[0]!.resources.grain, 1)
    const us = setup()
    turn(us, 0, 'grain-seeds')
    const unrelated = turn(us, 1, 'day-laborer')
    assert.equal(vp(unrelated), 0)
    assert.equal(unrelated.state.players[1]!.resources.grain, 0)
    const hs = setup(1, false)
    const hand = offer(hs)
    assert.equal(vp(hand), 0)
    assert.equal(hand.state.players[0]!.resources.grain, 1)
    assert.deepEqual(own.state.players.map(player => player.resources.grain), [1, 0, 0, 0])
    assert.deepEqual(unrelated.state.players.map(player => player.resources.grain), [2, 0, 0, 0])
    assert.deepEqual(hand.state.players.map(player => player.resources.grain), [1, 0, 0, 0])
    for (const [response, actor] of [[own, 0], [unrelated, 1], [hand, 1]] as const)
      assertTurnFinished(response, actor)
    save('A154-N3', { own, unrelated, hand })
  })
  it("invalid wrong actor and stale choices cannot transfer twice", () => {
    const s = setup(2)
    const expected = s.getState().state.players.map(player => ({ ...player.resources }))
    const pileFood = s.getState().state.actionSpaces.find(space => space.id === 'fishing')!.resources.food ?? 0
    expected[0]!.food += 2
    expected[0]!.grain -= 1
    expected[1]!.food += pileFood
    expected[1]!.grain += 1
    let r = offer(s)
    for (let n = 0; n < 4 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch'; n++)
      r = ok(s.resolveChoice(r.interaction.request.fromPlayerIndex, 'confirm'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assert.equal(r.interaction.playerIndex, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'transfer-five-grain'))
    const o = getChoiceOptions(r).find(o => !o.disabled && o.sourceCard === CARD && o.value !== '__skip__' && o.value !== '__done__')
    assert.ok(o)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, o.value))
    const done = finish(s, r)
    assert.deepEqual(done.state.players.map(player => player.resources), expected)
    assert.deepEqual(s.getState().state.players.map(player => player.resources), expected)
    assert.equal(vp(done), 1)
    assert.equal(done.state.players[0]!.resources.grain, 1)
    assert.equal(done.state.players[1]!.resources.grain, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, o.value))
    save('A154-N4', done)
  })
  it("next distinct opponent accumulation awards once more and stops when supply empty", () => {
    for (const [grain, finalPoints, secondGrain] of [[1, 1, 0], [2, 2, 1]] as const) {
      const s = setup(grain)
      const expectedFirst = s.getState().state.players.map(player => ({ ...player.resources }))
      const firstPileFood = s.getState().state.actionSpaces.find(space => space.id === 'fishing')!.resources.food ?? 0
      expectedFirst[0]!.food += 2
      expectedFirst[0]!.grain -= 1
      expectedFirst[1]!.food += firstPileFood
      expectedFirst[1]!.grain += 1
      const first = finish(s, offer(s, 'fishing'))
      assert.deepEqual(first.state.players.map(player => player.resources), expectedFirst)
      assert.deepEqual(s.getState().state.players.map(player => player.resources), expectedFirst)
      assert.equal(vp(first), 1)
      const expectedSecond = s.getState().state.players.map(player => ({ ...player.resources }))
      const secondPileFood = s.getState().state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food ?? 0
      expectedSecond[0]!.grain -= secondGrain
      expectedSecond[2]!.grain += secondGrain
      expectedSecond[2]!.food += secondPileFood
      const pending = turn(s, 2, 'traveling-players')
      if (grain === 1) assertTurnFinished(pending, 2)
      const second = finish(s, pending, grain === 2, 2)
      assert.deepEqual(second.state.players.map(player => player.resources), expectedSecond)
      assert.deepEqual(s.getState().state.players.map(player => player.resources), expectedSecond)
      assert.equal(vp(second), finalPoints)
      assert.equal(second.state.players[0]!.resources.grain, 0)
      assert.equal(second.state.players[1]!.resources.grain, 1)
      assert.equal(second.state.players[2]!.resources.grain, secondGrain)
      save(`A154-N5-${grain}`, { first, pending, second })
    }
  })
})

describe("A158 command boundaries", () => {
  const CULINARY = 'A158_CulinaryArtist'
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
        p.occupationPlayed = played ? [CULINARY] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [CULINARY, 'A110_Roughcaster']
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
  function finish(s: GameSession, r: SessionResponse, accept = true, crop: 'grain' | 'sheep' | 'vegetable' | null = null) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'select-trigger') {
          const triggers = i.request.options.filter(option => option.sourceCard === CULINARY && !option.disabled)
          assert.equal(triggers.length, 1, JSON.stringify(i))
          const trigger = triggers[0]!
          r = ok(s.resolveChoice(i.playerIndex, trigger.value))
          continue
        }
        assert.ok(i.request.kind === 'choice', JSON.stringify(i))
        assert.equal(i.sourceCard, CULINARY)
        assert.equal(i.playerIndex, 0)
        const o = i.request.options.find(o => accept ? !o.disabled && o.value !== '__skip__' && o.value !== '__done__' && (!crop || descriptionEffects(o.descriptionPreview).some(e => (e.kind === 'payment' || e.kind === 'resourceExchange') && e.resourcesPaid?.[crop] === 1)) : o.value === '__skip__' || o.value === '__done__')
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
    assert.ok(p.resources.sheep === 0 || p.resources.sheep === 1)
    p.pastures = [{ id: 'housing', tiles: [{ row: 0, col: 2 }], animalType: p.resources.sheep === 1 ? 'sheep' : null, animalCount: p.resources.sheep }]
    p.stableTiles = [{ row: 0, col: 2 }]
  }
  it("actual opponent Traveling Players exchanges exactly one selected supply good for four five or seven food", () => {
    for (const [type, food] of [['grain', 4], ['sheep', 5], ['vegetable', 7]] as const) {
      const s = setup({ [type]: 1 }, true, prepareHousing)
      const expected = s.getState().state.players.map(player => ({ ...player.resources }))
      const pileFood = s.getState().state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food ?? 0
      expected[0]!.food += 2 + food
      expected[0]![type] -= 1
      expected[1]!.food += pileFood
      const pending = offer(s, 'traveling-players'), r = finish(s, pending, true, type)
      assert.deepEqual(r.state.players.map(player => player.resources), expected)
      assert.deepEqual(s.getState().state.players.map(player => player.resources), expected)
      assert.equal(material(r)[type], 0)
      assert.equal(material(r).food, 22 + food)
      assert.equal(material(r, 1)[type], 0)
      save(`A158-N1-${type}`, { pending, r })
    }
  })
  it("decline absent goods own space unrelated opponent and hand cannot exchange", () => {
    const s = setup({ grain: 1 })
    const declined = finish(s, offer(s, 'traveling-players'), false)
    assert.equal(material(declined).grain, 1)
    assert.equal(material(declined).food, 22)
    const poor = setup()
    const noGoods = offer(poor, 'traveling-players')
    assertTurnFinished(noGoods, 1)
    assert.equal(material(noGoods).food, 22)
    for (const [played, own, space] of [[false, false, 'traveling-players'], [true, true, 'traveling-players'], [true, false, 'fishing']] as const) {
      const ss = setup({ grain: 1 }, played)
      const r = own ? turn(ss, 0, space) : offer(ss, space)
      assert.equal(material(r).grain, 1)
      assert.equal(material(r).food, own ? 21 : 22)
      if (!own)
        assert.equal(material(r).food, 22)
      assertTurnFinished(r, own ? 0 : 1)
      save(`A158-N2-${played}-${own}-${space}`, r)
    }
    save('A158-N2', { declined, noGoods })
  })
  it("single choice cannot exchange all goods or repeat after completion", () => {
    const s = setup({ grain: 1, sheep: 1, vegetable: 1 }, true, prepareHousing)
    const expected = s.getState().state.players.map(player => ({ ...player.resources }))
    const pileFood = s.getState().state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food ?? 0
    expected[0]!.food += 9
    expected[0]!.vegetable -= 1
    expected[1]!.food += pileFood
    let pending = offer(s, 'traveling-players')
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'confirm-player-switch')
    pending = ok(s.resolveChoice(1, 'confirm'))
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assert.equal(pending.interaction.playerIndex, 0)
    assert.equal(pending.interaction.sourceCard, CULINARY)
    const vegetable = getChoiceOptions(pending).find(option => !option.disabled && descriptionEffects(option.descriptionPreview).some(effect => (effect.kind === 'payment' || effect.kind === 'resourceExchange') && effect.resourcesPaid?.vegetable === 1))
    assert.ok(vegetable)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'trade-all-goods'))
    const r = finish(s, pending, true, 'vegetable')
    assert.deepEqual(r.state.players.map(player => player.resources), expected)
    assert.deepEqual(s.getState().state.players.map(player => player.resources), expected)
    assert.equal(material(r).grain, 1)
    assert.equal(material(r).sheep, 1)
    assert.equal(material(r).vegetable, 0)
    assert.equal(material(r).food, 29)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'trade-again'))
    assertStaleRejected(s, () => s.resolveChoice(0, vegetable.value))
    const rich = setup({ grain: 1, sheep: 1, vegetable: 2 }, true, prepareHousing)
    const richSwitch = offer(rich, 'traveling-players')
    assert.ok(richSwitch.interaction.stateId === 'wait' && richSwitch.interaction.request.kind === 'confirm-player-switch')
    const richPending = ok(rich.resolveChoice(1, 'confirm'))
    const richVegetable = getChoiceOptions(richPending).find(option => !option.disabled && descriptionEffects(option.descriptionPreview).some(effect => (effect.kind === 'payment' || effect.kind === 'resourceExchange') && effect.resourcesPaid?.vegetable === 1))
    assert.ok(richVegetable)
    const richDone = finish(rich, richPending, true, 'vegetable')
    assert.deepEqual([material(richDone).grain, material(richDone).sheep, material(richDone).vegetable, material(richDone).food], [1, 1, 1, 29])
    assertStaleRejected(rich, () => rich.resolveChoice(0, richVegetable.value))
    save('A158-N3', { pending, r, richPending, richDone })
  })
})

describe("A159 command boundaries", () => {
  const JOINER = 'A159_JoineroftheSea'
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
        p.occupationPlayed = played ? [JOINER] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [JOINER, 'A110_Roughcaster']
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
          const triggers = i.request.options.filter(option => option.sourceCard === JOINER && !option.disabled)
          assert.equal(triggers.length, 1, JSON.stringify(i))
          const trigger = triggers[0]!
          r = ok(s.resolveChoice(i.playerIndex, trigger.value))
          continue
        }
        assert.ok(i.request.kind === 'choice', JSON.stringify(i))
        assert.equal(i.sourceCard, JOINER)
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
  it("actual opponent Fishing and Reed Bank receive one wood while owner gains two or three food", () => {
    for (const [space, food] of [['fishing', 2], ['reed-bank', 3]] as const) {
      const s = setup({ wood: 1 })
      const expected = s.getState().state.players.map(player => ({ ...player.resources }))
      const collectedType = space === 'fishing' ? 'food' : 'reed'
      const pileCount = s.getState().state.actionSpaces.find(candidate => candidate.id === space)!.resources[collectedType] ?? 0
      expected[0]!.wood -= 1
      expected[0]!.food += 2 + food
      expected[1]!.wood += 1
      expected[1]![collectedType] += pileCount
      const pending = offer(s, space), r = finish(s, pending)
      assert.deepEqual(r.state.players.map(player => player.resources), expected)
      assert.deepEqual(s.getState().state.players.map(player => player.resources), expected)
      assert.equal(material(r).wood, 0)
      assert.equal(material(r, 1).wood, 1)
      assert.equal(material(r, 2).wood, 0)
      assert.equal(material(r).food, 22 + food)
      save(`A159-N1-${space}`, { pending, r })
    }
  })
  it("decline no wood hand own and unrelated opponent cannot grant food", () => {
    const s = setup({ wood: 1 })
    const decline = finish(s, offer(s, 'fishing'), false)
    assert.equal(material(decline).wood, 1)
    assert.equal(material(decline).food, 22)
    assert.deepEqual(decline.state.players.map(player => player.resources.wood), [1, 0, 0, 0])
    const poor = setup()
    const none = offer(poor, 'reed-bank')
    assertTurnFinished(none, 1)
    assert.equal(material(none).food, 22)
    assert.deepEqual(none.state.players.map(player => player.resources.wood), [0, 0, 0, 0])
    for (const [played, space] of [[false, 'fishing'], [true, 'grain-seeds']] as const) {
      const ss = setup({ wood: 1 }, played), r = offer(ss, space)
      assert.equal(material(r).wood, 1)
      assert.equal(material(r).food, 22)
      assert.deepEqual(r.state.players.map(player => player.resources.wood), [1, 0, 0, 0])
      assertTurnFinished(r, 1)
      save(`A159-N2-${played}`, r)
    }
    const ownSession = setup({ wood: 1 }, true, state => state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2)
    const own = turn(ownSession, 0, 'fishing')
    assertTurnFinished(own, 0)
    assert.equal(material(own).wood, 1)
    assert.equal(material(own).food, 22)
    assert.equal(material(own, 1).wood, 0)
    assert.deepEqual(own.state.players.map(player => player.resources.wood), [1, 0, 0, 0])
    save('A159-N2', { decline, none, own })
  })
  it("invalid actor and stale exchange cannot duplicate wood or food", () => {
    const s = setup({ wood: 2 })
    const expected = s.getState().state.players.map(player => ({ ...player.resources }))
    const pileFood = s.getState().state.actionSpaces.find(space => space.id === 'fishing')!.resources.food ?? 0
    expected[0]!.wood -= 1
    expected[0]!.food += 4
    expected[1]!.wood += 1
    expected[1]!.food += pileFood
    let pending = offer(s, 'fishing')
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'confirm-player-switch')
    assert.equal(pending.interaction.request.fromPlayerIndex, 1)
    assert.equal(pending.interaction.request.toPlayerIndex, 0)
    pending = ok(s.resolveChoice(1, 'confirm'))
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assert.equal(pending.interaction.playerIndex, 0)
    assert.equal(pending.interaction.sourceCard, JOINER)
    const exchange = getChoiceOptions(pending).find(option => !option.disabled && option.value !== '__skip__' && option.value !== '__done__')
    assert.ok(exchange)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'give-zero-wood'))
    assertRejectedUnchanged(s, () => s.resolveChoice(1, exchange.value))
    const r = finish(s, pending)
    assert.deepEqual(r.state.players.map(player => player.resources), expected)
    assert.deepEqual(s.getState().state.players.map(player => player.resources), expected)
    assert.equal(material(r).wood, 1)
    assert.equal(material(r, 1).wood, 1)
    assert.equal(material(r).food, 24)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'trade'))
    assertStaleRejected(s, () => s.resolveChoice(0, exchange.value))
    save('A159-N3', r)
  })
})
