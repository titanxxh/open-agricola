import { noopEventSink } from '../../shared/events/noop'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D127_HardworkingMan'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'D127_HardworkingMan'

describe('D127_HardworkingMan session', () => {
  /**
   * Setup: 2-player game; owner = p0.
   * onBuy registers the player action space. Owner has fewer rooms than the
   * other player so canBeExecutedByPlayer returns true.
   */
  const setup = () => {
    const session = evidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'

    const owner = state.players[0]!
    const opp = state.players[1]!
    owner.rooms = 2
    opp.rooms = 3 // strictly greater so D127 condition satisfied
    setActiveWorkerCount(owner, 1)
    setActiveWorkerCount(opp, 1)
    setWorkersAtHome(state, owner, 1)
    setWorkersAtHome(state, opp, 0)
    // Plenty of food to "buy" things later if needed; D127 itself has no cost.
    owner.resources = {
      ...owner.resources,
      food: 5,
      wood: 5,
      clay: 5,
      stone: 5,
      reed: 5,
    }

    owner.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state
    updated.currentPlayerIndex = 0
    setWorkersAtHome(updated, updated.players[0]!, 1)
    session.loadState(updated)
    return session
  }

  it('onBuy registers a player action space', () => {
    const session = setup()
    const state = session.getState().state
    expect(state.actionSpaces.some((s) => s.id === CARD_ID)).toBe(true)
  })

  it('canBeExecutedByPlayer: only owner satisfies when other has more rooms', () => {
    const session = setup()
    const state = session.getState().state
    const space = state.actionSpaces.find((s) => s.id === CARD_ID)!
    const owner = state.players[0]!
    const opp = state.players[1]!
    expect(session.withCtx(() => space.canBeExecutedByPlayer!(state, owner))).toBe(true)
    expect(session.withCtx(() => space.canBeExecutedByPlayer!(state, opp))).toBe(false)
  })

  it('canBeExecutedByPlayer: false if any other player has equal or fewer rooms', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    const opp = state.players[1]!
    opp.rooms = 2 // tie
    session.loadState(state)
    const refreshed = session.getState().state
    const space = refreshed.actionSpaces.find((s) => s.id === CARD_ID)!
    expect(session.withCtx(() => space.canBeExecutedByPlayer!(refreshed, refreshed.players[0]!))).toBe(false)
    expect(owner.rooms).toBe(2)
  })

  it('execute returns an or-flow with three children (all three executable)', () => {
    const session = setup()
    const state = session.getState().state
    const space = state.actionSpaces.find((s) => s.id === CARD_ID)!
    const owner = state.players[0]!
    const result = session.withCtx(() => space.execute({ state, player: owner, space, actionHooks: session.actionHooks, eventSink: noopEventSink }))
    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.flow.type).toBe('or')
    if (result.flow.type !== 'or') return
    const ids = result.flow.children.map(child => {
      assert.ok(child.type === 'leaf')
      return child.actionId
    })
    expect(ids).toEqual(['day-laborer', 'construct', 'improvement'])
  })

  it('only day-laborer leaf: gain 2 food then __done__ resolves OR', () => {
    const session = setup()
    let state = session.getState().state
    const owner = state.players[0]!
    const beforeFood = owner.resources.food

    let resp = session.takeAction(0, CARD_ID)
    expect(resp.ok).toBe(true)
    // OR pending choice should be present
    expect(resp.interaction.stateId).toBe('wait')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected OR choice')
    const dayLaborerOption = getChoiceOptions(resp)?.find((o) =>
      typeof o.labelKey === 'string' && o.labelKey.includes('day-laborer'),
    ) ?? getChoiceOptions(resp)[0]
    resp = session.resolveChoice(0, dayLaborerOption!.value)
    expect(resp.ok).toBe(true)

    // After day-laborer leaf executed, OR re-prompts (still has choice for next branch / __done__)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(resp)?.some((o) => o.value === '__done__')).toBe(true)

    resp = session.resolveChoice(0, '__done__')
    expect(resp.ok).toBe(true)

    state = resp.state
    const finalOwner = state.players[0]!
    expect(finalOwner.resources.food).toBe(beforeFood + 2)
  })
})

describe('D127 rule boundaries', () => {

  const HARDWORKER = 'D127_HardworkingMan'

  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }

  function wait(r: SessionResponse) { ok(r); assert(r.interaction.stateId === 'wait'); return r.interaction }

  function options(r: SessionResponse) { const request = wait(r).request; assert(request.kind === 'choice'); return request.options }

  function branch(s: GameSession, r: SessionResponse, action: string) {
    const choice = options(r).find(o => o.labelKey === `actions.${action}.name`)
    assert(choice, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(0, choice.value))
  }

  function hardworking(configure: (state: GameState) => void = () => { }) {
    return evidence.track(createWorkSession({
      seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = 4
        for (const player of state.players)
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
        const owner = state.players[0]!
        owner.occupationPlayed = [HARDWORKER]
        for (const opponent of state.players.slice(1)) {
          opponent.rooms = 3
          opponent.roomTiles.push({ row: 1, col: 1 })
        }
        Object.assign(owner.resources, { wood: 5, reed: 2, clay: 2, food: 2 })
        owner.minorHand = ['A002_ShiftingCultivation']
        configure(state)
        state.actionSpaces.push(...createPlayerActionSpaces(state))
      }
    }))
  }

  it("Major Improvement must not offer or allow a minor improvement", () => {
    const s = hardworking()
    const r = branch(s, ok(s.takeAction(0, HARDWORKER)), 'improvement')
    const minorOffered = options(r).some(o => o.value === 'A002_ShiftingCultivation')
    assert.deepEqual({ minorOffered }, { minorOffered: false })
    const major = options(s.getState()).find(o => o.value === 'Major_Fireplace1')
    assert(major)
    const final = ok(s.resolveChoice(0, major.value))
    assert(final.state.players[0]!.improvements.includes('Major_Fireplace1'))
    assert.equal(final.state.players[0]!.resources.clay, 0)
  })

  it("Major Improvement must reject an actual minor purchase", () => {
    const s = hardworking()
    branch(s, ok(s.takeAction(0, HARDWORKER)), 'improvement')
    const r = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'A002_ShiftingCultivation'))
    assert.deepEqual({ accepted: r.ok, passedMinor: r.state.players[1]!.minorHand.includes('A002_ShiftingCultivation'), food: r.state.players[0]!.resources.food }, { accepted: false, passedMinor: false, food: 2 })
    const major = options(s.getState()).find(o => o.value === 'Major_Fireplace1')
    assert(major)
    const retry = ok(s.resolveChoice(0, major.value))
    assert(retry.state.players[0]!.improvements.includes('Major_Fireplace1'))
    assert(retry.state.players[0]!.minorHand.includes('A002_ShiftingCultivation'))
    assert.equal(retry.state.players[0]!.resources.clay, 0)
    assert.equal(retry.state.players[0]!.resources.food, 2)
  })

  it("ties and a nonowner with fewer rooms cannot use the private space", () => {
    const tied = hardworking(state => { state.players[2]!.rooms = 2; state.players[2]!.roomTiles.pop() })
    assertRejectedUnchanged(tied, () => tied.takeAction(0, HARDWORKER))
    const other = hardworking(state => {
      state.players[0]!.rooms = 3
      state.players[0]!.roomTiles.push({ row: 1, col: 1 })
      state.players[1]!.rooms = 2
      state.players[1]!.roomTiles.pop()
    })
    confirmNext(other, ok(other.takeAction(0, 'grain-seeds')))
    assert.equal(other.state.currentPlayerIndex, 1)
    assertRejectedUnchanged(other, () => other.takeAction(1, HARDWORKER))
    ok(other.takeAction(1, 'forest'))
  })

  it("Day Laborer cannot be repeated and undo restores the placement and food", () => {
    const s = hardworking()
    const before = undoRuleSnapshot(s.getState())
    const entered = ok(s.takeAction(0, HARDWORKER))
    const day = options(entered).find(o => o.labelKey === 'actions.day-laborer.name')
    assert(day)
    const r = ok(s.resolveChoice(0, day.value))
    assert.equal(r.state.players[0]!.resources.food, 4)
    assert(!options(r).some(o => o.value === day.value))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, day.value))
    ok(s.resolveChoice(0, '__done__'))
    assertUndoRestored(before, s.undoAction())
    const retry = branch(s, ok(s.takeAction(0, HARDWORKER)), 'day-laborer')
    assert.equal(retry.state.players[0]!.resources.food, 4)
  })

  it("building to a room tie still completes all three accepted subactions exactly once", () => {
    const s = hardworking()
    let r = branch(s, ok(s.takeAction(0, HARDWORKER)), 'construct')
    assert.equal(wait(r).request.kind, 'farm-select')
    r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }], stables: [] }))
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    r = branch(s, r, 'improvement')
    const major = options(r).find(o => o.value === 'Major_Fireplace1')
    assert(major)
    r = ok(s.resolveChoice(0, major.value))
    r = branch(s, r, 'day-laborer')
    assert.equal(r.state.players[0]!.resources.food, 4)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert(r.state.players[0]!.improvements.includes('Major_Fireplace1'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, major.value))
  })
})
