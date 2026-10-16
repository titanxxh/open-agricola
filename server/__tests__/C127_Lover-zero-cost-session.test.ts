import { describe, expect, it } from 'vitest'
import type { SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation } from './_helpers/card-regression-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { familySize } from '../../shared/domain/player'

const CARD = 'C127_Lover'

// A real three-player Session covers mandatory payment, pending, growth and undo.
const setup = ({ round = 10, food = 4, full = false, second = false, fireplace = false, gloves = false } = {}) =>
  createWorkSession({
    seed: 1170,
    options: { playerCount: 3 },
    configure: state => {
      state.round = round
      state.players.forEach(player => {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      })
      const player = state.players[0]!
      player.occupationHand = [CARD]
      player.resources.food = food
      if (second) player.occupationPlayed = ['C135_Constable']
      if (fireplace) {
        player.improvements = ['Major_Fireplace1']
        player.resources.vegetable = 1
        state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_Fireplace1')
      }
      if (gloves) {
        player.minorPlayed = ['E060_WorkingGloves']
        player.resources.wood = 1
      }
      if (full) {
        player.rooms = 5
        player.roomTiles.push({ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 })
        player.workers.forEach(worker => { worker.isActive = true })
      }
    },
  })

const choices = (response: SessionResponse) =>
  response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
    ? response.interaction.request.options : []

const individualPayments = (response: SessionResponse) => response.state.events.filter(event =>
  event.type === 'resource.paid' && event.sourceCardId === CARD && event.paymentFor === 'cardEffect')

const expectGrown = (response: SessionResponse, food: number, begging: number) => {
  expect(response.ok, response.error).toBe(true)
  const player = response.state.players[0]!
  expect(player.occupationHand).not.toContain(CARD)
  expect(player.occupationPlayed).toContain(CARD)
  expect(player.resources).toMatchObject({ food, begging })
  expect(familySize(player)).toBe(3)
  expect(player.workers).toHaveLength(5)
  expect(player.workers.filter(worker => worker.isActive && worker.isNewborn)).toHaveLength(1)
  expect(player.rooms).toBe(2)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
}

describe('C127 Lover mandatory individual food cost', () => {
  it.each([{ round: 10, food: 4 }, { round: 13, food: 1 }, { round: 14, food: 0 }])(
    'automatically pays $food in round $round and grows without a free room', ({ round, food }) => {
      const session = setup({ round, food })
      const ids = session.getState().state.players[0]!.workers.map(worker => worker.id)
      const response = playOccupation(session, CARD)
      expectGrown(response, 0, 0)
      expect(response.state.players[0]!.workers.map(worker => worker.id)).toEqual(ids)
      expect(individualPayments(response)).toEqual(food > 0 ? [expect.objectContaining({ resources: { food } })] : [])
      session.dispose()
    },
  )

  it.each([{ food: 3, begging: 1 }, { food: 0, begging: 4 }])(
    'requires confirmation, pays available $food food, and gains $begging begging', ({ food, begging }) => {
      const session = setup({ food })
      let response = playOccupation(session, CARD)
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD, request: {
        kind: 'choice', requiresExplicitChoice: true,
      } })
      expect(choices(response)).toEqual([expect.objectContaining({ value: 'confirm', effectPreview: {
        kind: 'resourceExchange', resourcesPaid: food > 0 ? { food } : {}, resourcesGained: { begging },
      } })])
      const before = response.state
      const pending = response.interaction
      response = session.resolveChoice(0, '__skip__')
      expect(response.ok).toBe(false)
      expect(response.state).toEqual(before)
      expect(response.interaction).toEqual(pending)
      response = session.resolveChoice(0, 'confirm')
      expectGrown(response, 0, begging)
      expect(individualPayments(response)).toEqual(food > 0 ? [expect.objectContaining({ resources: { food } })] : [])
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD))
        .toEqual([expect.objectContaining({ resources: { begging }, from: { kind: 'supply' },
          to: { kind: 'player', playerId: response.state.players[0]!.id } })])
      expect(readCardResourceStats(response.state.players[0]!, CARD)).toMatchObject({
        paid: food > 0 ? { food } : {}, gained: { begging },
      })
      expect(response.scores[0]!.categories.find(category => category.key === 'beggings')?.total).toBe(-3 * begging)
      expect(response.state.log.filter(entry => entry.key === 'log.cardEffectPay' && entry.params?.cardId === CARD))
        .toHaveLength(food > 0 ? 1 : 0)
      session.dispose()
    },
  )

  it('keeps the mandatory confirmation and refreshes its preview after Fireplace cooking', () => {
    const session = setup({ food: 3, fireplace: true })
    let response = playOccupation(session, CARD)
    expect(choices(response)[0]?.effectPreview).toMatchObject({ resourcesPaid: { food: 3 }, resourcesGained: { begging: 1 } })
    expect(response.interaction.anytimeActions.map(action => action.id)).toContain('exchange')
    response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'trade:3:1')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 5, vegetable: 0, begging: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', requiresExplicitChoice: true } })
    expect(choices(response)).toEqual([expect.objectContaining({ value: 'confirm', effectPreview: {
      kind: 'resourceExchange', resourcesPaid: { food: 4 },
    } })])
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, vegetable: 1, begging: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    expect(choices(response).map(option => option.value)).toContain('trade:3:1')
    response = session.resolveChoice(0, 'trade:3:1')
    expect(response.ok, response.error).toBe(true)
    expect(choices(response)).toEqual([expect.objectContaining({ value: 'confirm', effectPreview: {
      kind: 'resourceExchange', resourcesPaid: { food: 4 },
    } })])
    response = session.resolveChoice(0, 'confirm')
    expectGrown(response, 1, 0)
    expect(individualPayments(response)).toEqual([expect.objectContaining({ resources: { food: 4 } })])
    expect(readCardResourceStats(response.state.players[0]!, CARD)).toMatchObject({ paid: { food: 4 }, gained: {} })
    session.dispose()
  })

  it('pays ordinary Lessons separately and cannot use begging for its fee', () => {
    const payable = setup({ food: 5, second: true })
    const paid = playOccupation(payable, CARD)
    expectGrown(paid, 0, 0)
    expect(paid.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === CARD))
      .toEqual([expect.objectContaining({ paymentFor: 'occupation', resources: { food: 1 } }),
        expect.objectContaining({ paymentFor: 'cardEffect', resources: { food: 4 } })])
    payable.dispose()

    const unavailable = setup({ food: 0, second: true })
    const rejected = unavailable.takeAction(0, 'lessons')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.occupationHand).toContain(CARD)
    expect(rejected.state.players[0]!.resources.begging).toBe(0)
    unavailable.dispose()
  })

  it('occupation cost substitution does not reduce the four-food individual cost', () => {
    const session = setup({ food: 0, second: true, gloves: true })
    let response = playOccupation(session, CARD)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    response = session.resolveChoice(0, 'confirm')
    expectGrown(response, 0, 4)
    expect(individualPayments(response)).toEqual([])
    expect(readCardResourceStats(response.state.players[0]!, 'E060_WorkingGloves')).toMatchObject({ paid: { wood: 1 }, saved: { food: 1 } })
    session.dispose()
  })

  it('preserves the five-person limit and undo restores the occupation', () => {
    const session = setup({ round: 14, food: 0, full: true })
    const response = playOccupation(session, CARD)
    expect(response.state.players[0]!.workers).toHaveLength(5)
    expect(familySize(response.state.players[0]!)).toBe(5)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'engine-blocked' } })
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.occupationHand).toContain(CARD)
    expect(familySize(undone.state.players[0]!)).toBe(5)
    session.dispose()
  })

  it('undo and retry restore and settle food, begging and growth once', () => {
    const session = setup({ food: 3 })
    playOccupation(session, CARD)
    const settled = session.resolveChoice(0, 'confirm')
    expectGrown(settled, 0, 1)
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.occupationHand).toContain(CARD)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 3, begging: 0 })
    expect(familySize(undone.state.players[0]!)).toBe(2)
    expect(undone.state.actionSpaces.find(space => space.id === 'lessons')?.takenBy).toEqual([])
    playOccupation(session, CARD)
    const retried = session.resolveChoice(0, 'confirm')
    expectGrown(retried, 0, 1)
    expect(readCardResourceStats(retried.state.players[0]!, CARD)).toMatchObject({ paid: { food: 3 }, gained: { begging: 1 } })
    session.dispose()
  })
})
