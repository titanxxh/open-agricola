import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionChoiceOption, ActionFlow, Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E78_SleightofHand'

const CARD_ID = 'E78_SleightofHand'

const setupPlaySession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationPlayed = ['occ-1', 'occ-2', 'occ-3']
  player.resources.wood = 1
  player.resources.clay = 0
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  session.loadState(state)
  return session
}

const isWoodToClayOption = (option: ActionChoiceOption) => {
  const preview = option.effectPreview
  return preview?.kind === 'resourceExchange' &&
    (preview.resourcesPaid?.wood ?? 0) === 1 &&
    (preview.resourcesGained?.clay ?? 0) === 1
}

const playUntilFirstExchangePrompt = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  for (let safety = 0; safety < 20; safety += 1) {
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return resp
    const options = resp.interaction.options ?? []
    if (options.length > 2 && options.some(isWoodToClayOption)) return resp
    const next = options.find((option) => option.value !== '__skip__' && option.value !== 'cancel')
    if (!next) return resp
    resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, next.value)
  }
  throw new Error('exchange prompt not reached')
}

const drainOptionalExchangePrompts = (
  session: GameSession,
  resp: ReturnType<GameSession['takeAction']>,
) => {
  for (let safety = 0; safety < 20; safety += 1) {
    if (resp.interaction.stateId !== 'wait') return resp
    const options = resp.interaction.options ?? []
    const skip = options.find((option) => option.value === '__skip__' || option.value === 'cancel')
    if (!skip) return resp
    resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, skip.value)
  }
  return resp
}

describe('E78_SleightofHand session', () => {
  const setupSession = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return { session, state }
  }

  it('onBuy offers optional exchange sequence when player has building resources', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 3
    player.resources.clay = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)

    // Should have 4 exchange children (up to 4 exchanges)
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children.length).toBe(4)

    // Each child is an XOR of pay-gain combos
    for (const child of children) {
      expect(child.type).toBe('xor')
      expect(child.optional).toBe(true)
      // 4 resource types * 3 other types = 12 combinations
      expect(child.children.length).toBe(12)
    }
  })

  it('onBuy returns undefined when player has no building resources', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 0
    player.resources.reed = 0
    player.resources.stone = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('each exchange option has correct direct exchange structure', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()

    const firstExchange = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0]
    expect(firstExchange.type).toBe('xor')

    // Check one option: pay 1 wood, gain 1 clay
    const woodToClayOption = firstExchange.children.find(
      (c: ActionFlow) =>
        c.type === 'leaf' &&
        c.actionId === 'exchange' &&
        (c.effectPreview?.kind === 'resourceExchange') &&
        c.effectPreview.resourcesPaid?.wood === 1 &&
        c.effectPreview.resourcesGained?.clay === 1,
    )
    expect(woodToClayOption).toBeDefined()
    expect(woodToClayOption!.sourceCard).toBe(CARD_ID)
  })

  it('playing the card emits one resource.exchanged event for an accepted exchange', () => {
    const session = setupPlaySession()
    let resp = playUntilFirstExchangePrompt(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const option = resp.interaction.options?.find(isWoodToClayOption)
    expect(option).toBeDefined()
    resp = session.resolveChoice(0, option!.value)
    resp = drainOptionalExchangePrompts(session, resp)

    const playerId = resp.state.players[0]!.id
    const exchanges = resp.state.events.filter((event) => event.type === 'resource.exchanged')
    expect(exchanges).toHaveLength(1)
    expect(exchanges[0]).toMatchObject({
      sourceCardId: CARD_ID,
      paidFrom: { kind: 'player', playerId },
      paidTo: { kind: 'supply' },
      gainedFrom: { kind: 'supply' },
      gainedTo: { kind: 'player', playerId },
    })
  })

  it('declining the first exchange emits no resource.exchanged event', () => {
    const session = setupPlaySession()
    let resp = playUntilFirstExchangePrompt(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const skip = resp.interaction.options?.find((option) => option.value === '__skip__')
    expect(skip).toBeDefined()
    resp = session.resolveChoice(0, skip!.value)
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.exchanged', sourceCardId: CARD_ID }),
    ]))
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', sourceCardId: CARD_ID }),
    ]))
  })

  it('exchange options cover all 12 combinations (4 types x 3 other types)', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.stone = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)

    const firstExchange = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0]
    const combos = new Set<string>()
    for (const option of firstExchange.children) {
      if (option.type !== 'leaf' || option.effectPreview?.kind !== 'resourceExchange') continue
      const payKey = Object.keys(option.effectPreview.resourcesPaid ?? {})[0]
      const gainKey = Object.keys(option.effectPreview.resourcesGained ?? {})[0]
      combos.add(`${payKey}->${gainKey}`)
    }

    // 4 building resources * 3 others = 12 combinations
    expect(combos.size).toBe(12)

    // Verify no same-type exchanges
    for (const combo of combos) {
      const [pay, gain] = combo.split('->')
      expect(pay).not.toBe(gain)
    }
  })
})
