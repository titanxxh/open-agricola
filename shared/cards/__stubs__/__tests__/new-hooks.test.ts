import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../../../../server/game/authoritative-session'
import { registerStubCards, clearStubCards } from '../index'
import { CARD_ID as BEFORE_RETURN_HOME_ID } from '../Stub_BeforeReturnHome'
import { CARD_ID as START_RETURN_HOME_ID } from '../Stub_StartReturnHome'
import { CARD_ID as AFTER_ROUND_END_ID } from '../Stub_AfterRoundEnd'
import { CARD_ID as START_HARVEST_ID } from '../Stub_StartHarvest'
import { CARD_ID as HARVEST_FIELD_ID } from '../Stub_HarvestFieldPhase'
import { CARD_ID as HARVEST_FEEDING_ID } from '../Stub_HarvestFeedingPhase'
import { CARD_ID as END_HARVEST_ID } from '../Stub_EndHarvest'
import { clearActionHooks } from '../../../actions/hooks'
import { markAllWorkersUsed } from '../../../game/player'

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
