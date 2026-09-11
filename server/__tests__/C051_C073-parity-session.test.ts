import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/C/C051_FishingNet'
import '../../shared/cards/C/C055_Studio'
import '../../shared/cards/C/C056_FeedFence'
import '../../shared/cards/C/C057_Crudite'
import '../../shared/cards/C/C058_Woodcraft'
import '../../shared/cards/C/C059_SchnappsDistillery'
import '../../shared/cards/C/C060_SmallPottersOven'
import '../../shared/cards/C/C061_BeerStein'
import '../../shared/cards/C/C062_CookeryExtension'
import '../../shared/cards/C/C063_CraftBrewery'
import '../../shared/cards/C/C064_CornSchnappsDistillery'
import '../../shared/cards/C/C071_Slurry'
import '../../shared/cards/C/C072_FestivalPlanning'
import '../../shared/cards/C/C073_SeaweedFertilizer'
import '../../shared/cards/D/D003_Furrows'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A125_Priest', 'B121_Geologist', 'C123_Freemason']
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  cardId, played = true, playerCount = 2, round = 5, occupations = 0, resources = {},
}: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  occupations?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(7900 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]; player.occupationHand = [FILLER]
    player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
    player.fields = []; player.pastures = []; player.stableTiles = []; player.fenceSegments = []
    player.houseAnimalType = null; player.houseAnimalCount = 0; player.stableAnimals = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
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

const accept = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  if (response.interaction.stateId !== 'wait') return response
  return choose(session, response, (option) => option.value !== '__skip__')
}

const decline = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  if (response.interaction.stateId === 'wait' && options(response).some((option) => option.value === '__skip__')) {
    return session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  return response
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait') {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(0, branch.value)
  }
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === cardId || option.value === `minor:${cardId}`)
    if (card) response = session.resolveChoice(0, card.value)
  }
  return response
}

const scoringBonus = (response: SessionResponse, cardId: string) => response.scores[0]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

const prepareHarvest = (session: GameSession, activeWorkers = 1) => {
  session.state.players.forEach((player) => {
    markAllWorkersUsed(session.state, player); setActiveWorkerCount(player, 0); player.resources.food = 20
  })
  setActiveWorkerCount(session.state.players[0]!, activeWorkers)
  markAllWorkersUsed(session.state, session.state.players[0]!)
  session.loadState(session.state)
}

describe('C051 Fishing Net parity', () => {
  it('C051 S1: paying one reed plays Fishing Net', () => {
    const response = playMinor(setup({ cardId: 'C051_FishingNet', played: false, resources: { reed: 1 } }), 'C051_FishingNet')
    expect(response.state.players[0]!.minorPlayed).toContain('C051_FishingNet')
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })
  const opponentFishing = (food: number) => {
    const session = setup({ cardId: 'C051_FishingNet' })
    const opponent = session.state.players[1]!
    session.state.actionSpaces.forEach((space) => {
      space.takenBy = space.takenBy.filter((ref) => ref.playerId !== opponent.id)
    })
    setActiveWorkerCount(opponent, 2); setWorkersAtHome(session.state, opponent, 2)
    opponent.resources.food = food
    session.state.currentPlayerIndex = 1
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 2
    session.loadState(session.state)
    return { session, response: session.takeAction(1, 'fishing') }
  }
  it('C051 S2: an opponent pays one existing food before collecting Fishing', () => {
    const { session } = opponentFishing(1)
    let response = session.getState()
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[1]!.resources.food).toBe(2)
  })
  it('C051 S3: after the opponent uses Fishing the return-home phase places two food there', () => {
    const session = new GameSession(7951, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.currentPlayerIndex = 1
    state.players[0]!.minorPlayed.push('C051_FishingNet')
    session.state.players.forEach((player) => {
      setActiveWorkerCount(player, 1)
      setWorkersAtHome(session.state, player, 1)
      player.resources.food = 20
    })
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 2
    session.loadState(session.state)

    let response = session.takeAction(1, 'fishing')
    for (let guard = 0; guard < 8 && response.interaction.stateId === 'wait'; guard += 1) {
      if (response.interaction.request.kind === 'confirm-player-switch') {
        response = confirmPlayerSwitch(session)
      } else if (response.interaction.request.kind === 'confirm-next-player') {
        response = confirmNextPlayer(session)
      } else break
    }
    response = session.takeAction(0, 'day-laborer')
    for (let guard = 0; guard < 8 && response.interaction.stateId === 'wait'; guard += 1) {
      if (response.interaction.request.kind === 'confirm-player-switch') {
        response = confirmPlayerSwitch(session)
      } else if (response.interaction.request.kind === 'confirm-next-player') {
        response = confirmNextPlayer(session)
      } else break
    }

    expect(response.state.round).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food).toBe(3)
    expect(response.state.players[0]!.cardStates.C051_FishingNet?.flagged).toBe(false)
  })
  it('C051 S4: OA rejects Fishing before placement when the opponent has no food', () => {
    const { response } = opponentFishing(0)
    expect(response.ok).toBe(false)
    expect(response.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food).toBe(2)
  })
  it('C051 S5: the owner uses Fishing without paying their own Fishing Net', () => {
    const session = setup({ cardId: 'C051_FishingNet' })
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 2
    session.loadState(session.state)
    expect(session.takeAction(0, 'fishing').state.players[0]!.resources.food).toBe(2)
  })
})

describe('C055 Studio parity', () => {
  it('C055 S1: paying one clay and one reed plays Studio', () => {
    const response = playMinor(setup({ cardId: 'C055_Studio', played: false, resources: { clay: 1, reed: 1 } }), 'C055_Studio')
    expect(response.state.players[0]!.minorPlayed).toContain('C055_Studio')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })
  it.each([
    { scenario: 'S2', resource: 'wood', gained: 2 },
    { scenario: 'S3', resource: 'clay', gained: 2 },
    { scenario: 'S4', resource: 'stone', gained: 3 },
  ])('C055 $scenario: feeding converts one $resource into food', ({ resource, gained }) => {
    const session = setup({ cardId: 'C055_Studio', round: 4, resources: { [resource]: 1 } })
    prepareHarvest(session)
    let response = session.performRoundEnd()
    response = accept(session, response, 'C055_Studio')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = choose(session, response, (option) => JSON.stringify(option).toLowerCase().includes(resource))
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[resource]).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(20 + gained - 2)
  })
  it('C055 S5: feeding may decline the Studio exchange', () => {
    const session = setup({ cardId: 'C055_Studio', round: 4, resources: { wood: 1 } }); prepareHarvest(session)
    const response = session.resolveChoice(0, 'confirm', { selections: [] })
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })
})

describe('C056 Feed Fence parity', () => {
  it('C056 S1: paying one wood plays Feed Fence', () => {
    const response = playMinor(setup({ cardId: 'C056_FeedFence', played: false, resources: { wood: 1 } }), 'C056_FeedFence')
    expect(response.state.players[0]!.minorPlayed).toContain('C056_FeedFence')
  })
  const stables = (count: number, existing = 0) => {
    const session = setup({ cardId: 'C056_FeedFence', resources: { clay: 1, wood: Math.max(0, (count - 1) * 2) } })
    session.state.players[0]!.stableTiles = Array.from({ length: existing }, (_, index) => ({ row: 2, col: index + 2 }))
    session.loadState(session.state)
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = choose(session, response, (option) => JSON.stringify(option).includes('stable'))
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
    return session.commitSelectionChoice(0, { stables: response.interaction.request.farm.selectableTiles.slice(0, count) })
  }
  it('C056 S2: one standard stable may cost one clay and grants one food', () => {
    expect(stables(1).state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0, food: 1 })
  })
  it('C056 S3: building two stables substitutes clay for one and grants two food', () => {
    expect(stables(2).state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0, food: 2 })
  })
  it('C056 S4: building the fourth stable grants three food', () => {
    expect(stables(1, 3).state.players[0]!.resources.food).toBe(3)
  })
})

describe('C057 Crudite parity', () => {
  it('C057 S1: playing Crudite may buy one vegetable for three food', () => {
    const session = setup({ cardId: 'C057_Crudite', played: false, resources: { food: 3 } })
    let response = playMinor(session, 'C057_Crudite'); response = accept(session, response, 'C057_Crudite')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
  })
  it('C057 S2: the immediate Crudite purchase may be declined', () => {
    const session = setup({ cardId: 'C057_Crudite', played: false, resources: { food: 3 } })
    const response = decline(session, playMinor(session, 'C057_Crudite'), 'C057_Crudite')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, vegetable: 0 })
  })
  it('C057 S3: anytime use removes one of two field vegetables for four food', () => {
    const session = setup({ cardId: 'C057_Crudite' })
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
    session.loadState(session.state)
    const anytime = session.getState().interaction.anytimeActions.find((entry) => entry.id === 'C57-crudite-anytime')
    expect(anytime).toBeDefined()
    const response = session.takeAnytimeAction(0, anytime!.id)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(4)
  })
  it('C057 S4: one field vegetable offers no Crudite anytime use', () => {
    const session = setup({ cardId: 'C057_Crudite' })
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    session.loadState(session.state)
    expect(session.getState().interaction.anytimeActions.some((entry) => entry.id === 'C57-crudite-anytime')).toBe(false)
  })
})

describe('C058 Woodcraft parity', () => {
  it('C058 S1: one occupation allows Woodcraft to be played', () => {
    expect(playMinor(setup({ cardId: 'C058_Woodcraft', played: false, occupations: 1 }), 'C058_Woodcraft')
      .state.players[0]!.minorPlayed).toContain('C058_Woodcraft')
  })
  const collect = (supplyWood: number, pile: number, space = 'forest') => {
    const session = setup({ cardId: 'C058_Woodcraft', occupations: 1, resources: { wood: supplyWood } })
    session.state.actionSpaces.find((entry) => entry.id === space)!.resources = {
      ...session.state.actionSpaces.find((entry) => entry.id === space)!.resources,
      ...(space === 'forest' ? { wood: pile } : { clay: pile }),
    }
    session.loadState(session.state)
    return session.takeAction(0, space)
  }
  it('C058 S2: collecting wood to at most five gains one food', () => {
    expect(collect(0, 5).state.players[0]!.resources).toMatchObject({ wood: 5, food: 1 })
  })
  it('C058 S3: ending above five wood grants no food', () => {
    expect(collect(3, 3).state.players[0]!.resources).toMatchObject({ wood: 6, food: 0 })
  })
  it('C058 S4: collecting clay grants no Woodcraft food', () => {
    expect(collect(0, 3, 'clay-pit').state.players[0]!.resources.food).toBe(0)
  })
})

describe('C059 Schnapps Distillery parity', () => {
  it('C059 S1: one vegetable and two stone play Schnapps Distillery', () => {
    const response = playMinor(setup({ cardId: 'C059_SchnappsDistillery', played: false, resources: { vegetable: 1, stone: 2 } }), 'C059_SchnappsDistillery')
    expect(response.state.players[0]!.minorPlayed).toContain('C059_SchnappsDistillery')
  })
  it('C059 S2: feeding converts exactly one vegetable into five food', () => {
    const session = setup({ cardId: 'C059_SchnappsDistillery', round: 4, resources: { vegetable: 2 } }); prepareHarvest(session)
    let response = session.performRoundEnd()
    response = session.resolveChoice(0, 'confirm', { selections: [{ sourceId: 'C059_SchnappsDistillery', exchangeIndex: 0, count: 1, sourceName: 'Schnapps Distillery' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(23)
  })
  it('C059 S6: the Schnapps Distillery feeding exchange may be declined', () => {
    const session = setup({ cardId: 'C059_SchnappsDistillery', round: 4, resources: { vegetable: 2 } })
    prepareHarvest(session)
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'feed' } })
    response = session.resolveChoice(0, 'confirm', { selections: [] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(18)
  })
  it.each([{ vegetables: 4, score: 0 }, { vegetables: 5, score: 1 }, { vegetables: 6, score: 2 }])(
    'C059 scoring: $vegetables vegetables give $score points', ({ vegetables, score }) => {
      const session = setup({ cardId: 'C059_SchnappsDistillery', round: 14, resources: { vegetable: vegetables } })
      expect(scoringBonus(session.getState(), 'C059_SchnappsDistillery')).toBe(score)
    })
})

describe('C060 Small Potters Oven parity', () => {
  it('C060 S1: returning Clay Oven and paying two clay gives five food', () => {
    const session = setup({ cardId: 'C060_SmallPottersOven', played: false, resources: { clay: 2 } })
    session.state.players[0]!.improvements = ['Major_ClayOven']; session.loadState(session.state)
    const response = playMinor(session, 'C060_SmallPottersOven')
    expect(response.state.players[0]!.minorPlayed).toContain('C060_SmallPottersOven')
    expect(response.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(response.state.players[0]!.resources.food).toBe(5)
  })
  it('C060 S2: without an oven Small Potters Oven is unavailable', () => {
    expect(playMinor(setup({ cardId: 'C060_SmallPottersOven', played: false, resources: { clay: 2 } }), 'C060_SmallPottersOven')
      .state.players[0]!.minorHand).toContain('C060_SmallPottersOven')
  })
  it('C060 S3: before Bake Bread Small Potters Oven may build Clay Oven then bake', () => {
    const session = setup({
      cardId: 'C060_SmallPottersOven', resources: { clay: 3, stone: 1, grain: 1 },
    })
    session.state.availableMajorImprovements = ['Major_ClayOven']
    session.loadState(session.state)

    let response = resolveTriggerIfPresent(
      session, session.takeAction(0, 'grain-utilization'), 'C060_SmallPottersOven',
    )
    response = choose(session, response, (option) => option.value !== '__skip__')
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionOptionalAction') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(response.state.players[0]!.resources).toMatchObject({
      clay: 0, stone: 0, grain: 0, food: 5,
    })
  })
})

describe('C061 Beer Stein parity', () => {
  it('C061 S1: paying one clay plays Beer Stein', () => {
    const response = playMinor(setup({ cardId: 'C061_BeerStein', played: false, resources: { clay: 1 } }), 'C061_BeerStein')
    expect(response.state.players[0]!.minorPlayed).toContain('C061_BeerStein')
  })
  const bake = (extra: boolean) => {
    const session = setup({ cardId: 'C061_BeerStein', resources: { grain: 2 } })
    session.state.players[0]!.improvements = ['Major_Fireplace1']; session.loadState(session.state)
    let response = session.takeAction(0, 'grain-utilization')
    response = choose(session, response, (option) => option.value.includes('Major_Fireplace1'))
    response = extra ? accept(session, response, 'C061_BeerStein') : decline(session, response, 'C061_BeerStein')
    return response
  }
  it('C061 S2: after normal baking Beer Stein may convert a second grain for food and a point', () => {
    const response = bake(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
    expect(scoringBonus(response, 'C061_BeerStein')).toBe(1)
  })
  it('C061 S3: the Beer Stein exchange may be declined', () => {
    expect(bake(false).state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
  })
})

describe('C062 Cookery Extension parity', () => {
  it('C062 S1: paying two clay plays Cookery Extension', () => {
    const response = playMinor(setup({ cardId: 'C062_CookeryExtension', played: false, resources: { clay: 2 } }), 'C062_CookeryExtension')
    expect(response.state.players[0]!.minorPlayed).toContain('C062_CookeryExtension')
  })
  it('C062 S2: OA public feeding rejects the doubled Fireplace exchange without mutating state', () => {
    const session = setup({ cardId: 'C062_CookeryExtension', round: 4, resources: { vegetable: 2 } })
    session.state.players[0]!.improvements = ['Major_Fireplace1']
    prepareHarvest(session, 2)
    expect(session.getState().state.players[0]!.resources).toMatchObject({ vegetable: 2, food: 20 })
    let offered = session.performRoundEnd()
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', spaceId: '__subflow:post-reap-anytime' })
    offered = session.takeAnytimeAction(0, 'exchange')
    expect(offered.ok, offered.error).toBe(true)
    expect(options(offered).some((option) => option.sourceCard === 'Major_Fireplace1')).toBe(true)
    expect(options(offered).some((option) => option.sourceCard?.startsWith('C062_CookeryExtension'))).toBe(false)
    offered = session.resolveChoice(0, 'cancel')
    expect(offered.ok, offered.error).toBe(true)
    offered = session.resolveChoice(0, '__skip__')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction, JSON.stringify(offered.interaction)).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'feed', remaining: 0, foodUsed: 4 },
    })
    expect(offered.state.players[0]!.resources).toMatchObject({ vegetable: 2, food: 16 })
    const before = JSON.stringify(offered.state)
    const rejected = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: 'C062_CookeryExtension::Major_Fireplace1', exchangeIndex: 0, count: 1,
    }] })
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    expect(rejected.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'feed' } })
    const finished = session.resolveChoice(0, 'confirm', { selections: [] })
    expect(finished.ok, finished.error).toBe(true)
    expect(finished.state.players[0]!.resources).toMatchObject({ vegetable: 2, food: 16 })
  })
})

describe('C063 Craft Brewery parity', () => {
  it('C063 S1: paying two wood and one clay plays Craft Brewery', () => {
    const response = playMinor(setup({ cardId: 'C063_CraftBrewery', played: false, resources: { wood: 2, clay: 1 } }), 'C063_CraftBrewery')
    expect(response.state.players[0]!.minorPlayed).toContain('C063_CraftBrewery')
  })
  it('C063 S2: Craft Brewery settles both grain costs, four food, and two points', () => {
    const session = setup({ cardId: 'C063_CraftBrewery', round: 4, resources: { grain: 1 } })
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] }]; prepareHarvest(session)
    let response = session.performRoundEnd()
    response = accept(session, response, 'C063_CraftBrewery')
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.selection?.kind === 'farm-position') {
      response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    }
    expect(response.state.players[0]!.fields[0]!.stacks).toHaveLength(0)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 22 })
    expect(response.state.players[0]!.cardStates.C063_CraftBrewery?.counters?.bonusVp ?? 0).toBe(2)
  })
  it('C063 S3: a field emptied by reaping suppresses Craft Brewery', () => {
    const session = setup({ cardId: 'C063_CraftBrewery', round: 4, resources: { grain: 1 } })
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] }]; prepareHarvest(session)
    expect(JSON.stringify(session.performRoundEnd().interaction)).not.toContain('C063_CraftBrewery')
  })
})

describe('C064 Corn Schnapps Distillery parity', () => {
  it('C064 S1: paying one wood and two clay plays Corn Schnapps Distillery', () => {
    const response = playMinor(setup({ cardId: 'C064_CornSchnappsDistillery', played: false, resources: { wood: 1, clay: 2 } }), 'C064_CornSchnappsDistillery')
    expect(response.state.players[0]!.minorPlayed).toContain('C064_CornSchnappsDistillery')
  })
  it('C064 S2: once per round one grain schedules food on the next four rounds', () => {
    const session = setup({ cardId: 'C064_CornSchnappsDistillery', round: 5, resources: { grain: 1 } })
    const response = session.takeAnytimeAction(0, 'C64-corn-schnapps-distillery-anytime')
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'C064_CornSchnappsDistillery').map((entry) => entry.round)).toEqual([6, 7, 8, 9])
    expect(response.interaction.anytimeActions.some((entry) => entry.id === 'C64-corn-schnapps-distillery-anytime')).toBe(false)
  })
  it('C064 S3: without grain Corn Schnapps Distillery is unavailable', () => {
    expect(setup({ cardId: 'C064_CornSchnappsDistillery' }).getState().interaction.anytimeActions
      .some((entry) => entry.id === 'C64-corn-schnapps-distillery-anytime')).toBe(false)
  })
  it('C064 S4: next round gives the first food and reopens Corn Schnapps Distillery', () => {
    const session = setup({ cardId: 'C064_CornSchnappsDistillery', round: 5, resources: { grain: 2 } })
    let response = session.takeAnytimeAction(0, 'C64-corn-schnapps-distillery-anytime')
    response.state.players.forEach((player) => markAllWorkersUsed(response.state, player))
    session.loadState(response.state)
    response = session.performRoundEnd()
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 1 })
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'C064_CornSchnappsDistillery').map((entry) => entry.round)).toEqual([7, 8, 9])
    expect(response.interaction.anytimeActions.some((entry) => entry.id === 'C64-corn-schnapps-distillery-anytime')).toBe(true)
  })
})

describe('C071 Slurry parity', () => {
  it('C071 S1: Slurry can be played for free', () => {
    expect(playMinor(setup({ cardId: 'C071_Slurry', played: false }), 'C071_Slurry')
      .state.players[0]!.minorPlayed).toContain('C071_Slurry')
  })
  const breeding = (sheep: number, boar: number) => {
    const session = setup({ cardId: 'C071_Slurry', round: 4, resources: { grain: 1 } })
    prepareHarvest(session)
    const owner = session.state.players[0]!
    owner.fields = [{ row: 0, col: 2, stacks: [] }]
    Object.assign(owner.resources, { sheep: 2, boar: 2 })
    owner.pastures = [
      { id: 'sheep', size: 2, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }], stables: 1, animalType: 'sheep', animalCount: 2 },
      { id: 'boar', size: 2, tiles: [{ row: 2, col: 1 }, { row: 2, col: 2 }], stables: 0, animalType: 'boar', animalCount: 2 },
    ]
    session.loadState(session.state)
    session.performRoundEnd()
    return { session, response: session.resolveChoice(0, 'confirm', [
      { id: 'sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: sheep },
      { id: 'boar', zoneType: 'pasture', animalType: 'boar', animalCount: boar },
    ]) }
  }
  it('C071 S2: keeping newborns of two types offers a Sow action', () => {
    const { session } = breeding(3, 3)
    let response = accept(session, session.getState(), 'C071_Slurry')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    }
    expect(response.state.players[0]!.fields[0]!.stacks[0]).toMatchObject({ kind: 'grain', remaining: 3 })
  })
  it('C071 S3: only one kept newborn type gives no Slurry sow', () => {
    const { response } = breeding(3, 2)
    expect(JSON.stringify(response.interaction)).not.toContain('C071_Slurry')
  })
})

describe('C072 Festival Planning parity', () => {
  it('C072 S1: two occupations and one food play Festival Planning', () => {
    const response = playMinor(setup({ cardId: 'C072_FestivalPlanning', played: false, occupations: 2, resources: { food: 1 } }), 'C072_FestivalPlanning')
    expect(response.state.players[0]!.minorPlayed).toContain('C072_FestivalPlanning')
  })
  it('C072 S2/S3: play reaps one crop, does not feed or advance round, then offers improvement', () => {
    const session = setup({ cardId: 'C072_FestivalPlanning', played: false, occupations: 2, resources: { food: 1 }, round: 4 })
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] }]
    session.state.players[0]!.minorHand = ['C072_FestivalPlanning', 'B004_WoodPile']
    session.loadState(session.state)
    const response = playMinor(session, 'C072_FestivalPlanning')
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.round).toBe(4); expect(response.state.players[0]!.resources.begging).toBe(0)
    expect(response.interaction.stateId === 'wait' ? options(response).some((option) => option.value === '__skip__') : false).toBe(true)
  })
})

describe('C073 Seaweed Fertilizer parity', () => {
  it('C073 S1: paying two food plays Seaweed Fertilizer', () => {
    const response = playMinor(setup({ cardId: 'C073_SeaweedFertilizer', played: false, resources: { food: 2 } }), 'C073_SeaweedFertilizer')
    expect(response.state.players[0]!.minorPlayed).toContain('C073_SeaweedFertilizer')
  })
  const sow = (round: number, reward: 'grain' | 'vegetable') => {
    const session = setup({ cardId: 'C073_SeaweedFertilizer', round, resources: { grain: 1 } })
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; session.loadState(session.state)
    let response = session.takeAction(0, 'grain-utilization')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = choose(session, response, (option) => JSON.stringify(option).toLowerCase().includes('sow'))
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    }
    response = resolveTriggerIfPresent(session, response, 'C073_SeaweedFertilizer')
    if (response.interaction.stateId === 'wait' && options(response).length > 1) {
      response = choose(session, response, (option) => JSON.stringify(option).toLowerCase().includes(reward))
    }
    return response
  }
  it('C073 S2: before round eleven an unconditional Sow gains one grain', () => {
    expect(sow(10, 'grain').state.players[0]!.resources.grain).toBe(1)
  })
  it('C073 S3: from round eleven an unconditional Sow may gain one vegetable', () => {
    expect(sow(11, 'vegetable').state.players[0]!.resources.vegetable).toBe(1)
  })
  it('C073 S4: a conditional one-field Sow grants no Seaweed Fertilizer crop', () => {
    const session = setup({ cardId: 'C073_SeaweedFertilizer', round: 10, resources: { grain: 1 } })
    session.state.players[0]!.minorHand = ['D003_Furrows']
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    session.loadState(session.state)

    let response = playMinor(session, 'D003_Furrows')
    response = resolveTriggerIfPresent(session, response, 'D003_Furrows')
    if (response.interaction.stateId === 'wait'
      && options(response).some((option) => option.value !== '__skip__')) {
      response = choose(session, response, (option) => option.value !== '__skip__')
    }
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 2, crop: 'grain' }],
      })
    }

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(JSON.stringify(response.interaction)).not.toContain('C073_SeaweedFertilizer')
  })
})
