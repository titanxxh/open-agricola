import { describe, expect, it } from 'vitest'
import { computeAnimalZones, type AnimalZone } from '../../shared/domain/animal-zones'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A148_Woolgrower'
import '../../shared/cards/A/A151_Minstrel'
import '../../shared/cards/A/A152_NightSchoolStudent'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
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

const FILLER = '__test_placeholder__'

const setup = (cardId: string, played = true) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7151, options: { playerCount: 4 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A148 Woolgrower parity', () => {
  it('A148 S1: Woolgrower can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A148_Woolgrower', false), 'A148_Woolgrower')
      .state.players[0]!.occupationPlayed).toContain('A148_Woolgrower')
  })

  it('A148 S2: two completed feeding phases allow exactly two sheep on Woolgrower', () => {
    const session = setup('A148_Woolgrower')
    const state = session.getState().state
    state.completedFeedingPhases = 2
    state.players[0]!.resources.sheep = 3
    session.loadState(state)
    let response = session.takeAction(0, 'day-laborer')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    assert.ok(!(response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg'), JSON.stringify(response.interaction))
    expect(response.interaction.request.zones).toContainEqual(expect.objectContaining({
      id: 'card:A148_Woolgrower', cardId: 'A148_Woolgrower', animalType: 'sheep', capacity: 2,
    }))
    response = session.resolveChoice(0, 'confirm', { zones: [
      { id: 'card:A148_Woolgrower', zoneType: 'card', animalType: 'sheep', animalCount: 2 },
    ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
  })

  it('A148 S3: before the first feeding phase Woolgrower provides no sheep zone', () => {
    const session = setup('A148_Woolgrower')
    const state = session.getState().state
    state.completedFeedingPhases = 0
    state.players[0]!.resources.sheep = 1
    session.loadState(state)
    const response = session.takeAction(0, 'day-laborer')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    assert.ok(!(response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg'), JSON.stringify(response.interaction))
    expect(response.interaction.request.zones.some((zone) => zone.id === 'card:A148_Woolgrower')).toBe(false)
  })
})

const placeWorker = (state: GameSession['state'], playerIndex: number, spaceId: string, workerId = '1') => {
  const player = state.players[playerIndex]!
  state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: player.id, workerId }]
}

const returnHomeSetup = (cardId: string) => {
  const session = setup(cardId)
  const state = session.getState().state
  state.round = 5
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder.splice(0, 4, 'sheep-market', 'grain-utilization', 'fencing', 'major-improvement')
  state.availableMajorImprovements = ['Major_Joinery']
  state.players[0]!.resources = { ...state.players[0]!.resources, wood: 2, stone: 2 }
  state.players[0]!.pastures = [{ id: 'p1', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
  state.players[0]!.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: state.players[0]!.id } }))
  state.players[0]!.occupationHand = ['A116_WoodCutter']
  return { session, state }
}

const endRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

describe('A151 Minstrel parity', () => {
  it('A151 S1: Minstrel can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A151_Minstrel', false), 'A151_Minstrel')
      .state.players[0]!.occupationPlayed).toContain('A151_Minstrel')
  })

  it('A151 S2: Minstrel offers the only legal vacant stage-one space', () => {
    const { session, state } = returnHomeSetup('A151_Minstrel')
    placeWorker(state, 0, 'fencing', '1')
    placeWorker(state, 1, 'sheep-market', '1')
    placeWorker(state, 2, 'major-improvement', '1')
    state.players[0]!.resources.grain = 1
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)
    expect(session.getState().actionAvailability?.['grain-utilization']).toBe(true)
    let response = endRound(session)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'A151_Minstrel' })
    assert.ok(!(response.interaction.stateId !== 'wait'), JSON.stringify(response.interaction))
    const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const sow = getChoiceOptions(response)?.find((option) => option.labelKey === 'actions.sow.name')
      expect(sow, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, sow!.value)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('A151 S3: two vacant stage-one spaces offer no Minstrel action', () => {
    const { session, state } = returnHomeSetup('A151_Minstrel')
    placeWorker(state, 0, 'fencing', '1')
    placeWorker(state, 1, 'grain-utilization', '1')
    session.loadState(state)
    const response = endRound(session)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A151_Minstrel').toBe(true)
  })
})

const resolveOccupation = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return response
  const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
  if (accept) response = session.resolveChoice(response.interaction.playerIndex, accept.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === 'A116_WoodCutter')
  return card ? session.resolveChoice(response.interaction.playerIndex, card.value) : response
}

describe('A152 Night-School Student parity', () => {
  it('A152 S1: Night-School Student can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A152_NightSchoolStudent', false), 'A152_NightSchoolStudent')
      .state.players[0]!.occupationPlayed).toContain('A152_NightSchoolStudent')
  })

  it('A152 S2: with no person returning from Lessons one food plays an occupation', () => {
    const { session, state } = returnHomeSetup('A152_NightSchoolStudent')
    state.players[0]!.resources.food = 20
    session.loadState(state)
    const response = resolveOccupation(session, endRound(session))
    expect(response.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.food).toBe(19)
  })

  it('A152 S3: a person returning from Lessons suppresses Night-School Student', () => {
    const { session, state } = returnHomeSetup('A152_NightSchoolStudent')
    placeWorker(state, 1, 'lessons', '1')
    session.loadState(state)
    const response = endRound(session)
    expect(response.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A152_NightSchoolStudent').toBe(true)
  })
})

describe("A148 command boundaries", () => {
  const WOOL = 'A148_Woolgrower'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        const p = state.players[0]!
        p.occupationPlayed = played ? [WOOL] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [WOOL, 'A110_Roughcaster']
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
  function wool(cap: number, type: 'sheep' | 'boar' | 'cattle' = 'sheep', played = true) {
    return setup(state => {
      state.completedFeedingPhases = cap
      state.players[0]!.resources[type] = cap + 1
    }, played)
  }
  function menu(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
    return r.interaction.request
  }
  it("completed feeding phases one two and six bound legal sheep housing on the card", () => {
    for (const cap of [1, 2, 6]) {
      const s = wool(cap), r = turn(s, 0, 'day-laborer'), q = menu(r)
      const z = q.zones.find(z => z.id === `card:${WOOL}`)
      assert.ok(z)
      assert.equal(z.capacity, cap)
      const done = ok(s.resolveChoice(0, 'confirm', { zones: [{ ...z, animalType: 'sheep', animalCount: cap }] }))
      assert.equal(done.state.players[0]!.resources.sheep, cap)
      assertAnimalPlacement(s, done, [cap, 0, 0], [{ id: `card:${WOOL}`, animalType: 'sheep', animalCount: cap, capacity: cap }])
      assert.ok(done.interaction.stateId === 'wait', JSON.stringify(done.interaction))
      assert.deepEqual(done.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(done.interaction.playerIndex, 0)
      assert.equal(done.state.currentPlayerIndex, 0)
      save(`A148-N1-${cap}`, { r, done })
    }
  })
  it("zero phases and hand exclude the holder independently of round number", () => {
    for (const [cap, played] of [[0, true], [2, false]] as const) {
      const s = wool(cap, 'sheep', played), r = turn(s, 0, 'day-laborer')
      assert.ok(!menu(r).zones.some(z => z.id === `card:${WOOL}`))
      save(`A148-N2-${cap}-${played}`, r)
    }
  })
  it("overcapacity wrong species and fabricated card reject before legal sheep placement", () => {
    const s = wool(2), r = turn(s, 0, 'day-laborer'), z = menu(r).zones.find(z => z.id === `card:${WOOL}`)
    assert.ok(z)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...z, animalType: 'sheep', animalCount: 3 }] }))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...z, animalType: 'boar', animalCount: 1 }] }))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...z, id: 'card:unknown', animalCount: 1 }] }))
    const stocked = wool(2, 'boar')
    const stockedPending = turn(stocked, 0, 'day-laborer')
    const stockedCard = menu(stockedPending).zones.find(zone => zone.id === `card:${WOOL}`)
    const house = menu(stockedPending).zones.find(zone => zone.zoneType === 'house')
    assert.ok(stockedCard && house)
    assert.equal(stockedPending.state.players[0]!.resources.boar, 3)
    assert.equal(stockedCard.capacity, 2)
    assert.deepEqual(stockedCard.allowedAnimalTypes, ['sheep'])
    assert.equal(house.capacity, 1)
    assertRejectedUnchanged(stocked, () => stocked.resolveChoice(0, 'confirm', {
      zones: [{ ...stockedCard, animalType: 'boar', animalCount: 1, animalCounts: { boar: 1 } }],
    }))
    const housed = ok(stocked.resolveChoice(0, 'confirm', {
      zones: [{ ...house, animalType: 'boar', animalCount: 1, animalCounts: { boar: 1 } }],
    }))
    assert.equal(housed.state.players[0]!.resources.boar, 1)
    assertAnimalPlacement(stocked, housed, [0, 1, 0], [{ id: 'house:2-0', animalType: 'boar', animalCount: 1, capacity: 1 }])
    assert.ok(housed.interaction.stateId === 'wait')
    assert.deepEqual(housed.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(housed.interaction.playerIndex, 0)
    assert.equal(housed.state.currentPlayerIndex, 0)
    const done = ok(s.resolveChoice(0, 'confirm', { zones: [{ ...z, animalCount: 2 }] }))
    assert.equal(done.state.players[0]!.resources.sheep, 2)
    assertAnimalPlacement(s, done, [2, 0, 0], [{ id: `card:${WOOL}`, animalType: 'sheep', animalCount: 2, capacity: 2 }])
    assert.ok(done.interaction.stateId === 'wait', JSON.stringify(done.interaction))
    assert.deepEqual(done.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(done.interaction.playerIndex, 0)
    assert.equal(done.state.currentPlayerIndex, 0)
    save('A148-N3', done)
  })
})

describe("A152 command boundaries", () => {
  const STUDENT = 'A152_NightSchoolStudent'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(round = 5, configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = round
        state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = 1
        for (const p of state.players)
          Object.assign(p.resources, { food: 60, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [STUDENT] : []
        state.players[0]!.occupationHand = ['A110_Roughcaster', 'A114_SeasonalWorker']
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
  function finish(s: GameSession, r: SessionResponse, occupation: string | null = null) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'feed')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'choice' && i.promptKey === 'ui.interactionChooseOccupation' && i.playerIndex !== 0) {
          const other = i.request.options.find(o => o.value === 'A110_Roughcaster')
          assert.ok(other)
          r = ok(s.resolveChoice(i.playerIndex, other.value))
          continue
        }
        assert.ok(i.request.kind === 'choice' || i.request.kind === 'select-trigger', JSON.stringify(i))
        const o = i.request.options.find(o => occupation ? o.value === occupation : o.value === '__skip__' || o.value === '__done__') ?? (occupation ? i.request.options.find(o => o.value !== '__skip__' && o.value !== '__done__') : undefined)
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
    }
    assert.ok(r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'), JSON.stringify(r.interaction))
    return r
  }
  function end(s: GameSession, spaces: string[], occupation: string | null = null, expectOffer = true) {
    let r = s.getState()
    const nextRound = r.state.round + 1
    for (const [n, space] of spaces.entries()) {
      const actor = n % r.state.players.length
      r = turn(s, actor, space)
      if (n < spaces.length - 1)
        r = finish(s, r)
    }
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    save('before-phase-choice', r)
    const pending = r
    if (expectOffer) {
      assert.ok(pending.interaction.stateId === 'wait', JSON.stringify(pending.interaction))
      assert.equal(pending.interaction.sourceCard, STUDENT)
      assert.equal(pending.interaction.playerIndex, 0)
    }
    else {
      assert.equal(pending.interaction.stateId, 'idle', JSON.stringify(pending.interaction))
      assert.equal(pending.state.round, nextRound)
      assert.equal(pending.state.roundPhase, 'work')
      assert.equal(pending.state.currentPlayerIndex, 0)
    }
    const done = finish(s, r, occupation)
    assert.equal(done.interaction.stateId, 'idle', JSON.stringify(done.interaction))
    assert.equal(done.state.currentPlayerIndex, 0)
    assert.equal(done.state.roundPhase, 'work')
    assert.equal(done.state.round, nextRound)
    return { pending, r: done }
  }
  const EIGHT = ['grain-seeds', 'day-laborer', 'forest', 'reed-bank', 'clay-pit', 'fishing', 'hollow-4', 'traveling-players']
  it("no returning Lessons person permits exactly one occupation for one food", () => {
    const s = setup()
    const { pending, r } = end(s, EIGHT, 'A110_Roughcaster')
    assert.ok(r.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'))
    assert.ok(r.state.players[0]!.occupationHand.includes('A114_SeasonalWorker'))
    assert.equal(r.state.players[0]!.resources.food, 59)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'A114_SeasonalWorker'))
    save('A152-N1', { pending, r })
  })
  it("decline keeps hand and zero food cannot grant a free occupation", () => {
    const declined = end(setup(), EIGHT).r
    assert.equal(declined.state.players[0]!.occupationPlayed.length, 1)
    assert.equal(declined.state.players[0]!.resources.food, 60)
    const poor = end(setup(5, state => state.players[0]!.resources.food = 0), EIGHT, null, false).r
    assert.equal(poor.state.players[0]!.occupationPlayed.length, 1)
    save('A152-N2', { declined, poor })
  })
  it("any opponent Lessons placement suppresses night school", () => {
    for (const lesson of ['lessons', 'lessons-4']) {
      const s = setup(5, state => state.players[1]!.occupationHand = ['A110_Roughcaster'])
      const spaces = [...EIGHT]
      spaces[1] = lesson
      const { r } = end(s, spaces, null, false)
      assert.deepEqual(r.state.players[0]!.occupationPlayed, [STUDENT])
      assert.equal(r.state.players[0]!.resources.food, 60)
      save(`A152-N3-${lesson}`, r)
    }
  })
})
