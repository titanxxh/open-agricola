import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit16Phases from './_helpers/audit/ae-negative-16-phases'

describe('ae-negative-16-phases', () => {
  const { STUDENT, sessions, save, setup, end, EIGHT } = audit16Phases
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A152 N1 no returning Lessons person permits exactly one occupation for one food',()=>{const s=setup(STUDENT);const {pending,r}=end(s,EIGHT,'A110_Roughcaster');assert.ok(r.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'));assert.ok(r.state.players[0]!.occupationHand.includes('A114_SeasonalWorker'));assert.equal(r.state.players[0]!.resources.food,59);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'A114_SeasonalWorker'));save('A152-N1',{pending,r})})
  it('A152 N2 decline keeps hand and zero food cannot grant a free occupation',()=>{const declined=end(setup(STUDENT),EIGHT).r;assert.equal(declined.state.players[0]!.occupationPlayed.length,1);assert.equal(declined.state.players[0]!.resources.food,60);const poor=end(setup(STUDENT,5,state=>state.players[0]!.resources.food=0),EIGHT).r;assert.equal(poor.state.players[0]!.occupationPlayed.length,1);save('A152-N2',{declined,poor})})
  it('A152 N3 any opponent Lessons placement suppresses night school',()=>{const s=setup(STUDENT,5,state=>state.players[1]!.occupationHand=['A110_Roughcaster']);const spaces=[...EIGHT];spaces[1]='lessons';const {r}=end(s,spaces);assert.deepEqual(r.state.players[0]!.occupationPlayed,[STUDENT]);assert.equal(r.state.players[0]!.resources.food,60);save('A152-N3',r)})
})
