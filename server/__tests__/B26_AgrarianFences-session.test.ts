import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

import '../../shared/cards/A/A094_LazySowman'
import '../../shared/cards/B/B026_AgrarianFences'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as auditB026 from './_helpers/audit/ae-negative-B026'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const waiting = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending interaction')
  return response.interaction
}

const choices = (response: SessionResponse) => {
  const request = waiting(response).request
  if (request.kind !== 'choice') throw new Error('Expected choice interaction')
  return request.options
}

const farm = (response: SessionResponse) => {
  const request = waiting(response).request
  return request.kind === 'farm-select' ? request.farm : undefined
}

const chooseLabel = (session: GameSession, response: SessionResponse, labelKey: string) => {
  const option = choices(response).find((candidate) => candidate.labelKey === labelKey
    || candidate.labelParams?.actionNameKey === labelKey)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  wood?: number
}) => {
  const session = createWorkSession({ configure: (state) => {
    state.round = 3
    const player = state.players[0]!
    Object.assign(player.resources, {
      grain: options?.grain ?? 3,
      vegetable: options?.vegetable ?? 0,
      wood: options?.wood ?? 10,
      food: 5,
    })
    player.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 0, col: 3, stacks: [] },
    ]
    if (options?.withCard ?? true) player.minorPlayed.push('B026_AgrarianFences')
  } })
  sessions.push(session)
  return session
}

describe('B026_AgrarianFences session', () => {
  it('without the card, grain-utilization offers normal sow/bake choices', () => {
    const session = setup({ withCard: false })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Normal grain-utilization: or(sow, bake-bread) — presents sow and bake choices
    expect(resp.interaction.stateId).toBe('wait')
  })

  it('with the card, grain-utilization offers a complete fencing plan or its original flow', () => {
    const session = setup({ withCard: true })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Composite replacement keeps the fencing plans separate from the original flow.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Should have more options than just normal sow/bake
    expect(choices(resp).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps Lazy Sowman selectable inside the Agrarian Fences sow-and-fence plan', () => {
    const session = setup({ withCard: true })
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('A094_LazySowman')
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(waiting(resp).promptKey).toBe('ui.interactionSelectReplacement')
    expect(choices(resp).some((option) => option.labelKey === 'ui.interactionDoNotReplace')).toBe(true)
    const agrarianFences = choices(resp).find((option) => option.sourceCard === 'B026_AgrarianFences')!
    resp = session.resolveChoice(0, agrarianFences.value)
    resp = chooseLabel(session, resp, 'ui.interactionAgrarianFencesSowAndFence')
    resp = chooseLabel(session, resp, 'actions.sow.name')

    expect(waiting(resp).promptKey).toBe('ui.interactionSelectReplacement')
    expect(choices(resp).map((option) => option.labelKey)).toEqual([
      'ui.interactionUseCard', 'ui.interactionDoNotReplace',
    ])
    expect(choices(resp).some((option) => option.sourceCard === 'A094_LazySowman')).toBe(true)
    resp = chooseLabel(session, resp, 'ui.interactionDoNotReplace')
    const selection = farm(resp)
    if (selection?.farmType !== 'sow') throw new Error('Expected normal Sow selection')
    resp = session.commitSelectionChoice(0, { crops: [{ ...selection.selectableFields[0]!.tile, crop: 'grain' }] })
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 2, wood: 10 })

    resp = chooseLabel(session, resp, 'actions.fencing.name')
    expect(farm(resp)?.farmType).toBe('fence')
    resp = session.commitSelectionChoice(0, { edges: ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5'], palisadeEdges: [] })
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 2, wood: 6 })
    expect(resp.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(waiting(resp).request.kind).toBe('confirm-next-player')
    expect(resp.scores).toHaveLength(2)
    expect(resp.state.log.length).toBeGreaterThan(0)
  })

  it('rejects entry without fencing resources, seeds, or a baking improvement', () => {
    const session = setup({ withCard: true, wood: 0, grain: 0 })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('space unavailable')
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(0)
  })

  it('does not affect sow actions outside grain-utilization', () => {
    const session = setup({ withCard: true })
    const state = session.getState().state
    // Advance to round 5 to unlock cultivation (which also has sow)
    state.round = 5
    session.loadState(state)

    const resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    // Cultivation should not have fence options — B26 only affects grain-utilization
    const optionValues = choices(resp).map((o) => o.value)
    const hasFenceOption = optionValues.some((v) => v.includes('fence'))
    expect(hasFenceOption).toBe(false)
  })
})

describe('ae-negative-B026', () => {
  const { CARD, EDGES, sessions, setup, choose, offered, fenceThenSow, totals } = auditB026
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('B026 negative audit: one replacement per space use', () => {
    it('N1 cannot perform a third action after fencing and sowing', () => {
      const session = setup()
      fenceThenSow(session)
      if (offered(session, 'actions.bake-bread.name')) choose(session, 'actions.bake-bread.name')
      if (offered(session, 'ui.interactionDoNotReplace')) choose(session, 'ui.interactionDoNotReplace')
      if (offered(session, 'Major_Fireplace1')) assert.equal(session.resolveChoice(0, 'Major_Fireplace1').ok, true)
      const baked = session.getState()
      assert.equal(baked.scores?.length, 2)
      const actions = Number(baked.state.players[0]!.fenceSegments.length > 0)
        + Number(baked.state.players[0]!.fields[0]!.stacks.length > 0) + Number(baked.state.players[0]!.resources.food > 0)
      if (actions > 2) assert.deepEqual(totals(baked), { wood: 4, grain: 0, food: 2, fences: 4 })
      assertRuleOutcome(actions > 2, false)
    })
    it('N2 cannot replace both original sub-actions with fencing', () => {
      const session = setup()
      fenceThenSow(session)
      if (offered(session, 'actions.bake-bread.name')) choose(session, 'actions.bake-bread.name')
      if (offered(session, CARD)) {
        const replacement = choose(session, CARD)
        if (replacement.interaction.stateId !== 'wait' || replacement.interaction.request.kind !== 'farm-select'
          || replacement.interaction.request.farm.farmType !== 'fence') choose(session, 'actions.fencing.name')
        const second = session.commitSelectionChoice(0, { edges: ['H-2-3', 'H-3-3', 'V-2-3'], palisadeEdges: [] })
        assert.equal(second.ok, true, second.error)
      }
      const second = session.getState()
      if (second.state.players[0]!.fenceSegments.length > 4) assert.deepEqual(totals(second), { wood: 1, grain: 1, food: 0, fences: 7 })
      assertRuleOutcome(second.state.players[0]!.fenceSegments.length > 4, false)
    })
    it('N3 insufficient wood rejects a seven-edge fence and permits a legal sow retry', () => {
      const session = setup(4)
      assert.equal(session.takeAction(0, 'grain-utilization').ok, true)
      choose(session, CARD)
      choose(session, 'ui.interactionAgrarianFencesSowAndFence')
      choose(session, 'actions.fencing.name')
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { edges: [...EDGES, 'H-2-3', 'H-3-3', 'V-2-3'], palisadeEdges: [] }))
      const undo = session.undoAction()
      assert.equal(undo.ok, true, undo.error)
      assert.deepEqual(totals(undo), { wood: 4, grain: 2, food: 0, fences: 0 })
      assert.equal(session.takeAction(0, 'grain-utilization').ok, true)
      choose(session, 'ui.interactionDoNotReplace')
      choose(session, 'actions.sow.name')
      const sown = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
      assert.equal(sown.ok, true, sown.error)
      assert.deepEqual(totals(sown), { wood: 4, grain: 1, food: 0, fences: 0 })
    })
  })
})
