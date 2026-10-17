import { describe, expect, it, afterEach } from 'vitest'
import { playOccupation, setupOccupationSession } from './_helpers/batch07-card-play'

import '../../shared/cards/E/E101_Blighter'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit46Scoring from './_helpers/audit/ae-negative-46-scoring'

describe('E101 Blighter through Session', () => {
  it.each([
    [1, 5], [5, 4], [8, 3], [11, 2], [13, 1], [14, 0],
  ])('gives the round %i reward of %i points', (round, expected) => {
    const response = playOccupation(setupOccupationSession({ cardId: 'E101_Blighter', round }), 'E101_Blighter')
    expect(response.state.players[0]!.occupationPlayed).toContain('E101_Blighter')
    expect(response.state.players[0]!.cardStates.E101_Blighter?.counters?.bonusVp ?? 0).toBe(expected)
  })
})

describe('ae-negative-46-scoring', () => {
  const { BLIGHTER, sessions, save, ok, make, finish, ready, lesson, bonus, next } = audit46Scoring
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E101 N1 actual Blighter purchase follows the independent complete stage table at every boundary',()=>{for(const[round,expected]of[[1,5],[4,5],[5,4],[7,4],[8,3],[9,3],[10,2],[11,2],[12,1],[13,1],[14,0]] as const){const s=make(BLIGHTER,false,state=>state.round=round),r=lesson(s,BLIGHTER);assert.equal(bonus(r,BLIGHTER),expected);save(`E101-N1-${round}`,r)}})
  it('E101 N2 after a natural round reset the owner cannot play another occupation while an opponent can',()=>{const s=make(BLIGHTER,false,state=>state.players[1]!.occupationHand=['A116_WoodCutter']),a=lesson(s,BLIGHTER),nine=next(s,9),bad=assertRejectedUnchanged(s,()=>s.takeAction(0,'lessons')),legal=finish(s,ok(s.takeAction(0,'grain-seeds')));ready(s);const opponent=ok(s.takeAction(1,'lessons'));assert.ok(opponent.state.players[1]!.occupationPlayed.includes('A116_WoodCutter'));assert.equal(bonus(legal,BLIGHTER),3);save('E101-N2',{a,nine,bad,legal,opponent})})
  it('E101 N3 whole Blighter purchase undo restores the owner occupation action before a legal alternative',()=>{const s=make(BLIGHTER,false),a=lesson(s,BLIGHTER),u=ok(s.undoAction());assert.equal(bonus(u,BLIGHTER),0);let r=ok(s.takeAction(0,'lessons'));if(!r.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'))r=ok(s.resolveChoice(0,'A110_Roughcaster'));assert.ok(r.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'));assert.ok(r.state.players[0]!.occupationHand.includes(BLIGHTER));save('E101-N3',{a,u,r})})
})
