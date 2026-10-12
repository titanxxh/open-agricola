import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { SessionResponse } from '../game/authoritative-session'
import '../../shared/cards/B/B069_PottersMarket'
import '../../shared/cards/D/D069_SmallGreenhouse'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
const createSession = (configure: NonNullable<Parameters<typeof createWorkSession>[0]>['configure']) => {
  const session = createWorkSession({ seed: 6069, configure: (state) => {
    for (const player of state.players) Object.assign(player.resources, { food: 20, wood: 20, clay: 20, reed: 20, stone: 20 })
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
const choices = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []
const finishRound = (session: ReturnType<typeof createWorkSession>, round?: number) => {
  const state = session.getState().state
  if (round !== undefined) state.round = round
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

describe('overlapping and paid future effects', () => {
  it("two Potter's Market activations receive two vegetables on each of the next two rounds", () => {
    const session = createSession((state) => {
      state.round = 5
      const player = state.players[0]!
      player.minorPlayed = ['B069_PottersMarket']
      player.resources.clay = 6
      player.resources.food = 24
      player.resources.vegetable = 0
    })
    for (let count = 0; count < 2; count++) {
      const response = session.takeAnytimeAction(0, 'B69-potters-market-anytime')
      expect(response.ok, response.error).toBe(true)
    }
    expect(session.getState().state.players[0]!.resources).toMatchObject({ clay: 0, food: 20, vegetable: 0 })
    const round6 = finishRound(session)
    expect(round6.state.round).toBe(6)
    expect(round6.state.players[0]!.resources.vegetable).toBe(2)
    const round7 = finishRound(session)
    expect(round7.state.round).toBe(7)
    expect(round7.state.players[0]!.resources.vegetable).toBe(4)
    expect(round7.state.futureMeeples.filter((entry) => entry.cardId === 'B069_PottersMarket')).toEqual([])
  })

  it.each(['accept', 'decline', 'unaffordable'] as const)('Small Greenhouse maturity: %s', (decision) => {
    const session = createSession((state) => {
      state.round = 5
      const player = state.players[0]!
      player.minorHand = ['D069_SmallGreenhouse']
      player.occupationPlayed = ['__test_placeholder__']
      player.resources.wood = 2
      player.resources.food = 20
      player.resources.vegetable = 0
    })
    let response = session.takeAction(0, 'meeting-place')
    const improvement = choices(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    if (!response.state.players[0]!.minorPlayed.includes('D069_SmallGreenhouse')) {
      expect(choices(response).map((option) => option.value)).toContain('D069_SmallGreenhouse')
      response = session.resolveChoice(0, 'D069_SmallGreenhouse')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('D069_SmallGreenhouse')
    const state = session.getState().state
    state.players[0]!.resources.food = decision === 'unaffordable' ? 0 : 3
    session.loadState(state)
    response = finishRound(session, 8)
    expect(response.state.round).toBe(9)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    if (decision !== 'unaffordable') {
      const selected = choices(response).find((option) => decision === 'decline'
        ? option.value === '__skip__' : option.value !== '__skip__')
      expect(selected).toBeDefined()
      if (!selected || response.interaction.stateId !== 'wait') throw new Error('Missing due offer')
      expect(response.interaction.playerIndex).toBe(0)
      response = session.resolveChoice(0, selected.value)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.players[0]!.resources).toMatchObject({
      food: decision === 'unaffordable' ? 0 : decision === 'accept' ? 2 : 3,
      vegetable: decision === 'accept' ? 1 : 0,
    })
    const afterPurchase = session.getState().state
    afterPurchase.players.forEach((player) => { player.resources.food = 30 })
    session.loadState(afterPurchase)
    const next = finishRound(session)
    expect(next.state.round).toBe(10)
    expect(next.state.players[0]!.resources.vegetable).toBe(decision === 'accept' ? 1 : 0)
  })
})
