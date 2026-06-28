import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { A028_ForestSchool } from '../../shared/cards/A/A028_ForestSchool'
import { findTravelingPlayersSpace } from '../../shared/cards/helpers/action-space-categories'

import '../../shared/cards/register-all'

const CARD_ID = 'D171_SeniorTeacher'
const B155_CARD_ID = 'B155_ArtTeacher'
const A028_CARD_ID = 'A028_ForestSchool'
const OWNER_INDEX = 0
const PAYER_INDEX = 1
const PLAYED_OCCUPATION = 'A123_FrameBuilder'
const NEXT_OCCUPATION = 'A153_PigOwner'

const findAfterPayListener = () => {
  const listener = getRegisteredCardListeners().find((entry) => entry.id === 'D171-senior-teacher-after-lessons-pay')
  if (!listener) throw new Error('D171 after-pay listener missing')
  return listener
}

const paidEvent = (resources: Record<string, number>) => ({
  type: 'resource.paid',
  resources,
  paymentFor: 'occupation',
  paymentSources: [{ from: { kind: 'player', playerId: 'p2' }, resources }],
})

const setup = (playerCount = 5) => {
  const session = new GameSession(42, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = PAYER_INDEX
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = []
    player.resources.food = 0
  })
  const owner = state.players[OWNER_INDEX]!
  owner.occupationPlayed = [CARD_ID]
  const payer = state.players[PAYER_INDEX]!
  payer.occupationPlayed = [PLAYED_OCCUPATION]
  payer.occupationHand = [NEXT_OCCUPATION]
  payer.resources.food = 3
  setWorkersAtHome(state, payer, 2)
  session.loadState(state)
  return session
}

const setTravelingPlayersFood = (session: GameSession, food: number) => {
  const state = session.getState().state
  const space = findTravelingPlayersSpace(state.actionSpaces)
  if (!space) throw new Error('traveling-players space missing')
  space.resources = { ...(space.resources ?? {}), food }
  session.loadState(state)
}

const playOccupation = (
  session: GameSession,
  playerIndex: number,
  spaceId: string,
  occupationId: string,
) => {
  let resp = session.takeAction(playerIndex, spaceId)
  expect(resp.ok).toBe(true)
  let guard = 8
  while (guard-- > 0 && resp.interaction.stateId === 'wait') {
    if (resp.interaction.request.kind !== 'choice') break
    const option = resp.interaction.options?.find((entry) => entry.value === occupationId)
      ?? resp.interaction.options?.find((entry) => entry.value !== '__skip__')
    if (!option) break
    resp = session.resolveChoice(playerIndex, option.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

describe('D171 Senior Teacher', () => {
  it('gives the owner exactly 1 food when another player pays food on Lessons', () => {
    const session = setup()

    const resp = playOccupation(session, PAYER_INDEX, 'lessons', NEXT_OCCUPATION)

    expect(resp.state.players[PAYER_INDEX]!.occupationPlayed).toContain(NEXT_OCCUPATION)
    expect(resp.state.players[PAYER_INDEX]!.resources.food).toBe(2)
    expect(resp.state.players[OWNER_INDEX]!.resources.food).toBe(1)
  })

  it('gives exactly 1 food even when another player pays 2 food on a Lessons variant', () => {
    const session = setup()

    const resp = playOccupation(session, PAYER_INDEX, 'lessons-56-2f', NEXT_OCCUPATION)

    expect(resp.state.players[PAYER_INDEX]!.resources.food).toBe(1)
    expect(resp.state.players[OWNER_INDEX]!.resources.food).toBe(1)
  })

  it('does not trigger from the owner paying on Lessons', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = OWNER_INDEX
    const owner = state.players[OWNER_INDEX]!
    owner.occupationPlayed = [CARD_ID, PLAYED_OCCUPATION]
    owner.occupationHand = [NEXT_OCCUPATION]
    owner.resources.food = 3
    setWorkersAtHome(state, owner, 2)
    session.loadState(state)

    const resp = playOccupation(session, OWNER_INDEX, 'lessons', NEXT_OCCUPATION)

    expect(resp.state.players[OWNER_INDEX]!.occupationPlayed).toContain(NEXT_OCCUPATION)
    expect(resp.state.players[OWNER_INDEX]!.resources.food).toBe(2)
  })

  it('does not trigger for non-Lessons occupation payments', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[OWNER_INDEX]!
    const payer = state.players[PAYER_INDEX]!

    const result = executeCardListener(findAfterPayListener(), {
      state,
      player: payer,
      space: { id: 'day-laborer' },
      actionId: 'pay',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [paidEvent({ food: 1 })],
    } as unknown as CardListenerContext, {
      ownerPlayerId: owner.id,
      ownerCardId: CARD_ID,
      ownerCardZone: 'played',
    })

    expect(result).toBeUndefined()
  })

  it('does not trigger when a Lessons occupation payment is replaced by non-food resources', () => {
    const session = setup()
    const state = session.getState().state
    const payer = state.players[PAYER_INDEX]!
    payer.minorPlayed = [A028_CARD_ID]
    payer.activeModifiers = [{ ...(A028_ForestSchool.impl.modifiers![0] ?? {}) }]
    payer.resources.food = 0
    payer.resources.wood = 1
    session.loadState(state)

    const resp = playOccupation(session, PAYER_INDEX, 'lessons', NEXT_OCCUPATION)

    expect(resp.state.players[PAYER_INDEX]!.occupationPlayed).toContain(NEXT_OCCUPATION)
    expect(resp.state.players[PAYER_INDEX]!.resources.wood).toBe(0)
    expect(resp.state.players[OWNER_INDEX]!.resources.food).toBe(0)
  })

  it('triggers when a card-provided payment resource consumes actual food', () => {
    const session = setup()
    let state = session.getState().state
    const payer = state.players[PAYER_INDEX]!
    payer.occupationPlayed = [B155_CARD_ID, PLAYED_OCCUPATION]
    payer.resources.food = 0
    session.loadState(state)
    setTravelingPlayersFood(session, 3)

    const resp = playOccupation(session, PAYER_INDEX, 'lessons', NEXT_OCCUPATION)
    state = resp.state
    const travelingPlayers = findTravelingPlayersSpace(state.actionSpaces)

    expect(state.players[PAYER_INDEX]!.occupationPlayed).toContain(NEXT_OCCUPATION)
    expect(state.players[PAYER_INDEX]!.resources.food).toBe(0)
    expect(travelingPlayers?.resources?.food).toBe(2)
    expect(state.players[OWNER_INDEX]!.resources.food).toBe(1)
  })
})
