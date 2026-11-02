import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow, PlayerState } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

// Each seat may hold one test-registered onBeforeReturnHome effect:
// - gain: settles automatically (+1 clay), no input.
// - choice: food-or-wood choice for its owner.
// - twoChoices: two food-or-wood choices in a row for its owner.
// - targetsNext: a food-or-wood choice that the next seat answers.
// - discard: its owner commits a goods selection to discard.
type StageCard = 'gain' | 'choice' | 'twoChoices' | 'targetsNext' | 'discard' | null

const cardId = (kind: Exclude<StageCard, null>, seat: number) => `TEST_StageHandoff_${kind}_${seat}`

const foodOrWood = (id: string, targetPlayerId?: string): ActionFlow => ({
  type: 'xor',
  ...(targetPlayerId ? { targetPlayerId } : {}),
  children: [
    { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: id, choiceLabelKey: 'test.food',
      ...(targetPlayerId ? { targetPlayerId } : {}) },
    { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: id, choiceLabelKey: 'test.wood',
      ...(targetPlayerId ? { targetPlayerId } : {}) },
  ],
})

const effectFor = (kind: Exclude<StageCard, null>, seat: number, playerIds: string[]): CardEffect => {
  const id = cardId(kind, seat)
  switch (kind) {
    case 'gain':
      return { id, onBeforeReturnHome: () => ({ type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: id }) }
    case 'choice':
      return { id, onBeforeReturnHome: () => foodOrWood(id) }
    case 'twoChoices':
      return { id, onBeforeReturnHome: () => ({ type: 'seq', children: [foodOrWood(id), foodOrWood(id)] }) }
    case 'targetsNext':
      return { id, onBeforeReturnHome: () => foodOrWood(id, playerIds[(seat + 1) % playerIds.length]) }
    case 'discard':
      return { id, onBeforeReturnHome: () => ({ type: 'leaf', actionId: 'discard-goods', sourceCard: id }) }
  }
}

const registerCards = (session: GameSession, cards: StageCard[]) => {
  const playerIds = session.state.players.map((player) => player.id)
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('stage handoff source test')
    cards.forEach((kind, seat) => {
      if (kind) registry.setEffect(effectFor(kind, seat, playerIds))
    })
  })
}

const setupSession = (cards: StageCard[]) => {
  const session = new GameSession(42, undefined, { playerCount: cards.length })
  const state = session.getState().state
  state.players = state.players.slice(0, cards.length)
  state.players.forEach((player: PlayerState, seat) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
    const kind = cards[seat]
    if (kind) player.occupationPlayed = [cardId(kind, seat)]
  })
  session.loadState(state)
  registerCards(session, cards)
  return session
}

/** Serialize at the current pause point and continue on a fresh session. */
const roundTrip = (session: GameSession, cards: StageCard[]) => {
  const saved = JSON.parse(JSON.stringify(session.withCtx(() => serializeSessionSnapshot(session.state, session))))
  const restored = new GameSession(42, undefined, { playerCount: cards.length })
  registerCards(restored, cards)
  const resp = restored.loadState(rehydrateState(saved))
  expect(resp.ok, resp.error).toBe(true)
  return { restored, resp }
}

type Wait = Extract<SessionResponse['interaction'], { stateId: 'wait' }>
const waitOf = (resp: SessionResponse): Wait => {
  expect(resp.ok, resp.error).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  return resp.interaction
}

const expectStageChoice = (resp: SessionResponse, playerIndex: number) => {
  const wait = waitOf(resp)
  expect(wait.playerIndex).toBe(playerIndex)
  expect(wait.request.kind).toBe('choice')
  return wait
}

const expectSwitch = (resp: SessionResponse, fromPlayerIndex: number, toPlayerIndex: number) => {
  const wait = waitOf(resp)
  expect(wait.playerIndex).toBe(fromPlayerIndex)
  expect(wait.request).toEqual({ kind: 'confirm-player-switch', fromPlayerIndex, toPlayerIndex })
  return wait
}

const expectNoUndo = (resp: SessionResponse) => {
  const wait = waitOf(resp)
  expect(wait.allowedCommands).not.toContain('undoStep')
  expect(wait.allowedCommands).not.toContain('undoAction')
  expect(resp.historyLength).toBe(0)
}

const pick = (session: GameSession, resp: SessionResponse, label: 'test.food' | 'test.wood') => {
  const wait = waitOf(resp)
  const option = wait.request.kind === 'choice'
    ? wait.request.options.find((candidate) => candidate.labelKey === label)
    : undefined
  if (!option) throw new Error(`missing ${label} option`)
  return session.resolveChoice(wait.playerIndex, option.value)
}

const step = (resp: SessionResponse) => {
  if (resp.interaction.stateId !== 'wait') return resp.interaction.stateId
  const { playerIndex, request } = resp.interaction
  return request.kind === 'confirm-player-switch'
    ? `${playerIndex}:confirm->${request.toPlayerIndex}`
    : `${playerIndex}:${request.kind}`
}

const undoView = (resp: SessionResponse) => ({
  historyLength: resp.historyLength,
  commands: resp.interaction.stateId === 'wait'
    ? resp.interaction.allowedCommands.filter((command) => command === 'undoStep' || command === 'undoAction')
    : [],
})

const resources = (resp: SessionResponse, key: 'clay' | 'food' | 'wood') =>
  resp.state.players.map((player) => player.resources[key])

describe('stage dispatch handoff source', () => {
  it('[gain, choice]: the auto-settled owner never confirms; seat 1 answers directly with nothing to undo', () => {
    const session = setupSession(['gain', 'choice'])

    const resp = session.invokeBeforeReturnHomeHooks()

    expect(resources(resp, 'clay')).toEqual([1, 0])
    expectStageChoice(resp, 1)
    expectNoUndo(resp)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(false)
    expect(session.undoStep().ok).toBe(false)

    const done = pick(session, resp, 'test.wood')
    expect(done.ok, done.error).toBe(true)
    expect(done.interaction.stateId).toBe('idle')
    expect(resources(done, 'wood')).toEqual([0, 1])
  })

  it('[choice, choice]: seat 0 confirms after answering, may undo only its own choice, and seat 1 cannot undo it', () => {
    const session = setupSession(['choice', 'choice'])

    let resp = session.invokeBeforeReturnHomeHooks()
    expectStageChoice(resp, 0)
    const [food0, food1] = resources(resp, 'food')

    resp = pick(session, resp, 'test.food')
    let wait = expectSwitch(resp, 0, 1)
    expect(wait.allowedCommands).toContain('undoStep')
    expect(resources(resp, 'food')).toEqual([food0! + 1, food1])

    resp = session.undoStep()
    expectStageChoice(resp, 0)
    expect(resources(resp, 'food')).toEqual([food0, food1])

    resp = pick(session, resp, 'test.food')
    expectSwitch(resp, 0, 1)

    resp = confirmPlayerSwitch(session)
    wait = expectStageChoice(resp, 1)
    expectNoUndo(resp)
    expect(wait.allowedCommands).toContain('resolveChoice')
    const undo = session.undoStep()
    expect(undo.ok).toBe(false)
    expect(undo.ok ? '' : undo.error).toBe('cannot undo past boundary')
  })

  it('[gain, gain] settles without any interaction', () => {
    const session = setupSession(['gain', 'gain'])

    const resp = session.invokeBeforeReturnHomeHooks()

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resources(resp, 'clay')).toEqual([1, 1])
  })

  it('[none, choice] gives seat 1 its choice directly', () => {
    const session = setupSession([null, 'choice'])

    const resp = session.invokeBeforeReturnHomeHooks()

    expectStageChoice(resp, 1)
    expectNoUndo(resp)
  })

  it('3 players [gain, gain, choice]: seat 2 answers directly', () => {
    const session = setupSession(['gain', 'gain', 'choice'])

    const resp = session.invokeBeforeReturnHomeHooks()

    expect(resources(resp, 'clay')).toEqual([1, 1, 0])
    expectStageChoice(resp, 2)
    expectNoUndo(resp)
    const done = pick(session, resp, 'test.wood')
    expect(done.interaction.stateId).toBe('idle')
    expect(resources(done, 'wood')).toEqual([0, 0, 1])
  })

  it('3 players [choice, gain, choice]: seat 0 confirms to seat 2 and its undo reverts only its own choice', () => {
    const session = setupSession(['choice', 'gain', 'choice'])

    let resp = session.invokeBeforeReturnHomeHooks()
    expectStageChoice(resp, 0)

    resp = pick(session, resp, 'test.wood')
    const wait = expectSwitch(resp, 0, 2)
    expect(wait.allowedCommands).toContain('undoStep')
    expect(resources(resp, 'wood')).toEqual([1, 0, 0])
    expect(resources(resp, 'clay')).toEqual([0, 1, 0])
    expect(session.resolveChoice(1, 'confirm').ok).toBe(false)

    resp = session.undoStep()
    expectStageChoice(resp, 0)
    expect(resources(resp, 'wood')).toEqual([0, 0, 0])

    resp = pick(session, resp, 'test.food')
    expectSwitch(resp, 0, 2)
    expect(resources(resp, 'clay')).toEqual([0, 1, 0])

    resp = confirmPlayerSwitch(session)
    expectStageChoice(resp, 2)
    expectNoUndo(resp)

    const done = pick(session, resp, 'test.wood')
    expect(done.interaction.stateId).toBe('idle')
    expect(resources(done, 'wood')).toEqual([0, 0, 1])
    expect(resources(done, 'clay')).toEqual([0, 1, 0])
  })

  it('3 players: seat 0 effect lets seat 1 choose, then seat 1 alone confirms the handoff to seat 2', () => {
    const session = setupSession(['targetsNext', null, 'choice'])

    let resp = session.invokeBeforeReturnHomeHooks()
    const trace = [step(resp)]
    expectStageChoice(resp, 1)
    expectNoUndo(resp)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(false)

    resp = pick(session, resp, 'test.wood')
    trace.push(step(resp))
    const wait = expectSwitch(resp, 1, 2)
    expect(wait.allowedCommands).toContain('undoStep')
    expect(resources(resp, 'wood')).toEqual([0, 1, 0])

    resp = confirmPlayerSwitch(session)
    trace.push(step(resp))
    expectStageChoice(resp, 2)
    expectNoUndo(resp)

    resp = pick(session, resp, 'test.food')
    trace.push(step(resp))
    expect(trace).toEqual(['1:choice', '1:confirm->2', '2:choice', 'idle'])
    expect(resources(resp, 'wood')).toEqual([0, 1, 0])
  })

  it('3 players: the targeted responder undoes only its own choice before confirming', () => {
    const session = setupSession(['targetsNext', null, 'choice'])

    let resp = pick(session, session.invokeBeforeReturnHomeHooks(), 'test.wood')
    expectSwitch(resp, 1, 2)

    resp = session.undoStep()
    expectStageChoice(resp, 1)
    expectNoUndo(resp)
    expect(resources(resp, 'wood')).toEqual([0, 0, 0])
    expect(session.undoStep().ok).toBe(false)

    resp = pick(session, resp, 'test.food')
    expectSwitch(resp, 1, 2)
  })

  it('[discard, choice]: a committed selection makes seat 0 the Handoff Source', () => {
    const session = setupSession(['discard', 'choice'])

    let resp = session.invokeBeforeReturnHomeHooks()
    const wait = waitOf(resp)
    expect(wait.playerIndex).toBe(0)
    expect(wait.request.kind).toBe('resource-quantity-select')
    const [food0] = resources(resp, 'food')

    resp = session.commitSelectionChoice(0, { resourceCounts: { food: 1 } })
    expectSwitch(resp, 0, 1)
    expect(resources(resp, 'food')[0]).toBe(food0! - 1)

    resp = confirmPlayerSwitch(session)
    expectStageChoice(resp, 1)
    expectNoUndo(resp)
  })

  describe('parent cards opening', () => {
    const OPTIONAL = 'TEST_StageHandoff_roundStartOptional'
    const registerOptional = (session: GameSession) => session.withCtx(() =>
      requireActiveCardRegistry('stage handoff source test').setEffect({
        id: OPTIONAL,
        onRoundStart: () => ({ type: 'leaf', actionId: 'gain', params: { wood: 1 }, optional: true, sourceCard: OPTIONAL }),
      }))
    const createParentSession = () => {
      const session = new GameSession(56124, undefined, {
        playerCount: 2, enableParentCards: true, parentSelectionSeed: 9001,
        enableThroughTheSeasons: false, enableFarmersOfTheMoor: false,
      })
      for (const player of session.state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.resources = { ...emptyResources, food: 5 }
      }
      session.state.players[1]!.occupationPlayed = [OPTIONAL]
      // Seat 0 mother PR12 places 1 clay and seat 1 mother PR11 places 1 food on round 1.
      session.state.parentSelection!.candidates = {
        p1: { mother: ['PR12', 'PR01'], father: ['PS01', 'PS03'] },
        p2: { mother: ['PR11', 'PR02'], father: ['PS02', 'PS04'] },
      }
      expect(session.loadState(session.state).ok).toBe(true)
      registerOptional(session)
      return session
    }
    const restoreParentSession = (session: GameSession) => {
      const saved = JSON.parse(JSON.stringify(session.withCtx(() => serializeSessionSnapshot(session.state, session))))
      const restored = new GameSession(56124, undefined, {
        playerCount: 2, enableParentCards: true, parentSelectionSeed: 9001,
        enableThroughTheSeasons: false, enableFarmersOfTheMoor: false,
      })
      registerOptional(restored)
      const resp = restored.loadState(rehydrateState(saved))
      expect(resp.ok, resp.error).toBe(true)
      return { restored, resp }
    }
    const selectTrigger = (session: GameSession, resp: SessionResponse, value: string) => {
      const wait = waitOf(resp)
      expect(wait.request.kind).toBe('select-trigger')
      if (wait.request.kind !== 'select-trigger') throw new Error('expected select-trigger')
      expect(wait.request.options.map((option) => option.value)).toContain(value)
      return session.resolveChoice(wait.playerIndex, value)
    }

    it('the last parent submission settles seat 0 automatically and hands seat 1 its round-start triggers directly', () => {
      let session = createParentSession()
      expect(session.submitParentSelection(0, { mother: 'PR12', father: 'PS01' }).ok).toBe(true)

      let resp = session.submitParentSelection(1, { mother: 'PR11', father: 'PS02' })
      expect(resp.ok, resp.error).toBe(true)
      expect(resp.state.round).toBe(1)
      expect(resp.state.roundPhase).toBe('preparation')
      let wait = waitOf(resp)
      expect(wait.playerIndex).toBe(1)
      expect(wait.request.kind).toBe('select-trigger')
      expectNoUndo(resp)
      expect(resources(resp, 'clay')).toEqual([1, 0])
      expect(resources(resp, 'food')).toEqual([5, 5])
      expect(session.resolveChoice(0, 'confirm').ok).toBe(false)
      const undo = session.undoStep()
      expect(undo.ok).toBe(false)
      expect(resources(undo, 'clay')).toEqual([1, 0])

      const restoredAtTriggers = restoreParentSession(session)
      session = restoredAtTriggers.restored
      wait = waitOf(restoredAtTriggers.resp)
      expect(wait.playerIndex).toBe(1)
      expect(wait.request.kind).toBe('select-trigger')
      expect(resources(restoredAtTriggers.resp, 'clay')).toEqual([1, 0])

      resp = selectTrigger(session, restoredAtTriggers.resp, 'PR11')
      expect(resp.ok, resp.error).toBe(true)
      expect(resources(resp, 'food')).toEqual([5, 6])
      expect(waitOf(resp).playerIndex).toBe(1)

      resp = session.undoStep()
      expect(resp.ok, resp.error).toBe(true)
      expect(resources(resp, 'food')).toEqual([5, 5])
      expect(resources(resp, 'clay')).toEqual([1, 0])

      resp = selectTrigger(session, resp, 'PR11')
      expect(resources(resp, 'food')).toEqual([5, 6])
      const restoredAfterReward = restoreParentSession(session)
      session = restoredAfterReward.restored
      expect(resources(restoredAfterReward.resp, 'food')).toEqual([5, 6])

      resp = selectTrigger(session, restoredAfterReward.resp, OPTIONAL)
      expect(resp.ok, resp.error).toBe(true)
      expect(resp.interaction.stateId).toBe('idle')
      expect(resp.state.roundPhase).toBe('work')
      expect(resources(resp, 'clay')).toEqual([1, 0])
      expect(resources(resp, 'food')).toEqual([5, 6])
      expect(resources(resp, 'wood')).toEqual([0, 1])
    })
  })

  type Scenario = { cards: StageCard[]; script: Array<'test.food' | 'test.wood' | 'confirm'>; trace: string[] }
  const scenarios: Record<string, Scenario> = {
    '[gain, choice]': { cards: ['gain', 'choice'], script: ['test.wood'], trace: ['1:choice', 'idle'] },
    '[choice, choice]': {
      cards: ['choice', 'choice'], script: ['test.food', 'confirm', 'test.wood'],
      trace: ['0:choice', '0:confirm->1', '1:choice', 'idle'],
    },
    '[twoChoices, choice]': {
      cards: ['twoChoices', 'choice'], script: ['test.food', 'test.wood', 'confirm', 'test.wood'],
      trace: ['0:choice', '0:choice', '0:confirm->1', '1:choice', 'idle'],
    },
    '3 players [choice, gain, choice]': {
      cards: ['choice', 'gain', 'choice'], script: ['test.wood', 'confirm', 'test.food'],
      trace: ['0:choice', '0:confirm->2', '2:choice', 'idle'],
    },
    '3 players [targetsNext, none, choice]': {
      cards: ['targetsNext', null, 'choice'], script: ['test.wood', 'confirm', 'test.food'],
      trace: ['1:choice', '1:confirm->2', '2:choice', 'idle'],
    },
  }

  for (const [name, { cards, script, trace: expected }] of Object.entries(scenarios)) {
    it(`${name}: serializing at every pause keeps the interaction, Handoff Source and continuation`, () => {
      let session = setupSession(cards)
      let resp = session.invokeBeforeReturnHomeHooks()
      const trace = [step(resp)]
      for (const action of script) {
        const before = { step: step(resp), undo: undoView(resp) }
        const roundTripped = roundTrip(session, cards)
        session = roundTripped.restored
        expect({ step: step(roundTripped.resp), undo: undoView(roundTripped.resp) }).toEqual(before)
        resp = action === 'confirm' ? confirmPlayerSwitch(session) : pick(session, roundTripped.resp, action)
        expect(resp.ok, resp.error).toBe(true)
        trace.push(step(resp))
      }
      expect(trace).toEqual(expected)
    })
  }
})
