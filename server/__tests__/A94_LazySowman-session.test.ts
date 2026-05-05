import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome, workersAvailable } from '../../shared/game/player'

import '../../shared/cards/A/A94_LazySowman'

const CARD_ID = 'A94_LazySowman'

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  workersAvailable?: number
  actionId?: string
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = options?.actionId ?? 'grain-utilization'

  const player = state.players[0]!
  setWorkersAtHome(state, player, options?.workersAvailable ?? 2)
  player.resources.grain = options?.grain ?? 0
  player.resources.vegetable = options?.vegetable ?? 0
  player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('A94_LazySowman')
  }

  const opponentId = state.players[1]!.id
  const dayLaborer = state.actionSpaces.find((space) => space.id === 'day-laborer')
  const meetingPlace = state.actionSpaces.find((space) => space.id === 'meeting-place')
  if (!dayLaborer || !meetingPlace) throw new Error('required action space missing')
  dayLaborer.takenBy = opponentId
  meetingPlace.takenBy = opponentId

  session.loadState(state)
  return session
}

describe('A94_LazySowman session', () => {
  it('turns unavailable sow into an immediate extra place-farmer flow', () => {
    const session = setup({ withCard: true })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionPlaceFarmerExtra')
    expect(resp.interaction.options?.map((option) => option.value)).toContain('allow-occupied:day-laborer')
    expect(resp.interaction.options?.map((option) => option.value)).not.toContain('allow-occupied:meeting-place')
    expect(resp.interaction.options?.find((option) => option.value === 'allow-occupied:day-laborer')?.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, 'allow-occupied:day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('does not trigger the extra placement when no worker remains after taking the action', () => {
    const session = setup({ withCard: true, workersAvailable: 1 })

    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(0)
    expect(resp.state.players[0]!.cardStates?.A94_LazySowman).toBeUndefined()
  })

  it('offers normal sow and replacement when sow can already be executed', () => {
    const session = setup({ withCard: true, grain: 1 })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.map((option) => option.labelKey)).toContain('actions.sow.name')
    expect(resp.interaction.options?.map((option) => option.labelKey)).toContain('ui.interactionUseCard')
    expect(resp.state.players[0]!.cardStates?.A94_LazySowman).toBeUndefined()

    const sowOption = resp.interaction.options?.find((option) => option.labelKey === 'actions.sow.name')
    expect(sowOption).toBeDefined()

    resp = session.resolveChoice(0, sowOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
    expect(resp.state.players[0]!.cardStates?.A94_LazySowman).toBeUndefined()
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
    expect(resp.interaction.options?.map((option) => option.labelKey)).toContain('ui.interactionActionOrReplace')
    const sowOption = resp.interaction.options?.find((option) => option.labelKey === 'ui.interactionActionOrReplace')
    expect(sowOption).toBeDefined()
    expect(sowOption?.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, sowOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
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
    expect(resp.interaction.options?.map((option) => option.labelKey)).toContain('ui.interactionActionOrReplace')
    const sowOption = resp.interaction.options?.find((option) => option.labelKey === 'ui.interactionActionOrReplace')
    expect(sowOption).toBeDefined()
    expect(sowOption?.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, sowOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.map((option) => option.labelKey)).toContain('actions.sow.name')
    expect(resp.interaction.options?.map((option) => option.labelKey)).toContain('ui.interactionUseCard')
  })
})
