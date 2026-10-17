import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { familySize } from '../../shared/domain/player'
import { descriptionEffects } from './_helpers/choice-description'
import * as audit46Preparation from './_helpers/audit/ae-negative-46-preparation'

describe('ae-negative-46-preparation', () => {
  const { ACQUIRER, sessions, save, options, choose, finish, lesson, isCardPending, enter, boundary, acquirer, buyGood } = audit46Preparation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E102 N1 actual Lessons has no immediate purchase and two people can buy exactly one of all nine valid goods at the next round start',()=>{const a=lesson(acquirer(2,2,false),ACQUIRER);assert.equal(a.state.players[0]!.resources.food,2);for(const good of['vegetable','grain','cattle','sheep','boar','wood','clay','reed','stone'] as const){const s=acquirer(),pending=boundary(s,ACQUIRER),r=buyGood(s,pending,good);assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources[good],1);assert.equal(familySize(r.state.players[0]!),2);assert.ok(!isCardPending(r,ACQUIRER));save(`E102-N1-${good}`,{a,pending,r})}})
  it('E102 N2 three actual people require exactly three food and an invalid good choice cannot bypass the paid request before a legal grain',()=>{const s=acquirer(3,3),pending=enter(s,boundary(s,ACQUIRER),ACQUIRER);let paid=pending;if(options(paid).some(o=>descriptionEffects(o.descriptionPreview).some(e=>e.kind==='payment')))paid=choose(s,paid,o=>o.value!=='__skip__');const bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'__invalid_food_or_score__')),r=buyGood(s,paid,'grain');assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources.grain,2);assert.equal(familySize(r.state.players[0]!),3);save('E102-N2',{pending,paid,bad,r})})
  it('E102 N3 decline food below family size and card only in hand cannot create a free or repeated round start good',()=>{const s=acquirer(),pending=boundary(s,ACQUIRER),declined=finish(s,pending,false);assert.equal(declined.state.players[0]!.resources.food,2);assert.equal(declined.state.players[0]!.resources.grain,0);for(const mode of['food','hand']){const t=acquirer(2,mode==='food'?1:2,mode!=='hand'),r=boundary(t,ACQUIRER);assert.ok(!isCardPending(r,ACQUIRER));assert.equal(r.state.players[0]!.resources.food,mode==='food'?1:2);assert.equal(r.state.players[0]!.resources.grain,0);save(`E102-N3-${mode}`,r)}const bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'__repeat_acquirer__'));save('E102-N3',{pending,declined,bad})})
})
