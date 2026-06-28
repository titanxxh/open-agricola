import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A028_ForestSchool as A28Card } from '../../shared/cards/A/A028_ForestSchool'

import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import '../../shared/cards/A/A028_ForestSchool'
import '../../shared/cards/A/A123_FrameBuilder'

const setup = (withForestSchool: boolean, options?: { playerCount?: number; spaceId?: string }) => {
  const playerCount = options?.playerCount ?? 2
  const spaceId = options?.spaceId ?? 'lessons'
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.players = state.players.slice(0, playerCount)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: withForestSchool ? (spaceId === 'lessons-3' ? 2 : 1) : 0,
    food: 0,
  }
  player.occupationHand = ['A123_FrameBuilder']
  player.occupationPlayed = ['D152_Patron']

  if (withForestSchool) {
    player.minorPlayed.push('A028_ForestSchool')
    player.activeModifiers.push({ ...(A28Card.impl.modifiers![0] ?? {}) })
  }

  const lessons = state.actionSpaces.find((space) => space.id === spaceId)
  if (!lessons) throw new Error(`${spaceId} space missing`)
  lessons.takenBy = state.players[1]!.id

  session.loadState(state)
  return session
}

describe('A028_ForestSchool session', () => {
  it('makes occupied lessons available only when the card is played', () => {
    const withCard = setup(true).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.interaction.stateId).toBe('idle')
    expect(withCard.actionAvailability?.lessons).toBe(true)

    const withoutCardSession = setup(false)
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.lessons).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'lessons')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('makes occupied lessons-3 available in a 3-player game', () => {
    const withCard = setup(true, { playerCount: 3, spaceId: 'lessons-3' }).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.interaction.stateId).toBe('idle')
    expect(withCard.actionAvailability?.['lessons-3']).toBe(true)

    const withoutCardSession = setup(false, { playerCount: 3, spaceId: 'lessons-3' })
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.['lessons-3']).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'lessons-3')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('surfaces a payment choice for the wood→food trade and honours it', () => {
    const session = setup(true)

    // D152_Patron triggers `before` on occupation and grants +2 food.
    // After that hook the player holds {food: 2, wood: 1} and the lessons
    // cost (1 food) is payable two distinct ways: directly via 1 food, or
    // via A28 ForestSchool's wood→food trade (1 wood, 0 food). The pay
    // leaf must surface `prompt.selectPayment` instead of auto-picking.
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(2)

    const tradeOption = resp.interaction.options?.find((option) => {
      const params = option.labelParams as Record<string, unknown> | undefined
      const paid = params?.resourcesPaid as Record<string, number> | undefined
      return !!paid && (paid.wood ?? 0) === 1 && !paid.food
    })
    expect(tradeOption).toBeDefined()

    resp = session.resolveChoice(0, tradeOption!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    // D152 granted 2 food; A28 trade burned the wood instead of any food.
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationHand).not.toContain('A123_FrameBuilder')
    expect(resp.state.actionSpaces.find((space) => space.id === 'lessons')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('auto-pays when only one payment solution is affordable', () => {
    // Strip A28 ForestSchool so the wood→food trade modifier never activates.
    // Player still receives D152 Patron's +2 food, but the only viable
    // payment path is direct food — the pay leaf should auto-resolve and
    // never surface a selectPayment prompt.
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, wood: 0, food: 0 }
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = ['D152_Patron']
    const lessons = state.actionSpaces.find((space) => space.id === 'lessons')
    if (!lessons) throw new Error('lessons space missing')
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    // D152 granted 2 food; lessons cost (1 food) was auto-paid without
    // surfacing a selectPayment prompt — net food: 2 - 1 = 1.
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
  })
})
