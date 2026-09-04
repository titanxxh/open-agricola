import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/E/E092_FieldDoctor'
import '../../shared/cards/E/E093_Motivator'
import '../../shared/cards/E/E094_Prophet'
import '../../shared/cards/E/E095_Miller'
import '../../shared/cards/E/E097_Beneficiary'
import '../../shared/cards/E/E130_Overachiever'
import '../../shared/cards/E/E132_VeggieLover'
import '../../shared/cards/E/E135_Pickler'
import '../../shared/cards/E/E147_AnimalDriver'
import '../../shared/cards/E/E164_MountainPlowman'
import '../../shared/cards/E/E165_MasterHuntsman'
import '../../shared/cards/E/E166_Roastmaster'

type CardId =
  | 'E092_FieldDoctor' | 'E093_Motivator' | 'E094_Prophet' | 'E095_Miller'
  | 'E097_Beneficiary' | 'E130_Overachiever' | 'E132_VeggieLover' | 'E135_Pickler'
  | 'E147_AnimalDriver' | 'E164_MountainPlowman' | 'E165_MasterHuntsman' | 'E166_Roastmaster'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']

const setupOccupation = (cardId: CardId, {
  playerCount = 2, played = false, round = 14, resources = {}, occupations = 0, workers = 2,
}: {
  playerCount?: number; played?: boolean; round?: number; resources?: Partial<Resource>
  occupations?: number; workers?: number
} = {}) => {
  const session = new GameSession(4059, undefined, { playerCount })
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
  setWorkersAtHome(state, player, workers)
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.occupationHand = played ? [FILLER] : [cardId]
  if (played) player.occupationPlayed.push(cardId)
  player.resources = {
    ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
    vegetable: 0, sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, option!.value)
}

const chooseSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  return session.resolveChoice(current.interaction.playerIndex, '__skip__')
}

const setSpaceResource = (state: GameState, spaceId: string, resource: keyof Resource, count: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources[resource] = count
  space.takenBy = []
}

const prepareRoundEnd = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = Math.max(player.resources.food, 20)
  })
  session.loadState(state)
}

const fillFarm = (player: GameState['players'][number]) => {
  const occupied = new Set(player.roomTiles.map((tile) => `${tile.row},${tile.col}`))
  player.fields = Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, col) => ({
    row, col, stacks: [],
  }))).flat().filter((tile) => !occupied.has(`${tile.row},${tile.col}`))
}

const cardBonusScore = (response: SessionResponse, cardId: CardId, playerIndex = 0) =>
  response.scores[playerIndex]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === cardId)?.score ?? 0

describe('E094 Prophet parity', () => {
  const setup = () => setupOccupation('E094_Prophet', { resources: { clay: 2, reed: 1, wood: 4 } })

  it('E094 S1: playing immediately renovates a wood house to clay', () => {
    const response = playOccupation(setup(), 'E094_Prophet')
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it('E094 S2: optional fencing after renovation may be declined', () => {
    const session = setup()
    let response = playOccupation(session, 'E094_Prophet')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})

describe('E092 Field Doctor parity', () => {
  const surrounding = [[0, 0], [0, 1], [1, 1], [2, 1]] as const
  const setup = (valid: boolean) => {
    const session = setupOccupation('E092_FieldDoctor', { played: true, round: 14 })
    const state = session.getState().state
    state.roundActionOrder = state.roundActionOrder.map((id) => id === 'wish-children' ? null : id)
    state.roundActionOrder[0] = 'wish-children'
    const player = state.players[0]!
    player.rooms = 2
    player.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }]
    const fields = valid ? surrounding : [[0, 1], [1, 1], [2, 1], [0, 2]] as const
    player.fields = fields.map(([row, col]) => ({ row, col, stacks: [] }))
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy = []
    session.loadState(state)
    return session
  }

  it('E092 S1: four surrounding fields allow one family growth without room', () => {
    const response = setup(true).takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, 'E092_FieldDoctor')).toBe(true)
  })

  it('E092 S2: rejects wrong-position fields at the authoritative action entry', () => {
    const session = setup(false)
    expect(session.getState().actionAvailability?.['wish-children']).toBe(false)
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')?.takenBy).toHaveLength(0)
  })
})

describe('E093 Motivator parity', () => {
  const nextRound = (full: boolean) => {
    const session = setupOccupation('E093_Motivator', { played: true, round: 5, resources: { food: 20 } })
    if (full) fillFarm(session.state.players[0]!)
    session.state.players.forEach((player) => { markAllWorkersUsed(session.state, player); player.resources.food = 20 })
    session.loadState(session.state)
    return { session, response: session.performRoundEnd() }
  }

  it('E093 S1: a full farm offers an extra person placement at the first turn', () => {
    const { session, response: initial } = nextRound(true)
    const response = chooseNonSkip(session, initial, 'E093_Motivator')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.some((option) => option.value === 'day-laborer')).toBe(true)
  })

  it('E093 S2: an unused farmyard space prevents the extra placement', () => {
    const { response } = nextRound(false)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('E093_Motivator')
  })
})

describe('E130 Overachiever parity', () => {
  const setup = () => {
    const session = setupOccupation('E130_Overachiever', { playerCount: 3, played: true, round: 14 })
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 3
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
    player.minorHand = ['B081_Handcart']
    state.roundActionOrder = state.roundActionOrder.map((id) => id === 'wish-children' ? null : id)
    state.roundActionOrder[0] = 'wish-children'
    session.loadState(state)
    return session
  }

  it('E130 S1: Wish for Children may play Handcart free via one-resource discount before growth', () => {
    const session = setup()
    let response = chooseNonSkip(session, session.takeAction(0, 'wish-children'), 'E130_Overachiever')
    if (response.interaction.stateId === 'wait') {
      const handcart = response.interaction.request.options?.find((option) => option.value === 'B081_Handcart')
      if (handcart) response = session.resolveChoice(0, handcart.value)
    }
    expect(response.state.players[0]!.minorPlayed).toContain('B081_Handcart')
    expect(familySize(response.state.players[0]!)).toBe(3)
  })

  it('E130 S2: the additional improvement may be declined while family growth continues', () => {
    const session = setup()
    const response = chooseSkip(session, session.takeAction(0, 'wish-children'), 'E130_Overachiever')
    expect(familySize(response.state.players[0]!)).toBe(3)
  })
})

describe('E095 Miller parity', () => {
  const available = () => {
    const session = setupOccupation('E095_Miller', { resources: { clay: 2 } })
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    session.loadState(session.state)
    return session
  }

  it('E095 S1: playing may immediately build a paid Fireplace', () => {
    const session = available()
    let response = chooseNonSkip(session, playOccupation(session, 'E095_Miller'), 'E095_Miller')
    if (response.interaction.stateId === 'wait') {
      const fireplace = response.interaction.request.options?.find((option) => option.value === 'Major_Fireplace1')
      if (fireplace) response = session.resolveChoice(0, fireplace.value)
    }
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
  })

  it('E095 S2: the immediate baking improvement may be declined', () => {
    const session = available()
    const response = chooseSkip(session, playOccupation(session, 'E095_Miller'), 'E095_Miller')
    expect(response.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
  })

  it('E095 S3: another player using Grain Seeds offers the owner Bake Bread', () => {
    const session = setupOccupation('E095_Miller', { played: true, resources: { grain: 1 } })
    session.state.players[0]!.improvements = ['Major_Fireplace1']
    session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
    session.state.currentPlayerIndex = 1
    session.loadState(session.state)
    let response = session.takeAction(1, 'grain-seeds')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined).toBe('confirm-player-switch')
    response = confirmPlayerSwitch(session)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).toBe('E095_Miller')
  })
})

describe('E097 Beneficiary parity', () => {
  const setup = (occupations: number) => {
    const session = setupOccupation('E097_Beneficiary', { playerCount: 4, occupations, resources: { food: 10 } })
    session.state.players[0]!.occupationHand = ['E097_Beneficiary', 'C123_Freemason']
    session.loadState(session.state)
    return session
  }

  it('E097 S1: as the third occupation may play another occupation for one food', () => {
    const session = setup(2)
    let response = playOccupation(session, 'E097_Beneficiary')
    const before = response.state.players[0]!.resources.food
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const occupation = response.interaction.request.options?.find((option) => option.labelKey === 'actions.lessons.name')
    expect(occupation).toBeDefined()
    response = session.resolveChoice(0, occupation!.value)
    if (response.interaction.stateId === 'wait') {
      const freemason = response.interaction.request.options?.find((option) => option.value === 'C123_Freemason')
      if (freemason) response = session.resolveChoice(0, freemason.value)
    }
    expect(response.state.players[0]!.occupationPlayed).toContain('C123_Freemason')
    expect(response.state.players[0]!.resources.food).toBe(before - 1)
  })

  it('E097 S2: the Beneficiary bonus may be declined', () => {
    const session = setup(2)
    const response = chooseSkip(session, playOccupation(session, 'E097_Beneficiary'), 'E097_Beneficiary')
    expect(response.state.players[0]!.occupationPlayed).toContain('E097_Beneficiary')
    expect(response.state.players[0]!.occupationPlayed).not.toContain('C123_Freemason')
  })

  it('E097 S3: as a non-third occupation it offers no bonus', () => {
    const response = playOccupation(setup(1), 'E097_Beneficiary')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('E097_Beneficiary')
  })
})

describe('E147 Animal Driver parity', () => {
  const harvest = (stables: number) => {
    const session = setupOccupation('E147_AnimalDriver', { playerCount: 3, played: true, round: 4, resources: { food: 20 } })
    session.state.players[0]!.pastures = stables > 0 ? [{
      id: 'animal-driver-pasture', size: Math.max(stables, 1),
      tiles: Array.from({ length: Math.max(stables, 1) }, (_, col) => ({ row: 0, col })),
      stables, animalType: null, animalCount: 0,
    }] : []
    session.state.players[0]!.stableTiles = Array.from({ length: stables }, (_, col) => ({ row: 0, col }))
    prepareRoundEnd(session)
    return session.performRoundEnd()
  }

  for (const [count, resource] of [[0, null], [1, 'sheep'], [2, 'boar'], [3, 'cattle']] as const) {
    it(`E147 ${count}: ${count} fenced stables grant ${resource ?? 'no animal'} at harvest start`, () => {
      const response = harvest(count)
      expect(response.state.players[0]!.resources.sheep).toBe(resource === 'sheep' ? 1 : 0)
      expect(response.state.players[0]!.resources.boar).toBe(resource === 'boar' ? 1 : 0)
      expect(response.state.players[0]!.resources.cattle).toBe(resource === 'cattle' ? 1 : 0)
    })
  }
})

describe('E166 Roastmaster parity', () => {
  const setup = () => {
    const session = setupOccupation('E166_Roastmaster', { playerCount: 4, played: true, round: 5 })
    setSpaceResource(session.state, 'fishing', 'food', 2)
    setSpaceResource(session.state, 'traveling-players', 'food', 1)
    session.loadState(session.state)
    return session
  }

  it('E166 S1: Fishing may move one food to Traveling Players and gain one cattle', () => {
    const session = setup()
    let response = chooseNonSkip(session, session.takeAction(0, 'fishing'), 'E166_Roastmaster')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      const house = response.interaction.request.zones.find((zone) => zone.zoneType === 'house')
      expect(house).toBeDefined()
      response = session.resolveChoice(0, 'confirm', {
        zones: [{ ...house!, animalType: 'cattle', animalCount: 1 }],
      })
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, cattle: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food).toBe(2)
  })

  it('E166 S2: Roastmaster may be declined', () => {
    const session = setup()
    const response = chooseSkip(session, session.takeAction(0, 'fishing'), 'E166_Roastmaster')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, cattle: 0 })
  })

  it('E166 S3: OA skips Roastmaster when Fishing has no food to move', () => {
    const session = setup()
    setSpaceResource(session.state, 'fishing', 'food', 0)
    session.loadState(session.state)
    const response = session.takeAction(0, 'fishing')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('E166_Roastmaster')
    expect(response.state.players[0]!.resources.cattle).toBe(0)
  })
})

describe('E164 Mountain Plowman parity', () => {
  it('E164 S1: plowing one field gains one sheep', () => {
    const session = setupOccupation('E164_MountainPlowman', { playerCount: 4, played: true })
    let response = session.takeAction(0, 'farmland')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const tile = response.interaction.request.farm?.selectableTiles[0]
    expect(tile).toBeDefined()
    response = session.commitSelectionChoice(0, { tile })
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })

  it('E164 S2: a non-plow action grants no sheep', () => {
    expect(setupOccupation('E164_MountainPlowman', { playerCount: 4, played: true })
      .takeAction(0, 'day-laborer').state.players[0]!.resources.sheep).toBe(0)
  })
})

describe('E165 Master Huntsman parity', () => {
  it('E165 S1: playing immediately gains one boar', () => {
    expect(playOccupation(setupOccupation('E165_MasterHuntsman', { playerCount: 4 }), 'E165_MasterHuntsman')
      .state.players[0]!.resources.boar).toBe(1)
  })

  it('E165 S2: building a major improvement gains one boar', () => {
    const session = setupOccupation('E165_MasterHuntsman', { playerCount: 4, played: true, resources: { clay: 2 } })
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    session.loadState(session.state)
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId === 'wait') {
      const action = response.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
      if (action) response = session.resolveChoice(0, action.value)
    }
    if (response.interaction.stateId === 'wait') {
      const fireplace = response.interaction.request.options?.find((option) => option.value === 'Major_Fireplace1')
      if (fireplace) response = session.resolveChoice(0, fireplace.value)
    }
    response = resolveTriggerIfPresent(session, response, 'E165_MasterHuntsman')
    expect(response.state.players[0]!.resources.boar).toBe(1)
  })
})

describe('E132 Veggie Lover parity', () => {
  const harvest = (accept: boolean) => {
    const session = setupOccupation('E132_VeggieLover', {
      playerCount: 3, played: true, round: 4, resources: { grain: 1, vegetable: 1 },
    })
    prepareRoundEnd(session)
    session.state.players[0]!.resources.food = 0
    session.loadState(session.state)
    const initial = session.performRoundEnd()
    return accept
      ? chooseNonSkip(session, initial, 'E132_VeggieLover')
      : chooseSkip(session, initial, 'E132_VeggieLover')
  }

  it('E132 S1: during feeding may exchange one grain and vegetable for six food', () => {
    const response = harvest(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0, food: 2 })
  })

  it('E132 S2: the harvest exchange may be declined', () => {
    const response = harvest(false)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
  })

  it('E132 S3: three crop pairs contribute six bonus points at game end', () => {
    const session = setupOccupation('E132_VeggieLover', {
      playerCount: 3, played: true, round: 14, resources: { grain: 3, vegetable: 3 },
    })
    expect(cardBonusScore(session.getState(), 'E132_VeggieLover')).toBe(6)
  })

  it('E132 S4: OA auto-selects all three affordable pairs without a lower-score choice', () => {
    const session = setupOccupation('E132_VeggieLover', {
      playerCount: 3, played: true, round: 14, resources: { grain: 3, vegetable: 3 },
    })
    const response = session.invokeAfterRoundEnd()
    expect(response.interaction.stateId).toBe('gameover')
    expect(cardBonusScore(response, 'E132_VeggieLover')).toBe(6)
  })
})

describe('E135 Pickler parity', () => {
  it('E135 S1: wood depends on complete rounds remaining', () => {
    for (const [round, wood] of [[5, 4], [6, 3], [9, 2], [12, 1], [14, 0]] as const) {
      const response = playOccupation(setupOccupation('E135_Pickler', { playerCount: 3, round }), 'E135_Pickler')
      expect(response.state.players[0]!.resources.wood).toBe(wood)
    }
  })

  it('E135 S2: a player tied for most total vegetables scores three bonus points', () => {
    const session = setupOccupation('E135_Pickler', { playerCount: 3, played: true, resources: { vegetable: 2 } })
    session.state.players[1]!.resources.vegetable = 2
    session.state.players[2]!.resources.vegetable = 1
    session.loadState(session.state)
    expect(cardBonusScore(session.getState(), 'E135_Pickler')).toBe(3)
  })

  it('E135 S3: OA awards no bonus when every player has zero vegetables', () => {
    const session = setupOccupation('E135_Pickler', { playerCount: 3, played: true })
    expect(cardBonusScore(session.getState(), 'E135_Pickler')).toBe(0)
  })
})
