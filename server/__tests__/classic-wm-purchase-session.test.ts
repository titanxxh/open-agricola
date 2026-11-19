import { describe, expect, it } from 'vitest'
import {
  wmAction,
  wmChoose,
  wmConfirmations,
  wmEndRound,
  wmId as id,
  wmOk,
  wmPayment,
  wmSession,
  wmRestore,
} from './_helpers/classic-wm-session'
import { playMinor, playOccupation, sessionOptions } from './_helpers/card-regression-session'
import { workersAvailable, familySize, inactiveWorkersInSupply } from '../../shared/domain/player'

describe('WM purchase preparation and scheduled family members in four-player sessions', () => {
  it('Engineer finances a food-cost improvement before payment and undo restores the grant', () => {
    const session = wmSession([17], (state) => {
      state.players[0]!.minorHand = [id(59)]
    })
    const response = wmPayment(session, playMinor(session, id(59)))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(id(59))
    expect(
      response.state.events.filter((e) => e.type === 'resource.moved' && e.sourceCardId === id(17)),
    ).toHaveLength(1)
    const reverted = wmOk(session.undoAction())
    expect(reverted.state.players[0]!.minorHand).toContain(id(59))
    expect(reverted.state.players[0]!.resources.food).toBe(0)
  })
  it('Engineer reads printed stone costs and does not activate for an occupation', () => {
    const session = wmSession([17], (state) => {
      state.players[0]!.minorHand = [id(107)]
      state.players[0]!.resources.clay = 1
      state.players[0]!.resources.stone = 1
    })
    expect(wmPayment(session, playMinor(session, id(107))).state.players[0]!.resources.food).toBe(2)
    const occupation = wmSession([17], (state) => {
      state.players[0]!.occupationHand = [id(3)]
      state.players[0]!.resources.food = 1
    })
    expect(
      wmPayment(occupation, playOccupation(occupation, id(3))).state.players[0]!.resources.food,
    ).toBe(0)
  })
  it('Storage Shed permits only resource choices that can complete the selected purchase', () => {
    const session = wmSession([110], (state) => {
      state.players[0]!.minorHand = [id(82)]
    })
    const response = wmPayment(session, playMinor(session, id(82)))
    expect(response.state.players[0]!.minorPlayed).toContain(id(82))
    expect(response.state.players[0]!.resources).toMatchObject({
      clay: 0,
      wood: 0,
      reed: 0,
      stone: 0,
    })
    const grants = response.state.events.filter(
      (e) => e.type === 'resource.moved' && e.sourceCardId === id(110),
    )
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatchObject({ resources: { clay: 1 } })
    expect(wmOk(session.undoAction()).state.players[0]!.minorHand).toContain(id(82))
  })
  it('Storage Shed retains a freely chosen grant across reload without awarding it twice', () => {
    const session = wmSession([110], (state) => {
      state.players[0]!.minorHand = [id(82)]
      state.players[0]!.resources.clay = 1
    })
    let response = playMinor(session, id(82))
    const clay = sessionOptions(response).find((o) => JSON.stringify(o).includes('clay'))
    expect(clay, JSON.stringify(response.interaction)).toBeDefined()
    // Save/load must not award the resources twice or skip the chosen grant.
    const restored = wmRestore(session)
    response = wmPayment(restored, wmChoose(restored, restored.getState(), clay!.value))
    expect(response.state.players[0]!.minorPlayed).toContain(id(82))
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })
  it('Bargaining Baker discounts an oven and provides grain early enough to bake on purchase', () => {
    const session = wmSession([4], (state) => {
      state.players[0]!.resources.clay = 2
      state.players[0]!.resources.stone = 1
      state.roundActionOrder[0] = 'major-improvement'
    })
    let response = wmOk(session.takeAction(0, 'major-improvement'))
    response = wmChoose(session, response, 'Major_ClayOven')
    response = wmPayment(session, response)
    // If multiple cost reductions exist, choose the one affordable with the fixture.
    const payment = sessionOptions(response).find(
      (o) => !o.disabled && o.labelKey === 'actions.pay.name',
    )
    if (payment) response = wmChoose(session, response, payment.value)
    expect(response.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
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
  it('Honeymoon retains two family members for scoring and feeding but blocks their final-round placements', () => {
    const session = wmSession([90])
    const response = wmConfirmations(session, wmEndRound(session, 13))
    expect(response.state.round).toBe(14)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    session.loadState(session.state)
    expect(workersAvailable(session.state, session.state.players[0]!)).toBe(0)
  })
})
