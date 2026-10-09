import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'

import '../../shared/cards/A/A094_LazySowman'
import '../../shared/cards/C/C151_SowingDirector'

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
  player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('A094_LazySowman')
  }

  const opponentId = state.players[1]!.id
  const dayLaborer = state.actionSpaces.find((space) => space.id === 'day-laborer')
  const meetingPlace = state.actionSpaces.find((space) => space.id === 'meeting-place')
  if (!dayLaborer || !meetingPlace) throw new Error('required action space missing')
  dayLaborer.takenBy = opponentId
  meetingPlace.takenBy = options?.meetingPlaceOccupied === false ? [] : opponentId

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
    opponent.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
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
