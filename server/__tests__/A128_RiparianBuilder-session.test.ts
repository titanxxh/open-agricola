import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/A/A128_RiparianBuilder'
import '../../shared/cards/__stubs__/Stub_Construct_TrueAction'

describe('A128_RiparianBuilder session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('A128_RiparianBuilder')
    owner.playedCards.push('occupation:A128_RiparianBuilder')
    owner.houseType = 'clay'
    owner.rooms = 2
    owner.resources = { ...owner.resources, wood: 5, clay: 10, reed: 6 }

    const opponent = state.players[1]!
    opponent.workersAvailable = 2

    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 3

    session.loadState(state)
    return session
  }

  it('triggers when an opponent uses the reed-bank accumulation space', () => {
    const session = setup()
    const resp = session.takeAction(1, 'reed-bank')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmPlayerSwitch')
    if (resp.pending.type !== 'confirmPlayerSwitch') return
    expect(resp.pending.fromPlayerIndex).toBe(1)
    expect(resp.pending.toPlayerIndex).toBe(0)
    expect(resp.state.players[0]!.cardStates?.A128_RiparianBuilder).toBeUndefined()
    expect(resp.state.players[1]!.cardStates?.A128_RiparianBuilder).toBeUndefined()
    const grantedLog = resp.state.log.find((entry) => entry.key === 'log.cardGrantedAction')
    expect(grantedLog?.params?.player).toBe(resp.state.players[0]!.name)
  })

  it('full flow: switch to owner, skip construct, switch back', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.pending).toMatchObject({
      type: 'confirmPlayerSwitch',
      fromPlayerIndex: 1,
      toPlayerIndex: 0,
    })

    resp = session.confirmPlayerSwitch()
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.playerIndex).toBe(0)

    resp = session.resolveChoice(0, '__skip__')
    // Switch-back happens automatically (no choice follows), so we go straight to confirmNextPlayer
    expect(resp.pending.type).toBe('confirmNextPlayer')
  })

  it('limits the granted construct to one room and switches back after building', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.pending).toMatchObject({
      type: 'confirmPlayerSwitch',
      fromPlayerIndex: 1,
      toPlayerIndex: 0,
    })

    resp = session.confirmPlayerSwitch()
    expect(resp.pending.type).toBe('choice')

    // Choose to construct
    const constructOption = resp.pending.type === 'choice'
      ? resp.pending.options?.find((o: any) => o.value !== '__skip__')
      : undefined
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('farmSelect')
    if (resp.interaction.stateId !== 'farmSelect') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return
    expect(resp.interaction.farm.maxSelections).toBe(1)

    resp = session.commitFarmChoice(0, 'room', {
      rooms: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    })
    expect(resp.ok).toBe(false)

    // Build a room
    resp = session.commitFarmChoice(0, 'room', { rooms: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[1]!.rooms).toBe(2)

    // Switch-back happens automatically (no choice follows), so we go straight to confirmNextPlayer
    expect(resp.pending.type).toBe('confirmNextPlayer')
  })

  it('marks the gifted construct as non-trueAction for later listeners', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('Stub_Construct_TrueAction')
    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.pending.type).toBe('confirmPlayerSwitch')

    resp = session.confirmPlayerSwitch()
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const constructOption = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('farmSelect')

    resp = session.commitFarmChoice(0, 'room', { rooms: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.Stub_Construct_TrueAction?.counters?.observedCount).toBeUndefined()
  })
})
