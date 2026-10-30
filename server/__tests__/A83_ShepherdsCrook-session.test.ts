import { describe, expect, it, afterEach, afterAll } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import type { DraftGameEvent } from '../../shared/contract/events'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A083_ShepherdsCrook'
import assert from 'node:assert/strict'
import { writeFileSync } from './_helpers/audit-evidence-fs'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit11AnimalHousing from './_helpers/audit/ae-negative-11-animal-housing'

const edgesForTwoByTwo = [
  'H-0-1',
  'H-0-2',
  'H-2-1',
  'H-2-2',
  'V-0-1',
  'V-1-1',
  'V-0-3',
  'V-1-3',
]

const fenceBuilt = (
  newPastures: Array<{ tiles?: unknown[] }>,
): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: [{ edge: 'H-0-0', type: 'fence' }],
  newFenceEdges: ['H-0-0'],
  newPastures,
})

describe('A083_ShepherdsCrook session flow', () => {
  it('uses fence delta in listener context to grant sheep', () => {
    const session = new GameSession(42)
    expect(session.withCtx(() => getRegisteredCardListeners()).some((entry) => entry.id === 'A83-shepherds-crook-after-fencing')).toBe(true)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push('A083_ShepherdsCrook')
    player.resources.wood = 10

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFenceSelect')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTwoByTwo,
    })
    resp = resolveTriggerIfPresent(session, resp, 'A083_ShepherdsCrook')

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.resources.sheep).toBe(2)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.fenceBuilt',
        newPastures: expect.arrayContaining([
          expect.objectContaining({
            tiles: expect.arrayContaining([
              expect.objectContaining({ row: expect.any(Number), col: expect.any(Number) }),
            ]),
          }),
        ]),
      }),
    ]))
    expect(readCardResourceStats(resp.state.players[0]!, 'A083_ShepherdsCrook')).toMatchObject({
      paid: {},
      gained: { sheep: 2 },
    })
  })

  it('does not grant sheep for smaller new pasture event metadata', () => {


    const session = new GameSession(42)
    const listener = session.withCtx(() => getRegisteredCardListeners()).find((entry) => entry.id === 'A83-shepherds-crook-after-fencing')
    expect(listener).toBeDefined()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push('A083_ShepherdsCrook')
    const actionEvents = [fenceBuilt([{ tiles: [{ row: 0, col: 0 }] }])]

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'immediatelyAfter',
      result: { type: 'ok', extraData: { newPastures: [{ tiles: [{}, {}, {}, {}] }] } },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })
})

describe('ae-negative-11-animal-housing', () => {
  const { CROOK, sessions, directory, evidence, ok, record, setup, buy, deny, turn, rect, animalMenu, settle, fence, gainCount } = audit11AnimalHousing
  afterAll(() => writeFileSync(`${directory}/native-responses.json`, JSON.stringify(evidence, null, 2)))
  afterEach(context => sessions.splice(0).forEach(s => { record(`test-final:${context.task.name}`, s.getState()); s.dispose() }))
  it('A083 N1 fee zero denied exact one wood purchase gives no immediate sheep',()=>{deny(setup(CROOK,{played:false}),CROOK);const r=buy(setup(CROOK,{played:false,resources:{wood:1}}),CROOK);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.sheep,0);});
  it('A083 N2 actual three four five area fences cross threshold once',()=>{for(const[height,width,expected]of[[1,3,0],[2,2,2],[1,5,2]]){const edges=rect(0,width===5?0:1,height!,width!);const s=setup(CROOK,{resources:{wood:edges.length}});const r=settle(s,fence(s,edges));assert.equal(r.state.players[0]!.resources.sheep,expected);assert.equal(r.state.players[0]!.fenceSegments.length,edges.length);assert.equal(gainCount(r,CROOK),expected?1:0);}});
  it('A083 N3 new small pasture does not reward an existing four area pasture',()=>{const old=rect(0,1,2,2),extra=rect(0,3,1,1).filter(e=>!old.includes(e));const s=setup(CROOK,{resources:{wood:extra.length}},state=>{const p=state.players[0]!;p.fenceSegments=old.map(edge=>({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}));p.pastures=[{id:'old',tiles:[{row:0,col:1},{row:0,col:2},{row:1,col:1},{row:1,col:2}],animalType:null,animalCount:0}];});const r=fence(s,extra);assert.equal(r.state.players[0]!.resources.sheep,0);assert.equal(r.state.players[0]!.pastures.length,2);});
  it('A083 N4 two new four area pastures use fourteen fences and grant four sheep',()=>{const edges=[...rect(0,1,2,4),'V-0-3','V-1-3'];const s=setup(CROOK,{resources:{wood:14}});let r=fence(s,edges);const q=animalMenu(r);const zones=q.zones.filter(z=>z.zoneType==='pasture').map(z=>({...z,animalType:'sheep',animalCount:2}));assert.equal(zones.length,2);r=record('two-pasture-housing',ok(s.resolveChoice(0,'confirm',{zones})));assert.equal(r.state.players[0]!.resources.sheep,4);assert.equal(r.state.players[0]!.fenceSegments.length,14);assert.equal(gainCount(r,CROOK),1);});
  it('A083 N5 unplayed and opponent fences exclude holder reward',()=>{let s=setup(CROOK,{played:false,resources:{wood:8}});let r=fence(s,rect(0,1,2,2));assert.equal(r.state.players[0]!.resources.sheep,0);s=setup(CROOK,{},state=>{state.players[1]!.resources.wood=8});turn(s,0,'reed-bank');r=fence(s,rect(0,1,2,2),1);assert.equal(r.state.players[0]!.resources.sheep,0);assert.equal(r.state.players[1]!.resources.sheep,0);});
  it('A083 N6 invalid fence targets reject before a legal fence control',()=>{const s=setup(CROOK,{resources:{wood:8}});turn(s,0,'fencing');record('outside-fence',assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{edges:['H-99-99']})));record('room-fence',assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{edges:rect(1,0,1,1)})));const r=settle(s,record('legal-fence-retry',ok(s.commitSelectionChoice(0,{edges:rect(0,1,2,2)}))));assert.equal(r.state.players[0]!.resources.sheep,2);});
  it('A083 N7 whole fence housing undo restores finite pieces before one retry',()=>{const s=setup(CROOK,{resources:{wood:8}});const before=undoRuleSnapshot(s.getState());settle(s,fence(s,rect(0,1,2,2)));assertUndoRestored(before,record('undo-whole-fence',s.undoAction()));const r=settle(s,fence(s,rect(0,1,2,2)));assert.equal(r.state.players[0]!.resources.sheep,2);assert.equal(r.state.players[0]!.resources.wood,0);});
})
