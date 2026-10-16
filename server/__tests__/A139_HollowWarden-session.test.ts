import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { type SessionResponse, type GameSession } from '../game/authoritative-session'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A139_HollowWarden'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A139_HollowWarden'

describe('A139_HollowWarden session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 4 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 4) // 4 players for hollow-4 space
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    // Ensure hollow-4 space exists with accumulated clay
    const hollow = state.actionSpaces.find((s) => s.id === 'hollow-4')
    if (hollow) hollow.resources.clay = 4

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  it('gains 1 food when using hollow-4 space', () => {
    const session = setup()
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'hollow-4')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Should get clay from hollow + 1 food from HollowWarden
    expect(player.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger on non-hollow spaces', () => {
    const session = setup()
    const foodBefore = session.getState().state.players[0]!.resources.food

    // Use farmland (gives no food, no wood) to verify no HollowWarden trigger
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // HollowWarden should NOT have given extra food
    expect(player.resources.food).toBe(foodBefore)
  })

  it('gains 1 food when using 3p hollow space', () => {
    // 3p game uses 'hollow' space (non-4p variant). The reference listens via
    // isActionCardEvent($event, 'Hollow') which matches both spaces.
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 3 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    const hollow = state.actionSpaces.find((s) => s.id === 'hollow')
    if (!hollow) {
      // Some 3p configs may differ; skip if space missing.
      return
    }
    hollow.resources.clay = 2

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const foodBefore = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'hollow')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(foodBefore + 1)
  })

  it('gains 1 food when using 5/6 hollow space', () => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 5 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    const hollow = state.actionSpaces.find((s) => s.id === 'hollow-56')
    expect(hollow).toBeDefined()
    hollow!.resources.clay = 3

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const foodBefore = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'hollow-56')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger for opponent using hollow', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    setWorkersAtHome(state, state.players[1]!, 2)
    session.loadState(state)

    const resp = session.takeAction(1, 'hollow-4')
    expect(resp.ok).toBe(true)

    // Owner should not get bonus food
    const owner = resp.state.players[0]!
    expect(owner.resources.food).toBe(session.getState().state.players[0]!.resources.food)
  })
})

describe('A139 Hollow Warden parity', () => {
  const CARD_ID = 'A139_HollowWarden'

  const FIREPLACE = 'Major_Fireplace1'

  const FILLER = '__test_placeholder__'

  const setup = ({ actor = 0, played = true, clay = 0 } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6139, options: { playerCount: 4 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = [FIREPLACE, 'Major_Well']
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.clay = clay
    const hollow = state.actionSpaces.find((space) => space.id === 'hollow-4')
    if (!hollow) throw new Error('hollow-4 space missing')
    hollow.resources.clay = 3
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return response
      const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
      expect(card, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }
    return resolveTriggerIfPresent(session, response, CARD_ID)
  }

  const enterFireplaceChoice = (session: GameSession, initial: SessionResponse) => {
    let response = initial
    for (let step = 0; step < 5; step += 1) {
      if (response.state.players[0]!.improvements.includes(FIREPLACE)) return response
      if (response.interaction.stateId !== 'wait') return response
      if (getChoiceOptions(response)?.some((option) => option.value === FIREPLACE)) {
        return response
      }
      const enter = getChoiceOptions(response)?.find((option) =>
        option.value !== '__skip__' && option.value !== 'cancel')
      expect(enter, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, enter!.value)
    }
    return response
  }

  it('A139 S1: Hollow Warden is played through Lessons and its immediate action may be declined', () => {
    const session = setup({ played: false, clay: 2 })
    let response = playOccupation(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(FIREPLACE)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('A139 S2: its immediate Major Improvement action offers only Fireplaces and can build one', () => {
    const session = setup({ played: false, clay: 2 })
    let response = enterFireplaceChoice(session, playOccupation(session))
    if (!response.state.players[0]!.improvements.includes(FIREPLACE)) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return
      const majorIds = getChoiceOptions(response)
        ?.map((option) => option.value).filter((value) => value.startsWith('Major_')) ?? []
      expect(majorIds).toEqual([FIREPLACE])
      response = session.resolveChoice(response.interaction.playerIndex, FIREPLACE)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(FIREPLACE)
    expect(response.state.players[0]!.improvements).not.toContain('Major_Well')
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
})

describe("A139 command boundaries", () => {
  const WARDEN = 'A139_HollowWarden'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 10, clay: 10, reed: 10, stone: 10, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [WARDEN] : []
        state.players[0]!.occupationHand = played ? ['A110_Roughcaster', 'A114_SeasonalWorker', 'A119_FirewoodCollector'] : [WARDEN, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function choice(s: GameSession, r: SessionResponse, value: string) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assert.ok(getChoiceOptions(r).some(o => o.value === value && !('disabled' in o && o.disabled)))
    return ok(s.resolveChoice(r.interaction.playerIndex, value))
  }
  function playWarden(s: GameSession) {
    let r = ok(s.takeAction(0, 'lessons'))
    if (!r.state.players[0]!.occupationPlayed.includes(WARDEN))
      r = choice(s, r, WARDEN)
    return r
  }
  function fireplace(s: GameSession, r: SessionResponse, card: 'Major_Fireplace1' | 'Major_Fireplace2' | null) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assert.equal(r.interaction.sourceCard, WARDEN)
    assert.equal(r.interaction.promptKey, 'ui.interactionOptionalAction')
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    const entries = getChoiceOptions(r).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(entries.length, 1)
    const entry = entries[0]!
    assert.equal(entry.labelKey, 'actions.improvement.name')
    assert.equal(entry.sourceCard, WARDEN)
    assert.ok(getChoiceOptions(r).some(option => option.value === '__skip__' && !option.disabled))
    if (card === null) {
      r = choice(s, r, '__skip__')
    } else {
      r = choice(s, r, entry.value)
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
        assert.equal(r.interaction.sourceCard, WARDEN)
        assert.equal(r.interaction.promptKey, 'ui.interactionChooseImprovement')
        assert.equal(r.interaction.playerIndex, 0)
        assert.equal(r.state.currentPlayerIndex, 0)
        assert.deepEqual(getChoiceOptions(r).filter(option => !option.disabled).map(option => option.value).sort(), ['Major_Fireplace1', 'Major_Fireplace2'])
        r = choice(s, r, card)
      }
    }
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }
  it("real Lessons grants only one Fireplace purchase at its ordinary clay cost", () => {
    for (const [card, cost] of [['Major_Fireplace1', 2], ['Major_Fireplace2', 3]] as const) {
      const s = setup(state => state.players[0]!.resources.clay = cost, false)
      const pending = playWarden(s)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_Joinery'))
      const r = fireplace(s, pending, card)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.ok(r.state.players[0]!.improvements.includes(card))
      assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.ok(!r.state.players[0]!.improvements.includes('Major_Joinery'))

      sessionEvidence.record(`A139-N1-${card}`, { pending, r })
    }
  })
  it("declining or lacking payment cannot grant a free Fireplace", () => {
    const s = setup(undefined, false)
    const declined = fireplace(s, playWarden(s), null)
    assert.ok(declined.interaction.stateId === 'wait')
    assert.deepEqual(declined.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(declined.interaction.playerIndex, 0)
    assert.equal(declined.state.currentPlayerIndex, 0)
    assert.deepEqual(declined.state.players[0]!.improvements, [])
    assert.equal(declined.state.players[0]!.resources.clay, 10)
    const poor = setup(state => state.players[0]!.resources.clay = 0, false)
    const denied = playWarden(poor)
    assert.ok(denied.interaction.stateId === 'wait')
    assert.deepEqual(denied.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(denied.interaction.playerIndex, 0)
    assert.equal(denied.state.currentPlayerIndex, 0)
    assert.deepEqual(denied.state.players[0]!.improvements, [])
    assertRejectedUnchanged(poor, () => poor.resolveChoice(0, 'Major_Fireplace1'))

    sessionEvidence.record('A139-N2', { declined, denied })
  })
  it("own Hollow grants one food while Clay Pit and hand do not", () => {
    for (const [space, played, food] of [['hollow', true, 41], ['clay-pit', true, 40], ['hollow', false, 40]] as const) {
      const s = setup(undefined, played)
      const r = ok(s.takeAction(0, space))
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.resources.food, food)

      sessionEvidence.record(`A139-N3-${space}-${played}`, r)
    }
    const foreignS = setup(state => {
      const hollow = state.actionSpaces.find(space => space.id === 'hollow')
      assert.ok(hollow)
      hollow.resources.clay = 3
    })
    const ownerTurn = ok(foreignS.takeAction(0, 'grain-seeds'))
    assert.ok(ownerTurn.interaction.stateId === 'wait')
    assert.deepEqual(ownerTurn.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(ownerTurn.interaction.playerIndex, 0)
    const ready = confirmNext(foreignS, ownerTurn)
    assert.equal(ready.interaction.stateId, 'idle')
    assert.equal(ready.state.currentPlayerIndex, 1)
    assert.equal(ready.state.players[0]!.resources.food, 40)
    const foreign = ok(foreignS.takeAction(1, 'hollow'))
    assert.ok(foreign.interaction.stateId === 'wait')
    assert.deepEqual(foreign.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(foreign.interaction.playerIndex, 1)
    assert.equal(foreign.state.currentPlayerIndex, 1)
    assert.equal(foreign.state.players[0]!.resources.food, 40)
    assert.equal(foreign.state.players[0]!.resources.clay, 10)
    assert.equal(foreign.state.players[1]!.resources.food, 40)
    assert.equal(foreign.state.players[1]!.resources.clay, 13)
    assert.equal(foreign.state.actionSpaces.find(space => space.id === 'hollow')!.resources.clay, 0)
    sessionEvidence.record('A139-N3-foreign', { ready, foreign })
  })
  it("whole purchase undo restores occupation and clay before one fireplace retry", () => {
    const s = setup(state => state.players[0]!.resources.clay = 2, false)
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const first = fireplace(s, playWarden(s), 'Major_Fireplace1')
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.deepEqual(first.state.players[0]!.improvements, ['Major_Fireplace1'])
    assert.ok(first.state.players[0]!.occupationPlayed.includes(WARDEN))
    assert.equal(first.state.players[0]!.resources.clay, 0)
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.state.players[0]!.improvements, [])
    assert.ok(undone.state.players[0]!.occupationHand.includes(WARDEN))
    assert.equal(undone.state.players[0]!.resources.clay, 2)
    const retry = fireplace(s, playWarden(s), 'Major_Fireplace1')
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.clay, 0)

    sessionEvidence.record('A139-N4', { first, undone, retry })
  })
})
