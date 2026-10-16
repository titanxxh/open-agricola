import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A116_WoodCutter'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A116_WoodCutter session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 4 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A116_WoodCutter')
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0

    setWorkersAtHome(state, state.players[1]!, 2)
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

    // Ensure wood spaces have accumulated resources
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3
    const copse = state.actionSpaces.find((s) => s.id === 'copse')
    if (copse) copse.resources.wood = 2

    session.loadState(state)
    session.devPlayCard(0, 'A116_WoodCutter')
    return session
  }

  it('gains 1 extra wood when using forest', () => {
    const session = setup()

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 3 accumulated wood + 1 bonus from WoodCutter = 4
    expect(after.players[0]!.resources.wood).toBe(4)
    const actionDetail = after.log.find((entry) => entry.key === 'log.actionDetail')!
    expect(actionDetail.params?.detailParts).toMatchObject({ gains: { wood: 3 } })
  })

  it('gains 1 extra wood when using copse', () => {
    const session = setup()

    const resp = session.takeAction(0, 'copse')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 2 accumulated wood + 1 bonus from WoodCutter = 3
    expect(after.players[0]!.resources.wood).toBe(3)
  })

  it.each(['copse-56', 'grove-56'])('gains 1 extra wood when using %s', (spaceId) => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 5 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A116_WoodCutter')
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0

    const space = state.actionSpaces.find((s) => s.id === spaceId)
    expect(space).toBeDefined()
    space!.resources.wood = 2

    session.loadState(state)
    session.devPlayCard(0, 'A116_WoodCutter')

    const resp = session.takeAction(0, spaceId)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(3)
  })

  it('does not trigger on non-wood spaces', () => {
    const session = setup()

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.wood).toBe(0)
  })

  it('does not trigger for opponent using wood space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner should not get bonus wood — scope is 'player' only
    expect(after.players[0]!.resources.wood).toBe(0)
    // Opponent gets 3 accumulated wood but no bonus
    expect(after.players[1]!.resources.wood).toBe(3)
  })
})

describe("A116 command boundaries", () => {
  const CUTTER = 'A116_WoodCutter'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true, round = 14) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [CUTTER] : []
        state.players[0]!.occupationHand = played ? ['A110_Roughcaster'] : [CUTTER, 'A110_Roughcaster']
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
  it("empty Forest rejects while three and six wood piles add exactly one owner wood", () => {
    for (const [amount, expectedWood] of [[0, 0], [3, 4], [6, 7]] satisfies Array<[
      number,
      number
    ]>) {
      const s = setup(state => state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = amount)
      const r = amount === 0 ? assertEmptyAccumulationRejected(s, 0, 'forest') : turn(s, 0, 'forest')
      assert.equal(r.state.players[0]!.resources.wood, expectedWood)
      assert.equal(r.state.actionSpaces.find(a => a.id === 'forest')!.resources.wood, 0)
      if (amount === 0) {
        assert.equal(r.interaction.stateId, 'idle')
      } else {
        assert.ok(r.interaction.stateId === 'wait')
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
        assert.equal(r.interaction.playerIndex, 0)
      }
      assert.equal(r.state.currentPlayerIndex, 0)
      sessionEvidence.record(`A116-N1-${amount}`, r)
    }
  })
  it("nonwood accumulation DayLaborer hand and opponent give no additional wood", () => {
    for (const [space, played, expectedWood] of [['clay-pit', true, 0], ['day-laborer', true, 0], ['forest', false, 3]] satisfies Array<[
      string,
      boolean,
      number
    ]>) {
      const s = setup(undefined, played)
      const r = turn(s, 0, space)
      assert.equal(r.state.players[0]!.resources.wood, expectedWood)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      sessionEvidence.record(`A116-N2-${space}`, r)
    }
    const s = setup()
    turn(s, 0, 'grain-seeds')
    const r = turn(s, 1, 'forest')
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[1]!.resources.wood, 3)
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    assert.equal(r.interaction.playerIndex, 1)
    assert.equal(r.state.currentPlayerIndex, 1)
    sessionEvidence.record('A116-N2-opponent', r)
  })
  it("occupied source and invalid actor cannot gain and undo restores source once", () => {
    const occupied = setup()
    const occupiedTurn = confirmNext(occupied, turn(occupied, 0, 'forest'))
    assert.equal(occupiedTurn.interaction.stateId, 'idle')
    assert.equal(occupiedTurn.state.currentPlayerIndex, 1)
    assertRejectedUnchanged(occupied, () => occupied.takeAction(1, 'forest'))
    const legalOtherSpace = turn(occupied, 1, 'grain-seeds')
    assert.ok(legalOtherSpace.interaction.stateId === 'wait')
    assert.deepEqual(legalOtherSpace.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    assert.equal(legalOtherSpace.interaction.playerIndex, 1)
    assert.equal(legalOtherSpace.state.currentPlayerIndex, 1)
    assert.equal(legalOtherSpace.state.players[1]!.resources.grain, 1)
    const s = setup()
    const before = s.getState()
    const beforeRules = undoRuleSnapshot(before)
    const first = turn(s, 0, 'forest')
    assertRejectedUnchanged(s, () => s.takeAction(0, 'forest'))
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    assert.deepEqual(undone.interaction, before.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.equal(undone.state.actionSpaces.find(a => a.id === 'forest')!.resources.wood, 3)
    assertRejectedUnchanged(s, () => s.takeAction(1, 'forest'))
    const retry = turn(s, 0, 'forest')
    assert.equal(retry.state.players[0]!.resources.wood, 4)
    for (const response of [first, retry]) {
      assert.ok(response.interaction.stateId === 'wait')
      assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(response.interaction.playerIndex, 0)
      assert.equal(response.state.currentPlayerIndex, 0)
    }
    sessionEvidence.record('A116-N3', { first, undone, retry })
  })
})
