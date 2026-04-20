/**
 * D25_WitchesDanceFloor — comprehensive session-level integration tests.
 *
 * Covers:
 *  1. Card identity flags
 *  2. Field prerequisite counting (D25 as providesField)
 *  3. player.fields.length unchanged by D25
 *  4. Occupation prerequisite counting (D25 as providesOccupation)
 *  5. Anytime exchange entries (isCookery flag + exchange list)
 *  6. Bake-rate registry includes D25 at rate 2
 *  7. Virtual field sow — grain
 *  8. Virtual field harvest — grain
 *  9. Virtual field harvest — vegetable (2 rounds)
 * 10. CookingHearth accepts D25 as return-Fireplace
 * 11. mustBePlayedViaMinorAction guard (smoke)
 * 12. Scoring — field count uses player.fields.length (unchanged)
 * 13. Scoring — D25 VP contribution not double-counted
 */

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, computeExtraSowableFields } from '../../shared/cards/card-effects'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getPlayerBakeRates } from '../../shared/cards/helpers/exchange-registry'
import { computeScores } from '../../shared/logic/scoring'

import '../../shared/cards/D/D25_WitchesDanceFloor'
import { D25_WitchesDanceFloor } from '../../shared/cards/D/D25_WitchesDanceFloor'

const CARD_ID = 'D25_WitchesDanceFloor'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  return session
}

describe('D25_WitchesDanceFloor session', () => {
  // ─── Test 1: Card identity flags ───────────────────────────────────────────
  describe('card identity flags', () => {
    it('all 6 identity flags are true on the card definition', () => {
      expect(D25_WitchesDanceFloor.providesField).toBe(true)
      expect(D25_WitchesDanceFloor.providesOccupation).toBe(true)
      expect(D25_WitchesDanceFloor.fireplaceIdentity).toBe(true)
      expect(D25_WitchesDanceFloor.mustBePlayedViaMinorAction).toBe(true)
      expect(D25_WitchesDanceFloor.isCookery).toBe(true)
      expect(D25_WitchesDanceFloor.isBaking).toBe(true)
    })
  })

  // ─── Test 2: Field prerequisite counting ───────────────────────────────────
  describe('field prerequisite counting', () => {
    it('1 real field + D25 in minorPlayed satisfies "2 Fields" prerequisite', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      player.minorPlayed.push(CARD_ID)

      expect(
        meetsCardPrerequisites(player, { prerequisite: '2 Fields' }, state.round, state),
      ).toBe(true)
    })

    it('0 real fields + D25 in minorPlayed does NOT satisfy "2 Fields"', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = []
      player.minorPlayed.push(CARD_ID)

      expect(
        meetsCardPrerequisites(player, { prerequisite: '2 Fields' }, state.round, state),
      ).toBe(false)
    })
  })

  // ─── Test 3: player.fields.length unchanged ─────────────────────────────────
  describe('player.fields.length unchanged by D25', () => {
    it('pushing D25 into minorPlayed does not change fields array length', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      const lengthBefore = player.fields.length
      player.minorPlayed.push(CARD_ID)
      expect(player.fields.length).toBe(lengthBefore)
    })
  })

  // ─── Test 4: Occupation prerequisite counting ──────────────────────────────
  describe('occupation prerequisite counting', () => {
    it('2 occupations + D25 in extraOccupationsFromCards satisfies "3 Occupations"', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.occupationPlayed = ['X_OccA', 'X_OccB']
      player.extraOccupationsFromCards = [CARD_ID]

      expect(
        meetsCardPrerequisites(player, { prerequisite: '3 Occupations' }, state.round, state),
      ).toBe(true)
    })

    it('2 occupations without D25 does NOT satisfy "3 Occupations"', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.occupationPlayed = ['X_OccA', 'X_OccB']
      player.extraOccupationsFromCards = []

      expect(
        meetsCardPrerequisites(player, { prerequisite: '3 Occupations' }, state.round, state),
      ).toBe(false)
    })
  })

  // ─── Test 5: Anytime exchanges visible ─────────────────────────────────────
  describe('anytime exchanges (isCookery + exchange list)', () => {
    it('card definition has isCookery=true and at least one anytime exchange with food output', () => {
      expect(D25_WitchesDanceFloor.isCookery).toBe(true)
      const anytimeExchanges = (D25_WitchesDanceFloor.exchanges ?? []).filter(
        (ex) => ex.trigger === 'anytime',
      )
      expect(anytimeExchanges.length).toBeGreaterThan(0)
      const hasFoodOutput = anytimeExchanges.some(
        (ex) => (ex.to as Record<string, number>).food > 0,
      )
      expect(hasFoodOutput).toBe(true)
    })
  })

  // ─── Test 6: Bake-rate registry includes D25 ──────────────────────────────
  describe('bake-rate registry', () => {
    it('getPlayerBakeRates includes D25 with rate 2 when D25 is in minorPlayed', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)

      const rates = getPlayerBakeRates(player)
      const d25Rate = rates.find((r) => r.cardId === CARD_ID)
      expect(d25Rate).toBeDefined()
      expect(d25Rate?.rate).toBe(2)
    })

    it('getPlayerBakeRates does NOT include D25 when not in minorPlayed', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!

      const rates = getPlayerBakeRates(player)
      const d25Rate = rates.find((r) => r.cardId === CARD_ID)
      expect(d25Rate).toBeUndefined()
    })
  })

  // ─── Test 7: Virtual field sow — grain ─────────────────────────────────────
  describe('virtual field sow', () => {
    it('D25 virtual tile appears in computeExtraSowableFields when card is in minorPlayed', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [] // no real fields
      player.minorPlayed.push(CARD_ID)

      const extras = computeExtraSowableFields(player)
      const d25Field = extras.find((f) => f.sourceCard === CARD_ID)
      expect(d25Field).toBeDefined()
      expect(d25Field?.tile).toEqual({ row: -1, col: 25 })
      expect(d25Field?.allowedCrops).toContain('grain')
      expect(d25Field?.allowedCrops).toContain('vegetable')
    })

    it('D25 virtual tile NOT present when card is not in minorPlayed', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!

      const extras = computeExtraSowableFields(player)
      const d25Field = extras.find((f) => f.sourceCard === CARD_ID)
      expect(d25Field).toBeUndefined()
    })

    it('D25 virtual tile NOT present when crop already exists on the virtual field', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      // Pre-seed a crop
      if (!player.cardStates) player.cardStates = {}
      if (!player.cardStates[CARD_ID]) player.cardStates[CARD_ID] = {}
      player.cardStates[CARD_ID].extraData = { cardCrop: { crop: 'grain', remaining: 3 } }

      const extras = computeExtraSowableFields(player)
      const d25Field = extras.find((f) => f.sourceCard === CARD_ID)
      expect(d25Field).toBeUndefined()
    })

    it('onSowExtraField: grain sow deducts resource and stores cardCrop', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.grain = 1

      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const handled = effect!.onSowExtraField!(player, { row: -1, col: 25 }, 'grain')
      expect(handled).toBe(true)

      expect(player.resources.grain).toBe(0)
      const cardCrop = player.cardStates?.[CARD_ID]?.extraData?.cardCrop as {
        crop: string
        remaining: number
      } | null
      expect(cardCrop).not.toBeNull()
      expect(cardCrop?.crop).toBe('grain')
      expect(cardCrop?.remaining).toBe(3)
    })

    it('onSowExtraField: vegetable sow deducts resource and stores cardCrop with remaining=2', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.vegetable = 1

      const effect = getCardEffect(CARD_ID)!
      const handled = effect.onSowExtraField!(player, { row: -1, col: 25 }, 'vegetable')
      expect(handled).toBe(true)

      expect(player.resources.vegetable).toBe(0)
      const cardCrop = player.cardStates?.[CARD_ID]?.extraData?.cardCrop as {
        crop: string
        remaining: number
      } | null
      expect(cardCrop?.crop).toBe('vegetable')
      expect(cardCrop?.remaining).toBe(2)
    })

    it('onSowExtraField: returns false for wrong tile', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.grain = 1

      const effect = getCardEffect(CARD_ID)!
      const handled = effect.onSowExtraField!(player, { row: 0, col: 0 }, 'grain')
      expect(handled).toBe(false)
    })
  })

  // ─── Test 8: Virtual field harvest — grain ─────────────────────────────────
  describe('virtual field harvest — grain', () => {
    it('onHarvestFieldPhase harvests 1 grain and decrements remaining', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.grain = 0
      if (!player.cardStates) player.cardStates = {}
      if (!player.cardStates[CARD_ID]) player.cardStates[CARD_ID] = {}
      player.cardStates[CARD_ID].extraData = { cardCrop: { crop: 'grain', remaining: 3 } }

      const effect = getCardEffect(CARD_ID)!
      effect.onHarvestFieldPhase!(state, player)

      expect(player.resources.grain).toBe(1)
      const cardCrop = player.cardStates[CARD_ID]?.extraData?.cardCrop as {
        crop: string
        remaining: number
      } | null
      expect(cardCrop?.remaining).toBe(2)
    })
  })

  // ─── Test 9: Virtual field harvest — vegetable (2 rounds) ──────────────────
  describe('virtual field harvest — vegetable (2 rounds)', () => {
    it('harvests 1 vegetable each round and clears crop after second harvest', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.vegetable = 0
      if (!player.cardStates) player.cardStates = {}
      if (!player.cardStates[CARD_ID]) player.cardStates[CARD_ID] = {}
      player.cardStates[CARD_ID].extraData = { cardCrop: { crop: 'vegetable', remaining: 2 } }

      const effect = getCardEffect(CARD_ID)!

      // First harvest
      effect.onHarvestFieldPhase!(state, player)
      expect(player.resources.vegetable).toBe(1)
      const afterFirst = player.cardStates[CARD_ID]?.extraData?.cardCrop as {
        crop: string
        remaining: number
      } | null
      expect(afterFirst?.remaining).toBe(1)

      // Second harvest
      effect.onHarvestFieldPhase!(state, player)
      expect(player.resources.vegetable).toBe(2)
      const afterSecond = player.cardStates[CARD_ID]?.extraData?.cardCrop
      expect(afterSecond).toBeNull()
    })
  })

  // ─── Test 10: CookingHearth accepts D25 as return-Fireplace ────────────────
  describe('CookingHearth with D25 present — D25 returned on purchase', () => {
    it('D25 is removed from minorPlayed / extraOccupationsFromCards / cardStates when used to buy CookingHearth1', () => {
      const session = setup()
      const state = session.getState().state
      state.currentPlayerIndex = 0

      const player = state.players[0]!
      player.resources.clay = 10
      player.minorPlayed.push(CARD_ID)
      player.playedCards.push(`minor:${CARD_ID}`)
      player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
      player.extraOccupationsFromCards.push(CARD_ID)
      if (!player.cardStates) player.cardStates = {}
      if (!player.cardStates[CARD_ID]) player.cardStates[CARD_ID] = {}
      player.cardStates[CARD_ID].extraData = { cardCrop: { crop: 'grain', remaining: 3 } }

      // Ensure CookingHearth1 is available
      if (!state.availableMajorImprovements.includes('Major_CookingHearth1')) {
        state.availableMajorImprovements.push('Major_CookingHearth1')
      }
      session.loadState(state)

      // Step 1: take the major-improvement action
      let resp = session.takeAction(0, 'major-improvement')
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')

      // Step 2: choose Major_CookingHearth1
      const cookingHearthOption = resp.pending.type === 'choice'
        ? resp.pending.options.find((o) => o.value === 'major:Major_CookingHearth1')
        : undefined
      expect(cookingHearthOption).toBeDefined()
      resp = session.resolveChoice(0, cookingHearthOption!.value)
      expect(resp.ok).toBe(true)

      // Resolve any remaining pending choices (e.g. payment selection, card-return selection)
      let maxSteps = 10
      while (resp.pending.type === 'choice' && maxSteps-- > 0) {
        // Prefer the D25 return option if present, otherwise pick the first option
        const d25Option = resp.pending.options.find((o) => o.value.includes(CARD_ID))
        const skipOption = resp.pending.options.find((o) => o.value === '__skip__')
        const choiceValue = d25Option?.value ?? skipOption?.value ?? resp.pending.options[0]?.value
        if (!choiceValue) break
        resp = session.resolveChoice(0, choiceValue)
      }

      expect(resp.ok).toBe(true)

      const playerAfter = resp.state.players[0]!

      // CookingHearth1 is bought
      expect(playerAfter.improvements).toContain('Major_CookingHearth1')

      // D25 is fully removed from the player's state after being returned
      expect(playerAfter.minorPlayed).not.toContain(CARD_ID)
      expect(playerAfter.extraOccupationsFromCards ?? []).not.toContain(CARD_ID)
      expect(playerAfter.cardStates?.[CARD_ID]).toBeUndefined()

      // D25 must NOT appear in availableMajorImprovements (it's a minor, not a major)
      expect(resp.state.availableMajorImprovements).not.toContain(CARD_ID)
    })
  })

  // ─── Test 10b: isMajorImprovementPlayable with D25 but zero clay ───────────
  describe('CookingHearth affordance — D25 counts as Fireplace even with 0 clay', () => {
    it('isMajorImprovementPlayable(Major_CookingHearth1) is true when D25 is in play and fee resources are absent', async () => {
      const { isMajorImprovementPlayable } = await import(
        '../../shared/actions/effects/improvement'
      )
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.resources.clay = 0
      player.minorPlayed.push(CARD_ID)
      player.playedCards.push(`minor:${CARD_ID}`)
      player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
      player.extraOccupationsFromCards.push(CARD_ID)
      if (!state.availableMajorImprovements.includes('Major_CookingHearth1')) {
        state.availableMajorImprovements.push('Major_CookingHearth1')
      }
      expect(isMajorImprovementPlayable(state, player, 'Major_CookingHearth1')).toBe(true)
    })
  })

  // ─── Test 11: mustBePlayedViaMinorAction guard (smoke) ─────────────────────
  describe('mustBePlayedViaMinorAction guard (smoke)', () => {
    it('D25 has mustBePlayedViaMinorAction=true', () => {
      expect(D25_WitchesDanceFloor.mustBePlayedViaMinorAction).toBe(true)
    })
  })

  // ─── Test 12: Scoring — field count unchanged by D25 ───────────────────────
  describe('scoring — field count unchanged by D25', () => {
    it('D25 does not inflate the "fields" score category beyond player.fields.length', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
      ]
      player.minorPlayed.push(CARD_ID)
      player.playedCards.push(`minor:${CARD_ID}`)
      session.loadState(state)

      const summaries = computeScores(session.getState().state)
      const p0Summary = summaries[0]!
      const fieldsCat = p0Summary.categories.find((c) => c.key === 'fields')
      expect(fieldsCat).toBeDefined()
      // quantity should reflect only physical fields (2), not D25's virtual field
      expect(fieldsCat?.quantity).toBe(2)
    })
  })

  // ─── Test 13: Scoring — no double-count of D25 VP ──────────────────────────
  describe('scoring — no double-count of D25 VP', () => {
    it('D25 appears at most once in the "cards" scoring entries', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.playedCards.push(`minor:${CARD_ID}`)
      session.loadState(state)

      const summaries = computeScores(session.getState().state)
      const p0Summary = summaries[0]!
      const cardsCat = p0Summary.categories.find((c) => c.key === 'cards')
      expect(cardsCat).toBeDefined()

      const d25Entries = (cardsCat?.entries ?? []).filter(
        (e) => 'cardId' in e && e.cardId === CARD_ID,
      )
      // D25 should appear exactly once, with score=0 (vp:0 minor)
      expect(d25Entries.length).toBe(1)
      expect(d25Entries[0]?.score).toBe(0)
    })
  })
})
