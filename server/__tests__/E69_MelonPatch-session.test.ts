import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect, computeExtraSowableFields } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/E/E069_MelonPatch'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'E069_MelonPatch'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  round?: number
}) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  player.workersAvailable = options?.round && harvestRounds.includes(options.round) ? 0 : 2
  player.resources.food = 10
  player.resources.grain = options?.grain ?? 0
  player.resources.vegetable = options?.vegetable ?? 0
  player.fields = options?.fields ?? []

  if (options?.withCard ?? true) {
    player.minorPlayed.push(CARD_ID)
  }

  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
    }
  }

  session.loadState(state)
  return session
}

describe('E069_MelonPatch session', () => {
  describe('extra sowable field', () => {
    it('only vegetable is sowable (grain not allowed)', () => {
      const session = setup({ vegetable: 1 })
      const state = session.getState().state
      const player = state.players[0]!
      const extras = computeExtraSowableFields(player)
      expect(extras.length).toBe(1)
      expect(extras[0].tile).toEqual({ row: -1, col: 5069 })
      expect(extras[0].allowedCrops).toEqual(['vegetable'])
      expect(extras[0].sourceCard).toBe(CARD_ID)
    })

    it('grain sow is rejected by onSowExtraField', () => {
      const session = setup({ grain: 1 })
      const state = session.getState().state
      const player = state.players[0]!
      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const result = effect!.onSowExtraField!(player, { row: -1, col: 5069 }, 'grain')
      expect(result).toBe(false)
    })

    it('not sowable when already has crop', () => {
      const session = setup({ vegetable: 1 })
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
      const extras = computeExtraSowableFields(player)
      expect(extras.length).toBe(0)
    })
  })

  describe('sowing via session', () => {
    it('sowing vegetable stores crop data (remaining=2)', () => {
      const session = setup({ vegetable: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: 5069, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.vegetable).toBe(1)

      const stacks = resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks[0].crop).toBe('vegetable')
      expect(stacks[0].remaining).toBe(2)
    })
  })

  describe('harvest', () => {
    it('harvest decrements remaining', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const vegBefore = player.resources.vegetable
      const flow = effect!.onHarvestFieldPhase!(state, player)
      expect(player.resources.vegetable).toBe(vegBefore + 1)
      // remaining was 2, now 1 — no plow since not last
      expect(flow).toBeUndefined()
      const stacks = player.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks[0].remaining).toBe(1)
    })

    it('non-last veg harvest returns no plow', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onHarvestFieldPhase!(state, player)
      expect(flow).toBeUndefined()
    })

    it('last veg harvest returns optional plow flow', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] },
      }
      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      const vegBefore = player.resources.vegetable
      const flow = effect!.onHarvestFieldPhase!(state, player)
      expect(player.resources.vegetable).toBe(vegBefore + 1)
      // Stack should be cleared
      const stacks = player.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks ?? []).toEqual([])
      // Should return optional plow
      expect(flow).toBeDefined()
      expect(flow!.type).toBe('parallel')
      const plow = (flow as Extract<ActionFlow, { type: 'parallel' }>).children[0] as Extract<ActionFlow, { type: 'leaf' }>
      expect(plow.actionId).toBe('plow')
      expect(plow.optional).toBe(true)
      expect(plow.sourceCard).toBe(CARD_ID)
    })
  })
})
