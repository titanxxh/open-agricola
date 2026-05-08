import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { PlayerState } from '../../shared/contract/types.ts'

import { workersAvailable } from '../../shared/game/player'
import { isLegacyChoicePending } from './_helpers/legacy-confirms'
const stableTradeModifiers: PlayerState['activeModifiers'] = [
  {
    type: 'trade',
    cardId: 'Test_Stable_Clay',
    appliesTo: ['stables'],
    from: { clay: 2 },
    to: { wood: 2 },
    max: 2,
  },
  {
    type: 'trade',
    cardId: 'Test_Stable_Stone',
    appliesTo: ['stables'],
    from: { stone: 2 },
    to: { wood: 2 },
    max: 2,
  },
]

describe('stable payment session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 5,
      reed: 2,
      clay: 2,
      stone: 2,
    }
    player.activeModifiers = [...stableTradeModifiers]

    session.loadState(state)
    return session
  }

  it('prompts for stable payment and applies the selected solution', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const stableOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.stables.name',
    )
    expect(stableOption).toBeDefined()

    resp = session.resolveChoice(0, stableOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('stable')
    if (resp.interaction.farm.farmType !== 'stable') return

    const stable = resp.interaction.farm.selectableTiles[0]!
    resp = session.resolveChoice(0, 'confirm', { stables: [stable] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')

    const stoneOption = resp.interaction.options?.find(
      (option) => typeof option.labelParams === 'object' && option.labelParams?.resourcesPaid?.stone === 2,
    )
    expect(stoneOption).toBeDefined()

    resp = session.resolveChoice(0, stoneOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toContainEqual(stable)
    expect(resp.state.players[0]!.resources.clay).toBe(2)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
  })

  it('rejects empty stable selection on farm-expansion', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const stableOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.stables.name',
    )
    expect(stableOption).toBeDefined()

    resp = session.resolveChoice(0, stableOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('stable')

    // Engine path: empty stables triggers stablesAction.resolveChoice fail.
    // Surfaces as ok=false; pending is cleared and no stable is placed.
    const stablesBefore = resp.state.players[0]!.stableTiles.length
    const commitResp = session.resolveChoice(0, 'confirm', { stables: [] })
    expect(commitResp.ok).toBe(false)
    expect(commitResp.state.players[0]!.stableTiles.length).toBe(stablesBefore)
  })

  it('undoStep can be used repeatedly to leave stable selection and then undo the whole action', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const stableOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.stables.name',
    )
    expect(stableOption).toBeDefined()

    resp = session.resolveChoice(0, stableOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('stable')

    const workersAfterTake = workersAvailable(resp.state, resp.state.players[0]!)
    const undoStepResp = session.undoStep()
    expect(undoStepResp.ok).toBe(true)
    expect(undoStepResp.interaction.stateId).toBe('wait')
    expect(undoStepResp.interaction.stateId).toBe('wait')
    if (undoStepResp.interaction.stateId !== 'wait') return
    expect(undoStepResp.interaction.options?.some((option) => option.labelKey === 'actions.construct.name')).toBe(true)
    expect(undoStepResp.interaction.options?.some((option) => option.labelKey === 'actions.stables.name')).toBe(true)
    expect(workersAvailable(undoStepResp.state, undoStepResp.state.players[0]!)).toBe(workersAfterTake)
    expect(
      undoStepResp.state.actionSpaces.find((space) => space.id === 'farm-expansion')?.takenBy[0]?.playerId,
    ).toBe(undoStepResp.state.players[0]!.id)

    const secondUndoStepResp = session.undoStep()
    expect(secondUndoStepResp.ok).toBe(true)
    expect(isLegacyChoicePending(secondUndoStepResp)).toBe(false)
    expect(workersAvailable(secondUndoStepResp.state, secondUndoStepResp.state.players[0]!)).toBe(2)
    expect(secondUndoStepResp.state.actionSpaces.find((space) => space.id === 'farm-expansion')?.takenBy).toEqual([])
  })

  it('undoStep returns to action-space selection when farm-expansion auto-enters stable selection', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.resources = {
      ...state.players[0]!.resources,
      wood: 4,
      reed: 0,
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionStableSelect')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('stable')

    const undoResp = session.undoStep()
    expect(undoResp.ok).toBe(true)
    expect(isLegacyChoicePending(undoResp)).toBe(false)
    expect(undoResp.interaction.stateId).toBe('idle')
    expect(workersAvailable(undoResp.state, undoResp.state.players[0]!)).toBe(2)
    expect(undoResp.state.actionSpaces.find((space) => space.id === 'farm-expansion')?.takenBy).toEqual([])
  })
})
