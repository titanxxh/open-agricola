import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/D/D090_PlowMaker'
import '../../shared/cards/D/D110_FishFarmer'
import '../../shared/cards/D/D111_InteriorDecorator'
import '../../shared/cards/D/D123_RenovationPreparer'
import '../../shared/cards/D/D125_ForestTrader'
import '../../shared/cards/D/D131_CraftsmanshipPromoter'
import '../../shared/cards/D/D135_GardeningHeadOfficial'
import '../../shared/cards/D/D136_AnimalActivist'

const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  cardId, played = true, playerCount = 2, round = 5, actor = 0, resources = {},
}: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  actor?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(8400 + round, undefined, { playerCount })
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
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  Object.assign(player.resources, resources)
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

const accept = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  return response.interaction.stateId === 'wait'
    ? choose(session, response, (option) => option.value !== '__skip__')
    : response
}

const decline = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  return response.interaction.stateId === 'wait'
    && options(response).some((option) => option.value === '__skip__')
    ? session.resolveChoice(response.interaction.playerIndex, '__skip__')
    : response
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

const plow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(response.interaction.playerIndex, {
    tile: response.interaction.request.farm.selectableTiles[0]!,
  })
}

const buildRoom = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(response.interaction.playerIndex, {
    rooms: [response.interaction.request.farm.selectableTiles[0]!],
  })
}

const bonus = (response: SessionResponse, cardId: string, player = 0) =>
  response.scores[player]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

describe('D090 Plow Maker parity', () => {
  it('D090 S1: Plow Maker can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'D090_PlowMaker', played: false }), 'D090_PlowMaker')
      .state.players[0]!.occupationPlayed).toContain('D090_PlowMaker')
  })

  it.each([{ action: 'farmland' }, { action: 'cultivation' }])(
    'D090 $action may pay one food for one additional field',
    ({ action }) => {
      const session = setup({ cardId: 'D090_PlowMaker', round: 9, resources: { food: 1 } })
      let response = accept(session, session.takeAction(0, action), 'D090_PlowMaker')
      response = plow(session, response)
      if (response.interaction.stateId === 'wait'
        && response.interaction.request.kind === 'farm-select'
        && response.interaction.request.farm.farmType === 'plow') response = plow(session, response)
      expect(response.state.players[0]!.fields).toHaveLength(2)
      expect(response.state.players[0]!.resources.food).toBe(0)
    },
  )

  it('D090 S4: the additional Plow Maker field may be declined', () => {
    const session = setup({ cardId: 'D090_PlowMaker', resources: { food: 1 } })
    let response = decline(session, session.takeAction(0, 'farmland'), 'D090_PlowMaker')
    response = plow(session, response)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })
})

describe('D110 Fish Farmer parity', () => {
  it('D110 S1: Fish Farmer can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'D110_FishFarmer', played: false }), 'D110_FishFarmer')
      .state.players[0]!.occupationPlayed).toContain('D110_FishFarmer')
  })

  it.each([
    { fishing: 1, action: 'reed-bank', resource: 'reed' },
    { fishing: 2, action: 'clay-pit', resource: 'clay' },
    { fishing: 3, action: 'forest', resource: 'wood' },
  ] as const)('D110 Fishing count maps to $action for two food', ({ fishing, action, resource }) => {
    const session = setup({ cardId: 'D110_FishFarmer' })
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = fishing
    session.state.actionSpaces.find((space) => space.id === action)!.resources[resource] = 1
    session.loadState(session.state)
    const response = session.takeAction(0, action)
    expect(response.state.players[0]!.resources).toMatchObject({ [resource]: 1, food: 2 })
  })

  it('D110 S5: a mismatched Fishing count grants no Fish Farmer food', () => {
    const session = setup({ cardId: 'D110_FishFarmer' })
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 2
    session.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 1
    session.loadState(session.state)
    expect(session.takeAction(0, 'reed-bank').state.players[0]!.resources.food).toBe(0)
  })
})

describe('D111 Interior Decorator parity', () => {
  it('D111 S1: Interior Decorator can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'D111_InteriorDecorator', played: false }), 'D111_InteriorDecorator')
      .state.players[0]!.occupationPlayed).toContain('D111_InteriorDecorator')
  })

  it.each([{ round: 5, rounds: [6, 7, 8, 9, 10, 11] }, { round: 12, rounds: [13, 14] }])(
    'D111 renovation in round $round schedules remaining food',
    ({ round, rounds }) => {
      const session = setup({ cardId: 'D111_InteriorDecorator', round, resources: { clay: 2, reed: 1 } })
      const response = session.takeAction(0, 'house-redevelopment')
      expect(response.state.players[0]!.houseType).toBe('clay')
      expect(response.state.futureMeeples.filter((entry) =>
        entry.cardId === 'D111_InteriorDecorator' && (entry.resources.food ?? 0) > 0)
        .map((entry) => entry.round)).toEqual(rounds)
    },
  )
})

describe('D123 Renovation Preparer parity', () => {
  it('D123 S1: Renovation Preparer can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'D123_RenovationPreparer', played: false }), 'D123_RenovationPreparer')
      .state.players[0]!.occupationPlayed).toContain('D123_RenovationPreparer')
  })

  it.each([
    { houseType: 'wood' as const, resource: 'wood' as const, reward: 'clay' as const },
    { houseType: 'clay' as const, resource: 'clay' as const, reward: 'stone' as const },
  ])('D123 a new $houseType room gains two $reward', ({ houseType, resource, reward }) => {
    const session = setup({
      cardId: 'D123_RenovationPreparer', resources: { [resource]: 5, reed: 2 },
    })
    session.state.players[0]!.houseType = houseType
    session.loadState(session.state)
    const response = buildRoom(session)
    expect(response.state.players[0]!.resources[reward]).toBe(2)
  })
})

describe('D125 Forest Trader parity', () => {
  it('D125 S1: Forest Trader can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'D125_ForestTrader', played: false }), 'D125_ForestTrader')
      .state.players[0]!.occupationPlayed).toContain('D125_ForestTrader')
  })

  it.each([{ food: 1, resource: 'reed' }, { food: 2, resource: 'stone' }] as const)(
    'D125 Forest may buy one $resource for food',
    ({ food, resource }) => {
      const session = setup({ cardId: 'D125_ForestTrader', resources: { food } })
      session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 2
      session.loadState(session.state)
      let response = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), 'D125_ForestTrader')
      response = choose(session, response, (option) =>
        option.effectPreview?.kind === 'resourceExchange'
          && option.effectPreview.resourcesGained?.[resource] === 1)
      if (response.interaction.stateId === 'wait') {
        response = choose(session, response, (option) => option.value !== '__skip__')
      }
      expect(response.state.players[0]!.resources)
        .toMatchObject({ food: 0, wood: 2, [resource]: 1 })
    },
  )

  it('D125 S4: the Forest Trader purchase may be declined', () => {
    const session = setup({ cardId: 'D125_ForestTrader', resources: { food: 2 } })
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 2
    session.loadState(session.state)
    const response = decline(session, session.takeAction(0, 'forest'), 'D125_ForestTrader')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, stone: 0 })
  })

  it('D125 S5: Reed Bank gives no Forest Trader offer', () => {
    const session = setup({ cardId: 'D125_ForestTrader', resources: { food: 2 } })
    session.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
    session.loadState(session.state)
    expect(JSON.stringify(session.takeAction(0, 'reed-bank').interaction)).not.toContain('D125_ForestTrader')
  })
})

describe('D131 Craftsmanship Promoter parity', () => {
  it('D131 S1: Craftsmanship Promoter immediately gains one stone', () => {
    const response = playOccupation(setup({
      cardId: 'D131_CraftsmanshipPromoter', played: false, playerCount: 3,
    }), 'D131_CraftsmanshipPromoter')
    expect(response.state.players[0]!.occupationPlayed).toContain('D131_CraftsmanshipPromoter')
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })

  it('D131 S2: a Minor Improvement action may build a bottom-row Pottery', () => {
    const session = setup({
      cardId: 'D131_CraftsmanshipPromoter', playerCount: 3, resources: { clay: 2, stone: 2 },
    })
    session.state.availableMajorImprovements = ['Major_Pottery']
    session.loadState(session.state)
    let response = session.takeAction(0, 'meeting-place')
    response = choose(session, response, (option) => option.value.startsWith('action-improvement-'))
    if (!response.state.players[0]!.improvements.includes('Major_Pottery')) {
      response = choose(session, response, (option) => option.value === 'Major_Pottery')
    }
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
      response = choose(session, response, (option) => option.value !== 'cancel')
    }
    expect(response.state.players[0]!.improvements).toContain('Major_Pottery')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0 })
  })
})

describe('D135 and D136 shared scoring parity', () => {
  it.each([
    { cardId: 'D135_GardeningHeadOfficial', round: 5, wood: 4 },
    { cardId: 'D135_GardeningHeadOfficial', round: 8, wood: 3 },
    { cardId: 'D135_GardeningHeadOfficial', round: 11, wood: 2 },
    { cardId: 'D136_AnimalActivist', round: 5, wood: 4 },
    { cardId: 'D136_AnimalActivist', round: 12, wood: 0 },
  ])('$cardId played in round $round gains $wood wood', ({ cardId, round, wood }) => {
    const response = playOccupation(setup({ cardId, played: false, playerCount: 3, round }), cardId)
    expect(response.state.players[0]!.resources.wood).toBe(wood)
  })

  it('D135 S4: tied leaders with vegetables in fields each score two points', () => {
    const session = setup({ cardId: 'D135_GardeningHeadOfficial', playerCount: 3, round: 14 })
    for (const player of session.state.players.slice(0, 2)) {
      player.fields = [{ row: 1, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    }
    session.loadState(session.state)
    const response = session.getState()
    expect(bonus(response, 'D135_GardeningHeadOfficial', 0)).toBe(2)
    expect(bonus(response, 'D135_GardeningHeadOfficial', 1)).toBe(0)
  })

  it('D135 S5: with no vegetables OA awards no tied players', () => {
    const response = setup({ cardId: 'D135_GardeningHeadOfficial', playerCount: 3, round: 14 }).getState()
    expect(bonus(response, 'D135_GardeningHeadOfficial', 0)).toBe(0)
    expect(bonus(response, 'D135_GardeningHeadOfficial', 1)).toBe(0)
  })

  it('D136 S3: tied leaders with fenced stables each score two points', () => {
    const session = setup({ cardId: 'D136_AnimalActivist', playerCount: 3, round: 14 })
    for (const [index, player] of session.state.players.slice(0, 2).entries()) {
      player.pastures = [{
        id: `p-${index}`, size: 1, tiles: [{ row: 1, col: 1 }], stables: 1,
        animalType: null, animalCount: 0,
      }]
      player.stableTiles = [{ row: 1, col: 1 }]
    }
    session.loadState(session.state)
    const response = session.getState()
    expect(bonus(response, 'D136_AnimalActivist', 0)).toBe(2)
    expect(bonus(response, 'D136_AnimalActivist', 1)).toBe(0)
  })

  it('D136 S4: with no fenced stables OA awards no tied players', () => {
    const response = setup({ cardId: 'D136_AnimalActivist', playerCount: 3, round: 14 }).getState()
    expect(bonus(response, 'D136_AnimalActivist', 0)).toBe(0)
    expect(bonus(response, 'D136_AnimalActivist', 1)).toBe(0)
  })
})
