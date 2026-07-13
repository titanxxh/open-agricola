import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'
import type { ActionChoiceOption, PlayerState } from '../../shared/contract/types.ts'

import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/A/A128_RiparianBuilder'
import '../../shared/cards/__stubs__/Stub_Construct_TrueAction'

const CARD_ID = 'A128_RiparianBuilder'

const optionSourceCards = (option: ActionChoiceOption): string[] => {
  const preview = option.effectPreview as { sourceCards?: string[] } | undefined
  return preview?.sourceCards ?? []
}

const chooseA128RoomPayment = (
  session: GameSession,
  playerIndex: number,
  resp: ReturnType<GameSession['commitSelectionChoice']>,
) => {
  expect(resp.ok).toBe(true)
  // ADR 0004 amendment: the dominated undiscounted room payment is pruned;
  // the sourced discount is the single option and the payment auto-resolves
  // straight into the next wait state.
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const paymentOption = resp.interaction.request.options?.find((option: ActionChoiceOption) =>
      optionSourceCards(option).includes(CARD_ID),
    )
    expect(paymentOption).toBeDefined()
    return session.resolveChoice(playerIndex, paymentOption!.value)
  }
  return resp
}

describe('A128_RiparianBuilder session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
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
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')) return
    expect(resp.interaction.request.fromPlayerIndex).toBe(1)
    expect(resp.interaction.request.toPlayerIndex).toBe(0)
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
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
      expect(resp.interaction.request.fromPlayerIndex).toBe(1)
      expect(resp.interaction.request.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('limits the granted construct to one room and switches back after building', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
      expect(resp.interaction.request.fromPlayerIndex).toBe(1)
      expect(resp.interaction.request.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')

    // Choose to construct
    const constructOption = resp.interaction.stateId === 'wait'
      ? resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      : undefined
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    if (resp.interaction.request.farm.farmType !== 'room') return
    // maxSelections=1 enforces the room cap on the engine path; an oversized
    // attempt fails (engine clears pending), so we directly build a single
    // room — the structural cap is already asserted via maxSelections above.
    expect(resp.interaction.request.farm.maxSelections).toBe(1)

    // Build a room
    resp = chooseA128RoomPayment(
      session,
      0,
      session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] }),
    )
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[1]!.rooms).toBe(2)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('records saved clay instead of paid resources after granted clay-room construct', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    if (resp.interaction.request.farm.farmType !== 'room') return

    const room = resp.interaction.request.farm.selectableTiles[0]!
    resp = chooseA128RoomPayment(
      session,
      0,
      session.commitSelectionChoice(0, { rooms: [room] }),
    )

    expect(resp.ok).toBe(true)
    const stats = readCardResourceStats(resp.state.players[0]!, CARD_ID)
    expect(stats?.saved).toEqual({ clay: 1 })
    expect(stats?.paid).toEqual({})
  })

  it('records saved stone after granted stone-room construct', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.houseType = 'stone'
    owner.resources = { ...owner.resources, wood: 0, clay: 0, stone: 5, reed: 2 }
    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    if (resp.interaction.request.farm.farmType !== 'room') return

    const room = resp.interaction.request.farm.selectableTiles[0]!
    resp = chooseA128RoomPayment(
      session,
      0,
      session.commitSelectionChoice(0, { rooms: [room] }),
    )

    expect(resp.ok).toBe(true)
    const stats = readCardResourceStats(resp.state.players[0]!, CARD_ID)
    expect(stats?.saved).toEqual({ stone: 2 })
    expect(stats?.paid).toEqual({})
  })

  it('marks the gifted construct as non-trueAction for later listeners', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('Stub_Construct_TrueAction')
    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')

    resp = chooseA128RoomPayment(
      session,
      0,
      session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] }),
    )
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
      ...(A123_FrameBuilder.impl.modifiers ?? []),
    ]
    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)

    const constructOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    if (resp.interaction.request.farm.farmType !== 'room') return
    expect(resp.interaction.request.farm.maxSelections).toBe(1)

    const room = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)
    expect(resp.interaction.request.options?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(resp.interaction.request.options?.some((option: ActionChoiceOption) =>
      optionSourceCards(option).includes(CARD_ID),
    )).toBe(true)
  })

  it('re-enters room selection after undoing the granted construct choice', () => {
    const session = setup()

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    let constructOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('room')

    resp = session.undoStep()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionRiparianBuilderConstruct')

    constructOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('farm-select')
    expect(resp.interaction.request.farm.farmType).toBe('room')
  })
})
