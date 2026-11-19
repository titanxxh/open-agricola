import { describe, expect, it } from 'vitest'
import { playMinor, playOccupation, sessionOptions } from './_helpers/card-regression-session'
import {
  wmAction,
  wmBonus,
  wmChoose,
  wmConfirmations,
  wmEndRound,
  wmEvent,
  wmId as id,
  wmOk,
  wmPayment,
  wmSession,
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
  it('Stable Deliveryman reserves only the two remaining stable pieces and schedules no past-final-round entries', () => {
    const session = wmSession(
      [45],
      (state) => {
        state.round = 6
        state.players[0]!.stableTiles = [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ]
      },
      false,
    )
    const response = wmPayment(session, playOccupation(session, id(45)))
    expect(
      response.state.futureMeeples.filter((e) => e.cardId === id(45)).map((e) => e.round),
    ).toEqual([9, 11])
  })
  it('Wheelbarrow Pusher grants both a chosen building resource and food in four players', () => {
    const session = wmSession([54])
    let response = wmOk(session.takeAction(0, 'clay-pit'))
    const stone = sessionOptions(response).find((o) => JSON.stringify(o).includes('stone'))!
    response = wmChoose(session, response, stone.value)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, stone: 1, food: 1 })
    wmEvent(response, 54)
    const larger = wmSession([54], (state) => {
      state.actionSpaces.find((s) => s.id === 'clay-pit')!.resources.clay = 2
    })
    expect(wmOk(larger.takeAction(0, 'clay-pit')).state.players[0]!.resources.food).toBe(0)
  })
  it('Changing Plans returns a stable, plows a field and passes the card', () => {
    const session = wmSession(
      [69],
      (state) => {
        state.players[0]!.stableTiles = [{ row: 0, col: 1 }]
      },
      false,
    )
    wmPayment(session, playMinor(session, id(69)))
    let response = wmOk(session.commitSelectionChoice(0, { positions: ['0-1'] }))
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    response = wmOk(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[1]!.minorHand).toContain(id(69))
    expect(wmOk(session.undoAction()).state.players[0]!.stableTiles).toHaveLength(1)
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
  it('Fish Hook collects the actual fishing food through an adjacent space without draining other goods', () => {
    const session = wmSession([80], (state) => {
      state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food = 3
    })
    const response = wmAction(session, wmOk(session.takeAction(0, 'day-laborer')), 'actions.collect.name')
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food).toBe(2)
    wmEvent(response, 80)
    const empty = wmSession([80], (state) => {
      state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food = 0
    })
    expect(wmOk(empty.takeAction(0, 'day-laborer')).state.players[0]!.resources.food).toBe(2)
  })
  it('Edible Roots rewards an emptied field during a real harvest but not a still-planted field', () => {
    const session = wmSession([77], (state) => {
      state.players[0]!.fields = [
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
        { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      ]
    })
    const response = wmConfirmations(session, wmEndRound(session, 4))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 37 })
    wmEvent(response, 77)
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
