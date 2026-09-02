import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/D/D091_Plowman'
import '../../shared/cards/D/D102_SampleStableMaker'
import '../../shared/cards/D/D106_WhiskyDistiller'
import '../../shared/cards/D/D128_BuildingTycoon'

type CardId =
  | 'D091_Plowman'
  | 'D102_SampleStableMaker'
  | 'D106_WhiskyDistiller'
  | 'D128_BuildingTycoon'

const setupOccupation = (cardId: CardId, {
  playerCount = 2,
  played = false,
  round = 5,
}: {
  playerCount?: number
  played?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(91, undefined, { playerCount })
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
    clay: 0,
    reed: 0,
    stone: 0,
    grain: 0,
    vegetable: 0,
    food: 0,
  }
  state.futureMeeples = []
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
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
}

const acceptOption = (response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected optional action')
  const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return option!.value
}

describe('D091 Plowman parity', () => {
  it('D091 S1: playing Plowman in round 2 schedules fields for rounds 6, 9, and 12', () => {
    const response = playOccupation(setupOccupation('D091_Plowman', { round: 2 }), 'D091_Plowman')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D091_Plowman')
    expect(response.state.futureMeeples
      .filter((entry) => entry.cardId === 'D091_Plowman')
      .map((entry) => entry.round)).toEqual([6, 9, 12])
  })

  it('D091 S2: accepting a scheduled field pays one food and plows one field', () => {
    const session = setupOccupation('D091_Plowman', { round: 2 })
    let response = playOccupation(session, 'D091_Plowman')
    const state = response.state
    state.players[0]!.resources.food = 1
    session.loadState(state)
    prepareRoundEnd(session, 5)

    response = session.performRoundEnd()
    response = session.resolveChoice(0, acceptOption(response))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D091 S3: declining a scheduled field preserves food and the farm', () => {
    const session = setupOccupation('D091_Plowman', { round: 2 })
    const played = playOccupation(session, 'D091_Plowman')
    played.state.players[0]!.resources.food = 1
    session.loadState(played.state)
    prepareRoundEnd(session, 5)

    let response = session.performRoundEnd()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe('D091_Plowman')
    response = session.resolveChoice(0, '__skip__')

    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('D091 S4: playing Plowman in round 8 schedules only the valid round 12 field', () => {
    const response = playOccupation(setupOccupation('D091_Plowman', { round: 8 }), 'D091_Plowman')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.futureMeeples
      .filter((entry) => entry.cardId === 'D091_Plowman')
      .map((entry) => entry.round)).toEqual([12])
  })
})

describe('D106 Whisky Distiller parity', () => {
  it('D106 S1: playing Whisky Distiller through Lessons leaves it in play', () => {
    const response = playOccupation(setupOccupation('D106_WhiskyDistiller'), 'D106_WhiskyDistiller')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D106_WhiskyDistiller')
  })

  it('D106 S2: paying one grain schedules four food two rounds later without an immediate gain', () => {
    const session = setupOccupation('D106_WhiskyDistiller', { played: true })
    session.state.players[0]!.resources.grain = 1

    const response = session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 0 })
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'D106_WhiskyDistiller'))
      .toEqual([expect.objectContaining({ round: 7, resources: { food: 4 } })])
  })

  it('D106 S3: the scheduled food is received at the start of the target round', () => {
    const session = setupOccupation('D106_WhiskyDistiller', { played: true })
    session.state.players[0]!.resources.grain = 1
    session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')
    prepareRoundEnd(session, 6)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.resources.food).toBe(4)
    expect(response.state.futureMeeples.some((entry) => entry.cardId === 'D106_WhiskyDistiller')).toBe(false)
  })

  it('D106 S4: Whisky Distiller is unavailable without grain and after round 12', () => {
    const noGrain = setupOccupation('D106_WhiskyDistiller', { played: true })
    const tooLate = setupOccupation('D106_WhiskyDistiller', { played: true, round: 13 })
    tooLate.state.players[0]!.resources.grain = 1

    expect(noGrain.takeAnytimeAction(0, 'D106-whisky-distiller-anytime').ok).toBe(false)
    expect(tooLate.takeAnytimeAction(0, 'D106-whisky-distiller-anytime').ok).toBe(false)
  })
})

const sampleStableMakerRound = (stableCount: number) => {
  const session = setupOccupation('D102_SampleStableMaker', { played: true })
  session.state.players[0]!.stableTiles = [
    { row: 0, col: 1 },
    { row: 1, col: 1 },
  ].slice(0, stableCount)
  session.state.players[0]!.minorHand = ['A037_Bucksaw']
  prepareRoundEnd(session, 5)
  return session
}

describe('D102 Sample Stable Maker parity', () => {
  it('D102 S1: playing Sample Stable Maker through Lessons leaves it in play', () => {
    const response = playOccupation(setupOccupation('D102_SampleStableMaker'), 'D102_SampleStableMaker')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D102_SampleStableMaker')
  })

  it('D102 S2: returning one stable gains wood, grain, and food', () => {
    const session = sampleStableMakerRound(2)
    let response = session.performRoundEnd()
    response = session.resolveChoice(0, acceptOption(response))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected stable selection')
    const position = response.interaction.request.selection?.selectablePositions[0]
    expect(position).toBeDefined()
    response = session.commitSelectionChoice(0, { positions: [position!] })

    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 1, food: 1 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe('D102_SampleStableMaker')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.options : [])
      .toEqual(expect.arrayContaining([expect.objectContaining({
        sourceCard: 'D102_SampleStableMaker',
      })]))
  })

  it('D102 S3: declining the return preserves the stable and resources', () => {
    const session = sampleStableMakerRound(1)
    let response = session.performRoundEnd()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe('D102_SampleStableMaker')
    response = session.resolveChoice(0, '__skip__')

    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0, food: 0 })
  })

  it('D102 S4: without a built stable Sample Stable Maker offers no return action', () => {
    const response = sampleStableMakerRound(0).performRoundEnd()

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe('D102_SampleStableMaker')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0, food: 0 })
  })
})

const setupBuildingTycoon = () => {
  const session = new GameSession(128, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 6
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const actor = state.players[0]!
  actor.resources = { ...actor.resources, wood: 5, reed: 2, food: 0 }
  setWorkersAtHome(state, actor, 2)
  const owner = state.players[1]!
  owner.occupationPlayed = ['D128_BuildingTycoon']
  owner.resources = { ...owner.resources, wood: 5, reed: 2, food: 1 }
  session.loadState(state)
  return session
}

const chooseFarmExpansionMode = (session: GameSession, labelKey: string) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId !== 'wait') throw new Error('expected farm expansion choice')
  const option = response.interaction.request.options?.find((candidate) => candidate.labelKey === labelKey)
  expect(option).toBeDefined()
  response = session.resolveChoice(0, option!.value)
  if (response.interaction.stateId !== 'wait') throw new Error('expected farm selection')
  return response
}

const buildActorRoom = (session: GameSession) => {
  let response = chooseFarmExpansionMode(session, 'actions.construct.name')
  const room = response.interaction.stateId === 'wait'
    ? response.interaction.request.farm.selectableTiles[0]!
    : undefined
  response = session.commitSelectionChoice(0, { rooms: [room!] })
  expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
    .toBe('confirm-player-switch')
  return confirmPlayerSwitch(session)
}

describe('D128 Building Tycoon parity', () => {
  it('D128 S1: playing Building Tycoon through Lessons leaves it in play', () => {
    const response = playOccupation(
      setupOccupation('D128_BuildingTycoon', { playerCount: 3 }),
      'D128_BuildingTycoon',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D128_BuildingTycoon')
  })

  it('D128 S2: after an opponent builds a room Building Tycoon builds one paid room', () => {
    const session = setupBuildingTycoon()
    let response = buildActorRoom(session)
    expect(response.interaction.sourceCard).toBe('D128_BuildingTycoon')
    response = session.resolveChoice(1, acceptOption(response))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected room selection')
    const room = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(1, { rooms: [room] })

    expect(response.state.players[1]!.rooms).toBe(3)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 0, reed: 0, food: 0 })
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('D128 S3: Building Tycoon may decline after an opponent builds a room', () => {
    const session = setupBuildingTycoon()
    let response = buildActorRoom(session)
    expect(response.interaction.sourceCard).toBe('D128_BuildingTycoon')
    response = session.resolveChoice(1, '__skip__')

    expect(response.state.players[1]!.rooms).toBe(2)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 5, reed: 2, food: 1 })
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D128 S4: an opponent building only a stable does not trigger Building Tycoon', () => {
    const session = setupBuildingTycoon()
    let response = chooseFarmExpansionMode(session, 'actions.stables.name')
    const stable = response.interaction.stateId === 'wait'
      ? response.interaction.request.farm.selectableTiles[0]!
      : undefined
    response = session.commitSelectionChoice(0, { stables: [stable!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe('D128_BuildingTycoon')
  })
})
