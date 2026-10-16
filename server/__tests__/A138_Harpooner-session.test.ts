import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A138_Harpooner'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A138_Harpooner'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, family = 2, wood = 1 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6138, options: { playerCount: 3 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.wood = wood
  setActiveWorkerCount(owner, family)
  setWorkersAtHome(state, owner, 2)
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing space missing')
  fishing.resources.food = 1
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const enterHarpooner = (session: GameSession, initial: SessionResponse) => {
  const response = resolveTriggerIfPresent(session, initial, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  return response
}

const acceptHarpooner = (session: GameSession, initial: SessionResponse) => {
  const response = enterHarpooner(session, initial)
  if (response.interaction.stateId !== 'wait') return response
  const accept = getChoiceOptions(response)?.find((option) =>
    option.value !== '__skip__' && option.sourceCard === CARD_ID)
    ?? getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
  expect(accept, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

describe('A138 Harpooner parity', () => {
  it('A138 S1: Harpooner is played as the first occupation in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A138 S2: a two-person family may pay one wood after Fishing for two extra food and one reed', () => {
    const session = setup()
    const response = acceptHarpooner(session, session.takeAction(0, 'fishing'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 3, reed: 1 })
  })

  it('A138 S3: a three-person family receives three extra food and one reed', () => {
    const session = setup({ family: 3 })
    const response = acceptHarpooner(session, session.takeAction(0, 'fishing'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 4, reed: 1 })
  })

  it('A138 S4: the Harpooner exchange may be declined', () => {
    const session = setup()
    let response = enterHarpooner(session, session.takeAction(0, 'fishing'))
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 1, reed: 0 })
  })

  it('A138 S5: no wood or a non-Fishing action offers no usable Harpooner exchange', () => {
    const noWood = setup({ wood: 0 }).takeAction(0, 'fishing')
    expect(noWood.ok, noWood.error).toBe(true)
    expect(noWood.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1, reed: 0 })
    expect(noWood.interaction.stateId === 'wait'
      ? getChoiceOptions(noWood)?.some((option) =>
        option.sourceCard === CARD_ID && option.value !== '__skip__' && !option.disabled) ?? false
      : false).toBe(false)

    const nonTarget = setup().takeAction(0, 'day-laborer')
    expect(nonTarget.state.players[0]!.resources).toMatchObject({ wood: 1, food: 2, reed: 0 })
    expect(nonTarget.interaction.stateId === 'wait' ? nonTarget.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })
})

describe("A138 command boundaries", () => {
  const HARPOON = 'A138_Harpooner'
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
        state.players[0]!.occupationPlayed = played ? [HARPOON] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [HARPOON, 'A110_Roughcaster']
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
  function finishOptional(s: GameSession, r: SessionResponse, accept: boolean) {
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'animal-reorg') {
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
        continue
      }
      assert.ok(i.request.kind === 'choice' || i.request.kind === 'select-trigger', JSON.stringify(i))
      const o = getChoiceOptions({ interaction: i }).find(o => accept ? o.value !== '__skip__' && o.value !== '__done__' : o.value === '__skip__' || o.value === '__done__')
      assert.ok(o)
      r = ok(s.resolveChoice(i.playerIndex, o.value))
    }
    return r
  }
  function piles(state: GameState, space: string, resource: 'wood' | 'clay' | 'reed' | 'stone' | 'sheep' | 'food', amount: number) {
    const a = state.actionSpaces.find(a => a.id === space)
    assert.ok(a)
    a.resources[resource] = amount
  }
  it("Fishing pays one wood for one food per ordinary person and one reed", () => {
    const s = setup(state => {
      state.players[0]!.resources.wood = 1
      piles(state, 'fishing', 'food', 3)
    })
    const pending = turn(s, 0, 'fishing')
    const r = finishOptional(s, pending, true)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.food, 45)
    assert.equal(r.state.players[0]!.resources.reed, 1)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 0)
    sessionEvidence.record('A138-N1', { pending, r })
  })
  it("decline keeps wood and zero wood cannot award free harpoon bonus", () => {
    for (const wood of [0, 1]) {
      const s = setup(state => {
        state.players[0]!.resources.wood = wood
        piles(state, 'fishing', 'food', 3)
      })
      const r = finishOptional(s, turn(s, 0, 'fishing'), false)
      assert.equal(r.state.players[0]!.resources.wood, wood)
      assert.equal(r.state.players[0]!.resources.food, 43)
      assert.equal(r.state.players[0]!.resources.reed, 0)
      sessionEvidence.record(`A138-N2-${wood}`, r)
    }
  })
  it("hand unrelated and opponent Fishing cannot reward owner", () => {
    const hs = setup(state => state.players[0]!.resources.wood = 1, false)
    const hand = finishOptional(hs, turn(hs, 0, 'fishing'), false)
    assert.equal(hand.state.players[0]!.resources.reed, 0)
    const s = setup(state => state.players[0]!.resources.wood = 1)
    const unrelated = turn(s, 0, 'day-laborer')
    const other = turn(s, 1, 'fishing')
    assert.equal(other.state.players[0]!.resources.wood, 1)
    assert.equal(other.state.players[0]!.resources.reed, 0)
    sessionEvidence.record('A138-N3', { hand, unrelated, other })
  })
  it("wrong actor invalid and stale choice cannot pay or gain twice", () => {
    const s = setup(state => state.players[0]!.resources.wood = 1)
    const pending = turn(s, 0, 'fishing')
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'accept'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'free'))
    const r = finishOptional(s, pending, true)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'accept'))
    assert.equal(r.state.players[0]!.resources.reed, 1)
    sessionEvidence.record('A138-N4', r)
  })
  it("whole action undo restores cost reward and pile before one retry", () => {
    const s = setup(state => {
      state.players[0]!.resources.wood = 1
      piles(state, 'fishing', 'food', 3)
    })
    const first = finishOptional(s, turn(s, 0, 'fishing'), true)
    const undone = ok(s.undoAction())
    assert.equal(undone.state.players[0]!.resources.wood, 1)
    assert.equal(undone.state.players[0]!.resources.food, 40)
    assert.equal(undone.state.players[0]!.resources.reed, 0)
    assert.equal(undone.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 3)
    const retry = finishOptional(s, turn(s, 0, 'fishing'), true)
    assert.equal(retry.state.players[0]!.resources.food, 45)
    sessionEvidence.record('A138-N5', { first, undone, retry })
  })
})
