import { describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation } from './_helpers/card-regression-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'

const CARD = 'E130_Overachiever'
const settle = (session: GameSession, response: SessionResponse, accept: boolean, forbiddenSource?: string) => {
  let r = response
  for (let n = 0; n < 20; n++) {
    expect(r.ok,r.error).toBe(true)
    if (forbiddenSource) expect(JSON.stringify(r.interaction)).not.toContain(forbiddenSource)
    const i = r.interaction
    if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player') return r
    const q = i.request
    if (q.kind !== 'choice' && q.kind !== 'select-trigger') throw new Error(JSON.stringify(i))
    const option = q.options.find(o => o.value === 'B007_Wage')
      ?? q.options.find(o => o.value === 'Major_Fireplace1')
      ?? q.options.find(o => !('disabled' in o && o.disabled) && (accept ? !['__skip__','__pass__'].includes(o.value) : ['__skip__','__pass__'].includes(o.value)))
    if (!option) throw new Error(JSON.stringify(i))
    r = session.resolveChoice(i.playerIndex,option.value)
  }
  throw new Error('Unfinished Overachiever flow')
}
const setup = (space = 'lessons', playerCount = 3) => createWorkSession({
  seed: 1176, options: {playerCount}, configure: state => {
    state.round = space === 'lessons' ? 10 : 14
    state.players.forEach(p => { p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__'] })
    const p = state.players[0]!
    p.occupationPlayed = [CARD]
    p.resources.food = 5
    if (space === 'lessons') { p.occupationHand = ['C127_Lover']; p.minorHand = ['B007_Wage'] }
    else {
      p.resources.clay = 1
      if (space !== 'urgent-wish-children') { p.rooms = 3; p.roomTiles.push({row:0,col:0}) }
      state.availableMajorImprovements = ['Major_Fireplace1']
    }
  },
})

describe('Overachiever requires an actual Wish action space use', () => {
  it('Lover played through Lessons grows family without offering a Wage improvement', () => {
    const session = setup()
    const r = settle(session,playOccupation(session,'C127_Lover'),true)
    expect(r.state.players[0]!.workers.filter(w => w.isActive)).toHaveLength(3)
    expect(r.state.players[0]!.resources.food).toBe(0)
    expect(r.state.players[0]!.minorHand).toEqual(['B007_Wage'])
    expect(r.state.players[1]!.minorHand).not.toContain('B007_Wage')
    session.dispose()
  })

  it.each(['wish-children','urgent-wish-children','modest-wish-children-56'])('%s retains a one-resource discount before real growth', space => {
    const session = setup(space,space === 'modest-wish-children-56' ? 5 : 3)
    const r = settle(session,session.takeAction(0,space),true)
    expect(r.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(r.state.players[0]!.resources.clay).toBe(0)
    expect(r.state.players[0]!.workers.filter(w => w.isActive)).toHaveLength(3)
    session.dispose()
  })

  it('declining an extra improvement still performs ordinary Wish growth', () => {
    const session = setup('wish-children')
    const r = settle(session,session.takeAction(0,'wish-children'),false)
    expect(r.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
    expect(r.state.players[0]!.resources.clay).toBe(1)
    expect(r.state.players[0]!.workers.filter(w => w.isActive)).toHaveLength(3)
    session.dispose()
  })

  it.each(['hand','opponent'])('%s cannot offer the owner extra improvement on a real Wish', mode => {
    const session = setup('wish-children')
    const state = session.getState().state
    if (mode === 'hand') {
      state.players[0]!.occupationPlayed = []
      state.players[0]!.occupationHand = [CARD]
    } else {
      state.players[1]!.rooms = 3
      state.players[1]!.roomTiles.push({row:0,col:0})
    }
    session.loadState(state)
    const actor = mode === 'hand' ? 0 : 1
    if (actor === 1) {
      expect(session.takeAction(0,'grain-seeds').ok).toBe(true)
      confirmNextPlayer(session)
    }
    const r = settle(session,session.takeAction(actor,'wish-children'),true,CARD)
    expect(r.state.players[actor]!.workers.filter(w => w.isActive)).toHaveLength(3)
    expect(r.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
    expect(r.state.players[0]!.resources.clay).toBe(1)
    session.dispose()
  })
})
