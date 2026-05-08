import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { computeScores } from '../../shared/domain/scoring'
import type { ActionChoiceOption,  GameState, PlayerState, Resource } from '../../shared/contract/types'

import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount } from '../../shared/game/player'
import '../../shared/cards/E/E159_OldMiser'

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
  occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  activeModifiers: [], cardStates: {},
} as PlayerState)

const createState = (...players: PlayerState[]): GameState => ({
  round: 14, currentPlayerIndex: 0, players,
  actionSpaces: [], log: [], roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: true, workPhaseObtainedResources: {},
} as GameState)

describe('E159_OldMiser session', () => {
  describe('feeding reduction', () => {
    it('with card, 2 adults, feeding needs 2 food (not 4)', () => {
      const session = new GameSession()
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
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.zones)
        } else if (resp.interaction.stateId === 'wait') {
          const skipOpt = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
          if (skipOpt) {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
          } else {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.options[0]!.value)
          }
        } else {
          break
        }
      }

      // With Old Miser: 2 adults need 1 food each = 2 food.
      // Player had 2 food, so exactly enough — no begging.
      // The food given by onBeforeFeed (familySize=2) makes effective cost:
      // required=4, food=2+2=4, remaining=0
      expect(resp.state.players[0]!.resources.begging).toBe(0)
      expect(resp.state.players[0]!.resources.food).toBe(0)
    })

    it('without card, 2 adults, feeding needs 4 food', () => {
      const session = new GameSession()
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
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.zones)
        } else if (resp.interaction.stateId === 'wait') {
          const skipOpt = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
          if (skipOpt) {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
          } else {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.options[0]!.value)
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
      const session = new GameSession()
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
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.zones)
        } else if (resp.interaction.stateId === 'wait') {
          const skipOpt = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
          if (skipOpt) {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
          } else {
            resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.options[0]!.value)
          }
        } else {
          break
        }
      }

      // With Old Miser: 2 adults need 1 each = 2, newborn needs 0 = total 2
      // Formula: required = 3*2 - 1 = 5, food given = 2 + 3(bonus) = 5, remaining = 0
      expect(resp.state.players[0]!.resources.begging).toBe(0)
      expect(resp.state.players[0]!.resources.food).toBe(0)
    })
  })

  describe('scoring penalty', () => {
    it('reduces farmer score by 1 per person (2 people = -2 VP)', () => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setActiveWorkerCount(player, 2)
      const state = createState(player)
      const [result] = computeScores(state)

      // Normal farmer score: 2 * 3 = 6
      // Post-score adjustment: -2 (1 per person)
      // So net farmer effect: 4 VP
      const farmerCat = result.categories.find((c) => c.key === 'farmers')
      expect(farmerCat!.total).toBe(6) // Base farmer score still 6

      // Post-score penalty
      const postScoreCat = result.categories.find((c) => c.key === 'cardStateBonusVp')
      expect(postScoreCat).toBeDefined()
      expect(postScoreCat!.total).toBe(-2) // -1 per person * 2 people
    })

    it('with 5 people, reduces by 5 VP', () => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setActiveWorkerCount(player, 5)
      const state = createState(player)
      const [result] = computeScores(state)

      const postScoreCat = result.categories.find((c) => c.key === 'cardStateBonusVp')
      expect(postScoreCat).toBeDefined()
      expect(postScoreCat!.total).toBe(-5)
    })

    it('no penalty when card not played', () => {
      const player = createPlayer()
      setActiveWorkerCount(player, 3)
      const state = createState(player)
      const [result] = computeScores(state)

      // No post-score card effect should be registered without the card
      const postScoreCat = result.categories.find((c) => c.key === 'cardStateBonusVp')
      expect(postScoreCat).toBeUndefined()
    })
  })
})
