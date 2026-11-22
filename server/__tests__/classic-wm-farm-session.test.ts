import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { describe, expect, it } from 'vitest'
import { playMinor, playOccupation, sessionOptions } from './_helpers/card-regression-session'
import {
  wmAction,
  wmBonus,
  wmChoose,
  wmEvent,
  wmId as id,
  wmOk,
  wmPayment,
  wmSession
} from './_helpers/classic-wm-session'

// Four-player fixtures fix hands before loading. Exercise public commands,
// verify resource and board deltas, persistent choices and negative triggers.
describe('WM farm construction and collection reactions', () => {
  it('Fence Dealer pays two wood for four edges and undo restores the payment', () => {
    const session = wmSession([21], (state) => {
      state.roundActionOrder[0] = 'fencing'
      state.players[0]!.resources.wood = 2
    })
    wmOk(session.takeAction(0, 'fencing'))
    const response = wmPayment(
      session,
      session.commitSelectionChoice(0, { edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'] }),
    )
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(wmOk(session.undoAction()).state.players[0]!.resources.wood).toBe(2)
  })
  it('Food Connoisseur takes the stack top and preserves its order through reload', () => {
    const session = wmSession([22], undefined, false)
    wmPayment(session, playOccupation(session, id(22)))
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    const response = wmOk(session.takeAction(0, 'day-laborer'))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 1 })
    expect(response.state.players[0]!.cardStates[id(22)]!.stack).toEqual([
      'clay',
      'vegetable',
      'stone',
      'grain',
      'wood',
    ])
    wmEvent(response, 22)
  })
  it.each([2, 3])(
    'Gem Hunter takes one stone on a %i clay pile, paying clay only for the large early pile',
    (clay) => {
      const session = wmSession([24], (state) => {
        state.actionSpaces.find((s) => s.id === 'clay-pit')!.resources.clay = clay
      })
      let response = wmOk(session.takeAction(0, 'clay-pit'))
      if (clay >= 3) response = wmAction(session, response, 'actions.return-to-space.name')
      expect(response.state.players[0]!.resources).toMatchObject({
        clay: clay >= 3 ? clay - 1 : clay,
        stone: 1,
      })
      expect(response.state.actionSpaces.find((s) => s.id === 'clay-pit')!.resources.clay).toBe(
        clay >= 3 ? 1 : 0,
      )
    },
  )
  it('Silo Girl schedules alternating crops only after living in stone, including play in a stone house', () => {
    const session = wmSession(
      [44],
      (state) => {
        state.round = 11
        state.players[0]!.houseType = 'stone'
      },
      false,
    )
    const response = wmPayment(session, playOccupation(session, id(44)))
    expect(
      response.state.futureMeeples
        .filter((e) => e.cardId === id(44))
        .map((e) => ({ round: e.round, resources: e.resources })),
    ).toEqual([
      { round: 12, resources: { grain: 1 } },
      { round: 13, resources: { vegetable: 1 } },
      { round: 14, resources: { grain: 1 } },
    ])
    const wooden = wmSession([44], undefined, false)
    expect(
      wmPayment(wooden, playOccupation(wooden, id(44))).state.futureMeeples.some(
        (e) => e.cardId === id(44),
      ),
    ).toBe(false)
  })
  const deliveryman = () => {
    const session = wmSession([45], (state) => {
      state.round = 6
      state.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }]
    }, false)
    return { session, response: wmPayment(session, playOccupation(session, id(45))) }
  }
  const offeredRounds = (response: ReturnType<typeof wmOk>) =>
    sessionOptions(response).filter((o) => /^stable:\d+$/.test(o.value)).map((o) => o.value)
  const deliveries = (response: ReturnType<typeof wmOk>) =>
    response.state.futureMeeples.filter((e) => e.cardId === id(45)).map((e) => e.round)
  it('Stable Deliveryman lets the player pick target rounds until the two remaining stable pieces are reserved', () => {
    const { session, response: played } = deliveryman()
    expect(offeredRounds(played)).toEqual(['stable:9', 'stable:11', 'stable:13'])
    const picked = wmChoose(session, played, 'stable:13')
    expect(offeredRounds(picked)).toEqual(['stable:9', 'stable:11'])
    const response = wmChoose(session, picked, 'stable:9')
    expect(offeredRounds(response)).toEqual([])
    expect(deliveries(response)).toEqual([13, 9])
  })
  it('Stable Deliveryman can stop early, keeping unselected pieces in the supply', () => {
    const { session, response: played } = deliveryman()
    const response = wmChoose(session, wmChoose(session, played, 'stable:11'), 'stable:stop')
    expect(deliveries(response)).toEqual([11])
    expect(session.withCtx(() => getAvailableStableSupplyCount(session.state, session.state.players[0]!))).toBe(1)
  })
  it('Changing Plans returns a stable, plows a field and passes the card', () => {
    const session = wmSession([69], (state) => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }] }, false)
    wmPayment(session, playMinor(session, id(69)))
    let response = wmOk(session.commitSelectionChoice(0, { positions: ['0-1'] }))
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    wmChoose(session, response, sessionOptions(response).find((o) => !o.disabled && o.value !== '__skip__')!.value)
    response = wmOk(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[1]!.minorHand).toContain(id(69))
    expect(wmOk(session.undoAction()).state.players[0]!.stableTiles).toHaveLength(1)
  })
  it('Changing Plans may return a stable and decline its field', () => {
    const session = wmSession([69], (state) => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }] }, false)
    wmPayment(session, playMinor(session, id(69)))
    const response = wmChoose(session, wmOk(session.commitSelectionChoice(0, { positions: ['0-1'] })), '__skip__')
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.state.players[1]!.minorHand).toContain(id(69))
  })
  it('Raspberries leaves food on unused spaces, then pays only when the marked tile becomes used', () => {
    const session = wmSession(
      [103],
      (state) => {
        state.players[0]!.resources.clay = 1
        state.players[0]!.occupationPlayed = ['__1__', '__2__']
      },
      false,
    )
    let response = wmPayment(session, playMinor(session, id(103)))
    response = wmAction(session, response, 'actions.selection.name')
    response = wmOk(session.commitSelectionChoice(0, { positions: ['0-1', '0-2'] }))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(2)
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    wmOk(session.takeAction(0, 'farmland'))
    response = wmOk(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(1)
    wmEvent(response, 103)
  })
  it('Gold Medal compares base scores, includes tied opponents and excludes unrelated card bonuses', () => {
    const session = wmSession(
      [87],
      (state) => {
        state.players[0]!.resources.grain = 9
        state.players[1]!.resources.grain = 8
        state.players[2]!.resources.grain = 7
      },
      false,
    )
    const response = wmChoose(session, wmPayment(session, playMinor(session, id(87))), 'grains')
    expect([0, 1, 2, 3].map((seat) => wmBonus(response, 87, seat))).toEqual([2, 2, 0, 0])
  })
  it('Borrower gains seven food and two markers, repays only eligible markers and persists the repayment', () => {
    const session = wmSession([6], undefined, false)
    let response = wmPayment(session, playOccupation(session, id(6)))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, begging: 2 })
    const action = response.interaction.anytimeActions.find((a) => a.sourceCard === id(6))!
    expect(action).toBeDefined()
    response = wmPayment(session, session.takeAnytimeAction(0, action.id))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, begging: 1 })
    session.loadState(session.state)
    const next = session.getState().interaction.anytimeActions.find((a) => a.sourceCard === id(6))!
    response = wmPayment(session, session.takeAnytimeAction(0, next.id))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, begging: 0 })
    expect(response.interaction.anytimeActions.some((a) => a.sourceCard === id(6))).toBe(false)
  })
})
