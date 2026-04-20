import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A150_Stagehand'

describe('A150_Stagehand session', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    // traveling-players is a 4-player action space, keep all 4 players
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('A150_Stagehand')
    owner.resources = { ...owner.resources, wood: 20, clay: 10, reed: 10, stone: 10 }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    const travelingPlayers = state.actionSpaces.find((s) => s.id === 'traveling-players')
    if (!travelingPlayers) throw new Error('traveling-players space missing')
    travelingPlayers.resources.food = 3

    session.loadState(state)
    return session
  }

  it('triggers when an opponent uses traveling-players', () => {
    const session = setup()
    const resp = session.takeAction(1, 'traveling-players')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmPlayerSwitch')
    if (resp.pending.type !== 'confirmPlayerSwitch') return
    expect(resp.pending.fromPlayerIndex).toBe(1)
    expect(resp.pending.toPlayerIndex).toBe(0)
    const grantedLog = resp.state.log.find((entry) => entry.key === 'log.cardGrantedAction')
    expect(grantedLog?.params?.player).toBe(resp.state.players[0]!.name)
  })

  it('full flow: switch to owner, skip optional choice, switch back', () => {
    const session = setup()

    let resp = session.takeAction(1, 'traveling-players')
    expect(resp.pending).toMatchObject({
      type: 'confirmPlayerSwitch',
      fromPlayerIndex: 1,
      toPlayerIndex: 0,
    })

    resp = session.confirmPlayerSwitch()
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.playerIndex).toBe(0)

    // First choice: optional "do or skip" wrapping the XOR
    resp = session.resolveChoice(0, '__skip__')
    // Switch-back happens automatically (no choice follows), so we go straight to confirmNextPlayer
    expect(resp.pending.type).toBe('confirmNextPlayer')
  })

  it('owner can choose Build Rooms (construct) from the XOR choice', () => {
    const session = setup()

    let resp = session.takeAction(1, 'traveling-players')
    expect(resp.pending).toMatchObject({
      type: 'confirmPlayerSwitch',
      fromPlayerIndex: 1,
      toPlayerIndex: 0,
    })

    resp = session.confirmPlayerSwitch()
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    // First choice: optional wrapping — pick any non-skip to activate the XOR
    const activateOption = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    expect(activateOption).toBeDefined()
    resp = session.resolveChoice(0, activateOption!.value)

    // Second choice: the XOR with fence, stables, construct
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    const xorOptions = resp.pending.options?.filter((o: any) => o.value !== '__skip__') ?? []
    expect(xorOptions.length).toBe(3) // fence, stables, construct

    // Choose construct (find it by label)
    const constructOption = xorOptions.find((o: any) => o.labelKey?.includes('construct'))
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('farmSelect')
    if (resp.interaction.stateId !== 'farmSelect') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return
    expect(resp.interaction.farm.maxSelections).toBe(1)

    // Build a room
    resp = session.commitFarmChoice(0, 'room', { rooms: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)

    // Switch-back happens automatically (no choice follows), so we go straight to confirmNextPlayer
    expect(resp.pending.type).toBe('confirmNextPlayer')
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
    expect(resp.pending.type).not.toBe('confirmPlayerSwitch')
  })

  it('does not trigger for non-matching action spaces', () => {
    const session = setup()
    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    // No player switch should happen for a different space
    expect(resp.pending.type).not.toBe('confirmPlayerSwitch')
  })
})
