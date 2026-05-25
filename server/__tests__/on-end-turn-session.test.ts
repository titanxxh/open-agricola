import { beforeEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { clearActionHooks } from '../../shared/actions/hooks'
import { incCounter } from '../../shared/cards/__stubs__/helpers'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A128_RiparianBuilder'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const TEST_END_TURN_CARD = 'TEST_OnEndTurnCounter'

const registerCounterEffect = () => {
  requireActiveCardRegistry('on-end-turn-session').setEffect({
    id: TEST_END_TURN_CARD,
    onEndTurn: (_state, player) => {
      if (!player.minorPlayed.includes(TEST_END_TURN_CARD)) return
      incCounter(player, TEST_END_TURN_CARD, 'observedCount')
    },
  } as any)
}

describe('onEndTurn session', () => {
  beforeEach(() => {
    clearActionHooks()
    registerCounterEffect()
  })

  it('fires before confirmNextPlayer on a normal worker placement turn', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push(TEST_END_TURN_CARD)

    session.loadState(state)
    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.cardStates?.[TEST_END_TURN_CARD]?.counters?.observedCount).toBe(1)
  })

  it('does not fire during an intermediate confirmPlayerSwitch', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('A128_RiparianBuilder')
    owner.houseType = 'clay'
    owner.rooms = 2
    owner.resources = { ...owner.resources, wood: 5, clay: 10, reed: 6 }
    owner.minorPlayed.push(TEST_END_TURN_CARD)

    const actor = state.players[1]!
    setWorkersAtHome(state, actor, 2)
    actor.minorPlayed.push(TEST_END_TURN_CARD)

    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 3

    session.loadState(state)

    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
    expect(resp.state.players[0]!.cardStates?.[TEST_END_TURN_CARD]?.counters?.observedCount).toBeUndefined()

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[1]!.cardStates?.[TEST_END_TURN_CARD]?.counters?.observedCount).toBeUndefined()

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.cardStates?.[TEST_END_TURN_CARD]?.counters?.observedCount).toBeUndefined()
    expect(resp.state.players[1]!.cardStates?.[TEST_END_TURN_CARD]?.counters?.observedCount).toBe(1)
  })

  it('waits until action-scoped animal reorg resolves', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push(TEST_END_TURN_CARD)

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.cardStates?.[TEST_END_TURN_CARD]?.counters?.observedCount).toBeUndefined()

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.cardStates?.[TEST_END_TURN_CARD]?.counters?.observedCount).toBe(1)
  })
})
