import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeScores } from '../../shared/domain/scoring'
import type { ActionChoiceOption,  GameState, PlayerState, Resource } from '../../shared/contract/types'

import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount, familySize } from '../../shared/domain/player'
import '../../shared/cards/E/E159_OldMiser'
import assert from 'node:assert/strict'
import * as audit56Family from './_helpers/audit/ae-negative-56-family'

const CARD_ID = 'E159_OldMiser'

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
  occupationHand: [], occupationPlayed: [],houseAnimals: {}, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  activeModifiers: [], cardStates: {},
} as PlayerState)

const createState = (...players: PlayerState[]): GameState => ({
  round: 14, currentPlayerIndex: 0, players,
  actionSpaces: [], log: [],
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: true, workPhaseObtainedResources: {},
} as GameState)

describe('E159_OldMiser session', () => {
  describe('feeding reduction', () => {
    it('with card, 2 adults, feeding needs 2 food (not 4)', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      state.players = state.players.slice(0, 2)
      state.round = 4 // harvest round

      state.players.forEach((p) => {
        markAllWorkersUsed(state, p)
        p.resources.food = 10
      })

      const player = state.players[0]!
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      player.resources.food = 2
      player.occupationPlayed.push(CARD_ID)

      const player2 = state.players[1]!
      setActiveWorkerCount(player2, 2)
      setNewbornCount(player2, 0)
      player2.resources.food = 10

      session.loadState(state)

      let resp = session.performRoundEnd()

      let safety = 30
      while (safety-- > 0 && resp.interaction.stateId === 'wait') {
        if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
        } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
        } else if (resp.interaction.stateId === 'wait') {
          const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
          if (skipOpt) {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
          } else {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
          }
        } else {
          break
        }
      }

      expect(resp.state.players[0]!.resources.begging).toBe(0)
      expect(resp.state.players[0]!.resources.food).toBe(0)
    })

    it('without card, 2 adults, feeding needs 4 food', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      state.players = state.players.slice(0, 2)
      state.round = 4

      state.players.forEach((p) => {
        markAllWorkersUsed(state, p)
        p.resources.food = 10
      })

      const player = state.players[0]!
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      player.resources.food = 2
      // Card NOT played

      const player2 = state.players[1]!
      setActiveWorkerCount(player2, 2)
      setNewbornCount(player2, 0)
      player2.resources.food = 10

      session.loadState(state)

      let resp = session.performRoundEnd()

      let safety = 30
      while (safety-- > 0 && resp.interaction.stateId === 'wait') {
        if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
        } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
        } else if (resp.interaction.stateId === 'wait') {
          const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
          if (skipOpt) {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
          } else {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
          }
        } else {
          break
        }
      }

      // Without card: 2 adults need 4 food, only had 2 → 2 begging
      expect(resp.state.players[0]!.resources.begging).toBe(2)
      expect(resp.state.players[0]!.resources.food).toBe(0)
    })

    it('with card and newborn, feeding is further reduced', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      state.players = state.players.slice(0, 2)
      state.round = 4

      const player = state.players[0]!
      setActiveWorkerCount(player, 3)
      setNewbornCount(player, 1)
      markAllWorkersUsed(state, player)
      player.resources.food = 2
      player.occupationPlayed.push(CARD_ID)

      const player2 = state.players[1]!
      setActiveWorkerCount(player2, 2)
      setNewbornCount(player2, 0)
      markAllWorkersUsed(state, player2)
      player2.resources.food = 10

      session.loadState(state)

      let resp = session.performRoundEnd()

      let safety = 30
      while (safety-- > 0 && resp.interaction.stateId === 'wait') {
        if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
        } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
        } else if (resp.interaction.stateId === 'wait') {
          const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
          if (skipOpt) {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
          } else {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
          }
        } else {
          break
        }
      }

      expect(resp.state.players[0]!.resources.begging).toBe(0)
      expect(resp.state.players[0]!.resources.food).toBe(0)
    })
  })

  describe('effective farmer score', () => {
    it('scores two people at two points each without a separate card penalty', () => {
    const ruleRegistry = createOfficialCardRegistry()
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setActiveWorkerCount(player, 2)
      const state = createState(player)
      const [result] = withActiveRegistry(ruleRegistry, () => computeScores(state))

      const farmerCat = result.categories.find((c) => c.key === 'farmers')
      expect(farmerCat!.total).toBe(4)

      const postScoreCat = result.categories.find((c) => c.key === 'cardBonusVp')
      expect(postScoreCat).toBeUndefined()
    })

    it('scores five people at ten effective farmer points', () => {
    const ruleRegistry = createOfficialCardRegistry()
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setActiveWorkerCount(player, 5)
      const state = createState(player)
      const [result] = withActiveRegistry(ruleRegistry, () => computeScores(state))

      const postScoreCat = result.categories.find((c) => c.key === 'cardBonusVp')
      expect(postScoreCat).toBeUndefined()
      expect(result.categories.find((c) => c.key === 'farmers')!.total).toBe(10)
    })

    it('no penalty when card not played', () => {
    const ruleRegistry = createOfficialCardRegistry()
      const player = createPlayer()
      setActiveWorkerCount(player, 3)
      const state = createState(player)
      const [result] = withActiveRegistry(ruleRegistry, () => computeScores(state))

      // No post-score card effect should be registered without the card
      const postScoreCat = result.categories.find((c) => c.key === 'cardBonusVp')
      expect(postScoreCat).toBeUndefined()
    })
  })
})

describe('ae-negative-56-family', () => {
  const { sessions, ok, save, make, finish, end, people, bonus } = audit56Family
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E159 N1 real harvest charges one food per adult for two three and five people while a held card grants no reduction',()=>{for(const[n,held]of[[2,false],[3,false],[5,false],[2,true]]as const){const s=make('E159_OldMiser',st=>people(st.players[0]!,n),!held,4),r=finish(s,end(s));assert.equal(r.state.players[0]!.resources.food,100-n*(held?2:1));assert.equal(r.state.players[0]!.resources.begging,0);save(`E159-N1-${n}-${held}`,r)}})
  it('E159 N2 genuine round-seven newborn requires zero food and nonharvest round never feeds family',()=>{const s=make('E159_OldMiser',st=>{people(st.players[0]!,3);setActiveWorkerCount(st.players[0]!,2)},true,7),grown=finish(s,ok(s.takeAction(0,'wish-children')),true),r=finish(s,end(s));assert.equal(familySize(grown.state.players[0]!),3);assert.equal(r.state.players[0]!.resources.food,98);const n=make('E159_OldMiser',undefined,true,5),nr=finish(n,end(n));assert.equal(nr.state.players[0]!.resources.food,100);save('E159-N2',{grown,r,nr})})
  it('E159 N3 actual final scoring uses two-point effective farmers without a separate penalty',()=>{for(const n of[2,3,5]){const s=make('E159_OldMiser',st=>people(st.players[0]!,n),true,14),r=finish(s,end(s));assert.equal(r.state.gameOver,true);assert.equal(r.scores?.[0]?.categories.find(c=>c.key==='farmers')?.total,2*n);assert.equal(bonus(r,'E159_OldMiser'),0);save(`E159-N3-${n}`,r)}})
})
