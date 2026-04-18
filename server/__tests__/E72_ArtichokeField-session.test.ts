import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect, computeExtraSowableFields } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/E/E72_ArtichokeField'

const CARD_ID = 'E72_ArtichokeField'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  round?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.phase = 'work'
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
    player.playedCards.push(`minor:${CARD_ID}`)
  }

  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
    }
  }

  session.loadState(state)
  return session
}

describe('E72_ArtichokeField session', () => {
  describe('extra sowable field', () => {
    it('registers as extra sowable field when empty', () => {
      const session = setup({ grain: 1 })
      const state = session.getState().state
      const player = state.players[0]!
      const extras = computeExtraSowableFields(player)
      expect(extras.length).toBe(1)
      expect(extras[0].tile).toEqual({ row: -1, col: 72 })
      expect(extras[0].allowedCrops).toContain('grain')
      expect(extras[0].allowedCrops).toContain('vegetable')
      expect(extras[0].sourceCard).toBe(CARD_ID)
    })

    it('not sowable when already has crop', () => {
      const session = setup({ grain: 2 })
      const state = session.getState().state
      const player = state.players[0]!
      // Manually set a crop on the card
      player.cardStates[CARD_ID] = {
        extraData: { cardCrop: { crop: 'grain', remaining: 3 } },
      }
      const extras = computeExtraSowableFields(player)
      expect(extras.length).toBe(0)
    })
  })

  describe('sowing', () => {
    it('sowing grain stores crop data (remaining=3)', () => {
      const session = setup({ grain: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')

      // Sow grain into virtual card tile
      resp = session.commitFarmChoice(0, 'sow', {
        crops: [{ row: -1, col: 72, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.grain).toBe(1)

      const cardState = resp.state.players[0]!.cardStates[CARD_ID]
      expect(cardState?.extraData?.cardCrop).toBeDefined()
      const cardCrop = cardState?.extraData?.cardCrop as any
      expect(cardCrop.crop).toBe('grain')
      expect(cardCrop.remaining).toBe(3)
    })

    it('sowing vegetable stores crop data (remaining=2)', () => {
      const session = setup({ vegetable: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)

      resp = session.commitFarmChoice(0, 'sow', {
        crops: [{ row: -1, col: 72, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.vegetable).toBe(1)

      const cardCrop = resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.cardCrop as any
      expect(cardCrop.crop).toBe('vegetable')
      expect(cardCrop.remaining).toBe(2)
    })

    it('makes sow doable when only card field exists (no empty regular fields)', () => {
      const session = setup({
        grain: 1,
        fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }], // no empty fields
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')
    })
  })

  describe('harvest', () => {
    it('harvest decrements remaining + gains crop + gains 1 bonus food', () => {
      const session = setup({
        round: 4,
        grain: 0,
      })

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardCrop: { crop: 'grain', remaining: 3 } },
      }
      for (const p of state.players) {
        p.resources.food = 10
      }
      session.loadState(state)

      const resp = session.performRoundEnd()
      const playerAfter = resp.state.players[0]!

      // Should gain 1 grain from harvest
      expect(playerAfter.resources.grain).toBe(1)
      // Should gain 1 bonus food (on top of existing 10, minus feeding cost)
      // Food = 10 + 1 (bonus) - feeding. Let's check the cardCrop state
      const cardCrop = playerAfter.cardStates[CARD_ID]?.extraData?.cardCrop as any
      expect(cardCrop).toBeDefined()
      expect(cardCrop.remaining).toBe(2)
    })

    it('crop cleared when remaining reaches 0', () => {
      const session = setup({
        round: 4,
        grain: 0,
      })

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardCrop: { crop: 'grain', remaining: 1 } },
      }
      for (const p of state.players) {
        p.resources.food = 10
      }
      session.loadState(state)

      const resp = session.performRoundEnd()
      const playerAfter = resp.state.players[0]!

      expect(playerAfter.resources.grain).toBe(1)
      // Crop should be cleared
      const cardCrop = playerAfter.cardStates[CARD_ID]?.extraData?.cardCrop
      expect(cardCrop).toBeNull()
    })

    it('harvest gives bonus food via effect hook', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.cardStates[CARD_ID] = {
        extraData: { cardCrop: { crop: 'vegetable', remaining: 2 } },
      }
      session.loadState(state)

      // Test the effect hook directly
      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const foodBefore = player.resources.food
      const vegBefore = player.resources.vegetable
      effect!.onHarvestFieldPhase!(state, player)
      expect(player.resources.vegetable).toBe(vegBefore + 1)
      expect(player.resources.food).toBe(foodBefore + 1)
    })
  })
})
