import { describe, expect, it, afterEach } from 'vitest'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { sessionOptions, setupOccupationSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/A/A131_CraftTeacher'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit15Craft from './_helpers/audit/ae-negative-15-craft'

describe('A131 Craft Teacher through Session', () => {
  it('plays two occupations for free after Joinery', () => {
    const session = setupOccupationSession({
      cardId: 'A131_CraftTeacher',
      playerCount: 3,
      played: ['A131_CraftTeacher'],
      hand: ['A116_WoodCutter', 'A125_Priest'],
    })
    Object.assign(session.state.players[0]!.resources, { wood: 2, stone: 2 })
    session.state.availableMajorImprovements = ['Major_Joinery']
    session.loadState(session.state)

    let response = session.takeAction(0, 'major-improvement')
    for (let guard = 0; guard < 4 && !response.state.players[0]!.improvements.includes('Major_Joinery'); guard += 1) {
      if (response.interaction.stateId !== 'wait') break
      const next = sessionOptions(response).find((entry) => entry.value === 'Major_Joinery')
        ?? sessionOptions(response).find((entry) => entry.value !== 'cancel')
      expect(next, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, next!.value)
    }
    response = resolveTriggerIfPresent(session, response, 'A131_CraftTeacher')
    if (response.interaction.stateId === 'wait') {
      const takeTwo = sessionOptions(response).filter((entry) => entry.value !== '__skip__').at(-1)!
      expect(takeTwo, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, takeTwo.value)
    }
    for (const occupationId of ['A116_WoodCutter', 'A125_Priest']) {
      for (let guard = 0; guard < 3 && response.interaction.stateId === 'wait'
        && !sessionOptions(response).some((entry) => entry.value === occupationId); guard += 1) {
        const enter = sessionOptions(response).find((entry) => entry.value !== '__skip__')
        expect(enter, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, enter!.value)
      }
      if (response.interaction.stateId === 'wait') {
        const card = sessionOptions(response).find((entry) => entry.value === occupationId)
        expect(card, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, card!.value)
      }
    }

    expect(response.state.players[0]!.occupationPlayed).toEqual(expect.arrayContaining([
      'A131_CraftTeacher', 'A116_WoodCutter', 'A125_Priest',
    ]))
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe('ae-negative-15-craft', () => {
  const { CRAFT, sessions, save, ok, setup, buyMajor, teach } = audit15Craft
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A131 N1 each named workshop permits exactly two free occupations with zero food',()=>{for(const major of ['Major_Joinery','Major_Pottery','Major_Basket']){const s=setup(CRAFT,state=>state.players[0]!.resources.food=0);const pending=buyMajor(s,major);const r=teach(s,pending,['A110_Roughcaster','A114_SeasonalWorker']);assert.deepEqual([...r.state.players[0]!.occupationPlayed].sort(),[CRAFT,'A110_Roughcaster','A114_SeasonalWorker'].sort());assert.equal(r.state.players[0]!.resources.food,0);assert.ok(r.state.players[0]!.occupationHand.includes('A119_FirewoodCollector'));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'A119_FirewoodCollector'));save(`A131-N1-${major}`,{pending,r})}})
  it('A131 N2 declining all or after one free occupation preserves unused hand and food',()=>{for(const cards of [[],['A110_Roughcaster']]){const s=setup(CRAFT,state=>state.players[0]!.resources.food=0);const r=teach(s,buyMajor(s,'Major_Joinery'),cards);assert.equal(r.state.players[0]!.occupationPlayed.length,1+cards.length);assert.equal(r.state.players[0]!.resources.food,0);save(`A131-N2-${cards.length}`,r)}})
  it('A131 N3 unrelated major and unplayed Teacher cannot grant occupations',()=>{const s=setup(CRAFT);const unrelated=buyMajor(s,'Major_Fireplace1');assert.equal(unrelated.state.players[0]!.occupationPlayed.length,1);const hs=setup(CRAFT,undefined,false);const hand=buyMajor(hs,'Major_Joinery');assert.equal(hand.state.players[0]!.occupationPlayed.length,0);save('A131-N3',{unrelated,hand})})
  it('A131 N4 invalid occupation wrong actor and whole action undo restore workshop and free plays',()=>{const s=setup(CRAFT,state=>state.players[0]!.resources.food=0);const pending=buyMajor(s,'Major_Joinery');assertRejectedUnchanged(s,()=>s.resolveChoice(1,'A110_Roughcaster'));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'A999_Nonexistent'));const first=teach(s,pending,['A110_Roughcaster','A114_SeasonalWorker']);const undone=ok(s.undoAction());assert.deepEqual(undone.state.players[0]!.occupationPlayed,[CRAFT]);assert.ok(!undone.state.players[0]!.improvements.includes('Major_Joinery'));const retry=teach(s,buyMajor(s,'Major_Joinery'),['A110_Roughcaster']);assert.equal(retry.state.players[0]!.occupationPlayed.length,2);save('A131-N4',{first,undone,retry})})
})
