import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E146_Reseller'
import '../../shared/cards/E/E047_SyrupTap'
import '../../shared/cards/E/E030_ChildsToy'
import '../../shared/cards/B/B036_Bottles'
import '../../shared/cards/B/B007_Wage'
import '../../shared/cards/C/C054_MarketBooth'

const CARD_ID = 'E146_Reseller'
const FILLER = '__test_placeholder__'

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, targetId, resources = {}, familySize = 2, flagged = false,
}: {
  played?: boolean
  targetId?: string
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
  familySize?: number
  flagged?: boolean
} = {}) => {
  const session = new GameSession(6146, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, index === 0 ? familySize : 2)
    setWorkersAtHome(state, player, index === 0 ? familySize : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      ...(index === 0 ? resources : {}),
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (targetId) owner.minorHand = [targetId]
  if (flagged) owner.cardStates[CARD_ID] = { flagged: true }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = optionsOf(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const playMinor = (
  session: GameSession, cardId: string, payment?: Partial<Record<string, number>>, actionId = 'meeting-place',
) => {
  let response = session.takeAction(0, actionId)
  for (let step = 0; step < 8 && response.state.players[0]!.minorHand.includes(cardId); step += 1) {
    if (response.interaction.stateId !== 'wait') break
    const candidates = optionsOf(response)
    const choice = candidates.find((option) => option.value === cardId)
      ?? candidates.find((option) => option.value.startsWith('action-improvement-'))
      ?? candidates.find((option) => {
        if (response.interaction.promptKey !== 'prompt.selectPayment') return false
        const paid = option.labelParams?.resourcesPaid as Record<string, number> | undefined
        return payment && Object.entries(payment).every(([resource, count]) => paid?.[resource] === count)
      })
    expect(choice, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const enterResellerOffer = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger') {
    const trigger = optionsOf(response).find((option) =>
      option.value === CARD_ID || option.sourceCard === CARD_ID)
    expect(trigger, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    if (trigger) response = session.resolveChoice(response.interaction.playerIndex, trigger.value)
  }
  return response
}

const acceptReseller = (session: GameSession, initial: SessionResponse) => {
  const response = enterResellerOffer(session, initial)
  if (response.state.players[0]!.cardStates[CARD_ID]?.flagged) return response
  expect(response.interaction.stateId).toBe('wait')
  const gain = optionsOf(response).find((option) =>
    option.value !== '__skip__' && option.sourceCard === CARD_ID)
  expect(gain, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.stateId === 'wait'
    ? response.interaction.playerIndex
    : 0, gain!.value)
}

const resellerOffered = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.sourceCard === CARD_ID
    || optionsOf(response).some((option) =>
      option.value === CARD_ID || option.sourceCard === CARD_ID)
}

describe('E146 Reseller parity', () => {
  it('E146 S1: Reseller is played as the first occupation in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('E146 S2: accepting after a fixed-cost improvement returns its printed cost', () => {
    const session = setup({
      targetId: 'E047_SyrupTap', resources: { wood: 1, stone: 1 },
    })
    let response = playMinor(session, 'E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })

    response = acceptReseller(session, response)

    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('E146 S3: declining a fixed-cost offer does not consume Reseller', () => {
    const session = setup({
      targetId: 'E047_SyrupTap', resources: { wood: 1, stone: 1 },
    })
    let response = enterResellerOffer(session, playMinor(session, 'E047_SyrupTap'))
    expect(response.interaction.stateId).toBe('wait')
    expect(optionsOf(response).some((option) => option.value === '__skip__')).toBe(true)

    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex
      : 0, '__skip__')

    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('E146 S4: an alternative printed cost can be chosen independently of the paid cost', () => {
    const session = setup({
      targetId: 'E030_ChildsToy', resources: { clay: 1 },
    })
    let response = playMinor(session, 'E030_ChildsToy', { clay: 1 })
    expect(response.state.players[0]!.resources.clay).toBe(0)
    response = enterResellerOffer(session, response)
    expect(response.interaction.stateId).toBe('wait')
    const accept = optionsOf(response).find((option) =>
      option.value !== '__skip__' && option.sourceCard === CARD_ID)
    expect(accept, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex
      : 0, accept!.value)
    expect(optionsOf(response).some((option) =>
      option.effectPreview?.resourcesGained?.wood === 1)).toBe(true)
    expect(optionsOf(response).some((option) =>
      option.effectPreview?.resourcesGained?.clay === 1)).toBe(true)
    const wood = optionsOf(response).find((option) =>
      option.effectPreview?.resourcesGained?.wood === 1)
    expect(wood, JSON.stringify(response.interaction, null, 2)).toBeDefined()

    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex
      : 0, wood!.value)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('E146 S5: a dynamic printed cost uses the current family size', () => {
    const session = setup({
      targetId: 'B036_Bottles', resources: { clay: 3, food: 3 }, familySize: 3,
    })
    let response = playMinor(session, 'B036_Bottles')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })

    response = acceptReseller(session, response)

    expect(response.state.players[0]!.minorPlayed).toContain('B036_Bottles')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, food: 3 })
  })

  it('E146 S6: a free improvement creates no offer and does not consume Reseller', () => {
    const response = playMinor(setup({ targetId: 'B007_Wage' }), 'B007_Wage')

    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[1]!.minorHand).toContain('B007_Wage')
    expect(resellerOffered(response)).toBe(false)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('E146 S7: component costs create no offer and preserve the later refund', () => {
    const session = setup({ targetId: 'C054_MarketBooth', resources: { wood: 1, stone: 1 } })
    const state = session.getState().state
    state.round = 14
    state.players[0]!.minorHand.push('E047_SyrupTap')
    session.loadState(state)
    let response = playMinor(session, 'C054_MarketBooth')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('C054_MarketBooth')
    expect(response.state.players[0]!.supplyTokensConsumed?.stable).toBe(1)
    expect(resellerOffered(response)).toBe(false)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    if (response.interaction.request.kind === 'confirm-next-player') confirmNextPlayer(session)
    response = playMinor(session, 'E047_SyrupTap', undefined, 'major-improvement')
    response = acceptReseller(session, response)
    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('E146 S8: a used Reseller does not trigger for another fixed-cost improvement', () => {
    const response = playMinor(setup({
      targetId: 'E047_SyrupTap', resources: { wood: 1, stone: 1 }, flagged: true,
    }), 'E047_SyrupTap')

    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
    expect(resellerOffered(response)).toBe(false)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })
})
