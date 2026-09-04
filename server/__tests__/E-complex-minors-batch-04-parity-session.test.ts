import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/E/E021_SheepRug'
import '../../shared/cards/E/E023_Apiary'
import '../../shared/cards/E/E027_PiggyBank'
import '../../shared/cards/E/E028_Bookmark'
import '../../shared/cards/E/E031_Upholstery'
import '../../shared/cards/E/E077_Mattock'
import '../../shared/cards/E/E082_Profiteering'
import '../../shared/cards/E/E083_ShepherdsWhistle'

type CardId =
  | 'E021_SheepRug' | 'E023_Apiary' | 'E027_PiggyBank' | 'E028_Bookmark'
  | 'E031_Upholstery' | 'E077_Mattock' | 'E082_Profiteering' | 'E083_ShepherdsWhistle'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = [
  'A116_WoodCutter', 'B121_Geologist', 'C123_Freemason', 'D152_Patron',
]

const setupMinor = (cardId: CardId, {
  played = false, round = 5, resources = {}, occupations = 0, workers = 2,
}: {
  played?: boolean
  round?: number
  resources?: Partial<Resource>
  occupations?: number
  workers?: number
} = {}) => {
  const session = new GameSession(4057, undefined, { playerCount: 2 })
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
  player.minorHand = played ? [FILLER] : [cardId]
  player.minorPlayed = played ? [cardId] : []
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const enterImprovement = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value.startsWith('action-improvement-'))
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: string) => {
  const response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(0, option.value) : response
}

const cardIsOffered = (session: GameSession, cardId: string) => {
  const response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false
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

const prepareRoundEnd = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = Math.max(player.resources.food, 20)
  })
  session.loadState(state)
}

const occupy = (state: GameState, actionId: string, playerIndex: number, workerIds: string[]) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === actionId)
  if (!space) throw new Error(`${actionId} missing`)
  const player = state.players[playerIndex]!
  space.takenBy = workerIds.map((workerId) => ({ playerId: player.id, workerId }))
}

describe('E023 Apiary parity', () => {
  it('E023 S1: four occupations allow play', () => {
    expect(playMinor(setupMinor('E023_Apiary', { occupations: 4 }), 'E023_Apiary').state.players[0]!.minorPlayed)
      .toContain('E023_Apiary')
  })

  it('E023 S2: fewer than four occupations keeps it unavailable', () => {
    expect(cardIsOffered(setupMinor('E023_Apiary', { occupations: 3 }), 'E023_Apiary')).toBe(false)
  })

  const roundEnd = () => {
    const session = setupMinor('E023_Apiary', { played: true, round: 3, resources: { grain: 1, food: 20 } })
    session.state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
    prepareRoundEnd(session)
    return session
  }

  it('E023 S3: at work phase end may sow exactly one crop on one field', () => {
    const session = roundEnd()
    let response = chooseNonSkip(session, session.performRoundEnd(), 'E023_Apiary')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const field = response.interaction.request.farm?.selectableFields[0]?.tile
    expect(field).toBeDefined()
    response = session.commitSelectionChoice(0, { crops: [{ ...field!, crop: 'grain' }] })
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('E023 S4: Apiary sow may be declined', () => {
    const session = roundEnd()
    const response = chooseSkip(session, session.performRoundEnd(), 'E023_Apiary')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})

describe('E021 Sheep Rug parity', () => {
  const withSheep = (count: number) => {
    const session = setupMinor('E021_SheepRug', { resources: { sheep: count } })
    const player = session.state.players[0]!
    player.pastures = count > 0 ? [{
      id: 'sheep-pasture', size: 2, tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
      stables: 0, animalType: 'sheep', animalCount: count,
    }] : []
    session.loadState(session.state)
    return session
  }

  it('E021 S1: four sheep on the farm allow Sheep Rug to be played for one sheep', () => {
    const session = withSheep(4)
    expect(cardIsOffered(session, 'E021_SheepRug')).toBe(true)
    const response = playMinor(withSheep(4), 'E021_SheepRug')
    expect(response.state.players[0]!.minorPlayed).toContain('E021_SheepRug')
    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(3)
  })

  it('E021 S2: fewer than four sheep keeps it unavailable', () => {
    expect(cardIsOffered(withSheep(3), 'E021_SheepRug')).toBe(false)
  })

  const occupiedWish = (count: number) => {
    const session = setupMinor('E021_SheepRug', { played: true, round: 14 })
    const player = session.state.players[0]!
    player.rooms = 3
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
    setActiveWorkerCount(session.state.players[1]!, Math.max(2, count))
    occupy(session.state, 'wish-children', 1, session.state.players[1]!.workers.slice(0, count).map((worker) => worker.id))
    session.loadState(session.state)
    return session
  }

  it('E021 S3: one opposing worker on Wish for Children can be shared', () => {
    const session = occupiedWish(1)
    const before = familySize(session.state.players[0]!)
    expect(session.getState().actionAvailability?.['wish-children']).toBe(true)
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
  })

  it('E021 S4: OA still permits sharing when two opposing workers occupy the space', () => {
    const session = occupiedWish(2)
    expect(session.getState().actionAvailability?.['wish-children']).toBe(true)
    expect(session.takeAction(0, 'wish-children').ok).toBe(true)
  })
})

describe('E027 Piggy Bank parity', () => {
  const roundEnd = () => {
    const session = setupMinor('E027_PiggyBank', { played: true, round: 3, resources: { food: 21 } })
    prepareRoundEnd(session)
    session.state.players[0]!.resources.food = 21
    session.loadState(session.state)
    return session
  }

  it('E027 S1: at work phase end may store one food irretrievably', () => {
    const session = roundEnd()
    const response = chooseNonSkip(session, session.performRoundEnd(), 'E027_PiggyBank')
    expect(response.state.players[0]!.resources.food).toBe(20)
    expect(response.state.players[0]!.cardStates.E027_PiggyBank?.counters?.food).toBe(1)
  })

  it('E027 S2: storing food may be declined', () => {
    const session = roundEnd()
    const response = chooseSkip(session, session.performRoundEnd(), 'E027_PiggyBank')
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(response.state.players[0]!.cardStates.E027_PiggyBank?.counters?.food ?? 0).toBe(0)
  })

  const stored = (food: number) => {
    const session = setupMinor('E027_PiggyBank', { played: true })
    session.state.players[0]!.cardStates.E027_PiggyBank = { counters: { food } }
    session.state.availableMajorImprovements = ['Major_Joinery']
    session.loadState(session.state)
    return session
  }

  it('E027 S3: six stored food may fund a free major improvement', () => {
    const session = stored(6)
    const action = session.getState().interaction.anytimeActions.find((candidate) => candidate.id === 'E27-piggy-bank-anytime')
    expect(action).toBeDefined()
    const response = session.takeAnytimeAction(0, action!.id)
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.cardStates.E027_PiggyBank?.counters?.food).toBe(0)
  })

  it('E027 S4: five stored food does not expose the free-major action', () => {
    expect(stored(5).getState().interaction.anytimeActions.map((action) => action.id))
      .not.toContain('E27-piggy-bank-anytime')
  })
})

describe('E028 Bookmark parity', () => {
  it('E028 S1: costs one wood and marks the third following round', () => {
    const response = playMinor(setupMinor('E028_Bookmark', { round: 2, resources: { wood: 1 } }), 'E028_Bookmark')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(readCardExtraData(response.state.players[0]!, 'E028_Bookmark', 'triggerRound')).toBe(5)
  })

  it('E028 S2: Bookmark preserves its out-of-range target without triggering early', () => {
    const response = playMinor(setupMinor('E028_Bookmark', { round: 13, resources: { wood: 1 } }), 'E028_Bookmark')
    expect(readCardExtraData(response.state.players[0]!, 'E028_Bookmark', 'triggerRound')).toBe(16)
  })
})

describe('E083 Shepherds Whistle parity', () => {
  it('E083 S1: costs one wood', () => {
    const response = playMinor(setupMinor('E083_ShepherdsWhistle', { resources: { wood: 1 } }), 'E083_ShepherdsWhistle')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  const harvest = (stable: boolean) => {
    const session = setupMinor('E083_ShepherdsWhistle', { played: true, round: 4, resources: { food: 20 } })
    session.state.players[0]!.stableTiles = stable ? [{ row: 0, col: 1 }] : []
    prepareRoundEnd(session)
    return session.performRoundEnd()
  }

  it('E083 S2: an empty unfenced stable gains one sheep before breeding', () => {
    expect(harvest(true).state.players[0]!.resources.sheep).toBe(1)
  })

  it('E083 S3: no unfenced stable grants no sheep', () => {
    expect(harvest(false).state.players[0]!.resources.sheep).toBe(0)
  })
})

describe('E031 Upholstery parity', () => {
  const afterImprovement = (reedOnCard: number, reed = 1) => {
    const session = setupMinor('E031_Upholstery', { played: true, resources: { wood: 1, reed } })
    session.state.players[0]!.cardStates.E031_Upholstery = { counters: { reed: reedOnCard } }
    session.state.players[0]!.minorHand = ['B081_Handcart']
    session.loadState(session.state)
    return { session, response: playMinor(session, 'B081_Handcart') }
  }

  it('E031 S1: after another improvement may place one reed for one bonus point', () => {
    const { session, response: initial } = afterImprovement(0)
    const response = chooseNonSkip(session, initial, 'E031_Upholstery')
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(response.state.players[0]!.cardStates.E031_Upholstery?.counters).toMatchObject({ reed: 0, bonusVp: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'major-improvement')!.resources.reed).toBe(1)
  })

  it('E031 S2: the reward may be declined', () => {
    const { session, response: initial } = afterImprovement(0)
    const response = chooseSkip(session, initial, 'E031_Upholstery')
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(response.state.players[0]!.cardStates.E031_Upholstery?.counters?.reed ?? 0).toBe(0)
  })

  it('E031 S3: OA ignores the stored-reed room cap and offers another reward', () => {
    const { response } = afterImprovement(2)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).toBe('E031_Upholstery')
  })
})

describe('E082 Profiteering parity', () => {
  it('E082 S1: playing immediately gains one food', () => {
    expect(playMinor(setupMinor('E082_Profiteering'), 'E082_Profiteering').state.players[0]!.resources.food).toBe(1)
  })

  it('E082 S2: Day Laborer may exchange one building resource for another', () => {
    const session = setupMinor('E082_Profiteering', { played: true, resources: { wood: 1 } })
    let response = chooseNonSkip(session, session.takeAction(0, 'day-laborer'), 'E082_Profiteering')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const stone = response.interaction.request.options?.find((option) => option.effectPreview?.resourcesGained?.stone === 1)
    expect(stone).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, stone!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 1 })
  })

  it('E082 S3: the exchange may be declined', () => {
    const session = setupMinor('E082_Profiteering', { played: true, resources: { wood: 1 } })
    const response = chooseSkip(session, session.takeAction(0, 'day-laborer'), 'E082_Profiteering')
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('E082 S4: OA skips Profiteering without a building resource', () => {
    const response = setupMinor('E082_Profiteering', { played: true }).takeAction(0, 'day-laborer')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('E082_Profiteering')
  })
})

describe('E077 Mattock parity', () => {
  it('E077 S1: costs one wood', () => {
    expect(playMinor(setupMinor('E077_Mattock', { resources: { wood: 1 } }), 'E077_Mattock').state.players[0]!.resources.wood).toBe(0)
  })

  it('E077 S2: collecting reed from Reed Bank gains one additional clay', () => {
    const session = setupMinor('E077_Mattock', { played: true })
    session.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
    session.loadState(session.state)
    const response = session.takeAction(0, 'reed-bank')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, clay: 1 })
  })

  it('E077 S3: a non-reed-or-stone action grants no clay', () => {
    expect(setupMinor('E077_Mattock', { played: true }).takeAction(0, 'forest').state.players[0]!.resources.clay).toBe(0)
  })
})
