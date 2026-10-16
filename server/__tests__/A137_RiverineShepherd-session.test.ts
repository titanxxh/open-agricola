import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A137_RiverineShepherd'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A137_RiverineShepherd'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, reed = 3, sheep = 2 } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 5137, options: { playerCount: 3 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((candidate) => {
      candidate.minorHand = [FILLER]
      candidate.occupationHand = [FILLER]
      setWorkersAtHome(state, candidate, 2)
    })

    const player = state.players[0]!
    player.occupationHand = played ? [FILLER] : [CARD_ID]
    player.occupationPlayed = played ? [CARD_ID] : []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
    player.houseAnimals = {};
    player.stableAnimals = {}
    player.pastures = [
      {
    id: 'riverine-pasture',
    tiles: [{ row: 0, col: 1 }],
    animalType: null,
    animalCount: 0
},
    ]

    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = sheep
    state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = reed

    session.loadState(state)
    return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const placeSheep = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const pasture = response.interaction.request.zones.find((zone) => zone.id === 'riverine-pasture')
  expect(pasture).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', {
    zones: [{
      id: 'riverine-pasture',
      zoneType: 'pasture',
      animalType: 'sheep',
      animalCount: response.state.players[0]!.resources.sheep,
    }],
  })
}

const resolveRiverine = (session: GameSession, initial: SessionResponse, accept: boolean) => {
  let response = initial
  let handled = false
  for (let step = 0; step < 8; step++) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = placeSheep(session, response)
      continue
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      const next = resolveTriggerIfPresent(session, response, CARD_ID)
      if (next === response) break
      response = next
      continue
    }
    if (response.interaction.stateId !== 'wait') break
    const cardOption = getChoiceOptions(response)?.find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
    if (!cardOption) break
    response = session.resolveChoice(
      response.interaction.playerIndex,
      accept ? cardOption.value : '__skip__',
    )
    handled = true
  }
  return { response, handled }
}

describe('A137 Riverine Shepherd parity', () => {
  it('A137 S1: Riverine Shepherd is played as the first occupation without paying food in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A137 S2: using Sheep Market may take exactly one reed from Reed Bank', () => {
    const session = setup({ reed: 3, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), true)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 1 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      id: 'riverine-pasture', animalType: 'sheep', animalCount: 1,
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(2)
  })

  it('A137 S3: using Reed Bank may take exactly one sheep from Sheep Market and keep it', () => {
    const session = setup({ reed: 2, sheep: 2 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'reed-bank'), true)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, sheep: 1 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      id: 'riverine-pasture', animalType: 'sheep', animalCount: 1,
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep).toBe(1)
  })

  it('A137 S4: the extra good may be declined', () => {
    const session = setup({ reed: 3, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), false)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(3)
  })

  it('A137 S5: an empty corresponding space offers no extra good', () => {
    const session = setup({ reed: 0, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), true)

    expect(handled).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 0 })
  })

  it('A137 S6: a different action space offers no extra good', () => {
    const session = setup({ reed: 3, sheep: 2 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'day-laborer'), true)

    expect(handled).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 0, sheep: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep).toBe(2)
  })
})

describe("A137 command boundaries", () => {
  const SHEPHERD = 'A137_RiverineShepherd'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const players = 3
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [SHEPHERD] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [SHEPHERD, 'A110_Roughcaster']
        configure(state)
      } }))
    assert.equal(s.getState().state.players.length, players)
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
  function settleAnimals(s: GameSession, r: SessionResponse, actor: 0 | 1 = 0) {
    for (let n = 0; n < 4 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg'; n++) {
      assert.equal(r.interaction.playerIndex, actor)
      r = ok(s.resolveChoice(actor, 'confirm', { zones: r.interaction.request.zones }))
    }
    return r
  }
  function finishAnimals(s: GameSession, r: SessionResponse, actor: 0 | 1 = 0) {
    r = settleAnimals(s, r, actor)
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: actor === 0 ? 1 : 2 })
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function finishOptional(s: GameSession, r: SessionResponse, accept: boolean) {
    r = settleAnimals(s, r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, SHEPHERD)
    assert.equal(r.interaction.playerIndex, 0)
    const option = getChoiceOptions(r).find(option => accept ? option.sourceCard === SHEPHERD && !option.disabled : option.value === '__skip__')
    assert.ok(option)
    return finishAnimals(s, ok(s.resolveChoice(0, option.value)))
  }
  function piles(state: GameState, space: string, resource: 'wood' | 'clay' | 'reed' | 'stone' | 'sheep' | 'food', amount: number) {
    const a = state.actionSpaces.find(a => a.id === space)
    assert.ok(a)
    a.resources[resource] = amount
  }
  function shepherd(other: number, played = true) {
    return setup(state => {
      piles(state, 'sheep-market', 'sheep', 1)
      piles(state, 'reed-bank', 'reed', other)
    }, played)
  }
  it("Sheep Market takes exactly one reed from nonempty other pile", () => {
    for (const amount of [1, 4]) {
      const s = shepherd(amount)
      const pending = turn(s, 0, 'sheep-market')
      const r = finishOptional(s, pending, true)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.resources.sheep, 1)
      assert.equal(r.state.players[0]!.resources.reed, 1)
      assert.equal(r.state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed, amount - 1)
      assert.equal(r.state.actionSpaces.find(a => a.id === 'reed-bank')!.takenBy.length, 0)

      sessionEvidence.record(`A137-N1-${amount}`, { pending, r })
    }
  })
  it("Reed Bank can take one sheep without collecting or occupying other space", () => {
    const s = shepherd(2)
    const r = finishOptional(s, turn(s, 0, 'reed-bank'), true)
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.reed, 2)
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep, 0)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'sheep-market')!.takenBy.length, 0)

    sessionEvidence.record('A137-N2', r)
  })
  it("empty other pile and decline cannot create reserve reed", () => {
    const zeroS = shepherd(0)
    const zero = finishAnimals(zeroS, turn(zeroS, 0, 'sheep-market'))
    assert.ok(zero.interaction.stateId === 'wait')
    assert.deepEqual(zero.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(zero.interaction.playerIndex, 0)
    assert.equal(zero.state.currentPlayerIndex, 0)
    assert.equal(zero.state.players[0]!.resources.reed, 0)
    const s = shepherd(4)
    const declined = finishOptional(s, turn(s, 0, 'sheep-market'), false)
    assert.ok(declined.interaction.stateId === 'wait')
    assert.deepEqual(declined.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(declined.interaction.playerIndex, 0)
    assert.equal(declined.state.currentPlayerIndex, 0)
    assert.equal(declined.state.players[0]!.resources.reed, 0)
    assert.equal(declined.state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed, 4)

    sessionEvidence.record('A137-N3', { zero, declined })
  })
  it("hand unrelated and actual opponent cannot collect owner other pile", () => {
    const hs = shepherd(4, false)
    const hand = finishAnimals(hs, turn(hs, 0, 'sheep-market'))
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(hand.interaction.playerIndex, 0)
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(hand.state.players[0]!.resources.reed, 0)
    const s = shepherd(4)
    const unrelated = turn(s, 0, 'day-laborer')
    assert.ok(unrelated.interaction.stateId === 'wait')
    assert.deepEqual(unrelated.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(unrelated.interaction.playerIndex, 0)
    assert.equal(unrelated.state.currentPlayerIndex, 0)
    const other = finishAnimals(s, turn(s, 1, 'sheep-market'), 1)
    assert.ok(other.interaction.stateId === 'wait')
    assert.deepEqual(other.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(other.interaction.playerIndex, 1)
    assert.equal(other.state.currentPlayerIndex, 1)
    assert.equal(other.state.players[0]!.resources.reed, 0)
    assert.equal(other.state.players[1]!.resources.reed, 0)

    sessionEvidence.record('A137-N4', { hand, unrelated, other })
  })
  it("invalid choice rejects and whole undo returns source and animals before retry", () => {
    const s = shepherd(4)
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const pending = settleAnimals(s, turn(s, 0, 'sheep-market'))
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assert.equal(pending.interaction.sourceCard, SHEPHERD)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'take-five'))
    const first = finishOptional(s, pending, true)
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(first.state.players[0]!.resources.sheep, 1)
    assert.equal(first.state.players[0]!.resources.reed, 1)
    assert.equal(first.state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed, 3)
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.sheep, 0)
    assert.equal(undone.state.players[0]!.resources.reed, 0)
    assert.equal(undone.state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed, 4)
    const retry = finishOptional(s, turn(s, 0, 'sheep-market'), true)
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.reed, 1)

    sessionEvidence.record('A137-N5', { first, undone, retry })
  })
})
