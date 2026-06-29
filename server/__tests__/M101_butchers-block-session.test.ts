import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { M101_ButchersBlock } from '../../shared/cards/M/M101_ButchersBlock'
import type { Resource, SessionResponse } from '../../shared/contract/types'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

const CARD_ID = 'M101_ButchersBlock'
const PLACEHOLDER = '__test_placeholder__'

const fullResources = (overrides: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
  ...overrides,
})

const setup = (options: {
  round?: number
  resources?: Partial<Resource>[]
} = {}) => {
  const session = new GameSession(101, undefined, {
    playerCount: 3,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.players = state.players.slice(0, 3)
  state.currentPlayerIndex = 0
  state.round = options.round ?? 5
  state.roundPhase = 'work'
  for (const [index, player] of state.players.entries()) {
    player.resources = fullResources(options.resources?.[index])
    player.minorHand = index === 0 ? [CARD_ID] : [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    setWorkersAtHome(state, player, index === 0 ? 3 : 0)
  }
  session.loadState(state)
  return session
}

const choosePaymentIfNeeded = (session: GameSession, response: SessionResponse) => {
  let resp = response
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.options?.[0]
    expect(option).toBeDefined()
    resp = session.resolveChoice(0, option!.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const playM101 = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  const improvementOption = resp.interaction.options?.find((option) =>
    option.value.startsWith('action-improvement-')
  )
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }

  if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === CARD_ID) {
    return choosePaymentIfNeeded(session, resp)
  }

  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  resp = session.resolveChoice(0, cardOption!.value)
  expect(resp.ok).toBe(true)
  return choosePaymentIfNeeded(session, resp)
}

const resourcesPaid = (response: SessionResponse, resource: keyof Resource, amount: number) =>
  response.interaction.stateId === 'wait'
    ? response.interaction.options?.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' &&
      option.effectPreview.resourcesPaid?.[resource] === amount
    )
    : undefined

const confirmAnimalReorgIfNeeded = (
  session: GameSession,
  response: SessionResponse,
  playerIndex: number,
  keepAnimal?: 'sheep' | 'boar' | 'cattle' | 'horse',
) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const zones = keepAnimal
    ? response.interaction.zones.map((zone, index) => index === 0
      ? { ...zone, animalType: keepAnimal, animalCount: 1 }
      : zone)
    : response.interaction.zones
  const resp = session.resolveChoice(playerIndex, 'confirm', { zones })
  expect(resp.ok).toBe(true)
  return resp
}

const confirmNextPlayerIfNeeded = (
  session: GameSession,
  response: SessionResponse,
) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-next-player') {
    return response
  }
  const resp = confirmNextPlayer(session)
  expect(resp.ok).toBe(true)
  return resp
}

describe('M101 Butcher\'s Block', () => {
  it('cannot be played in rounds 4, 7, 9, 11, 13, or 14', () => {
    for (const round of [4, 7, 9, 11, 13, 14]) {
      const session = setup({ round, resources: [{ wood: 1 }] })
      const state = session.getState().state
      const player = state.players[0]!

      expect(meetsCardPrerequisites(player, M101_ButchersBlock, round, state)).toBe(false)
      expect(session.getCardAvailability(0)[`minor:${CARD_ID}`]).toBe(false)
    }
  })

  it('lets the owner decline, then forces other players with animals in seat order and skips empty players', () => {
    const session = setup({
      resources: [
        { wood: 1, sheep: 1 },
        { boar: 1, cattle: 1 },
        {},
      ],
    })

    let resp = playM101(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.options?.some((option) => option.value === '__skip__')).toBe(true)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.fromPlayerIndex).toBe(0)
    expect(resp.interaction.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(1)
    expect(resp.interaction.options?.some((option) => option.value === '__skip__')).toBe(false)

    const boarOption = resourcesPaid(resp, 'boar', 1)
    expect(boarOption).toBeDefined()
    resp = session.resolveChoice(1, boarOption!.value)
    expect(resp.ok).toBe(true)
    resp = confirmAnimalReorgIfNeeded(session, resp, 1, 'cattle')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.fromPlayerIndex).toBe(1)
    expect(resp.interaction.toPlayerIndex).toBe(0)

    resp = confirmPlayerSwitch(session)
    expect(resp.ok).toBe(true)
    resp = confirmAnimalReorgIfNeeded(session, resp, 0, 'sheep')
    resp = confirmNextPlayerIfNeeded(session, resp)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.sheep).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[1]!.resources.boar).toBe(0)
    expect(resp.state.players[1]!.resources.cattle).toBe(1)
    expect(resp.state.players[1]!.resources.food).toBe(2)
    expect(resp.state.players[2]!.resources.food).toBe(0)
  })

  it('lets the owner convert at most one animal', () => {
    const session = setup({
      resources: [
        { wood: 1, sheep: 1, boar: 1 },
        {},
        {},
      ],
    })

    let resp = playM101(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const sheepOption = resourcesPaid(resp, 'sheep', 1)
    expect(sheepOption).toBeDefined()

    resp = session.resolveChoice(0, sheepOption!.value)
    expect(resp.ok).toBe(true)
    resp = confirmAnimalReorgIfNeeded(session, resp, 0, 'boar')
    resp = confirmNextPlayerIfNeeded(session, resp)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.sheep).toBe(0)
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })

  it('converts horses for 2 food when Farmers of the Moor is enabled', () => {
    const session = setup({
      resources: [
        { wood: 1, sheep: 1 },
        { boar: 1, horse: 1 },
        {},
      ],
    })

    let resp = playM101(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    resp = confirmPlayerSwitch(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(1)
    const horseOption = resourcesPaid(resp, 'horse', 1)
    expect(horseOption).toBeDefined()

    resp = session.resolveChoice(1, horseOption!.value)
    expect(resp.ok).toBe(true)
    resp = confirmAnimalReorgIfNeeded(session, resp, 1, 'boar')
    resp = confirmPlayerSwitch(session)
    expect(resp.ok).toBe(true)
    resp = confirmAnimalReorgIfNeeded(session, resp, 0, 'sheep')
    resp = confirmNextPlayerIfNeeded(session, resp)
    expect(resp.state.players[1]!.resources.horse).toBe(0)
    expect(resp.state.players[1]!.resources.food).toBe(2)
  })
})
