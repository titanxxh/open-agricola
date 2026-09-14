import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import {
  familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable,
} from '../../shared/domain/player'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/A/A093_BedMaker'
import '../../shared/cards/A/A171_Sidekick'
import '../../shared/cards/C/C087_Mason'
import '../../shared/cards/D/D010_StorksNest'
import '../../shared/cards/D/D129_LumberVirtuoso'
import '../../shared/cards/D/D130_RecreationalCarpenter'
import '../../shared/cards/D/D133_BeerTentOperator'
import '../../shared/cards/D/D143_TreeCutter'
import '../../shared/cards/D/D146_Porter'
import '../../shared/cards/D/D149_CasualWorker'
import '../../shared/cards/D/D150_GodlySpouse'
import '../../shared/cards/D/D153_WealthyMan'
import '../../shared/cards/D/D154_ChimneySweep'
import '../../shared/cards/D/D156_RetailDealer'
import '../../shared/cards/D/D157_PartyOrganizer'
import '../../shared/cards/D/D158_BeanCounter'
import '../../shared/cards/D/D163_JourneymanBricklayer'
import '../../shared/cards/D/D167_PureBreeder'
import '../../shared/cards/D/D168_Stockman'

const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  cardId, played = true, playerCount = 4, round = 5, actor = 0, resources = {},
}: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  actor?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(8500 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.fenceSegments = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === actor ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const choose = (session: GameSession, response: SessionResponse, predicate: (option: ReturnType<typeof options>[number]) => boolean) => {
  expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = options(response).find(predicate)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const playOccupation = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'lessons')
  if (response.state.players[0]!.occupationHand.includes(cardId)
    && response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === cardId)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const prepareRoundEnd = (session: GameSession) => {
  session.state.players.forEach((player) => {
    player.resources.food = Math.max(player.resources.food, 20)
    markAllWorkersUsed(session.state, player)
  })
  session.loadState(session.state)
}

const bonus = (response: SessionResponse, cardId: string) =>
  response.state.players[0]!.cardStates[cardId]?.counters?.bonusVp
  ?? response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

const confirmPlayerSwitches = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  while (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

const buildStable = (session: GameSession, playerIndex = 0) => {
  let response = session.takeAction(playerIndex, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const stable = options(response).find((option) => option.labelKey === 'actions.stables.name')
    if (stable) response = session.resolveChoice(response.interaction.playerIndex, stable.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(response.interaction.playerIndex, {
    stables: [response.interaction.request.farm.selectableTiles[0]!],
  })
}

describe('D129 Lumber Virtuoso parity', () => {
  it('D129 S1: Lumber Virtuoso can be played as the first occupation', () => {
    expect(playOccupation(setup({
      cardId: 'D129_LumberVirtuoso', played: false, playerCount: 3,
    }), 'D129_LumberVirtuoso').state.players[0]!.occupationPlayed).toContain('D129_LumberVirtuoso')
  })

  it('D129 S2: at harvest eight wood may be discarded to five before building a stable', () => {
    const session = setup({
      cardId: 'D129_LumberVirtuoso', playerCount: 3, round: 4, resources: { wood: 8 },
    })
    prepareRoundEnd(session)
    let response = session.performRoundEnd()
    response = resolveTriggerIfPresent(session, response, 'D129_LumberVirtuoso')
    response = choose(session, response, (option) =>
      option.value !== '__skip__' && JSON.stringify(option).toLowerCase().includes('stable'))
    expect(response.state.players[0]!.resources.wood).toBe(5)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'farm-select') return
    response = session.commitSelectionChoice(0, {
      stables: [response.interaction.request.farm.selectableTiles[0]!],
    })
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
  })

  it('D129 S3: with fewer than five wood Lumber Virtuoso gives no offer', () => {
    const session = setup({
      cardId: 'D129_LumberVirtuoso', playerCount: 3, round: 4, resources: { wood: 4 },
    })
    prepareRoundEnd(session)
    expect(JSON.stringify(session.performRoundEnd().interaction)).not.toContain('D129_LumberVirtuoso')
  })

  it('D129 S4: at harvest excess wood may be discarded before building a wooden room', () => {
    const session = setup({
      cardId: 'D129_LumberVirtuoso', playerCount: 3, round: 4, resources: { wood: 8, reed: 2 },
    })
    prepareRoundEnd(session)
    let response = session.performRoundEnd()
    response = resolveTriggerIfPresent(session, response, 'D129_LumberVirtuoso')
    response = choose(session, response, (option) =>
      option.value !== '__skip__' && JSON.stringify(option).toLowerCase().includes('construct'))
    expect(response.state.players[0]!.resources.wood).toBe(5)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
    })
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, {
        rooms: [response.interaction.request.farm.selectableTiles[0]!],
      })
    }
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('D129 S5: the harvest build action may be declined without discarding wood', () => {
    const session = setup({
      cardId: 'D129_LumberVirtuoso', playerCount: 3, round: 4, resources: { wood: 8 },
    })
    prepareRoundEnd(session)
    let response = session.performRoundEnd()
    response = resolveTriggerIfPresent(session, response, 'D129_LumberVirtuoso')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(response.state.players[0]!.resources.wood).toBe(8)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
  })
})

describe('D130 Recreational Carpenter parity', () => {
  it('D130 S1: Recreational Carpenter can be played as the first occupation', () => {
    expect(playOccupation(setup({
      cardId: 'D130_RecreationalCarpenter', played: false, playerCount: 3,
    }), 'D130_RecreationalCarpenter').state.players[0]!.occupationPlayed)
      .toContain('D130_RecreationalCarpenter')
  })

  it('D130 S2: an unused Meeting Place allows an end-of-work paid room', () => {
    const session = setup({
      cardId: 'D130_RecreationalCarpenter', playerCount: 3, round: 5,
      resources: { wood: 5, reed: 2 },
    })
    prepareRoundEnd(session)
    let response = resolveTriggerIfPresent(session, session.performRoundEnd(), 'D130_RecreationalCarpenter')
    if (response.interaction.stateId === 'wait'
      && options(response).some((option) => option.value !== '__skip__')) {
      response = choose(session, response, (option) => option.value !== '__skip__')
    }
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'farm-select') return
    response = session.commitSelectionChoice(0, {
      rooms: [response.interaction.request.farm.selectableTiles[0]!],
    })
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('D130 S3: using Meeting Place suppresses Recreational Carpenter', () => {
    const session = setup({
      cardId: 'D130_RecreationalCarpenter', playerCount: 3, round: 5,
      resources: { wood: 5, reed: 2 },
    })
    session.state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = [{
      playerId: session.state.players[0]!.id, workerId: '1',
    }]
    prepareRoundEnd(session)
    expect(JSON.stringify(session.performRoundEnd().interaction)).not.toContain('D130_RecreationalCarpenter')
  })
})

describe('D133 Beer Tent Operator parity', () => {
  it('D133 S1: Beer Tent Operator can be played as the first occupation', () => {
    expect(playOccupation(setup({
      cardId: 'D133_BeerTentOperator', played: false, playerCount: 3,
    }), 'D133_BeerTentOperator').state.players[0]!.occupationPlayed).toContain('D133_BeerTentOperator')
  })

  const harvest = (take: boolean) => {
    const session = setup({
      cardId: 'D133_BeerTentOperator', playerCount: 3, round: 4,
      resources: { wood: 1, grain: 1 },
    })
    prepareRoundEnd(session)
    const response = autoAdvanceRoundEnd(session, {
      onChoice: (interaction, current) => {
        const card = interaction.request.kind === 'select-trigger'
          ? interaction.request.options?.find((option) =>
            option.value === 'D133_BeerTentOperator' || option.sourceCard === 'D133_BeerTentOperator')
          : undefined
        if (card) return current.resolveChoice(interaction.playerIndex, card.value)
        if (interaction.sourceCard === 'D133_BeerTentOperator') {
          const option = interaction.request.options?.find((entry) =>
            take ? entry.value !== '__skip__' : entry.value === '__skip__')
          if (option) return current.resolveChoice(interaction.playerIndex, option.value)
        }
        return undefined
      },
    })
    return response
  }

  it('D133 S2: feeding may turn one wood and grain into two food and one point', () => {
    const response = harvest(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0, food: 18 })
    expect(response.state.players[0]!.cardStates.D133_BeerTentOperator?.counters?.bonusVp).toBe(1)
  })

  it('D133 S3: the Beer Tent exchange may be declined', () => {
    const response = harvest(false)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 1, food: 16 })
    expect(response.state.players[0]!.cardStates.D133_BeerTentOperator?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('D143 Tree Cutter parity', () => {
  it('D143 S1: Tree Cutter can be played as the first occupation', () => {
    const response = playOccupation(setup({
      cardId: 'D143_TreeCutter', played: false, playerCount: 3,
    }), 'D143_TreeCutter')
    expect(response.state.players[0]!.occupationPlayed).toContain('D143_TreeCutter')
  })

  it('D143 S2: collecting three clay gains one additional wood', () => {
    const session = setup({ cardId: 'D143_TreeCutter', playerCount: 3 })
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(session.state)
    const response = session.takeAction(0, 'clay-pit')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, wood: 1 })
  })

  it('D143 S3: collecting three wood grants no Tree Cutter wood', () => {
    const session = setup({ cardId: 'D143_TreeCutter', playerCount: 3 })
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(session.state)
    expect(session.takeAction(0, 'forest').state.players[0]!.resources.wood).toBe(3)
  })

  it('D143 S4: collecting two clay grants no Tree Cutter wood', () => {
    const session = setup({ cardId: 'D143_TreeCutter', playerCount: 3 })
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
    session.loadState(session.state)
    expect(session.takeAction(0, 'clay-pit').state.players[0]!.resources.wood).toBe(0)
  })
})

describe('D146 Porter parity', () => {
  it('D146 S1: Porter can be played as the first occupation', () => {
    const response = playOccupation(setup({
      cardId: 'D146_Porter', played: false, playerCount: 3,
    }), 'D146_Porter')
    expect(response.state.players[0]!.occupationPlayed).toContain('D146_Porter')
  })

  it('D146 S2: collecting four clay gains one clay and one food', () => {
    const session = setup({ cardId: 'D146_Porter', playerCount: 3 })
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 4
    session.loadState(session.state)
    const response = session.takeAction(0, 'clay-pit')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 5, food: 1 })
  })

  it('D146 S3: collecting three clay grants no Porter bonus', () => {
    const session = setup({ cardId: 'D146_Porter', playerCount: 3 })
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(session.state)
    expect(session.takeAction(0, 'clay-pit').state.players[0]!.resources)
      .toMatchObject({ clay: 3, food: 0 })
  })
})

describe('D153 Wealthy Man parity', () => {
  it('D153 S1: Wealthy Man can be played as the first occupation', () => {
    const response = playOccupation(setup({
      cardId: 'D153_WealthyMan', played: false, playerCount: 4,
    }), 'D153_WealthyMan')
    expect(response.state.players[0]!.occupationPlayed).toContain('D153_WealthyMan')
  })

  const firstHarvest = (round: number) => {
    const session = setup({ cardId: 'D153_WealthyMan', playerCount: 4, round })
    session.state.players[0]!.fields = [{
      row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }],
    }]
    prepareRoundEnd(session)
    return autoAdvanceRoundEnd(session)
  }

  it('D153 S2: first harvest with one grain field gains one point', () => {
    expect(bonus(firstHarvest(4), 'D153_WealthyMan')).toBe(1)
  })

  it('D153 S3: second harvest with only one grain field gains no point', () => {
    expect(bonus(firstHarvest(7), 'D153_WealthyMan')).toBe(0)
  })
})

describe('D154 Chimney Sweep parity', () => {
  it('D154 S1: Chimney Sweep can be played as the first occupation', () => {
    const response = playOccupation(setup({
      cardId: 'D154_ChimneySweep', played: false, playerCount: 4,
    }), 'D154_ChimneySweep')
    expect(response.state.players[0]!.occupationPlayed).toContain('D154_ChimneySweep')
  })

  it('D154 S2: a two-room clay house renovates to stone for no stone and one reed', () => {
    const session = setup({
      cardId: 'D154_ChimneySweep', playerCount: 4, resources: { reed: 1 },
    })
    session.state.players[0]!.houseType = 'clay'
    session.loadState(session.state)
    const response = session.takeAction(0, 'house-redevelopment')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { stone: 0, reed: 0 },
    })
  })

  it('D154 S3: each opponent in a stone house scores one point', () => {
    const session = setup({ cardId: 'D154_ChimneySweep', playerCount: 4, round: 14 })
    session.state.players[1]!.houseType = 'stone'
    session.state.players[2]!.houseType = 'stone'
    session.state.players[3]!.houseType = 'wood'
    session.loadState(session.state)
    expect(bonus(session.getState(), 'D154_ChimneySweep')).toBe(2)
  })
})

describe('D156 Retail Dealer parity', () => {
  it('D156 S1: Retail Dealer starts with three grain and three food', () => {
    const response = playOccupation(setup({
      cardId: 'D156_RetailDealer', played: false, playerCount: 4,
    }), 'D156_RetailDealer')
    expect(response.state.players[0]!.occupationPlayed).toContain('D156_RetailDealer')
    expect(response.state.players[0]!.cardStates.D156_RetailDealer?.extraData?.remaining).toBe(3)
  })

  it('D156 S2: Resource Market receives one grain and one food from Retail Dealer', () => {
    const session = setup({ cardId: 'D156_RetailDealer', playerCount: 4 })
    session.state.players[0]!.cardStates.D156_RetailDealer = { extraData: { remaining: 3 } }
    session.loadState(session.state)
    const response = session.takeAction(0, 'resource-market-4')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(response.state.players[0]!.cardStates.D156_RetailDealer?.extraData?.remaining).toBe(2)
  })

  it('D156 S3: another action space does not consume Retail Dealer goods', () => {
    const session = setup({ cardId: 'D156_RetailDealer', playerCount: 4 })
    session.state.players[0]!.cardStates.D156_RetailDealer = { extraData: { remaining: 3 } }
    session.loadState(session.state)
    const response = session.takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.cardStates.D156_RetailDealer?.extraData?.remaining).toBe(3)
  })
})

describe('D158 Bean Counter parity', () => {
  it('D158 S1: Bean Counter can be played as the first occupation', () => {
    const response = playOccupation(setup({
      cardId: 'D158_BeanCounter', played: false, playerCount: 4,
    }), 'D158_BeanCounter')
    expect(response.state.players[0]!.occupationPlayed).toContain('D158_BeanCounter')
  })

  it('D158 S2: third early-round action-space use moves three stored food to supply', () => {
    const session = setup({ cardId: 'D158_BeanCounter', playerCount: 4, round: 8 })
    session.state.players[0]!.cardStates.D158_BeanCounter = { counters: { food: 2 } }
    const actionId = 'western-quarry'
    const previousSlot = session.state.roundActionOrder[7]
    const actionSlot = session.state.roundActionOrder.indexOf(actionId)
    expect(actionSlot).toBeGreaterThanOrEqual(0)
    session.state.roundActionOrder[actionSlot] = previousSlot
    session.state.roundActionOrder[7] = actionId
    session.loadState(session.state)
    const response = session.takeAction(0, actionId)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[0]!.cardStates.D158_BeanCounter?.counters?.food).toBe(0)
  })

  it('D158 S3: a round-nine action space stores no Bean Counter food', () => {
    const session = setup({ cardId: 'D158_BeanCounter', playerCount: 4, round: 9 })
    const actionId = 'western-quarry'
    const previousSlot = session.state.roundActionOrder[8]
    const actionSlot = session.state.roundActionOrder.indexOf(actionId)
    expect(actionSlot).toBeGreaterThanOrEqual(0)
    session.state.roundActionOrder[actionSlot] = previousSlot
    session.state.roundActionOrder[8] = actionId
    session.loadState(session.state)
    const response = session.takeAction(0, actionId)
    expect(response.state.players[0]!.cardStates.D158_BeanCounter?.counters?.food ?? 0).toBe(0)
  })
})

describe('D163 Journeyman Bricklayer parity', () => {
  it('D163 S1: playing Journeyman Bricklayer gains two stone', () => {
    const response = playOccupation(setup({
      cardId: 'D163_JourneymanBricklayer', played: false, playerCount: 4,
    }), 'D163_JourneymanBricklayer')
    expect(response.state.players[0]!.occupationPlayed).toContain('D163_JourneymanBricklayer')
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('D163 S2: an opponent renovating to stone gives the owner one stone', () => {
    const session = setup({ cardId: 'D163_JourneymanBricklayer', playerCount: 4, actor: 1 })
    session.state.players[1]!.houseType = 'clay'
    Object.assign(session.state.players[1]!.resources, { stone: 2, reed: 1 })
    session.loadState(session.state)
    let response = confirmPlayerSwitches(session, session.takeAction(1, 'house-redevelopment'))
    response = resolveTriggerIfPresent(session, response, 'D163_JourneymanBricklayer')
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })

  it('D163 S3: an opponent building a stone room gives the owner one stone', () => {
    const session = setup({ cardId: 'D163_JourneymanBricklayer', playerCount: 4, actor: 1 })
    session.state.players[1]!.houseType = 'stone'
    Object.assign(session.state.players[1]!.resources, { stone: 5, reed: 2 })
    session.loadState(session.state)
    let response = session.takeAction(1, 'farm-expansion')
    if (response.interaction.stateId === 'wait') {
      const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
      if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
    }
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'farm-select') return
    response = session.commitSelectionChoice(1, {
      rooms: [response.interaction.request.farm.selectableTiles[0]!],
    })
    response = confirmPlayerSwitches(session, response)
    response = resolveTriggerIfPresent(session, response, 'D163_JourneymanBricklayer')
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })
})

describe('D168 Stockman parity', () => {
  it('D168 S1: Stockman can be played as the first occupation', () => {
    const response = playOccupation(setup({
      cardId: 'D168_Stockman', played: false, playerCount: 4,
    }), 'D168_Stockman')
    expect(response.state.players[0]!.occupationPlayed).toContain('D168_Stockman')
  })

  it('D168 S2: building the second stable gains one cattle', () => {
    const session = setup({ cardId: 'D168_Stockman', playerCount: 4, resources: { wood: 2 } })
    session.state.players[0]!.stableTiles = [{ row: 0, col: 2 }]
    session.loadState(session.state)
    const response = buildStable(session)
    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(response.state.players[0]!.resources.cattle).toBe(1)
  })

  it('D168 S3: building only the first stable grants no animal', () => {
    const response = buildStable(setup({
      cardId: 'D168_Stockman', playerCount: 4, resources: { wood: 2 },
    }))
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 0 })
  })

  it.each([
    { scenario: 'S4', existing: 2, animal: 'boar' as const },
    { scenario: 'S5', existing: 3, animal: 'sheep' as const },
  ])('D168 $scenario: building stable number $existing + 1 gains one $animal', ({ existing, animal }) => {
    const session = setup({ cardId: 'D168_Stockman', playerCount: 4, resources: { wood: 2 } })
    session.state.players[0]!.stableTiles = Array.from({ length: existing }, (_, col) => ({ row: 0, col: col + 2 }))
    session.loadState(session.state)
    const response = buildStable(session)
    expect(response.state.players[0]!.stableTiles).toHaveLength(existing + 1)
    expect(response.state.players[0]!.resources[animal]).toBe(1)
  })
})

describe('D149 Casual Worker parity', () => {
  it('D149 S1: Casual Worker can be played as the first occupation', () => {
    expect(playOccupation(setup({
      cardId: 'D149_CasualWorker', played: false, playerCount: 4,
    }), 'D149_CasualWorker').state.players[0]!.occupationPlayed).toContain('D149_CasualWorker')
  })

  const quarry = (kind: 'food' | 'stable') => {
    const session = setup({ cardId: 'D149_CasualWorker', playerCount: 4, round: 9, actor: 1 })
    session.state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 1
    session.loadState(session.state)
    let response = session.takeAction(1, 'western-quarry')
    while (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    response = resolveTriggerIfPresent(session, response, 'D149_CasualWorker')
    response = choose(session, response, (option) => option.value !== '__skip__'
      && (kind === 'food'
        ? option.effectPreview?.resourcesGained?.food === 1
        : JSON.stringify(option).toLowerCase().includes('stable')))
    return { session, response }
  }

  it('D149 S2: an opponent using a Quarry may give the owner one food', () => {
    expect(quarry('food').response.state.players[0]!.resources.food).toBe(21)
  })

  it('D149 S3: an opponent using a Quarry may build a free stable', () => {
    const { session, response: pending } = quarry('stable')
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (pending.interaction.stateId !== 'wait'
      || pending.interaction.request.kind !== 'farm-select') return
    const response = session.commitSelectionChoice(0, {
      stables: [pending.interaction.request.farm.selectableTiles[0]!],
    })
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
  })
})

describe('D150 Godly Spouse parity', () => {
  it('D150 S1: Godly Spouse can be played as the first occupation', () => {
    expect(playOccupation(setup({
      cardId: 'D150_GodlySpouse', played: false, playerCount: 4,
    }), 'D150_GodlySpouse').state.players[0]!.occupationPlayed).toContain('D150_GodlySpouse')
  })

  const growAsSecond = (firstSpace: 'forest' | 'meeting-place') => {
    const session = setup({ cardId: 'D150_GodlySpouse', playerCount: 4, round: 6 })
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 3
    const firstWorker = player.workers.find((worker) => worker.isActive)!.id
    state.actionSpaces.find((space) => space.id === firstSpace)!.takenBy = [{
      playerId: player.id, workerId: firstWorker,
    }]
    recordRoundPlacement(player, firstSpace, firstWorker)
    session.loadState(state)
    let response = session.takeAction(0, 'wish-children')
    if (response.interaction.stateId === 'wait'
      && response.interaction.sourceCard === 'D150_GodlySpouse') {
      expect(options(response), JSON.stringify(response.interaction))
        .not.toContainEqual(expect.objectContaining({ value: '__skip__' }))
    }
    if (response.interaction.stateId === 'wait') {
      const use = options(response).find((option) => option.labelKey === 'ui.interactionGodlySpouseUse'
        || option.sourceCard === 'D150_GodlySpouse' && option.value !== '__skip__')
      if (use) response = session.resolveChoice(response.interaction.playerIndex, use.value)
    }
    return { response, firstWorker }
  }

  it('D150 S2: second-person family growth must return the first worker home', () => {
    const { response, firstWorker } = growAsSecond('forest')
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .not.toContainEqual(expect.objectContaining({ workerId: firstWorker }))
  })

  it('D150 S3: a first worker on Meeting Place is not returned', () => {
    const { response, firstWorker } = growAsSecond('meeting-place')
    expect(response.state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy)
      .toContainEqual(expect.objectContaining({ workerId: firstWorker }))
  })

  it('D150 S4: family growth during the returning-home phase does not trigger Godly Spouse', () => {
    const session = setup({
      cardId: 'D150_GodlySpouse', playerCount: 4, round: 6, resources: { food: 21 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 3
    player.minorPlayed = ['D010_StorksNest']
    const workers = player.workers.filter((worker) => worker.isActive)
    for (const [index, spaceId] of ['forest', 'clay-pit'].entries()) {
      const worker = workers[index]!
      state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{
        playerId: player.id, workerId: worker.id,
      }]
      recordRoundPlacement(player, spaceId, worker.id)
    }
    prepareRoundEnd(session)

    let response = resolveTriggerIfPresent(session, session.performRoundEnd(), 'D010_StorksNest')
    response = choose(session, response, (option) => option.value !== '__skip__')

    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.events).not.toContainEqual(expect.objectContaining({
      type: 'card.triggered',
      sourceCardId: 'D150_GodlySpouse',
      sourceActionId: 'recall-placed-worker',
    }))
  })

  it('D150 S5: Sidekick placing the second person on Family Growth recalls the first person', () => {
    const session = setup({
      cardId: 'D150_GodlySpouse', playerCount: 2, round: 14, resources: { food: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 3
    player.occupationPlayed.push('A171_Sidekick')
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'wish-children'
    state.roundActionOrder[1] = 'western-quarry'
    session.loadState(state)

    let response = session.takeAction(0, 'western-quarry')
    expect(response.ok, response.error).toBe(true)
    const firstWorker = response.state.actionSpaces.find((space) => space.id === 'western-quarry')!.takenBy[0]!
    response = resolveTriggerIfPresent(session, response, 'A171_Sidekick')
    response = choose(session, response, (option) => option.value !== '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'western-quarry')!.takenBy)
      .not.toContainEqual(firstWorker)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'card.triggered', sourceCardId: 'D150_GodlySpouse', sourceActionId: 'recall-placed-worker',
    }))
  })

  it.each([false, true])('D150 S6: Bed Maker growth respects its originating placement (anytime=%s)', (anytime) => {
    const session = setup({
      cardId: 'D150_GodlySpouse', playerCount: 2, round: 14,
      resources: { wood: 1, grain: 1, stone: 5, reed: 2 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('A093_BedMaker', 'C087_Mason')
    player.houseType = 'stone'
    player.rooms = 4
    player.roomTiles = Array.from({ length: 4 }, (_, col) => ({ row: 0, col }))
    player.cardStates.C087_Mason = { extraData: { hasRoom: true } }
    const firstWorker = { playerId: player.id, workerId: player.workers.find((worker) => worker.isActive)!.id }
    state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [firstWorker]
    recordRoundPlacement(player, 'forest', firstWorker.workerId)
    session.loadState(state)

    let response = session.takeAction(0, anytime ? 'farmland' : 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    if (anytime) response = session.takeAnytimeAction(0, 'C87-mason-anytime')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
    })
    response = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 4 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(5)
    response = resolveTriggerIfPresent(session, response, 'A093_BedMaker')
    response = choose(session, response, (option) => option.value !== '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, grain: 0, stone: anytime ? 5 : 0, reed: anytime ? 2 : 0,
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy.some((worker) =>
      worker.playerId === firstWorker.playerId && worker.workerId === firstWorker.workerId,
    ))
      .toBe(anytime)
    expect(response.state.events.filter((event) =>
      event.type === 'card.triggered' && event.sourceCardId === 'D150_GodlySpouse',
    )).toHaveLength(anytime ? 0 : 1)
    if (anytime) {
      expect(response.interaction).toMatchObject({
        stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
      })
    }
  })
})

describe('D157 Party Organizer parity', () => {
  it('D157 S1: Party Organizer can be played as the first occupation', () => {
    expect(playOccupation(setup({
      cardId: 'D157_PartyOrganizer', played: false, playerCount: 4,
    }), 'D157_PartyOrganizer').state.players[0]!.occupationPlayed).toContain('D157_PartyOrganizer')
  })

  it('D157 S2: an opponent reaching five people gives the owner eight food', () => {
    const session = setup({ cardId: 'D157_PartyOrganizer', playerCount: 4, round: 6, actor: 1 })
    const state = session.getState().state
    const opponent = state.players[1]!
    setActiveWorkerCount(opponent, 4)
    setWorkersAtHome(state, opponent, 4)
    opponent.rooms = 5
    session.loadState(state)
    let response = session.takeAction(1, 'wish-children')
    while (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    response = resolveTriggerIfPresent(session, response, 'D157_PartyOrganizer')
    expect(familySize(response.state.players[1]!)).toBe(5)
    expect(response.state.players[0]!.resources.food).toBe(28)
  })

  it('D157 S3: only the sole five-person player scores three points', () => {
    const session = setup({ cardId: 'D157_PartyOrganizer', playerCount: 4, round: 14 })
    setActiveWorkerCount(session.state.players[0]!, 5)
    session.loadState(session.state)
    expect(bonus(session.getState(), 'D157_PartyOrganizer')).toBe(3)
  })
})

describe('D167 Pure Breeder parity', () => {
  it('D167 S1: playing Pure Breeder immediately gains one wood', () => {
    const response = playOccupation(setup({
      cardId: 'D167_PureBreeder', played: false, playerCount: 4,
    }), 'D167_PureBreeder')
    expect(response.state.players[0]!.occupationPlayed).toContain('D167_PureBreeder')
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  const breedingRound = (round: number) => {
    const session = setup({
      cardId: 'D167_PureBreeder', playerCount: 4, round, resources: { sheep: 2 },
    })
    session.state.players[0]!.pastures = [{
      id: 'sheep-pasture', size: 2,
      tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 0, animalType: 'sheep', animalCount: 2,
    }]
    prepareRoundEnd(session)
    return autoAdvanceRoundEnd(session, {
      onChoice: (interaction, current) => {
        const option = interaction.request.options?.find((entry) =>
          entry.sourceCard === 'D167_PureBreeder' && entry.value !== '__skip__')
          ?? (interaction.sourceCard === 'D167_PureBreeder'
            ? interaction.request.options?.find((entry) => entry.value !== '__skip__')
            : undefined)
        return option
          ? current.resolveChoice(interaction.playerIndex, option.value)
          : undefined
      },
    })
  }

  it('D167 S2: after a non-harvest round exactly one animal type may breed', () => {
    expect(breedingRound(5).state.players[0]!.resources.sheep).toBe(3)
  })

  it('D167 S3: after a harvest round Pure Breeder does not breed again', () => {
    expect(breedingRound(4).state.players[0]!.resources.sheep).toBe(3)
  })
})
