import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A161_PatchCaretaker'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext , getChoiceOptions , undoRuleSnapshot , assertUndoRestored } from './_helpers/session-assertions'
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

const CARD_ID = 'A161_PatchCaretaker'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, actor = 0 }: { played?: boolean; actor?: number } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6161, options: { playerCount: 4 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
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
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  for (const [id, type] of [
    ['forest', 'wood'], ['grove', 'wood'], ['clay-pit', 'clay'], ['reed-bank', 'reed'],
    ['fishing', 'food'], ['traveling-players', 'food'],
  ] as const) {
    const space = state.actionSpaces.find((candidate) => candidate.id === id)
    if (!space) throw new Error(`missing ${id}`)
    space.resources[type] = 1
  }
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

const takeAndConfirm = (session: GameSession, actor: number, actionId: string): SessionResponse => {
  let response = session.takeAction(actor, actionId)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'confirm-next-player' },
  })
  if (response.interaction.stateId !== 'wait') return response
  response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
  return response
}

describe('A161 Patch Caretaker parity', () => {
  it('A161 S1: Patch Caretaker is played as the first occupation in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A161 S2: the owners second wood accumulation space in one work phase gains one vegetable', () => {
    const session = setup()
    takeAndConfirm(session, 0, 'forest')
    takeAndConfirm(session, 1, 'clay-pit')
    takeAndConfirm(session, 2, 'day-laborer')
    takeAndConfirm(session, 3, 'fishing')

    const response = session.takeAction(0, 'grove')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A161 S3: two owner accumulation spaces for different goods grant no vegetable', () => {
    const session = setup()
    takeAndConfirm(session, 0, 'forest')
    takeAndConfirm(session, 1, 'reed-bank')
    takeAndConfirm(session, 2, 'fishing')
    takeAndConfirm(session, 3, 'traveling-players')

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A161 S4: the owners first accumulation space grants no vegetable', () => {
    const response = setup().takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A161 S5: an opponents earlier wood accumulation does not count for the owner', () => {
    const session = setup({ actor: 1 })
    takeAndConfirm(session, 1, 'forest')
    takeAndConfirm(session, 2, 'clay-pit')
    takeAndConfirm(session, 3, 'day-laborer')

    const response = session.takeAction(0, 'grove')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })
})

describe("A161 command boundaries", () => {
  const PATCH = 'A161_PatchCaretaker'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const players = 4
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [PATCH] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [PATCH, 'A110_Roughcaster']
        configure(state)
      } }))
    assert.equal(s.getState().state.players.length, players)
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
    const result = ok(s.takeAction(actor, space))
    assertTurnFinished(result, actor)
    return result
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
  function patch(first: string, second: string, played = true, empty = false) {
    const s = setup(state => {
      for (const a of state.actionSpaces)
        for (const key of ['wood', 'food'] as const)
          if (a.gainPerRound?.[key])
            a.resources[key] = 1
      if (empty) {
        const target = state.actionSpaces.find(a => a.id === second)!
        for (const key of ['wood', 'food'] as const)
          if (target.gainPerRound?.[key])
            target.resources[key] = 0
      }
    }, played)
    const start = turn(s, 0, first)
    assert.equal(start.state.players[0]!.resources.vegetable, 0)
    const fillers = first === 'fishing' ? ['grain-seeds', 'day-laborer', 'reed-bank'] : ['grain-seeds', 'day-laborer', 'fishing']
    fillers.forEach((space, i) => turn(s, i + 1, space))
    return { s, start, r: empty ? assertEmptyAccumulationRejected(s, 0, second) : turn(s, 0, second) }
  }
  it("second owner wood or food accumulation grants one vegetable only for nonempty entry", () => {
    for (const [first, second] of [['forest', 'grove'], ['fishing', 'traveling-players']] as const)
      for (const empty of [false, true]) {
        if (empty) {
          const blocked = setup(state => {
            const target = state.actionSpaces.find(a => a.id === first)!
            for (const key of ['wood', 'food'] as const)
              if (target.gainPerRound?.[key])
                target.resources[key] = 0
          })
          const rejected = assertEmptyAccumulationRejected(blocked, 0, first)
          assert.equal(rejected.state.players[0]!.resources.vegetable, 0)
          save(`A161-N1-${first}-empty-first`, rejected)
        }
        const { start, r } = patch(first, second, true, empty)
        assert.equal(r.state.players[0]!.resources.vegetable, empty ? 0 : 1)
        assert.equal(r.state.players[1]!.resources.vegetable, 0)
        save(`A161-N1-${first}-${empty}`, { start, r })
      }
  })
  it("different goods non accumulation earlier action and hand cannot grant vegetable", () => {
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const [first, second, played] of [['forest', 'clay-pit', true], ['grain-seeds', 'grove', true], ['forest', 'grove', false]] as const) {
      const s = setup(undefined, played)
      const initial = turn(s, 0, first)
      for (const [actor, space] of [[1, 'reed-bank'], [2, 'day-laborer'], [3, 'fishing']] as const)
        turn(s, actor, space)
      const r = turn(s, 0, second)
      assert.equal(r.state.players[0]!.resources.vegetable, 0)
      assertTurnFinished(r, 0)
      const owner = first === 'grain-seeds' ? { ...baseline, wood: 2, grain: 1 }
        : second === 'clay-pit' ? { ...baseline, wood: 3, clay: 1 } : { ...baseline, wood: 5 }
      for (const actual of [r, s.getState()])
        assert.deepEqual(actual.state.players.map(player => player.resources), [owner, { ...baseline, reed: 1 }, { ...baseline, food: 42 }, { ...baseline, food: 41 }])
      save(`A161-N2-${first}-${played}`, { initial, r })
    }
  })
  it("actual opponent earlier wood never counts for owners first wood action", () => {
    const s = setup()
    turn(s, 0, 'grain-seeds')
    const opponent = turn(s, 1, 'forest')
    turn(s, 2, 'day-laborer')
    turn(s, 3, 'fishing')
    const r = turn(s, 0, 'grove')
    assert.equal(r.state.players[0]!.resources.vegetable, 0)
    assertTurnFinished(r, 0)
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const actual of [r, s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, wood: 2, grain: 1 }, { ...baseline, wood: 3 }, { ...baseline, food: 42 }, { ...baseline, food: 41 }])
    save('A161-N3', { opponent, r })
  })
  it("whole second action undo restores vegetable and one retry grants only once", () => {
    const { s, r } = patch('forest', 'grove')
    const assertOutcome = (response: SessionResponse) => {
      for (const result of [response, s.getState()]) {
        const player = result.state.players[0]!
        assert.deepEqual(player.resources, { wood: 2, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 1, sheep: 0, boar: 0, cattle: 0, begging: 0 })
        assert.equal(result.state.actionSpaces.find(space => space.id === 'grove')!.resources.wood, 0)
      }
    }
    assertOutcome(r)
    assert.equal(r.state.players[0]!.resources.vegetable, 1)
    assert.equal(r.state.players[0]!.resources.wood, 2)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'grove'))
    const undone = undo(s)
    assert.equal(undone.state.players[0]!.resources.vegetable, 0)
    const retry = turn(s, 0, 'grove')
    assertOutcome(retry)
    assert.equal(retry.state.players[0]!.resources.vegetable, 1)
    const occupied = setup()
    turn(occupied, 0, 'forest')
    for (const [actor, space] of [[1, 'grove'], [2, 'clay-pit'], [3, 'reed-bank']] as const)
      turn(occupied, actor, space)
    const ready = confirmNext(occupied, occupied.getState())
    assert.equal(ready.interaction.stateId, 'idle')
    assert.equal(ready.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(occupied, () => occupied.takeAction(0, 'grove'))
    const legal = turn(occupied, 0, 'day-laborer')
    assert.equal(legal.state.players[0]!.resources.food, 42)
    assert.equal(legal.state.players[0]!.resources.vegetable, 0)
    save('A161-N4', { r, undone, retry, legal })
  })
  it("a previous work phase wood accumulation cannot reward the next work phase's first wood", () => {
    const s = setup(state => { state.round = 5 })
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    const firstPhase = ['forest', 'clay-pit', 'day-laborer', 'fishing', 'grain-seeds', 'reed-bank', 'hollow-4', 'traveling-players']
    let last = s.getState()
    for (const [n, space] of firstPhase.entries()) {
      last = turn(s, n % 4, space)
      for (const actual of [last, s.getState()]) {
        assert.equal(actual.state.round, 5)
        assert.equal(actual.state.players[0]!.resources.vegetable, 0)
      }
    }
    const next = confirmNext(s, last)
    for (const actual of [next, s.getState()]) {
      assert.equal(actual.interaction.stateId, 'idle', JSON.stringify(actual.interaction))
      assert.equal(actual.state.round, 6)
      assert.equal(actual.state.roundPhase, 'work')
      assert.equal(actual.state.currentPlayerIndex, 0)
      assert.deepEqual(actual.state.players.map(player => player.resources), [
        { ...baseline, wood: 3, grain: 1 }, { ...baseline, clay: 1, reed: 1 },
        { ...baseline, clay: 2, food: 42 }, { ...baseline, food: 42 },
      ])
    }
    const firstWood = turn(s, 0, 'forest')
    for (const actual of [firstWood, s.getState()]) {
      assertTurnFinished(actual, 0)
      assert.equal(actual.state.round, 6)
      assert.deepEqual(actual.state.players.map(player => player.resources), [
        { ...baseline, wood: 6, grain: 1 }, { ...baseline, clay: 1, reed: 1 },
        { ...baseline, clay: 2, food: 42 }, { ...baseline, food: 42 },
      ])
    }
    for (const [actor, space] of [[1, 'clay-pit'], [2, 'day-laborer'], [3, 'fishing']] as const)
      turn(s, actor, space)
    const secondWood = turn(s, 0, 'grove')
    for (const actual of [secondWood, s.getState()]) {
      assertTurnFinished(actual, 0)
      assert.equal(actual.state.round, 6)
      assert.deepEqual(actual.state.players.map(player => player.resources), [
        { ...baseline, wood: 10, grain: 1, vegetable: 1 }, { ...baseline, clay: 2, reed: 1 },
        { ...baseline, clay: 2, food: 44 }, { ...baseline, food: 43 },
      ])
    }
    save('A161-work-phase-reset', { next, firstWood, secondWood })
  })
})
