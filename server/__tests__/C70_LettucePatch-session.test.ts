import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/C/C70_LettucePatch'
import type { ActionFlow, PendingAction } from '../../shared/game/types'

const CARD_ID = 'C70_LettucePatch'
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
  state.roundPhase = 'work'
  // Ensure grain-utilization is available
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

  // Set all players' workers to 0 for harvest/round-end tests
  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    }
  }

  session.loadState(state)
  return session
}

describe('C70_LettucePatch session', () => {
  describe('sow - only vegetable sowable', () => {
    it('allows sowing vegetable in the card field', () => {
      const session = setup({ vegetable: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')
      expect((resp.pending as Extract<PendingAction, { type: 'choice' }>).promptKey).toBe('ui.interactionSowSelect')
      expect(resp.interaction.stateId).toBe('farmSelect')

      // The interaction should include the virtual tile as sowable
      if (resp.interaction.stateId === 'farmSelect' && resp.interaction.farm.farmType === 'sow') {
        const cardField = resp.interaction.farm.selectableFields.find(
          (f) => f.tile.row === -1 && f.tile.col === 70,
        )
        expect(cardField).toBeDefined()
        expect(cardField?.allowedCrops).toEqual(['vegetable'])
        // Should NOT allow grain
        expect(cardField?.allowedCrops).not.toContain('grain')
      }

      // Sow vegetable in the card's field
      resp = session.commitFarmChoice(0, 'sow', {
        crops: [{ row: -1, col: 70, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)

      // Vegetable should be deducted
      expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    })

    it('does NOT allow sowing grain in the card field', () => {
      const session = setup({ grain: 2, vegetable: 0 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      // Sow should fail because no fields and card only allows vegetable
      expect(resp.ok).toBe(false)
    })
  })

  describe('sowing stores crop data', () => {
    it('stores crop data in cardStates after sowing', () => {
      const session = setup({ vegetable: 1 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)

      resp = session.commitFarmChoice(0, 'sow', {
        crops: [{ row: -1, col: 70, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)

      const cardState = resp.state.players[0]!.cardStates[CARD_ID]
      expect(cardState?.extraData?.cardCrop).toBeDefined()
      const crop = cardState?.extraData?.cardCrop as any
      expect(crop.crop).toBe('vegetable')
      expect(crop.remaining).toBe(2)
    })
  })

  describe('harvest grants 1 veg + optional conversion to 4 food', () => {
    it('onHarvestFieldPhase harvests 1 vegetable and offers conversion', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)
      state.round = 4

      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.vegetable = 0
      player.cardStates[CARD_ID] = {
        extraData: {
          cardCrop: { crop: 'vegetable', remaining: 2 },
        },
      }

      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const flow = effect!.onHarvestFieldPhase!(state, player)

      // Should have harvested 1 vegetable
      expect(player.resources.vegetable).toBe(1)

      // Remaining should be decremented
      const cardCrop = player.cardStates[CARD_ID]?.extraData?.cardCrop as any
      expect(cardCrop.remaining).toBe(1)

      // Flow should be optional seq with pay+gain
      expect(flow).toBeDefined()
      expect(flow!.type).toBe('seq')
      expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
      const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
      expect(children).toHaveLength(2)
      // First child: pay 1 vegetable
      expect(children[0].type).toBe('leaf')
      expect(children[0].actionId).toBe('pay')
      expect(children[0].params).toEqual({ vegetable: 1 })
      // Second child: gain 4 food
      expect(children[1].type).toBe('leaf')
      expect(children[1].actionId).toBe('gain')
      expect(children[1].params).toEqual({ food: 4 })
    })

    it('full harvest integration: harvests veg and player can convert to food', () => {
      const session = setup({ round: 4, vegetable: 0 })

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: {
          cardCrop: { crop: 'vegetable', remaining: 2 },
        },
      }
      for (const p of state.players) {
        p.resources.food = 10
      }
      session.loadState(state)

      const resp = session.performRoundEnd()

      // After harvest, vegetable should have been reaped from card field
      // The optional conversion may or may not have been taken (engine skips optional)
      const playerAfter = resp.state.players[0]!
      // vegetable was harvested (1 added) and remaining decremented
      // If optional was skipped, player has 1 veg
      // If optional was taken, player has 0 veg + 4 extra food
      // The engine auto-skips optional flows, so player should have 1 veg
      expect(playerAfter.resources.vegetable).toBe(1)
      const cardCrop = playerAfter.cardStates[CARD_ID]?.extraData?.cardCrop as any
      expect(cardCrop.remaining).toBe(1)
    })
  })

  describe('not sowable when crop exists', () => {
    it('does not show card field as sowable when crop already exists', () => {
      const session = setup({ vegetable: 2 })

      // Manually set crop data
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: {
          cardCrop: { crop: 'vegetable', remaining: 2 },
        },
      }
      session.loadState(state)

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      // Should fail - no empty fields and card already has crop
      expect(resp.ok).toBe(false)
    })
  })

  describe('crop cleared when remaining=0', () => {
    it('clears card crop when remaining reaches 0 after harvest', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.players = state.players.slice(0, 2)
      state.round = 4

      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.vegetable = 0
      player.cardStates[CARD_ID] = {
        extraData: {
          cardCrop: { crop: 'vegetable', remaining: 1 }, // Last remaining
        },
      }

      session.loadState(state)

      const effect = getCardEffect(CARD_ID)
      effect!.onHarvestFieldPhase!(state, player)

      // Vegetable should have been harvested
      expect(player.resources.vegetable).toBe(1)

      // Crop should be cleared (null)
      const cardCrop = player.cardStates[CARD_ID]?.extraData?.cardCrop
      expect(cardCrop).toBeNull()
    })

    it('crop cleared - full integration with performRoundEnd', () => {
      const session = setup({ round: 4, vegetable: 0 })

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: {
          cardCrop: { crop: 'vegetable', remaining: 1 },
        },
      }
      for (const p of state.players) {
        p.resources.food = 10
      }
      session.loadState(state)

      const resp = session.performRoundEnd()

      const playerAfter = resp.state.players[0]!
      expect(playerAfter.resources.vegetable).toBe(1)
      const cardCrop = playerAfter.cardStates[CARD_ID]?.extraData?.cardCrop
      expect(cardCrop).toBeNull()
    })
  })

  describe('isDoable listener', () => {
    it('makes sow doable when card field is empty and player has vegetable', () => {
      const session = setup({
        vegetable: 1,
        fields: [], // no normal fields
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')
    })

    it('sow NOT doable without the card', () => {
      const session = setup({
        withCard: false,
        vegetable: 1,
        fields: [], // no normal fields
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(false)
    })
  })
})
