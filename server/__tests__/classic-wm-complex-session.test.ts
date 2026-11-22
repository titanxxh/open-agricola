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
  wmRestore
} from './_helpers/classic-wm-session'
import { playOccupation } from './_helpers/card-regression-session'
import { getActionSpaceAttachments } from '../../shared/cards/helpers/card-state'

describe('WM compound effects through four-player sessions', () => {
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
