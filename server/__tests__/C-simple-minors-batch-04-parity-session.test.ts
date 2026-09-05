import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { FenceSegment, GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C001_Overhaul'
import '../../shared/cards/C/C007_BladeShears'
import '../../shared/cards/C/C040_CanvasSack'
import '../../shared/cards/C/C044_ChickenCoop'
import '../../shared/cards/C/C065_Granary'
import '../../shared/cards/C/C074_PrivateForest'
import '../../shared/cards/C/C077_ClaySupply'
import '../../shared/cards/C/C078_ReedHattedToad'

type CardId =
  | 'C001_Overhaul' | 'C007_BladeShears' | 'C040_CanvasSack' | 'C044_ChickenCoop'
  | 'C065_Granary' | 'C074_PrivateForest' | 'C077_ClaySupply' | 'C078_ReedHattedToad'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setupMinor = ({
  cardId, resources = {}, round = 5, occupations = 0,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  round?: number
  occupations?: number
}) => {
  const session = new GameSession(4048, undefined, { playerCount: 2 })
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
  player.minorHand = [cardId]
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

const playMinor = (session: GameSession, cardId: CardId) => {
  let response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false
}

const chooseBranch = (session: GameSession, response: SessionResponse, index: number) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected choice')
  const options = response.interaction.request.options?.filter((option) => option.value !== '__skip__') ?? []
  expect(options.length).toBeGreaterThan(index)
  return session.resolveChoice(response.interaction.playerIndex, options[index]!.value)
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((a, b) => a - b)

const ownFence = (playerId: string, edge: string): FenceSegment => ({
  edge, type: 'fence', source: { kind: 'own', ownerPlayerId: playerId },
})

describe('C074 Private Forest parity', () => {
  it('C074 S1: one occupation and two food schedule wood on all remaining even rounds', () => {
    const response = playMinor(setupMinor({
      cardId: 'C074_PrivateForest', resources: { food: 2 }, round: 5, occupations: 1,
    }), 'C074_PrivateForest')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(futureRounds(response.state, 'C074_PrivateForest', 'wood')).toEqual([6, 8, 10, 12, 14])
  })

  it('C074 S2: no occupation keeps Private Forest unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'C074_PrivateForest', resources: { food: 2 },
    }), 'C074_PrivateForest')).toBe(false)
  })
})

describe('C065 Granary parity', () => {
  for (const [scenario, payment] of [['S1', 'wood'], ['S2', 'clay']] as const) {
    it(`C065 ${scenario}: may pay three ${payment} and schedules grain on rounds eight, ten, and twelve`, () => {
      const response = playMinor(setupMinor({
        cardId: 'C065_Granary', resources: { [payment]: 3 }, round: 5,
      }), 'C065_Granary')
      expect(response.state.players[0]!.resources[payment]).toBe(0)
      expect(futureRounds(response.state, 'C065_Granary', 'grain')).toEqual([8, 10, 12])
    })
  }

  it('C065 S3: played after round ten schedules only round twelve grain', () => {
    const response = playMinor(setupMinor({
      cardId: 'C065_Granary', resources: { wood: 3 }, round: 10,
    }), 'C065_Granary')
    expect(futureRounds(response.state, 'C065_Granary', 'grain')).toEqual([12])
  })
})

describe('C001 Overhaul parity', () => {
  const overhaul = (fences: boolean, occupations = 2) => {
    const session = setupMinor({
      cardId: 'C001_Overhaul', resources: { wood: 1 }, occupations,
    })
    if (fences) {
      const player = session.state.players[0]!
      player.fenceSegments = ONE_CELL_FENCES.map((edge) => ownFence(player.id, edge))
      session.loadState(session.state)
    }
    return session
  }

  it('C001 S1: pays one wood, passes, razes four fences, and rebuilds them for free', () => {
    const session = overhaul(true)
    const response = playMinor(session, 'C001_Overhaul')
    expect(response.interaction.stateId).toBe('wait')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '').toBe('farm-select')
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    const rebuilt = session.commitSelectionChoice(0, { edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0 })
    expect(rebuilt.ok, rebuilt.error).toBe(true)
    expect(rebuilt.state.players[0]!.resources.wood).toBe(0)
    expect(rebuilt.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(rebuilt.state.players[1]!.minorHand).toContain('C001_Overhaul')
  })

  it('C001 S2: without built fences pays and passes without a rebuild', () => {
    const response = playMinor(overhaul(false), 'C001_Overhaul')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '').not.toBe('farm-select')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain('C001_Overhaul')
  })

  it('C001 S3: fewer than two occupations keeps Overhaul unavailable', () => {
    expect(cardIsOffered(overhaul(true, 1), 'C001_Overhaul')).toBe(false)
  })
})

describe('C007 Blade Shears parity', () => {
  const bladeShears = (sheep: number, pasture = true) => {
    const session = setupMinor({ cardId: 'C007_BladeShears', resources: { wood: 1, sheep } })
    const player = session.state.players[0]!
    player.pastures = pasture ? [{
      id: 'p1', size: 1, tiles: [{ row: 0, col: 1 }], stables: 1,
      animalType: sheep > 0 ? 'sheep' : null, animalCount: sheep,
    }] : []
    player.stableTiles = pasture ? [{ row: 0, col: 1 }] : []
    session.loadState(session.state)
    return session
  }

  it('C007 S1: may choose the fixed three food and passes', () => {
    const session = bladeShears(4)
    const response = chooseBranch(session, playMinor(session, 'C007_BladeShears'), 0)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[1]!.minorHand).toContain('C007_BladeShears')
  })

  it('C007 S2: may instead gain food equal to four sheep', () => {
    const session = bladeShears(4)
    const response = chooseBranch(session, playMinor(session, 'C007_BladeShears'), 1)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, sheep: 4 })
  })

  it('C007 S3: no pasture keeps Blade Shears unavailable', () => {
    expect(cardIsOffered(bladeShears(0, false), 'C007_BladeShears')).toBe(false)
  })
})

describe('C040 Canvas Sack parity', () => {
  it('C040 S1: pays grain once and gains one vegetable', () => {
    const session = setupMinor({ cardId: 'C040_CanvasSack', resources: { grain: 1 } })
    const response = playMinor(session, 'C040_CanvasSack')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 1 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '').toBe('confirm-next-player')
  })

  it('C040 S2: pays reed once and gains four wood', () => {
    const session = setupMinor({ cardId: 'C040_CanvasSack', resources: { reed: 1 } })
    const response = playMinor(session, 'C040_CanvasSack')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, wood: 4 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '').toBe('confirm-next-player')
  })

  it('C040 S3: having an occupation keeps Canvas Sack unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'C040_CanvasSack', resources: { grain: 1 }, occupations: 1,
    }), 'C040_CanvasSack')).toBe(false)
  })
})

describe('C077 Clay Supply parity', () => {
  it('C077 S1: pays one food and schedules clay for the next three rounds', () => {
    const response = playMinor(setupMinor({
      cardId: 'C077_ClaySupply', resources: { food: 1 }, round: 5,
    }), 'C077_ClaySupply')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(futureRounds(response.state, 'C077_ClaySupply', 'clay')).toEqual([6, 7, 8])
  })

  it('C077 S2: round thirteen schedules only round fourteen clay', () => {
    const response = playMinor(setupMinor({
      cardId: 'C077_ClaySupply', resources: { food: 1 }, round: 13,
    }), 'C077_ClaySupply')
    expect(futureRounds(response.state, 'C077_ClaySupply', 'clay')).toEqual([14])
  })
})

describe('C044 Chicken Coop parity', () => {
  it('C044 S1: pays two wood plus one reed and schedules eight food', () => {
    const response = playMinor(setupMinor({
      cardId: 'C044_ChickenCoop', resources: { wood: 2, reed: 1 }, round: 5,
    }), 'C044_ChickenCoop')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(futureRounds(response.state, 'C044_ChickenCoop', 'food')).toEqual([6, 7, 8, 9, 10, 11, 12, 13])
  })

  it('C044 S2: may pay two clay plus one reed', () => {
    const response = playMinor(setupMinor({
      cardId: 'C044_ChickenCoop', resources: { clay: 2, reed: 1 }, round: 5,
    }), 'C044_ChickenCoop')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it('C044 S3: lacking the additional reed keeps Chicken Coop unavailable', () => {
    const session = setupMinor({ cardId: 'C044_ChickenCoop', resources: { wood: 2 }, round: 5 })
    expect(cardIsOffered(session, 'C044_ChickenCoop')).toBe(false)
    const response = playMinor(setupMinor({ cardId: 'C044_ChickenCoop', resources: { wood: 2 }, round: 5 }), 'C044_ChickenCoop')
    expect(response.state.players[0]!.minorPlayed).not.toContain('C044_ChickenCoop')
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })
})

describe('C078 Reed-Hatted Toad parity', () => {
  it('C078 S1: schedules reed at offsets five, seven, nine, eleven, and thirteen', () => {
    const response = playMinor(setupMinor({
      cardId: 'C078_ReedHattedToad', resources: { food: 1 }, round: 1,
    }), 'C078_ReedHattedToad')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(futureRounds(response.state, 'C078_ReedHattedToad', 'reed')).toEqual([6, 8, 10, 12, 14])
  })

  it('C078 S2: round eight keeps only the round-thirteen reed', () => {
    const response = playMinor(setupMinor({
      cardId: 'C078_ReedHattedToad', resources: { food: 1 }, round: 8,
    }), 'C078_ReedHattedToad')
    expect(futureRounds(response.state, 'C078_ReedHattedToad', 'reed')).toEqual([13])
  })
})
