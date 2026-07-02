import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'
import { computeExtraSowableFields } from '../../shared/cards/card-effects'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { buildSowFarmInteraction } from '../../shared/domain/farmyard'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/E/E069_MelonPatch'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'E070_CropRotationField'
const OTHER_EXTRA_CARD_ID = 'E069_MelonPatch'
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
      writeCardExtraData(player, CARD_ID, 'cardFieldStacks', [options.cardCrop])
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

describe('E070_CropRotationField session', () => {
  describe('extra sowable field', () => {
    it('card registers as extra sowable field when empty (grain + veg allowed)', () => {
      const session = setup({ grain: 1, vegetable: 1 })
      const state = session.getState().state
      const player = state.players[0]!

      const extraFields = computeExtraSowableFields(player)
      const cardField = extraFields.find(
        (f) => f.tile.row === -1 && f.tile.col === 5070,
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
        (f) => f.tile.row === -1 && f.tile.col === 5070,
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
      expect(resp.interaction.stateId).toBe('wait')
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

      // Sow grain on the virtual tile
      resp = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: 5070, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.grain).toBe(1)

      const stacks = readCardExtraData<{ crop: string; remaining: number }[]>(
        resp.state.players[0]!,
        CARD_ID,
        'cardFieldStacks',
      )!
      expect(stacks).toBeDefined()
      expect(stacks[0].crop).toBe('grain')
      expect(stacks[0].remaining).toBe(3)
    })

    it('sowing vegetable works (remaining=2)', () => {
      const session = setup({ vegetable: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: 5070, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.vegetable).toBe(1)

      const stacks = readCardExtraData<{ crop: string; remaining: number }[]>(
        resp.state.players[0]!,
        CARD_ID,
        'cardFieldStacks',
      )!
      expect(stacks).toBeDefined()
      expect(stacks[0].crop).toBe('vegetable')
      expect(stacks[0].remaining).toBe(2)
    })

    it('fromSelectedFields filters out other extra sow fields in interaction', () => {
      const session = setup({ vegetable: 1 })
      addMinorCard(session, OTHER_EXTRA_CARD_ID)

      const player = session.getState().state.players[0]!
      writeCardExtraData(player, CARD_ID, 'selectedPositions', ['-1-5070'])

      const interaction = buildSowFarmInteraction(player, {
        allowedFields: 'fromSelectedFields',
        sourceCard: CARD_ID,
      })

      expect(interaction.farmType).toBe('sow')
      if (interaction.farmType !== 'sow') {
        throw new Error('expected sow interaction')
      }
      expect(interaction.selectableFields).toEqual([
        { tile: { row: -1, col: 5070 }, allowedCrops: ['vegetable'], sourceCard: CARD_ID, groupKey: undefined },
      ])
    })

    it('fromSelectedFields rejects committing a different extra sow field', () => {
      // Drive the harvest-emitted optional sow leaf rather than mutating
      // private session fields: round-4 harvest with cardCrop={grain,1} +
      // vegetable=1 triggers E70's onHarvestFieldPhase to reap the last
      // grain (cardCrop -> null, selectedPositions = ['-1-5070']) and emit
      // an optional sow leaf with actionContext
      // { allowedFields: 'fromSelectedFields', sourceCard: E70 }. The
      // commit-time selectableFields filter then narrows allowed extras
      // to just -1/70, so submitting the cross-card -1/69 (E69 MelonPatch)
      // must be rejected.
      const session = setup({
        round: 4,
        grain: 0,
        vegetable: 1,
        cardCrop: { crop: 'grain', remaining: 1 },
      })
      addMinorCard(session, OTHER_EXTRA_CARD_ID)

      let resp = session.performRoundEnd()
      resp = resolveTriggerIfPresent(session, resp, CARD_ID)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
        .toBe('ui.interactionOptionalAction')

      const sowOption = resp.interaction.stateId === 'wait'
        ? resp.interaction.options?.find((option) =>
            option.value !== '__skip__' && option.sourceCard === CARD_ID)
        : undefined
      expect(sowOption).toBeDefined()
      resp = session.resolveChoice(0, sowOption!.value)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
        .toBe('ui.interactionSowSelect')

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: 5069, crop: 'vegetable' }],
      })

      expect(resp.ok).toBe(false)
      expect(session.getState().state.players[0]!.resources.vegetable).toBe(1)
      expect(
        readCardExtraData<{ crop: string; remaining: number }[]>(
          session.getState().state.players[0]!,
          OTHER_EXTRA_CARD_ID,
          'cardFieldStacks',
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
      const stacks = readCardExtraData<{ crop: string; remaining: number }[]>(
        playerAfter,
        CARD_ID,
        'cardFieldStacks',
      )!
      expect(stacks).toBeDefined()
      expect(stacks[0].remaining).toBe(2)
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
      const stacks = readCardExtraData<{ crop: string; remaining: number }[]>(
        playerAfter,
        CARD_ID,
        'cardFieldStacks',
      )
      expect(stacks ?? []).toEqual([]) // cleared
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
      expect(flow!.type).toBe('parallel')
      const sow = (flow as Extract<ActionFlow, { type: 'parallel' }>).children[0] as Extract<ActionFlow, { type: 'leaf' }>
      expect(sow.actionId).toBe('sow')
      expect(sow.optional).toBe(true)
      expect(sow.sourceCard).toBe(CARD_ID)
      expect(sow.actionContext).toEqual({
        allowedFields: 'fromSelectedFields',
        sourceCard: CARD_ID,
      })

      // Verify state changes
      expect(player.resources.grain).toBe(1) // gained 1 grain
      const stacks = readCardExtraData<{ crop: string; remaining: number }[]>(
        player,
        CARD_ID,
        'cardFieldStacks',
      )
      expect(stacks ?? []).toEqual([]) // cleared

      // Verify selectedPositions was set
      const selectedPositions = readCardExtraData<string[]>(player, CARD_ID, 'selectedPositions')
      expect(selectedPositions).toEqual(['-1-5070'])
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
      expect(flow!.type).toBe('parallel')
      const sow = (flow as Extract<ActionFlow, { type: 'parallel' }>).children[0] as Extract<ActionFlow, { type: 'leaf' }>
      expect(sow.actionId).toBe('sow')
      expect(sow.optional).toBe(true)

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
      const stacks = readCardExtraData<{ crop: string; remaining: number }[]>(
        player,
        CARD_ID,
        'cardFieldStacks',
      )
      expect(stacks ?? []).toEqual([]) // still cleared
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
      expect(resp.interaction.stateId).toBe('wait')
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')
    })

    it('sow is not doable when card already has crop and no regular fields', () => {
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
