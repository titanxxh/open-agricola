import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { readActionSnapshotToken } from '../../shared/cards/helpers/action-snapshot'
import { getRoundPlacementDetails } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/A/A130_MummysBoy'
import '../../shared/cards/B/B130_FullPeasant'
import '../../shared/cards/B/B150_LargeScaleFarmer'
import '../../shared/cards/D/D075_WoodField'
import '../../shared/cards/E/E116_FirCutter'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const setup2P = (cardId: string) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = { ...player.resources, food: 5, grain: 2, wood: 20, clay: 10, reed: 10, stone: 10 }
  state.players[1]!.workersAvailable = 2
  player.occupationPlayed.push(cardId)
  session.loadState(state)
  return { session, state: session.getState().state }
}

const commitFirstFarmSelect = (
  session: GameSession,
  resp: ReturnType<GameSession['takeAction']>,
): ReturnType<GameSession['takeAction']> | null => {
  if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') return null
  const farm = resp.interaction.request.farm
  if (farm.farmType === 'plow') {
    const tile = farm.selectableTiles[0]
    if (!tile) throw new Error('expected selectable plow tile')
    return session.commitSelectionChoice(0, { tile })
  }
  if (farm.farmType === 'room') {
    const room = farm.selectableTiles[0]
    if (!room) throw new Error('expected selectable room tile')
    return session.commitSelectionChoice(0, { rooms: [room] })
  }
  if (farm.farmType === 'stable') {
    const stable = farm.selectableTiles[0]
    if (!stable) throw new Error('expected selectable stable tile')
    return session.commitSelectionChoice(0, { stables: [stable] })
  }
  if (farm.farmType === 'sow') {
    const field = farm.selectableFields[0]
    const crop = field?.allowedCrops[0]
    if (!field || !crop) throw new Error('expected selectable sow field')
    return session.commitSelectionChoice(0, {
      crops: [{ ...field.tile, crop }],
    })
  }
  throw new Error('unexpected mandatory fence farm-select in test helper')
}

const acceptSourceCardFlow = (
  session: GameSession,
  initialResp: ReturnType<GameSession['takeAction']>,
  sourceCard: string,
) => {
  let resp = initialResp
  let safety = 30
  while (resp.interaction.stateId === 'wait' && safety-- > 0) {
    const farmResp = commitFirstFarmSelect(session, resp)
    if (farmResp) {
      resp = farmResp
      continue
    }
    const options = resp.interaction.request.options ?? []
    const sourceOption = options.find((option) =>
      option.sourceCard === sourceCard && option.value !== '__skip__')
      ?? (resp.interaction.sourceCard === sourceCard
        ? options.find((option) => option.value !== '__skip__')
        : undefined)
    if (sourceOption) {
      resp = session.resolveChoice(0, sourceOption.value)
      continue
    }
    const skip = options.find((option) => option.value === '__skip__')
    if (skip) {
      resp = session.resolveChoice(0, skip.value)
      continue
    }
    if (options.length > 0) {
      resp = session.resolveChoice(0, options[0]!.value)
      continue
    }
    break
  }
  return resp
}

describe('A→A self-jump recursion guard', () => {
  it('A129 listener fires at most once per farmer placement chain (farm-expansion → grain-seeds)', () => {
    const { session, state } = setup2P('A129_Swagman')
    const player = state.players[0]!
    expect(readActionSnapshotToken(player)).toBeUndefined()
    const placedBefore = player.stats?.placedFarmers ?? 0

    let resp = session.takeAction(0, 'farm-expansion')
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      const opts = resp.interaction.request.options ?? []
      // accept any non-skip option (drives Swagman accept on first prompt; afterwards
      // skips remaining optional follow-ups; mandatory choices fall through to first opt)
      const skip = opts.find(o => o.value === '__skip__')
      const swagmanOpt = opts.find(o => o.sourceCard === 'A129_Swagman')
      const farmResp = commitFirstFarmSelect(session, resp)
      if (farmResp) {
        resp = farmResp
        continue
      }
      if (swagmanOpt) {
        resp = session.resolveChoice(0, swagmanOpt.value)
      } else if (skip) {
        resp = session.resolveChoice(0, '__skip__')
      } else if (opts.length > 0) {
        resp = session.resolveChoice(0, opts[0]!.value)
      } else {
        break
      }
    }

    const farmExpansion = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    const grainSeeds = resp.state.actionSpaces.find(s => s.id === 'grain-seeds')!

    // Self-jump guard: chain terminates with the farmer on grain-seeds (jump target);
    // it is NOT bounced back to farm-expansion.
    expect(farmExpansion.takenBy).toEqual([])
    expect(grainSeeds.takenBy.length).toBe(1)

    // actionToken: takeAction entry sets it once; jump does not bump it (per-action
    // bookkeeping intentionally not reset across the jump).
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBe(1)

    // placedFarmers +2: one for the entry placement, one for the jump.
    expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 2)
  })

  it('A129 jumpChain blocks self-trigger on the second-place dispatch (grain-seeds → farm-expansion)', () => {
    // Grain-seeds is the other half of the trigger pair. After the jump to farm-expansion,
    // the place-farmer 'after' phase fires again with jumpChain=['A129_Swagman']; the listener
    // self-check (isJumpChainContains) skips the second trigger.
    const { session } = setup2P('A129_Swagman')
    let resp = session.takeAction(0, 'grain-seeds')
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      const opts = resp.interaction.request.options ?? []
      const skip = opts.find(o => o.value === '__skip__')
      const swagmanOpt = opts.find(o => o.sourceCard === 'A129_Swagman')
      const farmResp = commitFirstFarmSelect(session, resp)
      if (farmResp) {
        resp = farmResp
        continue
      }
      if (swagmanOpt) {
        resp = session.resolveChoice(0, swagmanOpt.value)
      } else if (skip) {
        resp = session.resolveChoice(0, '__skip__')
      } else if (opts.length > 0) {
        resp = session.resolveChoice(0, opts[0]!.value)
      } else {
        break
      }
    }
    const grainSeeds = resp.state.actionSpaces.find(s => s.id === 'grain-seeds')!
    const farmExpansion = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    expect(grainSeeds.takenBy).toEqual([])
    expect(farmExpansion.takenBy.length).toBe(1)
  })
})

describe('distinct workers in round placement history', () => {
  it("does not enable A130 Mummy's Boy after one worker uses B130", () => {
    const { session } = setup2P('B130_FullPeasant')
    const state = session.getState().state
    const player = state.players[0]!
    setActiveWorkerCount(player, 3)
    setWorkersAtHome(state, player, 3)
    player.occupationPlayed.push('A130_MummysBoy')
    player.minorPlayed.push('D075_WoodField')
    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'],
      extraWood: 0,
    })
    resp = acceptSourceCardFlow(session, resp, 'B130_FullPeasant')
    const placements = getRoundPlacementDetails(resp.state.players[0]!)
    expect(placements).toHaveLength(2)
    expect(new Set(placements.map((entry) => entry.workerId)).size).toBe(1)

    const nextTurn = resp.state
    nextTurn.currentPlayerIndex = 0
    session.loadState(nextTurn)
    const secondPlacement = session.takeAction(0, 'grain-utilization')

    expect(secondPlacement.ok).toBe(false)
    expect(secondPlacement.error).toBe('space unavailable')
  })

  it('gives E116 Fir Cutter the second-person reward after an A129 jump', () => {
    const { session } = setup2P('A129_Swagman')
    const state = session.getState().state
    const player = state.players[0]!
    setActiveWorkerCount(player, 3)
    setWorkersAtHome(state, player, 3)
    player.occupationPlayed.push('E116_FirCutter')
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    resp = acceptSourceCardFlow(session, resp, 'A129_Swagman')
    const placements = getRoundPlacementDetails(resp.state.players[0]!)
    expect(placements).toHaveLength(2)
    expect(new Set(placements.map((entry) => entry.workerId)).size).toBe(1)
    const woodBefore = resp.state.players[0]!.resources.wood

    const nextTurn = resp.state
    nextTurn.currentPlayerIndex = 0
    session.loadState(nextTurn)
    resp = session.takeAction(0, 'sheep-market')
    resp = acceptSourceCardFlow(session, resp, 'E116_FirCutter')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(woodBefore + 1)
  })
})

describe('place-farmer jump runs full ActionNode path (parity smoke)', () => {
  it('B150 jump to major-improvement enters the buy-major flow', () => {
    // Validates the second placement runs through the engine's standard ActionNode path:
    // major-improvement's own buyability check + computeReplace / computeCosts / before-listener
    // dispatch surface a buy-major prompt. None of that would happen if the jump skipped the
    // ActionNode path.
    const { session } = setup2P('B150_LargeScaleFarmer')

    let resp = session.takeAction(0, 'farm-expansion')
    let safety = 25
    let majorPromptSeen = false
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      const opts = resp.interaction.request.options ?? []
      if (opts.some(o => /^Major_/.test(o.value))) {
        majorPromptSeen = true
        // skip without buying (the parity assertion is just that the prompt surfaced)
        const skip = opts.find(o => o.value === '__skip__')
        if (skip) {
          resp = session.resolveChoice(0, skip.value)
          continue
        }
        break
      }
      const skip = opts.find(o => o.value === '__skip__')
      const b150Opt = opts.find(o => o.sourceCard === 'B150_LargeScaleFarmer')
      const farmResp = commitFirstFarmSelect(session, resp)
      if (farmResp) {
        resp = farmResp
        continue
      }
      if (b150Opt) {
        resp = session.resolveChoice(0, b150Opt.value)
      } else if (skip) {
        resp = session.resolveChoice(0, '__skip__')
      } else if (opts.length > 0) {
        resp = session.resolveChoice(0, opts[0]!.value)
      } else {
        break
      }
    }

    expect(majorPromptSeen).toBe(true)
    const farmSpace = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    const majorSpace = resp.state.actionSpaces.find(s => s.id === 'major-improvement')!
    expect(farmSpace.takenBy).toEqual([])
    expect(majorSpace.takenBy.length).toBe(1)
  })
})

// NOTE: stub-based scenarios (A→B→A indirect cycle, cascade dispatch on a third-party
// listener, direct stub on computeReplace) are deferred — they need codebase-level
// support for runtime listener (un)registration. Spec §8.2 records the follow-up.
