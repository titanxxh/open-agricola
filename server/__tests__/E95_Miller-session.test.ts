import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/E/E95_Miller'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

describe('E95_Miller session', () => {
  /**
   * Setup: 2-player game.
   * p0 = Miller owner, has a Fireplace and grain for baking.
   * p1 = opponent, will use grain-seeds.
   */
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 1 // opponent's turn

    const owner = state.players[0]!
    owner.occupationPlayed.push('E95_Miller')
    // Give owner a Fireplace for baking
    owner.improvements.push('Major_Fireplace1')
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (id) => id !== 'Major_Fireplace1',
    )
    owner.resources = { ...owner.resources, grain: 3, food: 0 }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    session.loadState(state)
    return session
  }

  it('triggers bake bread when opponent uses grain-seeds', () => {
    const session = setup()
    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)
    // Should trigger a player switch to the Miller owner
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')) return
    expect(resp.interaction.fromPlayerIndex).toBe(1)
    expect(resp.interaction.toPlayerIndex).toBe(0)
  })

  it('miller can bake bread when opponent uses grain-seeds', () => {
    const session = setup()

    let resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)

    // Optional choice — pick to activate bake bread
    const activateOption = resp.interaction.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(activateOption).toBeDefined()
    resp = session.resolveChoice(0, activateOption!.value)

    // Bake bread flow: first pick which improvement to bake with
    while (resp.interaction.stateId === 'wait') {
      const options = resp.interaction.options ?? []
      const cancelOption = options.find((o: ActionChoiceOption) => o.value === 'cancel')
      const fireplaceOption = options.find(
        (o: ActionChoiceOption) => o.value === 'Major_Fireplace1',
      )
      // Try to pick the fireplace first, or pick the first count option
      const countOption = options.find((o: ActionChoiceOption) =>
        typeof o.value === 'string' && o.value.startsWith('count-'),
      )
      if (fireplaceOption) {
        resp = session.resolveChoice(0, fireplaceOption.value)
      } else if (countOption) {
        resp = session.resolveChoice(0, countOption.value)
      } else if (!cancelOption) {
        // Pick first non-skip option
        const opt = options.find((o: ActionChoiceOption) => o.value !== '__skip__')
        if (opt) {
          resp = session.resolveChoice(0, opt.value)
        } else {
          break
        }
      } else {
        break
      }
    }

    // Verify grain was consumed and food gained
    const owner = resp.state.players[0]!
    // With Fireplace, 1 grain -> 2 food. Owner started with 3 grain, 0 food.
    // At least some grain should have been consumed.
    expect(owner.resources.grain).toBeLessThan(3)
    expect(owner.resources.food).toBeGreaterThan(0)
  })

  it('miller can skip bake bread (optional)', () => {
    const session = setup()

    let resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Skip the optional bake action
    resp = session.resolveChoice(0, '__skip__')

    // Switch-back happens automatically (no choice follows), so we go straight to confirmNextPlayer
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')

    // Verify no grain consumed, no food gained
    const owner = resp.state.players[0]!
    expect(owner.resources.grain).toBe(3)
    expect(owner.resources.food).toBe(0)
  })

  it('no trigger when owner uses grain-seeds (opponent scope only)', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    // Owner using the space should NOT trigger Miller (scope: opponent)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
  })

  it('no trigger for non-matching action spaces', () => {
    const session = setup()
    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    // No player switch should happen for a different space
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
  })

  it('onBuy offers optional improvement purchase', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const owner = state.players[0]!
    setWorkersAtHome(state, owner, 2) // Give enough resources to buy an occupation (food: 1 for second occ) and a Fireplace (clay: 2)
    owner.resources = { ...owner.resources, food: 5, clay: 5 }
    // Put Miller in occupation hand — add a second occupation so auto-select doesn't skip the choice
    owner.occupationHand = ['E95_Miller', 'A85_Homekeeper']

    // Make sure Fireplace is available
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }

    session.loadState(state)

    // Use the lessons action space to play an occupation
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // Choose Miller from occupation choices
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const millerOption = resp.interaction.options?.find(
      (o: ActionChoiceOption) => o.value === 'E95_Miller',
    )
    expect(millerOption).toBeDefined()
    resp = session.resolveChoice(0, millerOption!.value)

    // After playing the occupation, should get an optional improvement choice
    // (the onBuy flow). It may present as a choice with __skip__ option.
    if (resp.interaction.stateId === 'wait') {
      const options = resp.interaction.options ?? []
      const hasSkip = options.some((o: ActionChoiceOption) => o.value === '__skip__')
      if (hasSkip) {
        // Verify the optional nature
        const nonSkipOptions = options.filter((o: ActionChoiceOption) => o.value !== '__skip__')
        // Should have baking improvement options available (Fireplace at least)
        expect(nonSkipOptions.length).toBeGreaterThan(0)
        // Skip the optional improvement
        resp = session.resolveChoice(0, '__skip__')
      }
    }

    // Verify the card was played
    expect(resp.state.players[0]!.occupationPlayed).toContain('E95_Miller')
  })

  it('onBuy allows purchasing a baking improvement', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const owner = state.players[0]!
    setWorkersAtHome(state, owner, 2)
    owner.resources = { ...owner.resources, food: 5, clay: 5 }
    // Add a second occupation so the choice isn't auto-resolved
    owner.occupationHand = ['E95_Miller', 'A85_Homekeeper']

    // Make sure Fireplace is available
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }

    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // Choose Miller
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const millerOption = resp.interaction.options?.find(
      (o: ActionChoiceOption) => o.value === 'E95_Miller',
    )
    expect(millerOption).toBeDefined()
    resp = session.resolveChoice(0, millerOption!.value)

    // Walk through the flow until done
    const maxSteps = 10
    let step = 0
    while (resp.interaction.stateId === 'wait' && step < maxSteps) {
      step++
      const options = resp.interaction.options ?? []
      // Find fireplace option
      const fireplaceOption = options.find(
        (o: ActionChoiceOption) => o.value === 'major:Major_Fireplace1' || o.value === 'Major_Fireplace1',
      )
      // Find activate (non-skip) option
      const activateOption = options.find(
        (o: ActionChoiceOption) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (fireplaceOption) {
        resp = session.resolveChoice(0, fireplaceOption.value)
      } else if (activateOption) {
        resp = session.resolveChoice(0, activateOption.value)
      } else {
        break
      }
    }

    // Verify the card was played and improvement was purchased
    expect(resp.state.players[0]!.occupationPlayed).toContain('E95_Miller')
    expect(resp.state.players[0]!.improvements).toContain('Major_Fireplace1')
  })
})
