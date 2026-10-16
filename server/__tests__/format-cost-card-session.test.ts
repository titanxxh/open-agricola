import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { type FenceSegment, type Field, type GameState } from '../../shared/contract/types'
import '../../shared/cards/B/B002_MiniPasture'
import '../../shared/cards/B/B049_Scales'
import '../../shared/cards/B/B082_ValueAssets'
import '../../shared/cards/B/B093_Confidant'
import '../../shared/cards/B/B149_OpenAirFarmer'
import '../../shared/cards/C/C002_Stable'
import '../../shared/cards/A/A028_ForestSchool'
import '../../shared/cards/A/A085_Homekeeper'
import '../../shared/cards/A/A118_Treegardener'
import '../../shared/cards/D/D042_EducationBonus'
import '../../shared/cards/E/E001_PoleBarns'
import '../../shared/cards/E/E016_BriarHedge'
import '../../shared/cards/E/E089_Stallwright'
import '../../shared/cards/E/E097_Beneficiary'
import '../../shared/cards/A/A114_SeasonalWorker'
import { resolveTriggerIfPresent , expectWait } from './_helpers/trigger-select'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, getChoiceOptions, expectFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const poleFenceEdges = ['H-0-1', 'H-0-2', 'H-0-3', 'H-2-1', 'H-2-2', 'H-2-3', 'V-0-1', 'V-1-1', 'V-0-4', 'V-1-4', 'V-0-2', 'V-1-2', 'V-0-3', 'V-1-3', 'H-1-1']
const preparePoleFarm = (player: GameState['players'][number], ordinaryFences = 15, palisades = 0) => {
  assert.ok(ordinaryFences + palisades === 14 || ordinaryFences + palisades === 15)
  player.fenceSegments = [
    ...poleFenceEdges.slice(0, ordinaryFences).map((edge): FenceSegment => ({ edge, type: 'fence' })),
    ...poleFenceEdges.slice(ordinaryFences, ordinaryFences + palisades).map((edge): FenceSegment => ({ edge, type: 'palisade' })),
  ]
  const tiles = ordinaryFences + palisades === 15
    ? [[{ row: 0, col: 1 }], [{ row: 1, col: 1 }], [{ row: 0, col: 2 }, { row: 1, col: 2 }], [{ row: 0, col: 3 }, { row: 1, col: 3 }]]
    : [[{ row: 0, col: 1 }, { row: 1, col: 1 }], [{ row: 0, col: 2 }, { row: 1, col: 2 }], [{ row: 0, col: 3 }, { row: 1, col: 3 }]]
  player.pastures = tiles.map((tiles, index) => ({ id: `pole-${index}`, tiles, animalType: null, animalCount: 0 }))
}

const FILLER = '__test_placeholder__'

const openConfidantFutureActions = (session: GameSession, initial: ReturnType<GameSession['getState']>) => {
  let response = initial
  expect(response.interaction.stateId).toBe('wait')
  const receipt = getChoiceOptions(response).find(option => option.labelKey === 'actions.receive.name')
  expect(receipt).toBeDefined()
  response = session.resolveChoice(expectWait(response).interaction.playerIndex, receipt!.value)
  expect(response.ok, response.error).toBe(true)
  const source = getChoiceOptions(response).find(option => option.sourceCard === 'B093_Confidant' && !option.disabled)
  expect(source).toBeDefined()
  response = session.resolveChoice(expectWait(response).interaction.playerIndex, source!.value)
  expect(response.ok, response.error).toBe(true)
  if (!getChoiceOptions(response).some(option => option.labelKey === 'actions.sow.name' || option.labelKey === 'actions.fencing.name')) {
    const accept = getChoiceOptions(response).find(option => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, accept!.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const setupMinor = (cardId: string) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }

  const player = state.players[0]!
  player.minorHand = [cardId]
  player.resources = {
    ...player.resources,
    wood: 0,
    food: 0,
  }

  session.loadState(state)
  return session
}

const playPassingMinor = (session: GameSession, cardId: string) => {
  const action = session.takeAction(0, 'meeting-place')
  expect(action.ok).toBe(true)
  expect(action.interaction.stateId).toBe('wait')
  if (action.interaction.stateId !== 'wait') return action
  const actionOption = getChoiceOptions(action)?.find((entry) => entry.value.startsWith('action-improvement-'))
  expect(actionOption).toBeDefined()
  const cardPrompt = session.resolveChoice(0, actionOption!.value)
  expect(cardPrompt.ok).toBe(true)
  expect(cardPrompt.interaction.stateId).toBe('wait')
  if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  if (cardPrompt.interaction.sourceCard === cardId) return cardPrompt
  const cardOption = getChoiceOptions(cardPrompt)?.find((entry) => entry.value === cardId)
  expect(cardOption).toBeDefined()
  const played = session.resolveChoice(0, cardOption!.value)
  expect(played.ok).toBe(true)
  return played
}

const setupOccupation = (cardId: string) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 4 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }

  const player = state.players[0]!
  player.occupationHand = [cardId]
  player.resources = {
    ...player.resources,
    food: 10,
    wood: 2,
  }

  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const action = session.takeAction(0, 'lessons-4')
  expect(action.ok).toBe(true)
  if (action.interaction.stateId !== 'wait') return action
  if (action.interaction.sourceCard === cardId) return action
  const option = getChoiceOptions(action)?.find((entry) => entry.value === cardId)
  expect(option).toBeDefined()
  const played = session.resolveChoice(0, option!.value)
  expect(played.ok).toBe(true)
  return played
}

const setupBeneficiaryWithStallwright = (minorHand: string[] = [FILLER]) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 4 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }

  const player = state.players[0]!
  player.occupationPlayed = ['E089_Stallwright', 'A085_Homekeeper']
  player.occupationHand = ['E097_Beneficiary', 'A114_SeasonalWorker']
  player.minorHand = minorHand
  player.resources = {
    ...player.resources,
    food: 10,
    wood: 0,
  }

  session.loadState(state)
  return session
}

const setupBeneficiaryWithEducationBonus = () => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 4 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }

  const player = state.players[0]!
  player.occupationPlayed = ['A085_Homekeeper', 'A118_Treegardener']
  player.minorPlayed = ['D042_EducationBonus']
  player.occupationHand = ['E097_Beneficiary', 'A114_SeasonalWorker']
  player.resources = {
    ...player.resources,
    food: 10,
    reed: 0,
    stone: 0,
  }

  session.loadState(state)
  return session
}

const setupBeneficiaryWithScales = () => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 4 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }

  const player = state.players[0]!
  player.occupationPlayed = ['A085_Homekeeper', 'A118_Treegardener']
  player.occupationHand = ['E097_Beneficiary', 'A114_SeasonalWorker']
  player.minorPlayed = ['B049_Scales', 'B082_ValueAssets', 'C002_Stable']
  player.resources = {
    ...player.resources,
    food: 10,
  }

  session.loadState(state)
  return session
}

const chooseByLabel = (
  session: GameSession,
  response: ReturnType<GameSession['resolveChoice']> | ReturnType<GameSession['takeAction']>,
  labelKey: string,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((entry) => entry.labelKey === labelKey)
  expect(option).toBeDefined()
  const next = session.resolveChoice(0, option!.value)
  expect(next.ok).toBe(true)
  return next
}

const chooseCardIfPrompted = (
  session: GameSession,
  response: ReturnType<GameSession['resolveChoice']> | ReturnType<GameSession['takeAction']>,
  cardId: string,
) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((entry) => entry.value === cardId)
  if (!option) return response
  const next = session.resolveChoice(0, option.value)
  expect(next.ok).toBe(true)
  return next
}

describe('formatCost card session regressions', () => {
  it('C002 S1: paying the card wood builds one free stable and passes Stable', () => {
    const session = setupMinor('C002_Stable')
    const state = session.getState().state
    state.players[0]!.resources.wood = 1
    session.loadState(state)

    const played = playPassingMinor(session, 'C002_Stable')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(expectWait(played).interaction.request.kind).toBe('farm-select')

    const built = session.commitSelectionChoice(0, {
      stables: [{ row: 0, col: 0 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.stableTiles).toContainEqual({ row: 0, col: 0 })
    expect(built.state.players[1]!.minorHand).toContain('C002_Stable')
  })

  it('C002 S2: the mandatory free stable cannot be declined and remains legally completable', () => {
    const session = setupMinor('C002_Stable')
    const state = session.getState().state
    state.players[0]!.resources.wood = 1
    session.loadState(state)

    const played = playPassingMinor(session, 'C002_Stable')
    expect(played.interaction.stateId).toBe('wait')

    const cancelled = session.commitSelectionChoice(0, { cancel: true })
    expect(cancelled.ok).toBe(false)
    expect(cancelled.error).toBe('action cancel is not allowed')
    expect(cancelled.interaction.stateId).toBe('wait')
    expect(cancelled.state.players[0]!.stableTiles).toEqual([])
    expect(cancelled.state.players[1]!.minorHand).toContain('C002_Stable')

    const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.stableTiles).toContainEqual({ row: 0, col: 0 })
  })

  it('C002 S3: no wood keeps Stable unavailable', () => {
    const session = setupMinor('C002_Stable')
    const action = session.takeAction(0, 'meeting-place')
    expect(action.ok).toBe(true)
    expect(action.interaction.stateId).toBe('wait')
    if (action.interaction.stateId !== 'wait') return
    const actionOption = getChoiceOptions(action)?.find((entry) => entry.value.startsWith('action-improvement-'))
    expect(actionOption).toBeUndefined()
    expect(action.state.players[0]!.minorHand).toContain('C002_Stable')
    expect(action.state.players[0]!.stableTiles).toEqual([])
  })

  it('E001_PoleBarns offers free stables after the card cost consumes all wood', () => {
    const session = setupMinor('E001_PoleBarns')
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    preparePoleFarm(state.players[0]!)
    session.loadState(state)

    const played = playPassingMinor(session, 'E001_PoleBarns')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(expectWait(played).interaction.request.kind).toBe('choice')
    const buildOption = getChoiceOptions(played)?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    const prompt = session.resolveChoice(0, buildOption!.value)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') return
    expect(expectWait(prompt).interaction.request.kind).toBe('farm-select')

    const built = session.commitSelectionChoice(0, {
      stables: [{ row: 0, col: 0 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.stableTiles).toContainEqual({ row: 0, col: 0 })
  })

  it('B002_MiniPasture fences one tile without requiring wood after paying food cost', () => {
    const session = setupMinor('B002_MiniPasture')
    const state = session.getState().state
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.wood = 0
    session.loadState(state)

    const played = playPassingMinor(session, 'B002_MiniPasture')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(expectWait(played).interaction.request.kind).toBe('farm-select')
    expect(expectFarmSelection(played).farmType).toBe('fence')

    const fenced = session.commitSelectionChoice(0, {
      edges: edgesForTile(0, 0),
      extraWood: 0,
    })
    expect(fenced.ok).toBe(true)
    expect(fenced.state.players[0]!.resources.food).toBe(0)
    expect(fenced.state.players[0]!.resources.wood).toBe(0)
    expect(fenced.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(fenced.state.players[1]!.minorHand).toContain('B002_MiniPasture')
  })

  it('B002_MiniPasture rejects a two-cell pasture completed with existing fences', () => {
    const session = setupMinor('B002_MiniPasture')
    const state = session.getState().state
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.wood = 0
    state.players[0]!.fenceSegments = [
      { edge: 'H-0-0', type: 'fence' },
      { edge: 'H-1-0', type: 'fence' },
    ]
    session.loadState(state)

    const played = playPassingMinor(session, 'B002_MiniPasture')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return

    const twoCells = session.commitSelectionChoice(0, {
      edges: ['H-0-1', 'H-1-1', 'V-0-0', 'V-0-2'],
      extraWood: 0,
    })
    expect(twoCells.ok).toBe(false)
  })

  it('B149_OpenAirFarmer rejects one-cell pasture and accepts two-cell pasture', () => {
    const session = setupOccupation('B149_OpenAirFarmer')

    const played = playOccupation(session, 'B149_OpenAirFarmer')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(expectWait(played).interaction.request.kind).toBe('farm-select')
    expect(expectFarmSelection(played).farmType).toBe('fence')

    const cancel = session.commitSelectionChoice(0, { cancel: true })
    expect(cancel.ok).toBe(false)
    expect(cancel.error).toBe('action cancel is not allowed')

    const oneCell = session.commitSelectionChoice(0, {
      edges: edgesForTile(0, 0),
      extraWood: 0,
    })
    expect(oneCell.ok).toBe(false)

    const twoCells = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'],
      extraWood: 0,
    })
    expect(twoCells.ok).toBe(true)
    expect(twoCells.state.players[0]!.occupationPlayed).toContain('B149_OpenAirFarmer')
    expect(twoCells.state.players[0]!.resources.wood).toBe(0)
    expect(twoCells.state.players[0]!.pastures).toHaveLength(1)
    expect(twoCells.state.players[0]!.pastures[0]?.tiles).toHaveLength(2)
  })

  it('B093_Confidant requires choosing a future food schedule when played', () => {
    const session = setupOccupation('B093_Confidant')

    const played = playOccupation(session, 'B093_Confidant')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(played)?.some((entry) => entry.value === '__skip__')).toBe(false)

    const skipped = session.resolveChoice(0, '__skip__')
    expect(skipped.ok).toBe(false)
    expect(skipped.interaction.stateId).toBe('wait')
  })

  it('B093_Confidant is not playable when the minimum future food schedule is unaffordable', () => {
    const session = setupOccupation('B093_Confidant')
    const state = session.getState().state
    state.players[0]!.occupationHand = ['B093_Confidant', 'A114_SeasonalWorker']
    state.players[0]!.resources.food = 1
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(true)
    if (action.interaction.stateId === 'wait') {
      expect(getChoiceOptions(action)?.some((entry) => entry.value === 'B093_Confidant') ?? false).toBe(false)
    }
    expect(action.state.players[0]!.occupationPlayed).not.toContain('B093_Confidant')
    expect(action.state.futureMeeples.some((entry) => entry.cardId === 'B093_Confidant')).toBe(false)
  })

  it('B093_Confidant does not consume the lessons action as the only unaffordable occupation', () => {
    const session = setupOccupation('B093_Confidant')
    const state = session.getState().state
    state.players[0]!.occupationHand = ['B093_Confidant']
    state.players[0]!.resources.food = 1
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(false)
    expect(action.state.players[0]!.occupationPlayed).not.toContain('B093_Confidant')
    expect(action.state.actionSpaces.find(space => space.id === 'lessons-4')!.takenBy).toEqual([])
    expect(action.state.futureMeeples.some((entry) => entry.cardId === 'B093_Confidant')).toBe(false)
  })

  it('B093_Confidant is not playable when A028_ForestSchool only covers the occupation cost', () => {
    const session = setupOccupation('B093_Confidant')
    const state = session.getState().state
    state.players[0]!.occupationHand = ['B093_Confidant', 'A114_SeasonalWorker']
    state.players[0]!.minorPlayed = ['A028_ForestSchool']
    state.players[0]!.resources.food = 0
    state.players[0]!.resources.wood = 5
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(true)
    if (action.interaction.stateId === 'wait') {
      expect(getChoiceOptions(action)?.some((entry) => entry.value === 'B093_Confidant') ?? false).toBe(false)
    }
    expect(action.state.players[0]!.occupationPlayed).not.toContain('B093_Confidant')
    expect(action.state.futureMeeples.some((entry) => entry.cardId === 'B093_Confidant')).toBe(false)
  })

  it('B093_Confidant remains playable with A028_ForestSchool when food remains for the future schedule', () => {
    const session = setupOccupation('B093_Confidant')
    const state = session.getState().state
    state.players[0]!.occupationHand = ['B093_Confidant', 'A114_SeasonalWorker']
    state.players[0]!.minorPlayed = ['A028_ForestSchool']
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.wood = 5
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(true)
    expect(action.interaction.stateId).toBe('wait')
    if (action.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(action)?.some((entry) => entry.value === 'B093_Confidant')).toBe(true)

    const scheduled = session.resolveChoice(0, 'B093_Confidant')
    expect(scheduled.ok, scheduled.error).toBe(true)
    expect(scheduled.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
    })
    expect(scheduled.state.players[0]!.resources.food).toBe(0)
    expect(scheduled.state.players[0]!.resources.wood).toBe(4)
    expect(scheduled.state.futureMeeples.filter((entry) => entry.cardId === 'B093_Confidant')).toHaveLength(2)
  })

  it('B093_Confidant returns future food and offers optional sow or fence at round start', () => {
    const session = setupOccupation('B093_Confidant')
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] } satisfies Field]
    state.players[0]!.resources.grain = 1
    session.loadState(state)

    const played = playOccupation(session, 'B093_Confidant')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    const schedule = getChoiceOptions(played)?.[0]
    expect(schedule).toBeDefined()

    const scheduled = session.resolveChoice(0, schedule!.value)
    expect(scheduled.ok).toBe(true)
    expect(scheduled.state.futureMeeples.filter((entry) => entry.cardId === 'B093_Confidant')).toHaveLength(2)
    const foodAfterScheduling = scheduled.state.players[0]!.resources.food

    const stateBeforeRoundStart = session.getState().state
    for (const player of stateBeforeRoundStart.players) {
      markAllWorkersUsed(stateBeforeRoundStart, player)
    }
    session.loadState(stateBeforeRoundStart)

    let roundStarted = session.performRoundEnd()
    expect(roundStarted.ok).toBe(true)
    expect(roundStarted.state.round).toBe(2)
    expect(roundStarted.state.players[0]!.resources.food).toBe(foodAfterScheduling)
    roundStarted = openConfidantFutureActions(session, roundStarted)
    expect(roundStarted.state.players[0]!.resources.food).toBe(foodAfterScheduling + 1)
    expect(roundStarted.interaction.stateId).toBe('wait')
    if (roundStarted.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(roundStarted)?.some((entry) => entry.value === '__skip__')).toBe(true)
    expect(
      getChoiceOptions(roundStarted)?.some((entry) =>
        entry.labelKey === 'actions.sow.name' ||
        entry.labelKey === 'actions.fencing.name'),
    ).toBe(true)
  })

  it('B093_Confidant future fence remains available when a fence discount covers the policy cost', () => {
    const session = setupOccupation('B093_Confidant')
    const state = session.getState().state
    state.players[0]!.minorPlayed = ['E016_BriarHedge']
    state.players[0]!.resources.wood = 0
    state.players[0]!.fenceSegments = [
      { edge: 'H-1-0', type: 'fence' },
      { edge: 'V-0-0', type: 'fence' },
      { edge: 'V-0-1', type: 'fence' },
    ]
    session.loadState(state)

    const played = playOccupation(session, 'B093_Confidant')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    const schedule = getChoiceOptions(played)?.[0]
    expect(schedule).toBeDefined()

    const scheduled = session.resolveChoice(0, schedule!.value)
    expect(scheduled.ok).toBe(true)

    const stateBeforeRoundStart = session.getState().state
    for (const player of stateBeforeRoundStart.players) {
      markAllWorkersUsed(stateBeforeRoundStart, player)
    }
    session.loadState(stateBeforeRoundStart)

    let roundStarted = session.performRoundEnd()
    expect(roundStarted.ok).toBe(true)
    roundStarted = openConfidantFutureActions(session, roundStarted)
    expect(roundStarted.interaction.stateId).toBe('wait')
    if (roundStarted.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(roundStarted)?.some((entry) => entry.labelKey === 'actions.fencing.name')).toBe(true)

    const fenceOption = getChoiceOptions(roundStarted)?.find((entry) => entry.labelKey === 'actions.fencing.name')
    expect(fenceOption).toBeDefined()
    const fencePrompt = session.resolveChoice(0, fenceOption!.value)
    expect(fencePrompt.ok).toBe(true)
    expect(fencePrompt.interaction.stateId).toBe('wait')
    if (fencePrompt.interaction.stateId !== 'wait') return
    expect(expectWait(fencePrompt).interaction.request.kind).toBe('farm-select')

    const fenced = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      extraWood: 0,
    })
    expect(fenced.ok).toBe(true)
    expect(fenced.state.players[0]!.resources.wood).toBe(0)
    expect(fenced.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(fenced.state.players[0]!.pastures).toHaveLength(1)
  })

  it('E097_Beneficiary leaves Stallwright to trigger after the extra occupation branch', () => {
    const session = setupBeneficiaryWithStallwright()

    const played = playOccupation(session, 'E097_Beneficiary')
    const acceptedOccupationBranch = resolveTriggerIfPresent(
      session,
      chooseByLabel(session, played, 'actions.lessons.name'),
      'E089_Stallwright',
    )
    expect(acceptedOccupationBranch.interaction.stateId).toBe('wait')
    if (acceptedOccupationBranch.interaction.stateId !== 'wait') return
    expect(acceptedOccupationBranch.state.players[0]!.occupationPlayed).toContain('A114_SeasonalWorker')
    expect(getChoiceOptions(acceptedOccupationBranch)?.some((entry) => entry.labelKey === 'actions.stables.name')).toBe(true)

    const acceptedStable = chooseByLabel(session, acceptedOccupationBranch, 'actions.stables.name')
    expect(acceptedStable.interaction.stateId).toBe('wait')
    if (acceptedStable.interaction.stateId !== 'wait') return
    expect(expectWait(acceptedStable).interaction.request.kind).toBe('farm-select')

    const builtStable = session.commitSelectionChoice(0, {
      stables: [{ row: 0, col: 0 }],
    })
    expect(builtStable.ok).toBe(true)
    expect(builtStable.state.players[0]!.stableTiles).toContainEqual({ row: 0, col: 0 })
    expect(readCardResourceStats(builtStable.state.players[0]!, 'E089_Stallwright')?.gained.stable).toBe(1)
    expect(readCardResourceStats(builtStable.state.players[0]!, 'E097_Beneficiary')?.gained.stable ?? 0).toBe(0)
    expect(builtStable.state.players[0]!.occupationPlayed).toContain('A114_SeasonalWorker')
  })

  it('E089_Stallwright still triggers when E097_Beneficiary bonus is skipped', () => {
    const session = setupBeneficiaryWithStallwright()

    const played = playOccupation(session, 'E097_Beneficiary')
    expect(played.interaction.stateId).toBe('wait')
    const skipped = resolveTriggerIfPresent(
      session,
      session.resolveChoice(0, '__skip__'),
      'E089_Stallwright',
    )
    expect(skipped.ok).toBe(true)
    expect(skipped.interaction.stateId).toBe('wait')
    if (skipped.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(skipped)?.some((entry) => entry.labelKey === 'actions.stables.name')).toBe(true)
  })

  it('E089_Stallwright still triggers when E097_Beneficiary bonus plays a minor improvement', () => {
    const session = setupBeneficiaryWithStallwright(['B082_ValueAssets'])

    const played = playOccupation(session, 'E097_Beneficiary')
    const acceptedMinorBranch = chooseByLabel(session, played, 'actions.improvement.name')
    const playedMinor = chooseCardIfPrompted(session, acceptedMinorBranch, 'B082_ValueAssets')
    expect(playedMinor.state.players[0]!.minorPlayed).toContain('B082_ValueAssets')
    expect(playedMinor.interaction.stateId).toBe('wait')
    if (playedMinor.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(playedMinor)?.some((entry) => entry.value === '__done__')).toBe(true)

    const completedBonus = resolveTriggerIfPresent(
      session,
      session.resolveChoice(0, '__done__'),
      'E089_Stallwright',
    )
    expect(completedBonus.ok).toBe(true)
    expect(completedBonus.interaction.stateId).toBe('wait')
    if (completedBonus.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(completedBonus)?.some((entry) => entry.labelKey === 'actions.stables.name')).toBe(true)
  })

  it('D042_EducationBonus uses the original occupation trigger count across Beneficiary extra occupation', () => {
    const session = setupBeneficiaryWithEducationBonus()

    const played = playOccupation(session, 'E097_Beneficiary')
    const acceptedOccupationBranch = chooseByLabel(session, played, 'actions.lessons.name')
    let playedExtraOccupation = resolveTriggerIfPresent(
      session,
      chooseCardIfPrompted(session, acceptedOccupationBranch, 'A114_SeasonalWorker'),
      'D042_EducationBonus',
    )
    playedExtraOccupation = resolveTriggerIfPresent(session, playedExtraOccupation, 'D042_EducationBonus')

    const player = playedExtraOccupation.state.players[0]!
    expect(player.occupationPlayed).toEqual([
      'A085_Homekeeper',
      'A118_Treegardener',
      'E097_Beneficiary',
      'A114_SeasonalWorker',
    ])
    expect(readCardResourceStats(player, 'D042_EducationBonus')?.gained.reed).toBe(1)
    expect(readCardResourceStats(player, 'D042_EducationBonus')?.gained.stone).toBe(1)
  })

  it('B049_Scales checks balanced counts from the original Beneficiary trigger', () => {
    const session = setupBeneficiaryWithScales()

    const played = playOccupation(session, 'E097_Beneficiary')
    const acceptedOccupationBranch = chooseByLabel(session, played, 'actions.lessons.name')
    const playedExtraOccupation = resolveTriggerIfPresent(
      session,
      chooseCardIfPrompted(session, acceptedOccupationBranch, 'A114_SeasonalWorker'),
      'B049_Scales',
    )

    const player = playedExtraOccupation.state.players[0]!
    expect(player.occupationPlayed).toEqual([
      'A085_Homekeeper',
      'A118_Treegardener',
      'E097_Beneficiary',
      'A114_SeasonalWorker',
    ])
    expect(readCardResourceStats(player, 'B049_Scales')?.gained.food).toBe(2)
  })
})

describe("C002 command boundaries", () => {
    const STABLE = 'C002_Stable';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
    function setup(wood: number, configure: (state: GameState) => void = () => { }) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 14;
                for (const p of state.players)
                    Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.resources.wood = wood;
                state.players[0]!.minorHand = [STABLE, 'A030_BakingSheet', 'A016_RammedClay'];
                configure(state);
            } }));
        return session;
    }
    function enterMinor(session: GameSession) {
        let r = ok(session.takeAction(0, 'meeting-place'));
        assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice');
        const action = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'));
        assert.ok(action, JSON.stringify(r.interaction));
        r = ok(session.resolveChoice(0, action.value));
        return r;
    }
    function buy(session: GameSession, card: string) {
        let r = enterMinor(session);
        if (r.state.players[0]!.minorHand.includes(card)) {
            assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice', JSON.stringify(r.interaction));
            const option = getChoiceOptions(r).find(o => o.value === card);
            assert.ok(option, JSON.stringify(r.interaction));
            r = ok(session.resolveChoice(0, option.value));
        }
        assert(r.state.players[1]!.minorHand.includes(card));
        return r;
    }
    it("real paid passing card builds exactly one free stable", () => {
        const session = setup(1);
        const pending = buy(session, STABLE);
        assert.ok(pending.interaction.stateId === 'wait' && expectWait(pending).interaction.request.kind === 'farm-select');
        const r = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }));
        assert.equal(r.state.players[0]!.resources.wood, 0);
        assert.deepEqual(r.state.players[0]!.stableTiles, [{ row: 0, col: 1 }]);
        assert(r.state.players[1]!.minorHand.includes(STABLE));
        save('C002-N1', r);
    });
    it("mandatory single stable rejects cancel multiple targets bad tiles and wrong actor then retries", () => {
        const session = setup(1);
        buy(session, STABLE);
        for (const payload of [{ cancel: true }, { stables: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }, { stables: [{ row: 1, col: 0 }] }, { stables: [{ row: 99, col: 99 }] }])
            assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, payload));
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { stables: [{ row: 0, col: 1 }] }));
        const r = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }));
        assert.equal(r.state.players[0]!.stableTiles.length, 1);
        assert.equal(r.state.players[0]!.resources.wood, 0);
        save('C002-N2', r);
    });
    it("zero wood cannot buy and whole undo restores stable payment and hand", () => {
        const poor = setup(0);
        enterMinor(poor);
        assertRejectedUnchanged(poor, () => poor.resolveChoice(0, STABLE));
        assert.equal(poor.getState().state.players[0]!.stableTiles.length, 0);
        const session = setup(1);
        buy(session, STABLE);
        const r = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }));
        const undone = ok(session.undoAction());
        assert.equal(undone.state.players[0]!.resources.wood, 1);
        assert.equal(undone.state.players[0]!.stableTiles.length, 0);
        assert(undone.state.players[0]!.minorHand.includes(STABLE));
        assert(!undone.state.players[1]!.minorHand.includes(STABLE));
        save('C002-N3', { r, undone });
    });
    it("finite four stable supply cannot produce a fifth stable", () => {
        const session = setup(1, state => state.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col })));
        const r = enterMinor(session);
        assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice');
        // No printed stable-stock prerequisite: buying is permitted; finite stock must prevent a fifth.
        const bought = ok(session.resolveChoice(0, STABLE));
        assert.ok(bought.interaction.stateId === 'wait');
        assert.equal(bought.interaction.request.kind, 'engine-blocked');
        assert.deepEqual(bought.interaction.request, { kind: 'engine-blocked', actionId: 'stables' });
        assert.deepEqual(bought.interaction.allowedCommands, ['undoStep', 'undoAction']);
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [{ row: 2, col: 1 }] }));
        assert.equal(bought.state.players[0]!.stableTiles.length, 4);
        assert.equal(bought.state.players[0]!.resources.wood, 0);
        save('C002-N4', bought);
    });
});
