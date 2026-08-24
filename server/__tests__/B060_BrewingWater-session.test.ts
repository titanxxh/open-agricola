import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'B060_BrewingWater'

const setup = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.minorPlayed.push(CARD_ID)
  state.players[0]!.resources.grain = 1
  state.actionSpaces.find((space) => space.id === 'fishing')!.takenBy = []
  session.loadState(state)
  return session
}

const futureEntries = (session: GameSession) =>
  session.getState().state.futureMeeples.filter((entry) => entry.cardId === CARD_ID)

describe('B060 Brewing Water session', () => {
  it('does not queue future food when the optional payment is skipped', () => {
    const session = setup()
    let resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.pendingFutureMeeples).toEqual([])
    expect(futureEntries(session)).toEqual([])
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.pendingFutureMeeples).toEqual([])
    expect(futureEntries(session)).toEqual([])
  })

  it('queues six rounds of food only after the payment is accepted', () => {
    const session = setup()
    let resp = session.takeAction(0, 'fishing')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
      const payment = resp.interaction.request.options?.[0]
      expect(payment).toBeDefined()
      resp = session.resolveChoice(0, payment!.value)
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(futureEntries(session)).toHaveLength(6)
    expect(futureEntries(session).map((entry) => entry.round)).toEqual([5, 6, 7, 8, 9, 10])
  })
})
