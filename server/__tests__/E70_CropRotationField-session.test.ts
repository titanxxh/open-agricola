import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'
import { computeExtraSowableFields } from '../../shared/cards/card-effects'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { buildSowFarmInteraction } from '../../shared/logic/farm/farm-interaction'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/E/E70_CropRotationField'
import '../../shared/cards/E/E69_MelonPatch'
import type { PendingAction } from '../../shared/game/types'

const CARD_ID = 'E70_CropRotationField'
const OTHER_EXTRA_CARD_ID = 'E69_MelonPatch'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const setup = (options?: {
  grain?: number
  vegetable?: number
  fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  round?: number
  cardCrop?: { crop: 'grain' | 'vegetable'; remaining: number } | null
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
  player.minorPlayed.push(CARD_ID)

  if (options?.cardCrop !== undefined) {
    if (options.cardCrop !== null) {
      writeCardExtraData(player, CARD_ID, 'cardCrop', options.cardCrop)
    }
  }

  // Set enough food for all players in harvest rounds
  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    }
    // Re-apply player 0 resources after the loop
    state.players[0]!.resources.grain = options?.grain ?? 0
    state.players[0]!.resources.vegetable = options?.vegetable ?? 0
  }

  session.loadState(state)
  return session
}

const addMinorCard = (
  session: GameSession,
  cardId: string,
) => {
  const state = session.getState().state
  const player = state.players[0]!
  if (!player.minorPlayed.includes(cardId)) {
    player.minorPlayed.push(cardId)
  }
  session.loadState(state)
}

describe('E70_CropRotationField session', () => {
  describe('extra sowable field', () => {
    it('card registers as extra sowable field when empty (grain + veg allowed)', () => {
      const session = setup({ grain: 1, vegetable: 1 })
      const state = session.getState().state
      const player = state.players[0]!

      const extraFields = computeExtraSowableFields(player)
      const cardField = extraFields.find(
        (f) => f.tile.row === -1 && f.tile.col === 70,
      )
      expect(cardField).toBeDefined()
      expect(cardField?.allowedCrops).toContain('grain')
      expect(cardField?.allowedCrops).toContain('vegetable')
      expect(cardField?.sourceCard).toBe(CARD_ID)
    })

    it('not sowable when card already has a crop', () => {
      const session = setup({
        grain: 1,
        cardCrop: { crop: 'grain', remaining: 3 },
      })
      const state = session.getState().state
      const player = state.players[0]!

      const extraFields = computeExtraSowableFields(player)
      const cardField = extraFields.find(
        (f) => f.tile.row === -1 && f.tile.col === 70,
      )
      expect(cardField).toBeUndefined()
    })
  })

  describe('sowing on card field', () => {
    it('sowing grain works (remaining=3)', () => {
      const session = setup({ grain: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')
      expect((resp.pending as Extract<PendingAction, { type: 'choice' }>).promptKey).toBe('ui.interactionSowSelect')

      // Sow grain on the virtual tile
      resp = session.resolveChoice(0, 'confirm', {
        crops: [{ row: -1, col: 70, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.grain).toBe(1)

      const cardCrop = readCardExtraData<{ crop: string; remaining: number }>(
        resp.state.players[0]!,
        CARD_ID,
        'cardCrop',
      )
      expect(cardCrop).toBeDefined()
      expect(cardCrop!.crop).toBe('grain')
      expect(cardCrop!.remaining).toBe(3)
    })

    it('sowing vegetable works (remaining=2)', () => {
      const session = setup({ vegetable: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      resp = session.resolveChoice(0, 'confirm', {
        crops: [{ row: -1, col: 70, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.vegetable).toBe(1)

      const cardCrop = readCardExtraData<{ crop: string; remaining: number }>(
        resp.state.players[0]!,
        CARD_ID,
        'cardCrop',
      )
      expect(cardCrop).toBeDefined()
      expect(cardCrop!.crop).toBe('vegetable')
      expect(cardCrop!.remaining).toBe(2)
    })

    it('fromSelectedFields filters out other extra sow fields in interaction', () => {
      const session = setup({ vegetable: 1 })
      addMinorCard(session, OTHER_EXTRA_CARD_ID)

      const player = session.getState().state.players[0]!
      writeCardExtraData(player, CARD_ID, 'selectedPositions', ['-1-70'])

      const interaction = buildSowFarmInteraction(player, {
        allowedFields: 'fromSelectedFields',
        sourceCard: CARD_ID,
      })

      expect(interaction.farmType).toBe('sow')
      if (interaction.farmType !== 'sow') {
        throw new Error('expected sow interaction')
      }
      expect(interaction.selectableFields).toEqual([
        { tile: { row: -1, col: 70 }, allowedCrops: ['vegetable'], sourceCard: CARD_ID },
      ])
    })

    // SKIP[S1]: 'choice'→'request' shape mismatch, see docs/skip-tracker.md
    it.skip('fromSelectedFields rejects committing a different extra sow field', () => {
      const session = setup({ vegetable: 1 })
      addMinorCard(session, OTHER_EXTRA_CARD_ID)

      const player = session.getState().state.players[0]!
      writeCardExtraData(player, CARD_ID, 'selectedPositions', ['-1-70'])

      ;(session as unknown as { pending: PendingAction }).pending = {
        type: 'choice',
        playerIndex: 0,
        spaceId: 'grain-utilization',
        options: [],
        promptKey: 'ui.interactionSowSelect',
        actionContext: {
          allowedFields: 'fromSelectedFields',
          sourceCard: CARD_ID,
        },
      }
      ;(session as unknown as { activeSpaceId: string | null }).activeSpaceId = 'grain-utilization'

      const resp = session.resolveChoice(0, 'confirm', {
        crops: [{ row: -1, col: 69, crop: 'vegetable' }],
      })

      expect(resp.ok).toBe(false)
      expect(session.getState().state.players[0]!.resources.vegetable).toBe(1)
      expect(
        readCardExtraData<{ crop: string; remaining: number }>(
          session.getState().state.players[0]!,
          OTHER_EXTRA_CARD_ID,
          'cardCrop',
        ),
      ).toBeUndefined()
    })
  })

  describe('harvest', () => {
    it('harvest grain decrements remaining', () => {
      const session = setup({
        round: 4,
        grain: 0,
        cardCrop: { crop: 'grain', remaining: 3 },
      })

      const resp = session.performRoundEnd()

      const playerAfter = resp.state.players[0]!
      expect(playerAfter.resources.grain).toBe(1) // harvested 1 grain
      const cardCrop = readCardExtraData<{ crop: string; remaining: number }>(
        playerAfter,
        CARD_ID,
        'cardCrop',
      )
      expect(cardCrop).toBeDefined()
      expect(cardCrop!.remaining).toBe(2)
    })

    it('crop cleared when remaining reaches 0', () => {
      const session = setup({
        round: 4,
        grain: 0,
        vegetable: 0,
        cardCrop: { crop: 'grain', remaining: 1 },
      })

      const resp = session.performRoundEnd()

      const playerAfter = resp.state.players[0]!
      expect(playerAfter.resources.grain).toBe(1) // harvested last grain
      const cardCrop = readCardExtraData<{ crop: string; remaining: number } | null>(
        playerAfter,
        CARD_ID,
        'cardCrop',
      )
      expect(cardCrop).toBeNull() // cleared
    })

    it('last grain harvested with vegetable available -> optional sow flow returned', () => {
      // Test the hook directly using runCardEffectHook
      const session = setup({
        round: 4,
        grain: 0,
        vegetable: 1,
        cardCrop: { crop: 'grain', remaining: 1 },
      })

      const state = session.getState().state
      const player = state.players[0]!

      const flow = runCardEffectHook(state, player, CARD_ID, 'onHarvestFieldPhase')
      expect(flow).not.toBeNull()
      expect(flow!.type).toBe('leaf')
      if (flow!.type === 'leaf') {
        expect(flow!.actionId).toBe('sow')
        expect(flow!.optional).toBe(true)
        expect(flow!.sourceCard).toBe(CARD_ID)
        expect(flow!.actionContext).toEqual({
          allowedFields: 'fromSelectedFields',
          sourceCard: CARD_ID,
        })
      }

      // Verify state changes
      expect(player.resources.grain).toBe(1) // gained 1 grain
      const cardCrop = readCardExtraData<{ crop: string; remaining: number } | null>(
        player,
        CARD_ID,
        'cardCrop',
      )
      expect(cardCrop).toBeNull() // cleared

      // Verify selectedPositions was set
      const selectedPositions = readCardExtraData<string[]>(player, CARD_ID, 'selectedPositions')
      expect(selectedPositions).toEqual(['-1-70'])
    })

    it('last vegetable harvested with grain available -> optional sow flow returned', () => {
      const session = setup({
        round: 4,
        grain: 1,
        vegetable: 0,
        cardCrop: { crop: 'vegetable', remaining: 1 },
      })

      const state = session.getState().state
      const player = state.players[0]!

      const flow = runCardEffectHook(state, player, CARD_ID, 'onHarvestFieldPhase')
      expect(flow).not.toBeNull()
      expect(flow!.type).toBe('leaf')
      if (flow!.type === 'leaf') {
        expect(flow!.actionId).toBe('sow')
        expect(flow!.optional).toBe(true)
      }

      expect(player.resources.vegetable).toBe(1) // gained 1 vegetable
    })

    it('last grain harvested without vegetable available -> no flow returned', () => {
      const session = setup({
        round: 4,
        grain: 0,
        vegetable: 0,
        cardCrop: { crop: 'grain', remaining: 1 },
      })

      const state = session.getState().state
      const player = state.players[0]!

      const flow = runCardEffectHook(state, player, CARD_ID, 'onHarvestFieldPhase')
      expect(flow).toBeNull() // no opposite seeds

      expect(player.resources.grain).toBe(1) // still harvested
      const cardCrop = readCardExtraData<{ crop: string; remaining: number } | null>(
        player,
        CARD_ID,
        'cardCrop',
      )
      expect(cardCrop).toBeNull() // still cleared
    })

    it('no harvest when card has no crop', () => {
      const session = setup({
        round: 4,
        grain: 0,
      })

      const state = session.getState().state
      const player = state.players[0]!

      const flow = runCardEffectHook(state, player, CARD_ID, 'onHarvestFieldPhase')
      expect(flow).toBeNull()
      expect(player.resources.grain).toBe(0) // no change
    })
  })

  describe('isDoable listener', () => {
    it('sow is doable when card field is empty and player has seeds (no regular fields)', () => {
      const session = setup({ grain: 1 })

      // Take grain-utilization action, which offers sow
      const resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      // If sow is available, resolving 'sow' should succeed
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')
      expect((resp.pending as Extract<PendingAction, { type: 'choice' }>).promptKey).toBe('ui.interactionSowSelect')
    })

    // SKIP[S1]: 'choice'→'request' shape mismatch, see docs/skip-tracker.md
    it.skip('sow is not doable when card already has crop and no regular fields', () => {
      const session = setup({
        grain: 1,
        cardCrop: { crop: 'grain', remaining: 3 },
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      // OR(sow, bake-bread) is structurally doable, but selecting sow when the
      // card already has a crop and the player has no regular fields surfaces
      // as fail because canSow returns false.
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(false)
    })
  })
})
