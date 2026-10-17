import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C083_EarlyCattle'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit43Renovation from './_helpers/audit/ae-negative-43-renovation'

const CARD_ID = 'C083_EarlyCattle'

const setup = (withPasture: boolean) => {
  const session = new GameSession(83, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.cattle = 0
  player.pastures = withPasture ? [{
    id: 'pasture',
    size: 1,
    tiles: [{ row: 0, col: 2 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }] : []
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response: SessionResponse = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-'),
    )
    if (!option) break
    response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('C083 Early Cattle parity', () => {
  it('C083 S1: one pasture lets Early Cattle grant two cattle', () => {
    const session = setup(true)
    let response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.cattle).toBe(2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })

    response = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: 2 }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'cattle', animalCount: 2 })
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: -3 }))
  })

  it('C083 S2: no pasture keeps Early Cattle unavailable', () => {
    const response = playMinor(setup(false))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
  })
})

describe('ae-negative-43-renovation', () => {
  const { EARLY, sessions, save, ok, make, menu, purchase, pasture } = audit43Renovation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C083 N1 real one pasture purchase gains exactly two cattle scores minus three and undo restores them',()=>{const s=make(EARLY,false,pasture),a=purchase(s,EARLY);assert.equal(a.r.state.players[0]!.resources.cattle,2);assert.equal(a.r.state.players[0]!.pastures[0]!.animalCount,2);assert.equal(a.r.scores![0]!.categories.find(c=>c.key==='cards')?.entries.find(e=>'cardId'in e&&e.cardId===EARLY)?.score,-3);const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.cattle,0);assert.ok(u.state.players[0]!.minorHand.includes(EARLY));save('C083-N1',{a,u})})
  it('C083 N2 no pasture refuses purchase before free legal alternative and holding card grants no cattle',()=>{const s=make(EARLY,false),pending=menu(s),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,EARLY)),legal=ok(s.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.cattle,0);const t=make(EARLY,false,pasture),other=ok(t.takeAction(0,'grain-seeds'));assert.equal(other.state.players[0]!.resources.cattle,0);save('C083-N2',{pending,bad,legal,other})})
})
