import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D082_HuntingTrophy'
import '../../shared/cards/D/D056_FatstockStretcher'

const CARD_ID = 'D082_HuntingTrophy'
const TARGET_MINOR = 'D056_FatstockStretcher'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({
  played = true, boar = 0, fireplace = false, resources = {}, houseType = 'wood',
}: {
  played?: boolean
  boar?: number
  fireplace?: boolean
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
  houseType?: 'wood' | 'clay'
} = {}) => {
  const session = new GameSession(6082, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
    if (space.id === 'house-redevelopment' || space.id === 'farm-redevelopment') {
      space.roundAvailable = 1
    }
  })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.fenceSegments = []
    player.stableTiles = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.resources = { ...owner.resources, boar, ...resources }
  if (fireplace) {
    owner.improvements = ['Major_Fireplace1']
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (cardId) => cardId !== 'Major_Fireplace1',
    )
  }
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const chooseRenovationTarget = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    return session.resolveChoice(response.interaction.playerIndex, 'clay')
  }
  return response
}

const chooseImprovement = (
  session: GameSession, response: SessionResponse, cardId: string,
) => {
  for (let guard = 0; guard < 8 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.interaction.request.kind === 'confirm-next-player') return response
    const options = response.interaction.request.options ?? []
    const card = options.find((option) =>
      option.value === cardId || option.value === `minor:${cardId}`)
    if (card) {
      response = session.resolveChoice(response.interaction.playerIndex, card.value)
      continue
    }
    if (response.interaction.promptKey === 'prompt.selectPayment') {
      const payment = options.find((option) => option.value.startsWith('pay:')) ?? options[0]
      expect(payment, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
      continue
    }
    const branch = options.find((option) => option.value.startsWith('action-improvement-'))
      ?? options.find((option) => option.labelKey?.includes('improvement'))
    if (!branch) throw new Error(`unexpected improvement interaction: ${JSON.stringify(response.interaction)}`)
    response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

describe('D082 Hunting Trophy parity', () => {
  it('D082 S1: playing returns exactly one boar', () => {
    const response = playMinor(setup({ played: false, boar: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 0 })
  })

  it('D082 S2: Hunting Trophy cannot be played without a boar', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })

  it('offers returning or cooking one boar with the real Fireplace source', () => {
    const session = setup({ played: false, boar: 1, fireplace: true })
    const offered = playMinor(session)
    expect(offered.state.players[0]!.resources.boar).toBe(1)
    const options = offered.interaction.request.options ?? []
    expect(options.map((option) => option.labelKey)).toContain('ui.interactionHuntingTrophyReturn')
    const cook = options.find((option) => option.labelKey === 'ui.interactionResourceExchange')
    expect(cook, JSON.stringify(offered.interaction)).toBeDefined()
    expect(options.map((option) => option.value)).not.toContain('__skip__')
    const response = session.resolveChoice(0, cook!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 2 })
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.exchanged', exchangeSource: 'Major_Fireplace1', paid: { boar: 1 }, gained: { food: 2 },
    }))
  })

  it('D082 S4: House Redevelopment discounts the follow-up improvement', () => {
    const session = setup({ resources: { clay: 2, reed: 1, wood: 1 } })
    const state = session.getState().state
    state.players[0]!.minorHand = [TARGET_MINOR]
    session.loadState(state)

    let response = chooseRenovationTarget(session, session.takeAction(0, 'house-redevelopment'))
    response = chooseImprovement(session, response, TARGET_MINOR)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 0, wood: 1 },
    })
    expect(response.state.players[0]!.minorPlayed).toContain(TARGET_MINOR)
  })

  it('D082 S5: House Redevelopment exposes a free one-wood improvement', () => {
    const session = setup({ resources: { clay: 2, reed: 1 } })
    const state = session.getState().state
    state.players[0]!.minorHand = [TARGET_MINOR]
    session.loadState(state)

    let response = chooseRenovationTarget(session, session.takeAction(0, 'house-redevelopment'))

    response = chooseImprovement(session, response, TARGET_MINOR)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 0, wood: 0 },
    })
    expect(response.state.players[0]!.minorHand).not.toContain(TARGET_MINOR)
    expect(response.state.players[0]!.minorPlayed).toContain(TARGET_MINOR)
  })

  it('D082 S6: Meeting Place does not discount an improvement', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = [TARGET_MINOR]
    session.loadState(state)

    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId === 'wait') {
      const branch = response.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
    }

    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) =>
        option.value === TARGET_MINOR || option.value === `minor:${TARGET_MINOR}`) ?? false
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(TARGET_MINOR)
  })

  it('House Redevelopment discounts a major improvement in both preview and payment', () => {
    const session = setup({ resources: { clay: 2, reed: 1, stone: 3 } })
    const state = session.getState().state
    state.availableMajorImprovements = ['Major_Well']
    session.loadState(state)
    let response = chooseRenovationTarget(session, session.takeAction(0, 'house-redevelopment'))
    response = chooseImprovement(session, response, 'Major_Well')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Well')
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 0, wood: 0, stone: 0 },
    })
  })

  it('D082 S7: Farm Redevelopment offers four fences with only one wood after renovation', () => {
    const session = setup({
      houseType: 'clay', resources: { stone: 2, reed: 1, wood: 1 },
    })

    let response = session.takeAction(0, 'farm-redevelopment')
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(response.interaction.playerIndex, 'stone')
    }
    if (response.interaction.stateId === 'wait') {
      const fencing = response.interaction.request.options?.find((option) =>
        option.labelKey === 'actions.fencing.name')
      expect(fencing, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, fencing!.value)
    }
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })
    response = session.commitSelectionChoice(0, {
      edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { stone: 0, reed: 0, wood: 0 },
    })
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('D082 S8: ordinary Fencing receives no Hunting Trophy discount', () => {
    const session = setup({ resources: { wood: 1 } })
    const before = session.getState()

    const response = session.takeAction(0, 'fencing')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})
