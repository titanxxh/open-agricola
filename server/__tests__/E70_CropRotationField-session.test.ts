import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeExtraSowableFields } from '../../shared/cards/card-effects'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { buildSowFarmInteraction } from '../../shared/domain/farmyard-interaction'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/E/E069_MelonPatch'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as auditE070 from './_helpers/audit/ae-negative-E070'

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

      const extraFields = session.withCtx(() => computeExtraSowableFields(player))
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

      const extraFields = session.withCtx(() => computeExtraSowableFields(player))
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

      const interaction = session.withCtx(() => buildSowFarmInteraction(player, {
        allowedFields: 'fromSelectedFields',
        sourceCard: CARD_ID,
      }))

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
      ).toEqual([null])
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
      expect(stacks ?? []).toEqual([null])
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
      ).toEqual([null])
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

      const resp = session.performRoundEnd()
      expect(resp.state.players[0]!.resources.grain).toBe(0)
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

      expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
      expect(session.takeAction(0, 'grain-utilization').ok).toBe(false)
    })
  })
})

describe('ae-negative-E070', () => {
  const { CARD, sessions, setup, accept, crops } = auditE070
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('E070 negative audit: last crop, opposite crop, and the same card field', () => {
    it('N1 rejects fabricated sow payloads and a duplicate acceptance; the sole legal target auto-sows', () => {
      const session = setup()
      const waiting = session.performRoundEnd()
      assert.equal(waiting.ok, true, waiting.error)
      assert.equal(waiting.state.players[0]!.resources.grain, 1)
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { crops: [{ row: -1, col: 5070, crop: 'grain' }] }))
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'vegetable' }] }))
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { crops: [{ row: -1, col: 5069, crop: 'vegetable' }] }))
      const { result, value } = accept(session, session.getState())
      assert.deepEqual(crops(result), [{ crop: 'vegetable', remaining: 2 }])
      assert.equal(result.state.players[0]!.resources.vegetable, 0)
      assert.deepEqual(result.state.players[0]!.fields[0]!.stacks, [])
      assertRejectedUnchanged(session, () => session.resolveChoice(0, value))
      assert.equal(result.scores?.length, 2)
    })
    it.each([false, true])('N2 non-last card crop does not rotate, even if another field empties (otherLast=$0)', otherLast => {
      const session = setup({ count: 2, otherLast })
      const r = session.performRoundEnd()
      assert.equal(r.ok, true, r.error)
      assert.deepEqual(crops(r), [{ crop: 'grain', remaining: 1 }])
      assert.equal(r.state.players[0]!.resources.vegetable, 1)
      assert.equal(r.state.players[0]!.resources.grain, otherLast ? 2 : 1)
      assert.equal(r.interaction.stateId === 'wait' && r.interaction.sourceCard === CARD, false)
    })
    it('N3 may decline without paying a seed or sowing elsewhere', () => {
      const session = setup()
      session.performRoundEnd()
      const r = session.resolveChoice(0, '__skip__')
      assert.equal(r.ok, true, r.error)
      assert.deepEqual(crops(r), [])
      assert.equal(r.state.players[0]!.resources.vegetable, 1)
      assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [])
    })
    it('N4 no opposite seed follows the accepted prompt omission without gaining a crop', () => {
      const session = setup({ vegetable: 0 })
      const r = session.performRoundEnd()
      assert.equal(r.ok, true, r.error)
      assert.deepEqual(crops(r), [])
      assert.equal(r.state.players[0]!.resources.grain, 1)
      assert.equal(r.state.players[0]!.resources.vegetable, 0)
    })
    it('N5 Thunderbolt removal outside Harvest still rotates only the card that lost its last grain', () => {
      const session = setup({ thunder: true })
      let r = session.takeAction(0, 'meeting-place')
      for (let step = 0; step < 6 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'selection'; step++) {
        assert.equal(r.interaction.request.kind, 'choice')
        assert.ok(r.interaction.request.kind === 'choice')
        const options = r.interaction.request.options
        const option = options?.find(o => o.value === 'E004_Thunderbolt')
          ?? options?.find(o => o.value.startsWith('action-improvement-'))
          ?? options?.find(o => o.value.startsWith('flow-'))
        assert.ok(option)
        r = session.resolveChoice(0, option.value)
        assert.equal(r.ok, true, r.error)
      }
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection')
      r = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 5070 }] })
      assert.equal(r.ok, true, r.error)
      assert.equal(r.state.players[0]!.resources.wood, 2)
      assert.equal(r.state.roundPhase, 'work')
      r = accept(session, r).result
      assert.deepEqual(crops(r), [{ crop: 'vegetable', remaining: 2 }])
      assert.equal(r.state.players[0]!.resources.vegetable, 0)
      assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [])
    })
  })
})
