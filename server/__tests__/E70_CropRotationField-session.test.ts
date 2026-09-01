import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'
import { computeExtraSowableFields } from '../../shared/cards/card-effects'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { buildSowFarmInteraction } from '../../shared/domain/farmyard-interaction'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/E/E069_MelonPatch'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'E070_CropRotationField'
const OTHER_EXTRA_CARD_ID = 'E069_MelonPatch'
const harvestRounds = [4, 7, 9, 11, 13, 14]
const FIXED_HANDS = [
  { occupation: '__test_occupation_p1__', minor: '__test_minor_p1__' },
  { occupation: '__test_occupation_p2__', minor: '__test_minor_p2__' },
  { occupation: '__test_occupation_p3__', minor: '__test_minor_p3__' },
  { occupation: '__test_occupation_p4__', minor: '__test_minor_p4__' },
]

const setup = (options?: {
  grain?: number
  vegetable?: number
  fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  round?: number
  cardCrop?: { crop: 'grain' | 'vegetable'; remaining: number } | null
}) => {
  const session = new GameSession(70, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.roundPhase = 'work'
  // Ensure grain-utilization is available
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  state.players.forEach((entry, index) => {
    entry.occupationHand = [FIXED_HANDS[index]!.occupation]
    entry.minorHand = [FIXED_HANDS[index]!.minor]
  })

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

const setupPlay = (occupationCount: number) => {
  const session = new GameSession(70, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
    player.minorHand = [FIXED_HANDS[index]!.minor]
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationPlayed = Array.from({ length: occupationCount }, (_, index) => `__occupation_${index}__`)
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options?.find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (response.state.players[0]!.minorPlayed.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
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
  it('requires one occupation to play through the public minor-improvement flow', () => {
    const blocked = openMinorPrompt(setupPlay(0))
    expect(cardOption(blocked)).toBeUndefined()
    expect(blocked.state.players[0]!.minorHand).toContain(CARD_ID)

    const allowed = playMinor(setupPlay(1))
    expect(allowed.ok, allowed.error).toBe(true)
    expect(allowed.state.players[0]!.minorHand).not.toContain(CARD_ID)
    expect(allowed.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

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

    it('automatically sows the opposite crop on the selected field', () => {
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
        ? resp.interaction.request.options?.find((option) =>
            option.value !== '__skip__' && option.sourceCard === CARD_ID)
        : undefined
      expect(sowOption).toBeDefined()
      resp = session.resolveChoice(0, sowOption!.value)
      expect(resp.ok).toBe(true)
      expect(session.getState().state.players[0]!.resources.vegetable).toBe(0)
      expect(
        readCardExtraData<{ crop: string; remaining: number }[]>(
          session.getState().state.players[0]!,
          CARD_ID,
          'cardFieldStacks',
        ),
      ).toEqual([{ crop: 'vegetable', remaining: 2 }])
      expect(
        readCardExtraData<{ crop: string; remaining: number }[]>(
          session.getState().state.players[0]!,
          OTHER_EXTRA_CARD_ID,
          'cardFieldStacks',
        ),
      ).toBeUndefined()
    })

    it('can decline grain after the last vegetable is harvested', () => {
      const session = setup({
        round: 4,
        grain: 1,
        vegetable: 0,
        cardCrop: { crop: 'vegetable', remaining: 1 },
      })

      let resp = session.performRoundEnd()
      resp = resolveTriggerIfPresent(session, resp, CARD_ID)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const skip = resp.interaction.request.options?.find((option) => option.value === '__skip__')
      expect(skip).toBeDefined()
      resp = session.resolveChoice(resp.interaction.playerIndex, skip!.value)

      expect(resp.state.players[0]!.resources.vegetable).toBe(1)
      expect(resp.state.players[0]!.resources.grain).toBe(1)
      expect(
        readCardExtraData<{ crop: string; remaining: number }[]>(
          resp.state.players[0]!,
          CARD_ID,
          'cardFieldStacks',
        ) ?? [],
      ).toEqual([])
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
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).not.toBe(CARD_ID)
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
        cropType: 'vegetable',
        minSelections: 1,
        maxSelections: 1,
        autoResolveSingleSelection: true,
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

    it('last grain harvested without vegetable completes without an E070 prompt', () => {
      const session = setup({
        round: 4,
        grain: 0,
        vegetable: 0,
        cardCrop: { crop: 'grain', remaining: 1 },
      })

      const resp = session.performRoundEnd()

      expect(resp.state.players[0]!.resources.grain).toBe(1)
      expect(
        readCardExtraData<{ crop: string; remaining: number }[]>(
          resp.state.players[0]!,
          CARD_ID,
          'cardFieldStacks',
        ) ?? [],
      ).toEqual([])
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).not.toBe(CARD_ID)
      expect(resp.interaction.stateId === 'wait'
        ? resp.interaction.request.options?.some((option) => option.sourceCard === CARD_ID) ?? false
        : false).toBe(false)
      expect(resp.state.events.some((event) => event.type === 'farm.sown')).toBe(false)
      expect(resp.state.log.some((entry) => entry.key === 'log.sow')).toBe(false)
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
