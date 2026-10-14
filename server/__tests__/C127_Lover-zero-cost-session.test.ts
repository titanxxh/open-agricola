import { describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation } from './_helpers/card-regression-session'

const CARD = 'C127_Lover'
const setup = (round: number, food: number, full = false) => createWorkSession({
  seed: 1170, options: { playerCount: 3 }, configure: state => {
    state.round = round
    state.players.forEach(p => { p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__'] })
    state.players[0]!.occupationHand = [CARD]
    state.players[0]!.resources.food = food
    if (full) {
      const p = state.players[0]!
      p.rooms = 5
      p.roomTiles.push({row:0,col:0},{row:0,col:1},{row:0,col:2})
      p.workers.forEach(worker => { worker.isActive = true })
    }
  },
})
const settle = (session: GameSession, response: SessionResponse, accept: boolean) => {
  let r = response
  for (let n = 0; n < 10; n++) {
    expect(r.ok,r.error).toBe(true)
    const i = r.interaction
    if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player') return r
    const q = i.request
    if (q.kind === 'engine-blocked') return r
    if (q.kind !== 'choice' && q.kind !== 'select-trigger') throw new Error(JSON.stringify(i))
    const option = q.options.find(o => !('disabled' in o && o.disabled) && (accept ? !['__skip__','__pass__'].includes(o.value) : ['__skip__','__pass__'].includes(o.value)))
    if (!option) return r // A blocked current step is allowed by ADR0015.
    r = session.resolveChoice(i.playerIndex,option.value)
  }
  throw new Error('Unfinished Lover flow')
}

describe('Lover preserves a growth reward when its food fee is zero', () => {
  it.each([{round:10,food:4},{round:13,food:1},{round:14,food:0}])('actual round $round Lessons pays $food and activates one existing newborn', ({round,food}) => {
    const session = setup(round,food)
    const ids = session.getState().state.players[0]!.workers.map(w => w.id)
    const r = settle(session,playOccupation(session,CARD),true)
    expect(r.state.players[0]!.resources.food).toBe(0)
    expect(r.state.players[0]!.workers.filter(w => w.isActive)).toHaveLength(3)
    expect(r.state.players[0]!.workers.filter(w => w.isActive && w.isNewborn)).toHaveLength(1)
    expect(r.state.players[0]!.workers.map(w => w.id)).toEqual(ids)
    expect(ids).toHaveLength(5)
    expect(r.state.players[0]!.rooms).toBe(2)
    session.dispose()
  })

  it.each([3,4])('decline or insufficient round-ten food preserves %i food and two family members', food => {
    const session = setup(10,food)
    const r = settle(session,playOccupation(session,CARD),false)
    expect(r.state.players[0]!.workers.filter(w => w.isActive)).toHaveLength(2)
    expect(r.state.players[0]!.resources.food).toBe(food)
    session.dispose()
  })

  it('zero fee never creates a sixth worker when all five identities are active', () => {
    const session = setup(14,0,true)
    const r = settle(session,playOccupation(session,CARD),true)
    expect(r.state.players[0]!.workers).toHaveLength(5)
    expect(r.state.players[0]!.workers.filter(w => w.isActive)).toHaveLength(5)
    expect(r.state.players[0]!.resources.food).toBe(0)
    expect(r.interaction.stateId === 'wait' ? r.interaction.request.kind : null).toBe('engine-blocked')
    const undone = session.undoAction()
    expect(undone.ok,undone.error).toBe(true)
    expect(undone.state.players[0]!.occupationHand).toContain(CARD)
    expect(undone.state.players[0]!.workers.filter(w => w.isActive)).toHaveLength(5)
    session.dispose()
  })
})
