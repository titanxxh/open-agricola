import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit56Purchase from './_helpers/audit/ae-negative-56-purchase'

describe('ae-negative-56-purchase', () => {
  const { sessions, ok, save, make, finish, play, otherOccupations } = audit56Purchase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E157 N1 actual first occupation counts zero one seven or nine occupations owned by all opponents with a seven-food cap',()=>{for(const count of[0,1,7,9]){const s=make('E157_Usufructuary',st=>{otherOccupations.slice(0,count).forEach((card,i)=>st.players[1+i%3]!.occupationPlayed.push(card))},false,14),r=finish(s,play(s,'E157_Usufructuary'));assert.equal(r.state.players[0]!.resources.food,100+Math.min(7,count));assert.equal(r.state.players[0]!.occupationPlayed.length,1);assert.deepEqual(r.state.players.slice(1).map(p=>p.resources.food),[100,100,100]);save(`E157-N1-${count}`,r)}})
  it('E157 N2 playing after an existing occupation gives no capped reward and still pays the usual fee while whole first-play undo removes its reward',()=>{const s=make('E157_Usufructuary',st=>{st.players[0]!.occupationPlayed=['A110_Roughcaster'];st.players[1]!.occupationPlayed=['A125_Priest'];},false,14),r=finish(s,play(s,'E157_Usufructuary'));assert.equal(r.state.players[0]!.resources.food,99);const c=make('E157_Usufructuary',st=>{st.players[1]!.occupationPlayed=['A125_Priest'];},false,14),a=finish(c,play(c,'E157_Usufructuary')),u=ok(c.undoAction()),retry=finish(c,play(c,'E157_Usufructuary'));assert.equal(a.state.players[0]!.resources.food,101);assert.equal(u.state.players[0]!.resources.food,100);assert.equal(retry.state.players[0]!.resources.food,101);save('E157-N2',{r,a,u,retry})})
})
