import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { workshopCardJsonFromDefinition } from '../workshop-draft-validation'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import { getCardEffect, countPendingExtraTurns, getAnimalScoreAdjustment, getBreedThreshold, getBreedableAnimalCount, shouldEnforceReorganizeOnLastHarvest } from '../../shared/cards/card-effects'
import { Scoring } from '../../shared/domain/scoring'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import type { ActionFlow } from '../../shared/contract/types'

const CARD = 'CUSTOM_Capabilities'
const sessions: GameSession[] = []
// Approved design: existing engine extension, no card-specific rule path.
// Every scenario starts with seed 42 / 2 players / explicit placeholder hands.
// Payment, farm pending, shared zones and delayed state cross GameSession;
// pure numeric queries use the public collector inside its session context.
function setup(implementation: string, metadata = '') {
  const source = `const CARD_ID='${CARD}'; const CARD_DEF={cardType:'minor',meta:{id:CARD_ID,name:'Capabilities',${metadata}}}; const CARD_IMPL=${implementation}`
  const compiled = validateAndCompileCustomCode(source, CARD)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  const card: CustomCardData = { cardType: 'minor' as const, cardJson: { ...workshopCardJsonFromDefinition(compiled.cardDefinition), id: CARD, name: 'Capabilities', deck: 'CUSTOM', number: 0, desc: [] }, compiledCode: compiled.compiledCode, codeManifest: compiled.manifest }
  const session = new GameSession(42, [card], { playerCount: 2 })
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
