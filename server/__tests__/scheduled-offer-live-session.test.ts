import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { readScheduledOffers, writeScheduledOffers } from '../../shared/actions/effects/internal/scheduled-offers'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const GREENHOUSE = 'D069_SmallGreenhouse'
const OFFER_ID = 'greenhouse-round-7'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// A due purchase is a fixed StartOfTurn source. Its food cost is checked from
// live resources; opening the choice or rejecting a command cannot consume it.
const prepare = (food: number, grain: number) => {
  const session = createWorkSession({
    seed: 4242,
    configure(state) {
      state.round = 6
      for (const player of state.players) markAllWorkersUsed(state, player)
      const owner = state.players[0]!
      owner.minorPlayed = [GREENHOUSE]
      owner.resources.food = food
      owner.resources.grain = grain
      writeScheduledOffers(owner, GREENHOUSE, [{
        id: OFFER_ID, kind: 'resource-purchase', dueRound: 7,
        resources: { vegetable: 1 }, cost: { food: 1 }, consumed: false,
      }])
    },
  })
  sessions.push(session)
  return session
}

const choose = (session: GameSession, response: SessionResponse, value: string) => {
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a preparation choice')
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

const openPurchase = (session: GameSession, response: SessionResponse): SessionResponse => {
  for (let step = 0; step < 3; step++) {
    if (response.interaction.stateId !== 'wait' || !('options' in response.interaction.request)) {
      throw new Error('Expected the retained Greenhouse purchase source')
    }
    const options = response.interaction.request.options ?? []
    if (options.some(option => option.value === `purchase:${OFFER_ID}`)) return response
    const source = options.find(option => option.value === GREENHOUSE && !option.disabled)
      ?? options.find(option => option.sourceCard === GREENHOUSE && !option.disabled && option.value !== '__skip__')
    expect(source, JSON.stringify(response.interaction)).toBeDefined()
    if (!source) throw new Error('The due Greenhouse source disappeared')
    response = choose(session, response, source.value)
  }
  throw new Error('The scheduled purchase choice did not open')
}

describe('live scheduled purchase offers', () => {
  it('exchanges grain before buying and restores an unconsumed pending offer after invalid commands', () => {
    const session = prepare(0, 1)
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(7)
    expect(response.state.roundPhase).toBe('preparation')
    expect(readScheduledOffers(response.state.players[0]!, GREENHOUSE)[0]?.consumed).toBe(false)
    if (response.interaction.stateId !== 'wait' || !('options' in response.interaction.request)) {
      throw new Error('Expected exchange before the scheduled purchase')
    }
    const exchange = response.interaction.request.options?.find(option => option.labelKey === 'actions.exchange.name')
    expect(exchange, JSON.stringify(response.interaction)).toBeDefined()
    if (!exchange) throw new Error('The purchase window did not allow conversion')
    response = choose(session, response, exchange.value)
    if (response.interaction.stateId !== 'wait' || !('options' in response.interaction.request)) {
      throw new Error('Expected a grain-to-food conversion')
    }
    const grain = response.interaction.request.options?.find(option => option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesPaid?.grain === 1 && option.effectPreview.resourcesGained?.food === 1)
    expect(grain).toBeDefined()
    if (!grain) throw new Error('No legal grain conversion was offered')
    response = choose(session, response, grain.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 0, vegetable: 0 })
    response = openPurchase(session, response)
    expect(readScheduledOffers(response.state.players[0]!, GREENHOUSE)[0]?.consumed).toBe(false)
    const wrongActor = session.resolveChoice(1, `purchase:${OFFER_ID}`)
    expect(wrongActor.ok).toBe(false)
    const invalidOffer = session.resolveChoice(0, 'purchase:another-offer')
    expect(invalidOffer.ok).toBe(false)
    expect(readScheduledOffers(invalidOffer.state.players[0]!, GREENHOUSE)[0]?.consumed).toBe(false)
    expect(invalidOffer.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 0 })

    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    response = choose(restored, restored.getState(), `purchase:${OFFER_ID}`)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0, vegetable: 1 })
    expect(readScheduledOffers(response.state.players[0]!, GREENHOUSE)[0]).toMatchObject({ consumed: true, consumedRound: 7 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === GREENHOUSE)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.reason === 'receive' && event.sourceCardId === GREENHOUSE)).toHaveLength(1)
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId).toBe('idle')
  })

  it('consumes a declined purchase without paying or receiving its good', () => {
    const session = prepare(1, 0)
    let response = openPurchase(session, session.performRoundEnd())
    expect(readScheduledOffers(response.state.players[0]!, GREENHOUSE)[0]?.consumed).toBe(false)
    response = choose(session, response, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 0 })
    expect(readScheduledOffers(response.state.players[0]!, GREENHOUSE)[0]).toMatchObject({ consumed: true, consumedRound: 7 })
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.sourceCardId === GREENHOUSE)).toBe(false)
    expect(response.state.roundPhase).toBe('work')
  })

  it('expires an unavailable due purchase when the preparation window closes', () => {
    const session = prepare(0, 0)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(7)
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId).toBe('idle')
    expect(readScheduledOffers(response.state.players[0]!, GREENHOUSE)[0]).toMatchObject({ consumed: true, consumedRound: 7 })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 0 })
  })
})
