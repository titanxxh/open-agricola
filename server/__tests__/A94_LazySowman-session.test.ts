import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'

import '../../shared/cards/A/A094_LazySowman'
import '../../shared/cards/C/C151_SowingDirector'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit12Replacement from './_helpers/audit/ae-negative-12-replacement'

const CARD_ID = 'A094_LazySowman'

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  workersAvailable?: number
  actionId?: string
  meetingPlaceOccupied?: boolean
}) => {
  const session = new GameSession(42, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = options?.actionId ?? 'grain-utilization'

  const player = state.players[0]!
  setWorkersAtHome(state, player, options?.workersAvailable ?? 2)
  player.resources.grain = options?.grain ?? 0
  player.resources.vegetable = options?.vegetable ?? 0
  player.fields = [{ row: 0, col: 0, stacks: [] }]

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('A094_LazySowman')
  }

  const opponentId = state.players[1]!.id
  const dayLaborer = state.actionSpaces.find((space) => space.id === 'day-laborer')
  const meetingPlace = state.actionSpaces.find((space) => space.id === 'meeting-place')
  if (!dayLaborer || !meetingPlace) throw new Error('required action space missing')
  dayLaborer.takenBy = [{ playerId: opponentId, workerId: '1' }]
  meetingPlace.takenBy = options?.meetingPlaceOccupied === false ? [] : [{ playerId: opponentId, workerId: '2' }]

  session.loadState(state)
  return session
}

const acceptReplacement = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.promptKey).toBe('ui.interactionSelectReplacement')
  const replacement = response.interaction.request.options!.find((option) => option.sourceCard === CARD_ID)!
  let selected = session.resolveChoice(0, replacement.value)
  expect(selected.interaction.request.options!.some((option) => option.value === '__skip__')).toBe(true)
  const place = selected.interaction.request.options!.find((option) => option.value !== '__skip__')!
  selected = session.resolveChoice(0, place.value)
  return selected
}

describe('A094_LazySowman session', () => {
  it('turns unavailable sow into an immediate extra place-farmer flow', () => {
    const session = setup({ withCard: true, meetingPlaceOccupied: false })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    resp = acceptReplacement(session, resp)
    expect(resp.interaction.promptKey).toBe('ui.interactionPlaceFarmerExtra')
    expect(resp.interaction.request.options?.map((option) => option.value)).toContain('allow-occupied:day-laborer')
    expect(resp.interaction.request.options?.map((option) => option.value)).not.toContain('meeting-place')
    expect(resp.interaction.request.options?.map((option) => option.value)).not.toContain('allow-occupied:meeting-place')
    expect(resp.interaction.request.options?.find((option) => option.value === 'allow-occupied:day-laborer')?.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, 'allow-occupied:day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('blocks after placement when no worker remains for the replacement until undo', () => {
    const session = setup({ withCard: true, workersAvailable: 1 })

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)
    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    resp = session.undoAction(0)
    expect(resp.ok).toBe(true)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.players[0]!.cardStates?.A094_LazySowman).toBeUndefined()
  })

  it('offers normal sow and replacement when sow can already be executed', () => {
    const session = setup({ withCard: true, grain: 1 })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toContain('ui.interactionDoNotReplace')
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toContain('ui.interactionUseCard')
    expect(resp.state.players[0]!.cardStates?.A094_LazySowman).toBeUndefined()

    const sowOption = resp.interaction.request.options?.find((option) => option.labelKey === 'ui.interactionDoNotReplace')
    expect(sowOption).toBeDefined()

    resp = session.resolveChoice(0, sowOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
    expect(resp.state.players[0]!.cardStates?.A094_LazySowman).toBeUndefined()
    expect(resp.interaction?.stateId).toBe('wait')
  })

  it('still allows replacing sow on cultivation when sow prerequisites are not met', () => {
    const session = setup({ withCard: true, actionId: 'cultivation' })

    let resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBeUndefined()
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBeUndefined()
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toContain('ui.interactionActionOrReplace')
    const sowOption = resp.interaction.request.options?.find((option) => option.labelKey === 'ui.interactionActionOrReplace')
    expect(sowOption).toBeDefined()
    expect(sowOption?.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, sowOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    resp = acceptReplacement(session, resp)
    expect(resp.interaction.promptKey).toBe('ui.interactionPlaceFarmerExtra')
  })

  it('shows both sow and replacement after choosing cultivation -> sow when sow is executable', () => {
    const session = setup({ withCard: true, grain: 1, actionId: 'cultivation' })

    let resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBeUndefined()
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBeUndefined()
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toContain('ui.interactionActionOrReplace')
    const sowOption = resp.interaction.request.options?.find((option) => option.labelKey === 'ui.interactionActionOrReplace')
    expect(sowOption).toBeDefined()
    expect(sowOption?.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, sowOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toContain('ui.interactionDoNotReplace')
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toContain('ui.interactionUseCard')
  })

  it('does not replace a sow granted outside the owners turn', () => {
    const session = setup({ withCard: true })
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    state.currentPlayerIndex = 1
    owner.occupationPlayed.push('C151_SowingDirector')
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = []
    state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = []
    setWorkersAtHome(state, opponent, 1)
    opponent.resources.grain = 1
    opponent.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)

    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('farm-select')

    resp = session.commitSelectionChoice(1, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).not.toBe('ui.interactionPlaceFarmerExtra')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(2)
  })
})

describe('ae-negative-12-replacement', () => {
  const { LAZY, sessions, save, ok, setup, ready, turn, options, accept, replacement } = audit12Replacement
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A094 N1 declining unconditional Sow allows exactly one remaining person on occupied Day Laborer', () => {
    const fresh = setup(LAZY, state => state.currentPlayerIndex = 1); turn(fresh, 1, 'day-laborer')
    let response = accept(fresh, replacement(fresh, turn(fresh, 0, 'grain-utilization'), LAZY))
    assert.ok(options(response).some(o => o.value === 'allow-occupied:day-laborer')); assert.ok(options(response).every(o => !o.value.includes('meeting-place')))
    assertRejectedUnchanged(fresh, () => fresh.resolveChoice(0, 'allow-occupied:meeting-place')); assertRejectedUnchanged(fresh, () => fresh.resolveChoice(0, 'does-not-exist')); assertRejectedUnchanged(fresh, () => fresh.resolveChoice(1, 'allow-occupied:day-laborer'))
    response = ok(fresh.resolveChoice(0, 'allow-occupied:day-laborer')); assert.equal(workersAvailable(response.state, response.state.players[0]!), 0); assert.equal(response.state.players[0]!.resources.food, 42)
    assertRejectedUnchanged(fresh, () => fresh.resolveChoice(0, 'allow-occupied:day-laborer')); save('A094-N1', response)
  })
  it('A094 N2 normal Sow consumes grain and leaves extra worker at home', () => {
    const session = setup(LAZY, state => { state.players[0]!.resources.grain = 1; state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }] })
    let response = turn(session, 0, 'grain-utilization'); const sow = options(response).find(o => o.labelKey === 'ui.interactionDoNotReplace'); assert.ok(sow)
    response = ok(session.resolveChoice(0, sow.value)); response = ok(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
    assert.equal(response.state.players[0]!.resources.grain, 0); assert.equal(workersAvailable(response.state, response.state.players[0]!), 1); save('A094-N2', response)
  })
  it('A094 N3 no remaining worker cannot materialize another person', () => {
    const session = setup(LAZY); turn(session, 0, 'grain-seeds'); turn(session, 1, 'day-laborer'); ready(session, 0)
    const response = ok(session.takeAction(0, 'grain-utilization')); assert.equal(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '', 'engine-blocked'); assert.equal(workersAvailable(response.state, response.state.players[0]!), 0)
    const undone = ok(session.undoAction()); assert.equal(workersAvailable(undone.state, undone.state.players[0]!), 1); save('A094-N3', { response, undone, limitation: 'Admission allowed then current-step engine-blocked under ADR0015; no extra person exists' })
  })
  it('A094 N4 restricted Chief Forester Sow cannot be replaced by extra placement', () => {
    const session = setup(LAZY, state => { state.players[0]!.occupationPlayed.push('A115_ChiefForester'); state.players[0]!.resources.grain = 1; state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }] })
    let response = turn(session, 0, 'forest'); save('A094-N4-before-accept', response)
    assert.equal(options(response).some(o => o.sourceCard === LAZY), false)
    response = accept(session, response)
    assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select')
    response = ok(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
    assert.deepEqual({ workers: workersAvailable(response.state, response.state.players[0]!), grain: response.state.players[0]!.resources.grain, food: response.state.players[0]!.resources.food }, { workers: 1, grain: 0, food: 40 })
    assert.equal(response.state.players[0]!.resources.wood, 3); save('A094-N4', response)
  })
})
