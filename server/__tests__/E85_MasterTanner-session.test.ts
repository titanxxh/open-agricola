import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E85_MasterTanner'

describe('E85_MasterTanner session', () => {
  const CARD_ID = 'E85_MasterTanner'

  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    // Give player a Fireplace for cooking (boar->2food, cattle->3food)
    player.improvements.push('Major_Fireplace1')
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (id) => id !== 'Major_Fireplace1',
    )
    // Give resources
    player.resources.boar = 3
    player.resources.cattle = 2
    player.resources.sheep = 3
    player.resources.vegetable = 2
    player.resources.food = 0
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('cooking 2 boar places 2 food on card stack', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')

    // Cook 2 boar (Fireplace trade index 1 = boar->2food)
    resp = session.resolveChoice(0, 'bulk:1=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(1) // 3 - 2
    // 2 boar × 2 food = 4 food from cooking
    // 2 food auto-placed on card → 4 - 2 = 2 food remaining
    expect(player.resources.food).toBe(2)
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(2)
    expect(stack).toEqual(['food', 'food'])
  })

  it('card stack contains food items after cooking', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)

    // Cook 1 boar
    resp = session.resolveChoice(0, 'bulk:1=1')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    expect(stack).toEqual(['food'])
  })

  it('cooking cattle also triggers food placement', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)

    // Cook 2 cattle (Fireplace trade index 2 = cattle->3food)
    resp = session.resolveChoice(0, 'bulk:2=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.cattle).toBe(0) // 2 - 2
    // 2 cattle × 3 food = 6 food from cooking
    // 2 food auto-placed on card → 6 - 2 = 4 food remaining
    expect(player.resources.food).toBe(4)
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(2)
    expect(stack).toEqual(['food', 'food'])
  })

  it('cooking sheep does NOT trigger food placement (only boar/cattle)', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)

    // Cook 2 sheep (Fireplace trade index 0 = sheep->2food)
    resp = session.resolveChoice(0, 'bulk:0=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(1) // 3 - 2
    // 2 sheep × 2 food = 4 food from cooking, no placement
    expect(player.resources.food).toBe(4)
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(0)
  })

  it('mixed batch: only boar/cattle count for placement', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)

    // Cook 1 sheep (index 0) + 1 boar (index 1) + 1 cattle (index 2)
    resp = session.resolveChoice(0, 'bulk:0=1,1=1,2=1')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(2) // 3 - 1
    expect(player.resources.boar).toBe(2) // 3 - 1
    expect(player.resources.cattle).toBe(1) // 2 - 1
    // 1 sheep × 2f + 1 boar × 2f + 1 cattle × 3f = 7 food from cooking
    // 2 placed on card (1 boar + 1 cattle) → 7 - 2 = 5 food remaining
    expect(player.resources.food).toBe(5)
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(2)
    expect(stack).toEqual(['food', 'food'])
  })

  it('accumulates food on card across multiple exchanges', () => {
    const session = setup()
    enterActiveInteraction(session)

    // First exchange: cook 1 boar
    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, 'bulk:1=1')
    expect(resp.ok).toBe(true)

    let stack = getCardStack(resp.state.players[0]!, CARD_ID)
    expect(stack.length).toBe(1)

    // Second exchange: cook 1 cattle
    resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, 'bulk:2=1')
    expect(resp.ok).toBe(true)

    stack = getCardStack(resp.state.players[0]!, CARD_ID)
    expect(stack.length).toBe(2)
    expect(stack).toEqual(['food', 'food'])
  })
})
