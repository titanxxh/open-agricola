import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import type { FenceSegment, Field } from '../../shared/contract/types'

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
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

const FILLER = '__test_placeholder__'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const setupMinor = (cardId: string) => {
  const session = new GameSession(42)
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
  const actionOption = action.interaction.request.options?.find((entry) => entry.value.startsWith('action-improvement-'))
  expect(actionOption).toBeDefined()
  const cardPrompt = session.resolveChoice(0, actionOption!.value)
  expect(cardPrompt.ok).toBe(true)
  expect(cardPrompt.interaction.stateId).toBe('wait')
  if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  if (cardPrompt.interaction.sourceCard === cardId) return cardPrompt
  const cardOption = cardPrompt.interaction.request.options?.find((entry) => entry.value === cardId)
  expect(cardOption).toBeDefined()
  const played = session.resolveChoice(0, cardOption!.value)
  expect(played.ok).toBe(true)
  return played
}

const setupOccupation = (cardId: string) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
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
  const option = action.interaction.request.options?.find((entry) => entry.value === cardId)
  expect(option).toBeDefined()
  const played = session.resolveChoice(0, option!.value)
  expect(played.ok).toBe(true)
  return played
}

const setupBeneficiaryWithStallwright = (minorHand: string[] = [FILLER]) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
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
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
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
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
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
  const option = response.interaction.request.options?.find((entry) => entry.labelKey === labelKey)
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
  const option = response.interaction.request.options?.find((entry) => entry.value === cardId)
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
    expect(played.interaction.request.kind).toBe('farm-select')

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
    const actionOption = action.interaction.request.options?.find((entry) => entry.value.startsWith('action-improvement-'))
    expect(actionOption).toBeUndefined()
    expect(action.state.players[0]!.minorHand).toContain('C002_Stable')
    expect(action.state.players[0]!.stableTiles).toEqual([])
  })

  it('E001_PoleBarns offers free stables after the card cost consumes all wood', () => {
    const session = setupMinor('E001_PoleBarns')
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    state.players[0]!.fenceSegments = Array.from({ length: 15 }, (_, index): FenceSegment => ({
      edge: `test-edge-${index}`,
      type: 'fence',
    }))
    session.loadState(state)

    const played = playPassingMinor(session, 'E001_PoleBarns')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.kind).toBe('choice')
    const buildOption = played.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    const prompt = session.resolveChoice(0, buildOption!.value)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') return
    expect(prompt.interaction.request.kind).toBe('farm-select')

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
    expect(played.interaction.request.kind).toBe('farm-select')
    expect(played.interaction.request.farm.farmType).toBe('fence')

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
    expect(played.interaction.request.kind).toBe('farm-select')
    expect(played.interaction.request.farm.farmType).toBe('fence')

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
    expect(played.interaction.request.options?.some((entry) => entry.value === '__skip__')).toBe(false)

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
      expect(action.interaction.request.options?.some((entry) => entry.value === 'B093_Confidant') ?? false).toBe(false)
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
    expect(action.state.players[0]!.workers.some((worker) => worker.action === 'lessons-4')).toBe(false)
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
      expect(action.interaction.request.options?.some((entry) => entry.value === 'B093_Confidant') ?? false).toBe(false)
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
    expect(action.interaction.request.options?.some((entry) => entry.value === 'B093_Confidant')).toBe(true)

    let response = session.resolveChoice(0, 'B093_Confidant')
    expect(response.ok).toBe(true)
    if (
      response.interaction.stateId === 'wait' &&
      response.interaction.promptKey === 'prompt.selectPayment'
    ) {
      const paymentOptions = response.interaction.request.options ?? []
      const foodPayment = paymentOptions.find((option) => {
        const resourcesPaid = (
          (option.labelParams as { resourcesPaid?: Record<string, number> } | undefined)
            ?.resourcesPaid ?? {}
        )
        return resourcesPaid.food === 1
      })
      expect(foodPayment).toBeUndefined()
      const woodPayment = paymentOptions.find((option) => {
        const resourcesPaid = (
          (option.labelParams as { resourcesPaid?: Record<string, number> } | undefined)
            ?.resourcesPaid ?? {}
        )
        return resourcesPaid.wood === 1
      })
      expect(woodPayment).toBeDefined()
      response = session.resolveChoice(0, woodPayment!.value)
      expect(response.ok).toBe(true)
    }

    let scheduled = response
    if (response.interaction.stateId === 'wait' && response.interaction.request.options) {
      expect(response.interaction.request.options?.some((entry) => entry.value === '__skip__')).toBe(false)
      const schedule = response.interaction.request.options?.[0]
      expect(schedule).toBeDefined()
      scheduled = session.resolveChoice(0, schedule!.value)
      expect(scheduled.ok).toBe(true)
    }
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
    const schedule = played.interaction.request.options?.[0]
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

    const roundStarted = session.performRoundEnd()
    expect(roundStarted.ok).toBe(true)
    expect(roundStarted.state.round).toBe(2)
    expect(roundStarted.state.players[0]!.resources.food).toBe(foodAfterScheduling + 1)
    expect(roundStarted.interaction.stateId).toBe('wait')
    if (roundStarted.interaction.stateId !== 'wait') return
    expect(roundStarted.interaction.request.options?.some((entry) => entry.value === '__skip__')).toBe(true)
    expect(
      roundStarted.interaction.request.options?.some((entry) =>
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
    const schedule = played.interaction.request.options?.[0]
    expect(schedule).toBeDefined()

    const scheduled = session.resolveChoice(0, schedule!.value)
    expect(scheduled.ok).toBe(true)

    const stateBeforeRoundStart = session.getState().state
    for (const player of stateBeforeRoundStart.players) {
      markAllWorkersUsed(stateBeforeRoundStart, player)
    }
    session.loadState(stateBeforeRoundStart)

    const roundStarted = session.performRoundEnd()
    expect(roundStarted.ok).toBe(true)
    expect(roundStarted.interaction.stateId).toBe('wait')
    if (roundStarted.interaction.stateId !== 'wait') return
    expect(roundStarted.interaction.request.options?.some((entry) => entry.labelKey === 'actions.fencing.name')).toBe(true)

    const fenceOption = roundStarted.interaction.request.options?.find((entry) => entry.labelKey === 'actions.fencing.name')
    expect(fenceOption).toBeDefined()
    const fencePrompt = session.resolveChoice(0, fenceOption!.value)
    expect(fencePrompt.ok).toBe(true)
    expect(fencePrompt.interaction.stateId).toBe('wait')
    if (fencePrompt.interaction.stateId !== 'wait') return
    expect(fencePrompt.interaction.request.kind).toBe('farm-select')

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
    expect(acceptedOccupationBranch.interaction.request.options?.some((entry) => entry.labelKey === 'actions.stables.name')).toBe(true)

    const acceptedStable = chooseByLabel(session, acceptedOccupationBranch, 'actions.stables.name')
    expect(acceptedStable.interaction.stateId).toBe('wait')
    if (acceptedStable.interaction.stateId !== 'wait') return
    expect(acceptedStable.interaction.request.kind).toBe('farm-select')

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
    expect(skipped.interaction.request.options?.some((entry) => entry.labelKey === 'actions.stables.name')).toBe(true)
  })

  it('E089_Stallwright still triggers when E097_Beneficiary bonus plays a minor improvement', () => {
    const session = setupBeneficiaryWithStallwright(['B082_ValueAssets'])

    const played = playOccupation(session, 'E097_Beneficiary')
    const acceptedMinorBranch = chooseByLabel(session, played, 'actions.improvement.name')
    const playedMinor = chooseCardIfPrompted(session, acceptedMinorBranch, 'B082_ValueAssets')
    expect(playedMinor.state.players[0]!.minorPlayed).toContain('B082_ValueAssets')
    expect(playedMinor.interaction.stateId).toBe('wait')
    if (playedMinor.interaction.stateId !== 'wait') return
    expect(playedMinor.interaction.request.options?.some((entry) => entry.value === '__done__')).toBe(true)

    const completedBonus = resolveTriggerIfPresent(
      session,
      session.resolveChoice(0, '__done__'),
      'E089_Stallwright',
    )
    expect(completedBonus.ok).toBe(true)
    expect(completedBonus.interaction.stateId).toBe('wait')
    if (completedBonus.interaction.stateId !== 'wait') return
    expect(completedBonus.interaction.request.options?.some((entry) => entry.labelKey === 'actions.stables.name')).toBe(true)
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
