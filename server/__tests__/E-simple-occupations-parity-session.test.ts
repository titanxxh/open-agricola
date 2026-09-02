import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/E/E099_UncaringParents'
import '../../shared/cards/E/E117_PipeSmoker'
import '../../shared/cards/E/E143_Hewer'
import '../../shared/cards/E/E158_StoneCustodian'

type CardId =
  | 'E099_UncaringParents'
  | 'E117_PipeSmoker'
  | 'E143_Hewer'
  | 'E158_StoneCustodian'

const setupOccupation = (cardId: CardId, {
  playerCount = 2,
  played = false,
  round = 5,
}: {
  playerCount?: number
  played?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(117, undefined, { playerCount })
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
    stone: 0,
    food: 0,
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

const prepareRoundEnd = (session: GameSession, round: number) => {
  const state = session.getState().state
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 10
  })
  session.loadState(state)
}

const pipeSmokerHarvest = ({ ordinary = false, cardField = false } = {}) => {
  const session = setupOccupation('E117_PipeSmoker', { played: true, round: 4 })
  const player = session.state.players[0]!
  if (ordinary) {
    player.fields = [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
  }
  if (cardField) {
    player.minorPlayed.push('E070_CropRotationField')
    player.cardStates = {
      ...player.cardStates,
      E070_CropRotationField: {
        extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
      },
    }
  }
  prepareRoundEnd(session, 4)
  return autoAdvanceRoundEnd(session)
}

describe('E117 Pipe Smoker parity', () => {
  it('E117 S1: playing Pipe Smoker through Lessons leaves it in play', () => {
    const response = playOccupation(setupOccupation('E117_PipeSmoker'), 'E117_PipeSmoker')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E117_PipeSmoker')
  })

  it('E117 S2: an ordinary grain field grants two wood at the start of harvest', () => {
    expect(pipeSmokerHarvest({ ordinary: true }).state.players[0]!.resources.wood).toBe(2)
  })

  it('E117 S3: without a grain field Pipe Smoker grants no wood', () => {
    expect(pipeSmokerHarvest().state.players[0]!.resources.wood).toBe(0)
  })

  it('E117 S4: OA ignores a grain field card when checking Pipe Smoker', () => {
    expect(pipeSmokerHarvest({ cardField: true }).state.players[0]!.resources.wood).toBe(0)
  })
})

const hewerRound = ({ round = 3, occupied }: { round?: number; occupied?: string } = {}) => {
  const session = setupOccupation('E143_Hewer', { playerCount: 3, played: true, round })
  if (occupied) {
    const space = session.state.actionSpaces.find((candidate) => candidate.id === occupied)!
    const opponent = session.state.players[1]!
    space.takenBy = [{ playerId: opponent.id, workerId: opponent.workers[0]!.id }]
  }
  prepareRoundEnd(session, round)
  return autoAdvanceRoundEnd(session)
}

describe('E143 Hewer parity', () => {
  it('E143 S1: playing Hewer in a three-player session leaves it in play', () => {
    const response = playOccupation(
      setupOccupation('E143_Hewer', { playerCount: 3 }),
      'E143_Hewer',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E143_Hewer')
  })

  it('E143 S2: from round three two empty clay spaces grant one stone and one food', () => {
    expect(hewerRound().state.players[0]!.resources).toMatchObject({ stone: 1, food: 11 })
  })

  it('E143 S3: an occupied clay accumulation space prevents Hewer', () => {
    expect(hewerRound({ occupied: 'clay-pit' }).state.players[0]!.resources.stone).toBe(0)
    expect(hewerRound({ occupied: 'hollow' }).state.players[0]!.resources.stone).toBe(0)
  })

  it('E143 S4: before round three Hewer grants nothing', () => {
    expect(hewerRound({ round: 2 }).state.players[0]!.resources).toMatchObject({ stone: 0, food: 10 })
  })
})

const uncaringParentsHarvest = (houseType: 'wood' | 'clay' | 'stone', startingBonus = 0) => {
  const session = setupOccupation('E099_UncaringParents', { played: true, round: 4 })
  const player = session.state.players[0]!
  player.houseType = houseType
  player.cardStates = {
    ...player.cardStates,
    E099_UncaringParents: { counters: { bonusVp: startingBonus } },
  }
  prepareRoundEnd(session, 4)
  return autoAdvanceRoundEnd(session)
}

describe('E099 Uncaring Parents parity', () => {
  it('E099 S1: playing Uncaring Parents through Lessons leaves it in play', () => {
    const response = playOccupation(
      setupOccupation('E099_UncaringParents'),
      'E099_UncaringParents',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E099_UncaringParents')
  })

  it('E099 S2: a stone house gains one bonus point at the end of harvest', () => {
    const response = uncaringParentsHarvest('stone')

    expect(response.state.players[0]!.cardStates?.E099_UncaringParents?.counters?.bonusVp).toBe(1)
  })

  it('E099 S3: a non-stone house gains no bonus point at the end of harvest', () => {
    const response = uncaringParentsHarvest('clay')

    expect(response.state.players[0]!.cardStates?.E099_UncaringParents?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('E099 S4: successive stone-house harvests accumulate one bonus point each', () => {
    const response = uncaringParentsHarvest('stone', 1)

    expect(response.state.players[0]!.cardStates?.E099_UncaringParents?.counters?.bonusVp).toBe(2)
  })
})

const stoneCustodianRound = (east: number, west: number) => {
  const session = setupOccupation('E158_StoneCustodian', { playerCount: 4, played: true })
  session.state.actionSpaces.find((space) => space.id === 'eastern-quarry')!.resources.stone = east
  session.state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = west
  prepareRoundEnd(session, 5)
  return autoAdvanceRoundEnd(session)
}

describe('E158 Stone Custodian parity', () => {
  it('E158 S1: playing Stone Custodian in a four-player session leaves it in play', () => {
    const response = playOccupation(
      setupOccupation('E158_StoneCustodian', { playerCount: 4 }),
      'E158_StoneCustodian',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('E158_StoneCustodian')
  })

  it.each([
    ['S2', 0, 0, 0],
    ['S3', 2, 0, 1],
    ['S4', 1, 3, 2],
  ])('E158 %s: stocked eastern and western quarries grant %i plus %i presence food', (_scenario, east, west, food) => {
    expect(stoneCustodianRound(east, west).state.players[0]!.resources.food).toBe(10 + food)
  })
})
