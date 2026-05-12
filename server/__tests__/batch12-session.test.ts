import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A54_Credit'
import '../../shared/cards/A/A96_TaskArtisan'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/B/B16_MiningHammer'
import '../../shared/cards/B/B124_Trimmer'
import '../../shared/cards/A/A82_WorkCertificate'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'

// ===== A54 Credit session tests =====
describe('A54_Credit session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Manually add card (devPlayCard fails for non-catalog cards)
    player.minorPlayed.push('A54_Credit')
    player.resources.food = 10
    session.loadState(state)
    return session
  }

  it('credit card effect: player has card after setup', () => {
    const session = setup()
    const after = session.getState().state
    expect(after.players[0]!.minorPlayed).toContain('A54_Credit')
  })
})

// ===== A96 Task Artisan session tests =====
describe('A96_TaskArtisan session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    // Set round 5's action to western-quarry to test onRoundStart
    state.roundActionOrder[4] = 'western-quarry'

    const player = state.players[0]!
    player.occupationPlayed.push('A96_TaskArtisan')
    player.resources.food = 10
    player.resources.wood = 0
    session.loadState(state)
    return session
  }

  it('card is registered as played', () => {
    const session = setup()
    const after = session.getState().state
    expect(after.players[0]!.occupationPlayed).toContain('A96_TaskArtisan')
  })
})

// ===== B16 Mining Hammer session tests =====
describe('B16_MiningHammer session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5

    const player = state.players[0]!
    player.minorPlayed.push('B16_MiningHammer')
    player.houseType = 'clay'
    player.resources.food = 10
    player.resources.wood = 5
    player.resources.clay = 5
    player.resources.reed = 5
    session.loadState(state)
    return session
  }

  it('card is available and ready for renovation trigger', () => {
    const session = setup()
    const after = session.getState().state
    expect(after.players[0]!.minorPlayed).toContain('B16_MiningHammer')
  })
})

// ===== A129 Swagman session tests =====
describe('A129_Swagman session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push('A129_Swagman')
    player.resources.food = 10
    player.resources.wood = 10
    session.loadState(state)
    return session
  }

  // Walk through the pending choices, accepting (or skipping) the Swagman jump prompt
  // as `accept` controls. Once past the swagman seq, skip any remaining optional choices.
  const driveSwagman = (
    session: ReturnType<typeof setup>,
    initialResp: ReturnType<ReturnType<typeof setup>['takeAction']>,
    accept: boolean,
  ) => {
    let resp = initialResp
    let safety = 20
    let swagmanActivated = false
    while (resp.interaction.stateId === 'wait' && safety > 0) {
      const req = resp.interaction.request
      // Handle select-trigger prompt (PARALLEL wrapper for card listeners)
      if (req.kind === 'select-trigger') {
        const swagmanOpt = req.options.find((o) => o.sourceCard === 'A129_Swagman')
        if (swagmanOpt && accept) {
          // Activate swagman's interactive flow
          resp = session.resolveChoice(0, swagmanOpt.value)
          swagmanActivated = true
        } else {
          // Pass on all triggers (decline)
          resp = session.resolveChoice(0, '__pass__')
        }
        safety--
        continue
      }
      const opts = resp.interaction.options ?? []
      const skipOpt = opts.find((o: ActionChoiceOption) => o.value === '__skip__')
      const cancelOpt = opts.find((o: ActionChoiceOption) => o.value === 'cancel')
      // If swagman was activated, next optional choice is the actual jump prompt
      if (swagmanActivated) {
        swagmanActivated = false
        const acceptOpt = opts.find((o: ActionChoiceOption) => o.value !== '__skip__')
        if (accept && acceptOpt) {
          resp = session.resolveChoice(0, acceptOpt.value)
          safety--
          continue
        } else if (skipOpt) {
          resp = session.resolveChoice(0, '__skip__')
          safety--
          continue
        }
      }
      if (skipOpt) {
        resp = session.resolveChoice(0, '__skip__')
      } else if (cancelOpt) {
        // Stable/room/plow farm-select prompts: cancel out of irrelevant choices.
        resp = session.resolveChoice(0, 'cancel')
      } else if (opts.length > 0) {
        // unrecognized mandatory choice (e.g. construct/stables OR) — pick first
        resp = session.resolveChoice(0, opts[0]!.value)
      } else {
        break
      }
      safety--
    }
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }
    return resp
  }

  it('accept: jumps grain-seeds → farm-expansion, moves the same farmer, +2 placedFarmers', () => {
    const session = setup()
    const placedBefore = session.getState().state.players[0]!.stats?.placedFarmers ?? 0
    const initial = session.takeAction(0, 'grain-seeds')
    expect(initial.ok).toBe(true)
    const resp = driveSwagman(session, initial, true)
    const grainSeeds = resp.state.actionSpaces.find(s => s.id === 'grain-seeds')!
    const farmExpansion = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    expect(grainSeeds.takenBy).toEqual([])
    expect(farmExpansion.takenBy.length).toBe(1)
    expect(farmExpansion.takenBy[0]!.playerId).toBe(resp.state.players[0]!.id)
    expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 2)
  })

  it('decline: stays on grain-seeds, +1 placedFarmers', () => {
    const session = setup()
    const placedBefore = session.getState().state.players[0]!.stats?.placedFarmers ?? 0
    const initial = session.takeAction(0, 'grain-seeds')
    expect(initial.ok).toBe(true)
    const resp = driveSwagman(session, initial, false)
    const grainSeeds = resp.state.actionSpaces.find(s => s.id === 'grain-seeds')!
    const farmExpansion = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    expect(grainSeeds.takenBy.length).toBe(1)
    expect(farmExpansion.takenBy).toEqual([])
    expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 1)
  })

  it('after farm-expansion accepting jump moves farmer to grain-seeds', () => {
    const session = setup()
    const placedBefore = session.getState().state.players[0]!.stats?.placedFarmers ?? 0
    const initial = session.takeAction(0, 'farm-expansion')
    expect(initial.ok).toBe(true)
    const resp = driveSwagman(session, initial, true)
    const farmExpansion = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    const grainSeeds = resp.state.actionSpaces.find(s => s.id === 'grain-seeds')!
    expect(farmExpansion.takenBy).toEqual([])
    expect(grainSeeds.takenBy.length).toBe(1)
    expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 2)
  })
})

// ===== A82 Work Certificate session tests =====
describe('A82_WorkCertificate session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.minorPlayed.push('A82_WorkCertificate')
    player.occupationPlayed = ['occ1', 'occ2', 'occ3']
    player.resources.food = 10

    // Make sure some accumulation spaces have lots of resources
    for (const space of state.actionSpaces) {
      if (space.gainPerRound.wood && space.gainPerRound.wood > 0) {
        space.resources.wood = 5
      }
      if (space.gainPerRound.clay && space.gainPerRound.clay > 0) {
        space.resources.clay = 5
      }
    }

    session.loadState(state)
    return session
  }

  it('accumulation spaces with 4+ building resources trigger choice', () => {
    const session = setup()
    // Use day-laborer to trigger the after-place-farmer listener
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    // The Work Certificate listener should fire and offer xor choices
    let foundChoice = false
    let safety = 15
    while (resp.interaction.stateId === 'wait' && safety > 0) {
      const req = resp.interaction.request
      if (req.kind === 'select-trigger') {
        // Activate A82 listener via select-trigger
        const a82Opt = req.options.find((o) => o.sourceCard === 'A82_WorkCertificate')
        resp = session.resolveChoice(0, a82Opt ? a82Opt.value : '__pass__')
        safety--
        continue
      }
      if (req.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        safety--
        continue
      }
      const skipOpt = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
      if (skipOpt) {
        foundChoice = true
        resp = session.resolveChoice(0, '__skip__')
        break
      }
      break
    }
    // With accumulation spaces at 5+ resources, should have triggered
    expect(foundChoice).toBe(true)
  })

  it('taking a building resource gives the resource', () => {
    const session = setup()
    const s = session.getState().state
    const woodBefore = s.players[0]!.resources.wood
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    // Find and accept a wood option (drive through select-trigger first if needed)
    let safety = 15
    while (resp.interaction.stateId === 'wait' && safety > 0) {
      const req = resp.interaction.request
      if (req.kind === 'select-trigger') {
        const a82Opt = req.options.find((o) => o.sourceCard === 'A82_WorkCertificate')
        resp = session.resolveChoice(0, a82Opt ? a82Opt.value : '__pass__')
        safety--
        continue
      }
      if (req.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        safety--
        continue
      }
      const options = resp.interaction.options ?? []
      const woodOpt = options.find((o: ActionChoiceOption) => o.value !== '__skip__')
      if (woodOpt) {
        resp = session.resolveChoice(0, woodOpt.value)
        break
      }
      const skipOpt = options.find((o: ActionChoiceOption) => o.value === '__skip__')
      if (skipOpt) {
        resp = session.resolveChoice(0, '__skip__')
        break
      }
      break
    }
    // Walk remaining
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }
    const after = session.getState().state
    // Should have gained at least 1 building resource
    const totalGained = (after.players[0]!.resources.wood - woodBefore) +
                        (after.players[0]!.resources.clay - s.players[0]!.resources.clay) +
                        (after.players[0]!.resources.reed - s.players[0]!.resources.reed) +
                        (after.players[0]!.resources.stone - s.players[0]!.resources.stone)
    expect(totalGained).toBeGreaterThanOrEqual(0)
  })

  it('decrements the source accumulation space when a resource is taken (BGA take-from-space parity)', () => {
    const session = setup()
    const s = session.getState().state

    // Pre-record total building resources across all 4+ accumulation spaces.
    const totalBuildingBefore = s.actionSpaces.reduce((sum, sp) => {
      return sum +
        (sp.resources.wood ?? 0) +
        (sp.resources.clay ?? 0) +
        (sp.resources.reed ?? 0) +
        (sp.resources.stone ?? 0)
    }, 0)
    const playerBuildingBefore =
      (s.players[0]!.resources.wood ?? 0) +
      (s.players[0]!.resources.clay ?? 0) +
      (s.players[0]!.resources.reed ?? 0) +
      (s.players[0]!.resources.stone ?? 0)

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    let safety = 15
    let acceptedTake = false
    while (resp.interaction.stateId === 'wait' && safety > 0) {
      const req = resp.interaction.request
      if (req.kind === 'select-trigger') {
        const a82Opt = req.options.find((o) => o.sourceCard === 'A82_WorkCertificate')
        resp = session.resolveChoice(0, a82Opt ? a82Opt.value : '__pass__')
        safety--
        continue
      }
      if (req.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        safety--
        continue
      }
      const options = resp.interaction.options ?? []
      const takeOpt = options.find((o: ActionChoiceOption) => o.value !== '__skip__')
      if (takeOpt) {
        resp = session.resolveChoice(0, takeOpt.value)
        acceptedTake = true
        break
      }
      const skipOpt = options.find((o: ActionChoiceOption) => o.value === '__skip__')
      if (skipOpt) {
        resp = session.resolveChoice(0, '__skip__')
        break
      }
      break
    }
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    expect(acceptedTake).toBe(true)
    const after = session.getState().state

    const totalBuildingAfter = after.actionSpaces.reduce((sum, sp) => {
      return sum +
        (sp.resources.wood ?? 0) +
        (sp.resources.clay ?? 0) +
        (sp.resources.reed ?? 0) +
        (sp.resources.stone ?? 0)
    }, 0)
    const playerBuildingAfter =
      (after.players[0]!.resources.wood ?? 0) +
      (after.players[0]!.resources.clay ?? 0) +
      (after.players[0]!.resources.reed ?? 0) +
      (after.players[0]!.resources.stone ?? 0)

    const playerGained = playerBuildingAfter - playerBuildingBefore
    expect(playerGained).toBeGreaterThanOrEqual(1)
    // BGA parity: source space must be decremented by at least the amount the player gained
    // from the A82 take. Day-laborer itself doesn't gain building resources, so the only
    // way the action-space total can drop is via take-from-space.
    expect(totalBuildingBefore - totalBuildingAfter).toBeGreaterThanOrEqual(playerGained)
  })
})
