/**
 * Parity tests: the browser-local custom-card executor
 * (`client/local-sandbox/browser-executor.ts`) must behave identically to the
 * server isolated-vm executor (`server/custom-code/engine.ts`) for the same
 * card source — same manifest, same invocation results, same error handling.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards } from '../../shared/cards/custom-registry.ts'
import { runCardEffectHook } from '../../shared/cards/card-effects.ts'
import { createInitialState } from '../../shared/session/state-bootstrap.ts'
import { GameCore } from '../../shared/session/session-core.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import { validateFarmChoice } from '../../shared/session/farm-choice-validation.ts'
import { createEventQuery } from '../../shared/events/query.ts'
import {
  invokeCustomCodeEffect,
  invokeCustomCodeListener,
  validateAndCompileCustomCode,
} from '../custom-code/engine.ts'
import { GameSession } from '../game/authoritative-session.ts'
import {
  invokeCustomCodeEffectLocal,
  invokeCustomCodeListenerLocal,
  validateAndCompileCustomCodeLocal,
} from '../../client/local-sandbox/browser-executor.ts'
import { registerBrowserBackedCustomCard } from '../../client/local-sandbox/browser-runtime.ts'

const CARD_SOURCE = `
const CARD_ID = 'CUSTOM_ParityCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Parity Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    handHooks: ['onReturnHome'],
    onReturnHome: (_state: any, player: any) => {
      if (!player.minorPlayed.includes(CARD_ID)) return
      player.minorPlayed.push('MUTATION_MUST_NOT_LEAK')
      return gainLeaf(CARD_ID, { food: 2 })
    },
  },
  listeners: [{
    id: CARD_ID,
    cardIds: [CARD_ID],
    actions: ['collect'],
    phases: ['after'],
    handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID } }),
  }],
}
`

const THROWING_SOURCE = `
const CARD_ID = 'CUSTOM_ParityCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Parity Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: () => {
      throw new Error('parity boom')
    },
  },
}
`

const cardDataFrom = (compiledCode: string, manifest: CustomCardData['codeManifest']): CustomCardData => ({
  cardType: 'minor',
  cardJson: {
    id: 'CUSTOM_ParityCard',
    name: 'Parity Card',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Parity'],
  },
  compiledCode,
  codeManifest: manifest,
})

afterEach(() => {
  clearCustomCards()
})

describe('browser executor parity with server executor', () => {
  it('produces an identical validate/compile result', () => {
    const server = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    const local = validateAndCompileCustomCodeLocal(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(local).toEqual(server)
    expect(server.valid).toBe(true)
    if (!server.valid) return
    expect(server.manifest.effectMetadata).toEqual({ handHooks: ['onReturnHome'] })
  })

  it('rejects forbidden globals identically', () => {
    const server = validateAndCompileCustomCode('process.exit(1)', 'CUSTOM_BadCard')
    const local = validateAndCompileCustomCodeLocal('process.exit(1)', 'CUSTOM_BadCard')
    expect(local).toEqual(server)
    expect(server.valid).toBe(false)
  })

  it('rejects worker-global escapes (self / importScripts) identically', () => {
    for (const src of ['self.fetch("/x")', 'importScripts("/x")', 'self.indexedDB.open("x")']) {
      const server = validateAndCompileCustomCode(src, 'CUSTOM_BadCard')
      const local = validateAndCompileCustomCodeLocal(src, 'CUSTOM_BadCard')
      expect(local).toEqual(server)
      expect(server.valid, `${src} should be rejected`).toBe(false)
    }
  })

  it('invokes effect hooks with identical results and input isolation', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    state.players[0]!.minorPlayed.push('CUSTOM_ParityCard')

    const request = {
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ParityCard',
      hook: 'onReturnHome' as const,
      args: [state, state.players[0]!],
    }
    const server = invokeCustomCodeEffect(request)
    const local = invokeCustomCodeEffectLocal(request)

    expect(local).toEqual(server)
    expect(server).toEqual({
      ok: true,
      result: { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'CUSTOM_ParityCard' },
    })
    expect(state.players[0]!.minorPlayed).not.toContain('MUTATION_MUST_NOT_LEAK')
  })

  it('returns null identically for a hook the card does not define', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const request = {
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ParityCard',
      hook: 'onBeforeEndGame' as const,
      args: [state, state.players[0]!],
    }
    expect(invokeCustomCodeEffectLocal(request)).toEqual(invokeCustomCodeEffect(request))
    expect(invokeCustomCodeEffectLocal(request)).toEqual({ ok: true, result: null })
  })

  it('invokes listeners with identical results', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const request = {
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ParityCard',
      registrationId: 'CUSTOM_ParityCard:listener:0',
      context: {
        state,
        player: state.players[0]!,
        space: state.actionSpaces[0]!,
        actionId: 'collect',
        phase: 'after' as const,
      },
    }
    const server = invokeCustomCodeListener(request as never)
    const local = invokeCustomCodeListenerLocal(request as never)
    expect(local).toEqual(server)
    expect(server.ok).toBe(true)
  })

  it('reports throwing card code identically as ok:false', () => {
    const compiled = validateAndCompileCustomCode(THROWING_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const request = {
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ParityCard',
      hook: 'onReturnHome' as const,
      args: [state, state.players[0]!],
    }
    const server = invokeCustomCodeEffect(request)
    const local = invokeCustomCodeEffectLocal(request)
    expect(server).toEqual({ ok: false, error: expect.stringContaining('parity boom') })
    expect(local).toEqual({ ok: false, error: expect.stringContaining('parity boom') })
  })

  it('surfaces runtime failures as cardWarnings on both registrars', () => {
    const compiled = validateAndCompileCustomCode(THROWING_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return
    const cardData = cardDataFrom(compiled.compiledCode, compiled.manifest)

    const serverSession = new GameSession(42, [cardData])
    const serverState = serverSession.withCtx(() => serverSession.getState()).state
    serverSession.withCtx(() =>
      runCardEffectHook(serverState, serverState.players[0]!, 'CUSTOM_ParityCard', 'onReturnHome'),
    )
    expect(serverSession.cardWarnings).toEqual([expect.stringContaining('parity boom')])
    serverSession.dispose()

    const localCore = new GameCore({
      stateOrSeed: 42,
      customCards: [cardData],
      registerCustomCardImpl: registerBrowserBackedCustomCard,
    })
    const localState = localCore.withCtx(() => localCore.getState()).state
    localCore.withCtx(() =>
      runCardEffectHook(localState, localState.players[0]!, 'CUSTOM_ParityCard', 'onReturnHome'),
    )
    expect(localCore.cardWarnings).toEqual([expect.stringContaining('parity boom')])
    localCore.dispose()
  })

  it('runs the same effect through GameCore with the browser registrar as the server session', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return
    const cardData = cardDataFrom(compiled.compiledCode, compiled.manifest)

    const run = (core: GameCore) => {
      const state = core.withCtx(() => core.getState()).state
      state.players[0]!.minorPlayed.push('CUSTOM_ParityCard')
      const result = core.withCtx(() =>
        runCardEffectHook(state, state.players[0]!, 'CUSTOM_ParityCard', 'onReturnHome'),
      )
      core.dispose()
      return result
    }

    const serverResult = run(new GameSession(42, [cardData]))
    const localResult = run(new GameCore({
      stateOrSeed: 42,
      customCards: [cardData],
      registerCustomCardImpl: registerBrowserBackedCustomCard,
    }))
    expect(localResult).toEqual(serverResult)
    expect(serverResult).toEqual({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 2 },
      sourceCard: 'CUSTOM_ParityCard',
    })
  })
})

describe('validateFarmChoice request-level errors', () => {
  it('flags missing player / unknown type so the endpoint can return 400', () => {
    const state = createInitialState(42)
    const playerId = state.players[0]!.id
    expect(validateFarmChoice(state, 'room', 'nobody', {}).requestError).toBe(true)
    expect(validateFarmChoice(state, 'bogus' as never, playerId, {}).requestError).toBe(true)
    // An ordinary invalid placement is a well-formed 200 response, not a 400.
    expect(validateFarmChoice(state, 'sow', playerId, {}).requestError).toBeUndefined()
  })
})

// Fixed permission cases complement rule scenarios; they are not a behavioral judge.
describe('shared Workshop capability admission', () => {
  it.each([
    ['unsupported declaration', 'effect: {allowAnytimeReentry:true}', 'unknown effect hook'],
    ['unsupported listener callback', 'listeners:[{getBaseCosts:()=>({food:0}),handler:()=>{}}]', 'unsupported listener field'],
    ['unsupported implementation modifiers', 'modifiers:[]', 'unsupported CARD_IMPL field'],
    ['foreign card listener', "listeners:[{cardIds:['CUSTOM_Other'],handler:()=>{}}]", 'listener.cardIds'],
    ['malformed block list', "listeners:[{blockedAnytimeInteractionKinds:true,handler:()=>{}}]", 'must be an array'],
  ])('rejects %s on both save paths',(_label,implementation,error)=>{
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_DEF={cardType:'minor',meta:{id:CARD_ID,name:'Parity'}};const CARD_IMPL={${implementation}}`
    const server=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');const browser=validateAndCompileCustomCodeLocal(source,'CUSTOM_ParityCard')
    expect(browser).toEqual(server);expect(server).toMatchObject({valid:false,errors:[expect.stringContaining(error)]})
  })

  it.each([
    [{vp:'2'},'Printed VP'],
    [{prerequisite:{}},'prerequisite'],
    [{cost:{wood:0.5}},'integer'],
    [{cost:{fee:{wood:1},trades:[{from:{food:1},to:{wood:1},replaceUpTo:'false'}]}},'replaceUpTo'],
    [{exchanges:[{from:{wood:1},to:{food:1},max:0.5}]},'integer'],
    [{cost:{unitFee:{food:1},nb:0.5}},'integer'],
    [{cost:{fee:{food:2},bonuses:[{discount:{food:1},conditions:{minNumRooms:'3'}}]}},'Condition minNumRooms'],
    [{cost:{fee:{food:2},bonuses:[{discount:{food:1},conditions:{unknown:1}}]}},'unsupported field'],
    [{cost:{fee:{food:2},trades:[{from:{wood:1},to:{food:1},triggers:['harvest']}]}},'unsupported field'],
    [{cost:{fee:{food:2},trades:[{from:{sheep:1},to:{food:1},fromFarmyard:true}]}},'unsupported field'],
    [{cost:{fee:{wood:2},bonuses:[{}]}},'exactly one'],
    [{cost:{fee:{wood:2},bonuses:[{discount:{wood:1},choices:[]}]}},'exactly one'],
    [{cost:{fee:{wood:2},bonuses:[{choices:[]}]}},'non-empty'],
    [{modifier:{type:'trade',cardId:'CUSTOM_ParityCard',appliesTo:['stables'],from:{food:1},to:{wood:1},groupId:'g'}},'set together'],
    [{modifier:{type:'trade',cardId:'CUSTOM_ParityCard',appliesTo:['stables'],from:{food:1},to:{wood:1},scope:'unit',conditions:{minNumRooms:2}}},'MUST NOT'],
    [{occupationPrerequisites:{min:'2'}},'Prerequisite'],
    [{improvementPrerequisites:{min:2,max:1}},'cannot exceed'],
    [{modifiers:[{type:'remove-resource',cardId:'CUSTOM_ParityCard',appliesTo:['stables']}]},'Removed cost resources'],
    [{modifiers:[{type:'remove-resource',cardId:'CUSTOM_ParityCard',appliesTo:['stables'],resources:['room']}]},'Removed cost resources'],
    [{altCosts:[{fee:{wood:2}}]},'Unsupported resource'],
    [{returnCards:'Major_Fireplace1'},'returnCards'],
    [{exchanges:[{from:{},to:{food:1}}]},'positive input'],
    [{exchanges:[{from:{wood:0},to:{food:1}}]},'positive input'],
    [{cost:{fee:{wood:2},resourceReserve:{}}},'Reserve resources'],
    [{cost:{fee:{wood:2},resourceReserve:{resources:['wood'],minimum:-1}}},'Reserve minimum'],
  ] as const)('rejects invalid metadata on both save paths', (metadata,error)=>{
    const meta={id:'CUSTOM_ParityCard',name:'Parity',...metadata}
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_DEF={cardType:'minor',meta:${JSON.stringify(meta)}};const CARD_IMPL={}`
    const server=validateAndCompileCustomCode(source,'CUSTOM_ParityCard')
    expect(validateAndCompileCustomCodeLocal(source,'CUSTOM_ParityCard')).toEqual(server)
    expect(server).toMatchObject({valid:false,errors:[expect.stringContaining(error)]})
  })

  it.each([
    ['nested internal action', {type:'seq',children:[{type:'leaf',actionId:'place-farmer'}]}, 'Unsupported Workshop action'],
    ['unknown target', {type:'seq',targetPlayerId:'missing',children:[{type:'leaf',actionId:'gain',params:{food:1}}]}, 'Target player'],
    ['invalid occupation filter', {type:'leaf',actionId:'occupation',params:{allowedCards:{}}}, 'Allowed occupation cards'],
    ['invalid improvement types', {type:'leaf',actionId:'improvement',params:{types:'minor'}}, 'Improvement types'],
    ['empty contextual improvement types', {type:'leaf',actionId:'improvement',actionContext:{types:[]}}, 'Improvement types'],
    ['empty farm selection', {type:'leaf',actionId:'selection',actionContext:{selectableTiles:[]}}, 'achievable'],
    ['invalid farm coordinates', {type:'leaf',actionId:'selection',actionContext:{selectableTiles:[{row:'0',col:1}]}}, 'finite'],
    ['duplicate farm coordinates', {type:'leaf',actionId:'selection',actionContext:{selectableTiles:[{row:0,col:1},{row:0,col:1}]}}, 'distinct'],
    ['unachievable farm selection', {type:'leaf',actionId:'selection',actionContext:{selectableTiles:[{row:0,col:1}],minSelections:2,maxSelections:2}}, 'achievable'],
    ['disabled choice', {type:'leaf',actionId:'emit-choice',params:{options:[{value:'a',labelKey:'ui.yes',disabled:true}]}}, 'enabled option'],
    ['invalid exchange caps', {type:'leaf',actionId:'exchange',actionContext:{maxTradeTimesBySourceId:{CUSTOM_ParityCard:'1'}}}, 'Exchange source cap'],
    ['invalid exchange IDs', {type:'leaf',actionId:'exchange',actionContext:{tradeIds:{}}}, 'Exchange trade IDs'],
    ['invalid fence bounds', {type:'leaf',actionId:'fence',actionContext:{fencePolicy:{segmentBounds:{total:{min:{}}}}}}, 'Fence segment bounds'],
    ['invalid pasture bounds', {type:'leaf',actionId:'fence',actionContext:{fencePolicy:{newPastureBounds:{count:{min:2,max:1}}}}}, 'cannot exceed'],
    ['invalid stable cap', {type:'leaf',actionId:'stables',actionContext:{max:'1'}}, 'Stable max'],
    ['invalid multi-select', {type:'leaf',actionId:'emit-choice',params:{options:[{value:'a',labelKey:'ui.yes'}],multiSelect:{}}}, 'valuePrefix'],
    ['reversed multi-select bounds', {type:'leaf',actionId:'emit-choice',params:{options:[{value:'a',labelKey:'ui.yes'}],multiSelect:{valuePrefix:'s:',minSelections:2,maxSelections:1}}}, 'cannot exceed'],
    ['duplicate multi-select values', {type:'leaf',actionId:'emit-choice',params:{options:[{value:'a',labelKey:'ui.yes'},{value:'a',labelKey:'ui.no'}],multiSelect:{valuePrefix:'s:',minSelections:2,maxSelections:2}}}, 'distinct available'],
    ['unencodable multi-select value', {type:'leaf',actionId:'emit-choice',params:{options:[{value:'a,b',labelKey:'ui.yes'}],multiSelect:{valuePrefix:'s:',minSelections:1,maxSelections:1}}}, 'no commas'],
    ['non-string stack item', {type:'leaf',actionId:'push-to-card-stack',params:{item:{}}}, 'stack item'],
    ['empty xor', {type:'xor',children:[]}, 'nonempty children'],
    ['empty or', {type:'or',children:[]}, 'nonempty children'],
    ['non-string payment choice', {type:'leaf',actionId:'pay',params:{cost:{food:1},paymentChoice:{}}}, 'paymentChoice'],
    ['fractional exchange limit', {type:'leaf',actionId:'exchange',actionContext:{directTrade:{from:{wood:1},to:{food:1},max:0.5}}}, 'integer'],
    ['fractional gain', {type:'leaf',actionId:'gain',params:{food:0.5}}, 'integer'],
    ['malformed leaf preview', {type:'leaf',actionId:'gain',params:{food:1},effectPreview:{kind:'futureSchedule',entries:{}}}, 'Preview entries'],
    ['invalid gain mode', {type:'leaf',actionId:'gain',params:{food:1,recipientMode:'other'}}, 'recipientMode'],
    ['missing gain recipient', {type:'leaf',actionId:'gain',params:{food:1,recipientPlayerId:'missing'}}, 'existing player'],
    ['missing gain payer', {type:'leaf',actionId:'gain',params:{food:1,payerId:'missing'}}, 'existing player'],
    ['fractional future resource', {type:'leaf',actionId:'future-meeples',params:{__futureMeepleRequest:{cardId:'CUSTOM_ParityCard',playerId:'p1',startRound:2,count:2,resources:{food:0.5}}}}, 'integer'],
    ['fractional unit payment', {type:'leaf',actionId:'pay',params:{cost:{unitFee:{food:1},nb:0.5}}}, 'integer'],
    ['missing future resources', {type:'leaf',actionId:'future-meeples',params:{__futureMeepleRequest:{cardId:'CUSTOM_ParityCard',playerId:'p1',startRound:2,count:2}}}, 'Future resources'],
    ['non-string payment prefix', {type:'leaf',actionId:'pay',params:{cost:{food:1},optionPrefix:{}}}, 'optionPrefix'],
    ['real provider key', {type:'leaf',actionId:'pay',params:{cost:{fee:{food:1},paymentResourceProviders:[{key:'wood',sourceCard:'CUSTOM_ParityCard',available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'traveling-players',resource:'food'}}]}}}, 'virtual'],
    ['misplaced purchase context', {type:'leaf',actionId:'improvement',params:{types:['major'],actionContext:{minimumResourcesPaid:{clay:1}}}}, 'unsupported field'],
    ['lifecycle mutation', {type:'leaf',actionId:'special-effect',params:{kind:'clear-round-flags'}}, 'Unsupported special-effect kind'],
    ['foreign local source', {type:'leaf',actionId:'special-effect',sourceCard:'CUSTOM_Other',params:{kind:'set-counter',key:'x',value:1}}, 'impersonate'],
    ['native stable mutation', {type:'leaf',actionId:'stables',actionContext:{farmHand:true}}, 'unsupported field'],
    ['implicit Harvest reap', {type:'leaf',actionId:'reap'}, 'Reap trigger'],
    ['extra sowing variant', {type:'leaf',actionId:'sow',actionContext:{cropType:'wood'}}, 'ordinary crops'],
    ['foreign trade side effect', {type:'leaf',actionId:'exchange',actionContext:{directTrade:{from:{wood:1},to:{food:1},sideEffect:{type:'drainSpace',spaceId:'forest',resource:'wood'}}}}, 'unsupported field'],
    ['future settlement override', {type:'leaf',actionId:'future-meeples',params:{__futureMeepleRequest:{cardId:'CUSTOM_ParityCard',playerId:'p1',entries:[{round:2,resources:{field:1},actionContext:{unrestricted:true}}]}}}, 'settlement contract'],
    ['forged payment attribution', {type:'leaf',actionId:'pay',params:{cost:{fee:{food:1}},candidateMetadataByFeeIndex:{0:{originalFeeIndex:0,sources:['CUSTOM_Other'],costAttribution:{CUSTOM_Other:{saved:{wood:99}}}}}}}, 'candidateMetadataByFeeIndex'],
    ['forged resource-removal attribution', {type:'leaf',actionId:'pay',params:{cost:{fee:{wood:5},costResourceRemovals:[{resource:'wood',sourceCard:'CUSTOM_Other',savedByFee:[5]}]}}}, 'costResourceRemovals'],
    ['fabricated card ownership', {type:'leaf',actionId:'pay',params:{cost:{fee:{wood:5}},playedCards:['Major_Fireplace1']}}, 'playedCards'],
    ['unsettled direct card-return cost', {type:'leaf',actionId:'pay',params:{cost:{fee:{wood:5},cards:{type:'major',list:['Major_Fireplace1']}}}}, 'cards'],
    ['foreign choice source', {type:'leaf',actionId:'emit-choice',params:{options:[{value:'yes',labelKey:'ui.yes',sourceCard:'CUSTOM_Other'}]}}, 'impersonate'],
    ['misplaced payment minimum', {type:'leaf',actionId:'improvement',params:{minimumResourcesPaid:{clay:1}}}, 'minimumResourcesPaid'],
    ['non-animal breeding', {type:'leaf',actionId:'breed',actionContext:{animalTypes:['food']}}, 'Breed animals'],
    ['malformed payment reserve', {type:'leaf',actionId:'pay',params:{cost:{fee:{wood:2},resourceReserve:{}}}}, 'Reserve resources'],
  ])('rejects runtime-computed %s before dispatch',(_label,flow,error)=>{
    // Deliberately dynamic return, beyond AST literal inspection.
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_DEF={cardType:'minor',meta:{id:CARD_ID,name:'Parity'}};const CARD_IMPL={effect:{onBuy:state=>state.customFlow}}`
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',hook:'onBuy' as const,args:[{customFlow:flow},{}]}
    const server=invokeCustomCodeEffect(request);expect(invokeCustomCodeEffectLocal(request)).toEqual(server);expect(server).toMatchObject({ok:false,error:expect.stringContaining(error)})
  })

  it('preserves all five arguments and strips host callbacks on both adapters',()=>{
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_DEF={cardType:'minor',meta:{id:CARD_ID,name:'Parity'}};const CARD_IMPL={effect:{computeBreedableAnimalCount:(state,player,animal,count,ctx)=>ctx.sourceCard===CARD_ID&&ctx.callback===undefined&&animal==='sheep'?count+state.round+player.resources.food:0}}`
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',hook:'computeBreedableAnimalCount' as const,args:[{round:3},{resources:{food:2}},'sheep',4,{sourceCard:'CUSTOM_ParityCard',callback:()=>999}]}
    expect(invokeCustomCodeEffect(request)).toEqual({ok:true,result:9});expect(invokeCustomCodeEffectLocal(request)).toEqual({ok:true,result:9})
  })

  it.each([
    ['computeCostedBonus', {}, 'must be an array'],
    ['computeCostedBonus', [{cost:{food:-1},score:1}], 'nonnegative'],
    ['computeSharedPostScore', {}, 'must be an array'],
    ['computeSharedPostScore', [{playerId:'unknown',score:1}], 'player not found'],
    ['computeLockedFarmTiles', {}, 'must be an array'],
    ['getBuiltSpecialStables', [{row:'0',col:1}], 'finite number'],
    ['getInvalidAnimals', [{type:'sheep'},{type:'sheep'}], 'subset'],
    ['getRuleContributions', {reservedSupply:{room:1}}, 'unsupported field'],
    ['getStatePresentation', [], 'must be an object'],
    ['countExtraTurns', 1.5, 'integer'],
    ['computeExtraRoomCapacity', -1, 'nonnegative'],
    ['computeExtraRoomCapacity', 0.5, 'integer'],
  ] as const)('rejects malformed %s results before host consumption',(hook,result,error)=>{
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_IMPL={effect:{${hook}:()=>(${JSON.stringify(result)})}}`
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard')
    if(!compiled.valid)throw Error(compiled.errors.join(';'))
    const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',hook,args:[{players:[{id:'p1'}]}, {}, [{type:'sheep'}]]}
    const server=invokeCustomCodeEffect(request);expect(invokeCustomCodeEffectLocal(request)).toEqual(server)
    expect(server).toMatchObject({ok:false,error:expect.stringContaining(error)})
  })

  it.each([
    {requiredEmptyZoneGroupIds:{}}, {allowedAnimalTypes:{}}, {animalCounts:{food:1}},
    {blocked:'yes'}, {exclusiveCardZoneLimit:'one'}, {farmPosition:{row:'0',col:1}},
    {capacityCounterKey:'__proto__'}, {displayOwnerName:[]}, {displaySource:'unknown'}, {displaySource:['farm-position']},
  ])('rejects malformed optional animal-zone data on both adapters', fields=>{
    const zone={id:'shared',zoneType:'card',capacity:1,...fields}
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_IMPL={effect:{onComputeSharedAnimalZones:()=>[${JSON.stringify(zone)}]}}`
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',hook:'onComputeSharedAnimalZones' as const,args:[{id:'p1'},{id:'p2'},[],{players:[{id:'p1'},{id:'p2'}]}]}
    const server=invokeCustomCodeEffect(request);expect(invokeCustomCodeEffectLocal(request)).toEqual(server);expect(server.ok).toBe(false)
  })

  it('keeps valid scoring query data and rejects foreign listener choice sources on both adapters',()=>{
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_IMPL={effect:{computeCostedBonus:()=>[{cost:{food:2},score:3}],computeSharedPostScore:()=>[{playerId:'p1',score:2}]},listeners:[{handler:()=>({extraOptions:[{value:'yes',labelKey:'ui.yes',sourceCard:'CUSTOM_Other'}]})}]}`
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    for(const [hook,result] of [['computeCostedBonus',[{cost:{food:2},score:3}]],['computeSharedPostScore',[{playerId:'p1',score:2}]]] as const){
      const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',hook,args:[{players:[{id:'p1'}]},{}]}
      expect(invokeCustomCodeEffect(request)).toEqual({ok:true,result});expect(invokeCustomCodeEffectLocal(request)).toEqual({ok:true,result})
    }
    const state=createInitialState(42)
    const context={state,player:state.players[0]!,ownerPlayer:state.players[0]!,effectPlayer:state.players[0]!,triggerPlayer:state.players[0]!,space:state.actionSpaces[0]!,actionId:'collect',phase:'after' as const,extraData:{},transactionEvents:[],eventQuery:{} as never}
    const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',registrationId:'CUSTOM_ParityCard:listener:0',context}
    const server=invokeCustomCodeListener(request);expect(invokeCustomCodeListenerLocal(request)).toEqual(server)
    expect(server).toMatchObject({ok:false,error:expect.stringContaining('impersonate')})
  })

  it('does not turn omitted filters into a global listener',()=>{
    const source="const CARD_ID='CUSTOM_ParityCard';const CARD_IMPL={listeners:[{handler:()=>({flow:gainLeaf(CARD_ID,{food:1})})}]}"
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    expect(validateAndCompileCustomCodeLocal(source,'CUSTOM_ParityCard')).toEqual(compiled)
    const session=new GameSession(42,[cardDataFrom(compiled.compiledCode,compiled.manifest)],{playerCount:2})
    for(const player of session.state.players){player.minorHand=['__test_placeholder__'];player.occupationHand=['__test_placeholder__']}
    // Neither player owns this card: even repeated collect/query dispatch cannot award its flow.
    session.loadState(session.state);const response=session.takeAction(0,'forest')
    expect(response.ok,response.error).toBe(true);expect(response.state.players[0]!.resources.food).toBe(2);expect(response.state.players[1]!.resources.food).toBe(3)
    session.dispose()
  })
})

describe('Workshop preview and control data parity',()=>{
  it.each([
    {kind:'fieldContents',resources:{food:0.5}}, {kind:'cardScore',cardId:'CUSTOM_ParityCard',delta:{}},
    {kind:'actionSpace',spaceId:'forest',nameKey:'actions.forest.name',descriptionKey:{}},
    {kind:'futureOffers',entries:{}}, {kind:'resourceMovement',resources:{food:1},from:{},to:{kind:'player'}},
    {kind:'futureSchedule',entries:{}}, {kind:'futureSchedule',entries:[{round:2,resources:{food:1},actions:{}}]},
    {kind:'futureSchedule',entries:[{round:2,resources:{food:1},resourceCondition:{kind:'min-resource',resource:'unknown',amount:1}}]},
    {kind:'resourceExchange',resourcesPaid:{food:'one'}}, {kind:'payment',sourceCards:{}}, {kind:'text',text:{}}, {kind:'unknown'},
  ])('rejects malformed $kind preview on both adapters',preview=>{
    const flow={type:'leaf',actionId:'emit-choice',params:{options:[{value:'yes',labelKey:'ui.yes',effectPreview:preview}]}}
    const source="const CARD_ID='CUSTOM_ParityCard';const CARD_IMPL={effect:{onBuy:s=>s.customFlow}}"
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',hook:'onBuy' as const,args:[{customFlow:flow},{}]}
    const server=invokeCustomCodeEffect(request);expect(invokeCustomCodeEffectLocal(request)).toEqual(server);expect(server.ok).toBe(false)
  })

  it.each([{kind:'group',separator:' / ',parts:{}},{kind:'action',labelKey:{},effectPreview:{kind:'text',text:'ok'}},{kind:'unknown'}])('rejects malformed description $kind on both adapters',preview=>{
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_IMPL={effect:{onBuy:()=>({type:'leaf',actionId:'emit-choice',params:{options:[{value:'yes',labelKey:'ui.yes',descriptionPreview:${JSON.stringify(preview)}}]}})}}`
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',hook:'onBuy' as const,args:[{},{}]}
    const server=invokeCustomCodeEffect(request);expect(invokeCustomCodeEffectLocal(request)).toEqual(server);expect(server.ok).toBe(false)
  })

  it.each([{doable:'false'},{countCardUse:0},{decline:'false'},{costs:{wood:-0.5},costAttribution:[{sourceCard:'CUSTOM_ParityCard',costs:{wood:-0.5}}]}])('rejects malformed listener control or resource delta on both adapters',result=>{
    const resultCode=JSON.stringify(result).replaceAll('"sourceCard":"CUSTOM_ParityCard"','"sourceCard":CARD_ID')
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_IMPL={listeners:[{handler:()=>(${resultCode})}]}`
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    const state=createInitialState(42),request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',registrationId:'CUSTOM_ParityCard:listener:0',context:{state,player:state.players[0]!,space:state.actionSpaces[0]!,actionId:'collect',phase:'after' as const,transactionEvents:[],eventQuery:createEventQuery([])}}
    const server=invokeCustomCodeListener(request);expect(invokeCustomCodeListenerLocal(request)).toEqual(server);expect(server.ok).toBe(false)
  })

  it.each([
    {available:1e9}, {available:0.5}, {covers:[{resource:'food',costAmount:0.5,paymentAmount:1}]},
    {covers:[{resource:'food',costAmount:1,paymentAmount:0}]},
    {available:31,covers:[{resource:'food',costAmount:1,paymentAmount:1},{resource:'wood',costAmount:1,paymentAmount:1}]},
  ])('rejects unsafe provider enumeration input on both adapters',fields=>{
    const provider={key:'CUSTOM_ParityCard:clay',sourceCard:'CUSTOM_ParityCard',available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'},...fields}
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_IMPL={effect:{onBuy:()=>({type:'leaf',actionId:'pay',params:{cost:{fee:{food:1e9},paymentResourceProviders:[${JSON.stringify(provider)}]}}})}}`
    const compiled=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');if(!compiled.valid)throw Error(compiled.errors.join(';'))
    const request={compiledCode:compiled.compiledCode,cardId:'CUSTOM_ParityCard',hook:'onBuy' as const,args:[{},{}]}
    const server=invokeCustomCodeEffect(request);expect(invokeCustomCodeEffectLocal(request)).toEqual(server);expect(server.ok).toBe(false)
  })
})

describe('Shared factory prerequisite normalization',()=>{
  it.each(['MinorImprovement','new MinorImprovement','Occupation','new Occupation'])('normalizes the existing occupation shorthand in %s on both adapters',factory=>{
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_DEF=${factory}({id:CARD_ID,name:'Parity',prerequisite:{occupation:2}});const CARD_IMPL={}`
    const server=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');expect(validateAndCompileCustomCodeLocal(source,'CUSTOM_ParityCard')).toEqual(server)
    expect(server).toMatchObject({valid:true,cardDefinition:{meta:{prerequisite:'2 Occupations',occupationPrerequisites:{min:2}}}})
  })
  it.each([{},[],{occupation:0.5},{occupation:-1},{occupation:2,unknown:1}])('rejects a malformed factory prerequisite on both adapters',prerequisite=>{
    const source=`const CARD_ID='CUSTOM_ParityCard';const CARD_DEF=MinorImprovement({id:CARD_ID,name:'Parity',prerequisite:${JSON.stringify(prerequisite)}});const CARD_IMPL={}`
    const server=validateAndCompileCustomCode(source,'CUSTOM_ParityCard');expect(validateAndCompileCustomCodeLocal(source,'CUSTOM_ParityCard')).toEqual(server)
    expect(server).toMatchObject({valid:false,errors:[expect.stringContaining('prerequisite must be a string')]})
  })
})
