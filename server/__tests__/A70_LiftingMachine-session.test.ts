import { describe, expect, it, afterAll, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import '../../shared/cards/A/A070_LiftingMachine'
import '../../shared/cards/B/B068_Beanfield'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit10FieldSource from './_helpers/audit/ae-negative-10-field-source'

const CARD_ID = 'A070_LiftingMachine'

const CARD_FIELD = 'B068_Beanfield'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const purchaseSession = (fields: number) => {
  const session = new GameSession(6070, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 8
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID, FILLER]
  owner.resources.wood = 1
  owner.fields = Array.from({ length: fields }, (_, col) => ({ row: 0, col, stacks: [] }))
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (options(response).some((option) => option.value === CARD_ID)) return response
  const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playCard = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const roundEndSession = ({
  round = 8, vegetables = 2, cardField = false,
}: {
  round?: number
  vegetables?: number
  cardField?: boolean
} = {}) => {
  const session = new GameSession(6070, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.resources.vegetable = 0
  if (cardField) {
    owner.minorPlayed.push(CARD_FIELD)
    owner.cardStates[CARD_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: vegetables }] },
    }
  } else {
    owner.fields = [{
      row: 0, col: 0,
      stacks: vegetables > 0 ? [{ kind: 'vegetable', remaining: vegetables }] : [],
    }]
  }
  session.loadState(state)
  return session
}

const resolveLiftingMachine = (
  session: GameSession,
  response: SessionResponse,
  position: { row: number; col: number },
) => {
  let current = response
  for (let safety = 0; safety < 4 && current.interaction.stateId === 'wait'; safety += 1) {
    if (current.interaction.request.kind === 'select-trigger') {
      const trigger = options(current).find((option) =>
        option.value === CARD_ID || option.sourceCard === CARD_ID,
      )
      expect(trigger).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, trigger!.value)
      continue
    }
    if (current.interaction.request.kind === 'choice') {
      const accept = options(current).find((option) => option.value !== '__skip__')
      expect(accept).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, accept!.value)
      continue
    }
    if (current.interaction.request.kind === 'selection') {
      current = session.commitSelectionChoice(current.interaction.playerIndex, { positions: [position] })
      break
    }
    break
  }
  return current
}

const declineLiftingMachine = (session: GameSession, response: SessionResponse) => {
  let current = response
  if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'select-trigger') {
    const trigger = options(current).find((option) =>
      option.value === CARD_ID || option.sourceCard === CARD_ID,
    )
    expect(trigger).toBeDefined()
    current = session.resolveChoice(current.interaction.playerIndex, trigger!.value)
  }
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') return current
  if (current.interaction.request.kind === 'choice') {
    expect(options(current).some((option) => option.value === '__skip__')).toBe(true)
    return session.resolveChoice(current.interaction.playerIndex, '__skip__')
  }
  expect(current.interaction.request.kind).toBe('selection')
  return session.commitSelectionChoice(current.interaction.playerIndex, { cancel: true })
}

describe('A070 Lifting Machine parity', () => {
  it('A070 S1: three fields and one wood allow playing Lifting Machine', () => {
    const response = playCard(purchaseSession(3))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A070 S2: two fields keep Lifting Machine unavailable without payment', () => {
    const response = enterMinor(purchaseSession(2))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('A070 S3: at a non-harvest round end accepting moves one vegetable from an ordinary field to supply', () => {
    const session = roundEndSession()
    const response = resolveLiftingMachine(session, session.performRoundEnd(), { row: 0, col: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A070 S4: the non-harvest round-end move may be declined', () => {
    const session = roundEndSession()
    const response = declineLiftingMachine(session, session.performRoundEnd())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A070 S5: a harvest round offers no Lifting Machine move and only performs the normal field phase', () => {
    const session = roundEndSession({ round: 7 })
    const response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A070 S6: no vegetable field offers no Lifting Machine move', () => {
    const session = roundEndSession({ vegetables: 0 })
    const response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(9)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A070 S7: accepting at a non-harvest round end moves one vegetable from a card field to supply', () => {
    const session = roundEndSession({ cardField: true })
    const response = resolveLiftingMachine(session, session.performRoundEnd(), { row: -1, col: 2068 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })
})

describe('ae-negative-10-field-source', () => {
  const { LIFT, root, sessions, saved, save, setup, buy, deny, end, flow, fields, board, lift, selection, result } = audit10FieldSource
  afterAll(() => { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(`${root}/manifest.json`, JSON.stringify({ raw: process.env.AGRICOLA_NEGATIVE_RAW === '1', files: saved }, null, 2)) })
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A070 N1 actual purchase requires one wood and three own fields', () => {
   deny(lift({ played: false }), LIFT)
   const low = setup(LIFT, { played: false, resources: { wood: 1 } }, state => fields(state, [null, null])); deny(low, LIFT)
   const r = buy(lift({ played: false, resources: { wood: 1 } }), LIFT); assert.equal(r.state.players[0]!.resources.wood, 0); assert.ok(r.state.players[0]!.minorPlayed.includes(LIFT)); assert.equal(r.state.players[0]!.resources.vegetable, 0)
  })
  it('A070 N2 natural nonharvest return home may move one vegetable or decline', () => {
   for (const accept of [true, false]) { const s = lift(); let r = flow(s, end(s), LIFT, accept); if (accept) r = selection(s, r); assert.deepEqual(result(r), { own: [accept ? 1 : 2, 2, 0], opponent: [2], vegetable: Number(accept), grain: 1 }); assert.equal(r.state.round, 6); assert.equal(r.state.players[0]!.resources.food, 40); save(`A070-N2-${accept}`, r) }
  })
  it('A070 N3 actual harvest round and absent own vegetables or unplayed card give no lifting move', () => {
   const harvest = lift({ round: 4 }); const r = end(harvest); assert.deepEqual(result(r), { own: [1, 1, 0], opponent: [1], vegetable: 1, grain: 2 }); assert.equal(r.state.players[0]!.resources.food, 36)
   const noVeg = setup(LIFT, {}, state => { fields(state, [{ kind: 'grain', remaining: 2 }, null, null]); fields(state, [{ kind: 'vegetable', remaining: 2 }], 1) }); const n = end(noVeg); assert.equal(n.state.players[0]!.resources.vegetable, 0); assert.deepEqual(board(n), [2, 0, 0]); assert.deepEqual(board(n, 1), [2]); assert.equal(end(lift({ played: false })).state.players[0]!.resources.vegetable, 0)
  })
  it('A070 N4 multiple vegetable choice rejects empty multi target wrong actor and stale requests', () => {
   const s = lift({ multi: true }); const r = flow(s, end(s), LIFT); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection')
   for (const positions of [[{ row: 0, col: 4 }], [{ row: 0, col: 1 }, { row: 0, col: 2 }]]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions }))
   assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { positions: [{ row: 0, col: 2 }] }))
   const legal = selection(s, r, { row: 0, col: 2 }); assert.deepEqual(result(legal), { own: [2, 0, 2, 0], opponent: [2], vegetable: 1, grain: 1 }); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })); save('A070-N4-legal', legal)
  })
  it('A070 N4G forged own grain source is rejected at a genuine multiple vegetable choice', () => {
   const s = lift({ multi: true }); const r = flow(s, end(s), LIFT); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection'); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })); const legal = selection(s, r, { row: 0, col: 2 }); assert.deepEqual(result(legal), { own: [2, 0, 2, 0], opponent: [2], vegetable: 1, grain: 1 })
  })
  it('A070 N4O forged opponent vegetable source is rejected at a genuine multiple vegetable choice', () => {
   const s = lift({ multi: true }); const r = flow(s, end(s), LIFT); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection'); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 4 }] })); const legal = selection(s, r, { row: 0, col: 2 }); assert.deepEqual(result(legal), { own: [2, 0, 2, 0], opponent: [2], vegetable: 1, grain: 1 })
  })
  it('A070 N5 actual purchase undo restores full rule snapshot and allows legal retry', () => { const s = lift({ played: false, resources: { wood: 1 } }), before = undoRuleSnapshot(s.getState()); buy(s, LIFT); const undone = s.undoAction(); save('A070-N5-undo', { before: JSON.parse(before), response: undone }); assertUndoRestored(before, undone); const retry = buy(s, LIFT); assert.equal(retry.state.players[0]!.resources.wood, 0); assert.ok(retry.state.players[0]!.minorPlayed.includes(LIFT)) })
})
