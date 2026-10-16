import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome, workersAvailable, setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { type ActionChoiceOption, type Resource, type GameState, type InteractionAnimalReorgZone } from '../../shared/contract/types'

import '../../shared/cards/B/B024_Lasso'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'B024_Lasso'
const FILLER = '__test_placeholder__'
const MARKET_SPACES = ['sheep-market', 'pig-market', 'cattle-market']

const resources = (values: Partial<Resource> = {}): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
  sheep: 0, boar: 0, cattle: 0, begging: 0, ...values,
})

const setup = ({ played = true, reed = 1 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5224, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = resources({ reed, food: 20 })
  player.pastures = [{
    id: 'p1',
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
      animalType: null,
    animalCount: 0
    }]
  for (const space of state.actionSpaces) {
    space.takenBy = []
    space.roundAvailable = Math.min(space.roundAvailable, 14)
  }
  state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
  state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 1
  state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 1
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const improvement = getChoiceOptions(response)?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(expectWait(response).interaction.playerIndex, improvement.value)
  return response
}

const playLasso = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(expectWait(response).interaction.playerIndex, card.value)
  return response
}

const waitOptions = (response: SessionResponse): ActionChoiceOption[] => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return []
  expect(response.interaction.request.kind).toBe('choice')
  return getChoiceOptions(response) ?? []
}

const acceptLasso = (session: GameSession, response: SessionResponse) => {
  const accept = waitOptions(response).find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(expectWait(response).interaction.playerIndex, accept!.value)
}

const placedSpaces = (response: SessionResponse) => response.state.actionSpaces
  .filter((space) => space.takenBy.some((worker) => worker.playerId === 'p1'))
  .map((space) => space.id)
  .sort()

const accommodateSheep = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return response
  expect(response.state.players[0]!.resources.sheep).toBe(1)
  const pasture = response.interaction.request.zones.find(zone => zone.id === 'p1')
  expect(pasture?.capacity).toBeGreaterThanOrEqual(1)
  const settled = session.resolveChoice(0, 'confirm', {
    zones: [{ id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 }],
  })
  expect(settled.ok, settled.error).toBe(true)
  expect(settled.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 1 })
  return settled
}

describe('B024 Lasso parity', () => {
  it('B024 S1: paying one reed plays Lasso', () => {
    const response = playLasso(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it('B024 S2: without reed Lasso remains unavailable', () => {
    const response = setup({ played: false, reed: 0 }).takeAction(0, 'major-improvement')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('B024 S3: after a non-market placement Lasso restricts the second person to animal markets', () => {
    const session = setup()
    let response = session.takeAction(0, 'forest')

    response = acceptLasso(session, response)
    expect(waitOptions(response).map((option) => option.value)).toEqual(MARKET_SPACES)
    response = session.resolveChoice(0, 'sheep-market')
    response = accommodateSheep(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(placedSpaces(response)).toEqual(['forest', 'sheep-market'])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
      ? getChoiceOptions(response)?.map((option) => option.value)
      : []).not.toContain('__skip__')
  })

  it('B024 S4: after an animal-market placement Lasso allows any legal second space', () => {
    const session = setup()
    let response = session.takeAction(0, 'sheep-market')
    response = accommodateSheep(session, response)

    response = acceptLasso(session, response)
    const options = waitOptions(response).map((option) => option.value)
    expect(options).toContain('forest')
    response = session.resolveChoice(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(placedSpaces(response)).toEqual(['forest', 'sheep-market'])
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })

  it('B024 S5: declining Lasso keeps only the first placement', () => {
    const session = setup()
    const offered = session.takeAction(0, 'forest')

    const response = session.resolveChoice(expectWait(offered).interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(placedSpaces(response)).toEqual(['forest'])
  })

  it('B024 S6: a non-market placement offers no Lasso action when every animal market is occupied', () => {
    const session = setup()
    const state = session.getState().state
    MARKET_SPACES.forEach((spaceId, index) => {
      state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [
        { playerId: 'p2', workerId: state.players[1]!.workers[index]!.id },
      ]
    })
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(placedSpaces(response)).toEqual(['forest'])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
      ? getChoiceOptions(response)?.map((option) => option.value)
      : []).not.toContain('__skip__')
  })
})
describe("B024 command boundaries", () => {
  const L = 'B024_Lasso'
  function setup(card: typeof L, configure: (s: GameState) => void = () => { }, played = true, round = 14) {
    return sessionEvidence.track(createWorkSession({ seed: 8424, options: { playerCount: 2 }, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, food: 20 })
        }
        const p = state.players[0]!
        if (played)
          p.minorPlayed.push(card)
        else
          p.minorHand = [card]
        {
          setActiveWorkerCount(p, 3)
          p.rooms = 3
          p.roomTiles.push({ row: 0, col: 0 })
          for (const id of ['sheep-market', 'pig-market', 'cattle-market']) {
            const s = state.actionSpaces.find(x => x.id === id)
            assert.ok(s)
            Object.assign(s.resources, { sheep: 0, boar: 0, cattle: 0 }, id === 'sheep-market' ? { sheep: 1 } : id === 'pig-market' ? { boar: 1 } : { cattle: 1 })
          }
          state.actionSpaces.find(x => x.id === 'forest')!.resources.wood = 3
        }
        configure(state)
      } }))
  }
  function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction; }
  function options(r: SessionResponse) { const i = wait(r); assert.ok(i.request.kind === 'choice'); return i.request.options; }
  function place(s: GameSession, actor: number, id: string) { const r = s.takeAction(actor, id); assert.equal(r.ok, true, r.error); return r; }
  function choose(s: GameSession, r: SessionResponse) { const enabled = options(r).filter(o => o.value !== '__skip__' && !o.disabled); assert.equal(enabled.length, 1, JSON.stringify(r.interaction)); const op = enabled[0]!; const i = wait(r); const next = s.resolveChoice(i.playerIndex, op.value); assert.equal(next.ok, true, next.error); return next; }
  function confirm(s: GameSession, r: SessionResponse) {
    const i = wait(r)
    if (i.request.kind === 'confirm-player-switch') {
      const n = s.resolveChoice(i.request.fromPlayerIndex, 'confirm')
      assert.equal(n.ok, true, n.error)
      return n
    }
    assert.ok(i.request.kind === 'confirm-next-player')
    return confirmNext(s, r)
  }
  function buy(s: GameSession, id: string) {
    let r = place(s, 0, 'meeting-place')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const b = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-') && !o.disabled)
      if (b) {
        r = s.resolveChoice(0, b.value)
        assert.equal(r.ok, true, r.error)
      }
    }
    if (!r.state.players[0]!.minorPlayed.includes(id)) {
      assert.ok(options(r).some(o => o.value === id && !o.disabled))
      r = s.resolveChoice(0, id)
      assert.equal(r.ok, true, r.error)
    }
    assert.ok(r.state.players[0]!.minorPlayed.includes(id))
    return r
  }
  function placed(r: SessionResponse, actor = 0) { const id = r.state.players[actor]!.id; return r.state.actionSpaces.flatMap(s => s.takenBy.filter(w => w.playerId === id).map(() => s.id)).sort(); }
  function settleLassoAnimals(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
      r = s.resolveChoice(expectWait(r).interaction.playerIndex, 'confirm', { zones: r.interaction.request.zones })
      assert.equal(r.ok, true, r.error)
    }
    return r
  }
  function lassoPlace(s: GameSession, r: SessionResponse, id: string) { r = choose(s, settleLassoAnimals(s, r)); assert.ok(options(r).some(o => o.value === id && !o.disabled)); r = s.resolveChoice(0, id); assert.equal(r.ok, true, r.error); return settleLassoAnimals(s, r); }
  it("reed shortage excludes enabled card and rejects a forged choice while legal payment plays Lasso", () => {
    const bad = setup(L, () => { }, false)
    let r = place(bad, 0, 'meeting-place')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const b = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-') && !o.disabled)
      if (b)
        r = bad.resolveChoice(0, b.value)
    }
    assert.equal(r.state.players[0]!.minorPlayed.includes(L), false)
    assert.equal(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value === L && !o.disabled), false)
    assertRejectedUnchanged(bad, () => bad.resolveChoice(0, L))
    const good = setup(L, s => { s.players[0]!.resources.reed = 1; }, false)
    const played = buy(good, L)
    assert.equal(played.state.players[0]!.resources.reed, 0)
    assert.equal(played.state.players[0]!.minorPlayed.includes(L), true)
  })
  it("second person must use a free animal market and cannot create an immediate third placement", () => {
    const s = setup(L, state => { const p = state.players[1]!; state.actionSpaces.find(x => x.id === 'pig-market')!.takenBy = [{ playerId: p.id, workerId: p.workers.find(w => w.isActive)!.id }]; })
    let r = place(s, 0, 'forest')
    r = choose(s, r)
    assert.deepEqual(options(r).map(o => o.value), ['sheep-market', 'cattle-market'])
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'clay-pit'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pig-market'))
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'sheep-market'))
    r = s.resolveChoice(0, 'sheep-market')
    assert.equal(r.ok, true, r.error)
    r = settleLassoAnimals(s, r)
    assert.deepEqual(placed(r), ['forest', 'sheep-market'])
    assert.equal(workersAvailable(r.state, r.state.players[0]!), 1)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    assertRejectedUnchanged(s, () => s.takeAction(0, 'cattle-market'))
    r = confirm(s, r)
    assert.equal(r.state.currentPlayerIndex, 1)
    r = place(s, 1, 'grain-seeds')
    assert.deepEqual(placed(r, 1), ['grain-seeds', 'pig-market'])
  })
  it("market first permits a legal nonmarket while decline and the last worker grant no second person", () => {
    const first = setup(L)
    let r = lassoPlace(first, place(first, 0, 'sheep-market'), 'forest')
    assert.deepEqual(placed(r), ['forest', 'sheep-market'])
    assert.equal(r.state.players[0]!.resources.wood, 3)
    const declined = setup(L)
    r = place(declined, 0, 'forest')
    assert.equal(wait(r).sourceCard, L)
    r = declined.resolveChoice(0, '__skip__')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(placed(r), ['forest'])
    assert.equal(workersAvailable(r.state, r.state.players[0]!), 2)
    const last = setup(L, state => setWorkersAtHome(state, state.players[0]!, 1))
    r = settleLassoAnimals(last, place(last, 0, 'sheep-market'))
    assert.equal(workersAvailable(r.state, r.state.players[0]!), 0)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })
  it("all three occupied markets suppress Lasso in the specifically accepted PHP empty-placement case", () => {
    const s = setup(L, state => {
      const p = state.players[1]!
      setActiveWorkerCount(p, 4)
      p.rooms = 4
      p.roomTiles.push({ row: 0, col: 0 }, { row: 0, col: 1 })
      const ws = p.workers.filter(w => w.isActive)
      for (const [i, id] of ['sheep-market', 'pig-market', 'cattle-market'].entries())
        state.actionSpaces.find(x => x.id === id)!.takenBy = [{ playerId: p.id, workerId: ws[i]!.id }]
    })
    const r = place(s, 0, 'forest')
    assert.deepEqual(placed(r), ['forest'])
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })
  it("undo of the actual two-person sequence restores workers goods and a replayable Lasso choice", () => {
    const s = setup(L)
    let r = lassoPlace(s, place(s, 0, 'forest'), 'sheep-market')
    assert.deepEqual(placed(r), ['forest', 'sheep-market'])
    const undone = s.undoAction()
    assert.equal(undone.ok, true, undone.error)
    assert.deepEqual(placed(undone), [])
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.equal(workersAvailable(undone.state, undone.state.players[0]!), 3)
    r = lassoPlace(s, place(s, 0, 'forest'), 'cattle-market')
    assert.deepEqual(placed(r), ['cattle-market', 'forest'])
  })
  it("a real one-sheep market supply is collected once before a legal second placement", () => {
    const s = setup(L, state => { state.actionSpaces.find(x => x.id === 'sheep-market')!.resources.sheep = 1; })
    let r = place(s, 0, 'sheep-market')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
      const i = r.interaction
      assert.ok(i.request.kind === 'animal-reorg')
      const illegal = i.request.zones.map<InteractionAnimalReorgZone>(z => z.zoneType === 'house' ? { ...z, animalType: 'sheep', animalCount: 2 } : z)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: illegal }))
      r = s.resolveChoice(0, 'confirm', { zones: i.request.zones })
      assert.equal(r.ok, true, r.error)
    }
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    r = lassoPlace(s, r, 'forest')
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    assert.equal(r.state.players[0]!.resources.wood, 3)
    assert.deepEqual(placed(r), ['forest', 'sheep-market'])
    assert.equal(workersAvailable(r.state, r.state.players[0]!), 1)
    assert.ok(r.scores)
    assert.equal(r.scores[0]!.categories.find(c => c.key === 'sheeps')!.total, 1)
  })
})
