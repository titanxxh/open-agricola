import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/B/B178_TagAlong'

const CARD_ID = 'B178_TagAlong'

const setup = (options: {
  currentPlayerIndex?: number
  ownerWorkersAtHome?: number
  enableFarmersOfTheMoor?: boolean
  ownerSickWorkerIds?: string[]
} = {}) => {
  const session = new GameSession(42, undefined, {
    playerCount: 5,
    enableFarmersOfTheMoor: options.enableFarmersOfTheMoor === true,
  })
  const state = session.getState().state
  state.currentPlayerIndex = options.currentPlayerIndex ?? 1
  state.round = 1
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const owner = state.players[0]!
  const trigger = state.players[1]!
  owner.occupationPlayed.push(CARD_ID)
  owner.resources.wood = 0
  owner.resources.reed = 0
  owner.resources.stone = 0
  trigger.resources.wood = 0
  trigger.resources.reed = 0
  trigger.resources.stone = 0
  setWorkersAtHome(state, owner, options.ownerWorkersAtHome ?? 2)
  if (options.ownerSickWorkerIds) owner.sickWorkerIds = [...options.ownerSickWorkerIds]
  setWorkersAtHome(state, trigger, 2)
  session.loadState(state)
  return session
}

const isConfirmSwitchToOwner = (resp: ReturnType<GameSession['getState']>) =>
  resp.interaction.stateId === 'wait' &&
  resp.interaction.request.kind === 'confirm-player-switch' &&
  resp.interaction.request.toPlayerIndex === 0

describe('B178 Tag-Along session', () => {
  it('lets the owner follow another player onto occupied Resource Market 5/6 and take the action', () => {
    const session = setup()

    let resp = session.takeAction(1, 'resource-market-56')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.playerIndex).toBe(1)
    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    const owner = resp.state.players[0]!
    const trigger = resp.state.players[1]!
    expect(owner.resources).toMatchObject({ reed: 1, wood: 1, stone: 1 })
    expect(trigger.resources).toMatchObject({ reed: 1, wood: 1, stone: 1 })
    expect(workersAvailable(resp.state, owner)).toBe(1)
    expect(workersAvailable(resp.state, trigger)).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'resource-market-56')?.takenBy).toEqual([
      { playerId: trigger.id, workerId: '1' },
      { playerId: owner.id, workerId: '1' },
    ])
  })

  it('does not trigger for owner self-use, non-Resource-Market actions, or no owner worker', () => {
    expect(isConfirmSwitchToOwner(setup({ currentPlayerIndex: 0 }).takeAction(0, 'resource-market-56'))).toBe(false)
    expect(isConfirmSwitchToOwner(setup().takeAction(1, 'day-laborer'))).toBe(false)
    expect(isConfirmSwitchToOwner(setup({ ownerWorkersAtHome: 0 }).takeAction(1, 'resource-market-56'))).toBe(false)
  })

  describe('Farmers of the Moor', () => {
    const tagAlongPlacements = (resp: ReturnType<GameSession['getState']>) =>
      resp.state.events.filter((event) => event.type === 'worker.placed' && event.viaCardId === CARD_ID)

    it('follows with a healthy person instead of the lowest-numbered sick one', () => {
      const session = setup({ enableFarmersOfTheMoor: true, ownerSickWorkerIds: ['1'] })

      let resp = session.takeAction(1, 'resource-market-56')
      expect(resp.ok, resp.error).toBe(true)
      expect(isConfirmSwitchToOwner(resp)).toBe(true)
      resp = confirmPlayerSwitch(session)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(accept).toBeDefined()

      resp = session.resolveChoice(0, accept!.value)
      expect(resp.ok, resp.error).toBe(true)
      const owner = resp.state.players[0]!
      const trigger = resp.state.players[1]!
      expect(owner.resources).toMatchObject({ reed: 1, wood: 1, stone: 1 })
      expect(owner.sickWorkerIds).toEqual(['1'])
      expect(resp.state.actionSpaces.find((space) => space.id === 'resource-market-56')?.takenBy).toEqual([
        { playerId: trigger.id, workerId: '1' },
        { playerId: owner.id, workerId: '2' },
      ])
      expect(tagAlongPlacements(resp).map((event) => event.workerId)).toEqual(['2'])
    })

    it('does not offer to follow when only a sick person is at home', () => {
      // setWorkersAtHome parks person 1 elsewhere, so person 2 is the one at home.
      const session = setup({ enableFarmersOfTheMoor: true, ownerWorkersAtHome: 1, ownerSickWorkerIds: ['2'] })

      const resp = session.takeAction(1, 'resource-market-56')

      expect(resp.ok, resp.error).toBe(true)
      expect(isConfirmSwitchToOwner(resp)).toBe(false)
      const owner = resp.state.players[0]!
      expect(owner.resources).toMatchObject({ reed: 0, wood: 0, stone: 0 })
      expect(resp.state.actionSpaces.find((space) => space.id === 'resource-market-56')?.takenBy).toEqual([
        { playerId: resp.state.players[1]!.id, workerId: '1' },
      ])
      expect(tagAlongPlacements(resp)).toEqual([])
    })
  })
})
