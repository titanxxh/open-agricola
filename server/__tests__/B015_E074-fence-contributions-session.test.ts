import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { createWorkSession } from './_helpers/session-fixtures'
import { descriptionEffects } from './_helpers/choice-description'

const BENCH = 'B015_CarpentersBench'
const ASH = 'E074_AshTrees'
const STOCK = 'B094_StockProtector'
const square = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const sessions: ReturnType<typeof createWorkSession>[] = []

afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Fresh two-player work game, R14, both workers home, fixed placeholder hands,
// no occupied spaces, two planted fields and otherwise the starting farm.
// Session commands cover the before choice, farm selection and committed bill.
function setup(configure?: (state: GameState) => void) {
  const session = createWorkSession({ configure: state => {
    state.round = 14
    const player = state.players[0]!
    player.minorPlayed = [BENCH, ASH]
    player.resources.wood = 0
    player.cardStates[ASH] = { counters: { fences: 5 } }
    player.fields = [
      { row: 1, col: 3, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 2, col: 3, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    const forest = state.actionSpaces.find(space => space.id === 'forest')
    assert.ok(forest)
    forest.resources.wood = 3
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function choices(response: SessionResponse) {
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait')
  assert.equal(response.interaction.playerIndex, 0)
  assert.equal(response.interaction.request.kind, 'choice')
  return response.interaction.request.options
}

function acceptBench(session: ReturnType<typeof setup>, response: SessionResponse) {
  const option = choices(response).find(option => option.value !== '__skip__' && !option.disabled)
  assert.ok(option)
  return session.resolveChoice(0, option.value)
}

function selectAsh(session: ReturnType<typeof setup>, response: SessionResponse, amount: number) {
  const option = choices(response).find(option => descriptionEffects(option.descriptionPreview)
    .some(effect => effect.kind === 'fenceReserve' && effect.amount === amount))
  assert.ok(option && !option.disabled)
  return session.resolveChoice(0, option.value)
}

function restore(session: GameSession) {
  const restored = new GameSession(JSON.parse(JSON.stringify({ state: session.getState().state,
    sessionCursor: session.createSessionPrivateCursor() })))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  return restored
}

function finish(session: GameSession, response: SessionResponse) {
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait')
  assert.ok(response.interaction.request.kind === 'confirm-next-player')
  return session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
}

function choose(session: GameSession, response: SessionResponse, value: string) {
  assert.ok(response.interaction.stateId === 'wait')
  assert.ok(response.interaction.request.options.some(option => option.value === value && !option.disabled))
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  assert.equal(next.ok, true, next.error)
  return next
}

function beforeFencing(session: GameSession, response: SessionResponse, ashCount: number, stockFirst: boolean) {
  for (let step = 0; step < 6; step += 1) {
    assert.ok(response.interaction.stateId === 'wait')
    if (response.interaction.request.kind === 'farm-select') return response
    if (response.interaction.request.kind === 'select-trigger') {
      const priority = stockFirst ? [STOCK, ASH] : [ASH, STOCK]
      const source = priority.find(card => response.interaction.stateId === 'wait'
        && response.interaction.request.options.some(option => option.value === card && !option.disabled))
      assert.ok(source)
      response = choose(session, response, source)
    } else {
      response = selectAsh(session, response, ashCount)
    }
  }
  throw new Error('fencing did not reach farm selection')
}

describe('B015 / E074 fence contributions', () => {
  it('combines the Bench wood discount with one selected Ash fence', () => {
    const session = setup()
    let response = acceptBench(session, session.takeAction(0, 'forest'))
    response = selectAsh(session, response, 1)
    expect(response.ok).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0,
      request: { kind: 'farm-select', farm: { farmType: 'fence' } } })
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(5)

    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(4)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const player = response.state.players[0]!
    expect(readCardResourceStats(player, BENCH)?.saved.wood).toBe(1)
    expect(readCardResourceStats(player, ASH)?.saved.wood).toBe(1)
    expect(player.cardStates[BENCH]?.counters).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'farm.fenceConsumed'))
      .toMatchObject([{ count: 1, sourceCardId: ASH }])
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'fencing'))
      .toMatchObject([{ resources: { wood: 2 }, bonusSources: [ASH, BENCH] }])
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({
        detailParts: expect.objectContaining({ effects: { fencing: 4 } }),
      }) }),
    ]))
    expect(finish(session, response).ok).toBe(true)
  })

  it('does not turn the Bench discount into a sixteenth physical fence', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.fenceSegments = square.map(edge => ({ edge, type: 'fence' }))
      player.pastures = [{ id: 'existing', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 6
    })
    let response = acceptBench(session, session.takeAction(0, 'forest'))
    response = session.resolveChoice(0, '__skip__')
    const before = structuredClone(response.state.players[0])
    response = session.commitSelectionChoice(0, {
      edges: ['H-0-1', 'H-0-2', 'H-0-3', 'H-1-1', 'H-1-2', 'H-1-3', 'V-0-4'],
    })
    expect(response).toMatchObject({ ok: false, error: 'MAX_FENCES_EXCEEDED' })
    expect(response.state.players[0]).toEqual(before)
    response = session.commitSelectionChoice(0, { edges: ['H-0-1', 'H-1-1', 'V-0-2'] })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(7)
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(5)
  })

  it('admits a one-wood Bench action completed by two selected Ash fences', () => {
    const session = setup(state => {
      state.players[0]!.cardStates[ASH] = { counters: { fences: 2 } }
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 1
    })
    let response = acceptBench(session, session.takeAction(0, 'forest'))
    response = selectAsh(session, response, 2)
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('releases only the explicitly selected Ash entity when ordinary reserve is insufficient', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.fenceSegments = square.map(edge => ({ edge, type: 'fence' }))
      player.pastures = [{ id: 'existing', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 6
    })
    let response = acceptBench(session, session.takeAction(0, 'forest'))
    response = selectAsh(session, response, 1)
    response = session.commitSelectionChoice(0, {
      edges: ['H-0-1', 'H-0-2', 'H-0-3', 'H-1-1', 'H-1-2', 'H-1-3', 'V-0-4'],
    })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(11)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(4)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it.each([3, 4, 5])('consumes actual Ash entities when selecting %i for four new fences', count => {
    const session = setup()
    let response = acceptBench(session, session.takeAction(0, 'forest'))
    response = selectAsh(session, response, count)
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(count === 3 ? 2 : 1)
    expect(readCardResourceStats(response.state.players[0]!, BENCH)?.saved.wood ?? 0).toBe(count === 3 ? 1 : 0)
    expect(response.state.events.filter(event => event.type === 'farm.fenceConsumed'))
      .toMatchObject([{ sourceCardId: ASH, count: Math.min(count, 4) }])
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'fencing'))
      .toMatchObject([{ resources: {}, bonusSources: count === 3 ? [ASH, BENCH] : [ASH] }])
  })

  it('does not spend ordinary Ash entities on palisades', () => {
    const session = setup(state => {
      state.players[0]!.minorPlayed = [ASH, 'B030_WoodPalisades']
      state.players[0]!.resources.wood = 4
    })
    let response = selectAsh(session, session.takeAction(0, 'fencing'), 3)
    response = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'], palisadeEdges: ['H-0-0', 'V-0-0'],
    })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(3)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments.filter(segment => segment.type === 'palisade')).toHaveLength(2)
  })

  it('retains the collected-wood budget after invalid submissions and retry', () => {
    const session = setup(state => { state.players[0]!.resources.wood = 100 })
    let response = acceptBench(session, session.takeAction(0, 'forest'))
    response = selectAsh(session, response, 1)
    const before = structuredClone(response.state.players[0])
    for (const payload of [
      { cancel: true }, { edges: ['invalid'] },
      { edges: ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'] },
    ]) {
      response = session.commitSelectionChoice(0, payload)
      expect(response.ok).toBe(false)
      expect(response.state.players[0]).toEqual(before)
    }
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(101)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(4)
  })

  it.each(['ash-choice', 'farm-choice'])('restores %s and preserves undo and whole-action undo', stop => {
    let session = setup()
    let response = acceptBench(session, session.takeAction(0, 'forest'))
    if (stop === 'ash-choice') session = restore(session)
    response = selectAsh(session, session.getState(), 1)
    if (stop === 'farm-choice') session = restore(session)
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    response = session.undoStep()
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(5)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.events.filter(event => event.type === 'farm.fenceConsumed')).toHaveLength(1)
    response = session.undoAction()
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(5)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(response.state.actionSpaces.find(space => space.id === 'forest')?.resources.wood).toBe(3)
    response = acceptBench(session, session.takeAction(0, 'forest'))
    response = selectAsh(session, response, 1)
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('previews Ash payment sources and restores the payment choice without consuming twice', () => {
    let session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed = [ASH]
      player.resources.clay = 2
      player.resources.stone = 2
      player.activeModifiers = [
        { type: 'trade', cardId: 'Test_Fence_Clay', appliesTo: ['fencing'], from: { clay: 2 }, to: { wood: 2 }, max: 1 },
        { type: 'trade', cardId: 'Test_Fence_Stone', appliesTo: ['fencing'], from: { stone: 2 }, to: { wood: 2 }, max: 1 },
      ]
    })
    let response = selectAsh(session, session.takeAction(0, 'fencing'), 2)
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'prompt.selectPayment' })
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(5)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    const clayOption = choices(response).find(option => option.effectPreview?.kind === 'payment'
      && option.effectPreview.resourcesPaid.clay === 2)
    assert.ok(clayOption)
    expect(clayOption.labelParams?.sourceCards).toContain(ASH)
    session = restore(session)
    response = session.resolveChoice(0, clayOption.value)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 2, wood: 0 })
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(3)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'fencing'))
      .toMatchObject([{ resources: { clay: 2 }, bonusSources: expect.arrayContaining([ASH]) }])
    response = session.undoStep()
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(5)
    expect(response.state.players[0]!.resources.clay).toBe(2)
    response = session.resolveChoice(0, clayOption.value)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(3)
    expect(response.state.events.filter(event => event.type === 'farm.fenceConsumed')).toHaveLength(1)
    expect(finish(session, response).ok).toBe(true)
  })

  it.each(['bench-only', 'ash-only', 'skip-ash', 'skip-bench'])('keeps the %s control independent', mode => {
    const session = setup(state => {
      if (mode === 'bench-only') state.players[0]!.minorPlayed = [BENCH]
      if (mode === 'ash-only') state.players[0]!.minorPlayed = [ASH]
    })
    let response = session.takeAction(0, 'forest')
    if (mode === 'skip-bench') {
      response = choose(session, response, '__skip__')
      expect(response.state.players[0]!.resources.wood).toBe(3)
      expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
      expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(5)
      expect(finish(session, response).ok).toBe(true)
      return
    }
    if (mode === 'ash-only') {
      // Forest alone does not grant fencing without Bench. Use the ordinary
      // action on player 0's next turn with its own wood and supply plan.
      expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
      expect(finish(session, response).ok).toBe(true)
      response = session.takeAction(1, 'day-laborer')
      response = finish(session, response)
      response = selectAsh(session, session.takeAction(0, 'fencing'), 1)
    } else {
      response = acceptBench(session, response)
      if (mode === 'skip-ash') response = choose(session, response, '__skip__')
    }
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.events.filter(event => event.type === 'farm.fenceConsumed')).toHaveLength(mode === 'ash-only' ? 1 : 0)
  })

  it.each([false, true])('isolates nested fencing when Stock before/Ash after order is %s', stockFirst => {
    let session = setup(state => {
      state.players[0]!.occupationPlayed = [STOCK]
      state.players[0]!.resources.wood = 4
    })
    let response = beforeFencing(session, session.takeAction(0, 'fencing'), 2, stockFirst)
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(3)
    session = restore(session)
    response = session.getState()
    if (!stockFirst) response = choose(session, response, ASH)
    response = choose(session, response, STOCK)
    response = acceptBench(session, response)
    response = choose(session, response, 'forest')
    response = acceptBench(session, response)
    response = beforeFencing(session, response, 1, stockFirst)
    response = session.commitSelectionChoice(0, { edges: ['H-0-1', 'H-1-1', 'V-0-2'] })
    expect(response.ok).toBe(true)
    for (let step = 0; step < 6 && response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'select-trigger'; step += 1) {
      const ash = response.interaction.request.options.find(option => option.value === ASH && !option.disabled)
      response = choose(session, response, ash ? ASH : '__pass__')
    }
    expect(response.state.players[0]!.resources.wood).toBe(6)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(2)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(7)
    expect(response.state.events.filter(event => event.type === 'farm.fenceConsumed'))
      .toMatchObject([{ sourceCardId: ASH, count: 2 }, { sourceCardId: ASH, count: 1 }])
    expect(finish(session, response).ok).toBe(true)
  })

  it('preserves the host through an anytime and keeps repeated reads pure', () => {
    const session = setup(state => { state.players[0]!.occupationPlayed = ['D124_Emissary'] })
    let response = acceptBench(session, session.takeAction(0, 'forest'))
    response = selectAsh(session, response, 1)
    const snapshot = JSON.stringify({ state: response.state, cursor: session.createSessionPrivateCursor() })
    for (let read = 0; read < 3; read += 1) session.getState()
    expect(JSON.stringify({ state: session.getState().state, cursor: session.createSessionPrivateCursor() })).toBe(snapshot)
    response = session.takeAnytimeAction(0, 'D124-emissary-anytime')
    const wood = choices(response).find(option => descriptionEffects(option.descriptionPreview)
      .some(effect => (effect.kind === 'payment' || effect.kind === 'resourceExchange') && effect.resourcesPaid.wood === 1))
    assert.ok(wood)
    response = choose(session, response, wood.value)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(0, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 1 })
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(4)
  })

  it('does not lend player 0 contributions to player 1', () => {
    const session = setup(state => { state.players[1]!.resources.wood = 4 })
    let response = selectAsh(session, acceptBench(session, session.takeAction(0, 'forest')), 1)
    response = session.commitSelectionChoice(0, { edges: square })
    response = finish(session, response)
    response = session.takeAction(1, 'fencing')
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(1, { edges: square })
    expect(response.ok).toBe(true)
    expect(response.state.players[1]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates[ASH]?.counters?.fences).toBe(4)
    expect(response.state.events.filter(event => event.type === 'farm.fenceConsumed')).toHaveLength(1)
  })
})
