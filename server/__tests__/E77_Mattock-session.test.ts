import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState, Resource } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { gainLeaf, bonusVpLeaf } from '../../shared/cards/helpers/pay-gain-node'
import { sumActionSpaceMovedToPlayer } from '../../shared/cards/helpers/event-provenance'
import { E033_BeaverColony_impl } from '../../shared/cards/E/E033_BeaverColony'
import { createWorkSession } from './_helpers/session-fixtures'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit42Resources from './_helpers/audit/ae-negative-42-resources'

const CARD_ID = 'E077_Mattock'
const sessions: GameSession[] = []

const setup = ({ played = true, playerCount = 2, moor = false, configure }: {
  played?: boolean
  playerCount?: number
  moor?: boolean
  configure?: (state: GameState) => void
} = {}) => {
  const session = createWorkSession({
    seed: 1063,
    options: { playerCount, enableFarmersOfTheMoor: moor },
    configure: (state) => {
      for (const player of state.players) {
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        Object.assign(player.resources, {
          wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
          vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
        })
      }
      if (played) state.players[0]!.minorPlayed = [CARD_ID]
      configure?.(state)
    },
  })
  sessions.push(session)
  expect(session.state.players).toHaveLength(playerCount)
  expect(session.state.players.every((player) =>
    player.minorHand[0] === '__test_placeholder__'
    && player.occupationHand[0] === '__test_placeholder__')).toBe(true)
  return session
}

const cardLogs = (response: SessionResponse, key: string) => response.state.log.filter((entry) =>
  entry.key === key && entry.params?.cardId === CARD_ID)

afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

describe('E077 Mattock resource-market placement', () => {
  it('grants exactly one clay with the market goods, and restores it on undo and redo', () => {
    const session = setup({ playerCount: 4 })
    const before = session.getState()
    const resourcesBefore = { ...before.state.players[0]!.resources }
    const logsBefore = structuredClone(before.state.log)
    const scoresBefore = structuredClone(before.scores)

    const expectMarket = (response: SessionResponse) => {
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1, food: 1, clay: 1 })
      expect(response.state.players.slice(1).map((player) => player.resources.clay)).toEqual([0, 0, 0])
      expect(response.state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy)
        .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id })])
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
      expect(cardLogs(response, 'log.cardEffectGain')).toEqual([
        expect.objectContaining({ params: expect.objectContaining({ gain: { clay: 1 } }) }),
      ])
      expect(cardLogs(response, 'log.cardTriggered')).toHaveLength(1)
      expect(response.scores).toEqual(scoresBefore)
    }

    expectMarket(session.takeAction(0, 'resource-market-4'))
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toEqual(resourcesBefore)
    expect(undone.state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy).toEqual([])
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.log).toEqual(logsBefore)
    expect(undone.scores).toEqual(scoresBefore)
    expectMarket(session.takeAction(0, 'resource-market-4'))
  })

  it.each([
    { played: false, actor: 0, spaceId: 'resource-market-4' },
    { played: true, actor: 1, spaceId: 'resource-market-4' },
    { played: true, actor: 0, spaceId: 'forest' },
  ])('does not reward a non-triggering placement: $played / $actor / $spaceId', ({ played, actor, spaceId }) => {
    const session = setup({ played, playerCount: 4 })
    session.state.currentPlayerIndex = actor
    session.loadState(session.state)
    const scoresBefore = session.getState().scores
    const response = session.takeAction(actor, spaceId)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.every((player) => player.resources.clay === 0)).toBe(true)
    expect(cardLogs(response, 'log.cardEffectGain')).toEqual([])
    expect(cardLogs(response, 'log.cardTriggered')).toEqual([])
    expect(response.scores).toEqual(scoresBefore)
  })
})

// Capture genuine old-format pending trees, including dormant placement reactions,
// then restore them with the current official registry rather than rewriting IDs.
const installRetainedMattock = (session: GameSession, generation: 'original' | 'whole-space') => session.withCtx(() => {
  const registry = requireActiveCardRegistry('retained Mattock fixture')
  registry.loadImpl('E033_BeaverColony', {
    ...E033_BeaverColony_impl,
    listeners: [{
      id: 'E33-beaver-colony-after-space-use', cardIds: ['E033_BeaverColony'], actionSpaces: 'all', phases: ['after'],
      handler: context => {
        if (sumActionSpaceMovedToPlayer(context.actionEvents ?? context.transactionEvents, 'reed', context.player.id) <= 0) return
        return { flow: bonusVpLeaf('E033_BeaverColony'), sourceCard: 'E033_BeaverColony' }
      },
    }],
  })
  if (generation === 'whole-space') {
    registry.loadImpl(CARD_ID, { listeners: [{
      id: 'E77-mattock-after-collect', previousIds: ['E77-mattock-place-farmer'], cardIds: [CARD_ID], actionSpaces: 'all', phases: ['after'],
      handler: context => {
        const events = context.actionEvents ?? context.transactionEvents
        if (!(['reed', 'stone'] as const).some(resource => sumActionSpaceMovedToPlayer(events, resource, context.player.id) > 0)) return
        return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
      },
    }] })
    return
  }
  registry.loadImpl(CARD_ID, { listeners: [
    {
      id: 'E77-mattock-after-collect', cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
      handler: context => {
        if (!((context.space.gainPerRound?.reed ?? 0) > 0 || (context.space.gainPerRound?.stone ?? 0) > 0)) return
        return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
      },
    },
    {
      id: 'E77-mattock-place-farmer', cardIds: [CARD_ID], actions: ['place-farmer'], phases: ['after'],
      handler: context => {
        if (context.space.id !== 'resource-market-4') return
        return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
      },
    },
  ] })
})

const restore = (session: GameSession, retainedFormat = false) => {
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  // These deployed generations predate direct-host receipts, in nodes and activation frames.
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot,
    (key, value) => retainedFormat && key === 'ownActionEvents' ? undefined : value,
  ))))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  expect(restored.getState().scores).toEqual(session.getState().scores)
  return restored
}

const finishReactions = (session: GameSession, response: SessionResponse, firstCard = CARD_ID) => {
  for (let step = 0; step < 8; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') return response
    const { options } = response.interaction.request
    const option = options.find(entry => entry.sourceCard === firstCard && !entry.disabled)
      ?? options.find(entry => !entry.disabled && entry.value !== '__pass__')
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  throw new Error('Mattock reactions did not finish')
}

const expectReward = (response: SessionResponse, resources: Partial<Resource>) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources).toMatchObject({ ...resources, clay: 1 })
  expect(response.state.players.slice(1).every(player => player.resources.clay === 0)).toBe(true)
  expect(cardLogs(response, 'log.cardEffectGain')).toEqual([
    expect.objectContaining({ params: expect.objectContaining({ gain: { clay: 1 } }) }),
  ])
  expect(cardLogs(response, 'log.cardTriggered')).toHaveLength(1)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
}

describe('E077 Mattock actual action-space resource sources', () => {
  it.each([
    { playerCount: 2, moor: true, space: 'moor-resource-market-12', choice: undefined, goods: { stone: 1, food: 1 } },
    { playerCount: 3, moor: false, space: 'resource-market', choice: 'reed', goods: { reed: 1, stone: 0, food: 1 } },
    { playerCount: 3, moor: false, space: 'resource-market', choice: 'stone', goods: { reed: 0, stone: 1, food: 1 } },
    { playerCount: 4, moor: false, space: 'resource-market-4', choice: undefined, goods: { reed: 1, stone: 1, food: 1 } },
    { playerCount: 5, moor: false, space: 'resource-market-56', choice: undefined, goods: { reed: 1, stone: 1, wood: 1 } },
    { playerCount: 6, moor: false, space: 'resource-market-56', choice: undefined, goods: { reed: 1, stone: 1, wood: 1 } },
  ])('rewards $playerCount-player $space / $choice exactly once', ({ playerCount, moor, space, choice, goods }) => {
    let session = setup({ playerCount, moor })
    const scoresBefore = session.getState().scores
    let response = session.takeAction(0, space)
    if (choice) {
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
      expect(response.state.players[0]!.resources.clay).toBe(0)
      expect(cardLogs(response, 'log.cardTriggered')).toEqual([])
      session = restore(session)
      response = session.getState()
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected market goods choice')
      const option = response.interaction.request.options.find(entry => entry.effectPreview?.kind === 'resourceExchange'
        && (entry.effectPreview.resourcesGained?.[choice as 'reed' | 'stone'] ?? 0) > 0)
      expect(option).toBeDefined()
      response = session.resolveChoice(0, option!.value)
    }
    response = finishReactions(session, response)
    expectReward(response, goods)
    expect(response.state.actionSpaces.find(entry => entry.id === space)!.takenBy).toHaveLength(1)
    expect(response.scores).toEqual(scoresBefore)
  })

  it.each([5, 6])('rewards the %i-player Riverbank Forest collect-and-gain use once', playerCount => {
    const session = setup({ playerCount, configure: state => {
      state.actionSpaces.find(space => space.id === 'riverbank-forest-56')!.resources.wood = 3
    } })
    const scoresBefore = session.getState().scores
    const response = finishReactions(session, session.takeAction(0, 'riverbank-forest-56'))
    expectReward(response, { wood: 3, reed: 1 })
    expect(response.scores).toEqual(scoresBefore)
  })

  it('excludes Water Worker reed even though it is received during the same space use', () => {
    const session = setup({ playerCount: 3, configure: state => {
      state.players[0]!.occupationPlayed = ['D144_WaterWorker']
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
    } })
    const scoresBefore = session.getState().scores
    const response = finishReactions(session, session.takeAction(0, 'fishing'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 1, clay: 0 })
    expect(cardLogs(response, 'log.cardEffectGain')).toEqual([])
    expect(cardLogs(response, 'log.cardTriggered')).toEqual([])
    expect(response.scores).toEqual(scoresBefore)
  })

  it.each([
    { playerCount: 2, space: 'reed-bank', firstCard: CARD_ID },
    { playerCount: 2, space: 'reed-bank', firstCard: 'E033_BeaverColony' },
    { playerCount: 4, space: 'resource-market-4', firstCard: CARD_ID },
    { playerCount: 4, space: 'resource-market-4', firstCard: 'E033_BeaverColony' },
  ].flatMap(scenario => [
    { ...scenario, retained: false as const },
    { ...scenario, retained: 'original' as const },
    { ...scenario, retained: 'whole-space' as const },
  ]))('preserves $space reactions with $firstCard first through restore and undo (retained: $retained)', ({ playerCount, space, firstCard, retained }) => {
    const beaver = 'E033_BeaverColony'
    let session = setup({ playerCount, configure: state => {
      const owner = state.players[0]!
      owner.minorPlayed.push(beaver)
      owner.pastures = [{ id: 'beaver-pasture', tiles: [{ row: 0, col: 4 }], animalType: null, animalCount: 0 }]
      owner.stableTiles = [{ row: 0, col: 4 }]
      owner.fenceSegments = [
        { edge: 'H-0-4', type: 'fence' }, { edge: 'H-1-4', type: 'fence' },
        { edge: 'V-0-4', type: 'fence' }, { edge: 'V-0-5', type: 'fence' },
      ]
      if (space === 'reed-bank') state.actionSpaces.find(entry => entry.id === space)!.resources.reed = 3
    } })
    if (retained) installRetainedMattock(session, retained)
    const before = session.getState()
    const resourcesBefore = { ...before.state.players[0]!.resources }
    const logsBefore = structuredClone(before.state.log)
    const scoresBefore = structuredClone(before.scores)
    let response = session.takeAction(0, space)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') throw new Error('Expected shared reaction window')
    expect(response.interaction.request.options.map(option => option.sourceCard)).toEqual(expect.arrayContaining([CARD_ID, beaver]))
    session = restore(session, Boolean(retained))
    response = finishReactions(session, session.getState(), firstCard)
    const goods = space === 'reed-bank' ? { reed: 3 } : { reed: 1, stone: 1, food: 1 }
    expectReward(response, goods)
    expect(response.state.players[0]!.cardStates[beaver]?.counters?.bonusVp).toBe(1)
    expect(response.scores[0]!.categories.find(category => category.key === 'cardBonusVp')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: beaver, score: 1 }))
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toEqual(resourcesBefore)
    expect(undone.state.log).toEqual(logsBefore)
    expect(undone.scores).toEqual(scoresBefore)
    expect(undone.interaction.stateId).toBe('idle')
    response = finishReactions(session, session.takeAction(0, space), firstCard)
    expectReward(response, goods)
    expect(response.state.players[0]!.cardStates[beaver]?.counters?.bonusVp).toBe(1)
  })
})

describe('ae-negative-42-resources', () => {
  const { sessions, ok, save, setup, finish, select, play, next } = audit42Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E077 N1 actual wood paid Mattock then Reed Bank or Western Quarry grants one clay once',()=>{for(const [space,resource]of [['reed-bank','reed'],['western-quarry','stone']]as const){const s=setup('E077_Mattock',st=>{st.players[0]!.resources.wood=1;st.actionSpaces.find(a=>a.id===space)!.resources[resource]=1},false,14),bought=play(s,'E077_Mattock');assert.equal(bought.state.players[0]!.resources.wood,0);next(s,bought);next(s,finish(s,ok(s.takeAction(1,'grain-seeds'))));const r=finish(s,ok(s.takeAction(0,space)),true);save(`E077-N1-early-${resource}`,{bought,r});assert.equal(r.state.players[0]!.resources.clay,1);assert.equal(r.state.players[0]!.resources[resource],1);const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.clay,0);save(`E077-N1-${resource}`,{bought,r,u})}})
  it('E077 N2 wood clay food accumulation held card and foreign reed do not grant owner clay',()=>{for(const mode of ['forest','fishing','hand','other']){const actor=mode==='other'?1:0,s=setup('E077_Mattock',st=>{st.currentPlayerIndex=actor},mode!=='hand'),r=finish(s,ok(s.takeAction(actor,['hand','other'].includes(mode)?'reed-bank':mode)),true,'E077_Mattock');assert.equal(r.state.players[0]!.resources.clay,0);save(`E077-N2-${mode}`,r)}})
  it('E077 N3 no wood purchase denies Mattock before a legal free alternative',()=>{const s=setup('E077_Mattock',st=>{st.players[0]!.minorHand.push('E080_RockGarden','C071_Slurry')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'E077_Mattock')),r=finish(s,select(s,p,o=>o.value==='E080_RockGarden'));assert.ok(r.state.players[0]!.minorHand.includes('E077_Mattock'));assert.equal(r.state.players[0]!.resources.clay,0);save('E077-N3',{p,bad,r})})
})
