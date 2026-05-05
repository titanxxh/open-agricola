import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../shared/game/types'
import { computeScores } from '../../shared/domain/scoring'

import '../../shared/cards/E/E134_Omnifarmer'

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
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  cardStates: {},
}) as PlayerState

const createState = (...players: PlayerState[]): GameState => ({
  round: 14, currentPlayerIndex: 0, players,
  actionSpaces: [], log: [], roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: true, workPhaseObtainedResources: {},
}) as GameState

const setStored = (player: PlayerState, stored: string[], usedThisHarvest = false): void => {
  player.cardStates ??= {}
  player.cardStates[CARD_ID] = {
    extraData: { storedGoods: stored, usedThisHarvest },
  }
}

describe('E134_Omnifarmer session', () => {
  describe('computeBonusScore', () => {
    it('returns 0 when storedGoods is empty', () => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setStored(player, [])

      const [result] = computeScores(createState(player))
      const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
      expect(bonusCat?.total ?? 0).toBe(0)
    })

    it('returns 0 when storedGoods has 1 type', () => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setStored(player, ['grain'])

      const [result] = computeScores(createState(player))
      const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
      expect(bonusCat?.total ?? 0).toBe(0)
    })

    it('returns 3 VP for 2 types', () => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setStored(player, ['grain', 'vegetable'])

      const [result] = computeScores(createState(player))
      const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
      expect(bonusCat?.total ?? 0).toBe(3)
    })

    it('returns 5 VP for 3 types', () => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setStored(player, ['grain', 'vegetable', 'sheep'])

      const [result] = computeScores(createState(player))
      const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
      expect(bonusCat?.total ?? 0).toBe(5)
    })

    it('returns 7 VP for 4 types', () => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setStored(player, ['grain', 'vegetable', 'sheep', 'boar'])

      const [result] = computeScores(createState(player))
      const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
      expect(bonusCat?.total ?? 0).toBe(7)
    })

    it('returns 9 VP for 5 types', () => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setStored(player, ['grain', 'vegetable', 'sheep', 'boar', 'cattle'])

      const [result] = computeScores(createState(player))
      const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
      expect(bonusCat?.total ?? 0).toBe(9)
    })
  })

  describe('onAfterHarvest clears usedThisHarvest', () => {
    it('clears usedThisHarvest flag after harvest', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      setStored(player, ['grain'], true)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      effect!.onAfterHarvest!(state, player)

      const stored = player.cardStates?.[CARD_ID]?.extraData
      expect(stored?.storedGoods).toEqual(['grain'])
      expect(stored?.usedThisHarvest).toBe(false)
    })

    it('is a no-op if usedThisHarvest is already false', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      setStored(player, ['grain'], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      effect!.onAfterHarvest!(state, player)
      const stored = player.cardStates?.[CARD_ID]?.extraData
      expect(stored?.storedGoods).toEqual(['grain'])
      expect(stored?.usedThisHarvest).toBe(false)
    })
  })

  describe('onAfterReap', () => {
    it('returns a choice flow with skip + grain + vegetable when both present and none stored', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 2
      player.resources.vegetable = 1
      setStored(player, [], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onAfterReap!(state, player) as ActionFlow | undefined
      expect(flow).toBeDefined()
      // emit-choice leaf with options[skip, grain, vegetable]
      const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
      expect(leaf.type).toBe('leaf')
      expect(leaf.actionId).toBe('emit-choice')
      const options = (leaf.params as { options: Array<{ value: string }> }).options
      const values = options.map(o => o.value).sort()
      expect(values).toEqual(['grain', 'skip', 'vegetable'])
    })

    it('returns undefined when usedThisHarvest is true', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 2
      player.resources.vegetable = 1
      setStored(player, [], true)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onAfterReap!(state, player)
      expect(flow).toBeUndefined()
    })

    it('returns flow with vegetable only when grain already stored', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 2
      player.resources.vegetable = 1
      setStored(player, ['grain'], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onAfterReap!(state, player) as ActionFlow | undefined
      expect(flow).toBeDefined()
      const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
      expect(leaf.actionId).toBe('emit-choice')
      const options = (leaf.params as { options: Array<{ value: string }> }).options
      const values = options.map(o => o.value).sort()
      expect(values).toEqual(['skip', 'vegetable'])
    })

    it('returns undefined when player has no grain or vegetable', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 0
      player.resources.vegetable = 0
      setStored(player, [], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onAfterReap!(state, player)
      expect(flow).toBeUndefined()
    })
  })

  describe('onHarvestFeedingPhase', () => {
    it('returns flow offering sheep deposit when sheep>=3', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.sheep = 3
      setStored(player, [], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onHarvestFeedingPhase!(state, player) as ActionFlow | undefined
      expect(flow).toBeDefined()
      const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
      expect(leaf.actionId).toBe('emit-choice')
      const options = (leaf.params as { options: Array<{ value: string }> }).options
      const values = options.map(o => o.value).sort()
      expect(values).toContain('sheep')
      expect(values).toContain('skip')
    })

    it('returns undefined when no animal type meets threshold', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.sheep = 2
      player.resources.boar = 0
      player.resources.cattle = 0
      setStored(player, [], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onHarvestFeedingPhase!(state, player)
      expect(flow).toBeUndefined()
    })

    it('returns undefined when usedThisHarvest is true', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.sheep = 5
      setStored(player, [], true)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onHarvestFeedingPhase!(state, player)
      expect(flow).toBeUndefined()
    })

    it('offers all three animals when all meet threshold', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.sheep = 3
      player.resources.boar = 3
      player.resources.cattle = 3
      setStored(player, [], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onHarvestFeedingPhase!(state, player) as ActionFlow | undefined
      expect(flow).toBeDefined()
      const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
      const options = (leaf.params as { options: Array<{ value: string }> }).options
      const values = options.map(o => o.value).sort()
      expect(values).toEqual(['boar', 'cattle', 'sheep', 'skip'])
    })
  })

  describe('resolveChoice', () => {
    it('marks deposit and pays the resource via follow-up flow', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 2
      setStored(player, [], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const followUp = effect!.resolveChoice!(state, player, 'grain', { sourceCard: CARD_ID })
      // storedGoods updated synchronously
      const stored = player.cardStates?.[CARD_ID]?.extraData
      expect(stored?.storedGoods).toEqual(['grain'])
      expect(stored?.usedThisHarvest).toBe(true)
      // follow-up flow pays 1 grain
      expect(followUp).toBeDefined()
    })

    it('skip choice does not modify state and returns undefined', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 2
      setStored(player, [], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const followUp = effect!.resolveChoice!(state, player, 'skip', { sourceCard: CARD_ID })
      expect(followUp).toBeUndefined()
      const stored = player.cardStates?.[CARD_ID]?.extraData
      expect(stored?.storedGoods).toEqual([])
      expect(stored?.usedThisHarvest).toBe(false)
    })

    it('does not duplicate already-stored type', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)

      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 2
      setStored(player, ['grain'], false)
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      effect!.resolveChoice!(state, player, 'grain', { sourceCard: CARD_ID })
      const stored = player.cardStates?.[CARD_ID]?.extraData
      expect(stored?.storedGoods).toEqual(['grain'])
    })
  })
})
