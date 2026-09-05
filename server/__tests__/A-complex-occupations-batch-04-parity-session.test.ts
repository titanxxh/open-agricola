import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/A/A085_Homekeeper'
import '../../shared/cards/A/A093_BedMaker'
import '../../shared/cards/A/A094_LazySowman'
import '../../shared/cards/A/A098_StableArchitect'
import '../../shared/cards/A/A102_Grocer'
import '../../shared/cards/A/A107_Catcher'
import '../../shared/cards/A/A112_ScytheWorker'
import '../../shared/cards/A/A115_ChiefForester'
import '../../shared/cards/A/A118_Treegardener'
import '../../shared/cards/A/A119_FirewoodCollector'
import '../../shared/cards/A/A147_AnimalDealer'

type CardId =
  | 'A085_Homekeeper' | 'A093_BedMaker' | 'A094_LazySowman' | 'A098_StableArchitect'
  | 'A102_Grocer' | 'A107_Catcher' | 'A112_ScytheWorker' | 'A115_ChiefForester'
  | 'A118_Treegardener' | 'A119_FirewoodCollector' | 'A147_AnimalDealer'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, {
  playerCount = 2, played = false, round = 14, resources = {},
}: { playerCount?: number; played?: boolean; round?: number; resources?: Partial<Resource> } = {}) => {
  const session = new GameSession(4043, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: CardId) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  let current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  current = session.resolveChoice(current.interaction.playerIndex, option!.value)
  return current
}

const skipChoice = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  return session.resolveChoice(current.interaction.playerIndex, '__skip__')
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = response.interaction.request.options?.find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(0, construct.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected room selection')
  return response
}

const prepareHarvest = (session: GameSession, round = 4) => {
  const state = session.getState().state
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 20
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
}

describe('A085 Homekeeper parity', () => {
  const setup = ({ houseType = 'clay', qualifying = true }: { houseType?: 'wood' | 'clay'; qualifying?: boolean } = {}) => {
    const session = setupOccupation('A085_Homekeeper', { played: true, round: 3 })
    const state = session.getState().state
    state.roundActionOrder = state.roundActionOrder.map((id) => id === 'wish-children' ? null : id)
    state.roundActionOrder[0] = 'wish-children'
    const wish = state.actionSpaces.find((space) => space.id === 'wish-children')
    if (!wish) throw new Error('wish-children missing')
    wish.takenBy = []
    const player = state.players[0]!
    player.houseType = houseType
    player.rooms = 2
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    player.roomTiles = [{ row: 0, col: 0 }, { row: 2, col: 2 }]
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.pastures = qualifying ? [{
      id: 'p1', size: 1, tiles: [{ row: 1, col: 0 }], stables: 0, animalType: null, animalCount: 0,
    }] : []
    session.loadState(state)
    return session
  }

  it('A085 S1: a clay room adjacent to both a field and pasture provides one family space', () => {
    const response = setup().takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
  })

  it('A085 S2: a wood room provides no Homekeeper family space', () => {
    const response = setup({ houseType: 'wood' }).takeAction(0, 'wish-children')
    expect(familySize(response.state.players[0]!)).toBe(2)
  })

  it('A085 S3: missing pasture adjacency provides no Homekeeper family space', () => {
    const response = setup({ qualifying: false }).takeAction(0, 'wish-children')
    expect(familySize(response.state.players[0]!)).toBe(2)
  })
})

describe('A093 Bed Maker parity', () => {
  const buildRoom = (grain: number) => {
    const session = setupOccupation('A093_BedMaker', {
      played: true, round: 5, resources: { wood: 6, reed: 2, grain },
    })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait') throw new Error('expected room selection')
    const room = selection.interaction.request.farm.selectableTiles[0]
    const response = session.commitSelectionChoice(0, { rooms: [room!] })
    return { session, response }
  }

  it('A093 S1: paying one wood and one grain after a room completes the extra family growth', () => {
    const { session, response: offered } = buildRoom(1)
    const response = chooseNonSkip(session, offered, 'A093_BedMaker')

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0 })
    expect(familySize(response.state.players[0]!)).toBe(3)
  })

  it('A093 S2: declining Bed Maker after building preserves its wood and grain', () => {
    const { session, response: offered } = buildRoom(1)
    const response = skipChoice(session, offered, 'A093_BedMaker')

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 1 })
    expect(familySize(response.state.players[0]!)).toBe(2)
  })

  it('A093 S3: lacking grain suppresses the Bed Maker offer in OA', () => {
    const { response } = buildRoom(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe('A093_BedMaker')
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })
})

describe('A094 Lazy Sowman parity', () => {
  const setup = ({ grain = 0, workers = 2 }: { grain?: number; workers?: number } = {}) => {
    const session = setupOccupation('A094_LazySowman', { played: true, round: 14 })
    const state = session.getState().state
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'
    const player = state.players[0]!
    setWorkersAtHome(state, player, workers)
    player.resources.grain = grain
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    const opponent = state.players[1]!
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = [{ playerId: opponent.id, workerId: opponent.workers[0]!.id }]
    session.loadState(state)
    return session
  }

  it('A094 S1: declining an unavailable unconditional sow can place the remaining person on an occupied space', () => {
    const session = setup()
    let response = session.takeAction(0, 'grain-utilization')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected extra placement')
    expect(response.interaction.request.options?.map((option) => option.value)).toContain('allow-occupied:day-laborer')

    response = session.resolveChoice(0, 'allow-occupied:day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('A094 S2: with no remaining person, declining sow grants no extra placement', () => {
    const response = setup({ workers: 1 }).takeAction(0, 'grain-utilization')
    expect(response.interaction.stateId === 'wait' ? response.interaction.promptKey : undefined)
      .not.toBe('ui.interactionPlaceFarmerExtra')
  })

  it('A094 S3: choosing to sow normally does not grant an extra placement', () => {
    const session = setup({ grain: 1 })
    let response = session.takeAction(0, 'grain-utilization')
    if (response.interaction.stateId !== 'wait') throw new Error('expected choice')
    const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
    expect(sow).toBeDefined()
    response = session.resolveChoice(0, sow!.value)
    if (response.interaction.stateId !== 'wait') throw new Error('expected sow selection')
    const field = response.interaction.request.farm.selectableFields[0]
    response = session.commitSelectionChoice(0, { crops: [{ ...field!.tile, crop: 'grain' }] })

    expect(response.ok, response.error).toBe(true)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
  })
})

describe('A098 Stable Architect parity', () => {
  it('A098 S1: each unfenced stable scores one bonus point', () => {
    const session = setupOccupation('A098_StableArchitect', { played: true })
    session.state.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 1, col: 1 }]
    session.loadState(session.state)
    const category = session.getState().scores[0]!.categories.find((entry) => entry.key === 'cardBonusVp')
    expect(category?.entries).toContainEqual(expect.objectContaining({ cardId: 'A098_StableArchitect', score: 2 }))
  })

  it('A098 S2: a stable inside a pasture scores no Stable Architect point', () => {
    const session = setupOccupation('A098_StableArchitect', { played: true })
    const player = session.state.players[0]!
    player.stableTiles = [{ row: 0, col: 1 }]
    player.pastures = [{
      id: 'p1', size: 1, tiles: [{ row: 0, col: 1 }], stables: 1, animalType: null, animalCount: 0,
    }]
    session.loadState(session.state)
    const category = session.getState().scores[0]!.categories.find((entry) => entry.key === 'cardBonusVp')
    expect(category?.entries.some((entry) => 'cardId' in entry && entry.cardId === 'A098_StableArchitect') ?? false).toBe(false)
  })
})

describe('A102 Grocer parity', () => {
  const setup = (food: number) => {
    const session = setupOccupation('A102_Grocer', { resources: { food } })
    playOccupation(session, 'A102_Grocer')
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    return session
  }

  it('A102 S1: playing Grocer places the eight goods in the printed stack order', () => {
    const session = setup(0)
    expect(getCardStack(session.state.players[0]!, 'A102_Grocer')).toEqual([
      'vegetable', 'reed', 'clay', 'vegetable', 'stone', 'reed', 'grain', 'wood',
    ])
  })

  it('A102 S2: pays one food to buy wood from the top of the Grocer stack', () => {
    const session = setup(1)
    session.takeAction(0, 'farmland')

    const response = session.takeAnytimeAction(0, 'A102-grocer-anytime')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 0, wood: 1 })
    expect(getCardStack(response.state.players[0]!, 'A102_Grocer')).toHaveLength(7)
  })

  it('A102 S3: Grocer anytime action is unavailable without food', () => {
    const session = setup(0)
    const response = session.takeAction(0, 'farmland')
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain('A102-grocer-anytime')
  })
})

describe('A107 Catcher parity', () => {
  for (const [placement, resources] of [[1, 5], [2, 4], [3, 3]] as const) {
    it(`A107 S${placement}: placement ${placement} on exactly ${resources} building resources grants one food`, () => {
      const session = setupOccupation('A107_Catcher', { played: true })
      const state = session.getState().state
      const player = state.players[0]!
      setActiveWorkerCount(player, 3)
      setWorkersAtHome(state, player, 3 - placement + 1)
      for (let index = 0; index < placement - 1; index += 1) {
        recordRoundPlacement(player, index === 0 ? 'day-laborer' : 'grain-seeds', `${index + 1}`)
      }
      state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = resources
      session.loadState(state)

      const response = session.takeAction(0, 'forest')

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(1)
    })
  }

  it('A107 S4: the wrong resource count grants no Catcher food', () => {
    const session = setupOccupation('A107_Catcher', { played: true })
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 4
    session.loadState(session.state)
    const response = session.takeAction(0, 'forest')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe('A112 Scythe Worker parity', () => {
  const harvest = (grain: number, accept: boolean) => {
    const session = setupOccupation('A112_ScytheWorker', { played: true, round: 4 })
    const player = session.state.players[0]!
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: grain }] }]
    prepareHarvest(session)
    let response = session.performRoundEnd()
    if (grain >= 2) {
      response = accept
        ? chooseNonSkip(session, response, 'A112_ScytheWorker')
        : skipChoice(session, response, 'A112_ScytheWorker')
      if (accept && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'selection') {
        response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] })
      }
    }
    return response
  }

  it('A112 S1: playing Scythe Worker immediately gains one grain', () => {
    const response = playOccupation(setupOccupation('A112_ScytheWorker'), 'A112_ScytheWorker')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('A112 S2: selecting a grain field with two crops harvests one additional grain', () => {
    const response = harvest(2, true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('A112 S3: a grain field with only one crop offers no additional harvest', () => {
    const response = harvest(1, false)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})

describe('A115 Chief Forester parity', () => {
  const setup = (actionId: 'forest' | 'clay-pit') => {
    const session = setupOccupation('A115_ChiefForester', { played: true, resources: { grain: 1 } })
    const player = session.state.players[0]!
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    const space = session.state.actionSpaces.find((candidate) => candidate.id === actionId)!
    space.resources[actionId === 'forest' ? 'wood' : 'clay'] = 3
    session.loadState(session.state)
    return session
  }

  it('A115 S1: using a wood accumulation space offers a sow for exactly one field', () => {
    const session = setup('forest')
    let response = chooseNonSkip(session, session.takeAction(0, 'forest'), 'A115_ChiefForester')
    if (response.interaction.stateId !== 'wait') throw new Error('expected sow selection')
    const field = response.interaction.request.farm.selectableFields[0]
    response = session.commitSelectionChoice(0, { crops: [{ ...field!.tile, crop: 'grain' }] })
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 0 })
  })

  it('A115 S2: the Chief Forester sow can be declined', () => {
    const session = setup('forest')
    const response = skipChoice(session, session.takeAction(0, 'forest'), 'A115_ChiefForester')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1 })
  })

  it('A115 S3: a non-wood accumulation space grants no sow', () => {
    const response = setup('clay-pit').takeAction(0, 'clay-pit')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, grain: 1 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('A115_ChiefForester')
  })
})

describe('A118 Treegardener parity', () => {
  const harvest = (food: number) => {
    const session = setupOccupation('A118_Treegardener', { played: true, round: 4 })
    prepareHarvest(session)
    session.state.players[0]!.resources.food = food
    session.loadState(session.state)
    return { session, response: session.performRoundEnd() }
  }

  it('A118 S1: field phase grants one wood and paying two food buys two more wood', () => {
    const { session, response: offered } = harvest(2)
    let response = resolveTriggerIfPresent(session, offered, 'A118_Treegardener')
    if (response.interaction.stateId !== 'wait') throw new Error('expected purchase choice')
    const twoWood = response.interaction.request.options?.find((option) => option.effectPreview?.resourcesPaid?.food === 2)
    expect(twoWood).toBeDefined()
    response = session.resolveChoice(0, twoWood!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3 })
  })

  it('A118 S2: declining the purchase still gains the free wood', () => {
    const { session, response: offered } = harvest(2)
    const response = skipChoice(session, offered, 'A118_Treegardener')
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(readCardResourceStats(response.state.players[0]!, 'A118_Treegardener')).toMatchObject({
      paid: {},
      gained: { wood: 1 },
    })
  })

  it('A118 S3: no food still grants one free wood without a purchase', () => {
    const { response } = harvest(0)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
  })
})

describe('A119 Firewood Collector parity', () => {
  const finishAction = (session: GameSession, actionId: string) => {
    let response = session.takeAction(0, actionId)
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.request.kind === 'farm-select') {
      if (response.interaction.request.farm.farmType === 'plow') {
        const tile = response.interaction.request.farm.selectableTiles[0]
        return session.commitSelectionChoice(0, { tile })
      }
      if (response.interaction.request.farm.farmType === 'sow') {
        const field = response.interaction.request.farm.selectableFields[0]
        return session.commitSelectionChoice(0, { crops: [{ ...field!.tile, crop: 'grain' }] })
      }
    }
    const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
    const plow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.plow.name')
    const option = actionId === 'grain-utilization' ? sow : plow
    if (!option) return response
    response = session.resolveChoice(0, option.value)
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.request.farm.farmType === 'sow') {
      const field = response.interaction.request.farm.selectableFields[0]
      return session.commitSelectionChoice(0, { crops: [{ ...field!.tile, crop: 'grain' }] })
    }
    const tile = response.interaction.request.farm.selectableTiles[0]
    response = session.commitSelectionChoice(0, { tile })
    if (response.interaction.stateId === 'wait') {
      const done = response.interaction.request.options?.find((option) => option.value === '__done__')
      if (done) response = session.resolveChoice(0, done.value)
    }
    return response
  }

  for (const [scenario, actionId] of [
    ['S1', 'farmland'], ['S2', 'grain-seeds'], ['S3', 'grain-utilization'], ['S4', 'cultivation'],
  ] as const) {
    it(`A119 ${scenario}: using ${actionId} grants one wood at turn end`, () => {
      const session = setupOccupation('A119_FirewoodCollector', { played: true, resources: { grain: 1 } })
      session.state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
      session.loadState(session.state)
      const response = finishAction(session, actionId)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(1)
    })
  }

  it('A119 S5: using Day Laborer grants no Firewood Collector wood', () => {
    const response = setupOccupation('A119_FirewoodCollector', { played: true }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0 })
  })
})

describe('A147 Animal Dealer parity', () => {
  const setup = (food: number) => {
    const session = setupOccupation('A147_AnimalDealer', { playerCount: 3, played: true, resources: { food } })
    const player = session.state.players[0]!
    player.pastures = [{
      id: 'animal-pasture', size: 2, tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
      stables: 0, animalType: null, animalCount: 0,
    }]
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    session.loadState(session.state)
    return session
  }

  const useSheepMarket = (session: GameSession, accept: boolean) => {
    let response = session.takeAction(0, 'sheep-market')
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      const pasture = response.interaction.request.zones.find((zone) => zone.zoneType === 'pasture')
      response = session.resolveChoice(0, 'confirm', {
        zones: [{ ...pasture!, animalType: 'sheep', animalCount: response.state.players[0]!.resources.sheep }],
      })
    }
    response = accept
      ? chooseNonSkip(session, response, 'A147_AnimalDealer')
      : skipChoice(session, response, 'A147_AnimalDealer')
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      const pasture = response.interaction.request.zones.find((zone) => zone.zoneType === 'pasture')
      response = session.resolveChoice(0, 'confirm', {
        zones: [{ ...pasture!, animalType: 'sheep', animalCount: response.state.players[0]!.resources.sheep }],
      })
    }
    return response
  }

  it('A147 S1: Sheep Market may pay one food for one additional sheep', () => {
    const response = useSheepMarket(setup(1), true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, sheep: 2 })
  })

  it('A147 S2: declining Animal Dealer keeps the food and only collects the market sheep', () => {
    const response = useSheepMarket(setup(1), false)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, sheep: 1 })
  })

  it('A147 S3: no food grants no additional animal', () => {
    const session = setup(0)
    let response = session.takeAction(0, 'sheep-market')
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      const pasture = response.interaction.request.zones.find((zone) => zone.zoneType === 'pasture')
      response = session.resolveChoice(0, 'confirm', { zones: [{ ...pasture!, animalType: 'sheep', animalCount: 1 }] })
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, sheep: 1 })
  })
})
