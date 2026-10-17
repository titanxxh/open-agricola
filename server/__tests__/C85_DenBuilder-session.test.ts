import { describe, expect, it, afterEach } from 'vitest'
import { type GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation } from './_helpers/card-regression-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C085_DenBuilder'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit43Capacity from './_helpers/audit/ae-negative-43-capacity'

describe('C085_DenBuilder session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone'; grain?: number; food?: number }) => {
    const session = createWorkSession({seed: 85, configure: state => {
      state.round = 8
      state.players.forEach(player => {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      })
      const player = state.players[0]!
      player.occupationHand = ['C085_DenBuilder']
      player.houseType = options?.houseType ?? 'clay'
      player.resources.grain = options?.grain ?? 2
      player.resources.food = options?.food ?? 5
    }})
    const bought = playOccupation(session, 'C085_DenBuilder')
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.occupationPlayed).toContain('C085_DenBuilder')
    confirmNextPlayer(session)
    expect(session.takeAction(1,'forest').ok).toBe(true)
    confirmNextPlayer(session)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  const rejectAnytime = (session: GameSession) => {
    const before = session.getState()
    const expected = JSON.stringify({player:before.state.players[0],interaction:before.interaction})
    const denied = session.takeAnytimeAction(0,'C85-den-builder-anytime')
    expect(denied.ok).toBe(false)
    expect(JSON.stringify({player:denied.state.players[0],interaction:denied.interaction})).toBe(expected)
  }

  it('available in clay house: pays grain+food and grants capacity without a physical room', () => {
    const session = setup({ houseType: 'clay', grain: 2, food: 5 })
    const state = session.getState().state
    const initialRooms = state.players[0]!.rooms

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'C85-den-builder-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.grain).toBe(1) // 2 - 1
    expect(updatedPlayer.resources.food).toBe(3)  // 5 - 2
    expect(updatedPlayer.rooms).toBe(initialRooms)
    expect(updatedPlayer.roomTiles).toHaveLength(2)
    expect(isCardFlagged(updatedPlayer, 'C085_DenBuilder')).toBe(true)
  })

  it.each(['clay','stone'] satisfies Array<'clay' | 'stone'>)('a paid %s-house card permits real growth but leaves two room tiles', houseType => {
    const session = setup({houseType,grain:2,food:5})
    enterActiveInteraction(session)
    const used = session.takeAnytimeAction(0,'C85-den-builder-anytime')
    expect(used.ok,used.error).toBe(true)
    expect(used.state.players[0]!.rooms).toBe(2)
    expect(used.state.players[0]!.roomTiles).toHaveLength(2)
    const plowed = session.commitSelectionChoice(0,{tile:{row:0,col:1}})
    expect(plowed.ok,plowed.error).toBe(true)
    confirmNextPlayer(session)
    expect(session.takeAction(1,'grain-seeds').ok).toBe(true)
    confirmNextPlayer(session)
    const grown = session.takeAction(0,'wish-children')
    expect(grown.ok,grown.error).toBe(true)
    expect(grown.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(3)
    expect(grown.state.players[0]!.rooms).toBe(2)
    expect(grown.state.players[0]!.roomTiles).toHaveLength(2)
    expect(grown.state.players[0]!.workers).toHaveLength(5)
    session.dispose()
  })

  it('NOT available in wood house', () => {
    const session = setup({ houseType: 'wood', grain: 2, food: 5 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
    rejectAnytime(session)
  })

  it('NOT available after flagged (one-time)', () => {
    const session = setup({ houseType: 'clay', grain: 5, food: 10 })

    enterActiveInteraction(session)

    const resp1 = session.takeAnytimeAction(0, 'C85-den-builder-anytime')
    expect(resp1.ok).toBe(true)

    // Should no longer be available
    const anytimeIds = resp1.interaction.anytimeActions.map((a) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
    rejectAnytime(session)
  })

  it('NOT available without enough grain', () => {
    const session = setup({ houseType: 'clay', grain: 0, food: 5 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
    rejectAnytime(session)
  })

  it('NOT available without enough food', () => {
    const session = setup({ houseType: 'clay', grain: 2, food: 1 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
    rejectAnytime(session)
  })
})

describe('ae-negative-43-capacity', () => {
  const { DEN, sessions, save, ok, make, finish, ready, lesson, ownerReady, family, grow, anytime } = audit43Capacity
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C085 N1 real Lessons then clay or stone payment gives exactly one persistent family space and no repeat payment',()=>{for(const house of['clay','stone'] as const){const s=make(DEN,false,state=>{state.round=8;state.players[0]!.houseType=house;Object.assign(state.players[0]!.resources,{food:4,grain:2})}),bought=lesson(s,DEN);ownerReady(s);const active=ok(s.takeAction(0,'farmland')),used=finish(s,anytime(s,DEN),true);assert.equal(used.state.players[0]!.resources.grain,1);assert.equal(used.state.players[0]!.resources.food,2);save(`C085-debug-${house}`,used);const rejected=assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,'C85-den-builder-anytime'));ready(s);finish(s,ok(s.takeAction(1,'day-laborer')));ready(s);const grown=ok(s.takeAction(0,'wish-children'));assert.equal(family(grown),3);const actual={rooms:grown.state.players[0]!.rooms,tiles:grown.state.players[0]!.roomTiles.length,fields:grown.state.players[0]!.fields.length,family:family(grown)};save(`C085-N1-${house}`,{bought,active,used,rejected,grown,actual});assertRuleOutcome(actual,{rooms:2,tiles:2,fields:1,family:3})}})
  it('C085 N2 wooden house or incomplete grain food never creates family capacity before legal ordinary action',()=>{for(const mode of['wood','grain','food']){const s=make(DEN,true,state=>{state.players[0]!.houseType=mode==='wood'?'wood':'clay';Object.assign(state.players[0]!.resources,{grain:mode==='grain'?0:1,food:mode==='food'?1:2})}),bad=assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,'C85-den-builder-anytime')),noRoom=grow(s,false),legal=ok(s.takeAction(0,'grain-seeds'));assert.equal(family(legal),2);save(`C085-N2-${mode}`,{bad,noRoom,legal})}})
})
