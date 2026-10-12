import { createWorkSession } from './_helpers/session-fixtures'
import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/E/E087_MasterRenovator'

describe('E087 Master Renovator parity', () => {
  const CARD_ID = 'E087_MasterRenovator'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, round = 7, houseType = 'wood', resources = {},
  }: {
    played?: boolean
    round?: number
    houseType?: 'wood' | 'clay' | 'stone'
    resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
  } = {}) => {
    const session = createWorkSession({ seed: 6087 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.houseType = houseType
    owner.rooms = 2
    Object.assign(owner.resources, resources)
    if (played) state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session
  }

  const chooseCardOffer = (session: GameSession, response: SessionResponse, accept: boolean) => {
    let current = response
    if (current.interaction.stateId === 'wait'
      && current.interaction.request.kind === 'select-trigger') {
      const trigger = options(current).find((option) =>
        option.value === CARD_ID || option.sourceCard === CARD_ID)
      expect(trigger).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, trigger!.value)
    }
    expect(current.interaction.stateId).toBe('wait')
    if (current.interaction.stateId !== 'wait') return current
    const option = options(current).find((candidate) => accept
      ? candidate.value !== '__skip__'
      : candidate.value === '__skip__')
    expect(option, JSON.stringify(current.interaction)).toBeDefined()
    return session.resolveChoice(current.interaction.playerIndex, option!.value)
  }

  const acceptRenovation = (
    session: GameSession, response: SessionResponse, target: 'clay' | 'stone',
  ) => {
    let current = chooseCardOffer(session, response, true)
    if (current.interaction.stateId === 'wait'
      && current.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      current = session.resolveChoice(current.interaction.playerIndex, target)
    }
    if (current.interaction.stateId === 'wait'
      && current.interaction.promptKey === 'prompt.selectPayment') {
      const payment = options(current).find((option) =>
        option.sourceCard === CARD_ID || JSON.stringify(option).includes(CARD_ID))
      expect(payment, JSON.stringify(current.interaction)).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, payment!.value)
    }
    for (let safety = 0; safety < 4 && current.interaction.stateId === 'wait'; safety += 1) {
      if (current.state.players[0]!.houseType === target) break
      const next = options(current).find((option) => {
        if (current.interaction.stateId !== 'wait') return false
        if (current.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
          return option.value === target
        }
        if (current.interaction.promptKey === 'prompt.selectPayment') {
          return option.sourceCard === CARD_ID || JSON.stringify(option).includes(CARD_ID)
        }
        return option.value !== '__skip__'
      })
      expect(next, JSON.stringify(current.interaction)).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, next!.value)
    }
    return current
  }

  it('E087 S2: round seven can discount one clay from a wood-house renovation', () => {
    const session = setup({ resources: { clay: 1, reed: 1 } })
    const response = acceptRenovation(session, session.performRoundEnd(), 'clay')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseType: 'clay' })
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
    expect(response.state.players[0]!.activeModifiers.some(modifier => modifier.cardId === CARD_ID)).toBe(false)
  })

  it('E087 S3: round seven can discount the reed from a wood-house renovation', () => {
    const session = setup({ resources: { clay: 2 } })
    const response = acceptRenovation(session, session.performRoundEnd(), 'clay')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseType: 'clay' })
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
    expect(response.state.players[0]!.activeModifiers.some(modifier => modifier.cardId === CARD_ID)).toBe(false)
  })

  it('E087 S4: round nine can discount one stone from a clay-house renovation', () => {
    const session = setup({
      round: 9, houseType: 'clay', resources: { stone: 1, reed: 1 },
    })
    const response = acceptRenovation(session, session.performRoundEnd(), 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseType: 'stone' })
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
    expect(response.state.players[0]!.activeModifiers.some(modifier => modifier.cardId === CARD_ID)).toBe(false)
  })

  it('E087 S5: a round other than seven or nine receives no Master Renovator offer', () => {
    const response = setup({
      round: 8, resources: { clay: 2, reed: 1 },
    }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(9)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E087 S6: a stone house receives no Master Renovator offer', () => {
    const response = setup({
      houseType: 'stone', resources: { stone: 2, reed: 1 },
    }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(8)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E087 S7: the round-seven Master Renovator offer may be declined', () => {
    const session = setup({ resources: { clay: 2, reed: 1 } })
    const response = chooseCardOffer(session, session.performRoundEnd(), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1 })
    expect(response.state.players[0]!.activeModifiers.some(modifier => modifier.cardId === CARD_ID)).toBe(false)
  })
  it('an unaffordable renovation produces no payment and leaves no discount behind', () => {
    const session = setup({ resources: { clay: 0, reed: 0 } })
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
    expect(response.state.players[0]!.activeModifiers.some(modifier => modifier.cardId === CARD_ID)).toBe(false)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)).toBe(false)
  })
})
