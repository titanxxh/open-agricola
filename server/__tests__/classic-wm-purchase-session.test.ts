import { describe, expect, it } from 'vitest'
import {
  wmAction,
  wmConfirmations,
  wmEndRound,
  wmId as id,
  wmPayment,
  wmSession
  } from './_helpers/classic-wm-session'
import { playOccupation } from './_helpers/card-regression-session'
import { workersAvailable, familySize, inactiveWorkersInSupply } from '../../shared/domain/player'

describe('WM purchase preparation and scheduled family members in four-player sessions', () => {
  it('Family Planner reserves three supply workers and releases the first only on its scheduled round', () => {
    const session = wmSession([19], undefined, false)
    wmPayment(session, playOccupation(session, id(19)))
    expect(inactiveWorkersInSupply(session.state.players[0]!)).toHaveLength(0)
    expect(session.state.players[0]!.cardStates[id(19)]!.extraData!.schedule).toEqual([
      { round: 5, workerId: '3' },
      { round: 8, workerId: '4' },
      { round: 11, workerId: '5' },
    ])
    wmConfirmations(session, wmEndRound(session, 4))
    expect(inactiveWorkersInSupply(session.state.players[0]!)).toHaveLength(1)
    expect(familySize(session.state.players[0]!)).toBe(2)
  })
  it('Lady in Waiting admits a roomless adult in round twelve and charges exactly two food', () => {
    const session = wmSession([33], undefined, false)
    wmPayment(session, playOccupation(session, id(33)))
    const before = familySize(session.state.players[0]!)
    let response = wmConfirmations(session, wmEndRound(session, 11))
    response = wmAction(session, response, 'actions.activate-card-effect.name')
    response = wmPayment(session, response)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
    expect(
      response.state.players[0]!.workers.filter((w) => w.isActive).every((w) => !w.isNewborn),
    ).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(34)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(3)
  })
})
