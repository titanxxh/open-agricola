import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { workshopCardJsonFromDefinition } from '../workshop-draft-validation'
import { clearCustomCards, registerCustomCard } from '../../shared/cards/custom-registry'
import { getCardEffect, countPendingExtraTurns, getAnimalScoreAdjustment, getBreedThreshold, getBreedableAnimalCount, shouldEnforceReorganizeOnLastHarvest } from '../../shared/cards/card-effects'
import { Scoring } from '../../shared/domain/scoring'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import type { ActionFlow } from '../../shared/contract/types'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

const CARD = 'CUSTOM_Capabilities'
const sessions: GameSession[] = []
// Approved design: existing engine extension, no card-specific rule path.
// Every scenario starts with seed 42 / 2 players / explicit placeholder hands.
// Payment, farm pending, shared zones and delayed state cross GameSession;
// pure numeric queries use the public collector inside its session context.
function setup(implementation: string, metadata = '', enableFarmersOfTheMoor = false, useMinorFactory = false) {
  const meta = `{id:CARD_ID,name:'Capabilities',${metadata}}`
  const source = `const CARD_ID='${CARD}'; const CARD_DEF=${useMinorFactory?`MinorImprovement(${meta})`:`{cardType:'minor',meta:${meta}}`}; const CARD_IMPL=${implementation}`
  const compiled = validateAndCompileCustomCode(source, CARD)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  const card: CustomCardData = { cardType: 'minor' as const, cardJson: { ...workshopCardJsonFromDefinition(compiled.cardDefinition), id: CARD, name: 'Capabilities', deck: 'CUSTOM', number: 0, desc: [] }, compiledCode: compiled.compiledCode, codeManifest: compiled.manifest }
  const session = new GameSession(42, [card], { playerCount: 2, ...(enableFarmersOfTheMoor ? {enableFarmersOfTheMoor:true,allowIncompleteFarmersOfTheMoorMinorDeal:true} : {}) })
  sessions.push(session)
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
  }
  session.state.players[0]!.minorPlayed = [CARD]
  return { session, card, player: session.state.players[0]!, opponent: session.state.players[1]! }
}
const leaf = (actionId: string, rest: Record<string, unknown> = {}): ActionFlow => ({ type: 'leaf', actionId, sourceCard: CARD, ...rest })
const afterCollect = (flow: ActionFlow, effect = '', listenerMetadata = '') => `{effect:{${effect}},listeners:[{actions:['collect'],phases:['after'],mandatory:true,${listenerMetadata}handler:()=>({flow:${JSON.stringify(flow)}})}]}`
function collect(session: GameSession) { session.loadState(session.state); const response = session.takeAction(0, 'forest'); expect(response.ok, response.error).toBe(true); return response }
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()); clearCustomCards() })

describe('Workshop capabilities through fixed Session scenarios', () => {
  it('plows, sows and privately reaps without dispatching Harvest lifecycle hooks', () => {
    const {session, player} = setup(afterCollect({ type:'seq', children:[leaf('plow'),leaf('sow'),leaf('reap',{actionContext:{trigger:{phase:'private-field-phase',cardId:CARD}}})] }, 'onStartHarvest:()=>gainLeaf(CARD_ID,{stone:99})'))
    player.resources.grain=1
    let r=collect(session)
    expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:'plow'}})
    const before=JSON.stringify(session.state)
    expect(session.commitSelectionChoice(0,{tile:{row:99,col:99}}).ok).toBe(false)
    expect(JSON.stringify(session.state)).toBe(before)
    r=session.commitSelectionChoice(0,{tile:{row:0,col:1}})
    expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:'sow'}})
    r=session.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'}]})
    expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({grain:1,stone:0})
    expect(r.state.players[0]!.fields).toContainEqual(expect.objectContaining({row:0,col:1,stacks:[{kind:'grain',remaining:2}]}))
    expect(r.state.roundPhase).toBe('work')
    expect(r.state.events).toContainEqual(expect.objectContaining({sourceCardId:CARD}))
    expect(session.cardWarnings).toEqual([])
  })

  it.each(['stables','construct'] as const)('builds %s using real payment and rejects occupied tiles without partial writes', action => {
    const {session, player}=setup(afterCollect(leaf(action)))
    player.resources.wood=5;player.resources.reed=2
    let r=collect(session)
    expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:action==='stables'?'stable':'room'}})
    const before=JSON.stringify(session.state)
    expect(session.commitSelectionChoice(0,action==='stables'?{stables:[{row:1,col:0}]}:{rooms:[{row:1,col:0}]}).ok).toBe(false)
    expect(JSON.stringify(session.state)).toBe(before)
    r=session.commitSelectionChoice(0,action==='stables'?{stables:[{row:0,col:0}]}:{rooms:[{row:0,col:0}]})
    expect(r.ok,r.error).toBe(true)
    expect(action==='stables'?r.state.players[0]!.stableTiles:r.state.players[0]!.roomTiles).toContainEqual({row:0,col:0})
    expect(r.state.players[0]!.resources.wood).toBe(action==='stables'?6:3)
    expect(r.state.players[0]!.resources.reed).toBe(action==='stables'?2:0)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid'}))
  })

  it('fences with own pieces and authoritative wood payment',()=>{
    const {session,player}=setup(afterCollect(leaf('fence')));player.resources.wood=4
    let r=collect(session);expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:'fence'}})
    r=session.commitSelectionChoice(0,{edges:['H-0-1','H-1-1','V-0-1','V-0-2'],extraWood:0})
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.pastures).toHaveLength(1)
    expect(r.state.players[0]!.resources.wood).toBe(3)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{wood:4}}))
  })

  it('renovates and grows an ordinary newborn; insufficient rooms cannot grow',()=>{
    const {session,player}=setup(afterCollect({type:'seq',children:[leaf('renovate-house'),leaf('family-growth')]}))
    player.resources.clay=3;player.resources.reed=1
    // No room: renovation succeeds, mandatory growth cannot conjure one.
    const r=collect(session)
    expect(r.state.players[0]!.houseType).toBe('clay');expect(r.state.players[0]!.resources).toMatchObject({clay:1,reed:0})
    expect(r.state.players[0]!.workers.filter(worker=>worker.isActive)).toHaveLength(2)
    const successful=setup(afterCollect(leaf('family-growth')))
    successful.player.roomTiles.push({row:0,col:0});successful.player.rooms=3
    const grown=collect(successful.session)
    expect(grown.state.players[0]!.workers.filter(worker=>worker.isActive)).toHaveLength(3)
    expect(grown.state.players[0]!.workers.filter(worker=>worker.isNewborn)).toHaveLength(1)
  })

  it('resolves card choice with serialized fourth ctx, then stores selected farm coordinates',()=>{
    const flow={type:'seq',children:[leaf('emit-choice',{params:{options:[{value:'yes',labelKey:'ui.interactionSelectionConfirm'}],requiresExplicitChoice:true}}),leaf('selection',{actionContext:{selectionKind:'farm-position',selectableTiles:[{row:0,col:1}],minSelections:1,maxSelections:1}})]} as ActionFlow
    const {session}=setup(afterCollect(flow, `resolveChoice:(_state,_player,choice,ctx)=>choice==='yes'&&ctx.sourceCard===CARD_ID?gainLeaf(CARD_ID,{clay:2}):undefined`))
    let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
    r=session.resolveChoice(0,'yes');expect(r.state.players[0]!.resources.clay).toBe(2)
    expect(r.interaction.request?.kind).toBe('selection')
    const before=JSON.stringify(session.state);expect(session.commitSelectionChoice(0,{positions:['0-2']}).ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    r=session.commitSelectionChoice(0,{positions:['0-1']});expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.cardStates[CARD]?.extraData?.selectedPositions).toEqual(['0-1'])
  })

  it('enforces resource commitments in pay and permits a later attempt after release',()=>{
    const {session,player}=setup(afterCollect(leaf('pay',{params:{food:1}}),`computeResourceCommitments:(_state,owner)=>owner.cardStates[CARD_ID]?.flagged?[]:[{playerId:owner.id,resources:{food:2}}]`))
    player.resources.food=2
    session.loadState(session.state)
    const before=JSON.stringify(session.state)
    let r=session.takeAction(0,'forest')
    expect(r.ok).toBe(false);expect(r.error).toContain('resource commitment');expect(JSON.stringify(session.state)).toBe(before)
    expect(r.state.players[0]!.resources.food).toBe(2)
    expect(r.state.events.some(event=>event.type==='resource.paid')).toBe(false)
    // Retry a different ordinary action after explicitly releasing this card's reservation.
    session.state.players[0]!.cardStates[CARD]={flagged:true}
    session.state.currentPlayerIndex=0;session.loadState(session.state);r=session.takeAction(0,'forest')
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.food).toBe(1)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{food:1},sourceCardId:CARD}))
  })

  it('uses fourth and fifth breeding arguments and adds shared zones without duplicating house',()=>{
    const {session,player,opponent}=setup(`{effect:{computeBreedThreshold:(_s,_p,animal,ctx)=>animal==='sheep'&&ctx.sourceCard===CARD_ID?1:undefined,
      computeBreedableAnimalCount:(_s,_p,animal,count,ctx)=>animal==='sheep'&&ctx.sourceCard===CARD_ID?count+1:undefined,
      onComputeSharedAnimalZones:(owner,animalOwner,_zones,state)=>owner.id!==animalOwner.id?[{id:'shared:'+owner.id,zoneType:'card',cardId:CARD_ID,ownerPlayerId:owner.id,animalOwnerPlayerId:animalOwner.id,capacity:state.round+1,animalType:null,animalCount:0}]:[],
      enforceReorganizeOnLastHarvest:(state)=>state.round===14,
      computeAnimalScoreAdjustment:(_s,_p,animal,ctx)=>animal==='horse'?ctx.quantity-ctx.baseScore:0}}`)
    session.withCtx(()=>{
      expect(getBreedThreshold(session.state,player,'sheep',{sourceCard:CARD})).toBe(1)
      expect(getBreedableAnimalCount(session.state,player,'sheep',2,{sourceCard:CARD})).toBe(3)
      expect(getBreedableAnimalCount(session.state,player,'boar',2,{sourceCard:CARD})).toBe(2)
      const zones=computeAnimalZones(opponent,session.state)
      expect(zones.filter(zone=>zone.id==='house')).toHaveLength(1)
      expect(zones).toContainEqual(expect.objectContaining({id:'shared:'+player.id,ownerPlayerId:player.id,animalOwnerPlayerId:opponent.id,capacity:2}))
      expect(shouldEnforceReorganizeOnLastHarvest(session.state,player)).toBe(false)
      session.state.round=14;expect(shouldEnforceReorganizeOnLastHarvest(session.state,player)).toBe(true)
      expect(getAnimalScoreAdjustment(session.state,player,'horse',{quantity:3,baseScore:2,categoryKey:'horse'})).toBe(1)
    })
    expect(session.cardWarnings).toEqual([])
  })

  it('persists local counters, flags, stack and data; cancels only this card/player/round future entries',()=>{
    const flow={type:'seq',children:[leaf('special-effect',{params:{kind:'increment-counter',key:'food',amount:2}}),leaf('special-effect',{params:{kind:'set-counter',key:'wood',value:3}}),leaf('special-effect',{params:{kind:'set-flag',flag:true}}),leaf('special-effect',{params:{kind:'increment-extra-data',key:'uses',amount:1}}),leaf('special-effect',{params:{kind:'set-extra-data',key:'picked',value:['0-1']}}),leaf('push-to-card-stack',{params:{item:'wood'}}),leaf('special-effect',{params:{kind:'pop-card-stack-top'}}),leaf('special-effect',{params:{kind:'set-infobox',text:'visible'}}),leaf('special-effect',{params:{kind:'remove-future-meeples',rounds:[2]}})]} as ActionFlow
    const {session,player,opponent,card}=setup(afterCollect(flow))
    session.state.futureMeeples=[['remove',CARD,player.id,2],['other-round',CARD,player.id,3],['other-card','CUSTOM_Other',player.id,2],['other-player',CARD,opponent.id,2]].map(([id,cardId,playerId,round])=>({id:String(id),cardId:String(cardId),playerId:String(playerId),round:Number(round),actionId:null,resources:{food:1}}))
    const r=collect(session);expect(r.state.futureMeeples.map(entry=>entry.id)).toEqual(['other-round','other-card','other-player'])
    expect(r.state.players[0]!.cardStates[CARD]).toMatchObject({counters:{food:2,wood:3},flagged:true,extraData:{uses:1,picked:['0-1']},stack:[]})
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'futureMeeple.removed',cardId:CARD,playerId:player.id}))
    const saved=session.withCtx(()=>serializeSessionSnapshot(session.state,session));const restored=new GameSession(rehydrateState(saved),[card]);sessions.push(restored)
    expect(restored.state.players[0]!.cardStates[CARD]).toEqual(r.state.players[0]!.cardStates[CARD]);expect(restored.state.futureMeeples).toEqual(r.state.futureMeeples)
  })

  it('before-end mandatory all-player scope pays both targets and finishes scoring',()=>{
    const {session}=setup(`{effect:{beforeEndGameScope:'allPlayers',beforeEndGameMandatory:true,onBeforeEndGame:()=>gainLeaf(CARD_ID,{food:1})}}`)
    session.state.round=14
    for(const player of session.state.players){markAllWorkersUsed(session.state,player);setActiveWorkerCount(player,0);player.resources.food=0}
    session.loadState(session.state);const r=session.invokeAfterRoundEnd()
    expect(r.state.players.map(player=>player.resources.food)).toEqual([1,1]);expect(r.state.gameOver).toBe(true)
    expect(r.state.events.filter(event=>event.type==='resource.moved'&&event.sourceCardId===CARD)).toHaveLength(2)
  })

  it('finishes authoritative scoring and records warnings for malformed sandbox scoring queries',()=>{
    const {session}=setup('{effect:{computeCostedBonus:()=>({}),computeSharedPostScore:()=>({})}}')
    session.state.round=14
    for(const player of session.state.players){markAllWorkersUsed(session.state,player);setActiveWorkerCount(player,0)}
    session.loadState(session.state)
    const result=session.invokeAfterRoundEnd()
    expect(result.ok,result.error).toBe(true);expect(result.state.gameOver).toBe(true)
    const scores=session.withCtx(()=>Scoring.computeAll(result.state))
    expect(scores).toHaveLength(2);expect(scores.every(score=>Number.isFinite(score.total))).toBe(true)
    expect(session.cardWarnings).toEqual(expect.arrayContaining([expect.stringContaining('Costed bonus must be an array'),expect.stringContaining('Shared score must be an array')]))
  })

  it('counts only remaining extra opportunities, without losing the contributor before workers',()=>{
    const {session,player}=setup(`{effect:{extraTurnBeforeWorkers:true,countExtraTurns:()=>2,contributeExtraTurn:()=>gainLeaf(CARD_ID,{food:1})}}`)
    session.withCtx(()=>{expect(countPendingExtraTurns(session.state,player)).toBe(2);player._extraTurnSkipCountsByCard={[CARD]:1};expect(countPendingExtraTurns(session.state,player)).toBe(1);player._extraTurnConsumedCountsByCard={[CARD]:1};expect(countPendingExtraTurns(session.state,player)).toBe(0);expect(getCardEffect(CARD)?.extraTurnBeforeWorkers).toBe(true)})
  })
})

describe('Workshop purchases and listener windows',()=>{
  it('restricts minor candidates and rejects a disallowed hand card without partial payment',()=>{
    const {session,player}=setup(afterCollect(leaf('improvement',{params:{types:['minor'],allowedPurchases:[CARD,'A053_Claypipe']}}),'',"zones:['hand'],"),'cost:{wood:1}')
    player.minorPlayed=[];player.minorHand=[CARD,'A053_Claypipe','A004_Baseboards'];player.resources.clay=3
    let r=collect(session)
    expect(r.interaction.request?.kind).toBe('choice')
    expect(r.interaction.request?.options?.map(option=>option.value)).toEqual([CARD,'A053_Claypipe'])
    const before=JSON.stringify(session.state)
    expect(session.resolveChoice(0,'A004_Baseboards').ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    r=session.resolveChoice(0,CARD)
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.minorPlayed).toContain(CARD)
    expect(r.state.players[0]!.minorPlayed).not.toContain('A004_Baseboards')
    expect(r.state.players[0]!.resources).toMatchObject({wood:2,clay:3,food:2})
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{wood:1}}))
  })

  it.each([0,1])('enforces minimum real clay payment despite food substitution (clay=%s)',clay=>{
    const flow=leaf('improvement',{params:{types:['major'],allowedPurchases:['Major_Fireplace1']},actionContext:{minimumResourcesPaid:{clay:1}}})
    const implementation=afterCollect(flow).slice(0,-2)+",{actions:['improvement'],phases:['computeCosts'],handler:()=>({trades:[{from:{food:1},to:{clay:1},max:2}]})}]}"
    const {session,player}=setup(implementation)
    player.resources.clay=clay;player.resources.food=2-clay
    let r=collect(session)
    if(r.interaction.request?.kind==='choice')r=session.resolveChoice(0,'Major_Fireplace1')
    expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.improvements.includes('Major_Fireplace1')).toBe(clay===1)
    expect(r.state.players[0]!.resources.food).toBe(clay===1?0:2)
    expect(r.state.players[0]!.resources.clay).toBe(0)
    if(clay===1)expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{food:1,clay:1}}))
    else expect(r.state.events.some(event=>event.type==='resource.paid')).toBe(false)
    expect(session.cardWarnings).toEqual([])
  })

  it.each([false,true])('derives actual owned cards for declarative card-return purchase costs (owned=%s)',owned=>{
    const {session,player}=setup(afterCollect(leaf('improvement',{params:{types:['minor'],allowedPurchases:[CARD]}}),'',"zones:['hand'],"),"cost:{fee:{wood:5},cards:{type:'Major',list:['Major_Fireplace1']}}")
    player.minorPlayed=[];player.minorHand=[CARD];player.resources.wood=0
    if(owned)player.improvements=['Major_Fireplace1']
    const result=collect(session)
    expect(result.state.players[0]!.resources.wood).toBe(3)
    expect(result.state.players[0]!.minorPlayed.includes(CARD)).toBe(owned)
    expect(result.state.players[0]!.minorHand.includes(CARD)).toBe(!owned)
    expect(result.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
    expect(session.cardWarnings).toEqual([])
  })

  it.each(['major','minor'] as const)('purchases %s improvements through native payment and onBuy',type=>{
    const target=type==='major'?'Major_Fireplace1':CARD
    const {session,player}=setup(afterCollect(leaf('improvement',{params:{types:[type],allowedPurchases:[target]}}),`onBuy:(_s,_p,paid,ctx)=>ctx?.reportProtectedObservation===undefined&&paid.resourcesPaid.wood===1?gainLeaf(CARD_ID,{food:2}):undefined`,type==='minor'?"zones:['hand'],":''),'cost:{wood:1}')
    player.minorPlayed=[];player.minorHand=[CARD];player.resources.clay=2
    // The minor source triggers from its declared hand zone; buying it removes that trigger.
    if(type==='major')player.minorPlayed=[CARD]
    let r=collect(session)
    if(r.interaction.request?.kind==='choice')r=session.resolveChoice(0,r.interaction.request.options.find(option=>option.value===target||option.value.includes(target))!.value)
    expect(r.ok,r.error).toBe(true)
    if(type==='major'){expect(r.state.players[0]!.improvements).toContain(target);expect(r.state.players[0]!.resources.clay).toBe(0)}
    else{expect(r.state.players[0]!.minorPlayed).toContain(CARD);expect(r.state.players[0]!.minorHand).not.toContain(CARD);expect(r.state.players[0]!.resources).toMatchObject({wood:2,food:4})}
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid'}));expect(session.cardWarnings).toEqual([])
  })

  it('plays a hand occupation with explicit params fee and preserves its onBuy',()=>{
    const {session,player}=setup(afterCollect(leaf('occupation',{params:{allowedCards:['A086_AnimalTamer'],exactCost:{food:1}}})))
    player.occupationHand=['A086_AnimalTamer'];player.resources.food=2
    let r=collect(session);expect(r.ok,r.error).toBe(true)
    expect(r.interaction.request?.kind).toBe('choice')
    r=session.resolveChoice(0,r.interaction.request!.options!.find(option=>option.effectPreview?.kind==='resourceExchange'&&option.effectPreview.resourcesGained?.grain===1 || option.labelKey==='resources.grain')?.value ?? r.interaction.request!.options![1]!.value)
    expect(r.state.players[0]!.resources.grain).toBe(1)
    expect(r.state.players[0]!.occupationPlayed).toContain('A086_AnimalTamer');expect(r.state.players[0]!.occupationHand).not.toContain('A086_AnimalTamer')
    expect(r.state.players[0]!.resources.food).toBe(1);expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{food:1}}))
  })

  it('offers computeExchanges in the real catalog and pays the registered trade once',()=>{
    const {session,player}=setup(`{listeners:[{phases:['computeExchanges'],handler:ctx=>ctx.extraData.window==='anytime'?{extraExchanges:[{from:{wood:1},to:{food:2},max:1,triggers:['anytime']}]}:undefined}]}`)
    player.resources.wood=1;session.loadState(session.state)
    expect(session.getState().interaction.anytimeActions.map(action=>action.id)).toContain('exchange')
    let r=session.takeAnytimeAction(0,'exchange');expect(r.ok,r.error).toBe(true)
    if(r.interaction.request?.kind==='choice'){
      const trade=r.interaction.request.options.find(option=>option.value!== '__skip__'&&option.effectPreview?.kind==='resourceExchange')!
      r=session.resolveChoice(0,trade.value)
    }
    expect(r.state.players[0]!.resources).toMatchObject({wood:0,food:4});expect(session.cardWarnings).toEqual([])
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.exchanged'}))
  })

  it('offers pre-scoring once, retains block policy in a nested choice, and changes first player',()=>{
    const {session}=setup(`{listeners:[{phases:['anytime'],preScoring:true,blockedAnytimeInteractionKinds:['choice'],handler:ctx=>!ctx.ownerPlayer.cardStates[CARD_ID]?.flagged?{flow:{type:'seq',children:[{type:'leaf',actionId:'set-first-player',sourceCard:CARD_ID},{type:'leaf',actionId:'special-effect',sourceCard:CARD_ID,params:{kind:'set-flag',flag:true}}]}}:undefined}]}`)
    session.state.round=14;session.state.roundFirstPlayerId=session.state.players[1]!.id;session.state.players[0]!.startPlayer=false;session.state.players[1]!.startPlayer=true
    for(const p of session.state.players){markAllWorkersUsed(session.state,p);setActiveWorkerCount(p,0)}
    session.loadState(session.state);let r=session.invokeAfterRoundEnd();expect(r.state.gameOver).toBe(false);expect(r.interaction.request?.kind).toBe('choice')
    expect(r.interaction.anytimeActions.map(action=>action.id)).not.toContain(CARD+':listener:0')
    const chosen=r.interaction.request!.options!.find(option=>option.value!== '__skip__')!;r=session.resolveChoice(0,chosen.value)
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.cardStates[CARD]?.flagged).toBe(true);expect(r.state.players.map(player=>player.startPlayer)).toEqual([true,false])
    if(r.interaction.request?.kind==='choice')r=session.resolveChoice(r.interaction.playerIndex,'__skip__')
    expect(r.state.gameOver).toBe(true)
  })

  it('uses hand-only listeners for the owner, then stops after the card is played',()=>{
    const {session,player,opponent}=setup(`{listeners:[{zones:['hand'],actions:['collect'],phases:['after'],mandatory:true,handler:()=>({flow:gainLeaf(CARD_ID,{food:1})})}]}`)
    player.minorPlayed=[];player.minorHand=[CARD];let r=collect(session);expect(r.state.players[0]!.resources.food).toBe(3)
    if(r.interaction.request?.kind==='confirm-next-player')r=session.resolveChoice(r.interaction.playerIndex,'confirm')
    r=session.takeAction(1,'clay-pit');expect(r.ok,r.error).toBe(true);expect(r.state.players[1]!.resources.food).toBe(3)
    session.state.players[0]!.minorHand=['__test_placeholder__'];session.state.players[0]!.minorPlayed=[CARD];session.state.currentPlayerIndex=0
    if(r.interaction.request?.kind==='confirm-next-player')r=session.resolveChoice(r.interaction.playerIndex,'confirm')
    r=session.takeAction(0,'reed-bank');expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.food).toBe(3)
    expect(opponent.cardStates[CARD]).toBeUndefined()
  })
})

describe('Workshop stage and animal settlement',()=>{
  it.each([['food'],['unknown'],['horse'],['sheep','sheep']])('rejects invalid breed selection %j before animal settlement',(...animals)=>{
    const {session,player}=setup(afterCollect(leaf('breed',{actionContext:{animalTypes:animals}}),'computeBreedThreshold:()=>0'))
    player.resources.sheep=2
    session.loadState(session.state);const before=JSON.stringify(session.state)
    const r=session.takeAction(0,'forest');expect(r.ok).toBe(false);expect(r.error).toContain('Breed animal')
    expect(JSON.stringify(session.state)).toBe(before)
    expect(r.state.players[0]!.resources).toMatchObject({food:2,sheep:2})
    expect(Object.values(r.state.players[0]!.resources).every(Number.isFinite)).toBe(true)
    expect(r.state.events.some(event=>event.type==='farm.animalBred')).toBe(false)
    expect(session.cardWarnings.some(warning=>warning.includes('Breed animal'))).toBe(true)
  })

  it.each([false,true])('checks shared-zone data before opponent placement (valid=%s)',valid=>{
    const groups=valid?"['group']":"{}"
    const {session,opponent}=setup(`{effect:{onComputeSharedAnimalZones:()=>[{id:'shared',zoneType:'card',capacity:1,requiredEmptyZoneGroupIds:${groups}}]},listeners:[{actions:['collect'],phases:['after'],scope:'any',mandatory:true,handler:ctx=>({flow:{type:'leaf',actionId:'reorganize',sourceCard:CARD_ID,targetPlayerId:ctx.player.id}})}]}`)
    opponent.resources.sheep=1;opponent.pastures=[{id:'pasture',size:1,tiles:[{row:0,col:1}],stables:0,animalType:null,animalCount:0}];session.state.currentPlayerIndex=1;session.loadState(session.state)
    let r=session.takeAction(1,'forest')
    expect(r.ok,r.error).toBe(true)
    expect(r.interaction.request?.kind).toBe('animal-reorg')
    r=session.resolveChoice(1,'confirm',{zones:[{id:'house',zoneType:'house',animalType:'sheep',animalCount:1},{id:'pasture',zoneType:'pasture',animalType:null,animalCount:0},...(valid?[{id:'shared',zoneType:'card',animalType:null,animalCount:0}]:[])]})
    expect(r.ok,r.error).toBe(true);expect(r.state.players[1]!.resources.sheep).toBe(1)
    expect(session.withCtx(()=>computeAnimalZones(session.state.players[1]!,session.state)).some(zone=>zone.id==='shared')).toBe(valid)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'farm.animalMoved'}))
    if(valid)expect(session.cardWarnings).toEqual([])
    else expect(session.cardWarnings).toEqual(expect.arrayContaining([expect.stringContaining('Empty zone groups')]))
  })

  it.each([
    ['after reaping','preHarvestGoodsWanted:[\'grain\']',false],
    ['before reaping','preHarvestGoodsWantedBeforeReap:[\'grain\']',true],
    ['skip eligible','preHarvestGoodsWanted:[\'grain\'],maySkipHarvestFieldPhase:true',true],
  ] as const)('uses metadata-only Harvest demand: %s',(_label,effect,wantsPrep)=>{
    const {session,player}=setup(`{effect:{${effect}}}`,"exchanges:[{from:{wood:1},to:{grain:1},triggers:['harvest']}]")
    player.resources.wood=1;player.fields=[{row:0,col:1,stacks:[{kind:'grain',remaining:3}]}]
    session.state.round=4;for(const p of session.state.players){markAllWorkersUsed(session.state,p);p.resources.food=10}
    session.loadState(session.state);const r=session.invokeHarvestFromBeforeHarvest()
    if(wantsPrep){expect(r.interaction.request?.kind).toBe('choice');expect(r.interaction.spaceId).toBe('__stage:harvestPrepWindow');expect(r.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(3)}
    else{expect(r.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2);expect(r.state.players[0]!.resources.grain).toBe(1)}
    expect(session.cardWarnings).toEqual([])
  })

  it('settles private breeding and animal reorganization using the lowered threshold',()=>{
    const {session,player}=setup(afterCollect(leaf('breed',{actionContext:{animalTypes:['sheep'],sourceCard:CARD}}),`computeBreedThreshold:(_s,_p,animal,ctx)=>animal==='sheep'&&ctx.sourceCard===CARD_ID?1:undefined,onStartHarvest:()=>gainLeaf(CARD_ID,{stone:99})`))
    player.resources.sheep=1;player.pastures=[{id:'pasture',size:2,tiles:[{row:0,col:1},{row:0,col:2}],stables:0,animalType:'sheep',animalCount:1}]
    let r=collect(session);expect(r.state.players[0]!.resources.sheep).toBe(2);expect(r.interaction.request?.kind).toBe('animal-reorg')
    r=session.resolveChoice(0,'confirm',{zones:[{id:'pasture',zoneType:'pasture',animalType:'sheep',animalCount:2},{id:'house',zoneType:'house',animalType:null,animalCount:0}]})
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.pastures[0]!.animalCount).toBe(2);expect(r.state.players[0]!.resources.stone).toBe(0);expect(r.state.roundPhase).toBe('work')
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'farm.animalMoved'}));expect(session.cardWarnings).toEqual([])
  })

  it('applies horse-score adjustment to the real FOTM score category',()=>{
    const {session,player}=setup(`{effect:{computeAnimalScoreAdjustment:(_s,_p,animal,ctx)=>animal==='horse'&&ctx.categoryKey==='horses'&&ctx.quantity===3&&ctx.baseScore===3?2:0}}`)
    player.resources.horse=3;session.state.enableFarmersOfTheMoor=true
    session.withCtx(()=>expect(Scoring.breakdown(session.state,0).categories.find(category=>category.key==='horses')).toMatchObject({quantity:3,total:5}))
    session.state.enableFarmersOfTheMoor=false;session.withCtx(()=>expect(Scoring.breakdown(session.state,0).categories.some(category=>category.key==='horses')).toBe(false))
  })

  it('replaces a turn without consuming a worker and prevents repeated activation',()=>{
    const {session,player}=setup(`{listeners:[{phases:['anytime'],replacesTurn:true,handler:ctx=>!ctx.ownerPlayer.cardStates[CARD_ID]?.flagged?{flow:{type:'seq',children:[gainLeaf(CARD_ID,{food:1}),{type:'leaf',actionId:'special-effect',sourceCard:CARD_ID,params:{kind:'set-flag',flag:true}}]}}:undefined}]}`)
    session.loadState(session.state);expect(session.getState().interaction.anytimeActions.map(action=>action.id)).toContain(CARD+':listener:0')
    const workersBefore=workersAvailable(session.state,player);let r=session.takeAnytimeAction(0,CARD+':listener:0')
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.food).toBe(3);expect(workersAvailable(session.state,session.state.players[0]!)).toBe(workersBefore)
    expect(r.interaction.request).toMatchObject({kind:'confirm-next-player',nextPlayerIndex:1})
    r=session.resolveChoice(0,'confirm');expect(r.state.currentPlayerIndex).toBe(1)
    expect(session.takeAnytimeAction(0,CARD+':listener:0').ok).toBe(false)
  })

  it('executes exactly two extra opportunities through ordinary rotation',()=>{
    const {session,player,opponent}=setup(`{effect:{countExtraTurns:(_s,p)=>2-(p.cardStates[CARD_ID]?.counters?.used??0),contributeExtraTurn:(_s,p)=>(p.cardStates[CARD_ID]?.counters?.used??0)<2?{type:'seq',children:[gainLeaf(CARD_ID,{food:1}),{type:'leaf',actionId:'special-effect',sourceCard:CARD_ID,params:{kind:'increment-counter',key:'used',amount:1}}]}:undefined}}`)
    markAllWorkersUsed(session.state,player);setActiveWorkerCount(player,0);setActiveWorkerCount(opponent,2);setWorkersAtHome(session.state,opponent,2);session.state.currentPlayerIndex=1
    session.loadState(session.state);let r=session.takeAction(1,'forest')
    if(r.interaction.request?.kind==='confirm-next-player')r=session.resolveChoice(r.interaction.playerIndex,'confirm')
    expect(r.state.players[0]!.resources.food).toBe(3);expect(r.state.players[0]!.cardStates[CARD]?.counters?.used).toBe(1)
    if(r.interaction.request?.kind==='confirm-next-player')r=session.resolveChoice(r.interaction.playerIndex,'confirm')
    r=session.takeAction(1,'clay-pit');if(r.interaction.request?.kind==='confirm-next-player')r=session.resolveChoice(r.interaction.playerIndex,'confirm')
    expect(r.state.players[0]!.resources.food).toBe(4);expect(r.state.players[0]!.cardStates[CARD]?.counters?.used).toBe(2)
    session.withCtx(()=>expect(countPendingExtraTurns(session.state,session.state.players[0]!)).toBe(0))
  })
})

describe('Workshop declarative metadata settlement',()=>{
  it.each([
    [{vp:'2'},'Printed VP'],
    [{prerequisite:{}},'prerequisite'],
    ...[{}, [], 2, null].map(players=>[{players},'Card players'] as const),
    [{name:{}},'Card name'],[{passing:'false'},'Card passing'],[{desc:{}},'Card desc'],[{rules:[{}]},'Card rules'],[{number:0.5},'integer'],[{locales:{zh:{name:[],desc:[]}}},'Card locale name'],
    ...['conditions','discount','from','max'].map(key=>[{modifier:{type:'remove-resource',cardId:CARD,appliesTo:['stables'],resources:['wood'],[key]:key==='conditions'?{houseTypeStone:1}:1}},'unsupported field'] as const),
    [{cost:{wood:0.5}},'integer'],
    [{exchanges:[{from:{wood:1},to:{food:1},max:0.5}]},'integer'],
    [{cost:{unitFee:{food:1},nb:0.5}},'integer'],
    [{cost:{fee:{food:2},bonuses:[{discount:{food:1},conditions:{minNumRooms:'3'}}]}},'Condition minNumRooms'],
    [{cost:{fee:{food:2},trades:[{from:{wood:1},to:{food:1},triggers:['harvest']}]}},'unsupported field'],
    [{cost:{fee:{wood:2},bonuses:[{}]}},'exactly one'],
    [{cost:{fee:{wood:2},bonuses:[{discount:{wood:1},choices:[]}]}},'exactly one'],
    [{cost:{fee:{wood:2},bonuses:[{choices:[]}]}},'non-empty'],
    [{modifier:{type:'trade',cardId:CARD,appliesTo:['stables'],from:{food:1},to:{wood:1},groupId:'g'}},'set together'],
    [{modifier:{type:'trade',cardId:CARD,appliesTo:['stables'],from:{food:1},to:{wood:1},scope:'unit',conditions:{minNumRooms:2}}},'MUST NOT'],
    [{occupationPrerequisites:{min:'2'}},'Prerequisite'],
    [{improvementPrerequisites:{min:2,max:1}},'cannot exceed'],
    [{modifiers:[{type:'remove-resource',cardId:CARD,appliesTo:['stables']}]},'Removed cost resources'],
    [{altCosts:[{fee:{wood:2}}]},'Unsupported resource'],
    [{returnCards:'Major_Fireplace1'},'returnCards'],
    [{exchanges:[{from:{},to:{food:1}}]},'positive input'],
    [{cost:{fee:{wood:2},resourceReserve:{}}},'Reserve resources'],
  ] as const)('rejects malformed persisted metadata before registration and preserves a working Session', (metadata,error)=>{
    const {session,card}=setup(afterCollect(leaf('stables')))
    const invalid={...card,cardJson:{...card.cardJson}};Object.assign(invalid.cardJson,metadata)
    const before=JSON.stringify(session.state)
    expect(()=>session.withCtx(()=>registerCustomCard(invalid))).toThrow(error)
    expect(JSON.stringify(session.state)).toBe(before)
    let r=collect(session)
    r=session.commitSelectionChoice(0,{stables:[{row:0,col:0}]})
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.wood).toBe(1)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{wood:2}}))
  })

  it('uses flat alternative costs and actual owned returnCards when purchasing',()=>{
    const alt=setup(afterCollect(leaf('improvement',{params:{types:['minor'],allowedPurchases:[CARD]}}),'',"zones:['hand'],"),'cost:{stone:5},altCosts:[{wood:2}]')
    alt.player.minorPlayed=[];alt.player.minorHand=[CARD]
    const paid=collect(alt.session)
    expect(paid.state.players[0]!.minorPlayed).toContain(CARD);expect(paid.state.players[0]!.resources.wood).toBe(1)
    const returned=setup(afterCollect(leaf('improvement',{params:{types:['minor'],allowedPurchases:[CARD]}}),'',"zones:['hand'],"),"cost:{wood:5},returnCards:['Major_Fireplace1']")
    returned.player.minorPlayed=[];returned.player.minorHand=[CARD];returned.player.improvements=['Major_Fireplace1'];returned.player.resources.wood=2
    const r=collect(returned.session)
    expect(r.state.players[0]!.minorPlayed).toContain(CARD);expect(r.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
    expect(r.state.players[0]!.resources.wood).toBe(0)
    expect(alt.session.cardWarnings).toEqual([]);expect(returned.session.cardWarnings).toEqual([])
  })

  it('settles admitted remove-resource discounts and reserve-constrained payments',()=>{
    const removed=setup(afterCollect(leaf('stables')),"modifier:{type:'remove-resource',cardId:CARD_ID,appliesTo:['stables'],resources:['wood']}")
    collect(removed.session)
    const built=removed.session.commitSelectionChoice(0,{stables:[{row:0,col:0}]})
    expect(built.ok,built.error).toBe(true);expect(built.state.players[0]!.resources.wood).toBe(3)
    expect(built.state.players[0]!.stableTiles).toContainEqual({row:0,col:0})
    const reserved=setup(afterCollect(leaf('pay',{params:{cost:{fee:{wood:2},resourceReserve:{resources:['wood'],minimum:2}}}})))
    reserved.player.resources.wood=1
    const paid=collect(reserved.session)
    expect(paid.state.players[0]!.resources.wood).toBe(2)
    expect(paid.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{wood:2}}))
    expect(removed.session.cardWarnings).toEqual([]);expect(reserved.session.cardWarnings).toEqual([])
  })

  it('settles a finite bounded zero-input exchange without infinite resources',()=>{
    const {session}=setup('{}',"exchanges:[{from:{},to:{food:1},max:1,triggers:['anytime']}]")
    session.loadState(session.state)
    let r=session.takeAnytimeAction(0,'exchange');expect(r.ok,r.error).toBe(true)
    if(r.interaction.request?.kind==='choice')r=session.resolveChoice(0,r.interaction.request.options.find(option=>option.value!=='__skip__')!.value)
    expect(r.state.players[0]!.resources.food).toBe(3)
    expect(Object.values(r.state.players[0]!.resources).every(Number.isFinite)).toBe(true)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.exchanged'}));expect(session.cardWarnings).toEqual([])
  })

  it('registers CARD_DEF modifiers before calculating an ordinary stable payment',()=>{
    const {session}=setup(afterCollect(leaf('stables')),"modifiers:[{type:'bonus',cardId:CARD_ID,appliesTo:['stables'],discount:{wood:1},optional:false}]")
    let r=collect(session);expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:'stable'}})
    r=session.commitSelectionChoice(0,{stables:[{row:0,col:0}]});expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources.wood).toBe(2)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{wood:1}}));expect(session.cardWarnings).toEqual([])
  })

  it('rejects Card Field metadata which cannot settle without native paired hooks',()=>{
    const result=validateAndCompileCustomCode(`const CARD_ID='${CARD}';const CARD_DEF={cardType:'minor',meta:{id:CARD_ID,name:'Field',cardField:{allowedCrops:['grain'],capacity:1}}};const CARD_IMPL={}`,CARD)
    expect(result).toMatchObject({valid:false,errors:[expect.stringContaining("unsupported field 'cardField'")]})
  })
})

describe('Workshop admitted player, choice and payment data',()=>{
  it.each([{fields:1,grain:2,bounds:{minSelections:2,maxSelections:2}},{fields:2,grain:1,bounds:{minSelections:2,maxSelections:2}},{fields:1,grain:1,bounds:{maxSelections:0}},{fields:1,grain:1,bounds:{minSelections:0,maxSelections:0}}])('does not open an impossible sow selection with $fields fields and $grain seeds',({fields,grain,bounds})=>{
    const {session,player}=setup(afterCollect(leaf('sow',{actionContext:bounds})))
    player.fields=Array.from({length:fields},(_,index)=>({row:0,col:index+1,stacks:[]}));player.resources.grain=grain
    session.loadState(session.state);const before=JSON.stringify(session.state),r=session.takeAction(0,'forest')
    expect(r.ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    expect(r.interaction.request?.kind).not.toBe('farm-select');expect(r.interaction.request?.kind).not.toBe('engine-blocked')
    expect(r.state.players[0]!.resources.grain).toBe(grain);expect(r.state.players[0]!.fields.every(field=>field.stacks.length===0)).toBe(true)
    expect(r.state.events.some(event=>event.type==='farm.sown')).toBe(false)
  })

  it('retains native nonempty sow settlement when the declared minimum is zero',()=>{
    const {session,player}=setup(afterCollect(leaf('sow',{actionContext:{minSelections:0,maxSelections:1}})))
    player.fields=[{row:0,col:1,stacks:[]}];player.resources.grain=1
    let r=collect(session);expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:'sow',minSelections:0,maxSelections:1}})
    const before=JSON.stringify(session.state);expect(session.commitSelectionChoice(0,{crops:[]}).ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    r=session.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'}]});expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.fields[0]!.stacks).toEqual([{kind:'grain',remaining:3}]);expect(r.state.players[0]!.resources.grain).toBe(0);expect(r.interaction.request?.kind).not.toBe('engine-blocked')
  })

  it('sows the required two fields using two seeds before resuming its reward',()=>{
    const flow={type:'seq',children:[leaf('sow',{actionContext:{minSelections:2,maxSelections:2}}),leaf('gain',{params:{food:1}})]} as ActionFlow
    const {session,player}=setup(afterCollect(flow));player.fields=[{row:0,col:1,stacks:[]},{row:0,col:2,stacks:[]}];player.resources.grain=2
    let r=collect(session);expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:'sow',minSelections:2,maxSelections:2}})
    expect(r.state.players[0]!.resources.food).toBe(2)
    const before=JSON.stringify(session.state);expect(session.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'}]}).ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    r=session.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'},{row:0,col:2,crop:'grain'}]});expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({grain:0,food:3});expect(r.state.players[0]!.fields.map(field=>field.stacks)).toEqual([[{kind:'grain',remaining:3}],[{kind:'grain',remaining:3}]])
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'farm.sown'}));expect(session.cardWarnings).toEqual([])
  })

  it('checks the sow minimum after an earlier plow creates the second field',()=>{
    const flow={type:'seq',children:[leaf('plow'),leaf('sow',{actionContext:{minSelections:2,maxSelections:2}}),leaf('gain',{params:{food:1}})]} as ActionFlow
    const {session,player}=setup(afterCollect(flow));player.fields=[{row:0,col:1,stacks:[]}];player.resources.grain=2
    let r=collect(session);expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:'plow'}})
    r=session.commitSelectionChoice(0,{tile:{row:0,col:2}});expect(r.ok,r.error).toBe(true);expect(r.interaction.request).toMatchObject({kind:'farm-select',farm:{farmType:'sow',minSelections:2}})
    r=session.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'},{row:0,col:2,crop:'grain'}]});expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({grain:0,food:3});expect(r.state.players[0]!.fields).toContainEqual(expect.objectContaining({row:0,col:2,stacks:[{kind:'grain',remaining:3}]}));expect(session.cardWarnings).toEqual([])
  })

  it('rejects a forced unavailable sow branch and keeps its original menu for another choice',()=>{
    const flow={type:'xor',children:[leaf('sow',{actionContext:{minSelections:2,maxSelections:2}}),leaf('gain',{params:{stone:1}})]} as ActionFlow
    const implementation=afterCollect(flow).slice(0,-2)+",{actions:['sow'],phases:['isDoable'],handler:()=>({doable:true})}]}"
    const {session,player}=setup(implementation);player.fields=[{row:0,col:1,stacks:[]}];player.resources.grain=2
    let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
    const options=r.interaction.request!.options,sow=options.find(option=>option.labelKey==='actions.sow.name')!
    const before=JSON.stringify(session.state);r=session.resolveChoice(0,sow.value)
    expect(r.ok).toBe(false);expect(r.error).toContain('Sow selection minimum');expect(JSON.stringify(session.state)).toBe(before);expect(r.interaction.request?.kind).toBe('choice')
    r=session.resolveChoice(0,options.find(option=>option.value!==sow.value)!.value);expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({grain:2,stone:1});expect(r.state.events.some(event=>event.type==='farm.sown')).toBe(false)
  })

  it('queues a complete range request and delivers food in the next two rounds',()=>{
    const {session}=setup(`{listeners:[{actions:['collect'],phases:['after'],mandatory:true,handler:ctx=>({flow:{type:'leaf',actionId:'future-meeples',params:{__futureMeepleRequest:{cardId:CARD_ID,playerId:ctx.player.id,startRound:2,count:2,resources:{food:1}}}}})}]}`)
    let r=collect(session);expect(r.state.futureMeeples.map(entry=>({round:entry.round,resources:entry.resources}))).toEqual([{round:2,resources:{food:1}},{round:3,resources:{food:1}}])
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'futureMeeple.queued',cardId:CARD}))
    for(const round of [2,3]){
      for(const player of session.state.players){markAllWorkersUsed(session.state,player);setActiveWorkerCount(player,0)}
      session.loadState(session.state);r=session.invokeAfterRoundEnd();expect(r.ok,r.error).toBe(true)
      expect(r.state.round).toBe(round);expect(r.state.players[0]!.resources.food).toBe(round+1);expect(r.state.players[1]!.resources.food).toBe(3)
    }
    expect(session.cardWarnings).toEqual([])
  })

  it('settles whole unit fees and a generated exchange choice capped at one use',()=>{
    const flow={type:'seq',children:[leaf('pay',{params:{cost:{unitFee:{food:1},nb:2}}}),leaf('exchange',{actionContext:{tradeIds:[CARD]}})]} as ActionFlow
    const {session}=setup(afterCollect(flow),"exchanges:[{from:{wood:1},to:{food:1},max:1,triggers:['anytime']}]");let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
    const option=r.interaction.request!.options.find(option=>option.effectPreview?.kind==='resourceExchange')!
    expect(option.effectPreview).toMatchObject({resourcesPaid:{wood:1},resourcesGained:{food:1}})
    r=session.resolveChoice(0,option.value);expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources).toMatchObject({wood:2,food:1})
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{food:2}}))
    expect(r.state.events.filter(event=>event.type==='resource.exchanged')).toHaveLength(1);expect(Object.values(r.state.players[0]!.resources).every(Number.isInteger)).toBe(true)
  })

  it.each([2,3])('applies a room-conditioned bonus only when %i rooms meet its minimum',rooms=>{
    const {session,player}=setup(afterCollect(leaf('pay',{params:{cost:{fee:{food:2},bonuses:[{discount:{food:1},conditions:{minNumRooms:3}}]}}})))
    if(rooms===3)player.roomTiles.push({row:0,col:0});player.rooms=rooms
    const r=collect(session);const paid=rooms===3?1:2
    expect(r.state.players[0]!.resources.food).toBe(2-paid);expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{food:paid}}));expect(session.cardWarnings).toEqual([])
  })

  it('finishes scoring with numeric printed VP on the played custom card',()=>{
    const {session}=setup('{}','vp:2');session.state.round=14
    for(const player of session.state.players){markAllWorkersUsed(session.state,player);setActiveWorkerCount(player,0)}
    session.loadState(session.state);const r=session.invokeAfterRoundEnd();expect(r.ok,r.error).toBe(true);expect(r.state.gameOver).toBe(true)
    const scores=session.withCtx(()=>Scoring.computeAll(r.state))
    expect(scores.every(score=>Number.isFinite(score.total))).toBe(true)
    expect(scores[0]!.categories.flatMap(category=>category.entries)).toContainEqual(expect.objectContaining({cardId:CARD,score:2}))
  })

  it.each(['flow','extraData','alternativeFlow'] as const)('selects an opponent farm extension with %s bound to its native actor',kind=>{
    const selection={selectableTiles:[{row:-1,col:1},{row:-1,col:2}],minSelections:1,maxSelections:1}
    const override=kind==='flow'?'':`,{actions:['selection'],phases:['${kind==='extraData'?'computeArgs':'computeReplace'}'],scope:'any',handler:()=>(${JSON.stringify(kind==='extraData'?{extraData:selection}:{decline:true,alternativeFlow:leaf('selection',{actionContext:selection})})})}`
    const {session,player,opponent}=setup(`{listeners:[{actions:['collect'],phases:['after'],mandatory:true,handler:ctx=>({flow:{type:'seq',targetPlayerId:ctx.state.players[1].id,children:[{type:'leaf',actionId:'selection',actionContext:${JSON.stringify(selection)}},gainLeaf(CARD_ID,{food:1})]}})}${override}]}`,'',true)
    for (const player of session.state.players) player.farmTerrain=[]
    player.resources.food=2;opponent.resources.food=3
    opponent.farmyardExtensions=[{id:'native-extension',tiles:[{row:-1,col:1},{row:-1,col:2}]}]
    let r=collect(session);expect(r.interaction.request).toMatchObject({kind:'confirm-player-switch',fromPlayerIndex:0,toPlayerIndex:1})
    r=session.resolveChoice(r.interaction.playerIndex,'confirm');expect(r.ok,r.error).toBe(true)
    if(kind==='alternativeFlow'){
      expect(r.interaction.request?.kind).toBe('choice')
      const replacement=r.interaction.request!.options.find(option=>option.labelKey!=='ui.interactionDoNotReplace')!
      r=session.resolveChoice(1,replacement.value);expect(r.ok,r.error).toBe(true)
    }
    expect(r.interaction.request?.kind).toBe('selection');expect(r.interaction.playerIndex).toBe(1)
    expect(r.state.players[1]!.resources.food).toBe(3);expect(r.state.players[1]!.cardStates[CARD]?.extraData?.selectedPositions).toBeUndefined()
    const before=JSON.stringify(session.state)
    expect(session.commitSelectionChoice(1,{positions:['0-1']}).ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    r=session.commitSelectionChoice(1,{positions:['-1-1']});expect(r.ok,r.error).toBe(true)
    expect(r.state.players[1]!.cardStates[CARD]?.extraData?.selectedPositions).toEqual(['-1-1'])
    expect(r.state.players[1]!.resources.food).toBe(4);expect(r.state.players[0]!.resources.food).toBe(2);expect(session.cardWarnings).toEqual([])
  })

  it('retains an empty multi-selection when every option is disabled',()=>{
    const flow=leaf('emit-choice',{params:{options:[{value:'a',labelKey:'ui.yes',disabled:true}],multiSelect:{valuePrefix:'s:',minSelections:0,maxSelections:0}}})
    const {session}=setup(afterCollect(flow,"resolveChoice:(_s,_p,value)=>value==='s:'?gainLeaf(CARD_ID,{food:1}):undefined"))
    let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
    r=session.resolveChoice(0,'s:');expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.food).toBe(3);expect(session.cardWarnings).toEqual([])
  })

  it('enforces the stable count limit before paying or writing farm tiles',()=>{
    const {session,player}=setup(afterCollect(leaf('stables',{actionContext:{max:1}})));player.resources.wood=5
    let r=collect(session);const before=JSON.stringify(session.state)
    expect(session.commitSelectionChoice(0,{stables:[{row:0,col:0},{row:0,col:1}]}).ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    r=session.commitSelectionChoice(0,{stables:[{row:0,col:0}]});expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.stableTiles).toEqual([{row:0,col:0}]);expect(r.state.players[0]!.resources.wood).toBe(6)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{wood:2}}))
  })

  it('enforces fence segment and pasture bounds with authoritative payment',()=>{
    const {session,player}=setup(afterCollect(leaf('fence',{actionContext:{fencePolicy:{segmentBounds:{total:{min:4,max:4}},newPastureBounds:{count:{min:1,max:1},totalSize:{min:1,max:1}},cancelPolicy:'forbidCancel'}}})));player.resources.wood=6
    collect(session);const before=JSON.stringify(session.state)
    expect(session.commitSelectionChoice(0,{edges:['H-0-1','H-0-2','H-1-1','H-1-2','V-0-1','V-0-3'],extraWood:0}).ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    const r=session.commitSelectionChoice(0,{edges:['H-0-1','H-1-1','V-0-1','V-0-2'],extraWood:0})
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.pastures).toHaveLength(1);expect(r.state.players[0]!.pastures[0]!.size).toBe(1)
    expect(r.state.players[0]!.fenceSegments).toHaveLength(4);expect(r.state.players[0]!.resources.wood).toBe(5)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{wood:4}}));expect(session.cardWarnings).toEqual([])
  })

  it.each(['params','actionContext'] as const)('keeps %s improvement types restricted to the declared kind',location=>{
    for(const type of ['minor','major'] as const){
      const allowed=[CARD,'A053_Claypipe','Major_Fireplace1','Major_Fireplace2']
      const flow=leaf('improvement',{params:{allowedPurchases:allowed,...(location==='params'?{types:[type]}:{})},...(location==='actionContext'?{actionContext:{types:[type]}}:{})})
      const {session,player}=setup(afterCollect(flow,'',"zones:['hand'],"),'cost:{wood:1}')
      player.minorPlayed=[];player.minorHand=[CARD,'A053_Claypipe'];player.resources.clay=3;player.resources.wood=2
      let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
      expect(r.interaction.request!.options.every(option=>type==='major'?option.value.includes('Major_'):!option.value.includes('Major_'))).toBe(true)
      const before=JSON.stringify(session.state);expect(session.resolveChoice(0,type==='minor'?'Major_Fireplace1':CARD).ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
      const chosen=type==='minor'?CARD:'Major_Fireplace1'
      r=session.resolveChoice(0,r.interaction.request!.options.find(option=>option.value.includes(chosen))!.value);expect(r.ok,r.error).toBe(true)
      expect(r.state.players[0]!.minorPlayed.includes(CARD)).toBe(type==='minor');expect(r.state.players[0]!.improvements.includes('Major_Fireplace1')).toBe(type==='major')
      expect(r.state.players[0]!.resources).toMatchObject({wood:type==='minor'?4:5,clay:type==='major'?1:3});expect(session.cardWarnings).toEqual([])
    }
  })

  it('caps a registered exchange source at one conversion inside the admitted flow',()=>{
    const {session,player}=setup(afterCollect(leaf('exchange',{actionContext:{tradeIds:[CARD],maxTradeTimesBySourceId:{[CARD]:1}}})),"exchanges:[{from:{wood:1},to:{food:1},triggers:['anytime']}]")
    player.resources.wood=2;let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
    const options=r.interaction.request!.options.filter(option=>option.effectPreview?.kind==='resourceExchange')
    expect(options.length).toBeGreaterThan(0);expect(options.every(option=>option.effectPreview?.kind==='resourceExchange'&&option.effectPreview.resourcesPaid?.wood===1)).toBe(true)
    r=session.resolveChoice(0,options[0]!.value);expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({wood:4,food:3});expect(session.cardWarnings).toEqual([])
    expect(r.state.events.filter(event=>event.type==='resource.exchanged')).toHaveLength(1)
  })

  it('stores a string stack item across pending and pops it after continuation',()=>{
    const flow={type:'seq',children:[leaf('push-to-card-stack',{params:{item:'wood'}}),leaf('emit-choice',{params:{options:[{value:'yes',labelKey:'ui.yes'}],requiresExplicitChoice:true}}),leaf('special-effect',{params:{kind:'pop-card-stack-top'}})]} as ActionFlow
    const {session}=setup(afterCollect(flow));let r=collect(session)
    expect(r.interaction.request?.kind).toBe('choice');expect(r.state.players[0]!.cardStates[CARD]?.stack).toEqual(['wood'])
    r=session.resolveChoice(0,'yes');expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.cardStates[CARD]?.stack).toEqual([])
    expect(session.cardWarnings).toEqual([])
  })
  it.each([
    leaf('gain',{targetPlayerId:'missing',params:{food:1}}),
    leaf('gain',{params:{food:1,recipientMode:'other'}}),
    leaf('gain',{params:{food:1,recipientPlayerId:'missing'}}),
    leaf('gain',{params:{food:1,payerId:'missing'}}),
    leaf('gain',{params:{food:0.5}}),
    ...['promptKey','choiceLabelKey','optionId'].map(key=>({type:'xor',children:[leaf('gain',{params:{food:1},[key]:{}}),leaf('gain',{params:{stone:1}})]})),
    leaf('gain',{params:{food:1},choiceLabelParams:[]}),
    ...[{},'pay'].map(costType=>leaf('pay',{params:{cost:{food:1},costType}})),
    ...[{startRound:2,count:1,resources:{food:1}},{entries:[{round:2,resources:{food:1}}]}].map(fields=>leaf('future-meeples',{params:{__futureMeepleRequest:{cardId:CARD,playerId:'ghost',...fields}}})),
    {type:'xor',children:[leaf('gain',{params:{food:1},effectPreview:{kind:'futureSchedule',entries:{}}}),leaf('gain',{params:{stone:1}})]},
    leaf('future-meeples',{params:{__futureMeepleRequest:{cardId:CARD,playerId:'p1',startRound:2,count:2,resources:{food:0.5}}}}),
    ...[{scope:'other'},{replaceUpTo:'false'},{minCost:{wood:'1'}},{maxCost:{wood:0.5}},{groupId:1,groupMax:1},{groupMax:1},{groupId:'g',groupMin:2,groupMax:1}].map(fields=>leaf('pay',{params:{cost:{unitFee:{wood:1},nb:1,trades:[{from:{food:1},to:{wood:1},...fields}]}}})),
    leaf('future-meeples',{params:{__futureMeepleRequest:{cardId:CARD,playerId:'p1',startRound:2,count:2}}}),
    leaf('exchange',{actionContext:{directTrade:{from:{wood:1},to:{food:1},max:0.5}}}),
    leaf('pay',{params:{cost:{unitFee:{food:1},nb:0.5}}}),
    leaf('pay',{params:{cost:{fee:{food:2},trades:[{from:{wood:1},to:{food:1},triggers:['harvest']}]}}}),
    leaf('pay',{params:{cost:{fee:{food:2},bonuses:[{discount:{food:1},conditions:{minNumRooms:'3'}}]}}}),
    {type:'seq',targetPlayerId:42,children:[leaf('gain',{params:{food:1}})]},
    leaf('occupation',{params:{allowedCards:{}}}),
    leaf('selection',{actionContext:{selectableTiles:[]}}),
    leaf('selection',{actionContext:{selectableTiles:[{row:'0',col:1}]}}),
    leaf('selection',{actionContext:{selectableTiles:[{row:99,col:1}]}}),
    leaf('selection',{actionContext:{selectableTiles:[{row:0,col:1},{row:0,col:1}]}}),
    leaf('selection',{actionContext:{selectableTiles:[{row:0,col:1}],minSelections:2,maxSelections:2}}),
    leaf('selection',{actionContext:{selectableTiles:[{row:0,col:1}],minSelections:0.5,maxSelections:1}}),
    leaf('improvement',{params:{types:'minor'}}), leaf('improvement',{params:{types:[]}}),
    leaf('improvement',{actionContext:{types:['invalid']}}),
    leaf('emit-choice',{params:{options:[{value:'a',labelKey:'ui.yes',disabled:true}]}}),
    leaf('exchange',{actionContext:{tradeIds:[CARD],maxTradeTimesBySourceId:{[CARD]:'1'}}}),
    leaf('exchange',{actionContext:{tradeIds:{}}}),
    leaf('fence',{actionContext:{fencePolicy:{segmentBounds:{total:{min:{}}}}}}),
    leaf('fence',{actionContext:{fencePolicy:{newPastureBounds:{count:{min:2,max:1}}}}}),
    leaf('stables',{actionContext:{max:'1'}}),

    leaf('emit-choice',{params:{options:[{value:'a',labelKey:'ui.yes'}],multiSelect:{}}}),
    leaf('emit-choice',{params:{options:[{value:'a',labelKey:'ui.yes'}],multiSelect:{valuePrefix:'s:',minSelections:2,maxSelections:1}}}),
    leaf('emit-choice',{params:{options:[{value:'a',labelKey:'ui.yes'}],multiSelect:{valuePrefix:'s:',minSelections:0.5,maxSelections:1}}}),
    leaf('emit-choice',{params:{options:[{value:'a',labelKey:'ui.yes'},{value:'a',labelKey:'ui.no'}],multiSelect:{valuePrefix:'s:',minSelections:2,maxSelections:2}}}),
    leaf('emit-choice',{params:{options:[{value:'a,b',labelKey:'ui.yes'}],multiSelect:{valuePrefix:'s:',minSelections:1,maxSelections:1}}}),
    leaf('emit-choice',{params:{options:[{value:'',labelKey:'ui.yes'}],multiSelect:{valuePrefix:'s:',minSelections:1,maxSelections:1}}}),
    leaf('emit-choice',{params:{options:[{value:'a',labelKey:'ui.yes',disabled:'false'}],multiSelect:{valuePrefix:'s:',minSelections:1,maxSelections:1}}}),
    leaf('push-to-card-stack',{params:{item:{}}}),
    {type:'xor',children:[]}, {type:'or',children:[]},
    leaf('pay',{params:{cost:{food:1},paymentChoice:{}}}),
    leaf('pay',{params:{cost:{food:1},optionPrefix:{}}}),
    leaf('pay',{params:{cost:{fee:{food:1},paymentResourceProviders:[{key:'wood',sourceCard:CARD,available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'}}]}}}),
  ] as ActionFlow[])('rejects malformed reachable flow without partial state or a stuck interaction',flow=>{
    const {session}=setup(afterCollect(flow));session.loadState(session.state)
    const before=JSON.stringify(session.state), r=session.takeAction(0,'forest')
    expect(r.ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    expect(r.state.events.some(event=>event.type==='resource.paid')).toBe(false)
    expect(r.state.players.every(player=>Object.values(player.resources).every(amount=>Number.isFinite(amount)&&amount>=0))).toBe(true)
  })

  it('targets an existing opponent through a composite without rewarding the triggering player',()=>{
    const {session,player,opponent}=setup('{listeners:[{actions:["collect"],phases:["after"],mandatory:true,handler:ctx=>({flow:{type:"seq",targetPlayerId:ctx.state.players[1].id,children:[gainLeaf(CARD_ID,{food:1})]}})}]}')
    const own=player.resources.food, other=opponent.resources.food
    const r=collect(session)
    expect(r.state.players[0]!.resources.food).toBe(own);expect(r.state.players[1]!.resources.food).toBe(other+1)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.moved',sourceCardId:CARD}));expect(session.cardWarnings).toEqual([])
  })

  it('filters occupations, rejects an excluded card and settles the allowed card payment',()=>{
    const {session,player}=setup(afterCollect(leaf('occupation',{params:{allowedCards:['A087_Conservator','A088_HedgeKeeper'],exactCost:{food:1}}})))
    player.occupationHand=['A087_Conservator','A088_HedgeKeeper','A089_StablePlanner'];player.resources.food=2
    let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
    expect(r.interaction.request!.options.map(option=>option.value)).not.toContain('A089_StablePlanner')
    const before=JSON.stringify(session.state);expect(session.resolveChoice(0,'A089_StablePlanner').ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    r=session.resolveChoice(0,'A087_Conservator');expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.occupationPlayed).toContain('A087_Conservator');expect(r.state.players[0]!.resources.food).toBe(1)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{food:1}}))
  })

  it('resolves a bounded multi-selection and resumes the following card flow',()=>{
    const flow={type:'seq',children:[leaf('emit-choice',{params:{options:[{value:'a',labelKey:'ui.yes'},{value:'b',labelKey:'ui.no'}],multiSelect:{valuePrefix:'s:',minSelections:1,maxSelections:2}}}),leaf('gain',{params:{wood:1}})]} as ActionFlow
    const {session}=setup(afterCollect(flow,"resolveChoice:(_s,_p,value)=>value==='s:a,b'?gainLeaf(CARD_ID,{food:2}):undefined"))
    let r=collect(session);const before=JSON.stringify(session.state)
    expect(session.resolveChoice(0,'s:').ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
    r=session.resolveChoice(0,'s:a,b');expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({food:4,wood:4});expect(session.cardWarnings).toEqual([])
  })

  it('applies a valid bonus and selected payment with a string prefix',()=>{
    const {session}=setup(afterCollect(leaf('pay',{params:{cost:{fee:{food:2},bonuses:[{choices:[{discount:{food:1}}]}]},optionPrefix:'pay:test',paymentChoice:'pay:test:0'}})))
    const r=collect(session);expect(r.state.players[0]!.resources.food).toBe(1)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{food:1}}));expect(session.cardWarnings).toEqual([])
  })

  it('rejects malformed computeCosts bonuses while native stable payment still completes',()=>{
    const implementation=afterCollect(leaf('stables')).slice(0,-2)+",{actions:['stables'],phases:['computeCosts'],handler:()=>({bonuses:[{}]})}]}"
    const {session}=setup(implementation);collect(session)
    const r=session.commitSelectionChoice(0,{stables:[{row:0,col:0}]})
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.wood).toBe(1)
    expect(session.cardWarnings).toEqual(expect.arrayContaining([expect.stringContaining('exactly one')]))
  })

  it('settles a grouped trade modifier without exceeding its payment limit',()=>{
    const {session}=setup(afterCollect(leaf('stables')),"modifier:{type:'trade',cardId:CARD_ID,appliesTo:['stables'],from:{food:1},to:{wood:1},groupId:'g',groupMax:1,max:1}")
    collect(session);let r=session.commitSelectionChoice(0,{stables:[{row:0,col:0}]})
    expect(r.interaction.request?.kind).toBe('choice')
    const options=r.interaction.request!.options
    expect(options.some(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.food===2)).toBe(false)
    r=session.resolveChoice(0,options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.food===1)!.value)
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources).toMatchObject({wood:2,food:1})
    expect(r.state.players[0]!.stableTiles).toContainEqual({row:0,col:0});expect(session.cardWarnings).toEqual([])
  })

  it('consumes only this card’s virtual provider and preserves real inventory',()=>{
    const key=CARD+':clay'
    const flow=leaf('pay',{params:{cost:{fee:{food:1},paymentResourceProviders:[{key,sourceCard:CARD,available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'}}]}}})
    const {session}=setup(afterCollect(flow));session.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay=1
    let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
    r=session.resolveChoice(0,r.interaction.request!.options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.[key]===1)!.value)
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.food).toBe(2)
    expect(r.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay).toBe(0)
    expect(r.state.players.every(player=>Object.values(player.resources).every(amount=>amount>=0))).toBe(true);expect(session.cardWarnings).toEqual([])
  })

  it.each(['occupationPrerequisites','improvementPrerequisites'])('enforces valid %s at native purchase',key=>{
    for(const count of [0,1]){
      const {session,player}=setup(afterCollect(leaf('improvement',{params:{types:['minor'],allowedPurchases:[CARD]}}),'',"zones:['hand'],"),`cost:{wood:1},${key}:{min:1,max:1}`)
      player.minorPlayed=[];player.minorHand=[CARD]
      if(count===1){if(key==='occupationPrerequisites')player.occupationPlayed=['A087_Conservator'];else player.improvements=['Major_Fireplace1']}
      const r=collect(session)
      expect(r.state.players[0]!.minorPlayed.includes(CARD)).toBe(count===1)
      expect(r.state.players[0]!.resources.wood).toBe(count===1?2:3);expect(session.cardWarnings).toEqual([])
    }
  })
})

describe('Workshop typed query and settlement regressions',()=>{
  it.each(['','2','2+','unknown'])('starts a fresh two-player Session with textual players=%s',players=>{
    const {session}=setup(afterCollect(leaf('gain',{params:{food:1}})),`players:${JSON.stringify(players)}`)
    const r=collect(session);expect(r.state.players).toHaveLength(2);expect(r.state.players[0]!.resources.food).toBe(3);expect(session.cardWarnings).toEqual([])
  })
  it.each(['range','entries'])('delivers %s future rewards to the existing opponent',kind=>{
    const fields=kind==='range'?{startRound:2,count:1,resources:{food:1}}:{entries:[{round:2,resources:{food:1}}]}
    const {session,player,opponent}=setup(afterCollect(leaf('future-meeples',{params:{__futureMeepleRequest:{cardId:CARD,playerId:'p2',...fields}}})))
    let r=collect(session);expect(r.state.futureMeeples).toContainEqual(expect.objectContaining({playerId:opponent.id,round:2,resources:{food:1}}))
    const ownFood=player.resources.food,otherFood=opponent.resources.food
    for(const p of session.state.players){markAllWorkersUsed(session.state,p);setActiveWorkerCount(p,0)}
    session.loadState(session.state);r=session.invokeAfterRoundEnd();expect(r.ok,r.error).toBe(true)
    expect(r.state.round).toBe(2);expect(r.state.players[0]!.resources.food).toBe(ownFood);expect(r.state.players[1]!.resources.food).toBe(otherFood+1)
    expect(r.state.futureMeeples).toEqual([]);expect(session.cardWarnings).toEqual([])
  })
  it('uses the declared native payment purpose and its matching modifier',()=>{
    const {session}=setup(afterCollect(leaf('pay',{params:{cost:{wood:2},costType:'stables'}})),"modifier:{type:'bonus',cardId:CARD_ID,appliesTo:['stables'],discount:{wood:1},optional:false}")
    const r=collect(session);expect(r.state.players[0]!.resources.wood).toBe(2)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{wood:1},paymentFor:'stables'}));expect(session.cardWarnings).toEqual([])
  })
  it.each([0.5,1])('requires whole animal-zone capacity %s for private breeding',capacity=>{
    const {session,player}=setup(afterCollect(leaf('breed',{actionContext:{animalTypes:['sheep']}}),`computeBreedableAnimalCount:(_s,p,animal,count)=>animal==='sheep'?count+(p.cardStates[CARD_ID]?.counters.held||0):count,onComputeAnimalZones:()=>[{id:'card-zone',zoneType:'card',cardId:CARD_ID,capacity:${capacity},animalType:null,animalCount:0}]`))
    // Milking Place removes house capacity; the custom zone is the only
    // possible backing for this private breeding action.
    player.minorPlayed.push('D012_MilkingPlace');player.cardStates[CARD]={counters:{held:2}};player.resources.sheep=0
    player.pastures=[];player.stableTiles=[];player.stableAnimals={};player.houseAnimalType=null;player.houseAnimalCount=0
    let r=collect(session)
    expect(r.state.players[0]!.resources.sheep).toBe(capacity===1?1:0)
    if(capacity===1){
      expect(r.interaction.request?.kind).toBe('animal-reorg')
      r=session.resolveChoice(0,'confirm',{zones:[{id:'card-zone',zoneType:'card',animalType:'sheep',animalCount:1}]})
      expect(r.ok,r.error).toBe(true);expect(r.state.events).toContainEqual(expect.objectContaining({type:'farm.animalBred',animals:{sheep:1}}));expect(session.cardWarnings).toEqual([])
    } else {
      expect(r.interaction.request?.kind).not.toBe('animal-reorg');expect(r.state.events.some(event=>event.type==='farm.animalBred')).toBe(false)
      expect(session.cardWarnings).toEqual(expect.arrayContaining([expect.stringContaining('Animal capacity')]))
    }
  })
  it('preserves labeled XOR branches and settles the selected reward',()=>{
    const {session}=setup(afterCollect({type:'xor',promptKey:'ui.yes',children:[leaf('gain',{params:{food:1},choiceLabelKey:'ui.yes',choiceLabelParams:{},optionId:'food'}),leaf('gain',{params:{stone:1},choiceLabelKey:'ui.no',optionId:'stone'})]}))
    let r=collect(session);expect(r.interaction.request).toMatchObject({kind:'choice',options:expect.arrayContaining([expect.objectContaining({labelKey:'ui.yes'}),expect.objectContaining({labelKey:'ui.no'})])})
    r=session.resolveChoice(0,r.interaction.request!.options.find(option=>option.labelKey==='ui.yes')!.value)
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources).toMatchObject({food:3,stone:0});expect(session.cardWarnings).toEqual([])
  })
  it.each(['missing','clay-pit'])('filters unavailable %s provider backing before offering payment',spaceId=>{
    const key=CARD+':clay',provider={key,sourceCard:CARD,available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId,resource:'clay'}}
    const {session}=setup(afterCollect(leaf('pay',{params:{cost:{fee:{food:1},paymentResourceProviders:[provider]}}})))
    session.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay=0
    const r=collect(session);expect(r.interaction.request?.kind).not.toBe('choice');expect(r.state.players[0]!.resources.food).toBe(1)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:{food:1}}));expect(session.cardWarnings).toEqual([])
  })
  it.each([1,2])('accounts for %s units of shared backing across distinct provider keys',backing=>{
    const provider=(suffix:string)=>({key:CARD+':'+suffix,sourceCard:CARD,available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'}})
    const {session}=setup(afterCollect(leaf('pay',{params:{cost:{fee:{food:2},paymentResourceProviders:[provider('a'),provider('b')]}}})))
    session.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay=backing
    let r=collect(session);expect(r.interaction.request?.kind).toBe('choice')
    const paidFromBacking=(option:{labelParams?:Record<string,unknown>})=>Object.entries(option.labelParams?.resourcesPaid??{}).filter(([key])=>key.startsWith(CARD+':')).reduce((sum,[,amount])=>sum+Number(amount),0)
    expect(r.interaction.request!.options.every(option=>paidFromBacking(option)<=backing)).toBe(true)
    const option=r.interaction.request!.options.find(option=>paidFromBacking(option)===backing)!
    r=session.resolveChoice(0,option.value);expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.food).toBe(backing)
    expect(r.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay).toBe(0);expect(session.cardWarnings).toEqual([])
  })
  it('does not offer an unbacked provider as the only payment or run an unpaid follow-up',()=>{
    const p={key:CARD+':ghost',sourceCard:CARD,available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'missing',resource:'food'}}
    const {session,player}=setup(afterCollect({type:'seq',children:[leaf('pay',{params:{cost:{fee:{food:1},paymentResourceProviders:[p]}}}),leaf('gain',{params:{food:9}})]}))
    player.resources.food=0
    session.loadState(session.state);const before=JSON.stringify(session.state),r=session.takeAction(0,'forest')
    expect(r.ok).toBe(false);expect(r.error).toContain('no available backing');expect(JSON.stringify(session.state)).toBe(before)
    expect(r.interaction.request).toBeUndefined();expect(r.state.players[0]!.resources.food).toBe(0)
    expect(r.state.events.some(event=>event.type==='resource.paid')).toBe(false)
  })
  it('rejects a stale provider payment after anytime consumption without substituting another backing',()=>{
    const provider=(suffix:string,spaceId:string,resource:string)=>({key:CARD+':'+suffix,sourceCard:CARD,available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId,resource}})
    const a=provider('a','clay-pit','clay'),b=provider('b','reed-bank','reed')
    const main=afterCollect(leaf('pay',{params:{cost:{fee:{food:1},paymentResourceProviders:[a,b]}}})).slice(0,-2)
    const {session,player}=setup(main+`,{actions:['anytime'],phases:['anytime'],handler:()=>({flow:${JSON.stringify(leaf('pay',{params:{optionPrefix:'pay:drain',cost:{fee:{food:1},paymentResourceProviders:[a]}}}))}})}]}`)
    player.resources.food=1;session.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay=1;session.state.actionSpaces.find(space=>space.id==='reed-bank')!.resources.reed=1
    let r=collect(session);const original=r.interaction.request!.options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.[a.key]===1)!
    r=session.takeAnytimeAction(0,CARD+':listener:1');expect(r.ok,r.error).toBe(true)
    r=session.resolveChoice(0,r.interaction.request!.options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.[a.key]===1)!.value)
    expect(r.ok,r.error).toBe(true);expect(r.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay).toBe(0)
    const paidBefore=r.state.events.filter(event=>event.type==='resource.paid').length
    const before=JSON.stringify(session.state)
    r=session.resolveChoice(0,original.value);expect(r.ok).toBe(false);expect(r.error).toContain('no longer available');expect(JSON.stringify(session.state)).toBe(before)
    expect(r.interaction.request).toMatchObject({kind:'choice'})
    expect(r.state.players[0]!.resources.food).toBe(1);expect(r.state.actionSpaces.find(space=>space.id==='reed-bank')!.resources.reed).toBe(1)
    expect(r.state.events.filter(event=>event.type==='resource.paid')).toHaveLength(paidBefore)
    expect(r.interaction.request!.options.some(option=>option.value===original.value)).toBe(true)
    r=session.resolveChoice(0,r.interaction.request!.options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.[b.key]===1)!.value)
    expect(r.ok,r.error).toBe(true);expect(r.state.actionSpaces.find(space=>space.id==='reed-bank')!.resources.reed).toBe(0);expect(r.state.players[0]!.resources.food).toBe(1);expect(session.cardWarnings).toEqual([])
  })
  it('rejects repeated provider identities before enumeration',()=>{
    const p={key:CARD+':clay',sourceCard:CARD,available:1,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'}}
    const {session}=setup(afterCollect(leaf('pay',{params:{cost:{fee:{food:2},paymentResourceProviders:[p,p]}}})))
    session.loadState(session.state);const before=JSON.stringify(session.state),r=session.takeAction(0,'forest')
    expect(r.ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before);expect(session.cardWarnings).toEqual(expect.arrayContaining([expect.stringContaining('keys must be distinct')]))
  })
  it('keeps an issued real-payment choice usable when a native cost listener withdraws its provider',()=>{
    const key=CARD+':clay',p={key,sourceCard:CARD,available:1,covers:[{resource:'wood',costAmount:2,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'}}
    const drain={...p,covers:[{resource:'food',costAmount:1,paymentAmount:1}]}
    const base=afterCollect(leaf('stables')).slice(0,-2)
    const {session}=setup(base+`,{actions:['stables'],phases:['computeCosts'],handler:ctx=>ctx.state.actionSpaces.find(s=>s.id==='clay-pit').resources.clay>0?{paymentResourceProviders:${JSON.stringify([p])}}:undefined},{actions:['anytime'],phases:['anytime'],handler:()=>({flow:${JSON.stringify(leaf('pay',{params:{optionPrefix:'pay:drain',cost:{fee:{food:1},paymentResourceProviders:[drain]}}}))}})}]}`)
    session.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay=1
    collect(session);let r=session.commitSelectionChoice(0,{stables:[{row:0,col:0}]});expect(r.ok,r.error).toBe(true)
    const original=r.interaction.request!.options,virtual=original.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.[key]===1)!,own=original.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.wood===2)!
    r=session.takeAnytimeAction(0,CARD+':listener:2');expect(r.ok,r.error).toBe(true)
    r=session.resolveChoice(0,r.interaction.request!.options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.[key]===1)!.value);expect(r.ok,r.error).toBe(true)
    const before=JSON.stringify(session.state)
    r=session.resolveChoice(0,virtual.value);expect(r.ok).toBe(false);expect(r.error).toContain('no longer available');expect(JSON.stringify(session.state)).toBe(before)
    r=session.resolveChoice(0,own.value);expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources.wood).toBe(1);expect(r.state.players[0]!.stableTiles).toContainEqual({row:0,col:0});expect(session.cardWarnings).toEqual([])
  })
  it('keeps an issued real payment when a native cost listener adds a provider after an anytime action',()=>{
    const key=CARD+':clay',p={key,sourceCard:CARD,available:1,covers:[{resource:'wood',costAmount:2,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'}}
    const base=afterCollect(leaf('stables')).slice(0,-2)
    const {session,player}=setup(base+`,{actions:['stables'],phases:['computeCosts'],handler:ctx=>ctx.player.resources.food>=3?{trades:[{from:{clay:1},to:{wood:1},max:2}],paymentResourceProviders:${JSON.stringify([p])}}:{trades:[{from:{clay:1},to:{wood:1},max:2}]}},{actions:['anytime'],phases:['anytime'],handler:()=>({flow:gainLeaf(CARD_ID,{food:1})})}]}`)
    player.resources.clay=2;session.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay=1
    collect(session);let r=session.commitSelectionChoice(0,{stables:[{row:0,col:0}]});expect(r.ok,r.error).toBe(true)
    const original=r.interaction.request!.options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.wood===2)!
    expect(original.value).toMatch(/^pay:stable:\d+$/)
    r=session.takeAnytimeAction(0,CARD+':listener:2');expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.food).toBe(3)
    r=session.resolveChoice(0,original.value);expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({wood:1,clay:2,food:3});expect(r.state.players[0]!.stableTiles).toContainEqual({row:0,col:0})
    expect(r.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay).toBe(1);expect(session.cardWarnings).toEqual([])
  })
  it('retains an admitted leaf preview in its menu and queues the selected future reward',()=>{
    const preview={kind:'futureSchedule',entries:[{round:2,resources:{food:1}}]}
    const flow={type:'xor',children:[leaf('future-meeples',{params:{__futureMeepleRequest:{cardId:CARD,playerId:'p1',entries:[{round:2,resources:{food:1}}]}},effectPreview:preview}),leaf('gain',{params:{food:1}})]} as ActionFlow
    const {session}=setup(afterCollect(flow));let r=collect(session)
    const option=r.interaction.request!.options.find(candidate=>candidate.effectPreview?.kind==='futureSchedule')!
    expect(option.effectPreview).toEqual(preview);r=session.resolveChoice(0,option.value)
    expect(r.ok,r.error).toBe(true);expect(r.state.futureMeeples).toContainEqual(expect.objectContaining({round:2,resources:{food:1},cardId:CARD}))
    expect(r.state.players[0]!.resources.food).toBe(2);expect(session.cardWarnings).toEqual([])
  })
  it.each([1,2])('preserves factory occupation prerequisites with %s played occupations',count=>{
    const {session,player}=setup(afterCollect(leaf('improvement',{params:{types:['minor'],allowedPurchases:[CARD]}}),'',"zones:['hand'],"),"cost:{wood:1},prerequisite:{occupation:2}",false,true)
    player.minorPlayed=[];player.minorHand=[CARD];player.occupationPlayed=['A087_Conservator','A086_SheepWhisperer'].slice(0,count)
    const r=collect(session);expect(r.state.players[0]!.minorPlayed.includes(CARD)).toBe(count===2)
    expect(r.state.players[0]!.resources.wood).toBe(count===2?2:3);expect(session.cardWarnings).toEqual([])
  })
  it.each(['self','others'])('transfers one whole food to the opponent using %s gain selection',mode=>{
    const {session,player,opponent}=setup(`{listeners:[{actions:['collect'],phases:['after'],mandatory:true,handler:ctx=>({flow:{type:'leaf',actionId:'gain',params:{food:1,recipientPlayerId:ctx.state.players[1].id,recipientMode:'${mode}',payerId:ctx.player.id}}})}]}`)
    const ownFood=player.resources.food,otherFood=opponent.resources.food,r=collect(session)
    expect(r.state.players[0]!.resources.food).toBe(ownFood-1);expect(r.state.players[1]!.resources.food).toBe(otherFood+1)
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.moved',resources:{food:1},from:{kind:'player',playerId:player.id},to:{kind:'player',playerId:opponent.id}}));expect(session.cardWarnings).toEqual([])
  })

  it.each([0,1])('enforces a textual prerequisite with %s played occupations through purchase',count=>{
    const {session,player}=setup(afterCollect(leaf('improvement',{params:{types:['minor'],allowedPurchases:[CARD]}}),'',"zones:['hand'],"),"cost:{wood:1},prerequisite:'1 Occupation'")
    player.minorPlayed=[];player.minorHand=[CARD];if(count)player.occupationPlayed=['A087_Conservator']
    const r=collect(session);expect(r.state.players[0]!.minorPlayed.includes(CARD)).toBe(count===1)
    expect(r.state.players[0]!.resources.wood).toBe(count===1?2:3);expect(session.cardWarnings).toEqual([])
  })

  it.each([false,true])('honors boolean isDoable %s on the authoritative collect action',doable=>{
    const {session}=setup(`{listeners:[{actions:['collect'],phases:['isDoable'],handler:()=>({doable:${doable}})}]}`)
    session.loadState(session.state);const before=JSON.stringify(session.state),r=session.takeAction(0,'forest')
    expect(r.ok).toBe(doable)
    if(!doable)expect(JSON.stringify(session.state)).toBe(before)
    else expect(r.state.players[0]!.resources.wood).toBe(3)
  })

  it.each([['doable','isDoable'],['countCardUse','after'],['decline','computeReplace']])('rejects nonboolean %s and keeps native behavior', (key,phase)=>{
    const {session}=setup(`{listeners:[{actions:['collect'],phases:['${phase}'],mandatory:true,handler:()=>({${key}:'false',alternativeFlow:gainLeaf(CARD_ID,{stone:9})})}]}`)
    session.loadState(session.state);const before=JSON.stringify(session.state),r=session.takeAction(0,'forest')
    if(key==='countCardUse'){expect(r.ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)}
    else {expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources).toMatchObject({wood:3,stone:0})}
    expect(session.cardWarnings).toEqual(expect.arrayContaining([expect.stringContaining(`Listener ${key} must be boolean`)]))
  })

  it.each([false,true])('uses boolean countCardUse %s while settling its reward',countCardUse=>{
    const {session}=setup(`{listeners:[{actions:['collect'],phases:['after'],mandatory:true,handler:()=>({countCardUse:${countCardUse},flow:gainLeaf(CARD_ID,{food:1})})}]}`)
    const r=collect(session);expect(r.state.players[0]!.resources.food).toBe(3)
    expect(readCardResourceStats(r.state.players[0]!,CARD)?.used??0).toBe(countCardUse?1:0);expect(session.cardWarnings).toEqual([])
  })

  it.each([false,true])('keeps the unit trade replaceUpTo %s payment semantics',replaceUpTo=>{
    const flow=leaf('pay',{params:{cost:{unitFee:{wood:1},nb:1,trades:[{from:{food:1},to:{wood:2},scope:'unit',replaceUpTo,max:1,groupId:'g',groupMax:1,minCost:{wood:1},maxCost:{wood:1}}]}}})
    const {session}=setup(afterCollect(flow));let r=collect(session)
    if(replaceUpTo){expect(r.interaction.request?.kind).toBe('choice');r=session.resolveChoice(0,r.interaction.request!.options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.food===1)!.value)}
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources).toMatchObject(replaceUpTo?{wood:3,food:1}:{wood:2,food:2})
    expect(r.state.events).toContainEqual(expect.objectContaining({type:'resource.paid',resources:replaceUpTo?{food:1}:{wood:1}}));expect(session.cardWarnings).toEqual([])
  })

  it('rejects fractional listener cost deltas while preserving signed whole discounts',()=>{
    for(const amount of [-0.5,-1]){
      const implementation=afterCollect(leaf('stables')).slice(0,-2)+`,{actions:['stables'],phases:['computeCosts'],handler:ctx=>ctx.params?.stableCount?({costs:{wood:${amount}},costAttribution:[{sourceCard:CARD_ID,costs:{wood:${amount}}}]}):undefined}]}`
      const {session}=setup(implementation);collect(session);const r=session.commitSelectionChoice(0,{stables:[{row:0,col:0}]})
      expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources.wood).toBe(amount===-1?2:1)
      expect(Object.values(r.state.players[0]!.resources).every(Number.isSafeInteger)).toBe(true)
      if(amount===-1)expect(session.cardWarnings).toEqual([])
    }
  })

  it.each([-1,0.5,1])('handles extra room capacity %s without reducing native growth eligibility',capacity=>{
    const {session,player}=setup(afterCollect(leaf('family-growth'),`computeExtraRoomCapacity:()=>${capacity}`))
    if(capacity!==1){player.rooms=3;player.roomTiles.push({row:0,col:0})}
    session.loadState(session.state);const before=JSON.stringify(session.state),r=session.takeAction(0,'forest')
    if(capacity===1){expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.workers.filter(worker=>worker.isActive)).toHaveLength(3);expect(r.state.players[0]!.workers.filter(worker=>worker.isNewborn)).toHaveLength(1);expect(session.cardWarnings).toEqual([])}
    else {expect(r.ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before);expect(session.cardWarnings).toEqual(expect.arrayContaining([expect.stringContaining('computeExtraRoomCapacity')]))}
  })

  it.each([1e9,0.5])('rejects provider availability %s before payment enumeration',available=>{
    const provider={key:CARD+':clay',sourceCard:CARD,available,covers:[{resource:'food',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'}}
    const {session}=setup(afterCollect(leaf('pay',{params:{cost:{fee:{food:1e9},paymentResourceProviders:[provider]}}})))
    session.loadState(session.state);const before=JSON.stringify(session.state),r=session.takeAction(0,'forest')
    expect(r.ok).toBe(false);expect(JSON.stringify(session.state)).toBe(before)
  })

  it('rejects merged provider contributions before expanding their combination product',()=>{
    const provider=(suffix:string)=>({key:CARD+':'+suffix,sourceCard:CARD,available:31,covers:[{resource:'wood',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'forest',resource:'wood'}})
    const base=afterCollect(leaf('stables')).slice(0,-2)
    const {session}=setup(base+`,{actions:['stables'],phases:['computeCosts'],handler:()=>({paymentResourceProviders:${JSON.stringify([provider('a')])}})},{actions:['stables'],phases:['computeCosts'],handler:()=>({paymentResourceProviders:${JSON.stringify([provider('b')])}})}]}`)
    session.loadState(session.state);const before=JSON.stringify(session.state),r=session.takeAction(0,'forest')
    expect(r.ok).toBe(false);expect(r.error).toContain('512-combination');expect(JSON.stringify(session.state)).toBe(before)
    expect(r.state.events.some(event=>event.type==='resource.paid')).toBe(false)
  })

  it('settles a provider covering two resource types using the actual action-space supply',()=>{
    const key=CARD+':clay',provider={key,sourceCard:CARD,available:2,covers:[{resource:'food',costAmount:1,paymentAmount:1},{resource:'wood',costAmount:1,paymentAmount:1}],consume:{type:'actionSpace',spaceId:'clay-pit',resource:'clay'}}
    const {session}=setup(afterCollect(leaf('pay',{params:{cost:{fee:{food:1,wood:1},paymentResourceProviders:[provider]}}})))
    session.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay=2
    let r=collect(session);r=session.resolveChoice(0,r.interaction.request!.options.find(option=>(option.labelParams?.resourcesPaid as Record<string,number>|undefined)?.[key]===2)!.value)
    expect(r.ok,r.error).toBe(true);expect(r.state.players[0]!.resources).toMatchObject({food:2,wood:3})
    expect(r.state.actionSpaces.find(space=>space.id==='clay-pit')!.resources.clay).toBe(0);expect(session.cardWarnings).toEqual([])
  })
})
