import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/E/E095_Miller'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/E/E092_FieldDoctor'
import '../../shared/cards/E/E093_Motivator'
import '../../shared/cards/E/E094_Prophet'
import '../../shared/cards/E/E097_Beneficiary'
import '../../shared/cards/E/E130_Overachiever'
import '../../shared/cards/E/E132_VeggieLover'
import '../../shared/cards/E/E135_Pickler'
import '../../shared/cards/E/E147_AnimalDriver'
import '../../shared/cards/E/E164_MountainPlowman'
import '../../shared/cards/E/E165_MasterHuntsman'
import '../../shared/cards/E/E166_Roastmaster'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit45Miller from './_helpers/audit/ae-negative-45-miller'
import assert from 'node:assert/strict'
import * as audit45Placement from './_helpers/audit/ae-negative-45-placement'

describe('E095_Miller session', () => {
  /**
   * Setup: 2-player game.
   * p0 = Miller owner, has a Fireplace and grain for baking.
   * p1 = opponent, will use grain-seeds.
   */
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 1 // opponent's turn

    const owner = state.players[0]!
    owner.occupationPlayed.push('E095_Miller')
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
    expect(resp.interaction.request.fromPlayerIndex).toBe(1)
    expect(resp.interaction.request.toPlayerIndex).toBe(0)
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
    const activateOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(activateOption).toBeDefined()
    resp = session.resolveChoice(0, activateOption!.value)

    // Bake bread flow: first pick which improvement to bake with
    while (resp.interaction.stateId === 'wait') {
      const options = resp.interaction.request.options ?? []
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

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
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
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const owner = state.players[0]!
    setWorkersAtHome(state, owner, 2) // Give enough resources to buy an occupation (food: 1 for second occ) and a Fireplace (clay: 2)
    owner.resources = { ...owner.resources, food: 5, clay: 5 }
    // Put Miller in occupation hand — add a second occupation so auto-select doesn't skip the choice
    owner.occupationHand = ['E095_Miller', 'A085_Homekeeper']

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
    const millerOption = resp.interaction.request.options?.find(
      (o: ActionChoiceOption) => o.value === 'E095_Miller',
    )
    expect(millerOption).toBeDefined()
    resp = session.resolveChoice(0, millerOption!.value)

    // After playing the occupation, should get an optional improvement choice
    // (the onBuy flow). It may present as a choice with __skip__ option.
    if (resp.interaction.stateId === 'wait') {
      const options = resp.interaction.request.options ?? []
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
    expect(resp.state.players[0]!.occupationPlayed).toContain('E095_Miller')
  })

  it('onBuy allows purchasing a baking improvement', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const owner = state.players[0]!
    setWorkersAtHome(state, owner, 2)
    owner.resources = { ...owner.resources, food: 5, clay: 5 }
    // Add a second occupation so the choice isn't auto-resolved
    owner.occupationHand = ['E095_Miller', 'A085_Homekeeper']

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
    const millerOption = resp.interaction.request.options?.find(
      (o: ActionChoiceOption) => o.value === 'E095_Miller',
    )
    expect(millerOption).toBeDefined()
    resp = session.resolveChoice(0, millerOption!.value)

    // Walk through the flow until done
    const maxSteps = 10
    let step = 0
    while (resp.interaction.stateId === 'wait' && step < maxSteps) {
      step++
      const options = resp.interaction.request.options ?? []
      // Find fireplace option
      const fireplaceOption = options.find(
        (o: ActionChoiceOption) => o.value === 'Major_Fireplace1',
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
    expect(resp.state.players[0]!.occupationPlayed).toContain('E095_Miller')
    expect(resp.state.players[0]!.improvements).toContain('Major_Fireplace1')
  })
})

describe('ae-negative-45-miller', () => {
  const { setupOccupation, playOccupation, chooseNonSkip, chooseSkip, sessions, it, optionsOf, requestOf } = audit45Miller
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('E095 Miller parity', () => {
    const available = () => {
      const session = setupOccupation('E095_Miller', { resources: { clay: 2 } })
      session.state.availableMajorImprovements = ['Major_Fireplace1']
      session.loadState(session.state)
      return session
    }
    it('E095 S1: playing may immediately build a paid Fireplace', () => {
      const session = available()
      let response = chooseNonSkip(session, playOccupation(session, 'E095_Miller'), 'E095_Miller')
      if (response.interaction.stateId === 'wait') {
        const fireplace = optionsOf(response)?.find((option) => option.value === 'Major_Fireplace1')
        if (fireplace)
          response = session.resolveChoice(0, fireplace.value)
      }
      expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    })
    it('E095 S2: the immediate baking improvement may be declined', () => {
      const session = available()
      const response = chooseSkip(session, playOccupation(session, 'E095_Miller'), 'E095_Miller')
      expect(response.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
    })
    it('E095 S3: another player using Grain Seeds offers the owner Bake Bread', () => {
      const session = setupOccupation('E095_Miller', { played: true, resources: { grain: 1 } })
      session.state.players[0]!.improvements = ['Major_Fireplace1']
      session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
      session.state.currentPlayerIndex = 1
      session.loadState(session.state)
      let response = session.takeAction(1, 'grain-seeds')
      expect(response.interaction.stateId === 'wait' ? requestOf(response).kind : undefined).toBe('confirm-player-switch')
      response = confirmPlayerSwitch(session)
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).toBe('E095_Miller')
    })
    it('E095 N4 non baking affordable Well is excluded before a legal paid Fireplace control', () => {
      const session = available()
      session.state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Well']
      Object.assign(session.state.players[0]!.resources, { wood: 2, stone: 3 })
      session.loadState(session.state)
      let r = chooseNonSkip(session, playOccupation(session, 'E095_Miller'), 'E095_Miller')
      expect(optionsOf(r).some(o => o.value === 'Major_Well')).toBe(false)
      assertRejectedUnchanged(session, () => session.resolveChoice(0, 'Major_Well'))
      if (!r.state.players[0]!.improvements.includes('Major_Fireplace1'))
        r = session.resolveChoice(0, 'Major_Fireplace1')
      expect(r.ok, r.error).toBe(true)
      expect(r.state.players[0]!.improvements).toContain('Major_Fireplace1')
      expect(r.state.players[0]!.improvements).not.toContain('Major_Well')
      expect(r.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 2, stone: 3 })
    })
  })
})

describe('ae-negative-45-placement', () => {
  const { sessions, save, ok, setup, choice, finish, next, actorOf } = audit45Placement
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E095 N1 actual opponent Grain Seeds allows owner to bake one grain exactly two food while optional decline retains grain', () => { for (const accept of [true, false]) {
    const s = setup('E095_Miller', state => { state.players[0]!.improvements = ['Major_Fireplace1']; state.availableMajorImprovements = state.availableMajorImprovements.filter(c => c !== 'Major_Fireplace1'); state.players[0]!.resources.grain = 1; })
    finish(s, ok(s.takeAction(0, 'forest')))
    next(s)
    let r = ok(s.takeAction(1, 'grain-seeds'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
      r = ok(s.resolveChoice(actorOf(r), 'confirm', { zones: r.interaction.request.zones }))
    else if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch')
      r = ok(s.resolveChoice(1, 'confirm'))
    if (accept) {
      r = choice(s, r, o => o.value !== '__skip__')
      if (r.state.players[0]!.resources.grain === 1)
        r = choice(s, r, o => o.value === 'Major_Fireplace1')
    }
    else
      r = finish(s, r)
    assert.equal(r.state.players[0]!.resources.grain, accept ? 0 : 1)
    assert.equal(r.state.players[0]!.resources.food, accept ? 4 : 2)
    assert.equal(r.state.players[1]!.resources.grain, 1)
    save(`E095-N1-${accept}`, r)
  } })
  it('E095 N2 owner Grain Seeds and unrelated opponent action cannot bake for owner', () => { const s = setup('E095_Miller', state => { state.players[0]!.improvements = ['Major_Fireplace1']; state.availableMajorImprovements = state.availableMajorImprovements.filter(c => c !== 'Major_Fireplace1'); state.players[0]!.resources.grain = 1; }); let r = finish(s, ok(s.takeAction(0, 'grain-seeds'))); assert.equal(r.state.players[0]!.resources.grain, 2); next(s); r = finish(s, ok(s.takeAction(1, 'forest'))); assert.equal(r.state.players[0]!.resources.grain, 2); assert.equal(r.state.players[0]!.resources.food, 2); save('E095-N2', r); })
})
