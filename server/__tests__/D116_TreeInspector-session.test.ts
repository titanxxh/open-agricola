import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit49Work from './_helpers/audit/ae-negative-49-work'

describe('ae-negative-49-work', () => {
  const { TREE, sessions, save, ok, lesson, progress, ready, action, wood, tree, pile } = audit49Work
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D116 N1 actual purchase creates a private accumulation space and only its owner can collect the first real round start wood',()=>{const s=tree(),bought=lesson(s,TREE);assert.equal(pile(bought),0);assert.ok(bought.state.actionSpaces.some(a=>a.id===TREE));const five=progress(s,5);assert.equal(pile(five),1);action(s,0,'grain-seeds');ready(s);const bad=assertRejectedUnchanged(s,()=>s.takeAction(1,TREE));action(s,1,'day-laborer');const r=action(s,0,TREE);assert.equal(wood(r),1);assert.equal(pile(r),0);save('D116-N1',{bought,five,bad,r})})
  it('D116 N2 each actual newly revealed quarry discards all prior card wood before ordinary round accumulation and unrelated reveal keeps it',()=>{for(const[purchaseRound,first,second,quarryRound,space]of[[4,5,6,7,'western-quarry'],[8,9,10,11,'eastern-quarry']] as const){const s=tree(purchaseRound),bought=lesson(s,TREE),one=progress(s,first),two=progress(s,second),r=progress(s,quarryRound);assert.equal(pile(one),1);assert.equal(pile(two),2);assert.equal(pile(r),1);assert.equal(wood(r),0);assert.equal(r.state.roundActionOrder[quarryRound-1],space);const following=progress(s,quarryRound+1);assert.equal(pile(following),2);save(`D116-N2-${space}`,{bought,one,two,r,following})}})
  it('D116 N3 whole purchase undo removes the created card space and a held card cannot be used before a legal ordinary action',()=>{const s=tree(),a=lesson(s,TREE),u=ok(s.undoAction());assert.ok(!u.state.actionSpaces.some(a=>a.id===TREE));const bad=assertRejectedUnchanged(s,()=>s.takeAction(0,TREE)),legal=ok(s.takeAction(0,'grain-seeds'));assert.equal(wood(legal),0);save('D116-N3',{a,u,bad,legal})})
})
