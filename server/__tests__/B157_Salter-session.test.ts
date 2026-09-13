import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import '../../shared/cards/B/B157_Salter'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const CARD_ID = 'B157_Salter'
const placeholder = ['__test_placeholder__']

// 直接 mutate state（参考 A010_WoodenShed-session.test.ts:13-19 现有模式，不调 loadState）
const setup = (options?: {
  resources?: Partial<{ sheep: number; boar: number; cattle: number; food: number }>
  pastures?: Array<{ id:string; size:number; tiles:{row:number;col:number}[]; stables:number; animalType:'sheep'|'boar'|'cattle'|null; animalCount:number }>
  stableAnimals?: Record<string, 'sheep'|'boar'|'cattle'|null>
  round?: number
}) => {
  const session = new GameSession(8157, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 3
  state.roundPhase = 'work'

  const player = state.players[0]!
  player.resources.food = options?.resources?.food ?? 5
  player.resources.sheep = options?.resources?.sheep ?? 0
  player.resources.boar = options?.resources?.boar ?? 0
  player.resources.cattle = options?.resources?.cattle ?? 0
  player.pastures = options?.pastures ?? []
  player.stableAnimals = options?.stableAnimals ?? {}
  player.occupationPlayed.push(CARD_ID)

  // CLAUDE.md Common Pitfall #3：显式 hand placeholder 避免随机 hand 影响判定
  for (const p of state.players) {
    p.minorHand = [...placeholder]
    p.occupationHand = [...placeholder]
  }
  return session
}

describe('B157_Salter session', () => {
  it.each([1, 2])('refreshes animal quantities after cooking %i sheep and rejects stale counts without blocking', (cooked) => {
    let session = setup({
      resources: { sheep: 2, food: 0 },
      pastures: [{ id: 'sheep', size: 2, tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], stables: 0, animalType: 'sheep', animalCount: 2 }],
    })
    session.state.players[0]!.improvements = ['Major_Fireplace1']
    let response = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(response.interaction.request).toMatchObject({ kind: 'resource-quantity-select', availableByResource: { sheep: 2 } })
    response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const cooking = response.interaction.request.options.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' && (option.effectPreview.resourcesPaid?.sheep ?? 0) > 0)!
    response = session.resolveChoice(0, `bulk:${cooking.value.split(':')[1]}=${cooked}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2 - cooked, food: 2 * cooked })
    expect(response.interaction.request).toMatchObject({ kind: 'resource-quantity-select', availableByResource: { sheep: 2 - cooked } })
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    const restored = session.getState()
    const before = structuredClone({ players: restored.state.players, futureMeeples: restored.state.futureMeeples, scores: restored.scores })
    response = session.commitSelectionChoice(0, { resourceCounts: { sheep: 2, boar: 0, cattle: 0 } })
    expect(response.ok).toBe(false)
    expect(response.interaction.stateId).toBe('wait')
    expect(response.interaction.request.kind).toBe('resource-quantity-select')
    expect(response.state.players).toEqual(before.players)
    expect(response.state.futureMeeples).toEqual(before.futureMeeples)
    expect(response.scores).toEqual(before.scores)
    if (cooked === 2) {
      response = session.undoStep(0)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 0 })
      response = session.resolveChoice(0, 'cancel')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.request).toMatchObject({ kind: 'resource-quantity-select', availableByResource: { sheep: 2 } })
      return
    }
    response = session.commitSelectionChoice(0, { resourceCounts: { sheep: 1, boar: 0, cattle: 0 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(0)
    expect(response.state.futureMeeples.map((entry) => ({ round: entry.round, food: entry.resources.food })))
      .toEqual([{ round: 4, food: 1 }, { round: 5, food: 1 }, { round: 6, food: 1 }])
  })

  it('多只触发: pending interaction kind=resource-quantity-select', () => {
    const session = setup({
      resources: { sheep: 2, cattle: 1 },
      pastures: [{ id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2 }],
      stableAnimals: { '2-1': 'cattle' },
      round: 3,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('resource-quantity-select')
      if (resp.interaction.request.kind === 'resource-quantity-select') {
        expect(resp.interaction.request.availableByResource).toEqual({ sheep:2, boar:0, cattle:1 })
      }
    }
  })

  it('cancel from multi-pick returns to idle without salting animals', () => {
    const session = setup({
      resources: { sheep: 2 },
      pastures: [{ id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2 }],
      round: 3,
    })
    session.takeAnytimeAction(0, 'B157-salter-anytime')
    const resp = session.undoStep()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    const p = resp.state.players[0]!
    expect(p.resources.sheep).toBe(2)
    expect(p.pastures[0].animalType).toBe('sheep')
    expect(p.pastures[0].animalCount).toBe(2)
    expect(resp.state.futureMeeples).toEqual([])
  })

  it('commit {sheep:2,cattle:1}: 扣 board + 入 futureMeeples', () => {
    const session = setup({
      resources: { sheep: 2, cattle: 1 },
      pastures: [{ id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2 }],
      stableAnimals: { '2-1': 'cattle' },
      round: 3,
    })
    session.takeAnytimeAction(0, 'B157-salter-anytime')
    const resp = session.commitSelectionChoice(0, { resourceCounts: { sheep:2, boar:0, cattle:1 } })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.sheep).toBe(0)
    expect(p.resources.cattle).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    expect(p.pastures[0].animalType).toBeNull()
    expect(p.stableAnimals['2-1']).toBeNull()
    // futureMeeples: sheep×2 in rounds 4/5/6, cattle×1 in rounds 4..10
    const fms = resp.state.futureMeeples
    const sheepRounds = fms.filter((e) => e.resources.food === 2).map((e) => e.round).sort((a, b) => a - b)
    const cattleRounds = fms.filter((e) => e.resources.food === 1).map((e) => e.round).sort((a, b) => a - b)
    expect(sheepRounds).toEqual([4,5,6])
    expect(cattleRounds).toEqual([4,5,6,7,8,9,10])
	    const log = resp.state.log.find((entry) => entry.key === 'log.salterFutureFood')
	    expect(log?.params).toMatchObject({
	      player: p.name,
	      cardId: CARD_ID,
	      animals: '2 sheep, 1 cattle',
	      sheep: 2,
      boar: 0,
      cattle: 1,
      futureFood: 13,
	      schedule: '2 food in rounds 4-6; 1 food in rounds 4-10',
	    })
	    const queuedEvents = resp.state.events.filter((event) => event.type === 'futureMeeple.queued')
	    expect(queuedEvents).toHaveLength(2)
	    expect(queuedEvents.filter((event) => 'sourceSummary' in event)).toHaveLength(1)
	    expect(queuedEvents).toEqual(expect.arrayContaining([
	      expect.objectContaining({
	        type: 'futureMeeple.queued',
	        cardId: CARD_ID,
	        playerId: p.id,
	        sourceSummary: expect.objectContaining({
	          key: 'log.salterFutureFood',
	          params: expect.objectContaining({
	            cardId: CARD_ID,
	            animals: '2 sheep, 1 cattle',
	            futureFood: 13,
	          }),
	        }),
	      }),
	    ]))
	  })

  it('Negative: reserve>0 不触发', () => {
    const session = setup({
      resources: { sheep: 3 },
      pastures: [{ id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1 }],
      round: 3,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(resp.ok).toBe(false)
  })

  it('Negative: round=14 不触发', () => {
    const session = setup({
      resources: { sheep: 1 },
      pastures: [{ id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1 }],
      round: 14,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(resp.ok).toBe(false)
  })

  it('单只 fast path: 不弹 panel, 直接 ok', () => {
    const session = setup({
      resources: { sheep: 1 },
      pastures: [{ id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1 }],
      round: 3,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.sheep).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    const fms = resp.state.futureMeeples
    expect(fms.map((e) => e.round).sort((a, b) => a - b)).toEqual([4,5,6])
	    const log = resp.state.log.find((entry) => entry.key === 'log.salterFutureFood')
	    expect(log?.params).toMatchObject({
	      player: p.name,
	      cardId: CARD_ID,
	      animals: '1 sheep',
      sheep: 1,
      boar: 0,
      cattle: 0,
	      futureFood: 3,
	      schedule: '1 food in rounds 4-6',
	    })
	    expect(resp.state.events).toEqual(expect.arrayContaining([
	      expect.objectContaining({
	        type: 'futureMeeple.queued',
	        cardId: CARD_ID,
	        playerId: p.id,
	        sourceSummary: expect.objectContaining({
	          key: 'log.salterFutureFood',
	        }),
	      }),
	    ]))
	  })

  it('commit {0,0,0}: 退回 invalid', () => {
    const session = setup({
      resources: { sheep: 2 },
      pastures: [{ id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2 }],
      round: 3,
    })
    session.takeAnytimeAction(0, 'B157-salter-anytime')
    const resp = session.commitSelectionChoice(0, { resourceCounts: { sheep:0, boar:0, cattle:0 } })
    expect(resp.ok).toBe(false)
  })

  it('commit over-board: pre-validate fail 后 pending 保留, 可重试合法 counts', () => {
    const session = setup({
      resources: { sheep: 2 },
      pastures: [{ id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2 }],
      round: 3,
    })
    const open = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(open.ok).toBe(true)
    expect(open.interaction.stateId).toBe('wait')
    // over-board commit: counts.sheep=99 > onBoard.sheep=2
    const bad = session.commitSelectionChoice(0, { resourceCounts: { sheep:99, boar:0, cattle:0 } })
    expect(bad.ok).toBe(false)
    // pending envelope 仍保留（玩家可以再次提交）
    expect(bad.interaction.stateId).toBe('wait')
    if (bad.interaction.stateId === 'wait') {
      expect(bad.interaction.request.kind).toBe('resource-quantity-select')
    }
    // 重试合法 counts → success
    const good = session.commitSelectionChoice(0, { resourceCounts: { sheep:2, boar:0, cattle:0 } })
    expect(good.ok).toBe(true)
    const p = good.state.players[0]!
    expect(p.resources.sheep).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
  })

  it('clampRound: round=13 sheep → futureMeeples 只剩 round 14 一条', () => {
    const session = setup({
      resources: { sheep: 1 },
      pastures: [{ id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1 }],
      round: 13,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')  // single fast path
    expect(resp.ok).toBe(true)
    const fms = resp.state.futureMeeples
    expect(fms.length).toBe(1)
    expect(fms[0].round).toBe(14)
  })
})

describe('B157 Salter parity', () => {
  const CARD_ID = 'B157_Salter'

  const ANYTIME_ID = 'B157-salter-anytime'

  const FILLER = '__test_placeholder__'

  type AnimalCounts = Partial<Record<'sheep' | 'boar' | 'cattle', number>>

  const setup = ({
    played = true, farm = {}, reserve = {}, round = 5,
  }: { played?: boolean; farm?: AnimalCounts; reserve?: AnimalCounts; round?: number } = {}) => {
    const session = new GameSession(6157 + round, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
      player.pastures = []
      player.stableAnimals = {}
      player.houseAnimalType = null
      player.houseAnimalCount = 0
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.sheep = (farm.sheep ?? 0) + (reserve.sheep ?? 0)
    owner.resources.boar = (farm.boar ?? 0) + (reserve.boar ?? 0)
    owner.resources.cattle = (farm.cattle ?? 0) + (reserve.cattle ?? 0)
    if ((farm.sheep ?? 0) > 0) {
      owner.pastures.push({
        id: 'salter-sheep-pasture', size: 2, tiles: [{ row: 1, col: 0 }], stables: 1,
        animalType: 'sheep', animalCount: farm.sheep!,
      })
    }
    if ((farm.boar ?? 0) > 0) {
      owner.stableTiles = [{ row: 1, col: 1 }]
      owner.stableAnimals['1-1'] = 'boar'
    }
    if ((farm.cattle ?? 0) > 0) {
      owner.houseAnimalType = 'cattle'
      owner.houseAnimalCount = farm.cattle!
    }
    session.loadState(state)
    return session
  }

  const enterInteraction = (session: GameSession) => {
    const response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    return response
  }

  const anytimeIds = (response: SessionResponse) => response.interaction.anytimeActions
    .map((action) => action.id)

  const expandedFutureFoodRounds = (response: SessionResponse) => response.state.futureMeeples
    .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

  const assigned = (response: SessionResponse, type: 'sheep' | 'boar' | 'cattle') => {
    const player = response.state.players[0]!
    if (type === 'sheep') return player.pastures
      .filter((pasture) => pasture.animalType === 'sheep')
      .reduce((sum, pasture) => sum + pasture.animalCount, 0)
    if (type === 'boar') return Object.values(player.stableAnimals)
      .filter((animal) => animal === 'boar').length
    return player.houseAnimalType === 'cattle' ? player.houseAnimalCount : 0
  }

  for (const { scenario, animal, rounds } of [
    { scenario: 'S2', animal: 'sheep' as const, rounds: [6, 7, 8] },
    { scenario: 'S3', animal: 'boar' as const, rounds: [6, 7, 8, 9, 10] },
    { scenario: 'S4', animal: 'cattle' as const, rounds: [6, 7, 8, 9, 10, 11, 12] },
  ]) {
    it(`B157 ${scenario}: salting one farm ${animal} removes it and schedules its future food`, () => {
      const session = setup({ farm: { [animal]: 1 } })
      const entered = enterInteraction(session)
      expect(anytimeIds(entered)).toContain(ANYTIME_ID)

      const response = session.takeAnytimeAction(0, ANYTIME_ID)

      expect(response.ok, response.error).toBe(true)
      expect(assigned(response, animal)).toBe(0)
      expect(expandedFutureFoodRounds(response)).toEqual(rounds)
    })
  }

  it('B157 S9: with no animal on the farm Salter is unavailable', () => {
    const response = enterInteraction(setup())

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
  })

  it('B157 S12: the first scheduled food is received at the start of the next round', () => {
    const session = setup({ farm: { sheep: 1 }, round: 5 })
    enterInteraction(session)
    const salted = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(expandedFutureFoodRounds(salted)).toEqual([6, 7, 8])
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(expandedFutureFoodRounds(response)).toEqual([7, 8])
  })
})
