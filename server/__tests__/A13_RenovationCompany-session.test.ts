import { expectWait } from './_helpers/trigger-select'
import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { A013_RenovationCompany } from '../../shared/cards/A/A013_RenovationCompany'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
describe('A013_RenovationCompany prerequisite', () => {
  it('blocks when house is not wooden or rooms != 2', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(session.withCtx(() => meetsCardPrerequisites(player, A013_RenovationCompany, state.round, state))).toBe(false)
  })

  it('allows when in wooden house with exactly 2 rooms', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'wood'
    player.rooms = 2
    expect(session.withCtx(() => meetsCardPrerequisites(player, A013_RenovationCompany, state.round, state))).toBe(true)
  })
})

describe('A013 Renovation Company parity', () => {
  const CARD_ID = 'A013_RenovationCompany'

  const FILLER = '__test_placeholder__'

  const setup = ({
    houseType = 'wood', rooms = 2, wood = 4,
  }: {
    houseType?: 'wood' | 'clay' | 'stone'
    rooms?: number
    wood?: number
  } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6013, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      }
    })
    const player = state.players[0]!
    player.minorHand = [CARD_ID, FILLER]
    player.houseType = houseType
    player.rooms = rooms
    player.resources.wood = wood
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? getChoiceOptions(response) ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (options(response).some((option) => option.value === CARD_ID)) return response
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(expectWait(response).interaction.playerIndex, improvement.value)
    return response
  }

  const playCard = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(expectWait(response).interaction.playerIndex, card.value)
    return response
  }

  const acceptFreeRenovation = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, accept!.value)
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(expectWait(response).interaction.playerIndex, 'clay')
    }
    return response
  }

  it('A013 S1: paying four wood gains three clay and accepting the free renovation keeps that clay', () => {
    const session = setup()
    const response = acceptFreeRenovation(session, playCard(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 0, clay: 3, reed: 0 },
    })
  })

  it('A013 S2: declining the free renovation still gains three clay', () => {
    const session = setup()
    let response = playCard(session)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood',
      resources: { wood: 0, clay: 3 },
    })
  })

  it('A013 S3: a non-wooden two-room house keeps Renovation Company unavailable', () => {
    const response = enterMinor(setup({ houseType: 'clay' }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(4)
  })

  it('A013 S4: a three-room wooden house keeps Renovation Company unavailable', () => {
    const response = enterMinor(setup({ rooms: 3 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(4)
  })
})
describe("A013 command boundaries", () => {
  const A013 = 'A013_RenovationCompany'
  const pair = [{ row: 1, col: 1 }, { row: 2, col: 1 }]
  function setup({ card = A013, played = false, house = 'wood', rooms = 2, stableCount = 0, resources = {}, opponent = {} }: {
    card?: string
    played?: boolean
    house?: PlayerState['houseType']
    rooms?: number
    stableCount?: number
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 514, configure: state => {
        state.round = 14
        state.players.forEach(p => {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.cardStates = {}
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [card]
        p.minorPlayed = played ? [card] : []
        p.houseType = house
        p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...pair.slice(0, rooms - 2)]
        p.rooms = rooms
        p.stableTiles = Array.from({ length: stableCount }, (_, col) => ({ row: 0, col: col + 1 }))
        Object.assign(p.resources, resources)
        Object.assign(state.players[1]!.resources, opponent)
        const forest = state.actionSpaces.find(a => a.id === 'forest')!
        forest.resources.wood = 3
      } }))
    assert.equal(s.getState().state.players[0]!.rooms, rooms)
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? getChoiceOptions(r) : []; }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const o = opts(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(expectWait(r).interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function minor(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-') && !o.value.includes('skip')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-') && !o.value.includes('skip'))
    return r
  }
  function buy(s: GameSession, card: string) { const r = minor(s, card); return r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card); }
  function deniedCard(s: GameSession, card: string) {
    const r = minor(s, card)
    assert.equal(opts(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    assert.ok(s.getState().state.players[0]!.minorHand.includes(card))
  }
  function acceptReno(s: GameSession, r: SessionResponse) {
    r = choose(s, r, o => o.value !== '__skip__')
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionChooseRenovationTarget')
      r = ok(s.resolveChoice(0, 'clay'))
    return r
  }
  function facts(r: SessionResponse, actor = 0) { const p = r.state.players[actor]!; return { rooms: p.rooms, house: p.houseType, wood: p.resources.wood, clay: p.resources.clay, reed: p.resources.reed, stone: p.resources.stone, stables: p.stableTiles.length }; }
  function finish(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && opts(r).some(o => o.value === '__skip__'))
      return ok(s.resolveChoice(expectWait(r).interaction.playerIndex, '__skip__'))
    return r
  }
  it("insufficient four-wood fee rejects forged card and exact fee buys free clay renovation", () => {
    const bad = setup({ resources: { wood: 3 } })
    deniedCard(bad, A013)
    assert.equal(bad.getState().state.players[0]!.resources.wood, 3)
    const s = setup({ resources: { wood: 4 } })
    const r = acceptReno(s, buy(s, A013))
    assert.deepEqual(facts(r), { rooms: 2, house: 'clay', wood: 0, clay: 3, reed: 0, stone: 0, stables: 0 })
    assert.ok(r.state.players[0]!.minorPlayed.includes(A013))
    assert.equal(r.scores?.length, 2)
    assert.ok(r.state.log.length > 0)
  })
  it("clay stone and three-room houses reject forged purchase", () => {
    for (const spec of [{ house: 'clay', rooms: 2 }, { house: 'stone', rooms: 2 }, { house: 'wood', rooms: 3 }] satisfies {
      house: PlayerState['houseType']
      rooms: number
    }[]) {
      const s = setup({ ...spec, resources: { wood: 4 } })
      deniedCard(s, A013)
      assert.equal(s.getState().state.players[0]!.resources.clay, 0)
      assert.equal(s.getState().state.players[0]!.resources.wood, 4)
    }
  })
  it("free renovation cannot jump to stone or replay after completion", () => {
    const s = setup({ resources: { wood: 4 } })
    const r = buy(s, A013)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'stone'))
    const done = acceptReno(s, r)
    assert.equal(done.state.players[0]!.houseType, 'clay')
    assert.equal(done.state.players[0]!.resources.clay, 3)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'clay'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, A013))
    turn(s, 1, 'grain-seeds')
    assert.equal(s.getState().state.players[0]!.houseType, 'clay')
  })
  it("declining loses free opportunity and later ordinary renovation pays full cost", () => {
    const s = setup({ resources: { wood: 4, reed: 1 } })
    buy(s, A013)
    ok(s.resolveChoice(0, '__skip__'))
    assert.equal(s.getState().state.players[0]!.houseType, 'wood')
    turn(s, 1, 'grain-seeds')
    const r = finish(s, turn(s, 0, 'house-redevelopment'))
    assert.equal(r.state.players[0]!.houseType, 'clay')
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(r.state.players[0]!.resources.reed, 0)
  })
  it("undo restores fee clay house and card before legal replay", () => {
    const s = setup({ resources: { wood: 4 } })
    const before = undoRuleSnapshot(s.getState())
    buy(s, A013)
    assertUndoRestored(before, s.undoAction())
    acceptReno(s, buy(s, A013))
    assertUndoRestored(before, s.undoAction())
    const r = acceptReno(s, buy(s, A013))
    assert.equal(r.state.players[0]!.resources.clay, 3)
    assert.equal(r.state.players[0]!.houseType, 'clay')
  })
})
