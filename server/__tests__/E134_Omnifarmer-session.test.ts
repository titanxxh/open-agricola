import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { descriptionEffects } from './_helpers/choice-description'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'

import '../../shared/cards/E/E134_Omnifarmer'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit52Animals from './_helpers/audit/ae-negative-52-animals'

const CARD_ID = 'E134_Omnifarmer'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (id = 'p1'): PlayerState => ({
  id, name: id, color: 'red',
  resources: emptyResources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2, houseType: 'wood',
  fields: [], fences: 0,
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],
  houseAnimals: {}, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  cardStates: {},
}) as PlayerState

const createState = (...players: PlayerState[]): GameState => ({
  round: 14, currentPlayerIndex: 0, players,
  actionSpaces: [], log: [],
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: true, workPhaseObtainedResources: {},
}) as GameState

const setStored = (player: PlayerState, stored: string[]): void => {
  player.cardStates ??= {}
  player.cardStates[CARD_ID] = {
    extraData: { storedGoods: stored },
  }
}

describe('E134_Omnifarmer session', () => {
  describe('computeBonusScore', () => {
    it.each([
      [[], 0],
      [['grain'], 0],
      [['grain', 'vegetable'], 3],
      [['grain', 'vegetable', 'sheep'], 5],
      [['grain', 'vegetable', 'sheep', 'boar'], 7],
      [['grain', 'vegetable', 'sheep', 'boar', 'cattle'], 9],
    ])('scores stored goods %#', (stored, expected) => {
    const ruleRegistry = createOfficialCardRegistry()
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setStored(player, stored)

      const [result] = withActiveRegistry(ruleRegistry, () => computeScores(createState(player)))
      const bonusCat = result.categories.find(c => c.key === 'cardBonusVp')
      expect(bonusCat?.total ?? 0).toBe(expected)
    })
  })

})

describe('E134 Omnifarmer parity', () => {
  const CARD_ID = 'E134_Omnifarmer'

  const FILLER = '__test_placeholder__'

  type StoredGood = 'grain' | 'vegetable' | 'sheep' | 'boar' | 'cattle'

  const setup = ({
    played = true, crop = null as 'grain' | 'vegetable' | null, cropCount = 1,
    sheep = 0, stored = [] as StoredGood[], playerCount = 3,
  } = {}) => {
    const session = new GameSession(6134, undefined, { playerCount })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.fields = []
      player.pastures = []
      player.stableTiles = []
      player.houseAnimals = {};
      setActiveWorkerCount(player, 1)
      markAllWorkersUsed(state, player)
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.cardStates = { [CARD_ID]: { extraData: { storedGoods: stored } } }
    if (crop !== null) {
      owner.fields = [{
        row: 0, col: 1, stacks: [{ kind: crop, remaining: cropCount }],
      }]
    }
    if (sheep > 0) {
      owner.resources.sheep = sheep
      owner.pastures = [{
        id: 'sheep', animalType: 'sheep', animalCount: sheep, size: 2, stables: 1,
        tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
      }]
      owner.stableTiles = [{ row: 1, col: 1 }]
    }
    if (!played) {
      state.actionSpaces.forEach((space) => {
        space.takenBy = space.takenBy.filter((worker) => worker.playerId !== owner.id)
      })
    }
    session.loadState(state)
    return session
  }

  const choiceFor = (response: SessionResponse, resource: StoredGood) => optionsOf(response).find(option => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'payment' && effect.resourcesPaid?.[resource] === 1))!

  const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const advanceToOmnifarmer = (session: GameSession, initial?: SessionResponse) => {
    let response = initial ?? session.performRoundEnd()
    for (let step = 0; step < 12 && response.interaction.stateId === 'wait'; step += 1) {
      if (response.interaction.promptKey === 'ui.interactionE134Prompt') return response
      if (response.interaction.request.kind === 'feed') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
        continue
      }
      const skip = optionsOf(response).find((option) =>
        option.value === '__skip__' || option.value === '__pass__')
      if (!skip) break
      response = session.resolveChoice(response.interaction.playerIndex, skip.value)
    }
    return response
  }

  const storedGoods = (response: SessionResponse): StoredGood[] =>
    (response.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.storedGoods as StoredGood[] | undefined) ?? []

  it('keeps the deposit window but disables harvested grain already consumed during feeding', () => {
    const session = setup({ crop: 'grain', cropCount: 2, playerCount: 2 })
    session.state.players[0]!.resources.food = 1
    let response = session.performRoundEnd()
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'feed') {
      const skip = optionsOf(response).find((option) => option.value === '__skip__' || option.value === '__pass__')!
      response = session.resolveChoice(response.interaction.playerIndex, skip.value)
      expect(response.ok, response.error).toBe(true)
    }
    response = session.resolveChoice(0, 'confirm', { selections: [{ sourceId: '__basic__', exchangeIndex: 0, count: 1 }] })
    expect(response.ok, response.error).toBe(true)
    response = advanceToOmnifarmer(session, response)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(choiceFor(response, 'grain').disabled).toBe(true)
    const before = structuredClone(response.state.players)
    response = session.resolveChoice(0, choiceFor(response, 'grain').value)
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    expect(response.interaction.promptKey).toBe('ui.interactionE134Prompt')
    expect(storedGoods(response)).toEqual([])
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(storedGoods(response)).toEqual([])
  })

  it.each([{ stored: [] }, { stored: ['vegetable'] }] satisfies { stored: StoredGood[] }[])('E134 S2: stores one harvested grain with prior goods %j', ({ stored }) => {
    const session = setup({ crop: 'grain', cropCount: 2, stored, playerCount: 2 })
    let response = advanceToOmnifarmer(session)
    expect(choiceFor(response, 'grain')).toBeDefined()
    expect(optionsOf(response).map(option => option.value)).toContain('__skip__')

    response = session.resolveChoice(0, choiceFor(response, 'grain').value)

    expect(storedGoods(response)).toEqual([...stored, 'grain'])
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0)
      .toBe(stored.length === 0 ? 0 : 3)
  })

  it('E134 S3: declining Omnifarmer keeps the harvested grain in supply', () => {
    const session = setup({ crop: 'grain', cropCount: 2 })
    advanceToOmnifarmer(session)
    const response = session.resolveChoice(0, '__skip__')

    expect(storedGoods(response)).toEqual([])
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('E134 S4: a harvested crop type already stored is not offered again', () => {
    const response = advanceToOmnifarmer(setup({
      crop: 'grain', cropCount: 2, stored: ['grain'],
    }))

    expect(response.interaction.stateId === 'wait'
      ? response.interaction.promptKey : undefined).not.toBe('ui.interactionE134Prompt')
    expect(storedGoods(response)).toEqual(['grain'])
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('E134 S5: one newborn sheep may be stored after breeding', () => {
    const session = setup({ sheep: 2 })
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'animal-reorg' },
    })
    response = session.resolveChoice(0, 'confirm', [{
      id: 'sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: 3,
    }])
    response = advanceToOmnifarmer(session, response)
    expect(choiceFor(response, 'sheep')).toBeDefined()
    expect(optionsOf(response).map(option => option.value)).toContain('__skip__')

    response = session.resolveChoice(0, choiceFor(response, 'sheep').value)

    expect(storedGoods(response)).toEqual(['sheep'])
    expect(response.state.players[0]!.resources.sheep).toBe(2)
  })

  it('E134 S6: existing sheep without a newborn do not trigger Omnifarmer', () => {
    const response = advanceToOmnifarmer(setup({ sheep: 1 }))

    expect(response.interaction.stateId === 'wait'
      ? response.interaction.promptKey : undefined).not.toBe('ui.interactionE134Prompt')
    expect(storedGoods(response)).toEqual([])
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
})

describe('ae-negative-52-animals', () => {
  const { sessions, save, make, options, pendingCard, trigger, finish, lesson, SAFE, progress, bonus, OMNI, stored, deposit, omni } = audit52Animals
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E134 N1 actual purchase stores nothing and one real harvested grain may be deposited irretrievably once or declined',()=>{const bought=lesson(omni(false),OMNI);assert.deepEqual(stored(bought),[]);for(const accept of[true,false]){const s=omni(),pending=progress(s,8,OMNI,SAFE.filter(s=>s!=='grain-seeds')),r=accept?deposit(s,pending,'grain'):finish(s,pending);assert.deepEqual(stored(r),accept?['grain']:[]);assert.equal(r.state.players[0]!.resources.grain,accept?0:1);assert.equal(bonus(r,OMNI),0);save(`E134-N1-${accept}`,{bought,pending,r})}})
  it('E134 N2 five distinct actual harvested or newborn goods stored over natural harvests score zero three five seven nine once and never allow duplicate storage',()=>{const s=omni(true,4,true),rows=[];for(const[target,type,score]of[[5,'grain',0],[8,'vegetable',3],[10,'sheep',5],[12,'boar',7],[14,'cattle',9]] as const){const pending=trigger(s,progress(s,target,OMNI,SAFE.filter(id=>id!=='western-quarry')),OMNI);for(const good of stored(pending))assert.equal(options(pending).some(o=>!o.disabled&&descriptionEffects(o.effectPreview?.kind==='rule'?o.effectPreview.description:o.descriptionPreview).some(e=>e.kind==='payment'&&e.resourcesPaid?.[good]===1)),false);const r=deposit(s,pending,type);save(`E134-N2-step-${target}`,{pending,r});assert.equal(stored(r).length,rows.length+1);assert.equal(bonus(r,OMNI),score);rows.push({pending,r})}const end=progress(s,15,OMNI,SAFE.filter(id=>id!=='western-quarry'));assert.equal(pendingCard(end,OMNI),false);assert.equal(stored(end).length,5);assert.equal(bonus(end,OMNI),9);assert.equal(end.state.gameOver,true);save('E134-N2',{rows,end})})
  it('E134 N3 an unharvested supply crop no actual newborn and a held card cannot deposit while a forged good rejects before a legal harvest deposit',()=>{for(const played of[true,false]){const s=make(OMNI,played,state=>{state.round=7;state.players[0]!.resources.grain=3;state.players[0]!.resources.sheep=1;const t=state.players[0]!.roomTiles[0]!;state.players[0]!.houseAnimals={[`${t.row}-${t.col}`]:'sheep'}}),r=progress(s,8);assert.deepEqual(stored(r),[]);assert.equal(r.state.players[0]!.resources.grain,4);save(`E134-N3-${played}`,r)}const s=omni(),pending=trigger(s,progress(s,8,OMNI,SAFE.filter(s=>s!=='grain-seeds')),OMNI),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'__cattle_not_born__')),r=deposit(s,pending,'vegetable');assert.deepEqual(stored(r),['vegetable']);assert.equal(r.state.players[0]!.resources.vegetable,0);save('E134-N3-retry',{pending,bad,r})})
})
