import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setNewbornCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import type { Field } from '../../shared/contract/types'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  resolveNonSkipChoice,
  resolveSkipChoice,
  resolveTriggerIfPresent,
} from './_helpers/trigger-select'

import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/E/E096_Elder'
import '../../shared/cards/E/E108_BlackberryFarmer'
import '../../shared/cards/E/E112_GrainThief'
import '../../shared/cards/E/E159_OldMiser'

type CardId =
  | 'E096_Elder'
  | 'E108_BlackberryFarmer'
  | 'E112_GrainThief'
  | 'E159_OldMiser'

const setupOccupation = (cardId: CardId, {
  playerCount = 2,
  played = false,
  round = 5,
}: {
  playerCount?: number
  played?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(108, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = played ? ['__test_placeholder__'] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    wood: 0,
    food: 0,
    grain: 0,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: CardId) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
    if (option) response = session.resolveChoice(0, option.value)
  }
  return response
}

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const blackberryFences = (round: number) => {
  const session = setupOccupation('E108_BlackberryFarmer', { played: true, round })
  session.state.players[0]!.resources.wood = 4
  session.loadState(session.state)
  session.takeAction(0, 'fencing')
  const response = session.commitSelectionChoice(0, { edges: edgesForTile(1, 2), extraWood: 0 })
  expect(response.ok, response.error).toBe(true)
  return { session, response }
}

describe('E108 Blackberry Farmer parity', () => {
  it('E108 S1: playing Blackberry Farmer through Lessons leaves it in play', () => {
    const response = playOccupation(setupOccupation('E108_BlackberryFarmer'), 'E108_BlackberryFarmer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E108_BlackberryFarmer')
  })

  it('E108 S2: four fences in round five schedule food on rounds six through nine', () => {
    const { response } = blackberryFences(5)

    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'E108_BlackberryFarmer'))
      .toMatchObject([
        { round: 6, resources: { food: 1 } },
        { round: 7, resources: { food: 1 } },
        { round: 8, resources: { food: 1 } },
        { round: 9, resources: { food: 1 } },
      ])
  })

  it('E108 S3: four fences in round thirteen schedule food only on the final round', () => {
    const { response } = blackberryFences(13)

    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'E108_BlackberryFarmer'))
      .toMatchObject([{ round: 14, resources: { food: 1 } }])
  })

  it('E108 S4: scheduled food is received at the start of its round', () => {
    const { session, response } = blackberryFences(5)
    const state = response.state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const received = autoAdvanceRoundEnd(session)

    expect(received.state.players[0]!.resources.food).toBe(1)
    expect(received.state.futureMeeples.filter((entry) => entry.cardId === 'E108_BlackberryFarmer'))
      .toHaveLength(3)
  })
})

const grainField = (row: number, col: number, remaining: number): Field => ({
  row,
  col,
  stacks: [{ kind: 'grain', remaining }],
})

const setupGrainThief = () => {
  const session = setupOccupation('E112_GrainThief', { played: true, round: 4 })
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
  })
  state.players[0]!.fields = [grainField(0, 0, 2), grainField(0, 1, 1)]
  session.loadState(state)
  return session
}

const openGrainThiefSelection = (session: GameSession) => {
  let response = session.performRoundEnd()
  response = resolveTriggerIfPresent(session, response, 'E112_GrainThief')
  response = resolveNonSkipChoice(session, response)
  expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
    .toBe('E112_GrainThief')
  return response
}

describe('E112 Grain Thief parity', () => {
  it('E112 S1: playing Grain Thief through Lessons leaves it in play', () => {
    const response = playOccupation(setupOccupation('E112_GrainThief'), 'E112_GrainThief')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E112_GrainThief')
  })

  it('E112 S2: selecting one grain field preserves it and gains one replacement grain', () => {
    const session = setupGrainThief()
    openGrainThiefSelection(session)

    const response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }] })

    expect(response.state.players[0]!.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)).toEqual([2, 0])
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('E112 S3: selecting both grain fields preserves both and gains two replacement grain', () => {
    const session = setupGrainThief()
    openGrainThiefSelection(session)

    const response = session.commitSelectionChoice(0, {
      positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    })

    expect(response.state.players[0]!.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)).toEqual([2, 1])
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('E112 S4: declining Grain Thief performs the normal reap', () => {
    const session = setupGrainThief()
    let response = session.performRoundEnd()
    response = resolveTriggerIfPresent(session, response, 'E112_GrainThief')
    response = resolveSkipChoice(session, response)

    expect(response.state.players[0]!.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)).toEqual([1, 0])
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('E112 S5: a grain-bearing card field alone offers Grain Thief', () => {
    const session = setupOccupation('E112_GrainThief', { played: true, round: 4 })
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    })
    const player = state.players[0]!
    player.minorPlayed.push('E070_CropRotationField')
    writeCardExtraData(player, 'E070_CropRotationField', 'cardFieldStacks', [
      { crop: 'grain', remaining: 2 },
    ])
    session.loadState(state)

    const selection = openGrainThiefSelection(session)
    expect(selection.interaction.stateId).toBe('wait')
    if (selection.interaction.stateId !== 'wait') throw new Error('expected Grain Thief selection')
    const position = selection.interaction.request.selection?.selectablePositions[0]
    expect(position).toMatchObject({ sourceCard: 'E070_CropRotationField' })

    const response = session.commitSelectionChoice(0, { positions: [position!] })

    expect(readCardExtraData<{ crop: string; remaining: number }[]>(
      response.state.players[0]!,
      'E070_CropRotationField',
      'cardFieldStacks',
    )).toEqual([{ crop: 'grain', remaining: 2 }])
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})

const startElderRound = (round: number) => {
  if (round === 1) {
    const session = new GameSession(12, undefined, {
      playerCount: 2,
      deckIds: ['E'],
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    let response = session.getState()
    for (let step = 0; step < 64 && response.state.phase === 'draft' && response.state.draft; step++) {
      const draft = response.state.draft
      const seatId = draft.seatOrder.find((id) => {
        const pick = draft.pendingPicks[id]
        return !pick || (pick.occ === null && pick.minor === null)
      })
      if (!seatId) throw new Error('expected an unsubmitted draft seat')
      const pool = draft.pools[seatId]!
      response = session.submitDraftPick(seatId, {
        occCardId: pool.occ.includes('E096_Elder') ? 'E096_Elder' : pool.occ[0],
        minorCardId: pool.minor[0],
      })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.phase).toBe('playing')
    return { session, response }
  }
  const session = setupOccupation('E096_Elder', { round: round - 1 })
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  const response = session.performRoundEnd()
  return { session, response }
}

describe('E096 Elder parity', () => {
  it('E096 S1: at the start of round one Elder can be played free without placing a person', () => {
    const { session, response: offered } = startElderRound(1)
    const forestWoodBefore = offered.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood
    expect(forestWoodBefore).toBe(3)
    let response = resolveNonSkipChoice(session, offered)
    if (response.interaction.stateId === 'wait') {
      const option = response.interaction.request.options?.find((candidate) => candidate.value === 'E096_Elder')
      if (option) response = session.resolveChoice(0, option.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E096_Elder')
    expect(response.state.actionSpaces.every((space) => space.takenBy.length === 0)).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood)
      .toBe(forestWoodBefore)
  })

  it('E096 S2: declining the round-one Elder offer leaves the card in hand', () => {
    const { session, response } = startElderRound(1)

    const declined = resolveSkipChoice(session, response)

    expect(declined.state.players[0]!.occupationHand).toContain('E096_Elder')
  })

  it('E096 S3: Elder offers no free play after round one', () => {
    const { response } = startElderRound(2)

    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.occupationHand).toContain('E096_Elder')
  })

  it('E096 S4: Elder can still be played normally through Lessons after round one', () => {
    const response = playOccupation(setupOccupation('E096_Elder', { round: 2 }), 'E096_Elder')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E096_Elder')
  })
})

const oldMiserHarvest = (newborn: boolean) => {
  const session = setupOccupation('E159_OldMiser', { playerCount: 4, played: true, round: 4 })
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 10
  })
  const player = state.players[0]!
  setActiveWorkerCount(player, newborn ? 3 : 2)
  setNewbornCount(player, newborn ? 1 : 0)
  markAllWorkersUsed(state, player)
  player.resources.food = 2
  session.loadState(state)
  return autoAdvanceRoundEnd(session)
}

describe('E159 Old Miser parity', () => {
  it('E159 S1: playing Old Miser through Lessons in a four-player session leaves it in play', () => {
    const response = playOccupation(
      setupOccupation('E159_OldMiser', { playerCount: 4 }),
      'E159_OldMiser',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E159_OldMiser')
  })

  it('E159 S2: two adults need only two food during harvest', () => {
    const response = oldMiserHarvest(false)

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
  })

  it('E159 S3: two adults and one newborn still need only two food during harvest', () => {
    const response = oldMiserHarvest(true)

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
  })

  it('E159 S4: Old Miser makes two people worth four points during scoring', () => {
    const session = setupOccupation('E159_OldMiser', { playerCount: 4, played: true })
    const scores = session.getState().scores[0]!
    const farmers = scores.categories.find((category) => category.key === 'farmers')?.total ?? 0
    const cardBonus = scores.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0

    expect(farmers + cardBonus).toBe(4)
  })
})
