import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A121_ClayPuncher'
import { type ActionChoiceOption, type GameState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A121_ClayPuncher session', () => {
  const setup = (playerCount: number = 2) => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A121_ClayPuncher')
    setWorkersAtHome(state, player, 2)
    player.resources.clay = 0
    player.resources.food = 5

    for (const otherPlayer of state.players.slice(1)) {
      setWorkersAtHome(state, otherPlayer, 2)
    }

    // Ensure clay-pit has accumulated resources
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2

    session.loadState(state)
    session.devPlayCard(0, 'A121_ClayPuncher')
    return session
  }

  it('onBuy grants 1 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'A121_ClayPuncher', 'onBuy'))
    assert.ok(flow?.type === 'leaf')
    expect(flow.actionId).toBe('gain')
    expect(flow.params).toEqual({ clay: 1 })
  })

  it('gains 1 extra clay when using clay-pit', () => {
    const session = setup()
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 2 accumulated clay + 1 bonus from ClayPuncher = 3
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 2 + 1)
  })

  it('gains 1 extra clay when using lessons', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Need an occupation in hand for lessons to be usable (must be in catalog)
    player.occupationHand = ['A093_BedMaker', 'A110_Roughcaster']
    const clayBefore = player.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // lessons action prompts for occupation choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      const option = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value === 'A093_BedMaker')
      expect(option).toBeDefined()
      resp = session.resolveChoice(0, option!.value)
    }

    // Walk through player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Should have gained 1 clay from ClayPuncher trigger on lessons
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('gains 1 extra clay when using lessons-3', () => {
    const session = setup(3)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationHand = ['A093_BedMaker', 'A110_Roughcaster']
    const clayBefore = player.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons-3')
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      const option = getChoiceOptions(resp)?.find((o: ActionChoiceOption) => o.value === 'A093_BedMaker')
      expect(option).toBeDefined()
      resp = session.resolveChoice(0, option!.value)
    }

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('does not trigger on non-matching spaces', () => {
    const session = setup()
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})

describe("A121 command boundaries", () => {
  const PUNCH = 'A121_ClayPuncher'
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
        state.players[0]!.occupationPlayed = played ? [PUNCH] : []
        state.players[0]!.occupationHand = played ? ['A110_Roughcaster'] : [PUNCH, 'A110_Roughcaster']
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
  it("real first Lessons purchase grants onBuy and completed Lessons clay separately", () => {
    const s = setup(undefined, false)
    const pending = turn(s, 0, 'lessons')
    assert.equal(pending.state.players[0]!.resources.clay, 0)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    const r = ok(s.resolveChoice(0, PUNCH))
    assert.equal(r.state.players[0]!.resources.clay, 2)
    assert.equal(r.state.players[0]!.resources.food, 40)
    sessionEvidence.record('A121-N1', { pending, r })
  })
  it("Clay Pit plus one bonus and later Lessons plus one bonus", () => {
    const s = setup()
    const clay = turn(s, 0, 'clay-pit')
    assert.equal(clay.state.players[0]!.resources.clay, 2)
    turn(s, 1, 'grain-seeds')
    let r = turn(s, 0, 'lessons')
    if (!r.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'))
      r = ok(s.resolveChoice(0, 'A110_Roughcaster'))
    assert.equal(r.state.players[0]!.resources.clay, 3)
    assert.equal(r.state.players[0]!.resources.food, 39)
    sessionEvidence.record('A121-N2', { clay, r })
  })
  it("unrelated hand and opponent use cannot grant owner clay", () => {
    const basic = turn(setup(), 0, 'day-laborer')
    assert.equal(basic.state.players[0]!.resources.clay, 0)
    const hand = turn(setup(undefined, false), 0, 'clay-pit')
    assert.equal(hand.state.players[0]!.resources.clay, 1)
    const s = setup()
    turn(s, 0, 'grain-seeds')
    const other = turn(s, 1, 'clay-pit')
    assert.equal(other.state.players[0]!.resources.clay, 0)
    assert.equal(other.state.players[1]!.resources.clay, 1)
    sessionEvidence.record('A121-N3', { basic, hand, other })
  })
  it("occupied source wrong actor and undo cannot duplicate clay bonus", () => {
    const s = setup()
    const first = turn(s, 0, 'clay-pit')
    assertRejectedUnchanged(s, () => s.takeAction(0, 'clay-pit'))
    const undone = ok(s.undoAction())
    assert.equal(undone.state.players[0]!.resources.clay, 0)
    assert.equal(undone.state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay, 1)
    const retry = turn(s, 0, 'clay-pit')
    assert.equal(retry.state.players[0]!.resources.clay, 2)
    sessionEvidence.record('A121-N4', { first, undone, retry })
  })
})
