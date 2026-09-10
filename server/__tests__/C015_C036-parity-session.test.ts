import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { getFenceCount } from '../../shared/actions/effects/fencing'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C015_Trellis'
import '../../shared/cards/C/C016_FieldFences'
import '../../shared/cards/C/C017_NewlyPlowedField'
import '../../shared/cards/C/C019_SwingPlow'
import '../../shared/cards/C/C020_MolePlow'
import '../../shared/cards/C/C027_Blueprint'
import '../../shared/cards/C/C028_TeachersDesk'
import '../../shared/cards/C/C033_GreeningPlan'
import '../../shared/cards/C/C034_ElephantgrassPlant'
import '../../shared/cards/C/C036_ClayDeposit'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']
const ONE_CELL_EDGES = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3']
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
  const session = new GameSession(7800 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.fenceSegments = []
    player.stableTiles = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
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

const choose = (session: GameSession, response: SessionResponse, predicate: (value: ReturnType<typeof options>[number]) => boolean) => {
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
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
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

const commitPlow = (session: GameSession, response: SessionResponse, index = 0) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  const tiles = response.interaction.request.farm.selectableTiles
  const tile = index < 0 ? tiles[tiles.length - 1] : tiles[index]
  expect(tile).toBeDefined()
  return session.commitSelectionChoice(response.interaction.playerIndex, { tile: tile! })
}

const bonusScore = (response: SessionResponse, cardId: string) => response.scores[0]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

describe('C015 Trellis parity', () => {
  it('C015 S1: two occupations allow Trellis to be played for free', () => {
    const response = playMinor(setup({ cardId: 'C015_Trellis', played: false, occupations: 2 }), 'C015_Trellis')
    expect(response.state.players[0]!.minorPlayed).toContain('C015_Trellis')
  })
  const pigMarket = (takeFence: boolean) => {
    const session = setup({ cardId: 'C015_Trellis', occupations: 2, resources: { wood: 4 }, round: 8 })
    const pig = session.state.actionSpaces.find((space) => space.id === 'pig-market')!
    pig.resources.boar = 1
    session.loadState(session.state)
    let response = session.takeAction(0, 'pig-market')
    response = takeFence ? accept(session, response, 'C015_Trellis') : decline(session, response, 'C015_Trellis')
    if (takeFence && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, { edges: ONE_CELL_EDGES, palisadeEdges: [], extraWood: 0 })
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', { zones: [{
        id: 'pasture:0-2', zoneType: 'pasture', animalType: 'boar', animalCount: 1,
      }] })
    }
    return response
  }
  it('C015 S2: before Pig Market Trellis may build paid fences and then collect the pig', () => {
    const response = pigMarket(true)
    expect(getFenceCount(response.state.players[0]!)).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, boar: 1 })
  })
  it('C015 S3: the Trellis fencing action may be declined', () => {
    const response = pigMarket(false)
    expect(getFenceCount(response.state.players[0]!)).toBe(0)
    expect(response.state.players[0]!.resources.wood).toBe(4)
  })
  it('C015 S4: one occupation keeps Trellis unavailable', () => {
    const response = playMinor(setup({ cardId: 'C015_Trellis', played: false, occupations: 1 }), 'C015_Trellis')
    expect(response.state.players[0]!.minorHand).toContain('C015_Trellis')
  })
})

describe('C016 Field Fences parity', () => {
  it('C016 S1: paying two food may build field-adjacent fences at the discounted cost', () => {
    const session = setup({ cardId: 'C016_FieldFences', played: false, resources: { food: 2, wood: 3 } })
    session.state.players[0]!.fields = [{ row: 0, col: 3, crop: null, remaining: 0 }]
    session.loadState(session.state)
    let response = playMinor(session, 'C016_FieldFences')
    response = accept(session, response, 'C016_FieldFences')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(0, { edges: ONE_CELL_EDGES, palisadeEdges: [], extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(getFenceCount(response.state.players[0]!)).toBe(4)
  })
  it('C016 S2: the immediate fencing action may be declined', () => {
    const session = setup({ cardId: 'C016_FieldFences', played: false, resources: { food: 2, wood: 4 } })
    const response = decline(session, playMinor(session, 'C016_FieldFences'), 'C016_FieldFences')
    expect(response.state.players[0]!.minorPlayed).toContain('C016_FieldFences')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 4 })
  })
})

describe('C017 Newly-Plowed Field parity', () => {
  const withFields = (count: number) => {
    const session = setup({ cardId: 'C017_NewlyPlowedField', played: false })
    session.state.players[0]!.fields = Array.from({ length: count }, (_, index) => ({
      row: Math.floor(index / 3), col: index % 3 + 2, crop: null, remaining: 0,
    }))
    session.loadState(session.state)
    return session
  }
  it('C017 S1: exactly three fields allow the card and one unrestricted plow', () => {
    const session = withFields(3)
    let response = playMinor(session, 'C017_NewlyPlowedField')
    response = accept(session, response, 'C017_NewlyPlowedField')
    response = commitPlow(session, response, -1)
    expect(response.state.players[0]!.minorPlayed).toContain('C017_NewlyPlowedField')
    expect(response.state.players[0]!.fields).toHaveLength(4)
  })
  it('C017 S2: the immediate plow may be declined', () => {
    const session = withFields(3)
    const response = decline(session, playMinor(session, 'C017_NewlyPlowedField'), 'C017_NewlyPlowedField')
    expect(response.state.players[0]!.fields).toHaveLength(3)
  })
  it.each([2, 4])('C017 S3: %i fields keep the card unavailable', (count) => {
    const response = playMinor(withFields(count), 'C017_NewlyPlowedField')
    expect(response.state.players[0]!.minorHand).toContain('C017_NewlyPlowedField')
  })
})

describe('C019 Swing Plow parity', () => {
  it('C019 S1: three occupations and three wood play Swing Plow with four stored fields', () => {
    const response = playMinor(setup({
      cardId: 'C019_SwingPlow', played: false, occupations: 3, resources: { wood: 3 },
    }), 'C019_SwingPlow')
    expect(response.state.players[0]!.minorPlayed).toContain('C019_SwingPlow')
    expect(getCardStack(response.state.players[0]!, 'C019_SwingPlow')).toHaveLength(4)
  })
  const use = (take: number) => {
    const session = setup({ cardId: 'C019_SwingPlow', occupations: 3 })
    session.state.players[0]!.cardStates.C019_SwingPlow = { stack: ['field', 'field', 'field', 'field'] }
    session.loadState(session.state)
    let response = commitPlow(session, session.takeAction(0, 'farmland'))
    for (let index = 0; index < take; index++) {
      response = accept(session, response, 'C019_SwingPlow')
      response = commitPlow(session, response)
    }
    if (take < 2) response = decline(session, response, 'C019_SwingPlow')
    return response
  }
  it('C019 S2: Farmland may plow two additional stored fields', () => {
    const response = use(2)
    expect(response.state.players[0]!.fields).toHaveLength(3)
    expect(getCardStack(response.state.players[0]!, 'C019_SwingPlow')).toHaveLength(2)
  })
  it('C019 S3: declining the first offer spends no stored field', () => {
    const response = use(0)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(getCardStack(response.state.players[0]!, 'C019_SwingPlow')).toHaveLength(4)
  })
  it('C019 S4: fewer than three occupations keep Swing Plow unavailable', () => {
    const response = playMinor(setup({ cardId: 'C019_SwingPlow', played: false, occupations: 2, resources: { wood: 3 } }), 'C019_SwingPlow')
    expect(response.state.players[0]!.minorHand).toContain('C019_SwingPlow')
  })
})

describe('C020 Mole Plow parity', () => {
  it('C020 S1: round nine permits paying three wood and one food for Mole Plow', () => {
    const response = playMinor(setup({ cardId: 'C020_MolePlow', played: false, round: 9, resources: { wood: 3, food: 1 } }), 'C020_MolePlow')
    expect(response.state.players[0]!.minorPlayed).toContain('C020_MolePlow')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })
  it('C020 S2: before round nine Mole Plow is unavailable', () => {
    const response = playMinor(setup({ cardId: 'C020_MolePlow', played: false, round: 8, resources: { wood: 3, food: 1 } }), 'C020_MolePlow')
    expect(response.state.players[0]!.minorHand).toContain('C020_MolePlow')
  })
  const use = (takeExtra: boolean) => {
    const session = setup({ cardId: 'C020_MolePlow', round: 9 })
    let response = commitPlow(session, session.takeAction(0, 'farmland'))
    response = takeExtra ? accept(session, response, 'C020_MolePlow') : decline(session, response, 'C020_MolePlow')
    if (takeExtra) response = commitPlow(session, response)
    return response
  }
  it('C020 S3: Farmland may plow one additional field', () => {
    expect(use(true).state.players[0]!.fields).toHaveLength(2)
  })
  it('C020 S4: the additional field may be declined', () => {
    expect(use(false).state.players[0]!.fields).toHaveLength(1)
  })
  it('C020 S5: Cultivation may plow one additional field', () => {
    const session = setup({ cardId: 'C020_MolePlow', round: 9 })
    let response = commitPlow(session, session.takeAction(0, 'cultivation'))
    response = accept(session, response, 'C020_MolePlow')
    response = commitPlow(session, response)
    expect(response.state.players[0]!.fields).toHaveLength(2)
  })
})

describe('C027 Blueprint parity', () => {
  it('C027 S1: paying one food plays Blueprint', () => {
    const response = playMinor(setup({ cardId: 'C027_Blueprint', played: false, resources: { food: 1 } }), 'C027_Blueprint')
    expect(response.state.players[0]!.minorPlayed).toContain('C027_Blueprint')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId === 'wait') {
      const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
      if (branch) response = session.resolveChoice(0, branch.value)
    }
    return response
  }
  it('C027 S2: a true Minor Improvement action may build discounted Joinery', () => {
    const session = setup({ cardId: 'C027_Blueprint', resources: { wood: 2, stone: 1 } })
    session.state.availableMajorImprovements = ['Major_Joinery']
    session.state.players[0]!.minorHand = ['B004_WoodPile']
    session.loadState(session.state)
    let response = choose(session, enterMinor(session), (option) => option.value === 'Major_Joinery')
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
      response = choose(session, response, () => true)
    }
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })
  it('C027 S3: Blueprint does not expose a non-listed major on a Minor Improvement action', () => {
    const session = setup({ cardId: 'C027_Blueprint', resources: { clay: 2 } })
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    session.state.players[0]!.minorHand = [FILLER]
    session.loadState(session.state)
    const response = enterMinor(session)
    expect(options(response).some((option) => option.value === 'Major_Fireplace1')).toBe(false)
  })
})

describe('C028 Teachers Desk parity', () => {
  it('C028 S1: one prior occupation and one wood play Teachers Desk', () => {
    const response = playMinor(setup({ cardId: 'C028_TeachersDesk', played: false, occupations: 1, resources: { wood: 1 } }), 'C028_TeachersDesk')
    expect(response.state.players[0]!.minorPlayed).toContain('C028_TeachersDesk')
  })
  const useMajor = (acceptOccupation: boolean, withOccupation = true) => {
    const session = setup({ cardId: 'C028_TeachersDesk', occupations: 1, resources: { food: 1, clay: 2 } })
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    session.state.players[0]!.occupationHand = withOccupation ? ['A125_Priest'] : []
    session.loadState(session.state)
    let response = session.takeAction(0, 'major-improvement')
    if (withOccupation) response = acceptOccupation
      ? accept(session, response, 'C028_TeachersDesk')
      : decline(session, response, 'C028_TeachersDesk')
    if (acceptOccupation && response.interaction.stateId === 'wait'
      && options(response).some((option) => option.value === 'A125_Priest')) {
      response = choose(session, response, (option) => option.value === 'A125_Priest')
    }
    return response
  }
  it('C028 S2: before Major Improvement one food may play an occupation', () => {
    const response = useMajor(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A125_Priest')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
  it('C028 S3: the Teachers Desk occupation may be declined', () => {
    const response = useMajor(false)
    expect(response.state.players[0]!.occupationHand).toContain('A125_Priest')
    expect(response.state.players[0]!.resources.food).toBe(1)
  })
  it('C028 S4: without a real occupation OA gives no Teachers Desk offer', () => {
    const session = setup({ cardId: 'C028_TeachersDesk', occupations: 1, resources: { food: 1, clay: 2 } })
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    session.state.players[0]!.occupationHand = [FILLER]
    session.loadState(session.state)
    const response = session.takeAction(0, 'major-improvement')
    expect(JSON.stringify(response.interaction)).not.toContain('C028_TeachersDesk')
    expect(response.state.players[0]!.resources.food).toBe(1)
  })
  it('C028 S5: before House Redevelopment one food may play an occupation', () => {
    const session = setup({
      cardId: 'C028_TeachersDesk', occupations: 1, resources: { food: 1, clay: 2, reed: 1 },
    })
    session.state.players[0]!.occupationHand = ['A125_Priest']
    session.loadState(session.state)
    let response = session.takeAction(0, 'house-redevelopment')
    response = accept(session, response, 'C028_TeachersDesk')
    if (response.interaction.stateId === 'wait'
      && options(response).some((option) => option.value === 'A125_Priest')) {
      response = choose(session, response, (option) => option.value === 'A125_Priest')
    }
    expect(response.state.players[0]!.occupationPlayed).toContain('A125_Priest')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.houseType).toBe('clay')
  })
})

describe('C033 Greening Plan parity', () => {
  it('C033 S1: paying three food plays Greening Plan', () => {
    const response = playMinor(setup({ cardId: 'C033_GreeningPlan', played: false, resources: { food: 3 } }), 'C033_GreeningPlan')
    expect(response.state.players[0]!.minorPlayed).toContain('C033_GreeningPlan')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
  it.each([
    { scenario: 'S2', fields: 1, score: 0 }, { scenario: 'S3', fields: 2, score: 1 },
    { scenario: 'S4', fields: 4, score: 2 }, { scenario: 'S5', fields: 5, score: 3 },
    { scenario: 'S6', fields: 6, score: 5 },
  ])('C033 $scenario: $fields unplanted fields score $score', ({ fields, score }) => {
    const session = setup({ cardId: 'C033_GreeningPlan', round: 14 })
    session.state.players[0]!.fields = Array.from({ length: fields }, (_, index) => ({
      row: Math.floor(index / 3), col: index % 3 + 2, crop: null, remaining: 0,
    }))
    session.loadState(session.state)
    expect(bonusScore(session.getState(), 'C033_GreeningPlan')).toBe(score)
  })
})

describe('C034 Elephantgrass Plant parity', () => {
  it('C034 S1: two occupations and printed resources play Elephantgrass Plant', () => {
    const response = playMinor(setup({ cardId: 'C034_ElephantgrassPlant', played: false, occupations: 2, resources: { clay: 2, stone: 1 } }), 'C034_ElephantgrassPlant')
    expect(response.state.players[0]!.minorPlayed).toContain('C034_ElephantgrassPlant')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0 })
  })
  const harvest = (reed: number, acceptExchange: boolean) => {
    const session = setup({ cardId: 'C034_ElephantgrassPlant', occupations: 2, round: 4, resources: { reed, food: 20 } })
    session.state.players.forEach((player) => { player.resources.food = 20; markAllWorkersUsed(session.state, player) })
    session.loadState(session.state)
    let response = session.performRoundEnd()
    if (JSON.stringify(response.interaction).includes('C034_ElephantgrassPlant')) {
      response = acceptExchange
        ? accept(session, response, 'C034_ElephantgrassPlant')
        : decline(session, response, 'C034_ElephantgrassPlant')
    }
    return response
  }
  it('C034 S2: immediately after harvest one reed may become one point', () => {
    const response = harvest(1, true)
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(response.state.players[0]!.cardStates.C034_ElephantgrassPlant?.counters?.bonusVp).toBe(1)
  })
  it('C034 S3: the Elephantgrass exchange may be declined', () => {
    const response = harvest(1, false)
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(response.state.players[0]!.cardStates.C034_ElephantgrassPlant?.counters?.bonusVp ?? 0).toBe(0)
  })
  it('C034 S4: OA silently skips Elephantgrass Plant without reed', () => {
    const response = harvest(0, false)
    expect(JSON.stringify(response.interaction)).not.toContain('C034_ElephantgrassPlant')
  })
})

describe('C036 Clay Deposit parity', () => {
  it('C036 S1: one occupation and two food play Clay Deposit', () => {
    const response = playMinor(setup({ cardId: 'C036_ClayDeposit', played: false, occupations: 1, resources: { food: 2 } }), 'C036_ClayDeposit')
    expect(response.state.players[0]!.minorPlayed).toContain('C036_ClayDeposit')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
  const collectClay = (acceptExchange: boolean) => {
    const session = setup({ cardId: 'C036_ClayDeposit', occupations: 1 })
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
    session.loadState(session.state)
    let response = session.takeAction(0, 'clay-pit')
    response = acceptExchange ? accept(session, response, 'C036_ClayDeposit') : decline(session, response, 'C036_ClayDeposit')
    return response
  }
  it('C036 S2: after clay collection one clay may return to the space for one point', () => {
    const response = collectClay(true)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay).toBe(1)
    expect(
      response.state.players[0]!.cardStates.C036_ClayDeposit?.counters?.bonusVp ?? 0,
      JSON.stringify({ interaction: response.interaction, cardState: response.state.players[0]!.cardStates.C036_ClayDeposit, scores: response.scores[0] }),
    ).toBe(0)
  })
  it('C036 S3: the Clay Deposit exchange may be declined', () => {
    const response = collectClay(false)
    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay).toBe(0)
  })
  it('C036 S4: collecting another resource gives no Clay Deposit offer', () => {
    const response = setup({ cardId: 'C036_ClayDeposit', occupations: 1 }).takeAction(0, 'forest')
    expect(JSON.stringify(response.interaction)).not.toContain('C036_ClayDeposit')
  })
})
