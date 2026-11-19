import { describe, it, expect } from 'vitest'
import {
  wmSession,
  wmId as id,
  wmOk,
  wmAction,
  wmChoose,
  wmPayment,
  wmEndRound,
  wmConfirmations,
  wmRestore,
} from './_helpers/classic-wm-session'
import { playOccupation, sessionOptions } from './_helpers/card-regression-session'
import { getActionSpaceAttachments } from '../../shared/cards/helpers/card-state'

const pickPayment = (
  session: ReturnType<typeof wmSession>,
  response: ReturnType<typeof wmOk>,
  predicate?: (text: string) => boolean,
) => {
  const option = sessionOptions(response).find(
    (o) =>
      !o.disabled &&
      o.labelKey === 'prompt.selectPaymentOption' &&
      (!predicate || predicate(JSON.stringify(o))),
  )
  return option ? wmChoose(session, response, option.value) : wmPayment(session, response)
}

describe('WM compound effects through four-player sessions', () => {
  it('Expert Builder collects an opponent payment and spends the stored resource on an actual room', () => {
    const session = wmSession([18], (state) => {
      state.currentPlayerIndex = 1
      Object.assign(state.players[1]!.resources, { wood: 5, reed: 2 })
      Object.assign(state.players[0]!.resources, { wood: 5, reed: 1 })
    })
    let r = wmOk(session.takeAction(1, 'farm-expansion'))
    if (sessionOptions(r).some((o) => o.labelKey === 'actions.construct.name'))
      r = wmAction(session, r, 'actions.construct.name')
    r = wmPayment(session, wmOk(session.commitSelectionChoice(1, { rooms: [{ row: 0, col: 0 }] })))
    r = wmAction(session, r, 'resources.reed')
    expect(r.state.players[0]!.cardStates[id(18)]!.counters!.reed).toBe(1)
    expect(r.state.players[1]!.resources.reed).toBe(0)
    session.state.currentPlayerIndex = 0
    session.state.actionSpaces.find((s) => s.id === 'farm-expansion')!.takenBy = []
    session.loadState(session.state)
    r = wmOk(session.takeAction(0, 'farm-expansion'))
    if (sessionOptions(r).some((o) => o.labelKey === 'actions.construct.name'))
      r = wmAction(session, r, 'actions.construct.name')
    r = pickPayment(
      session,
      wmOk(session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })),
    )
    expect(r.state.players[0]!.rooms, JSON.stringify(r.interaction)).toBe(3)
    expect(r.state.players[0]!.cardStates[id(18)]!.counters!.reed).toBe(0)
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })
  it('Mailman persists four distinct bundles and transfers food between the visitor and the owner', () => {
    let session = wmSession(
      [35],
      (state) => {
        state.players[1]!.resources.food = 1
      },
      false,
    )
    let r = wmPayment(session, playOccupation(session, id(35)))
    for (const [index, space] of ['day-laborer', 'forest', 'clay-pit', 'reed-bank'].entries()) {
      r = wmChoose(session, r, 'place:' + space)
      if (index === 1) {
        session = wmRestore(session)
        r = wmOk(session.getState())
      }
    }
    expect(getActionSpaceAttachments(r.state.players[0]!, id(35))).toHaveLength(4)
    r = wmConfirmations(session, r)
    r = wmOk(session.takeAction(1, 'day-laborer'))
    r = wmAction(session, r, 'actions.pay.name')
    expect(r.state.players[1]!.resources).toMatchObject({ wood: 2, food: 2 })
    expect(r.state.players[0]!.resources.food).toBe(1)
    expect(getActionSpaceAttachments(r.state.players[0]!, id(35))).toHaveLength(3)
    expect(wmOk(session.undoAction()).state.players[1]!.resources).toMatchObject({
      wood: 0,
      food: 1,
    })
  })
  it('Resource Lender schedules all taken resources plus one bonus, resumes pending ordering, and pays on the next round', () => {
    let session = wmSession([43])
    let r = wmOk(session.takeAction(0, 'forest'))
    r = wmAction(session, r, 'resources.wood')
    r = wmChoose(session, r, 'wood')
    session = wmRestore(session)
    r = wmOk(session.getState())
    for (let n = 0; n < 3; n++) r = wmChoose(session, r, 'wood')
    expect(r.state.players[0]!.resources.wood).toBe(0)
    expect(r.state.futureMeeples.filter((e) => e.cardId === id(43)).map((e) => e.round)).toEqual([
      2, 3, 4, 5,
    ])
    r = wmConfirmations(session, wmEndRound(session, 1))
    expect(r.state.round).toBe(2)
    expect(r.state.players[0]!.resources.wood).toBe(1)
  })
  it('Rotherham Plow creates two legal nonadjacent fields and rejects a diagonal second field', () => {
    const session = wmSession([105], (state) => {
      state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    })
    let r = wmOk(session.takeAction(0, 'farmland'))
    const option = sessionOptions(r).find((o) => !o.disabled && JSON.stringify(o).includes(id(105)))
    if (option) r = wmChoose(session, r, option.value)
    r = wmOk(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    expect(r.state.players[0]!.fields).toHaveLength(2)
    expect(session.commitSelectionChoice(0, { tile: { row: 1, col: 2 } }).ok).toBe(false)
    r = wmOk(session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } }))
    expect(r.state.players[0]!.fields).toHaveLength(3)
    expect(wmOk(session.undoAction()).state.players[0]!.fields).toHaveLength(1)
  })
  it('Downsizing removes one room and pays only one wood for four fence edges, once', () => {
    const session = wmSession([75], (state) => {
      state.roundActionOrder[0] = 'fencing'
      state.players[0]!.resources.wood = 1
    })
    let r = wmOk(session.takeAction(0, 'fencing'))
    r = wmAction(session, r, 'actions.selection.name')
    r = wmOk(session.commitSelectionChoice(0, { positions: ['2-0'] }))
    expect(r.state.players[0]!.rooms).toBe(1)
    r = wmPayment(
      session,
      wmOk(session.commitSelectionChoice(0, { edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'] })),
    )
    expect(r.state.players[0]!.resources.wood).toBe(0)
    expect(r.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(wmOk(session.undoAction()).state.players[0]!.rooms).toBe(2)
  })
  it('Remodeler returns a stable, adds a free room, and renovates all three rooms for their new cost', () => {
    const session = wmSession([42], (state) => {
      state.roundActionOrder[0] = 'house-redevelopment'
      state.players[0]!.stableTiles = [{ row: 0, col: 1 }]
      Object.assign(state.players[0]!.resources, { clay: 3, reed: 1 })
    })
    let r = wmOk(session.takeAction(0, 'house-redevelopment'))
    r = wmAction(session, r, 'actions.selection.name')
    r = wmOk(session.commitSelectionChoice(0, { positions: ['0-1'] }))
    r = wmPayment(session, wmOk(session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })))
    expect(r.state.players[0]!.rooms, JSON.stringify(r.interaction)).toBe(3)
    expect(r.state.players[0]!.houseType).toBe('clay')
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
    expect(r.state.players[0]!.stableTiles).toHaveLength(0)
  })
})
