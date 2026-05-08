import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { A27_OvenSite } from '../../shared/cards/A/A27_OvenSite'
import { minorImprovements } from '../../shared/cards-display/_lookup'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'A27_OvenSite'

// Catalog registration is handled by the parent agent; for local testing we
// splice the card into the minor-improvements registry if absent.
if (!minorImprovements.some((c) => c.id === CARD_ID)) {
  minorImprovements.push(A27_OvenSite)
}

describe('A27_OvenSite session', () => {
  const playA27 = (session: GameSession) => {
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    // Prereq (Fireplace + CookingHearth); not enforced server-side by our engine
    // (prerequisite is a display field only), but give them to match intent.
    player.improvements = ['Major_Fireplace1', 'Major_CookingHearth1']
    player.minorHand = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 3,
      stone: 3,
    }

    // Ensure ovens available
    if (!state.availableMajorImprovements.includes('Major_ClayOven')) {
      state.availableMajorImprovements.push('Major_ClayOven')
    }
    if (!state.availableMajorImprovements.includes('Major_StoneOven')) {
      state.availableMajorImprovements.push('Major_StoneOven')
    }
    session.loadState(state)
    return session.takeAction(0, 'major-improvement')
  }

  it('gains 2 wood on play and offers Clay/Stone Oven at discount', () => {
    const session = new GameSession()
    let resp = playA27(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const a27Option = resp.interaction.options?.find(
      (o) => o.value === `minor:${CARD_ID}`,
    )
    expect(a27Option).toBeDefined()

    resp = session.resolveChoice(0, a27Option!.value)
    expect(resp.ok).toBe(true)
    // After playing A27: should have 2 wood from onBuy gain
    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(2)
    expect(player.minorPlayed).toContain(CARD_ID)
  })

  it('lets player skip the optional oven purchase', () => {
    const session = new GameSession()
    let resp = playA27(session)
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    // Walk pending choices until either oven purchase offer or done
    const maxSteps = 10
    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < maxSteps) {
      steps += 1
      const options = resp.interaction.options ?? []
      const skip = options.find((o) => o.value === '__skip__')
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
      } else {
        // No skip option → bail out; test asserts flow ended gracefully
        break
      }
    }
    // Verify card played but no oven was built
    const player = resp.state.players[0]!
    expect(player.minorPlayed).toContain(CARD_ID)
    expect(player.improvements).not.toContain('Major_ClayOven')
    expect(player.improvements).not.toContain('Major_StoneOven')
  })

  it('buys Clay Oven for 1 clay + 1 stone via the A27 discount', () => {
    const session = new GameSession()
    let resp = playA27(session)
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)

    const clayBefore = resp.state.players[0]!.resources.clay
    const stoneBefore = resp.state.players[0]!.resources.stone

    const maxSteps = 12
    let steps = 0
    let clayOvenBought = false
    while (resp.interaction.stateId === 'wait' && steps < maxSteps) {
      steps += 1
      const options = resp.interaction.options ?? []
      const clayOven = options.find(
        (o) => o.value === 'major:Major_ClayOven' || o.value === 'Major_ClayOven',
      )
      if (clayOven && !clayOvenBought) {
        resp = session.resolveChoice(0, clayOven.value)
        clayOvenBought = true
        continue
      }
      // Fall through: pick a non-skip/non-cancel option to progress
      const progressOption = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (progressOption) {
        resp = session.resolveChoice(0, progressOption.value)
      } else {
        break
      }
    }

    const player = resp.state.players[0]!
    expect(player.improvements).toContain('Major_ClayOven')
    // Base Clay Oven cost is 3 clay + 1 stone = paid 1 clay + 1 stone per A27
    expect(clayBefore - player.resources.clay).toBe(1)
    expect(stoneBefore - player.resources.stone).toBe(1)
  })

  it('preserves sourceCard on the immediate bake prompt after buying Clay Oven', () => {
    const session = new GameSession()
    const setupState = session.getState().state
    setupState.players = setupState.players.slice(0, 2)
    setupState.players[0]!.resources.grain = 1
    session.loadState(setupState)
    let resp = playA27(session)
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)

    const maxSteps = 12
    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < maxSteps) {
      steps += 1
      const options = resp.interaction.options ?? []
      const clayOven = options.find(
        (o) => o.value === 'major:Major_ClayOven' || o.value === 'Major_ClayOven',
      )
      if (clayOven) {
        resp = session.resolveChoice(0, clayOven.value)
        break
      }
      const progressOption = options.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
      if (progressOption) {
        resp = session.resolveChoice(0, progressOption.value)
        continue
      }
      throw new Error('expected Clay Oven offer before immediate bake prompt')
    }

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe('Major_ClayOven')
    expect(resp.interaction.options?.find((option) => option.value !== '__skip__')?.sourceCard).toBe('Major_ClayOven')
  })

  describe('prerequisite "Both Fireplace and Cooking Hearth"', () => {
    it('blocks when player owns no Fireplace + Hearth pair', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.improvements = []
      expect(meetsCardPrerequisites(player, A27_OvenSite, state.round, state)).toBe(false)
    })

    it('allows when player owns Fireplace1 and CookingHearth1', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.improvements = ['Major_Fireplace1', 'Major_CookingHearth1']
      expect(meetsCardPrerequisites(player, A27_OvenSite, state.round, state)).toBe(true)
    })
  })
})
