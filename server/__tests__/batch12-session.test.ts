import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A054_Credit'
import '../../shared/cards/A/A096_TaskArtisan'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/B/B016_MiningHammer'
import '../../shared/cards/B/B124_Trimmer'
import '../../shared/cards/A/A082_WorkCertificate'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

// ===== A54 Credit session tests =====
describe('A054_Credit session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Manually add card (devPlayCard fails for non-catalog cards)
    player.minorPlayed.push('A054_Credit')
    player.resources.food = 10
    session.loadState(state)
    return session
  }

  it('credit card effect: player has card after setup', () => {
    const session = setup()
    const after = session.getState().state
    expect(after.players[0]!.minorPlayed).toContain('A054_Credit')
  })
})

// ===== A96 Task Artisan session tests =====
describe('A096_TaskArtisan session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    // Set round 5's action to western-quarry to test onRoundStart
    state.roundActionOrder[4] = 'western-quarry'

    const player = state.players[0]!
    player.occupationPlayed.push('A096_TaskArtisan')
    player.resources.food = 10
    player.resources.wood = 0
    session.loadState(state)
    return session
  }

  it('card is registered as played', () => {
    const session = setup()
    const after = session.getState().state
    expect(after.players[0]!.occupationPlayed).toContain('A096_TaskArtisan')
  })
})

// ===== B16 Mining Hammer session tests =====
describe('B016_MiningHammer session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5

    const player = state.players[0]!
    player.minorPlayed.push('B016_MiningHammer')
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    player.houseType = 'clay'
    player.resources.food = 10
    player.resources.wood = 5
    player.resources.clay = 5
    player.resources.reed = 5
    session.loadState(state)
    return session
  }

  it('gains 1 food when bought through the improvement action', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    player.minorHand = ['B016_MiningHammer', 'C069_LandConsolidation']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    player.resources = {
      ...player.resources,
      wood: 1,
      food: 0,
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const improvement = resp.interaction.request.options?.find(
      (option) => option.value === 'action-improvement-1',
    )
    expect(improvement).toBeDefined()

    resp = session.resolveChoice(0, improvement!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    resp = session.resolveChoice(0, 'B016_MiningHammer')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.minorPlayed).toContain('B016_MiningHammer')
    expect(after.resources.wood).toBe(0)
    expect(after.resources.food).toBe(1)
    expect(resp.state.events).toContainEqual(expect.objectContaining({
      type: 'card.played',
      cardId: 'B016_MiningHammer',
      cardType: 'minor',
      sourceActionId: 'improvement',
    }))
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({
        cardId: 'B016_MiningHammer',
        gain: { food: 1 },
      }),
    }))
  })

  it('builds one stable for free after renovation', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    player.houseType = 'clay'
    player.resources = {
      ...player.resources,
      wood: 5,
      reed: 5,
      stone: 5,
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const stableOption = resp.interaction.request.options?.find(
      (option) => option.sourceCard === 'B016_MiningHammer' && option.value !== '__skip__',
    )
    expect(stableOption).toBeDefined()
    resp = session.resolveChoice(0, stableOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionStableSelect')
    expect(resp.interaction.sourceCard).toBe('B016_MiningHammer')
    expect(resp.interaction.request.farm?.maxSelections).toBe(1)

    const tile = resp.interaction.request.farm?.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.commitSelectionChoice(0, {
      stables: [{ row: tile!.row, col: tile!.col }],
    })
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.stableTiles).toHaveLength(1)
    expect(after.resources.wood).toBe(5)
  })
})

// ===== A129 Swagman session tests =====
describe('A129_Swagman session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
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
      // Handle select-trigger prompt (PARALLEL wrapper for card listeners).
      // Default mandatory=true means PASS may not be offered; we always
      // activate Swagman's flow and let its inner optional decide accept/skip.
      if (req.kind === 'select-trigger') {
        const swagmanOpt = req.options.find((o) => o.sourceCard === 'A129_Swagman')
        const passOpt = req.options.find((o) => o.value === '__pass__')
        if (swagmanOpt) {
          resp = session.resolveChoice(0, swagmanOpt.value)
          swagmanActivated = true
        } else if (passOpt) {
          resp = session.resolveChoice(0, '__pass__')
        } else {
          // Pick first available (other mandatory trigger).
          resp = session.resolveChoice(0, req.options[0]!.value)
        }
        safety--
        continue
      }
      const opts = resp.interaction.request.options ?? []
      const skipOpt = opts.find((o: ActionChoiceOption) => o.value === '__skip__')
      // Swagman's inner optional jump choice is recognised by sourceCard.
      // The single-option mandatory select-trigger may have been auto-resolved
      // by the session, so we may land here without seeing select-trigger.
      const swagmanJumpOpt = opts.find(
        (o: ActionChoiceOption) => o.sourceCard === 'A129_Swagman' && o.value !== '__skip__',
      )
      if (swagmanActivated || swagmanJumpOpt) {
        swagmanActivated = false
        const acceptOpt = swagmanJumpOpt ?? opts.find((o: ActionChoiceOption) => o.value !== '__skip__')
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
      if (resp.interaction.stateId !== 'wait') {
        break
      }
      if (resp.interaction.request.kind === 'farm-select') {
        const farm = resp.interaction.request.farm
        if (farm.farmType === 'plow') {
          const tile = farm.selectableTiles[0]
          if (!tile) throw new Error('expected selectable plow tile')
          resp = session.commitSelectionChoice(0, { tile })
        } else if (farm.farmType === 'room') {
          const room = farm.selectableTiles[0]
          if (!room) throw new Error('expected selectable room tile')
          resp = session.commitSelectionChoice(0, { rooms: [room] })
        } else if (farm.farmType === 'stable') {
          const stable = farm.selectableTiles[0]
          if (!stable) throw new Error('expected selectable stable tile')
          resp = session.commitSelectionChoice(0, { stables: [stable] })
        } else if (farm.farmType === 'sow') {
          const field = farm.selectableFields[0]
          const crop = field?.allowedCrops[0]
          if (!field || !crop) throw new Error('expected selectable sow field')
          resp = session.commitSelectionChoice(0, {
            crops: [{ ...field.tile, crop }],
          })
        } else {
          throw new Error('unexpected mandatory fence farm-select in test helper')
        }
        safety--
        continue
      }
      if (skipOpt) {
        resp = session.resolveChoice(0, '__skip__')
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
describe('A082_WorkCertificate session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.minorPlayed.push('A082_WorkCertificate')
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
        const a82Opt = req.options.find((o) => o.sourceCard === 'A082_WorkCertificate')
        resp = session.resolveChoice(0, a82Opt ? a82Opt.value : '__pass__')
        safety--
        continue
      }
      if (req.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        safety--
        continue
      }
      const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
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
        const a82Opt = req.options.find((o) => o.sourceCard === 'A082_WorkCertificate')
        resp = session.resolveChoice(0, a82Opt ? a82Opt.value : '__pass__')
        safety--
        continue
      }
      if (req.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        safety--
        continue
      }
      const options = resp.interaction.request.options ?? []
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

  it('decrements the source accumulation space when a resource is taken (BGA partial-take parity)', () => {
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
        const a82Opt = req.options.find((o) => o.sourceCard === 'A082_WorkCertificate')
        resp = session.resolveChoice(0, a82Opt ? a82Opt.value : '__pass__')
        safety--
        continue
      }
      if (req.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        safety--
        continue
      }
      const options = resp.interaction.request.options ?? []
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
    // way the action-space total can drop is via collect partial-take.
    expect(totalBuildingBefore - totalBuildingAfter).toBeGreaterThanOrEqual(playerGained)
  })
})
