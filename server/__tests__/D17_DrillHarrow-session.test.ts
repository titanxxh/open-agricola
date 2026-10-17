import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/D/D017_DrillHarrow'
import '../../shared/cards/D/D003_Furrows'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

const CARD_ID = 'D017_DrillHarrow'

const FURROWS = 'D003_Furrows'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, food = 3, grain = 0, field = false, hand,
}: {
  played?: boolean
  food?: number
  grain?: number
  field?: boolean
  hand?: string[]
} = {}) => {
  const session = new GameSession(6017, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = hand ?? (played ? [FILLER] : [CARD_ID])
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.wood = played ? 0 : 1
  owner.resources.food = food
  owner.resources.grain = grain
  if (field) owner.fields = [{ row: 0, col: 2, stacks: [] }]
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession, cardId = CARD_ID, actionId = 'meeting-place') => {
  let response = session.takeAction(0, actionId)
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) =>
      option.value === cardId || option.value === `minor:${cardId}`)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const enterSow = (session: GameSession) => {
  let response = session.takeAction(0, 'grain-utilization')
  if (response.interaction.stateId === 'wait') {
    const sow = options(response).find((option) =>
      option.value === 'sow' || option.labelKey === 'actions.sow.name')
    if (sow) response = session.resolveChoice(response.interaction.playerIndex, sow.value)
  }
  return response
}

const chooseDrillHarrow = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  if (response.interaction.stateId !== 'wait') return response
  const accept = options(response).find((option) => option.value !== '__skip__')
  expect(accept, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

describe('D017 Drill Harrow parity', () => {
  it('D017 S1: paying one wood plays Drill Harrow', () => {
    const response = playMinor(setup({ played: false, food: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D017 S2: three food unlocks an otherwise unusable Sow and plows before sowing', () => {
    const session = setup({ grain: 1 })
    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)

    let response = chooseDrillHarrow(session, enterSow(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'farm-select') return
    const tile = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { tile })
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    response = session.commitSelectionChoice(0, { crops: [{ ...tile, crop: 'grain' }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0 })
    expect(response.state.players[0]!.fields).toContainEqual({
      ...tile, stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })

  it('D017 S3: the Drill Harrow plow may be declined and normal Sow continues', () => {
    const session = setup({ grain: 1, field: true })
    let response = resolveTriggerIfPresent(session, enterSow(session), CARD_ID)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    response = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, grain: 0 })
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('D017 S4: a conditional Sow from Furrows does not trigger Drill Harrow', () => {
    const session = setup({ grain: 1, field: true, hand: [FURROWS] })
    let response = playMinor(session, FURROWS, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    response = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })

    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[1]!.minorHand).toContain(FURROWS)
  })

  it('D017 S5: OA keeps otherwise unusable Sow unavailable with fewer than three food', () => {
    const session = setup({ food: 2 })
    const before = session.getState()

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const response = session.takeAction(0, 'grain-utilization')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.fields).toEqual([])
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, choose, offer, take, hand, buy, noSource, plow, accept, sow, minorSetup } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D017 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'D017_DrillHarrow', s = minorSetup(card, 1, 0, 20)
    s.state.players[0]!.resources.reed = 0
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 20)
    save('D017-N1-legal', r)
    {
      const t = minorSetup(card, 0, 0, 20, 14)
      t.state.players[0]!.resources.reed = 0
      t.loadState(t.state)
      let q = take(t, 'meeting-place')
      const branch = options(q).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        q = ok(t.resolveChoice(actor(q), branch.value))
      assert.ok(!options(q).some(o => o.value === card && !o.disabled), JSON.stringify(q.interaction))
      if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice')
        assertRejectedUnchanged(t, () => t.resolveChoice(actor(q), card))
      assert.ok(q.state.players[0]!.minorHand.includes(card))
      save('D017-N1-resource', q)
    }
  })
  it('D017 N2 before unconditional Sow exact food payment creates a field and normal grain stack', () => {
    const card = 'D017_DrillHarrow', s = setup(card, 14, st => Object.assign(st.players[0]!.resources, { food: 3, grain: 1 }))
    let r = take(s, 'grain-utilization')
    if (options(r).some(o => o.labelKey === 'actions.sow.name' || o.value === 'sow'))
      r = choose(s, r, o => o.labelKey === 'actions.sow.name' || o.value === 'sow')
    r = plow(s, accept(s, r, card))
    const f = r.state.players[0]!.fields[0]!
    r = sow(s, r, [{ ...f, crop: 'grain' }])
    assert.equal(r.state.players[0]!.resources.food, 0)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }])
    save('D017-N2', r)
  })
  it('D017 N3 insufficient food force attempt and declined paid plow retain normal Sow', () => {
    for (const food of [2, 3]) {
      const card = 'D017_DrillHarrow', s = setup(card, 14, st => { st.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; Object.assign(st.players[0]!.resources, { food, grain: 1 }); })
      let r = take(s, 'grain-utilization')
      if (options(r).some(o => o.labelKey === 'actions.sow.name' || o.value === 'sow'))
        r = choose(s, r, o => o.labelKey === 'actions.sow.name' || o.value === 'sow')
      r = offer(s, r, card)
      if (food === 2) {
        noSource(r, card)
        assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), 'flow-8'))
      }
      else
        r = choose(s, r, o => o.value === '__skip__')
      r = sow(s, r, [{ row: 0, col: 2, crop: 'grain' }])
      assert.equal(r.state.players[0]!.resources.food, food)
      assert.equal(r.state.players[0]!.fields.length, 1)
      assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }])
      save(`D017-N3-${food}`, r)
    }
  })
  it('D017 N4 conditional Furrows Sow and hand-only card cannot charge Drill Harrow food', () => {
    const card = 'D017_DrillHarrow', s = setup(card, 14, st => { st.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; st.players[0]!.resources.grain = 1; st.players[0]!.minorHand = ['D003_Furrows']; })
    let r = take(s, 'major-improvement')
    if (r.state.players[0]!.minorHand.includes('D003_Furrows')) {
      if (!options(r).some(o => o.value === 'D003_Furrows'))
        r = choose(s, r, o => o.value.startsWith('action-improvement-') || o.labelKey === 'actions.improvement.name')
      r = choose(s, r, o => o.value === 'D003_Furrows')
    }
    noSource(r, card)
    r = sow(s, r, [{ row: 0, col: 2, crop: 'grain' }])
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.state.players[0]!.fields.length, 1)
    assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }])
    save('D017-N4-furrows', r)
    const t = setup(card, 14, st => { hand(st, card); st.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; st.players[0]!.resources.grain = 1; })
    r = take(t, 'grain-utilization')
    noSource(r, card)
    r = sow(t, r, [{ row: 0, col: 2, crop: 'grain' }])
    assert.equal(r.state.players[0]!.resources.food, 20)
    save('D017-N4-hand', r)
  })
})
