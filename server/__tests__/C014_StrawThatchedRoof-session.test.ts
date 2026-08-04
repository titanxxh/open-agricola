import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { C014_StrawThatchedRoof } from '../../shared/cards/C/C014_StrawThatchedRoof'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'C014_StrawThatchedRoof'

const setup = (withCard: boolean) => {
  const session = new GameSession(1)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 6

  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
  }
  player.houseType = 'wood'
  player.rooms = 2
  player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
  player.supplyTokensConsumed = { ...player.supplyTokensConsumed, stable: 4 }
  setWorkersAtHome(state, player, 2)

  if (withCard) {
    player.minorPlayed = [CARD_ID]
    player.activeModifiers = [...(C014_StrawThatchedRoof.impl.modifiers ?? [])]
  }

  session.loadState(state)
  return session
}

const chooseConstructIfNeeded = (session: GameSession, resp: SessionResponse): SessionResponse => {
  if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'choice') return resp
  const construct = resp.interaction.request.options?.find(
    (option) => option.labelKey === 'actions.construct.name',
  )
  return construct ? session.resolveChoice(0, construct.value) : resp
}

const actionLog = (resp: SessionResponse, actionId: string) =>
  resp.state.log.find((entry) =>
    entry.key === 'log.actionDetail' &&
    typeof entry.params?.action === 'string' &&
    entry.params.action.includes(actionId),
  )

describe('C014 Straw-Thatched Roof session', () => {
  it('builds a wood room without reed', () => {
    const session = setup(true)
    session.state.players[0]!.resources.wood = 5
    session.loadState(session.state)

    let resp = chooseConstructIfNeeded(session, session.takeAction(0, 'farm-expansion'))
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    const room = resp.interaction.request.farm.selectableTiles[0]!

    resp = session.commitSelectionChoice(0, { rooms: [room] })

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).not.toBe('prompt.selectPayment')
    expect(resp.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0 } })
    const paid = resp.state.events.find(
      (event) => event.type === 'resource.paid' && event.paymentFor === 'construct',
    )
    expect(paid).toBeDefined()
    expect(paid?.type === 'resource.paid' ? paid.resources.reed ?? 0 : undefined).toBe(0)
    expect(actionLog(resp, 'construct')).toBeDefined()
    expect(resp.scores).toHaveLength(2)
  })

  it('renovates a two-room wood house without reed', () => {
    const session = setup(true)
    session.state.players[0]!.resources.clay = 2
    session.loadState(session.state)

    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      resp = session.resolveChoice(0, 'clay')
    }

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).not.toBe('prompt.selectPayment')
    expect(resp.state.players[0]).toMatchObject({ houseType: 'clay', resources: { clay: 0, reed: 0 } })
    const paid = resp.state.events.find(
      (event) => event.type === 'resource.paid' && event.paymentFor === 'renovation',
    )
    expect(paid).toBeDefined()
    expect(paid?.type === 'resource.paid' ? paid.resources.reed ?? 0 : undefined).toBe(0)
    expect(actionLog(resp, 'renovate-house')).toBeDefined()
    expect(resp.scores).toHaveLength(2)
  })

  it('keeps construct and renovation unavailable without the card', () => {
    const constructSession = setup(false)
    constructSession.state.players[0]!.resources.wood = 5
    constructSession.loadState(constructSession.state)
    const constructBefore = constructSession.getState()

    const construct = constructSession.takeAction(0, 'farm-expansion')

    expect(construct.ok).toBe(true)
    expect(construct.interaction.stateId).toBe('wait')
    if (construct.interaction.stateId !== 'wait') return
    expect(construct.interaction.request.kind).toBe('confirm-next-player')
    expect(construct.state.players[0]!.rooms).toBe(2)
    expect(actionLog(construct, 'construct')).toBeUndefined()
    expect(construct.state.events.some(
      (event) => event.type === 'resource.paid' && event.paymentFor === 'construct',
    )).toBe(false)
    expect(construct.scores).toEqual(constructBefore.scores)

    const renovationSession = setup(false)
    renovationSession.state.players[0]!.resources.clay = 2
    renovationSession.loadState(renovationSession.state)
    const renovationBefore = renovationSession.getState()

    const renovation = renovationSession.takeAction(0, 'house-redevelopment')

    expect(renovation.ok).toBe(true)
    expect(renovation.interaction.stateId).toBe('wait')
    if (renovation.interaction.stateId !== 'wait') return
    expect(renovation.interaction.request.kind).toBe('confirm-next-player')
    expect(renovation.state.players[0]!.houseType).toBe('wood')
    expect(actionLog(renovation, 'renovate-house')).toBeUndefined()
    expect(renovation.state.events.some(
      (event) => event.type === 'resource.paid' && event.paymentFor === 'renovation',
    )).toBe(false)
    expect(renovation.scores).toEqual(renovationBefore.scores)
  })
})
