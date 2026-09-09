import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardDefinitionById } from '../../shared/cards/helpers/card-type'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/E/E144_WaresSalesman'
import '../../shared/cards/A/A056_Basket'
import '../../shared/cards/A/A108_MushroomCollector'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/C/C055_Studio'
import '../../shared/cards/D/D108_StoneCarver'
import '../../shared/cards/D/D155_Ebonist'
import '../../shared/cards/E/E109_BraidMaker'

const CARD_ID = 'E144_WaresSalesman'
const FILLER = '__test_placeholder__'

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, actor = 0, targetId, targetType = 'occupation', resources = {},
}: {
  played?: boolean
  actor?: number
  targetId?: string
  targetType?: 'occupation' | 'minor'
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
} = {}) => {
  const session = new GameSession(7144, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
      ...(index === actor ? resources : {}),
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (targetId) {
    const target = state.players[actor]!
    if (targetType === 'occupation') target.occupationHand = [targetId]
    else target.minorHand = [targetId]
  }
  session.loadState(state)
  return session
}

const settleSwitches = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  while (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

const enterWaresFlow = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
      continue
    }
    if (response.interaction.request.kind === 'select-trigger') {
      const trigger = optionsOf(response).find((option) =>
        option.value === CARD_ID || option.sourceCard === CARD_ID)
      if (trigger) {
        response = session.resolveChoice(response.interaction.playerIndex, trigger.value)
        continue
      }
    }
    break
  }
  return response
}

const playOccupation = (session: GameSession, actor: number, cardId: string) => {
  let response = session.takeAction(actor, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[actor]!.occupationHand.includes(cardId)) {
    const card = optionsOf(response).find((option) => option.value === cardId)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return enterWaresFlow(session, response)
}

const playMinor = (session: GameSession, actor: number, cardId: string) => {
  let response = session.takeAction(actor, 'meeting-place')
  for (let step = 0; step < 3 && response.state.players[actor]!.minorHand.includes(cardId); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = optionsOf(response).find((candidate) =>
      candidate.value === cardId || candidate.value.startsWith('action-improvement-'))
    if (!option) break
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  return enterWaresFlow(session, response)
}

const chooseWaresGain = (session: GameSession, response: SessionResponse, resource: string) => {
  const settled = enterWaresFlow(session, response)
  expect(settled.interaction.stateId).toBe('wait')
  const choice = optionsOf(settled).find((option) =>
    option.sourceCard === CARD_ID
      && option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesGained?.[resource] === 1)
  expect(choice, JSON.stringify(settled.interaction, null, 2)).toBeDefined()
  return settleSwitches(session, session.resolveChoice(settled.interaction.playerIndex, choice!.value))
}

const CONVERSION_REWARDS = {
  A108_MushroomCollector: [{ wood: 1, reed: 1 }],
  A138_Harpooner: [{ wood: 1, reed: 1 }],
  A056_Basket: [{ wood: 1, reed: 1 }],
  C153_PatternMaker: [{ wood: 1, reed: 1 }],
  A034_Loppers: [{ wood: 1, reed: 1 }],
  A048_ShavingHorse: [{ wood: 1, reed: 1 }],
  A159_JoineroftheSea: [{ wood: 1, reed: 1 }],
  B042_ForestInn: [{ wood: 1, reed: 1 }],
  B053_SculptureCourse: [{ wood: 1, reed: 1 }, { stone: 1, reed: 1 }],
  B109_PaperMaker: [{ wood: 1, reed: 1 }],
  C055_Studio: [{ wood: 1, reed: 1 }, { clay: 1, reed: 1 }, { stone: 1, reed: 1 }],
  D155_Ebonist: [{ wood: 1, reed: 1 }],
  D133_BeerTentOperator: [{ wood: 1, reed: 1 }],
  E054_Contraband: [{ wood: 1, reed: 1 }, { clay: 1, reed: 1 }, { reed: 2 }, { stone: 1, reed: 1 }],
  E106_EmergencySeller: [{ wood: 1, reed: 1 }, { clay: 1, reed: 1 }, { reed: 2 }, { stone: 1, reed: 1 }],
  Major_Joinery: [{ wood: 1, reed: 1 }],
  A040_PottersYard: [{ clay: 1, reed: 1 }],
  D060_LargePottery: [{ clay: 1, reed: 1 }],
  D107_Bellfounder: [{ clay: 1, reed: 1 }],
  E039_Paintbrush: [{ clay: 1, reed: 1 }],
  Major_Pottery: [{ clay: 1, reed: 1 }],
  C139_BasketmakersWife: [{ reed: 2 }],
  D046_PelletPress: [{ reed: 2 }],
  E109_BraidMaker: [{ reed: 2 }],
  Major_Basket: [{ reed: 2 }],
  D108_StoneCarver: [{ stone: 1, reed: 1 }],
  E153_StoneSculptor: [{ stone: 1, reed: 1 }],
}

describe('E144 Wares Salesman parity', () => {
  it('E144 S1: Wares Salesman can be played as the first occupation in a four-player game', () => {
    const response = playOccupation(setup({ played: false }), 0, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })

  it('E144 S2: the owner playing a wood-converting occupation gains one wood and one reed', () => {
    const response = playOccupation(setup({ targetId: 'A108_MushroomCollector' }), 0, 'A108_MushroomCollector')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A108_MushroomCollector')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1 })
  })

  it('E144 S3: an opponent playing a reed-converting occupation gives the owner two reed', () => {
    const response = playOccupation(setup({ actor: 1, targetId: 'E109_BraidMaker' }), 1, 'E109_BraidMaker')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.occupationPlayed).toContain('E109_BraidMaker')
    expect(response.state.players[0]!.resources.reed).toBe(2)
    expect(response.state.players[1]!.resources.reed).toBe(0)
  })

  it('E144 S4: playing a wood-converting minor gives one wood and one reed', () => {
    const response = playMinor(setup({
      targetId: 'A056_Basket', targetType: 'minor', resources: { reed: 1 },
    }), 0, 'A056_Basket')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A056_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1 })
  })

  it('E144 S5: building Joinery gives one wood and one reed', () => {
    const session = setup({ resources: { wood: 2, stone: 2 } })
    const state = session.getState().state
    state.availableMajorImprovements = ['Major_Joinery']
    session.loadState(state)

    let response = session.takeAction(0, 'major-improvement')
    if (!response.state.players[0]!.improvements.includes('Major_Joinery')
      && response.interaction.stateId === 'wait') {
      const joinery = optionsOf(response).find((option) => option.value === 'Major_Joinery')
      expect(joinery, JSON.stringify(response.interaction, null, 2)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, joinery!.value)
    }
    response = enterWaresFlow(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1, stone: 0 })
  })

  it('E144 S6: Studio lets the owner choose one corresponding resource plus reed', () => {
    const session = setup({
      targetId: 'C055_Studio', targetType: 'minor', resources: { clay: 1, reed: 1 },
    })
    const response = chooseWaresGain(session, playMinor(session, 0, 'C055_Studio'), 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 1, stone: 1,
    })
  })

  it('E144 S7: playing a non-converting occupation grants no building resources', () => {
    const response = playOccupation(setup({ targetId: 'A116_WoodCutter' }), 0, 'A116_WoodCutter')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })

  it.each([0, 1])('E144 S8: Ebonist played by player %i rewards the owner', (actor) => {
    const response = playOccupation(setup({ actor, targetId: 'D155_Ebonist' }), actor, 'D155_Ebonist')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1 })
    if (actor !== 0) expect(response.state.players[actor]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it.each([0, 1])('E144 S9: Stone Carver played by player %i rewards the owner', (actor) => {
    const response = playOccupation(setup({ actor, targetId: 'D108_StoneCarver' }), actor, 'D108_StoneCarver')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, reed: 1 })
    if (actor !== 0) expect(response.state.players[actor]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('keeps all twenty-seven conversion reward declarations', () => {
    setup()
    for (const [cardId, gains] of Object.entries(CONVERSION_REWARDS)) {
      expect(getCardDefinitionById(cardId)?.waresSalesmanGains, cardId).toEqual(gains)
    }
  })
})
