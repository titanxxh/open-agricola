import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A14_CarpentersHammer } from '../../shared/cards/A/A14_CarpentersHammer'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'
import type { PlayerState } from '../../shared/contract/types.ts'

import { workersAvailable } from '../../shared/game/player'
import { isLegacyChoicePending } from './_helpers/legacy-confirms'
describe('construct room payment session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 1,
      stone: 5,
      reed: 2,
    }
    player.houseType = 'stone'
    player.occupationPlayed.push('A123_FrameBuilder')
    player.activeModifiers = [
      ...((A123_FrameBuilder as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? []),
    ]

    session.loadState(state)
    return session
  }

  it('prompts for room payment and applies the selected solution', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return

    const room = resp.interaction.farm.selectableTiles[0]!

    resp = session.resolveChoice(0, 'confirm', { rooms: [room] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.options).toHaveLength(2)

    const woodSwapOption = resp.interaction.options?.find(
      (option) =>
        typeof option.labelParams === 'object' &&
        typeof (option.labelParams as { resourcesPaid?: { wood?: number; stone?: number } }).resourcesPaid?.stone === 'number' &&
        typeof (option.labelParams as { resourcesPaid?: { wood?: number; stone?: number } }).resourcesPaid?.wood === 'number' &&
        (option.labelParams as { resourcesPaid?: { wood?: number; stone?: number } }).resourcesPaid?.stone === 3 &&
        (option.labelParams as { resourcesPaid?: { wood?: number; stone?: number } }).resourcesPaid?.wood === 1,
    )
    expect(woodSwapOption).toBeDefined()

    resp = session.resolveChoice(0, woodSwapOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(2)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })

  it('requires farm-expansion room mode to build at least one room', () => {
    const session = setup()

    const resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('room')

    const commitResp = session.resolveChoice(0, 'confirm', { rooms: [] })
    expect(commitResp.ok).toBe(false)
    // Engine path: empty rooms triggers NO_SELECTION (validateRoomSelection),
    // surfacing as a fail. The previous "farm-expansion requires …" message
    // came from commitFarmChoice's farm-expansion guard; that guard is now
    // covered by the same NO_SELECTION rejection at the listener layer.
  })

  it('undoStep can be used repeatedly to leave room selection and then undo the whole action', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 5,
      reed: 2,
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('room')

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

  it('lets Carpenter\'s Hammer unlock a discounted two-room build', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 8,
      reed: 2,
    }
    player.minorPlayed.push('A14_CarpentersHammer')
    player.activeModifiers = [
      ...((A14_CarpentersHammer as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? []),
    ]

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return
    expect(resp.interaction.farm.maxSelections).toBe(2)

    const [roomA, roomB] = resp.interaction.farm.selectableTiles
    expect(roomA).toBeDefined()
    expect(roomB).toBeDefined()
    if (!roomA || !roomB) return

    resp = session.resolveChoice(0, 'confirm', { rooms: [roomA, roomB] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.rooms).toBe(4)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })

  it('returns to farm-expansion choice after building a room when stables remain possible', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 7,
      reed: 2,
    }

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return

    const room = resp.interaction.farm.selectableTiles[0]!
    resp = session.resolveChoice(0, 'confirm', { rooms: [room] })

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionFarmExpansionSelect')
    expect(resp.interaction.options?.some((option) => option.labelKey === 'ui.interactionFlowDone')).toBe(true)
    expect(resp.interaction.options?.some((option) => option.labelKey === 'actions.stables.name')).toBe(true)
  })
})
