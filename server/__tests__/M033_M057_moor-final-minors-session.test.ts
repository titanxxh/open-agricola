import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import type { SessionResponse } from '../game/authoritative-session'

describe('M033 Night Pasture', () => {
  it('breeds the Night Pasture owner after the other players', () => {
    const session = new GameSession(33057, undefined, {
      playerCount: 3,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const state = session.getState().state
    state.round = 4
    const firstGuest = state.players[0]!
    const owner = state.players[1]!
    const secondGuest = state.players[2]!
    firstGuest.name = 'FirstGuest'
    owner.name = 'Owner'
    secondGuest.name = 'SecondGuest'
    firstGuest.startPlayer = true
    owner.startPlayer = false
    secondGuest.startPlayer = false
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
      player.resources.food = 10
      player.resources.fuel = 2
      player.fields = []
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    owner.minorPlayed = ['M033_NightPasture']
    owner.cardStates = { M033_NightPasture: { extraData: {} } }
    firstGuest.resources.cattle = 2
    owner.resources.sheep = 2
    secondGuest.resources.boar = 2
    firstGuest.pastures = [{
      id: 'first-guest-pasture',
      size: 2,
      tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }],
      stables: 0,
      animalType: 'cattle',
      animalCount: 2,
    }]
    owner.pastures = [{
      id: 'owner-pasture',
      size: 2,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]
    secondGuest.pastures = [{
      id: 'second-guest-pasture',
      size: 2,
      tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 0,
      animalType: 'boar',
      animalCount: 2,
    }]
    session.loadState(state)

    const breedPlayers: string[] = []
    let resp: SessionResponse = session.performRoundEnd()
    for (let guard = 0; guard < 20 && resp.state.roundPhase !== 'work'; guard += 1) {
      if (resp.interaction.stateId !== 'wait') {
        resp = session.performRoundEnd()
        continue
      }
      const player = resp.state.players[resp.interaction.playerIndex]!
      if (resp.interaction.request.kind === 'heating') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { fuelUsed: 2, woodToFuel: 0 })
        continue
      }
      if (resp.interaction.request.kind === 'animal-reorg') {
        breedPlayers.push(player.name)
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
        continue
      }
      if (resp.interaction.request.kind === 'confirm-next-player') {
        resp = confirmNextPlayer(session)
        continue
      }
      if (resp.interaction.request.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        continue
      }
      throw new Error(`unexpected pending: ${resp.interaction.request.kind}`)
    }

    expect(breedPlayers).toEqual(['FirstGuest', 'SecondGuest', 'Owner'])
  })
})
