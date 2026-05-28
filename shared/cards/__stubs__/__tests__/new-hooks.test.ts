import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../../../../server/game/authoritative-session'
import { registerStubCards, clearStubCards } from '../index'
import { requireActiveCardRegistry } from '../../active-registry'
import type { ActionFlow } from '../../../contract/types'
import { CARD_ID as BEFORE_RETURN_HOME_ID } from '../Stub_BeforeReturnHome'
import { CARD_ID as START_RETURN_HOME_ID } from '../Stub_StartReturnHome'
import { CARD_ID as AFTER_ROUND_END_ID } from '../Stub_AfterRoundEnd'
import { CARD_ID as START_HARVEST_ID } from '../Stub_StartHarvest'
import { CARD_ID as HARVEST_FIELD_ID } from '../Stub_HarvestFieldPhase'
import { CARD_ID as HARVEST_FEEDING_ID } from '../Stub_HarvestFeedingPhase'
import { CARD_ID as END_HARVEST_ID } from '../Stub_EndHarvest'
import { clearActionHooks } from '../../../actions/hooks'
import { markAllWorkersUsed } from '../../../domain/player'

const harvestRounds = [4, 7, 9, 11, 13, 14]

function makeSession(round: number, stubCardIds: string[]) {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = round
  const p0 = state.players[0]!
  for (const id of stubCardIds) {
    p0.minorPlayed.push(id)
  }
  state.players.forEach(p => markAllWorkersUsed(state, p))
  session.loadState(state)
  return { session, state }
}

const optionalGainFlow = (cardId: string): ActionFlow => ({
  type: 'xor',
  children: [
    { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: cardId },
    { type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: cardId },
  ],
})

function registerHarvestFieldFlowCards(
  hook: 'onStartHarvestFieldPhase' | 'onHarvestFieldPhase' | 'onEndHarvestFieldPhase',
) {
  const registry = requireActiveCardRegistry('registerHarvestFieldFlowCards')
  const cardIds = [`Stub_${hook}_A`, `Stub_${hook}_B`]
  for (const id of cardIds) {
    registry.setEffect({
      id,
      [hook]: () => optionalGainFlow(id),
    })
  }
  return cardIds
}

const firstChildSourceCard = (flow: ActionFlow) =>
  flow.type === 'leaf' ? flow.sourceCard : flow.children[0]?.sourceCard

function resolveSourceCardChoice(
  session: GameSession,
  resp: ReturnType<GameSession['performRoundEnd']>,
  sourceCard: string,
) {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.options?.find((o) => o.sourceCard === sourceCard && o.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

describe('New hook stubs - ReturnHome sub-phases', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('onBeforeReturnHome fires before workers return', () => {
    const { session } = makeSession(1, [BEFORE_RETURN_HOME_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    expect(p0.cardStates?.[BEFORE_RETURN_HOME_ID]?.counters?.observedCount).toBe(1)
  })

  it('onStartReturnHome fires during return home', () => {
    const { session } = makeSession(1, [START_RETURN_HOME_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    expect(p0.cardStates?.[START_RETURN_HOME_ID]?.counters?.observedCount).toBe(1)
  })

  it('both ReturnHome sub-phases fire in correct order', () => {
    const { session } = makeSession(1, [BEFORE_RETURN_HOME_ID, START_RETURN_HOME_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    expect(p0.cardStates?.[BEFORE_RETURN_HOME_ID]?.counters?.observedCount).toBe(1)
    expect(p0.cardStates?.[START_RETURN_HOME_ID]?.counters?.observedCount).toBe(1)
  })
})

describe('New hook stubs - AfterRoundEnd', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('onAfterRoundEnd fires after round end', () => {
    const { session } = makeSession(1, [AFTER_ROUND_END_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    expect(p0.cardStates?.[AFTER_ROUND_END_ID]?.counters?.observedCount).toBe(1)
  })
})

describe('New hook stubs - Harvest sub-phases', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('onStartHarvest fires at harvest start', () => {
    const { session } = makeSession(4, [START_HARVEST_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    expect(p0.cardStates?.[START_HARVEST_ID]?.counters?.observedCount).toBe(1)
  })

  it('HarvestFieldPhase hooks all fire during field phase', () => {
    const { session } = makeSession(4, [HARVEST_FIELD_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    const counters = p0.cardStates?.[HARVEST_FIELD_ID]?.counters
    expect(counters?.startFieldCount).toBe(1)
    expect(counters?.duringFieldCount).toBe(1)
    expect(counters?.endFieldCount).toBe(1)
  })

  it.each([
    'onStartHarvestFieldPhase',
    'onHarvestFieldPhase',
    'onEndHarvestFieldPhase',
  ] as const)('%s card flows are collected into one stage parallel flow', (hook) => {
    const cardIds = registerHarvestFieldFlowCards(hook)
    const { session } = makeSession(4, cardIds)
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    const frame = session.getEngineStack().toCursor().frames.at(-1)
    const source = frame?.source
    expect(source?.kind).toBe('flow')
    if (source?.kind !== 'flow') return
    expect(source.flow.type).toBe('parallel')
    if (source.flow.type !== 'parallel') return
    expect(source.flow.mode).toBe('trigger-select')
    expect(source.flow.children.map(firstChildSourceCard)).toEqual(cardIds)
  })

  it('harvest field parallel choices are prompted to each owning player', () => {
    const hook = 'onStartHarvestFieldPhase'
    const cardIds = registerHarvestFieldFlowCards(hook)
    const { session, state } = makeSession(4, [])
    const p0 = state.players[0]!
    const p1 = state.players[1]!
    p0.minorPlayed.push(cardIds[0]!)
    p1.minorPlayed.push(cardIds[1]!)
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.options?.filter((option) => option.value !== '__pass__').map((option) => option.sourceCard)).toEqual([cardIds[0]])

    const frame = session.getEngineStack().toCursor().frames.at(-1)
    const source = frame?.source
    expect(source?.kind).toBe('flow')
    if (source?.kind !== 'flow') return
    expect(source.flow.type).toBe('parallel')
    if (source.flow.type !== 'parallel') return
    expect(source.flow.children.map((child) => child.targetPlayerId)).toEqual([p0.id])

    let p1Resp = resolveSourceCardChoice(session, resp, cardIds[0]!)
    p1Resp = resolveSourceCardChoice(session, p1Resp, cardIds[0]!)
    expect(p1Resp.interaction.stateId).toBe('wait')
    if (p1Resp.interaction.stateId !== 'wait') return
    expect(p1Resp.interaction.playerIndex).toBe(1)
    expect(p1Resp.interaction.options?.filter((option) => option.value !== '__pass__').map((option) => option.sourceCard)).toEqual([cardIds[1]])
  })

  it('harvest field parallel choices resume the stage once after out-of-order resolution', () => {
    const hook = 'onStartHarvestFieldPhase'
    const cardIds = registerHarvestFieldFlowCards(hook)
    const { session, state } = makeSession(4, cardIds)
    state.players.forEach((player) => {
      player.resources.food = 20
    })
    session.loadState(state)

    let resp = session.performRoundEnd()
    resp = resolveSourceCardChoice(session, resp, cardIds[1]!)
    resp = resolveSourceCardChoice(session, resp, cardIds[1]!)
    resp = resolveSourceCardChoice(session, resp, cardIds[0]!)
    resp = resolveSourceCardChoice(session, resp, cardIds[0]!)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.roundPhase).not.toBe('field')
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(session.getEngineStack().toCursor().frames.some((frame) =>
      frame.stageResume?.hook === hook,
    )).toBe(false)
  })

  it('HarvestFeedingPhase hooks all fire during feeding phase', () => {
    const { session } = makeSession(4, [HARVEST_FEEDING_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    const counters = p0.cardStates?.[HARVEST_FEEDING_ID]?.counters
    expect(counters?.startFeedCount).toBe(1)
    expect(counters?.duringFeedCount).toBe(1)
    expect(counters?.endFeedCount).toBe(1)
  })

  it('onEndHarvest fires after breeding before afterHarvest', () => {
    const { session } = makeSession(4, [END_HARVEST_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    expect(p0.cardStates?.[END_HARVEST_ID]?.counters?.observedCount).toBe(1)
  })

  it('all harvest hooks fire on non-harvest round (none fire)', () => {
    const { session } = makeSession(2, [START_HARVEST_ID, HARVEST_FIELD_ID, HARVEST_FEEDING_ID, END_HARVEST_ID])
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    expect(p0.cardStates?.[START_HARVEST_ID]?.counters?.observedCount).toBeUndefined()
    expect(p0.cardStates?.[HARVEST_FIELD_ID]?.counters?.startFieldCount).toBeUndefined()
    expect(p0.cardStates?.[HARVEST_FEEDING_ID]?.counters?.startFeedCount).toBeUndefined()
    expect(p0.cardStates?.[END_HARVEST_ID]?.counters?.observedCount).toBeUndefined()
  })
})
