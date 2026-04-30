import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import { readActionSnapshotToken } from '../../shared/cards/helpers/action-snapshot'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/B/B150_LargeScaleFarmer'

const setup2P = (cardId: string) => {
  const session = new GameSession()
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

describe('A→A self-jump recursion guard', () => {
  it('A129 listener fires at most once per farmer placement chain (farm-expansion → grain-seeds)', () => {
    const { session, state } = setup2P('A129_Swagman')
    const player = state.players[0]!
    expect(readActionSnapshotToken(player)).toBeUndefined()
    const placedBefore = player.stats?.placedFarmers ?? 0

    let resp = session.takeAction(0, 'farm-expansion')
    let safety = 30
    while (safety-- > 0 && resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      // accept any non-skip option (drives Swagman accept on first prompt; afterwards
      // skips remaining optional follow-ups; mandatory choices fall through to first opt)
      const skip = opts.find(o => o.value === '__skip__')
      const swagmanOpt = opts.find(o => o.sourceCard === 'A129_Swagman')
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
    while (safety-- > 0 && resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      const skip = opts.find(o => o.value === '__skip__')
      const swagmanOpt = opts.find(o => o.sourceCard === 'A129_Swagman')
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
    while (safety-- > 0 && resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      // Detect the major-improvement buy prompt by looking for option values prefixed with `major:`.
      if (opts.some(o => /^major:/.test(o.value))) {
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
