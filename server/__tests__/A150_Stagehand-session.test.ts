import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A150_Stagehand'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

describe('A150_Stagehand session', () => {
  const setup = (playerCount = 4, spaceId = 'traveling-players') => {
    const session = new GameSession(undefined, undefined, { playerCount })
    const state = session.getState().state
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('A150_Stagehand')
    owner.resources = { ...owner.resources, wood: 20, clay: 10, reed: 10, stone: 10 }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    const travelingPlayers = state.actionSpaces.find((s) => s.id === spaceId)
    if (!travelingPlayers) throw new Error(`${spaceId} space missing`)
    travelingPlayers.resources.food = 3

    session.loadState(state)
    return session
  }

  it('triggers when an opponent uses traveling-players', () => {
    const session = setup()
    const resp = session.takeAction(1, 'traveling-players')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')) return
    expect(resp.interaction.fromPlayerIndex).toBe(1)
    expect(resp.interaction.toPlayerIndex).toBe(0)
    const grantedLog = resp.state.log.find((entry) => entry.key === 'log.cardGrantedAction')
    expect(grantedLog?.params?.player).toBe(resp.state.players[0]!.name)
  })

  it('triggers when an opponent uses traveling-players-56', () => {
    const session = setup(5, 'traveling-players-56')
    const resp = session.takeAction(1, 'traveling-players-56')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
  })

  it('full flow: switch to owner, skip optional choice, switch back', () => {
    const session = setup()

    let resp = session.takeAction(1, 'traveling-players')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
      expect(resp.interaction.fromPlayerIndex).toBe(1)
      expect(resp.interaction.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)

    // First choice: optional "do or skip" wrapping the XOR
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.fromPlayerIndex).toBe(0)
    expect(resp.interaction.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('owner can choose Build Rooms (construct) from the XOR choice', () => {
    const session = setup()

    let resp = session.takeAction(1, 'traveling-players')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
      expect(resp.interaction.fromPlayerIndex).toBe(1)
      expect(resp.interaction.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // One-step XOR: fence, stables, construct, skip
    const xorOptions = resp.interaction.options?.filter((o: ActionChoiceOption) => o.value !== '__skip__') ?? []
    expect(xorOptions.length).toBe(3)

    // Choose construct (find it by label)
    const constructOption = xorOptions.find((o: ActionChoiceOption) => o.labelKey?.includes('construct'))
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return
    // BGA: Stagehand's construct does not cap room count (unlike A128/D128).
    expect(resp.interaction.farm.maxSelections).toBeGreaterThan(1)

    // Build a room
    resp = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.fromPlayerIndex).toBe(0)
    expect(resp.interaction.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('does not trigger when owner uses traveling-players', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'traveling-players')
    expect(resp.ok).toBe(true)
    // Owner using the space should NOT trigger stagehand (scope: opponent)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
  })

  it('does not trigger for non-matching action spaces', () => {
    const session = setup()
    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    // No player switch should happen for a different space
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
  })
})
