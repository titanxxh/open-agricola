import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'
import type { ActionChoiceOption,  PlayerState } from '../../shared/game/types.ts'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A128_RiparianBuilder'
import '../../shared/cards/__stubs__/Stub_Construct_TrueAction'

const CARD_ID = 'A128_RiparianBuilder'

describe('A128_RiparianBuilder session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.houseType = 'clay'
    owner.rooms = 2
    owner.resources = { ...owner.resources, wood: 5, clay: 10, reed: 6 }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
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
    // The listener fires on `after place-farmer` for the opponent's owner —
    // the owner's per-card stats now record `used` immediately. The acting
    // player (players[1]) is not the listener owner, so their copy stays empty.
    expect(resp.state.players[0]!.cardStates?.A128_RiparianBuilder?.extraData)
      .toMatchObject({ resourceStats: { used: 1 } })
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
      ? resp.pending.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      : undefined
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('farmSelect')
    if (resp.interaction.stateId !== 'farmSelect') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return
    // maxSelections=1 enforces the room cap on the engine path; an oversized
    // attempt fails (engine clears pending), so we directly build a single
    // room — the structural cap is already asserted via maxSelections above.
    expect(resp.interaction.farm.maxSelections).toBe(1)

    // Build a room
    resp = session.resolveChoice(0, 'confirm', { rooms: [{ row: 0, col: 0 }] })
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

    const constructOption = resp.pending.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('farmSelect')

    resp = session.resolveChoice(0, 'confirm', { rooms: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.Stub_Construct_TrueAction?.counters?.observedCount).toBeUndefined()
  })

  it('preserves sourceCard when granted construct enters room payment choice', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.houseType = 'stone'
    owner.resources = { ...owner.resources, wood: 1, stone: 5, reed: 2, clay: 0 }
    owner.occupationPlayed.push('A123_FrameBuilder')
    owner.activeModifiers = [
      ...((A123_FrameBuilder as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? []),
    ]
    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.pending.type).toBe('confirmPlayerSwitch')

    resp = session.confirmPlayerSwitch()
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.sourceCard).toBe(CARD_ID)
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)

    const constructOption = resp.pending.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('farmSelect')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)
    if (resp.interaction.stateId !== 'farmSelect') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return
    expect(resp.interaction.farm.maxSelections).toBe(1)

    const room = resp.interaction.farm.selectableTiles[0]!
    resp = session.resolveChoice(0, 'confirm', { rooms: [room] })
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    expect(resp.pending.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('choice')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)
    expect(resp.pending.options).toHaveLength(2)
  })
})
