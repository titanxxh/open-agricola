import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import type { FenceSegment, Field } from '../../shared/contract/types'

import '../../shared/cards/B/B2_MiniPasture'
import '../../shared/cards/B/B82_ValueAssets'
import '../../shared/cards/B/B93_Confidant'
import '../../shared/cards/B/B149_OpenAirFarmer'
import '../../shared/cards/C/C2_Stable'
import '../../shared/cards/A/A28_ForestSchool'
import '../../shared/cards/E/E1_PoleBarns'
import '../../shared/cards/E/E16_BriarHedge'
import '../../shared/cards/E/E89_Stallwright'
import '../../shared/cards/E/E97_Beneficiary'
import '../../shared/cards/A/A114_SeasonalWorker'

const FILLER = '__test_placeholder__'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const setupMinor = (cardId: string) => {
  const session = new GameSession()
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
  const actionOption = action.interaction.options?.find((entry) => entry.value.startsWith('action-improvement-'))
  expect(actionOption).toBeDefined()
  const cardPrompt = session.resolveChoice(0, actionOption!.value)
  expect(cardPrompt.ok).toBe(true)
  expect(cardPrompt.interaction.stateId).toBe('wait')
  if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  if (cardPrompt.interaction.sourceCard === cardId) return cardPrompt
  const cardOption = cardPrompt.interaction.options?.find((entry) => entry.value === `minor:${cardId}`)
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
  const option = action.interaction.options?.find((entry) => entry.value === cardId)
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
  player.occupationPlayed = ['E89_Stallwright', 'A1_OtherOccupation']
  player.occupationHand = ['E97_Beneficiary', 'A114_SeasonalWorker']
  player.minorHand = minorHand
  player.resources = {
    ...player.resources,
    food: 10,
    wood: 0,
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
  const option = response.interaction.options?.find((entry) => entry.labelKey === labelKey)
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
  const option = response.interaction.options?.find((entry) => entry.value === cardId)
  if (!option) return response
  const next = session.resolveChoice(0, option.value)
  expect(next.ok).toBe(true)
  return next
}

describe('formatCost card session regressions', () => {
  it('C2_Stable builds its free stable after paying only the card wood cost', () => {
    const session = setupMinor('C2_Stable')
    const state = session.getState().state
    state.players[0]!.resources.wood = 1
    session.loadState(state)

    const played = playPassingMinor(session, 'C2_Stable')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.kind).toBe('farm-select')

    const built = session.commitSelectionChoice(0, {
      stables: [{ row: 0, col: 0 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.stableTiles).toContainEqual({ row: 0, col: 0 })
    expect(built.state.players[1]!.minorHand).toContain('C2_Stable')
  })

  it('C2_Stable does not allow cancelling the mandatory free stable', () => {
    const session = setupMinor('C2_Stable')
    const state = session.getState().state
    state.players[0]!.resources.wood = 1
    session.loadState(state)

    const played = playPassingMinor(session, 'C2_Stable')
    expect(played.interaction.stateId).toBe('wait')

    const cancelled = session.commitSelectionChoice(0, { cancel: true })
    expect(cancelled.ok).toBe(false)
    expect(cancelled.error).toBe('action cancel is not allowed')
    expect(cancelled.interaction.stateId).toBe('wait')
    expect(cancelled.state.players[0]!.stableTiles).toEqual([])
    expect(cancelled.state.players[1]!.minorHand).toContain('C2_Stable')
  })

  it('E1_PoleBarns offers free stables after the card cost consumes all wood', () => {
    const session = setupMinor('E1_PoleBarns')
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    state.players[0]!.fenceSegments = Array.from({ length: 15 }, (_, index): FenceSegment => ({
      edge: `test-edge-${index}`,
      type: 'fence',
    }))
    session.loadState(state)

    const played = playPassingMinor(session, 'E1_PoleBarns')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.kind).toBe('choice')
    const buildOption = played.interaction.options?.find((option) => option.value !== '__skip__')
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

  it('B2_MiniPasture fences one tile without requiring wood after paying food cost', () => {
    const session = setupMinor('B2_MiniPasture')
    const state = session.getState().state
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.wood = 0
    session.loadState(state)

    const played = playPassingMinor(session, 'B2_MiniPasture')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.kind).toBe('farm-select')
    expect(played.interaction.farm.farmType).toBe('fence')

    const fenced = session.commitSelectionChoice(0, {
      edges: edgesForTile(0, 0),
      extraWood: 0,
    })
    expect(fenced.ok).toBe(true)
    expect(fenced.state.players[0]!.resources.food).toBe(0)
    expect(fenced.state.players[0]!.resources.wood).toBe(0)
    expect(fenced.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(fenced.state.players[1]!.minorHand).toContain('B2_MiniPasture')
  })

  it('B2_MiniPasture rejects a two-cell pasture completed with existing fences', () => {
    const session = setupMinor('B2_MiniPasture')
    const state = session.getState().state
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.wood = 0
    state.players[0]!.fenceSegments = [
      { edge: 'H-0-0', type: 'fence' },
      { edge: 'H-1-0', type: 'fence' },
    ]
    session.loadState(state)

    const played = playPassingMinor(session, 'B2_MiniPasture')
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
    expect(played.interaction.farm.farmType).toBe('fence')

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

  it('B93_Confidant requires choosing a future food schedule when played', () => {
    const session = setupOccupation('B93_Confidant')

    const played = playOccupation(session, 'B93_Confidant')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.options?.some((entry) => entry.value === '__skip__')).toBe(false)

    const skipped = session.resolveChoice(0, '__skip__')
    expect(skipped.ok).toBe(false)
    expect(skipped.interaction.stateId).toBe('wait')
  })

  it('B93_Confidant is not playable when the minimum future food schedule is unaffordable', () => {
    const session = setupOccupation('B93_Confidant')
    const state = session.getState().state
    state.players[0]!.occupationHand = ['B93_Confidant', 'A114_SeasonalWorker']
    state.players[0]!.resources.food = 1
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(true)
    if (action.interaction.stateId === 'wait') {
      expect(action.interaction.options?.some((entry) => entry.value === 'B93_Confidant') ?? false).toBe(false)
    }
    expect(action.state.players[0]!.occupationPlayed).not.toContain('B93_Confidant')
    expect(action.state.futureMeeples.some((entry) => entry.cardId === 'B93_Confidant')).toBe(false)
  })

  it('B93_Confidant does not consume the lessons action as the only unaffordable occupation', () => {
    const session = setupOccupation('B93_Confidant')
    const state = session.getState().state
    state.players[0]!.occupationHand = ['B93_Confidant']
    state.players[0]!.resources.food = 1
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(false)
    expect(action.state.players[0]!.occupationPlayed).not.toContain('B93_Confidant')
    expect(action.state.players[0]!.workers.some((worker) => worker.action === 'lessons-4')).toBe(false)
    expect(action.state.futureMeeples.some((entry) => entry.cardId === 'B93_Confidant')).toBe(false)
  })

  it('B93_Confidant is not playable when A28_ForestSchool only covers the occupation cost', () => {
    const session = setupOccupation('B93_Confidant')
    const state = session.getState().state
    state.players[0]!.occupationHand = ['B93_Confidant', 'A114_SeasonalWorker']
    state.players[0]!.minorPlayed = ['A28_ForestSchool']
    state.players[0]!.resources.food = 0
    state.players[0]!.resources.wood = 5
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(true)
    if (action.interaction.stateId === 'wait') {
      expect(action.interaction.options?.some((entry) => entry.value === 'B93_Confidant') ?? false).toBe(false)
    }
    expect(action.state.players[0]!.occupationPlayed).not.toContain('B93_Confidant')
    expect(action.state.futureMeeples.some((entry) => entry.cardId === 'B93_Confidant')).toBe(false)
  })

  it('B93_Confidant remains playable with A28_ForestSchool when food remains for the future schedule', () => {
    const session = setupOccupation('B93_Confidant')
    const state = session.getState().state
    state.players[0]!.occupationHand = ['B93_Confidant', 'A114_SeasonalWorker']
    state.players[0]!.minorPlayed = ['A28_ForestSchool']
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.wood = 5
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(true)
    expect(action.interaction.stateId).toBe('wait')
    if (action.interaction.stateId !== 'wait') return
    expect(action.interaction.options?.some((entry) => entry.value === 'B93_Confidant')).toBe(true)

    let response = session.resolveChoice(0, 'B93_Confidant')
    expect(response.ok).toBe(true)
    if (
      response.interaction.stateId === 'wait' &&
      response.interaction.promptKey === 'prompt.selectPayment'
    ) {
      const paymentOptions = response.interaction.options ?? []
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
    if (response.interaction.stateId === 'wait' && response.interaction.options) {
      expect(response.interaction.options?.some((entry) => entry.value === '__skip__')).toBe(false)
      const schedule = response.interaction.options?.[0]
      expect(schedule).toBeDefined()
      scheduled = session.resolveChoice(0, schedule!.value)
      expect(scheduled.ok).toBe(true)
    }
    expect(scheduled.state.players[0]!.resources.food).toBe(0)
    expect(scheduled.state.players[0]!.resources.wood).toBe(4)
    expect(scheduled.state.futureMeeples.filter((entry) => entry.cardId === 'B93_Confidant')).toHaveLength(2)
  })

  it('B93_Confidant returns future food and offers optional sow or fence at round start', () => {
    const session = setupOccupation('B93_Confidant')
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] } satisfies Field]
    state.players[0]!.resources.grain = 1
    session.loadState(state)

    const played = playOccupation(session, 'B93_Confidant')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    const schedule = played.interaction.options?.[0]
    expect(schedule).toBeDefined()

    const scheduled = session.resolveChoice(0, schedule!.value)
    expect(scheduled.ok).toBe(true)
    expect(scheduled.state.futureMeeples.filter((entry) => entry.cardId === 'B93_Confidant')).toHaveLength(2)
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
    expect(roundStarted.interaction.options?.some((entry) => entry.value === '__skip__')).toBe(true)
    expect(
      roundStarted.interaction.options?.some((entry) =>
        entry.labelKey === 'actions.sow.name' ||
        entry.labelKey === 'actions.fencing.name'),
    ).toBe(true)
  })

  it('B93_Confidant future fence remains available when a fence discount covers the policy cost', () => {
    const session = setupOccupation('B93_Confidant')
    const state = session.getState().state
    state.players[0]!.minorPlayed = ['E16_BriarHedge']
    state.players[0]!.resources.wood = 0
    state.players[0]!.fenceSegments = [
      { edge: 'H-1-0', type: 'fence' },
      { edge: 'V-0-0', type: 'fence' },
      { edge: 'V-0-1', type: 'fence' },
    ]
    session.loadState(state)

    const played = playOccupation(session, 'B93_Confidant')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    const schedule = played.interaction.options?.[0]
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
    expect(roundStarted.interaction.options?.some((entry) => entry.labelKey === 'actions.fencing.name')).toBe(true)

    const fenceOption = roundStarted.interaction.options?.find((entry) => entry.labelKey === 'actions.fencing.name')
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

  it('E97_Beneficiary offers Stallwright stable before the extra occupation branch', () => {
    const session = setupBeneficiaryWithStallwright()

    const played = playOccupation(session, 'E97_Beneficiary')
    const acceptedOccupationBranch = chooseByLabel(session, played, 'actions.lessons.name')
    const acceptedStable = chooseByLabel(session, acceptedOccupationBranch, 'actions.stables.name')
    expect(acceptedStable.interaction.stateId).toBe('wait')
    if (acceptedStable.interaction.stateId !== 'wait') return
    expect(acceptedStable.interaction.request.kind).toBe('farm-select')

    const builtStable = session.commitSelectionChoice(0, {
      stables: [{ row: 0, col: 0 }],
    })
    expect(builtStable.ok).toBe(true)
    expect(builtStable.state.players[0]!.stableTiles).toContainEqual({ row: 0, col: 0 })
    expect(readCardResourceStats(builtStable.state.players[0]!, 'E89_Stallwright')?.gained.stable).toBe(1)
    expect(readCardResourceStats(builtStable.state.players[0]!, 'E97_Beneficiary')?.gained.stable ?? 0).toBe(0)
    expect(builtStable.state.players[0]!.occupationPlayed).toContain('A114_SeasonalWorker')
  })

  it('E89_Stallwright still triggers when E97_Beneficiary bonus is skipped', () => {
    const session = setupBeneficiaryWithStallwright()

    const played = playOccupation(session, 'E97_Beneficiary')
    expect(played.interaction.stateId).toBe('wait')
    const skipped = session.resolveChoice(0, '__skip__')
    expect(skipped.ok).toBe(true)
    expect(skipped.interaction.stateId).toBe('wait')
    if (skipped.interaction.stateId !== 'wait') return
    expect(skipped.interaction.options?.some((entry) => entry.labelKey === 'actions.stables.name')).toBe(true)
  })

  it('E89_Stallwright still triggers when E97_Beneficiary bonus plays a minor improvement', () => {
    const session = setupBeneficiaryWithStallwright(['B82_ValueAssets'])

    const played = playOccupation(session, 'E97_Beneficiary')
    const acceptedMinorBranch = chooseByLabel(session, played, 'actions.improvement.name')
    const playedMinor = chooseCardIfPrompted(session, acceptedMinorBranch, 'B82_ValueAssets')
    expect(playedMinor.state.players[0]!.minorPlayed).toContain('B82_ValueAssets')
    expect(playedMinor.interaction.stateId).toBe('wait')
    if (playedMinor.interaction.stateId !== 'wait') return
    expect(playedMinor.interaction.options?.some((entry) => entry.value === '__done__')).toBe(true)

    const completedBonus = session.resolveChoice(0, '__done__')
    expect(completedBonus.ok).toBe(true)
    expect(completedBonus.interaction.stateId).toBe('wait')
    if (completedBonus.interaction.stateId !== 'wait') return
    expect(completedBonus.interaction.options?.some((entry) => entry.labelKey === 'actions.stables.name')).toBe(true)
  })
})
