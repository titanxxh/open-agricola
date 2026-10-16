import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import { type FarmyardSpaceState, type GameState, type PlayerState, type Resource, type Field } from '../../shared/contract/types'
import { resolveTriggerIfPresent, expectWait } from './_helpers/trigger-select'
import '../../shared/cards/A/A010_WoodenShed'
import '../../shared/cards/A/A021_FamilyFriendHome'
import '../../shared/cards/A/A029_AleBenches'
import '../../shared/cards/A/A040_PottersYard'
import '../../shared/cards/A/A043_FarmyardManure'
import '../../shared/cards/A/A065_SeedPellets'
import '../../shared/cards/A/A074_StableTree'
import '../../shared/cards/A/A083_ShepherdsCrook'
import '../../shared/cards/D/D003_Furrows'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectFarmSelection, expectTileFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

type CardId = 'A010_WoodenShed'
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
  const session = sessionEvidence.track(createWorkSession({ seed: 4041, options: { playerCount: 2 } }))
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
  const option = getChoiceOptions(response)?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId, actionId: 'major-improvement' | 'meeting-place' = 'major-improvement') => {
  let response = enterImprovementChoice(session, actionId)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  if (!option) return response
  response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId, actionId: 'major-improvement' | 'meeting-place' = 'major-improvement') => {
  const response = enterImprovementChoice(session, actionId)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return getChoiceOptions(response)?.some((candidate) => candidate.value === cardId) ?? false
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  let current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected optional choice')
  const option = getChoiceOptions(current)?.find((candidate) => {
    return candidate.value !== '__skip__' && (!sourceCard || candidate.sourceCard === sourceCard || current.interaction.stateId === 'wait')
  })
  expect(option).toBeDefined()
  current = session.resolveChoice(expectWait(current).interaction.playerIndex, option!.value)
  return current
}

const skipChoice = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected optional choice')
  const skip = getChoiceOptions(current)?.find((candidate) => candidate.value === '__skip__')
  expect(skip).toBeDefined()
  return session.resolveChoice(expectWait(current).interaction.playerIndex, skip!.value)
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = getChoiceOptions(response)?.find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(0, construct.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected room selection')
  expect(expectFarmSelection(response).farmType).toBe('room')
  return response
}

const buildStables = (session: GameSession, count: number) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const stable = getChoiceOptions(response)?.find((option) => option.labelKey === 'actions.stables.name')
    if (stable) response = session.resolveChoice(0, stable.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected stable selection')
  expect(expectFarmSelection(response).farmType).toBe('stable')
  const stables = expectTileFarmSelection(response, 'stable').selectableTiles.slice(0, count)
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

  it('A010 S5: Wooden Shed rejects renovation before placing a worker', () => {
    const session = setupMinor({
      cardId: 'A010_WoodenShed', resources: { clay: 2, reed: 1 }, played: true, round: 14,
    })
    const beforeWorkers = session.state.actionSpaces
      .find((space) => space.id === 'house-redevelopment')?.takenBy.length

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'house-redevelopment')?.takenBy)
      .toHaveLength(beforeWorkers ?? 0)
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
    const room = expectTileFarmSelection(selection, 'room').selectableTiles[0]
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
    const room = expectTileFarmSelection(selection, 'room').selectableTiles[0]

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

const pottersYardClay = (keys: string[]): FarmyardSpaceState[] => keys.map(spaceKey => ({
  spaceKey, sourceCardId: 'A040_PottersYard', kind: 'farmyard-goods-token',
  resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused',
}))

const pottersYardTokens = (player: PlayerState) => player.farmyardSpaceStates
  ?.filter(token => token.sourceCardId === 'A040_PottersYard') ?? []

const sevenClayKeys = ['1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4']

const sixClayKeys = ['1-3', '1-4', '2-1', '2-2', '2-3', '2-4']

const pottersYardPlow = () => {
  const session = setupPottersYard(8, true)
  session.state.players[0]!.farmyardSpaceStates = pottersYardClay(sevenClayKeys)
  session.loadState(session.state)
  let response = session.takeAction(0, 'farmland')
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait')
    throw new Error('expected plow selection')
  const tile = expectTileFarmSelection(response, 'plow').selectableTiles[0]
  expect(tile).toEqual({ row: 1, col: 2 })
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
    expect(pottersYardTokens(response.state.players[0]!)).toEqual(pottersYardClay(sevenClayKeys))
  })
  it('A040 S2: more than seven unused spaces keeps Potters Yard unavailable', () => {
    expect(cardIsOffered(setupPottersYard(7), 'A040_PottersYard')).toBe(false)
  })
  it('A040 S3: using a clay-covered space collects its clay and may exchange it for two food', () => {
    const { session, response: offered } = pottersYardPlow()
    const response = chooseNonSkip(session, offered, 'A040_PottersYard')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 2 })
    expect(pottersYardTokens(response.state.players[0]!)).toEqual(pottersYardClay(sixClayKeys))
  })
  it('A040 S4: declining the exchange keeps the collected clay', () => {
    const { session, response: offered } = pottersYardPlow()
    const response = skipChoice(session, offered, 'A040_PottersYard')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 0 })
    expect(pottersYardTokens(response.state.players[0]!)).toEqual(pottersYardClay(sixClayKeys))
  })
})

describe('A043 Farmyard Manure parity', () => {
  it('A043 S1: one animal allows Farmyard Manure to be played', () => {
    const session = setupMinor({ cardId: 'A043_FarmyardManure' })
    const player = session.state.players[0]!
    player.resources.sheep = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']))
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
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected future stable choice')
    const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected stable selection')
    const stable = expectTileFarmSelection(response, 'stable').selectableTiles[0]
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
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected sow selection')
    const farm = expectFarmSelection(response)
    if (farm.farmType !== 'sow') throw new Error('Expected sow selection')
    const field = farm.selectableFields[0]
    expect(field).toBeDefined()
    response = session.commitSelectionChoice(0, {
      crops: [{ ...field!.tile, crop: 'grain' }],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields.some((entry) => entry.stacks.some((stack) => stack.kind === 'grain' && stack.remaining === 3))).toBe(true)
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
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected future stable choice')
    const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected stable selection')
    const stable = expectTileFarmSelection(response, 'stable').selectableTiles[0]
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
  const pasture = player.pastures.reduce((sum, current) => sum + (current.animalType === type ? current.animalCount : 0), 0)
  const house = (Object.values(player.houseAnimals)[0] ?? null) === type ? Object.values(player.houseAnimals).length : 0
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

describe("A021 command boundaries", () => {
  const HOME = 'A021_FamilyFriendHome', CORNER = 'A026_SleepingCorner'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  const roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 0, col: 1 }]
  function setRooms(state: GameState, count: number, owner = 0) {
    state.players[owner]!.rooms = count
    state.players[owner]!.roomTiles = roomTiles.slice(0, count).map(t => ({ ...t }))
  }
  function setup(card: string, { played = true, rooms = 3, people = 2, grainFields = 2, occupations = 1, resources = {} }: {
    played?: boolean
    rooms?: number
    people?: number
    grainFields?: number
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        setRooms(state, rooms)
        setActiveWorkerCount(p, people)
        p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']
        p.minorPlayed = played ? [card] : []
        p.occupationPlayed = occupations ? ['D115_FodderPlanter'] : []
        Object.assign(p.resources, resources)
        if (card === CORNER)
          p.fields = Array.from({ length: grainFields }, (_, i) => ({ row: 0, col: i + 2, stacks: [{ kind: 'grain', remaining: 1 }] }))
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function minorMenu(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const branch = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        r = ok(s.resolveChoice(0, branch.value))
    }
    return r
  }
  function denied(s: GameSession, card: string) {
    const r = minorMenu(s, card)
    assert(!r.state.players[0]!.minorPlayed.includes(card))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      assert(!getChoiceOptions(r).some(o => o.value === card && !o.disabled))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  }
  function buy(s: GameSession, card: string) {
    const r = minorMenu(s, card)
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    assert(options(r).some(o => o.value === card && !o.disabled))
    return ok(s.resolveChoice(0, card))
  }
  function construct(s: GameSession, actor = 0) {
    let r = ok(s.takeAction(actor, 'farm-expansion'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const branch = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name')
      assert(branch)
      r = ok(s.resolveChoice(actor, branch.value))
    }
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
    return r
  }
  it("missing own occupation rejects forged purchase before legal free purchase", () => {
    denied(setup(HOME, { played: false, occupations: 0 }), HOME)
    const s = setup(HOME, { played: false })
    const r = buy(s, HOME)
    assert(r.state.players[0]!.minorPlayed.includes(HOME))
    assert.equal(r.state.players[0]!.resources.food, 20)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, HOME))
  })
  it("adding the first spare room does not qualify a previously full house", () => {
    const s = setup(HOME, { rooms: 2, resources: { wood: 5, reed: 2 } })
    construct(s)
    const r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 2, col: 0 }], stables: [] }))
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(familySize(r.state.players[0]!), 2)
    assert.equal(r.state.players[0]!.resources.food, 20)
  })
  it("two real rooms grant exactly one child and one food with whole-action undo", () => {
    const s = setup(HOME, { resources: { wood: 10, reed: 4 } })
    const before = undoRuleSnapshot(s.getState())
    construct(s)
    const r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }], stables: [] }))
    assert.equal(r.state.players[0]!.rooms, 5)
    assert.equal(familySize(r.state.players[0]!), 3)
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.food], [0, 0, 21])
    assertUndoRestored(before, s.undoAction())
    construct(s)
    const retry = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }], stables: [] }))
    assert.equal(familySize(retry.state.players[0]!), 3)
    assert.equal(retry.state.players[0]!.resources.food, 21)
  })
  it("stable only and actual opponent room construction do not grant owner growth", () => {
    const s = setup(HOME, { resources: { wood: 2 } })
    construct(s)
    const stable = ok(s.commitSelectionChoice(0, { rooms: [], stables: [{ row: 0, col: 1 }] }))
    assert.equal(stable.state.players[0]!.stableTiles.length, 1)
    assert.equal(familySize(stable.state.players[0]!), 2)
    assert.equal(stable.state.players[0]!.resources.food, 20)
    const other = setup(HOME, {}, state => {
      setRooms(state, 3, 1)
      Object.assign(state.players[1]!.resources, { wood: 5, reed: 2 })
    })
    confirmNext(other, ok(other.takeAction(0, 'grain-seeds')))
    construct(other, 1)
    const r = ok(other.commitSelectionChoice(1, { rooms: [{ row: 1, col: 1 }], stables: [] }))
    assert.equal(r.state.players[1]!.rooms, 4)
    assert.equal(familySize(r.state.players[0]!), 2)
    assert.equal(familySize(r.state.players[1]!), 2)
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.state.players[1]!.resources.food, 20)
  })
  it("family remains at five and food observation awaits an independent ruling", () => {
    const s = setup(HOME, { rooms: 6, people: 5, resources: { wood: 5, reed: 2 } })
    construct(s)
    const r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 0, col: 2 }], stables: [] }))
    assert.equal(r.state.players[0]!.rooms, 7)
    assert.equal(familySize(r.state.players[0]!), 5)
    assert.equal(r.state.players[0]!.resources.food, 20)
  })
  it("granted family growth does not inherit optional minor improvement", () => {
    const s = setup(HOME, { resources: { wood: 5, reed: 2 } }, state => {
      state.players[0]!.minorHand = ['B007_Wage']
    })
    construct(s)
    const r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }], stables: [] }))
    assert.equal(familySize(r.state.players[0]!), 3)
    assert(r.state.players[0]!.minorHand.includes('B007_Wage'))
    assert.equal(r.interaction.stateId, 'wait')
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'B007_Wage'))
  })
})

describe("A029 command boundaries", () => {
  const ALE = 'A029_AleBenches'
  function setup({ played = false, players = 2, round = 14, occupations = 0, resources = {}, configure = () => {
  } }: {
    played?: boolean
    players?: number
    round?: number
    occupations?: number
    resources?: Partial<PlayerState['resources']>
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = [p === state.players[0] ? 'A123_FrameBuilder' : 'A116_WoodCutter']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = [ALE]
        else
          p.minorHand.push(ALE)
        p.occupationPlayed = ['B121_Geologist', 'C123_Freemason'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function choices(r: SessionResponse) {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function enter(s: GameSession, space = 'meeting-place') {
    let r = ok(s.takeAction(0, space))
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.ok(choices(r).some(o => o.value === card && !o.disabled))
    const result = ok(s.resolveChoice(0, card))
    assert.equal(result.state.players[0]!.minorPlayed.includes(card), true)
    assert.equal(result.state.players[0]!.minorHand.includes(card), false)
    const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.equal(event.actorPlayerId, result.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources ?? {}, card === ALE ? { wood: 1 } : {})
    assert.ok(result.interaction.stateId === 'wait' && result.interaction.request.kind === 'confirm-next-player', JSON.stringify(result.interaction))
    assert.equal(result.interaction.playerIndex, 0)
    assert.equal(result.state.currentPlayerIndex, 0)
    return result
  }

  function skip(s: GameSession, r: SessionResponse) {
    assert.ok(choices(r).some(o => o.value === '__skip__'))
    const result = ok(s.resolveChoice(0, '__skip__'))
    return result
  }
  function accept(s: GameSession, response: SessionResponse, actor = 0) {
    assert.ok(response.interaction.stateId === 'wait')
    assert.equal(response.interaction.sourceCard, ALE)
    const enabled = choices(response).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(enabled.length, 1, JSON.stringify(response.interaction))
    return ok(s.resolveChoice(actor, enabled[0]!.value))
  }
  function offered(r: SessionResponse, card: string) {
    return choices(r).some(o => o.value === card && !o.disabled)
  }
  function returnHome({ grain = 2, players = 2, field = false, otherGrain = 0 } = {}) {
    const s = setup({ played: true, players, round: 3, occupations: 2, resources: { grain, food: 0 }, configure(state) {
        state.players.forEach(p => {
          p.resources.food = 0
          markAllWorkersUsed(state, p)
        })
        state.players[1]!.resources.grain = otherGrain
        if (field)
          state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
      } })
    const r = ok(s.performRoundEnd())
    return { s, r }
  }
  function reward(r: SessionResponse, grain: number, bonus: number, players = 2) {
    assert.equal(r.state.players[0]!.resources.grain, grain)
    assert.equal(r.state.players[0]!.resources.food, 0)
    for (let n = 1; n < players; n++)
      assert.equal(r.state.players[n]!.resources.food, bonus)
    assert.equal(r.state.players[0]!.cardStates[ALE]?.counters?.bonusVp ?? 0, bonus)
    assert.ok(r.scores)
    const category = r.scores[0]!.categories.find(c => c.key === 'cardBonusVp')
    assert.equal(category?.entries?.find(e => e.type === 'bonus' && e.cardId === ALE)?.score ?? 0, bonus)
    for (const player of r.state.players)
      assert.equal(workersAtHome(r.state, player).length, 2)
    const payments = r.state.events.filter(e => e.type === 'resource.paid' && e.sourceCardId === ALE)
    assert.equal(payments.length, bonus)
    if (bonus) {
      const payment = payments[0]!
      assert.ok(payment.type === 'resource.paid')
      assert.deepEqual(payment.resources, { grain: 1 })
      const gifts = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === ALE && e.resources.food === 1)
      assert.equal(gifts.length, players - 1)
      for (let i = 1; i < players; i++) {
        const gift = gifts[i - 1]!
        assert.ok(gift.type === 'resource.moved')
        assert.deepEqual(gift.resources, { food: 1 })
        assert.deepEqual(gift.to, { kind: 'player', playerId: r.state.players[i]!.id })
      }
    }
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
  }
  it("actual purchase requires two occupations and pays one wood", () => {
    const s = setup({ occupations: 2, resources: { wood: 1 } })
    const r = buy(s, enter(s), ALE)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.cardStates[ALE]?.counters?.bonusVp ?? 0, 0)
  })
  it("insufficient wood or only one occupation rejects before legal retry", () => {
    for (const config of [{ occupations: 2, wood: 0 }, { occupations: 1, wood: 1 }]) {
      const s = setup({ occupations: config.occupations, resources: { wood: config.wood } })
      const r = enter(s)
      assert.equal(offered(r, ALE), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, ALE))
      const done = buy(s, r, 'A054_Credit')
      assert.equal(done.state.players[0]!.resources.wood, config.wood)
    }
  })
  it("returning home pays exactly one supply grain once and rewards only the opponent", () => {
    const { s, r } = returnHome()
    assert.equal(r.state.players[0]!.resources.grain, 2)
    const payment = choices(r).find(o => o.value !== '__skip__' && !o.disabled)
    assert.ok(payment)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, payment.value))
    const result = accept(s, r)
    reward(result, 1, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, '__skip__'))
    assert.equal(result.state.round, 4)
  })
  it("declining returning home preserves grain and gives no point or food", () => {
    const { s, r } = returnHome()
    reward(skip(s, r), 2, 0)
  })
  it("zero supply grain cannot earn a reward despite the accepted Pass prompt difference", () => {
    const { r } = returnHome({ grain: 0 })
    assert.equal(r.interaction.stateId, 'idle')
    reward(r, 0, 0)
  })
  it("grain growing in a field is not supply grain and cannot pay", () => {
    const { r } = returnHome({ grain: 0, field: true })
    assert.equal(r.interaction.stateId, 'idle')
    reward(r, 0, 0)
    assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 3)
  })
  it("with three players only the owner pays while every other player gains one food", () => {
    const { s, r } = returnHome({ players: 3, otherGrain: 4 })
    assert.equal(r.interaction.stateId, 'wait')
    if (r.interaction.stateId === 'wait')
      assert.equal(r.interaction.playerIndex, 0)
    const result = accept(s, r)
    reward(result, 1, 1, 3)
    assert.equal(result.state.players[1]!.resources.grain, 4)
    assert.equal(result.state.players[1]!.cardStates[ALE]?.counters?.bonusVp ?? 0, 0)
  })
})

describe('A065 command boundaries', () => {
  const WAGE = 'B007_Wage'
  const CARD_ID = 'A065_SeedPellets'
  function setup({
    played = true,
    round = 4,
    occupations = [],
    extra = [],
    resources = {},
    opponent = {},
    noCard = false,
    fields = [],
    opponentFields = [],
  }: {
    played?: boolean
    round?: number
    occupations?: string[]
    extra?: string[]
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
    noCard?: boolean
    fields?: Field[]
    opponentFields?: Field[]
  } = {}) {
    const s = sessionEvidence.track(
      createWorkSession({
        seed: 962,
        options: { playerCount: 2 },
        configure: (state) => {
          state.round = round
          state.availableMajorImprovements = []
          state.players.forEach((p) => {
            p.minorHand = ['__test_placeholder__']
            p.occupationHand = ['__test_placeholder__']
            p.minorPlayed = []
            p.occupationPlayed = []
            p.improvements = []
            p.cardStates = {}
            Object.assign(p.resources, {
              wood: 0,
              clay: 0,
              reed: 0,
              stone: 0,
              food: 40,
              grain: 0,
              vegetable: 0,
              sheep: 0,
              boar: 0,
              cattle: 0,
              begging: 0,
            })
          })
          state.roundActionOrder = state.roundActionOrder.map(() => null)
          state.roundActionOrder[0] = 'grain-utilization'
          state.actionSpaces.find(
            (a) => a.id === 'grain-utilization',
          )!.roundAvailable = 1
          const p = state.players[0]!
          p.fields = fields
          state.players[1]!.fields = opponentFields
          p.minorHand = [
            ...(!played && !noCard ? [CARD_ID, WAGE, 'A016_RammedClay'] : []),
            '__test_placeholder__',
          ]
          p.minorPlayed = [...(played && !noCard ? [CARD_ID] : []), ...extra]
          p.occupationPlayed = occupations
          Object.assign(p.resources, resources)
          Object.assign(state.players[1]!.resources, opponent)
          state.actionSpaces.find((a) => a.id === 'forest')!.resources.wood = 3
        },
      }),
    )
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function opts(r: SessionResponse) {
    return r.interaction.stateId === 'wait' &&
      (r.interaction.request.kind === 'choice' ||
        r.interaction.request.kind === 'select-trigger')
      ? getChoiceOptions(r)
      : []
  }
  function choose(
    s: GameSession,
    r: SessionResponse,
    predicate: (o: {
      value: string
      labelKey?: string
      sourceCard?: string
    }) => boolean,
  ) {
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    const o = opts(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'confirm-next-player'
    )
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return ok(s.takeAction(actor, space))
  }
  function minorMenu(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    sessionEvidence.record('command boundary', r)
    if (
      !opts(r).some((o) => o.value === card) &&
      opts(r).some((o) => o.value.startsWith('action-improvement-'))
    )
      r = choose(s, r, (o) => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    let r = minorMenu(s, card)
    if (!r.state.players[0]!.minorPlayed.includes(card))
      r = choose(s, r, (o) => o.value === card)
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.promptKey === 'prompt.selectPayment'
    )
      r = choose(s, r, (o) => o.value !== 'cancel')
    return r
  }
  function deny(s: GameSession, card: string) {
    const r = minorMenu(s, card)
    assert.ok(
      opts(r).some((o) => o.value === WAGE && !('disabled' in o && o.disabled)),
      JSON.stringify(r.interaction),
    )
    assert.equal(
      opts(r).some((o) => o.value === card && !('disabled' in o && o.disabled)),
      false,
    )
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    assert.equal(
      s.getState().state.players[0]!.minorPlayed.includes(card),
      false,
    )
    const food = r.state.players[0]!.resources.food
    const retry = ok(s.resolveChoice(0, WAGE))
    resource(retry, 'food', food + 2)
    assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false)
  }
  function gainCount(r: SessionResponse, card: string) {
    return r.state.log.filter(
      (e) => e.key === 'log.cardEffectGain' && e.params?.cardId === card,
    ).length
  }
  function resource(
    r: SessionResponse,
    key: 'food' | 'wood' | 'begging',
    value: number,
    actor = 0,
  ) {
    assert.equal(r.state.players[actor]!.resources[key], value)
  }
  function finishHarvest(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
      const request = r.interaction.request
      if (request.kind === 'feed')
        r = ok(
          s.resolveChoice(r.interaction.playerIndex, 'confirm', {
            selections: [],
          }),
        )
      else if (request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm'))
      else if (request.kind === 'confirm-next-player') r = confirmNext(s, r)
      else if (
        request.kind === 'choice' &&
        opts(r).some((o) => o.value === '__skip__')
      )
        r = ok(s.resolveChoice(r.interaction.playerIndex, '__skip__'))
      else assert.fail(JSON.stringify(r.interaction))
    }
    return r
  }
  function save(name: string, r: SessionResponse) {
    sessionEvidence.record(name, r)
  }
  function fields(...crops: Array<'grain' | 'vegetable' | null>): Field[] {
    return crops.map((crop, i) => ({
      row: i,
      col: 2,
      stacks: crop ? [{ kind: crop, remaining: crop === 'grain' ? 3 : 2 }] : [],
    }))
  }
  function sowStart(s: GameSession, actor = 0, space = 'grain-utilization') {
    let r = turn(s, actor, space)
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice'
    )
      r = choose(s, r, (o) => o.value === 'sow' || o.value !== '__skip__')
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'farm-select',
      JSON.stringify(r.interaction),
    )
    save('sow-pending', r)
    return r
  }
  function sow(
    s: GameSession,
    crops: Array<{
      row: number
      col: number
      crop: 'grain' | 'vegetable' | 'wood'
    }>,
  ) {
    sowStart(s)
    return ok(s.commitSelectionChoice(0, { crops }))
  }
  function afterSowHarvest(s: GameSession) {
    turn(s, 1, 'clay-pit')
    turn(s, 0, 'forest')
    return finishHarvest(s, confirmNext(s, turn(s, 1, 'reed-bank')))
  }
  function printedVp(r: SessionResponse, card: string) {
    assert.ok(r.scores)
    return (
      r.scores[0]!.categories.find((c) => c.key === 'cards')
        ?.entries.filter((e) => e.type === 'card' && e.cardId === card)
        .reduce((n, e) => n + e.score, 0) ?? 0
    )
  }
  function pellets(config: Parameters<typeof setup>[0] = {}) {
    return setup({
      round: 14,
      fields: fields(null, null, null),
      resources: { food: 4 },
      ...config,
    })
  }
  it('two distinct fields reject forged free purchase before three fields control', () => {
    deny(
      pellets({
        played: false,
        fields: fields(null, null),
        resources: { food: 0 },
      }),
      CARD_ID,
    )
    const r = buy(pellets({ played: false, resources: { food: 0 } }), CARD_ID)
    assert.ok(r.state.players[0]!.minorPlayed.includes(CARD_ID))
    assert.equal(r.state.players[0]!.resources.grain, 0)
    resource(r, 'food', 0)
    assert.equal(printedVp(r, CARD_ID), 0)
  })
  it('zero stock unconditional Sow grants one grain before actual legal planting', () => {
    const s = pellets()
    const pending = sowStart(s)
    assert.equal(pending.state.players[0]!.resources.grain, 1)
    assert.equal(gainCount(pending, CARD_ID), 1)
    const r = ok(
      s.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 2, crop: 'grain' }],
      }),
    )
    save('A065-N2-sown', r)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [
      { kind: 'grain', remaining: 3 },
    ])
    assert.equal(gainCount(r, CARD_ID), 1)
  })
  it('illegal target crop and overstock selection reject before one field retry', () => {
    const s = pellets()
    const pending = sowStart(s)
    assert.equal(pending.state.players[0]!.resources.grain, 1)
    for (const crops of [
      [{ row: 0, col: 0, crop: 'grain' }],
      [{ row: 99, col: 99, crop: 'grain' }],
      [{ row: 0, col: 2, crop: 'vegetable' }],
      [
        { row: 0, col: 2, crop: 'grain' },
        { row: 1, col: 2, crop: 'grain' },
      ],
    ] satisfies Array<
      Array<{
        row: number
        col: number
        crop: 'grain' | 'vegetable'
      }>
    >)
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops }))
    assertRejectedUnchanged(s, () =>
      s.commitSelectionChoice(1, {
        crops: [{ row: 0, col: 2, crop: 'grain' }],
      }),
    )
    const r = ok(
      s.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 2, crop: 'grain' }],
      }),
    )
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(gainCount(r, CARD_ID), 1)
    assert.equal(
      r.state.players[0]!.fields.filter((f) => f.stacks.length).length,
      1,
    )
  })
  it('consumed Sow cannot repeat grant and a real later Sow grants once again', () => {
    const s = pellets({ round: 10 })
    sow(s, [{ row: 0, col: 2, crop: 'grain' }])
    assertRejectedUnchanged(s, () =>
      s.commitSelectionChoice(0, {
        crops: [{ row: 1, col: 2, crop: 'grain' }],
      }),
    )
    const next = afterSowHarvest(s)
    assert.equal(next.state.round, 11)
    assert.equal(gainCount(next, CARD_ID), 1)
    const r = sow(s, [{ row: 1, col: 2, crop: 'grain' }])
    save('A065-N4-second', r)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(gainCount(r, CARD_ID), 2)
    assert.equal(
      r.state.players[0]!.fields.filter((f) => f.stacks.length).length,
      2,
    )
  })
  it('real Chief Forester one field Sow receives no Seed Pellets grain', () => {
    const s = pellets({
      occupations: ['A115_ChiefForester'],
      resources: { grain: 1, food: 4 },
    })
    const pending = sowStart(s, 0, 'forest')
    save('A065-N5-limited-pending', pending)
    const r = ok(
      s.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 2, crop: 'grain' }],
      }),
    )
    save('A065-N5-limited', r)
    assert.deepEqual(
      {
        grain: r.state.players[0]!.resources.grain,
        wood: r.state.players[0]!.resources.wood,
        plantedFields: r.state.players[0]!.fields.filter((f) => f.stacks.length)
          .length,
        seedPelletsGrainGained: gainCount(r, CARD_ID),
      },
      { grain: 0, wood: 3, plantedFields: 1, seedPelletsGrainGained: 0 },
    )
  })
  it('in hand absent card and actual opponent Sow do not reward holder', () => {
    for (const config of [{ played: false }, { noCard: true }]) {
      const s = pellets({ ...config, resources: { grain: 1, food: 4 } })
      const r = sow(s, [{ row: 0, col: 2, crop: 'grain' }])
      assert.equal(r.state.players[0]!.resources.grain, 0)
      assert.equal(gainCount(r, CARD_ID), 0)
    }
    const s = pellets({
      opponentFields: fields(null),
      opponent: { grain: 1, food: 4 },
    })
    turn(s, 0, 'forest')
    sowStart(s, 1)
    const r = ok(
      s.commitSelectionChoice(1, {
        crops: [{ row: 0, col: 2, crop: 'grain' }],
      }),
    )
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(r.state.players[1]!.resources.grain, 0)
    assert.equal(gainCount(r, CARD_ID), 0)
  })
  it('Wood Field two planting slots count as one distinct prerequisite field', () => {
    for (const count of [1, 2]) {
      const s = pellets({
        played: false,
        fields: fields(...Array<null>(count).fill(null)),
        extra: ['D075_WoodField'],
        occupations: ['A124_Knapper'],
        resources: { wood: 2, food: 4 },
      })
      sow(s, [
        { row: -1, col: 4075, crop: 'wood' },
        { row: -1, col: 4076, crop: 'wood' },
      ])
      turn(s, 1, 'clay-pit')
      if (count === 1) deny(s, CARD_ID)
      else {
        const r = buy(s, CARD_ID)
        assert.ok(r.state.players[0]!.minorPlayed.includes(CARD_ID))
        assert.equal(r.state.players[0]!.resources.grain, 0)
        resource(r, 'wood', 0)
        resource(r, 'food', 4)
      }
    }
  })
  it('actual Sow undo restores before grant and one replay grain event', () => {
    const s = pellets()
    const before = undoRuleSnapshot(s.getState())
    sow(s, [{ row: 0, col: 2, crop: 'grain' }])
    assertUndoRestored(before, s.undoAction())
    const r = sow(s, [{ row: 0, col: 2, crop: 'grain' }])
    save('A065-N8-replayed', r)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(gainCount(r, CARD_ID), 1)
    assert.equal(
      r.state.players[0]!.fields.filter((f) => f.stacks.length).length,
      1,
    )
  })
  it('no empty field enters the designed Sow block and undo restores before a legal action', () => {
    const s = pellets({ fields: fields('grain', 'grain', 'grain') })
    const initial = s.getState()
    assert.equal(initial.state.players[0]!.fields.length, 3)
    assert.ok(
      initial.state.players[0]!.fields.every((f) => f.stacks.length > 0),
    )
    assert.deepEqual(initial.state.players[0]!.minorPlayed, [CARD_ID])
    assert.deepEqual(initial.state.players[0]!.occupationPlayed, [])
    assert.deepEqual(initial.state.players[0]!.improvements, [])
    assert.equal(initial.state.players[0]!.resources.grain, 0)
    const before = undoRuleSnapshot(initial)
    const r = s.takeAction(0, 'grain-utilization')
    save('A065-N6b-no-target', r)
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'engine-blocked'
    )
      assert.deepEqual(r.interaction.allowedCommands, [
        'undoStep',
        'undoAction',
      ])
    const actual = {
      accepted: r.ok,
      grain: r.state.players[0]!.resources.grain,
      seedPelletsGrainGained: gainCount(r, CARD_ID),
      blockedSow:
        r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'engine-blocked' &&
        r.interaction.request.actionId === 'sow',
    }
    if (r.ok) assertUndoRestored(before, s.undoAction())
    const retry = turn(s, 0, 'day-laborer')
    resource(retry, 'food', 6)
    assert.equal(gainCount(retry, CARD_ID), 0)
    assert.deepEqual(actual, {
      accepted: true,
      grain: 1,
      seedPelletsGrainGained: 1,
      blockedSow: true,
    })
  })
})
