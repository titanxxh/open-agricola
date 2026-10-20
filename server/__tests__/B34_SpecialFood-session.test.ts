import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionFlow, Resource } from '../../shared/contract/types'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B034_SpecialFood'
import '../../shared/cards/A/A137_RiverineShepherd'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit19Animals from './_helpers/audit/ae-negative-19-animals'

const CARD_ID = 'B034_SpecialFood'

const findListener = (ruleOwner: SessionRuleOwner) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((listener) => listener.id === 'B34-special-food-after-collect')
  return ruleOwner.withCtx(lookupRule1)
}

const moved = (
  resources: Partial<Resource>,
  playerId: string,
  from: DraftGameEvent<'resource.moved'>['from'] = { kind: 'actionSpace', spaceId: 'sheep-market' },
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId },
  reason: from.kind === 'actionSpace' ? 'collect' : 'cardEffect',
})

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.pastures = [{
    id: 'p1',
    size: 2,
    tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stables: 0,
    animalType: 'sheep',
    animalCount: 1,
  }]
  writeCardExtraData(player, CARD_ID, 'animalsBeforeCollecting', {
    sheep: 0,
    boar: 0,
    cattle: 0,
  })
  const space = state.actionSpaces.find((entry) => entry.id === 'sheep-market')!
  return { session: session, state, player, space }
}

const runListener = (ruleOwner: SessionRuleOwner,
  events: readonly DraftGameEvent<'resource.moved'>[],
  resourcesGained?: Partial<Resource>,
  actionEvents: readonly DraftGameEvent<'resource.moved'>[] = events,
  configurePlayer?: (player: ReturnType<typeof setup>['player']) => void,
): ActionFlow | undefined => {
  const listener = findListener(ruleOwner)
  expect(listener).toBeDefined()
  const { session: ruleSession, state, player, space } = setup()
  configurePlayer?.(player)
  return ruleSession.withCtx(() => executeCardListener(listener!, {
    state,
    player,
    triggerPlayer: player,
    ownerPlayer: player,
    space,
    actionId: 'collect',
    phase: 'after',
    result: resourcesGained ? { type: 'ok', resourcesGained } : { type: 'ok' },
    transactionEvents: events,
    actionEvents,
  } as unknown as CardListenerContext))?.flow
}

describe('B034_SpecialFood action-space provenance', () => {
  it('awards bonus VP for animals moved from an action space to the trigger player', () => {
    const { session: ruleSession, player } = setup()
    const events = [moved({ sheep: 1 }, player.id)]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
    const flow = runListener(ruleSession, events)

    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') throw new Error('expected sequence flow')
    expect(flow.children.filter((child) => child.type === 'leaf' && child.actionId === 'bonus-vp')).toHaveLength(1)
  })

  it('awards bonus VP for reed-bank style action-space animal movement provenance', () => {
    const { session: ruleSession, player } = setup()
    const events = [
      moved({ sheep: 1 }, player.id, { kind: 'actionSpace', spaceId: 'reed-bank' }),
    ]
    const flow = runListener(ruleSession, events, { sheep: 1 })
    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') throw new Error('expected sequence flow')
    expect(flow.children.filter((child) => child.type === 'leaf' && child.actionId === 'bonus-vp')).toHaveLength(1)
  })

  it('does not award bonus VP for animals moved from supply or a card', () => {
    const { session: ruleSession, player } = setup()

    expect(runListener(ruleSession, [moved({ sheep: 1 }, player.id, { kind: 'supply' })], { sheep: 1 })).toBeUndefined()
    expect(runListener(ruleSession, [moved({ sheep: 1 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })], { sheep: 1 })).toBeUndefined()
  })

  it('counts animal-holder animals when checking whether gained animals were retained', () => {
    const { session: ruleSession, player } = setup()
    const events = [moved({ sheep: 1 }, player.id)]

    const flow = runListener(ruleSession, events, { sheep: 1 }, events, (configured) => {
      configured.pastures = []
      configured.cardStates = {
        ...configured.cardStates,
        Test_AnimalHolder: {
          extraData: { held: 2, animalType: 'sheep' },
        },
        [CARD_ID]: {
          extraData: {
            animalsBeforeCollecting: { sheep: 1, boar: 0, cattle: 0 },
          },
        },
      }
    })

    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') throw new Error('expected sequence flow')
    expect(flow.children.filter((child) => child.type === 'leaf' && child.actionId === 'bonus-vp')).toHaveLength(1)
  })

  it('ignores stale earlier transaction animal events when current actionEvents has no animal move', () => {
    const { session: ruleSession, player } = setup()
    const stale = moved({ sheep: 1 }, player.id)

    expect(runListener(ruleSession, [stale], undefined, [])).toBeUndefined()
  })

  it('awards bonus VP when A137 takes an animal from the other action space', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push('A137_RiverineShepherd')
    player.minorPlayed.push(CARD_ID)
    player.pastures = [{
      id: 'p1',
      size: 4,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 1,
      animalType: null,
      animalCount: 0,
    }]

    const sheepMarket = state.actionSpaces.find((entry) => entry.id === 'sheep-market')!
    sheepMarket.resources.sheep = 1
    const reedBank = state.actionSpaces.find((entry) => entry.id === 'reed-bank')!
    reedBank.resources.reed = 1

    session.loadState(state)
    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'select-trigger') {
      const shepherd = resp.interaction.request.options.find(option => option.sourceCard === 'A137_RiverineShepherd')!
      resp = session.resolveChoice(0, shepherd.value)
    }

    const acceptOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
      ])
    }

    expect(resp.state.actionSpaces.find((entry) => entry.id === 'sheep-market')!.resources.sheep).toBe(0)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.resourceStats?.used).toBe(1)
  })
})

describe('ae-negative-19-animals', () => {
  const { SPECIAL, sessions, save, ok, setup, turn, buy, bonus, housing, resolveAnimals } = audit19Animals
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B034 N1 actual animal free purchase and each already housed species prevent purchase without bonus',()=>{const s=setup(SPECIAL,()=>{},false),{pending,r}=buy(s,SPECIAL);assert.equal(bonus(r,SPECIAL),0);save('B034-N1',{pending,r});for(const type of['sheep','boar','cattle']as const){const ss=setup(SPECIAL,state=>{const p=state.players[0]!;p.resources[type]=1;p.houseAnimals = { '2-0': type }},false);let denied=turn(ss,0,'meeting-place');if(denied.interaction.stateId==='wait'&&denied.interaction.request.kind==='choice'){const o=denied.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)denied=ok(ss.resolveChoice(0,o.value))}assertRejectedUnchanged(ss,()=>ss.resolveChoice(0,SPECIAL));const legal=ok(ss.resolveChoice(0,'A030_BakingSheet'));assert.equal(bonus(legal,SPECIAL),0);save(`B034-N1-${type}`,{denied,legal})}})
  it('B034 N2 real sheep accumulation of one two or three fully housed animals scores exact amount',()=>{for(const n of[1,2,3]){const s=setup(SPECIAL,state=>{housing(state);state.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=n}),pending=turn(s,0,'sheep-market'),r=resolveAnimals(s,pending,n);assert.equal(r.state.players[0]!.resources.sheep,n);assert.equal(bonus(r,SPECIAL),n);assert.equal(bonus(r,SPECIAL),n);save(`B034-N2-${n}`,{pending,r})}})
  it('B034 N3 partial accommodation cannot score and later fully housed accumulation scores only the later pile',()=>{const s=setup(SPECIAL,state=>{state.players[0]!.houseAnimals={};state.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=2;state.actionSpaces.find(a=>a.id==='pig-market')!.resources.boar=1});const pending=turn(s,0,'sheep-market'),partial=resolveAnimals(s,pending);assert.equal(partial.state.players[0]!.resources.sheep,1);assert.equal(bonus(partial,SPECIAL),0);turn(s,1,'day-laborer');const laterPending=turn(s,0,'pig-market');assert.ok(laterPending.interaction.stateId==='wait'&&laterPending.interaction.request.kind==='animal-reorg');const zones=laterPending.interaction.request.zones.map(z=>z.id==='house:2-0'?{...z,animalType:'boar',animalCount:1,animalCounts:undefined}:{...z,animalType:null,animalCount:0,animalCounts:undefined});const r=resolveAnimals(s,ok(s.resolveChoice(0,'confirm',{zones})));assert.equal(r.state.players[0]!.resources.boar,1);assert.equal(r.state.players[0]!.resources.sheep,0);assert.equal(bonus(r,SPECIAL),1);save('B034-N3',{pending,partial,laterPending,r})})
  it('B034 N4 card in hand gives no bonus and whole actual acquisition undo retries once',()=>{const hand=setup(SPECIAL,state=>{housing(state);state.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=2},false),handResult=resolveAnimals(hand,turn(hand,0,'sheep-market'),2);assert.equal(bonus(handResult,SPECIAL),0);const s=setup(SPECIAL,state=>{housing(state);state.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=2}),pending=turn(s,0,'sheep-market'),r=resolveAnimals(s,pending,2),undone=ok(s.undoAction());assert.equal(bonus(undone,SPECIAL),0);assert.equal(undone.state.players[0]!.resources.sheep,0);const retry=resolveAnimals(s,turn(s,0,'sheep-market'),2);assert.equal(bonus(retry,SPECIAL),2);save('B034-N4',{handResult,pending,r,undone,retry})})
})
