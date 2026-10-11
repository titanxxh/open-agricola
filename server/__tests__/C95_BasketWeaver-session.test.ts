import { afterEach, describe, expect, it } from 'vitest'
import { type GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD_ID = 'C095_BasketWeaver'
const BASKET = 'Major_Basket'
const FILLER = '__test_placeholder__'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
const setup = ({ reed = 1, stone = 1, basketAvailable = true, paid = false } = {}) => {
  const session = createWorkSession({ seed: 9707, configure: (state) => {
    const owner = state.players[0]!
    owner.occupationHand = [CARD_ID, FILLER]
    owner.occupationPlayed = paid ? ['A125_Priest'] : []
    Object.assign(owner.resources, { wood: 0, clay: 0, food: paid ? 1 : 0, reed, stone })
    state.availableMajorImprovements = basketAvailable ? [BASKET] : ['Major_Fireplace1']
    if (!basketAvailable) state.players[1]!.improvements = [BASKET]
  } })
  sessions.push(session)
  return session
}

const playBasketWeaver = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}

describe('C095 Basket Weaver parity', () => {
  it('C095 S1: with exactly one reed and one stone resolves the immediate Basket build', () => {
    const session = setup()
    const response = playBasketWeaver(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const events = response.state.events
    const occupation = events.find((event) => event.type === 'card.played' && event.cardId === CARD_ID)!
    const fee = events.find((event) => event.type === 'resource.paid' && event.sourceCardId === BASKET)!
    const basket = events.find((event) => event.type === 'card.played' && event.cardId === BASKET)!
    expect(fee.seq).toBeGreaterThan(occupation.seq)
    expect(basket.seq).toBeGreaterThan(fee.seq)
    const undone = session.undoAction()
    expect(undone.ok).toBe(true)
    expect(undone.state.players[0]!.occupationHand).toContain(CARD_ID)
    expect(undone.state.players[0]!.improvements).not.toContain(BASKET)
    expect(undone.state.availableMajorImprovements).toContain(BASKET)
    expect(undone.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
    expect(playBasketWeaver(session).state.players[0]!.improvements.filter((id) => id === BASKET)).toHaveLength(1)
  })

  it('C095 S2: with two reed and two stone resolves a selected Basket payment', () => {
    const session = setup({ reed: 2, stone: 2 })
    const response = playBasketWeaver(session)

    expect(response.state.players[0]!.improvements).toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
  })

  it('C095 S3: with one reed and no stone cannot pay for the immediate Basket build', () => {
    const session = setup({ reed: 1, stone: 0 })
    const response = playBasketWeaver(session)
    expect(response.interaction.request.options?.some((option) => option.value === CARD_ID)).not.toBe(true)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 0 })
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.value === BASKET) ?? false
      : false).toBe(false)
  })

  it('C095 S4: when Basketmakers Workshop is unavailable the immediate build cannot be completed', () => {
    const response = playBasketWeaver(setup({ basketAvailable: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'confirm-next-player' },
    })
  })

  it('C095 S5: an affordable immediate build cannot be declined', () => {
    const session = setup()
    const response = playBasketWeaver(session)
    expect(response.state.players[0]!.improvements).toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
    const rejected = session.resolveChoice(0, '__skip__')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.improvements).toContain(BASKET)
  })
  it('uses the post-occupation-payment state and pays for Basket only after occupation commitment', () => {
    const response = playBasketWeaver(setup({ paid: true }))
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, reed: 0, stone: 0 })
    expect(response.state.players[0]!.improvements).toEqual([BASKET])
    const events = response.state.events
    const occupationFee = events.find((event) => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)!
    const occupation = events.find((event) => event.type === 'card.played' && event.cardId === CARD_ID)!
    const basketFee = events.find((event) => event.type === 'resource.paid' && event.sourceCardId === BASKET)!
    expect(occupation.seq).toBeGreaterThan(occupationFee.seq)
    expect(basketFee.seq).toBeGreaterThan(occupation.seq)
  })

})
