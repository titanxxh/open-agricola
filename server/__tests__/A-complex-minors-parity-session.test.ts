import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A010_WoodenShed'
import '../../shared/cards/A/A021_FamilyFriendHome'
import '../../shared/cards/A/A029_AleBenches'
import '../../shared/cards/A/A040_PottersYard'
import '../../shared/cards/A/A043_FarmyardManure'
import '../../shared/cards/A/A065_SeedPellets'
import '../../shared/cards/A/A074_StableTree'
import '../../shared/cards/A/A083_ShepherdsCrook'
import '../../shared/cards/D/D003_Furrows'

type CardId =
  | 'A010_WoodenShed'
  | 'A021_FamilyFriendHome'
  | 'A029_AleBenches'
  | 'A040_PottersYard'
  | 'A043_FarmyardManure'
  | 'A065_SeedPellets'
  | 'A074_StableTree'
  | 'A083_ShepherdsCrook'
  | 'D003_Furrows'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']

const setupMinor = ({
  cardId,
  resources = {},
  occupations = 0,
  played = false,
  round = 14,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  occupations?: number
  played?: boolean
  round?: number
}) => {
  const session = new GameSession(4041, undefined, { playerCount: 2 })
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
  player.minorHand = played ? [FILLER] : [cardId]
  player.minorPlayed = played ? [cardId] : []
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0,
    ...resources,
  }
  const improvement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!improvement) throw new Error('major-improvement missing')
  improvement.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession, actionId: 'major-improvement' | 'meeting-place') => {
  let response = session.takeAction(0, actionId)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId, actionId: 'major-improvement' | 'meeting-place' = 'major-improvement') => {
  let response = enterImprovementChoice(session, actionId)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (!option) return response
  response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId, actionId: 'major-improvement' | 'meeting-place' = 'major-improvement') => {
  const response = enterImprovementChoice(session, actionId)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  let current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected optional choice')
  const option = current.interaction.request.options?.find((candidate) => {
    return candidate.value !== '__skip__' && (!sourceCard || candidate.sourceCard === sourceCard || current.interaction.stateId === 'wait')
  })
  expect(option).toBeDefined()
  current = session.resolveChoice(current.interaction.playerIndex, option!.value)
  return current
}

const skipChoice = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected optional choice')
  const skip = current.interaction.request.options?.find((candidate) => candidate.value === '__skip__')
  expect(skip).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, skip!.value)
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = response.interaction.request.options?.find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(0, construct.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected room selection')
  expect(response.interaction.request.farm.farmType).toBe('room')
  return response
}

const buildStables = (session: GameSession, count: number) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const stable = response.interaction.request.options?.find((option) => option.labelKey === 'actions.stables.name')
    if (stable) response = session.resolveChoice(0, stable.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected stable selection')
  expect(response.interaction.request.farm.farmType).toBe('stable')
  const stables = response.interaction.request.farm.selectableTiles.slice(0, count)
  expect(stables).toHaveLength(count)
  return session.commitSelectionChoice(0, { stables })
}

const prepareRoundEnd = (session: GameSession, round: number) => {
  const state = session.getState().state
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
}

describe('A010 Wooden Shed parity', () => {
  it('A010 S1: Wooden Shed can be played through Major Improvement for two wood and one reed', () => {
    const response = playMinor(setupMinor({
      cardId: 'A010_WoodenShed', resources: { wood: 2, reed: 1 },
    }), 'A010_WoodenShed')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A010_WoodenShed')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('A010 S2: Meeting Place cannot play Wooden Shed', () => {
    const session = setupMinor({ cardId: 'A010_WoodenShed', resources: { wood: 2, reed: 1 } })

    expect(cardIsOffered(session, 'A010_WoodenShed', 'meeting-place')).toBe(false)
    expect(session.state.players[0]!.minorHand).toContain('A010_WoodenShed')
    expect(session.state.players[0]!.resources).toMatchObject({ wood: 2, reed: 1 })
  })

  it('A010 S3: a non-wood house cannot play Wooden Shed', () => {
    const session = setupMinor({ cardId: 'A010_WoodenShed', resources: { wood: 2, reed: 1 } })
    session.state.players[0]!.houseType = 'clay'
    session.loadState(session.state)

    expect(cardIsOffered(session, 'A010_WoodenShed')).toBe(false)
  })

  it('A010 S4: Wooden Shed provides room for one family member', () => {
    const session = setupMinor({ cardId: 'A010_WoodenShed', played: true, round: 3 })
    const player = session.state.players[0]!
    player.rooms = 2
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(session.state, player, 2)
    session.loadState(session.state)

    const response = session.takeAction(0, 'wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
  })

  it('A010 S5: OA currently allows renovation despite Wooden Shed', () => {
    const session = setupMinor({
      cardId: 'A010_WoodenShed', resources: { clay: 2, reed: 1 }, played: true, round: 14,
    })

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
  })
})

describe('A021 Family Friendly Home parity', () => {
  it('A021 S1: one occupation allows Family Friendly Home to be played', () => {
    const response = playMinor(setupMinor({
      cardId: 'A021_FamilyFriendHome', occupations: 1,
    }), 'A021_FamilyFriendHome')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A021_FamilyFriendHome')
  })

  it('A021 S2: no occupation keeps Family Friendly Home unavailable', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'A021_FamilyFriendHome' }), 'A021_FamilyFriendHome')).toBe(false)
  })

  it('A021 S3: a true room build with a spare room grants food and one family member', () => {
    const session = setupMinor({
      cardId: 'A021_FamilyFriendHome', resources: { wood: 5, reed: 2 }, played: true, round: 5,
    })
    const player = session.state.players[0]!
    player.rooms = 3
    player.roomTiles.push({ row: 0, col: 2 })
    session.loadState(session.state)
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait') throw new Error('expected room selection')
    const room = selection.interaction.request.farm.selectableTiles[0]
    expect(room).toBeDefined()

    let response = session.commitSelectionChoice(0, { rooms: [room!] })
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(familySize(response.state.players[0]!)).toBe(3)
  })

  it('A021 S4: building from a full house does not trigger Family Friendly Home', () => {
    const session = setupMinor({
      cardId: 'A021_FamilyFriendHome', resources: { wood: 5, reed: 2 }, played: true, round: 5,
    })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait') throw new Error('expected room selection')
    const room = selection.interaction.request.farm.selectableTiles[0]

    const response = session.commitSelectionChoice(0, { rooms: [room!] })

    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(familySize(response.state.players[0]!)).toBe(2)
  })
})

const setupAleBenchesRoundEnd = (grain: number) => {
  const session = setupMinor({ cardId: 'A029_AleBenches', played: true, round: 3 })
  session.state.players[0]!.resources.grain = grain
  session.state.players[0]!.resources.food = 0
  session.state.players[1]!.resources.food = 0
  prepareRoundEnd(session, 3)
  return session
}

describe('A029 Ale-Benches parity', () => {
  it('A029 S1: two occupations allow Ale-Benches to be played for one wood', () => {
    const response = playMinor(setupMinor({
      cardId: 'A029_AleBenches', resources: { wood: 1 }, occupations: 2,
    }), 'A029_AleBenches')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A029_AleBenches')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A029 S2: paying one grain at return home gives one bonus point and every opponent one food', () => {
    const session = setupAleBenchesRoundEnd(1)
    const response = chooseNonSkip(session, session.performRoundEnd(), 'A029_AleBenches')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.cardStates.A029_AleBenches?.counters?.bonusVp).toBe(1)
    expect(response.state.players[1]!.resources.food).toBe(1)
  })

  it('A029 S3: declining Ale-Benches preserves grain and grants no point or food', () => {
    const session = setupAleBenchesRoundEnd(1)
    const response = skipChoice(session, session.performRoundEnd(), 'A029_AleBenches')

    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.cardStates.A029_AleBenches?.counters?.bonusVp ?? 0).toBe(0)
    expect(response.state.players[1]!.resources.food).toBe(0)
  })

  it('A029 S4: with no grain OA skips Ale-Benches and grants no reward', () => {
    const response = setupAleBenchesRoundEnd(0).performRoundEnd()

    expect(response.interaction.stateId).not.toBe('wait')
    expect(response.state.players[0]!.cardStates.A029_AleBenches?.counters?.bonusVp ?? 0).toBe(0)
    expect(response.state.players[1]!.resources.food).toBe(0)
  })
})

const setupPottersYard = (usedSpaces: number, played = false) => {
  const session = setupMinor({
    cardId: 'A040_PottersYard', resources: { wood: 1, reed: 1 }, played, round: 14,
  })
  const player = session.state.players[0]!
  const allTiles = getAllTilePositions()
  const used = new Set(player.roomTiles.map((tile) => `${tile.row},${tile.col}`))
  player.fields = allTiles
    .filter((tile) => !used.has(`${tile.row},${tile.col}`))
    .slice(0, Math.max(0, usedSpaces - player.roomTiles.length))
    .map((tile) => ({ ...tile, stacks: [] }))
  session.loadState(session.state)
  return session
}

const pottersYardPlow = () => {
  const session = setupPottersYard(8, true)
  writeCardExtraData(session.state.players[0]!, 'A040_PottersYard', 'clayRemaining', 7)
  session.loadState(session.state)
  let response = session.takeAction(0, 'farmland')
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected plow selection')
  const tile = response.interaction.request.farm.selectableTiles[0]
  expect(tile).toBeDefined()
  response = session.commitSelectionChoice(0, { tile })
  response = resolveTriggerIfPresent(session, response, 'A040_PottersYard')
  return { session, response }
}

describe('A040 Potters Yard parity', () => {
  it('A040 S1: at most seven unused spaces allow Potters Yard and place one clay on each unused space', () => {
    const response = playMinor(setupPottersYard(8), 'A040_PottersYard')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A040_PottersYard')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(readCardExtraData(response.state.players[0]!, 'A040_PottersYard', 'clayRemaining')).toBe(7)
  })

  it('A040 S2: more than seven unused spaces keeps Potters Yard unavailable', () => {
    expect(cardIsOffered(setupPottersYard(7), 'A040_PottersYard')).toBe(false)
  })

  it('A040 S3: using a clay-covered space collects its clay and may exchange it for two food', () => {
    const { session, response: offered } = pottersYardPlow()
    const response = chooseNonSkip(session, offered, 'A040_PottersYard')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 2 })
    expect(readCardExtraData(response.state.players[0]!, 'A040_PottersYard', 'clayRemaining')).toBe(6)
  })

  it('A040 S4: declining the exchange keeps the collected clay', () => {
    const { session, response: offered } = pottersYardPlow()
    const response = skipChoice(session, offered, 'A040_PottersYard')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 0 })
    expect(readCardExtraData(response.state.players[0]!, 'A040_PottersYard', 'clayRemaining')).toBe(6)
  })
})

describe('A043 Farmyard Manure parity', () => {
  it('A043 S1: one animal allows Farmyard Manure to be played', () => {
    const session = setupMinor({ cardId: 'A043_FarmyardManure' })
    const player = session.state.players[0]!
    player.resources.sheep = 1
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    session.loadState(session.state)

    const response = playMinor(session, 'A043_FarmyardManure')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A043_FarmyardManure')
  })

  it('A043 S2: no animal keeps Farmyard Manure unavailable', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'A043_FarmyardManure' }), 'A043_FarmyardManure')).toBe(false)
  })

  it('A043 S3: building one stable schedules food for the next three rounds', () => {
    const session = setupMinor({
      cardId: 'A043_FarmyardManure', resources: { wood: 2 }, played: true, round: 5,
    })

    const response = buildStables(session, 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(futureRounds(response.state, 'A043_FarmyardManure', 'food')).toEqual([6, 7, 8])
  })

  it('A043 S4: building two stables in one action still schedules only three food', () => {
    const session = setupMinor({
      cardId: 'A043_FarmyardManure', resources: { wood: 4 }, played: true, round: 5,
    })

    const response = buildStables(session, 2)

    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(futureRounds(response.state, 'A043_FarmyardManure', 'food')).toEqual([6, 7, 8])
  })

  it('A043 S5: a future free stable outside your turn schedules no Farmyard Manure food', () => {
    const session = setupMinor({ cardId: 'A043_FarmyardManure', played: true, round: 5 })
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    })
    state.futureMeeples = [{
      id: 'future-stable',
      cardId: 'A089_StablePlanner',
      playerId: state.players[0]!.id,
      round: 6,
      actionId: null,
      resources: { stable: 1 },
    }]
    session.loadState(state)
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected future stable choice')
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected stable selection')
    const stable = response.interaction.request.farm.selectableTiles[0]

    response = session.commitSelectionChoice(0, { stables: [stable!] })

    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(futureRounds(response.state, 'A043_FarmyardManure', 'food')).toEqual([])
  })
})

const setupSeedPellets = (fieldCount: number, played = true) => {
  const session = setupMinor({ cardId: 'A065_SeedPellets', played, round: 14 })
  session.state.players[0]!.fields = getAllTilePositions().slice(0, fieldCount).map((tile) => ({ ...tile, stacks: [] }))
  session.loadState(session.state)
  return session
}

describe('A065 Seed Pellets parity', () => {
  it('A065 S1: three fields allow Seed Pellets to be played', () => {
    const response = playMinor(setupSeedPellets(3, false), 'A065_SeedPellets')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A065_SeedPellets')
  })

  it('A065 S2: two fields keep Seed Pellets unavailable', () => {
    expect(cardIsOffered(setupSeedPellets(2, false), 'A065_SeedPellets')).toBe(false)
  })

  it('A065 S3: an unconditional sow gains one grain before sowing it into an empty field', () => {
    const session = setupSeedPellets(3)
    const player = session.state.players[0]!
    player.resources.grain = 0
    player.resources.vegetable = 0
    session.loadState(session.state)

    let response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected sow selection')
    const field = response.interaction.request.farm.selectableFields[0]
    expect(field).toBeDefined()
    response = session.commitSelectionChoice(0, {
      crops: [{ ...field!.tile, crop: 'grain' }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields.some((entry) =>
      entry.stacks.some((stack) => stack.kind === 'grain' && stack.remaining === 3),
    )).toBe(true)
  })

  it('A065 S4: a conditional one-field sow does not gain grain', () => {
    const session = setupSeedPellets(3)
    const player = session.state.players[0]!
    player.minorHand = ['D003_Furrows']
    player.resources.grain = 0
    session.loadState(session.state)

    const response = playMinor(session, 'D003_Furrows')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('A074 Stable Tree parity', () => {
  it('A074 S1: Stable Tree costs one wood and remains in play', () => {
    const response = playMinor(setupMinor({
      cardId: 'A074_StableTree', resources: { wood: 1 },
    }), 'A074_StableTree')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A074_StableTree')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A074 S2: building one stable on your turn schedules wood for the next three rounds', () => {
    const response = buildStables(setupMinor({
      cardId: 'A074_StableTree', resources: { wood: 2 }, played: true, round: 5,
    }), 1)

    expect(futureRounds(response.state, 'A074_StableTree', 'wood')).toEqual([6, 7, 8])
  })

  it('A074 S3: building multiple stables in one action still schedules only three wood', () => {
    const response = buildStables(setupMinor({
      cardId: 'A074_StableTree', resources: { wood: 4 }, played: true, round: 5,
    }), 2)

    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(futureRounds(response.state, 'A074_StableTree', 'wood')).toEqual([6, 7, 8])
  })

  it('A074 S4: a future free stable outside your turn schedules no Stable Tree wood', () => {
    const session = setupMinor({ cardId: 'A074_StableTree', played: true, round: 5 })
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    })
    state.futureMeeples = [{
      id: 'future-stable',
      cardId: 'A089_StablePlanner',
      playerId: state.players[0]!.id,
      round: 6,
      actionId: null,
      resources: { stable: 1 },
    }]
    session.loadState(state)
    let response = session.performRoundEnd()
    if (response.interaction.stateId !== 'wait') throw new Error('expected future stable choice')
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    if (response.interaction.stateId !== 'wait') throw new Error('expected stable selection')
    const stable = response.interaction.request.farm.selectableTiles[0]

    response = session.commitSelectionChoice(0, { stables: [stable!] })

    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(futureRounds(response.state, 'A074_StableTree', 'wood')).toEqual([])
  })
})

const EDGES_FOR_TWO_BY_TWO = [
  'H-0-1', 'H-0-2', 'H-2-1', 'H-2-2',
  'V-0-1', 'V-1-1', 'V-0-3', 'V-1-3',
]

const EDGES_FOR_ONE = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const playerAnimalCount = (player: PlayerState, type: 'sheep' | 'boar' | 'cattle') => {
  const pasture = player.pastures.reduce((sum, current) =>
    sum + (current.animalType === type ? current.animalCount : 0), 0)
  const house = player.houseAnimalType === type ? player.houseAnimalCount : 0
  const stables = Object.values(player.stableAnimals).filter((animal) => animal === type).length
  return pasture + house + stables
}

describe('A083 Shepherds Crook parity', () => {
  it('A083 S1: Shepherds Crook costs one wood and remains in play', () => {
    const response = playMinor(setupMinor({
      cardId: 'A083_ShepherdsCrook', resources: { wood: 1 },
    }), 'A083_ShepherdsCrook')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A083_ShepherdsCrook')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A083 S2: fencing a new four-space pasture gains two sheep', () => {
    const session = setupMinor({
      cardId: 'A083_ShepherdsCrook', resources: { wood: 12 }, played: true, round: 14,
    })
    let response = session.takeAction(0, 'fencing')
    expect(response.interaction.stateId).toBe('wait')
    response = session.commitSelectionChoice(0, { edges: EDGES_FOR_TWO_BY_TWO, extraWood: 0 })
    response = resolveTriggerIfPresent(session, response, 'A083_ShepherdsCrook')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      const pasture = response.interaction.request.zones.find((zone) => zone.zoneType === 'pasture')
      expect(pasture).toBeDefined()
      response = session.resolveChoice(0, 'confirm', {
        zones: [{ ...pasture!, animalType: 'sheep', animalCount: 2 }],
      })
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(8)
    expect(playerAnimalCount(response.state.players[0]!, 'sheep')).toBe(2)
  })

  it('A083 S3: fencing a one-space pasture gains no sheep', () => {
    const session = setupMinor({
      cardId: 'A083_ShepherdsCrook', resources: { wood: 4 }, played: true, round: 14,
    })
    session.takeAction(0, 'fencing')

    const response = session.commitSelectionChoice(0, { edges: EDGES_FOR_ONE, extraWood: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(playerAnimalCount(response.state.players[0]!, 'sheep')).toBe(0)
  })
})
