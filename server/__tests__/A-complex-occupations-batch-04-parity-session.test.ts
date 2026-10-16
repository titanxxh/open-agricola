import { captureStateWithHistory } from '../../shared/session/history-streams'
import type { CropStack } from '../../shared/contract/types'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { expectFarmSelection, expectTileFarmSelection, assertEmptyAccumulationRejected } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable, newbornCount } from '../../shared/domain/player'
import { getCardStack, readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { resolveTriggerIfPresent , expectWait } from './_helpers/trigger-select'
import { type Resource, type GameState , type FarmTilePosition } from '../../shared/contract/types'
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
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

type CardId =
  | 'A085_Homekeeper' | 'A093_BedMaker' | 'A094_LazySowman' | 'A098_StableArchitect'
  | 'A102_Grocer' | 'A107_Catcher' | 'A112_ScytheWorker' | 'A115_ChiefForester'
  | 'A118_Treegardener' | 'A119_FirewoodCollector' | 'A147_AnimalDealer'

function expectSowSelection(response: SessionResponse) {
  const farm = expectFarmSelection(response)
  assert.ok(farm.farmType === 'sow')
  return farm
}

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, { playerCount = 2, played = false, round = 14, resources = {}, }: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 4043, options: { playerCount } }))
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
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  let current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = getChoiceOptions(current)?.find((candidate) => candidate.value !== '__skip__')
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
    const construct = getChoiceOptions(response)?.find((option) => option.labelKey === 'actions.construct.name')
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
  const setup = ({ houseType = 'clay', qualifying = true }: {
    houseType?: 'wood' | 'clay'
    qualifying?: boolean
  } = {}) => {
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
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.pastures = qualifying ? [{
        id: 'p1', tiles: [{ row: 1, col: 1 }], animalType: null, animalCount: 0
      }] : []
    player.fenceSegments = qualifying ? ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } })) : []
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
    const room = expectTileFarmSelection(selection, 'room').selectableTiles[0]
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
    if (response.interaction.stateId !== 'wait') throw new Error('expected replacement choice')
    const replacement = getChoiceOptions(response).find((option) => option.sourceCard === 'A094_LazySowman')!
    response = session.resolveChoice(0, replacement.value)
    const place = getChoiceOptions(response).find((option) => option.value !== '__skip__')!
    response = session.resolveChoice(0, place.value)
    expect(getChoiceOptions(response)?.map((option) => option.value)).toContain('allow-occupied:day-laborer')
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
    const sow = getChoiceOptions(response)?.find((option) => option.labelKey === 'ui.interactionDoNotReplace')
    expect(sow).toBeDefined()
    response = session.resolveChoice(0, sow!.value)
    if (response.interaction.stateId !== 'wait') throw new Error('expected sow selection')
    const field = expectSowSelection(response).selectableFields[0]
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
    const scored = session.getState()
    assert.ok(scored.scores)
    const category = scored.scores[0]!.categories.find((entry) => entry.key === 'cardBonusVp')
    expect(category?.entries).toContainEqual(expect.objectContaining({ cardId: 'A098_StableArchitect', score: 2 }))
  })
  it('A098 S2: a stable inside a pasture scores no Stable Architect point', () => {
    const session = setupOccupation('A098_StableArchitect', { played: true })
    const player = session.state.players[0]!
    player.stableTiles = [{ row: 0, col: 1 }]
    player.pastures = [{
        id: 'p1', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0
      }]
    player.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    session.loadState(session.state)
    const scored = session.getState()
    assert.ok(scored.scores)
    const category = scored.scores[0]!.categories.find((entry) => entry.key === 'cardBonusVp')
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
    const field = expectSowSelection(response).selectableFields[0]
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
    const twoWood = getChoiceOptions(response)?.find((option) => option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.food === 2)
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
      if (expectFarmSelection(response).farmType === 'plow') {
        const tile = expectTileFarmSelection(response, 'plow').selectableTiles[0]
        return session.commitSelectionChoice(0, { tile })
      }
      if (expectFarmSelection(response).farmType === 'sow') {
        const field = expectSowSelection(response).selectableFields[0]
        return session.commitSelectionChoice(0, { crops: [{ ...field!.tile, crop: 'grain' }] })
      }
    }
    const sow = getChoiceOptions(response)?.find((option) => option.labelKey === 'ui.interactionDoNotReplace')
    const plow = getChoiceOptions(response)?.find((option) => option.labelKey === 'actions.plow.name')
    const option = actionId === 'grain-utilization' ? sow : plow
    if (!option) return response
    response = session.resolveChoice(0, option.value)
    if (response.interaction.stateId !== 'wait') return response
    if (expectFarmSelection(response).farmType === 'sow') {
      const field = expectSowSelection(response).selectableFields[0]
      return session.commitSelectionChoice(0, { crops: [{ ...field!.tile, crop: 'grain' }] })
    }
    const tile = expectTileFarmSelection(response, 'plow').selectableTiles[0]
    response = session.commitSelectionChoice(0, { tile })
    if (response.interaction.stateId === 'wait') {
      const done = getChoiceOptions(response)?.find((option) => option.value === '__done__')
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
        id: 'animal-pasture', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
        animalType: null, animalCount: 0
      }]
    player.fenceSegments = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
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

describe("A093 command boundaries", () => {
  const BED = 'A093_BedMaker'
  const WAGE = 'B007_Wage'
  function record(name: string, response: SessionResponse) {
    sessionEvidence.record(name, response)
    return response
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  const rooms = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 2 }]
  type Options = {
    played?: boolean
    roomCount?: number
    people?: number
    house?: 'wood' | 'clay' | 'stone'
    round?: number
    resources?: Partial<Resource>
  }
  function setup({ played = true, roomCount = 2, people = 2, house = 'wood', round = 7, resources = {} }: Options = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        for (const p of state.players) {
          p.minorHand = [WAGE]
          p.occupationHand = ['A111_WallBuilder']
          Object.assign(p.resources, { food: 30, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        }
        const p = state.players[0]!
        p.occupationPlayed = played ? ["A093_BedMaker"] : []
        p.occupationHand = played ? ['A111_WallBuilder'] : ["A093_BedMaker", 'A111_WallBuilder']
        p.rooms = roomCount
        p.roomTiles = rooms.slice(0, roomCount).map(t => ({ ...t }))
        p.houseType = house
        setActiveWorkerCount(p, people)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    for (const p of s.state.players)
      assert.equal(p.workers.length, 5)
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, accept = true, actor = 0) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, BED)
    assert.equal(r.interaction.promptKey, 'ui.interactionOptionalAction')
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    const payments = options(r).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(payments.length, 1)
    const payment = payments[0]!
    assert.equal(payment.sourceCard, BED)
    assert.equal(payment.labelKey, 'actions.pay.name')
    assert.ok(payment.effectPreview?.kind === 'payment')
    assert.deepEqual(payment.effectPreview.resourcesPaid, { wood: 1, grain: 1 })
    assert.equal(options(r).length, 2)
    assert.ok(options(r).some(option => option.value === '__skip__' && !option.disabled))
    return record('choice', ok(s.resolveChoice(actor, accept ? payment.value : '__skip__')))
  }
  function finish(r: SessionResponse, actor = 0) {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = record('confirm', confirmNext(s, r))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const response = record(`take:${space}`, ok(s.takeAction(actor, space)))
    return space === 'farm-expansion' ? response : finish(response, actor)
  }
  function values(r: SessionResponse) {
    const p = r.state.players[0]!
    return { rooms: p.rooms, family: familySize(p), newborns: newbornCount(p), wood: p.resources.wood, reed: p.resources.reed, grain: p.resources.grain, food: p.resources.food }
  }
  function build(s: GameSession, tiles = [rooms[2]!], actor = 0, stable = false) {
    let r = turn(s, actor, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const c = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name')
      assert(c, JSON.stringify(r.interaction))
      r = record('construct-branch', ok(s.resolveChoice(actor, c.value)))
    }
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
    assert.equal(r.interaction.request.farm.farmType, stable ? 'stable' : 'room')
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return record('construct', ok(s.commitSelectionChoice(actor, stable ? { rooms: [], stables: tiles } : { rooms: tiles, stables: [] })))
  }
  function bed(s: GameSession, tiles = [rooms[2]!], accept = true) {
    let r = build(s, tiles)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === BED, JSON.stringify(r.interaction))
    r = choose(s, r, accept)
    return finish(r)
  }
  it("actual room payment then one wood and grain grants one newborn without a minor purchase", () => {
    const s = setup({ resources: { wood: 6, reed: 2, grain: 1 } })
    const r = bed(s)
    assert.deepEqual(values(r), { rooms: 3, family: 3, newborns: 1, wood: 0, reed: 0, grain: 0, food: 30 })
    assert(r.state.players[0]!.minorHand.includes(WAGE))
  })
  it("no grain preserves remaining wood and cannot create a child", () => {
    const s = setup({ resources: { wood: 6, reed: 2 } })
    const r = finish(build(s))
    assert.deepEqual(values(r), { rooms: 3, family: 2, newborns: 0, wood: 1, reed: 0, grain: 0, food: 30 })
  })
  it("no wood after room construction preserves grain and creates no child", () => {
    const s = setup({ resources: { wood: 5, reed: 2, grain: 1 } })
    const r = finish(build(s))
    assert.deepEqual(values(r), { rooms: 3, family: 2, newborns: 0, wood: 0, reed: 0, grain: 1, food: 30 })
  })
  it("two rooms in one actual action grant exactly one growth and one extra fee", () => {
    const s = setup({ resources: { wood: 11, reed: 4, grain: 1 } })
    const r = bed(s, [rooms[2]!, rooms[3]!])
    assert.deepEqual(values(r), { rooms: 4, family: 3, newborns: 1, wood: 0, reed: 0, grain: 0, food: 30 })
    assert(r.state.players[0]!.minorHand.includes(WAGE))
  })
  it("declining keeps the new room and both extra-fee resources", () => {
    const s = setup({ resources: { wood: 6, reed: 2, grain: 1 } })
    const r = bed(s, [rooms[2]!], false)
    assert.deepEqual(values(r), { rooms: 3, family: 2, newborns: 0, wood: 1, reed: 0, grain: 1, food: 30 })
  })
  it("five active family members can decline while accepted payment blocks growth until explicit undo", () => {
    const declined = setup({ roomCount: 5, people: 5, resources: { wood: 6, reed: 2, grain: 1 } })
    const originalResult = bed(declined, [rooms[5]!], false)
    assert.deepEqual(values(originalResult), { rooms: 6, family: 5, newborns: 0, wood: 1, reed: 0, grain: 1, food: 30 })

    const s = setup({ roomCount: 5, people: 5, resources: { wood: 6, reed: 2, grain: 1 } })
    const before = undoRuleSnapshot(s.getState())
    const interactionBefore = structuredClone(s.getState().interaction)
    const offered = build(s, [rooms[5]!])
    const offerState = undoRuleSnapshot(offered)
    const offerInteraction = JSON.stringify(offered.interaction)
    const pay = options(offered).filter(option => option.sourceCard === BED && option.labelKey === 'actions.pay.name' && !option.disabled)
    assert.equal(pay.length, 1)
    assert.ok(pay[0]!.effectPreview?.kind === 'payment')
    assert.deepEqual(pay[0]!.effectPreview.resourcesPaid, { wood: 1, grain: 1 })
    const blocked = choose(s, offered)
    assert.deepEqual(values(blocked), { rooms: 6, family: 5, newborns: 0, wood: 0, reed: 0, grain: 0, food: 30 })
    assert.ok(blocked.interaction.stateId === 'wait' && blocked.interaction.request.kind === 'engine-blocked', JSON.stringify(blocked.interaction))
    assert.equal(blocked.interaction.request.actionId, 'family-growth')
    assert.deepEqual(blocked.interaction.allowedCommands, ['undoStep', 'undoAction'])
    assert.deepEqual(blocked.state.players[0]!.workers, [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: true, isNewborn: false },
      { id: '4', isActive: true, isNewborn: false },
      { id: '5', isActive: true, isNewborn: false },
    ])
    const step = record('full-family-payment-undo-step', ok(s.undoStep()))
    assert.deepEqual(JSON.parse(undoRuleSnapshot(step)), JSON.parse(offerState))
    assert.equal(JSON.stringify(step.interaction), offerInteraction)
    assert.equal(JSON.stringify(s.getState().interaction), offerInteraction)
    assert.equal(step.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    assert.equal(step.state.publicEventArchive.at(-1)?.type, 'publicEvents.canceled')
    const undone = record('full-family-build-undo-action', s.undoAction())
    assertUndoRestored(before, undone)
    assertUndoRestored(before, s.getState())
    assert.deepEqual(undone.interaction, interactionBefore)
    assert.deepEqual(s.getState().interaction, interactionBefore)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    assert.equal(s.getState().interaction.stateId, 'idle')
    const retried = bed(s, [rooms[5]!], false)
    assert.deepEqual(values(retried), { rooms: 6, family: 5, newborns: 0, wood: 1, reed: 0, grain: 1, food: 30 })
  })
  it("card in hand does not reward actual room construction", () => {
    const s = setup({ played: false, resources: { wood: 6, reed: 2, grain: 1 } })
    const r = finish(build(s))
    assert.deepEqual(values(r), { rooms: 3, family: 2, newborns: 0, wood: 1, reed: 0, grain: 1, food: 30 })
  })
  it("real opponent construction cannot spend owner fee or give owner a child", () => {
    const s = setup({ resources: { wood: 1, grain: 1 } }, st => Object.assign(st.players[1]!.resources, { wood: 5, reed: 2 }))
    turn(s, 0, 'grain-seeds')
    const r = finish(build(s, [rooms[2]!], 1), 1)
    assert.equal(r.state.players[1]!.rooms, 3)
    assert.equal(values(r).family, 2)
    assert.equal(values(r).wood, 1)
    assert.equal(values(r).grain, 2)
  })
  it("stable-only construction does not grant growth or spend its fee", () => {
    const s = setup({ resources: { wood: 3, grain: 1 } })
    const r = finish(build(s, [{ row: 0, col: 1 }], 0, true))
    assert.equal(r.state.players[0]!.stableTiles.length, 1)
    assert.equal(values(r).family, 2)
    assert.equal(values(r).wood, 1)
    assert.equal(values(r).grain, 1)
  })
  it("whole build fee and newborn undo restores all state before an exact retry", () => {
    const s = setup({ resources: { wood: 6, reed: 2, grain: 1 } })
    const before = undoRuleSnapshot(s.getState())
    const interactionBefore = structuredClone(s.getState().interaction)
    bed(s)
    const undone = record('undo-bedmaker', s.undoAction())
    assertUndoRestored(before, undone)
    assertUndoRestored(before, s.getState())
    assert.deepEqual(undone.interaction, interactionBefore)
    assert.deepEqual(s.getState().interaction, interactionBefore)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    const r = bed(s)
    assert.equal(values(r).family, 3)
    assert.equal(values(r).wood, 0)
    record('stale-bed', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'family-growth')))
  })
  function nextRound(s: GameSession, r: SessionResponse) {
    finish(r, 1)
    const next = record('round-confirm', confirmNext(s, r))
    assert.equal(next.state.round, 8)
    assert.equal(next.state.roundPhase, 'work')
    assert.equal(next.interaction.stateId, 'idle', JSON.stringify(next.interaction))
    assert.equal(next.state.currentPlayerIndex, 0)
    return next
  }
  it("a different room build after a natural next round offers growth again after an earlier decline", () => {
    const s = setup({ resources: { wood: 11, reed: 4, grain: 1 } })
    const declined = choose(s, build(s, [rooms[2]!]), false)
    assert.ok(declined.interaction.stateId === 'wait' && declined.interaction.request.kind === 'choice', JSON.stringify(declined.interaction))
    assert.equal(declined.interaction.sourceCard, BED)
    assert.equal(declined.interaction.promptKey, 'ui.interactionFarmExpansionSelect')
    assert.equal(declined.interaction.playerIndex, 0)
    assert.equal(declined.state.currentPlayerIndex, 0)
    assert.deepEqual(options(declined).map(option => option.labelKey), ['actions.stables.name', 'ui.interactionFlowDone'])
    assert.ok(options(declined).some(option => option.value === '__done__' && !option.disabled))
    finish(record('finish-construction', ok(s.resolveChoice(0, '__done__'))))
    turn(s, 1, 'forest')
    turn(s, 0, 'reed-bank')
    nextRound(s, turn(s, 1, 'clay-pit'))
    const r = bed(s, [rooms[3]!])
    assert.equal(values(r).rooms, 4)
    assert.equal(values(r).family, 3)
    assert.equal(values(r).newborns, 1)
    assert.equal(values(r).wood, 0)
    assert.equal(values(r).grain, 0)
  })
})

describe("A098 command boundaries", () => {
    const ARCH = 'A098_StableArchitect';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true, owner = 0) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 14;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 15, clay: 5, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                const player = state.players[owner]!;
                player.occupationPlayed = played ? [ARCH] : [];
                player.occupationHand = played ? ['__test_placeholder__'] : [ARCH];
                configure(state);
                for (const player of state.players)
                    for (const card of player.improvements)
                        takeMajorImprovementFromSupply(state, card);
            } }));
        assert.equal(session.getState().state.players.length, 2);
        return session;
    }
    function bonus(response: SessionResponse, card: string, owner = 0) {
        assert.ok(response.scores);
        return response.scores[owner]!.categories.find(category => category.key === 'cardBonusVp')?.entries
            .filter(entry => entry.type === 'bonus' && entry.cardId === card).reduce((sum, entry) => sum + entry.score, 0) ?? 0;
    }
    function pasture(state: GameState, tiles: FarmTilePosition[], owner = 0) {
        const player = state.players[owner]!;
        player.pastures.push({ id: `pasture-${player.pastures.length}`, tiles, animalType: null, animalCount: 0 });
        const edges = new Set<string>();
        for (const { row, col } of tiles)
            for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
                if (edges.has(edge))
                    edges.delete(edge);
                else
                    edges.add(edge);
            }
        for (const edge of edges)
            if (!player.fenceSegments.some(segment => segment.edge === edge))
                player.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } });
    }
    function choices(response: SessionResponse) {
        assert.ok(response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice', JSON.stringify(response.interaction));
        return getChoiceOptions(response);
    }
    it("zero through four own unfenced stables score one each on repeated reads", () => {
        for (const count of [0, 1, 2, 3, 4]) {
            const session = setup(state => state.players[0]!.stableTiles = Array.from({ length: count }, (_, col) => ({ row: 0, col: col + 1 })));
            const response = session.getState();
            assert.equal(bonus(response, ARCH), count);
            assert.equal(bonus(session.getState(), ARCH), count);
            save(`A098-N1-${count}`, response);
        }
    });
    it("fenced stable is excluded while another unfenced stable counts", () => {
        const session = setup(state => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }]; pasture(state, [{ row: 0, col: 1 }]); });
        const response = session.getState();
        assert.equal(bonus(response, ARCH), 1);
        save('A098-N2', response);
    });
    it("card in hand and opponent ownership cannot score owner stables", () => {
        const configure = (state: GameState) => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }]; state.players[1]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }]; };
        assert.equal(bonus(setup(configure, false).getState(), ARCH), 0);
        const response = setup(configure, true, 1).getState();
        assert.equal(bonus(response, ARCH), 0);
        assert.equal(bonus(response, ARCH, 1), 2);
        save('A098-N3', response);
    });
    it("real stable construction changes score and invalid target preserves pending", () => {
        const session = setup();
        let response = ok(session.takeAction(0, 'farm-expansion'));
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice') {
            const option = choices(response).find(option => option.labelKey === 'actions.stables.name');
            assert.ok(option);
            response = ok(session.resolveChoice(0, option.value));
        }
        assert.ok(response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'farm-select');
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [{ row: 1, col: 0 }] }));
        response = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }));
        assert.equal(response.state.players[0]!.stableTiles.length, 1);
        assert.equal(response.state.players[0]!.resources.wood, 13);
        assert.equal(bonus(response, ARCH), 1);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A098-N4', response);
    });
    it("real fencing stops stable bonus and public undo restores it before retry", () => {
        const session = setup(state => state.players[0]!.stableTiles = [{ row: 0, col: 1 }]);
        const rawBefore = { ...session.getState(), state: captureStateWithHistory(session.getState().state), interaction: structuredClone(session.getState().interaction), scores: structuredClone(session.getState().scores) };
        assert.equal(rawBefore.interaction.stateId, 'idle');
        assert.equal(rawBefore.state.currentPlayerIndex, 0);
        const undoInteraction = JSON.stringify(rawBefore.interaction);
        const before = rawBefore;
        assert.equal(bonus(before, ARCH), 1);
        const edges = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'];
        function fence() { ok(session.takeAction(0, 'fencing')); return ok(session.commitSelectionChoice(0, { edges, extraWood: 0 })); }
        const response = fence();
        assert.equal(bonus(response, ARCH), 0);
        assert.equal(response.state.players[0]!.resources.wood, 11);
        const undone = ok(session.undoAction());
        save('A098-raw-undo', { before: rawBefore, undone });
        assertUndoRestored(undoRuleSnapshot(rawBefore), undone);
        const live = session.getState();
        assertUndoRestored(undoRuleSnapshot(rawBefore), live);
        assert.deepEqual(live.interaction, rawBefore.interaction);
        assert.equal(live.interaction.stateId, 'idle');
        assert.equal(live.state.currentPlayerIndex, 0);
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(bonus(undone, ARCH), 1);
        assert.deepEqual(undone.state.players[0]!.stableTiles, before.state.players[0]!.stableTiles);
        assert.equal(undone.state.players[0]!.fenceSegments.length, 0);
        assert.equal(undone.state.players[0]!.resources.wood, 15);
        assert.equal(bonus(fence(), ARCH), 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A098-N5', { response, undone });
    });
});

describe("A107 command boundaries", () => {
    const CATCH = 'A107_Catcher';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 5;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [CATCH] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [CATCH];
                configure(state);
            } }));
        return session;
    }
    function ready(session: GameSession, actor: number) {
        let response = session.getState();
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'confirm-next-player')
            response = confirmNext(session, response);
        assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction));
        assert.equal(response.state.currentPlayerIndex, actor);
    }
    function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)); }
    it("actual first and second placements read original five and four resource piles", () => {
        const session = setup(state => {
            state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 5;
            state.actionSpaces.find(s => s.id === 'clay-pit')!.resources.clay = 4;
        });
        let response = turn(session, 0, 'forest');
        assert.equal(response.state.players[0]!.resources.food, 41);
        assert.equal(response.state.players[0]!.resources.wood, 5);
        turn(session, 1, 'grain-seeds');
        response = turn(session, 0, 'clay-pit');
        assert.equal(response.state.players[0]!.resources.food, 42);
        assert.equal(response.state.players[0]!.resources.clay, 4);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A107-N1', response);
    });
    it("wrong count and nonbuilding food pile do not award Catcher food", () => {
        for (const count of [0, 3, 4, 6]) {
            const s = setup(state => state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = count);
            const response = count === 0 ? assertEmptyAccumulationRejected(s, 0, 'forest') : turn(s, 0, 'forest');
            assert.equal(response.state.players[0]!.resources.food, 40);
            assert.equal(response.state.players[0]!.resources.wood, count);
            if (count === 0) {
                assert.equal(response.interaction.stateId, 'idle');
            } else {
                assert.ok(response.interaction.stateId === 'wait');
                assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
                assert.equal(response.interaction.playerIndex, 0);
            }
            assert.equal(response.state.currentPlayerIndex, 0);
            save(`A107-N2-${count}`, response);
        }
        const food = turn(setup(state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 5), 0, 'fishing');
        assert.equal(food.state.players[0]!.resources.food, 45);
        assert.ok(food.interaction.stateId === 'wait');
        assert.deepEqual(food.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(food.state.currentPlayerIndex, 0);
        save('A107-N2-food', food);
    });
    it("actual opponent collection and card in hand cannot reward owner", () => {
        const config = (state: GameState) => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 5;
        const unplayed = turn(setup(config, false), 0, 'forest');
        assert.equal(unplayed.state.players[0]!.resources.food, 40);
        const session = setup(config);
        turn(session, 0, 'grain-seeds');
        const response = turn(session, 1, 'forest');
        assert.equal(response.state.players[0]!.resources.food, 40);
        assert.equal(response.state.players[1]!.resources.food, 40);
        assert.equal(response.state.players[1]!.resources.wood, 5);
        assert.ok(unplayed.interaction.stateId === 'wait');
        assert.deepEqual(unplayed.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(unplayed.state.currentPlayerIndex, 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 });
        assert.equal(response.state.currentPlayerIndex, 1);
        save('A107-N3', { response, unplayed });
    });
    it("whole action undo restores pile order and food before exactly one retry", () => {
        const session = setup(state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 5);
        const rawBefore = { ...session.getState(), state: captureStateWithHistory(session.getState().state), interaction: structuredClone(session.getState().interaction), scores: structuredClone(session.getState().scores) };
        assert.equal(rawBefore.interaction.stateId, 'idle');
        assert.equal(rawBefore.state.currentPlayerIndex, 0);
        const undoInteraction = JSON.stringify(rawBefore.interaction);
        const response = turn(session, 0, 'forest');
        assert.equal(response.state.players[0]!.resources.food, 41);
        const undone = ok(session.undoAction());
        save('A107-raw-undo', { before: rawBefore, undone });
        assertUndoRestored(undoRuleSnapshot(rawBefore), undone);
        const live = session.getState();
        assertUndoRestored(undoRuleSnapshot(rawBefore), live);
        assert.deepEqual(live.interaction, rawBefore.interaction);
        assert.equal(live.interaction.stateId, 'idle');
        assert.equal(live.state.currentPlayerIndex, 0);
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(undone.state.players[0]!.resources.food, 40);
        assert.equal(undone.state.players[0]!.resources.wood, 0);
        assert.equal(undone.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, 5);
        const retry = turn(session, 0, 'forest');
        assert.equal(retry.state.players[0]!.resources.food, 41);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        assert.ok(retry.interaction.stateId === 'wait');
        assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(retry.interaction.playerIndex, 0);
        assert.equal(retry.state.currentPlayerIndex, 0);
        save('A107-N4', { response, undone, retry });
    });
    it("third person after actual growth uses three building resources once", () => {
        const session = setup(state => {
            state.round = 7;
            state.players[0]!.roomTiles.push({ row: 0, col: 0 });
            state.players[0]!.rooms = 3;
            state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 0;
        });
        let response = turn(session, 0, 'wish-children');
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice') {
            const skip = getChoiceOptions(response).find(o => o.value === '__skip__');
            assert.ok(skip);
            response = ok(session.resolveChoice(0, skip.value));
        }
        assert.equal(response.state.players[0]!.workers.filter(w => w.isActive).length, 3);
        assert.deepEqual(response.state.players[0]!.workers.filter(worker => worker.isActive), [
            { id: '1', isActive: true, isNewborn: false },
            { id: '2', isActive: true, isNewborn: false },
            { id: '3', isActive: true, isNewborn: true },
        ]);
        assert.deepEqual(response.state.actionSpaces.find(space => space.id === 'wish-children')!.takenBy, [{ playerId: 'p1', workerId: '1' }, { playerId: 'p1', workerId: '3' }]);
        assert.equal(workersAvailable(response.state, response.state.players[0]!), 1);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A107-N5-after-growth', response);
        turn(session, 1, 'reed-bank');
        turn(session, 0, 'day-laborer');
        response = confirmNext(session, turn(session, 1, 'clay-pit'));
        for (let n = 0; n < 15 && response.interaction.stateId === 'wait'; n++) {
            const interaction = response.interaction;
            if (interaction.request.kind === 'feed')
                response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }));
            else if (interaction.request.kind === 'confirm-player-switch')
                response = ok(session.resolveChoice(interaction.request.toPlayerIndex, 'confirm'));
            else
                assert.fail(JSON.stringify(interaction));
        }
        assert.equal(response.state.round, 8);
        assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.roundPhase, 'work');
        assert.equal(response.state.currentPlayerIndex, 0);
        assert.equal(workersAvailable(response.state, response.state.players[0]!), 3);
        assert.deepEqual(response.state.players[0]!.workers.filter(worker => worker.isActive), [
            { id: '1', isActive: true, isNewborn: false },
            { id: '2', isActive: true, isNewborn: false },
            { id: '3', isActive: true, isNewborn: false },
        ]);
        save('A107-N5-next-work', response);
        const before = response.state.players[0]!.resources.food;
        turn(session, 0, 'grain-seeds');
        turn(session, 1, 'reed-bank');
        turn(session, 0, 'day-laborer');
        turn(session, 1, 'clay-pit');
        response = turn(session, 0, 'forest');
        assert.equal(response.state.players[0]!.resources.wood, 3);
        assert.equal(response.state.players[0]!.resources.food, before + 3);
        assert.deepEqual(response.state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy, [{ playerId: 'p1', workerId: '1' }]);
        assert.deepEqual(response.state.actionSpaces.find(space => space.id === 'day-laborer')!.takenBy, [{ playerId: 'p1', workerId: '2' }]);
        assert.deepEqual(response.state.actionSpaces.find(space => space.id === 'forest')!.takenBy, [{ playerId: 'p1', workerId: '3' }]);
        assert.equal(workersAvailable(response.state, response.state.players[0]!), 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 });
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A107-N5', response);
    });
});

describe('A147 command boundaries', () => {
  const DEALER = 'A147_AnimalDealer'
  type Animal = 'sheep' | 'boar' | 'cattle'
  const starts = new WeakMap<GameSession, { rules: string; interaction: string }>()
  function setup(type: Animal, count: number, food = 1, played = true) {
    return sessionEvidence.track(createWorkSession({
      seed: 4242,
      options: { playerCount: 3 }, // Animal Dealer is a 3+ card.
      configure(state) {
        state.round = 14
        for (const player of state.players)
          Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        const owner = state.players[0]!
        owner.occupationPlayed = played ? [DEALER] : []
        owner.occupationHand = played ? ['__test_placeholder__'] : [DEALER, 'A110_Roughcaster']
        owner.resources.food = food
        owner.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } }))
        owner.pastures = [{ id: 'housing', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
        owner.stableTiles = [{ row: 0, col: 2 }]
        const market = { sheep: 'sheep-market', boar: 'pig-market', cattle: 'cattle-market' }[type]
        state.actionSpaces.find(space => space.id === market)!.resources[type] = count
      },
    }))
  }
  function turn(session: GameSession, actor: 0 | 1, space: string) {
    let response = session.getState()
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player')
      response = confirmNext(session, response)
    assert.equal(response.interaction.stateId, 'idle')
    assert.equal(response.state.currentPlayerIndex, actor)
    starts.set(session, { rules: undoRuleSnapshot(response), interaction: JSON.stringify(response.interaction) })
    const placed = session.takeAction(actor, space)
    assert.equal(placed.ok, true, placed.error)
    return placed
  }
  function confirmAnimals(session: GameSession, response: SessionResponse, actor: 0 | 1, type: Animal, count: 1 | 2) {
    const interaction = response.interaction
    assert.ok(interaction.stateId === 'wait' && interaction.request.kind === 'animal-reorg', JSON.stringify(interaction))
    assert.equal(interaction.playerIndex, actor)
    assert.equal(response.state.currentPlayerIndex, actor)
    assert.equal(response.state.players[actor]!.resources[type], count)
    assert.deepEqual(interaction.request.zones.filter(zone => zone.animalCount > 0).map(zone => ({ id: zone.id, type: zone.animalType, count: zone.animalCount, capacity: zone.capacity })), [
      { id: actor === 0 ? 'housing' : 'house:2-0', type, count, capacity: actor === 0 ? 4 : 1 },
    ])
    const confirmed = session.resolveChoice(actor, 'confirm', { zones: interaction.request.zones })
    assert.equal(confirmed.ok, true, confirmed.error)
    return confirmed
  }
  function collectionComplete(response: SessionResponse, actor: 0 | 1) {
    assert.equal(response.ok, true, response.error)
    assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
    assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: actor + 1 })
    assert.equal(response.interaction.playerIndex, actor)
    assert.equal(response.state.currentPlayerIndex, actor)
    assert.equal(response.state.round, 14)
    return response
  }
  function collect(session: GameSession, actor: 0 | 1, space: string, type: Animal) {
    return confirmAnimals(session, turn(session, actor, space), actor, type, 1)
  }
  function dealerOffer(response: SessionResponse, type: Animal) {
    const interaction = response.interaction
    assert.ok(interaction.stateId === 'wait' && interaction.request.kind === 'choice', JSON.stringify(interaction))
    assert.equal(interaction.sourceCard, DEALER)
    assert.equal(interaction.playerIndex, 0)
    assert.equal(response.state.currentPlayerIndex, 0)
    const options = interaction.request.options.filter(option => option.sourceCard === DEALER && !option.disabled)
    assert.equal(options.length, 1, JSON.stringify(interaction))
    const option = options[0]!
    assert.deepEqual(option.effectPreview, { kind: 'resourceExchange', resourcesPaid: { food: 1 }, resourcesGained: { [type]: 1 } })
    return option.value
  }
  function extraAnimal(session: GameSession, response: SessionResponse, type: Animal, accept = true) {
    const value = dealerOffer(response, type)
    let resolved = session.resolveChoice(0, accept ? value : '__skip__')
    assert.equal(resolved.ok, true, resolved.error)
    if (accept)
      resolved = confirmAnimals(session, resolved, 0, type, 2)
    return collectionComplete(resolved, 0)
  }
  it('each real animal market buys only one matching animal for exactly one food', () => {
    for (const [type, space] of [['sheep', 'sheep-market'], ['boar', 'pig-market'], ['cattle', 'cattle-market']] as const) {
      const session = setup(type, 1)
      const response = extraAnimal(session, collect(session, 0, space, type), type)
      assert.equal(response.state.players[0]!.resources[type], 2)
      assert.equal(response.state.players[0]!.resources.food, 0)
      for (const other of ['sheep', 'boar', 'cattle'] as const)
        if (other !== type) assert.equal(response.state.players[0]!.resources[other], 0)
    }
  })
  it('decline and zero food cannot buy a free extra animal', () => {
    for (const food of [0, 1]) {
      const session = setup('sheep', 1, food)
      const collected = collect(session, 0, 'sheep-market', 'sheep')
      const response = food === 0 ? collectionComplete(collected, 0) : extraAnimal(session, collected, 'sheep', false)
      assert.equal(response.state.players[0]!.resources.sheep, 1)
      assert.equal(response.state.players[0]!.resources.food, food)
    }
  })
  it('empty own market rejects without buying an animal and no other space triggers', () => {
    const session = setup('sheep', 0)
    const rejected = assertEmptyAccumulationRejected(session, 0, 'sheep-market')
    assert.equal(rejected.interaction.stateId, 'idle')
    assert.equal(rejected.state.currentPlayerIndex, 0)
    assert.equal(rejected.state.players[0]!.resources.sheep, 0)
    assert.equal(rejected.state.players[0]!.resources.food, 1)
    const unrelated = collectionComplete(turn(setup('sheep', 1), 0, 'day-laborer'), 0)
    assert.equal(unrelated.state.players[0]!.resources.sheep, 0)
    assert.equal(unrelated.state.players[0]!.resources.food, 3)
  })
  it('hand opponent and invalid choice cannot consume owner food or grant animals', () => {
    const handSession = setup('sheep', 1, 1, false)
    const hand = collectionComplete(collect(handSession, 0, 'sheep-market', 'sheep'), 0)
    assert.equal(hand.state.players[0]!.resources.food, 1)
    const otherSession = setup('sheep', 1)
    turn(otherSession, 0, 'grain-seeds')
    const other = collectionComplete(collect(otherSession, 1, 'sheep-market', 'sheep'), 1)
    assert.equal(other.state.players[0]!.resources.sheep, 0)
    assert.equal(other.state.players[0]!.resources.food, 1)
    assert.equal(other.state.players[1]!.resources.sheep, 1)
    assert.equal(other.state.players[1]!.resources.food, 40)
    const session = setup('sheep', 1)
    const pending = collect(session, 0, 'sheep-market', 'sheep')
    const valid = dealerOffer(pending, 'sheep')
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'buy-five-animals'))
    assertRejectedUnchanged(session, () => session.resolveChoice(1, valid))
    const response = extraAnimal(session, pending, 'sheep')
    assert.equal(response.state.players[0]!.resources.sheep, 2)
    assert.equal(response.state.players[0]!.resources.food, 0)
  })
  it('whole own animal purchase undo restores pile food and housing before retry', () => {
    const session = setup('sheep', 1)
    extraAnimal(session, collect(session, 0, 'sheep-market', 'sheep'), 'sheep')
    const before = starts.get(session)
    assert.ok(before)
    const undone = session.undoAction()
    assertUndoRestored(before.rules, undone)
    assertUndoRestored(before.rules, session.getState())
    assert.equal(JSON.stringify(undone.interaction), before.interaction)
    assert.equal(JSON.stringify(session.getState().interaction), before.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.food, 1)
    assert.equal(undone.state.players[0]!.resources.sheep, 0)
    assert.equal(undone.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep, 1)
    const retry = extraAnimal(session, collect(session, 0, 'sheep-market', 'sheep'), 'sheep')
    assert.equal(retry.state.players[0]!.resources.sheep, 2)
    assert.equal(retry.state.players[0]!.resources.food, 0)
  })
})

describe("A112 command boundaries", () => {
  const SCYTHE = 'A112_ScytheWorker'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(stacks: CropStack[] = [], configure: (state: GameState) => void = () => {
  }, played = true, round = 4) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.occupationPlayed = played ? [SCYTHE] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [SCYTHE, 'A110_Roughcaster']
        p.fields = stacks.map((stack, col) => ({ row: 0, col: col + 1, stacks: [stack] }))
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function end(s: GameSession) {
    turn(s, 0, 'grain-seeds')
    turn(s, 1, 'reed-bank')
    turn(s, 0, 'forest')
    return confirmNext(s, turn(s, 1, 'clay-pit'))
  }
  function harvest(s: GameSession, r: SessionResponse, positions: { row: number; col: number }[] | null = null, expectOffer = true) {
    let offered = false
    for (let n = 0; n < 30 && r.interaction.stateId === 'wait'; n++) {
      const i = r.interaction
      sessionEvidence.record(`pending-${SCYTHE}-${n}`, r)
      if (i.request.kind === 'confirm-player-switch') r = ok(s.resolveChoice(i.request.toPlayerIndex, 'confirm'))
      else if (i.request.kind === 'feed') r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
      else if (i.request.kind === 'select-trigger') {
        const option = getChoiceOptions({ interaction: i }).find(option => option.sourceCard === SCYTHE && !option.disabled)
        assert.ok(option, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, option.value))
      } else if (i.request.kind === 'choice') {
        assert.equal(expectOffer, true)
        assert.equal(i.sourceCard, SCYTHE)
        assert.equal(i.playerIndex, 0)
        offered = true
        const option = getChoiceOptions({ interaction: i }).find(option => positions ? option.sourceCard === SCYTHE && !option.disabled : option.value === '__skip__')
        assert.ok(option, JSON.stringify(i))
        r = ok(s.resolveChoice(0, option.value))
      } else if (i.request.kind === 'selection') {
        assert.equal(expectOffer, true)
        assert.equal(i.sourceCard, SCYTHE)
        assert.equal(i.playerIndex, 0)
        assert.ok(positions)
        r = ok(s.commitSelectionChoice(0, { positions }))
        positions = null
      } else assert.fail(JSON.stringify(i))
    }
    assert.equal(offered, expectOffer)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }
  it("real first Lessons play gains one grain once and later unrelated placement does not", () => {
    const s = setup([], undefined, false, 14)
    let r = turn(s, 0, 'lessons')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    r = ok(s.resolveChoice(0, SCYTHE))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, SCYTHE))
    turn(s, 1, 'reed-bank')
    const later = turn(s, 0, 'day-laborer')
    assert.ok(later.interaction.stateId === 'wait')
    assert.deepEqual(later.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(later.interaction.playerIndex, 0)
    assert.equal(later.state.currentPlayerIndex, 0)
    assert.equal(later.state.players[0]!.resources.grain, 1)

    sessionEvidence.record('A112-N1', { r, later })
  })
  it("one additional grain per selected grain field and no extra vegetable", () => {
    const s = setup([{ kind: 'grain', remaining: 3 }, { kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 2 }])
    const r = harvest(s, end(s), [{ row: 0, col: 1 }, { row: 0, col: 2 }])
    assert.equal(r.state.players[0]!.resources.grain, 5)
    assert.equal(r.state.players[0]!.resources.vegetable, 1)
    assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks), [[{ kind: 'grain', remaining: 1 }], [], [{ kind: 'vegetable', remaining: 1 }]])
    assert.equal(r.state.players[0]!.resources.food, 36)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    sessionEvidence.record('A112-N2', r)
  })
  it("select one eligible field decline all and one crop threshold cannot overharvest", () => {
    for (const positions of [[{ row: 0, col: 1 }], null]) {
      const s = setup([{ kind: 'grain', remaining: 3 }, { kind: 'grain', remaining: 3 }, { kind: 'grain', remaining: 1 }])
      const r = harvest(s, end(s), positions)
      assert.equal(r.state.players[0]!.resources.grain, positions ? 5 : 4)
      assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks[0]?.remaining ?? 0), positions ? [1, 2, 0] : [2, 2, 0])
      assert.equal(r.interaction.stateId, 'idle')
      assert.equal(r.state.currentPlayerIndex, 0)
      sessionEvidence.record(`A112-N3-${positions ? 'one' : 'decline'}`, r)
    }
  })
  it("hand opponent crops vegetables empty fields and nonharvest cannot give extra grain", () => {
    const handS = setup([{ kind: 'grain', remaining: 3 }], undefined, false)
    const hand = harvest(handS, end(handS), null, false)
    assert.equal(hand.state.players[0]!.resources.grain, 2)
    const otherS = setup([], state => {
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
      state.players[1]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })
    const other = harvest(otherS, end(otherS), null, false)
    assert.equal(other.state.players[0]!.resources.grain, 1)
    assert.equal(other.state.players[1]!.resources.grain, 1)
    const nonS = setup([{ kind: 'grain', remaining: 3 }], undefined, true, 5)
    const non = harvest(nonS, end(nonS), null, false)
    assert.equal(non.state.players[0]!.resources.grain, 1)
    assert.equal(non.state.players[0]!.fields[0]!.stacks[0]!.remaining, 3)
    assert.equal(hand.interaction.stateId, 'idle')
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(other.interaction.stateId, 'idle')
    assert.equal(other.state.currentPlayerIndex, 0)
    assert.equal(non.interaction.stateId, 'idle')
    assert.equal(non.state.currentPlayerIndex, 0)
    sessionEvidence.record('A112-N4', { hand, other, non })
  })
  it("wrong actor invalid ineligible and duplicate targets reject before valid selection", () => {
    const s = setup([{ kind: 'grain', remaining: 3 }, { kind: 'grain', remaining: 1 }, { kind: 'vegetable', remaining: 2 }])
    let r = end(s)
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'selection'; n++) {
      const i = r.interaction
      assert.ok(i.request.kind === 'choice' || i.request.kind === 'select-trigger')
      const o = getChoiceOptions({ interaction: i }).find(o => o.value !== '__skip__')
      assert.ok(o)
      r = ok(s.resolveChoice(0, o.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection')
    for (const positions of [[{ row: 99, col: 99 }], [{ row: 0, col: 2 }], [{ row: 0, col: 3 }], [{ row: 0, col: 1 }, { row: 0, col: 1 }]])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { positions: [{ row: 0, col: 1 }] }))
    r = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
    r = harvest(s, r, null, false)
    assert.equal(r.state.players[0]!.resources.grain, 4)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    sessionEvidence.record('A112-N5', r)
  })
  it("natural cleanup prevents previous selection leaking into next harvest", () => {
    const s = setup([{ kind: 'grain', remaining: 4 }])
    const first = harvest(s, end(s), [{ row: 0, col: 1 }])
    assert.equal(first.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2)
    harvest(s, end(s), null, false)
    harvest(s, end(s), null, false)
    const next = harvest(s, end(s))
    assert.equal(next.state.round, 8)
    assert.equal(next.state.players[0]!.fields[0]!.stacks[0]!.remaining, 1)
    assert.equal(next.state.players[0]!.resources.grain, 7)
    assert.equal(first.interaction.stateId, 'idle')
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(next.interaction.stateId, 'idle')
    assert.equal(next.state.currentPlayerIndex, 0)
    sessionEvidence.record('A112-N6', { first, next })
  })
})

describe("A118 command boundaries", () => {
  const TREE = 'A118_Treegardener'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(stacks: CropStack[] = [], configure: (state: GameState) => void = () => {
  }, played = true, round = 4) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.occupationPlayed = played ? [TREE] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [TREE, 'A110_Roughcaster']
        p.fields = stacks.map((stack, col) => ({ row: 0, col: col + 1, stacks: [stack] }))
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function end(s: GameSession) {
    turn(s, 0, 'grain-seeds')
    turn(s, 1, 'reed-bank')
    turn(s, 0, 'forest')
    return confirmNext(s, turn(s, 1, 'clay-pit'))
  }
  function harvest(s: GameSession, r: SessionResponse, purchase = 0, expectOffer = true) {
    let offered = false
    for (let n = 0; n < 30 && r.interaction.stateId === 'wait'; n++) {
      const i = r.interaction
      sessionEvidence.record(`pending-${TREE}-${n}`, r)
      if (i.request.kind === 'confirm-player-switch') r = ok(s.resolveChoice(i.request.toPlayerIndex, 'confirm'))
      else if (i.request.kind === 'feed') r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
      else if (i.request.kind === 'select-trigger') {
        const option = getChoiceOptions({ interaction: i }).find(option => option.sourceCard === TREE && !option.disabled)
        assert.ok(option, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, option.value))
      } else if (i.request.kind === 'choice') {
        assert.equal(expectOffer, true)
        assert.equal(i.sourceCard, TREE)
        assert.equal(i.playerIndex, 0)
        offered = true
        const option = getChoiceOptions({ interaction: i }).find(option => purchase === 0 ? option.value === '__skip__' : !option.disabled && option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.food === purchase)
        assert.ok(option, JSON.stringify(i))
        r = ok(s.resolveChoice(0, option.value))
      } else assert.fail(JSON.stringify(i))
    }
    assert.equal(offered, expectOffer)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }
  it("harvest free wood and zero one or two purchased wood have exact food costs", () => {
    for (const purchase of [0, 1, 2]) {
      const s = setup()
      const r = harvest(s, end(s), purchase)
      assert.equal(r.state.players[0]!.resources.wood, 4 + purchase)
      assert.equal(r.state.players[0]!.resources.food, 36 - purchase)
      assert.equal(r.interaction.stateId, 'idle')
      assert.equal(r.state.currentPlayerIndex, 0)
      sessionEvidence.record(`A118-N1-${purchase}`, r)
    }
  })
  it("zero food allows only free wood and one food cannot buy two", () => {
    const richS = setup([], state => state.players[0]!.resources.food = 2)
    const richPending = end(richS)
    assert.ok(richPending.interaction.stateId === 'wait' && richPending.interaction.request.kind === 'choice')
    assert.equal(richPending.interaction.sourceCard, TREE)
    assert.equal(richPending.interaction.playerIndex, 0)
    assert.equal(richPending.state.currentPlayerIndex, 0)
    const twoWood = getChoiceOptions(richPending).find(option => !option.disabled && option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.food === 2)
    assert.ok(twoWood)
    assert.deepEqual(twoWood.effectPreview, { kind: 'resourceExchange', resourcesPaid: { food: 2 }, resourcesGained: { wood: 2 } })
    const rich = harvest(richS, richPending, 2)
    assert.equal(rich.state.players[0]!.resources.wood, 6)
    assert.equal(rich.state.players[0]!.resources.food, 0)
    assert.equal(rich.state.players[0]!.resources.begging, 4)
    for (const available of [0, 1]) {
      const s = setup([], state => state.players[0]!.resources.food = available)
      const pending = end(s)
      if (available === 1) {
        assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
        assert.equal(pending.interaction.sourceCard, TREE)
        assert.equal(pending.interaction.playerIndex, 0)
        assert.equal(pending.state.currentPlayerIndex, 0)
        assert.deepEqual(getChoiceOptions(pending).map(option => ({
          preview: option.effectPreview ?? null,
          disabled: option.disabled === true,
          skip: option.value === '__skip__',
        })), [
          { preview: { kind: 'resourceExchange', resourcesPaid: { food: 1 }, resourcesGained: { wood: 1 } }, disabled: false, skip: false },
          { preview: null, disabled: false, skip: true },
        ])
        assertRejectedUnchanged(s, () => s.resolveChoice(0, twoWood.value))
      }
      const r = harvest(s, pending, available, available > 0)
      assert.equal(r.state.players[0]!.resources.wood, 4 + available)
      assert.equal(r.state.players[0]!.resources.food, 0)
      assert.equal(r.state.players[0]!.resources.begging, 4)
      assert.equal(r.interaction.stateId, 'idle')
      assert.equal(r.state.currentPlayerIndex, 0)
      sessionEvidence.record(`A118-N2-${available}`, { richPending, rich, pending, r })
    }
  })
  it("nonharvest unplayed and opponent field phase cannot give owner wood", () => {
    const nonS = setup([], undefined, true, 5), non = harvest(nonS, end(nonS), 0, false)
    assert.equal(non.state.players[0]!.resources.wood, 3)
    const handS = setup([], undefined, false), hand = harvest(handS, end(handS), 0, false)
    assert.equal(hand.state.players[0]!.resources.wood, 3)
    assert.equal(hand.state.players[1]!.resources.wood, 0)
    assert.equal(non.interaction.stateId, 'idle')
    assert.equal(non.state.currentPlayerIndex, 0)
    assert.equal(hand.interaction.stateId, 'idle')
    assert.equal(hand.state.currentPlayerIndex, 0)
    sessionEvidence.record('A118-N3', { non, hand })
  })
  it("invalid wrong actor and stale purchase cannot exceed two extra wood", () => {
    const s = setup()
    const pending = end(s)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'buy-three'))
    const firstOption = getChoiceOptions(pending).find(option => option.sourceCard === TREE && !option.disabled)
    assert.ok(firstOption)
    const firstValue = firstOption.value
    assertRejectedUnchanged(s, () => s.resolveChoice(1, firstValue))
    const r = harvest(s, pending, 2)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, firstValue))
    assert.equal(r.state.players[0]!.resources.wood, 6)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    sessionEvidence.record('A118-N4', { pending, r })
  })
  it("later natural harvest awards only one fresh free wood without prior purchase", () => {
    const s = setup()
    const first = harvest(s, end(s), 2)
    harvest(s, end(s), 0, false)
    harvest(s, end(s), 0, false)
    const next = harvest(s, end(s))
    assert.equal(next.state.round, 8)
    assert.equal(next.state.players[0]!.resources.wood, 16)
    assert.equal(next.state.players[0]!.resources.food, 30)
    assert.equal(first.interaction.stateId, 'idle')
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(next.interaction.stateId, 'idle')
    assert.equal(next.state.currentPlayerIndex, 0)
    sessionEvidence.record('A118-N5', { first, next })
  })
})

describe("A119 command boundaries", () => {
  const FIRE = 'A119_FirewoodCollector'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true, round = 14) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [FIRE] : []
        state.players[0]!.occupationHand = played ? ['A110_Roughcaster'] : [FIRE, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  it("Farmland selection gives wood only at completed turn", () => {
    const s = setup()
    const pending = turn(s, 0, 'farmland')
    assert.equal(pending.state.players[0]!.resources.wood, 0)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 99, col: 99 } }))
    const r = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assert.equal(r.state.players[0]!.fields.length, 1)

    sessionEvidence.record('A119-N1', { pending, r })
  })
  it("Grain Seeds Grain Utilization and Cultivation grant one wood once", () => {
    for (const space of ['grain-seeds', 'grain-utilization', 'cultivation']) {
      const s = setup(state => {
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
        state.players[0]!.resources.grain = 1
      })
      let r = turn(s, 0, space)
      if (space === 'grain-utilization' || space === 'cultivation') {
        for (let n = 0; n < 8 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
          if (r.interaction.request.kind === 'choice') {
            const o = getChoiceOptions(r).find(o => o.labelKey === 'actions.sow.name') ?? getChoiceOptions(r).find(o => o.value === '__done__' || o.value === '__skip__')
            assert.ok(o, JSON.stringify(r.interaction))
            r = ok(s.resolveChoice(0, o.value))
          }
          else if (r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
            r = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }))
          else if (r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow')
            r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
          else
            assert.fail(JSON.stringify(r.interaction))
        }
      }
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.resources.wood, 1)

      sessionEvidence.record(`A119-N2-${space}`, r)
    }
  })
  it("unrelated action unplayed and opponent cannot reward owner wood", () => {
    const basic = turn(setup(), 0, 'day-laborer')
    assert.ok(basic.interaction.stateId === 'wait')
    assert.deepEqual(basic.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(basic.interaction.playerIndex, 0)
    assert.equal(basic.state.currentPlayerIndex, 0)
    assert.equal(basic.state.players[0]!.resources.wood, 0)
    const hand = turn(setup(undefined, false), 0, 'grain-seeds')
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(hand.interaction.playerIndex, 0)
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(hand.state.players[0]!.resources.wood, 0)
    const s = setup()
    turn(s, 0, 'day-laborer')
    const r = turn(s, 1, 'grain-seeds')
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    assert.equal(r.interaction.playerIndex, 1)
    assert.equal(r.state.currentPlayerIndex, 1)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[1]!.resources.wood, 0)

    sessionEvidence.record('A119-N3', { basic, hand, r })
  })
  it("whole Farmland undo removes field and wood then one retry", () => {
    const s = setup()
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    turn(s, 0, 'farmland')
    const first = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(first.state.players[0]!.resources.wood, 1)
    assert.deepEqual(first.state.players[0]!.fields, [{ row: 0, col: 1, stacks: [] }])
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.equal(undone.state.players[0]!.fields.length, 0)
    turn(s, 0, 'farmland')
    const retry = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.wood, 1)

    sessionEvidence.record('A119-N4', { first, undone, retry })
  })
})
