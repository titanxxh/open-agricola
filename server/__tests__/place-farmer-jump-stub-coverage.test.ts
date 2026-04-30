import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { registerActionHook, unregisterActionHook } from '../../shared/actions/hooks'
import { jumpLeaf } from '../../shared/cards/helpers/jump-leaf'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import '../../shared/cards/A/A129_Swagman'

const driveAccepts = (
  session: GameSession,
  initialResp: ReturnType<GameSession['takeAction']>,
  maxIters = 30,
): ReturnType<GameSession['takeAction']> => {
  let resp = initialResp
  while (maxIters-- > 0 && resp.pending.type === 'choice') {
    const opts = resp.pending.options ?? []
    const skip = opts.find((o) => o.value === '__skip__')
    const nonSkip = opts.find((o) => o.value !== '__skip__')
    if (nonSkip) {
      resp = session.resolveChoice(0, nonSkip.value)
    } else if (skip) {
      resp = session.resolveChoice(0, '__skip__')
    } else if (opts.length > 0) {
      resp = session.resolveChoice(0, opts[0]!.value)
    } else {
      break
    }
  }
  return resp
}

const setup2P = (...occupations: string[]) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = { ...player.resources, food: 5, grain: 2, wood: 20, clay: 10, reed: 10, stone: 10 }
  state.players[1]!.workersAvailable = 2
  for (const occ of occupations) player.occupationPlayed.push(occ)
  session.loadState(state)
  return { session, state: session.getState().state }
}

// Scenario 1: A->B->A indirect cycle.
//
// Stub card listens on `place-farmer` after-phase (the same hook A129
// uses) and, when the player is on grain-seeds, attempts to jump them
// back to farm-expansion. With both A129 and the stub played:
//   1. Player takes farm-expansion (entry placement).
//   2. A129 listener fires (ctx.space=farm-expansion); jumps to grain-seeds.
//   3. Sub-engine completes -> game-core's main loop is in flow-engine
//      mode (engineSource.kind='flow'), so `runPlaceFarmerAfterHooks`
//      is NOT re-invoked. The stub never gets a chance to fire its
//      jump-back leaf.
// The observable outcome: farmer ends on grain-seeds; farm-expansion
// is empty. This documents that the listener-driven jump chain in
// game-core is intentionally one-shot per top-level takeAction.
describe('A->B->A indirect cycle - jumpChain self-check fires only on entry path', () => {
  const STUB_ID = '__test_jump_back_card__'
  const LISTENER_ID = 'stub-jump-back-listener'

  beforeEach(() => {
    const registry = requireActiveCardRegistry('stub-jump-test')
    registry.registerListener({
      id: LISTENER_ID,
      cardIds: [STUB_ID],
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'grain-seeds') return
        const chain = (ctx.actionContext?.jumpChain as string[] | undefined) ?? []
        if (chain.includes(STUB_ID)) return
        const myRef = ctx.space.takenBy.find((t) => t.playerId === ctx.player.id)
        if (!myRef) return
        return {
          flow: jumpLeaf({
            sourceCard: STUB_ID,
            workerId: myRef.workerId,
            targetSpaceId: 'farm-expansion',
          }),
          sourceCard: STUB_ID,
        }
      },
    })
  })

  afterEach(() => {
    requireActiveCardRegistry('stub-jump-test').removeListenersWhere(
      (l) => l.id === LISTENER_ID,
    )
  })

  it('A129 jump terminates on grain-seeds; stub does not bounce back (one-shot after-hook)', () => {
    const { session, state } = setup2P('A129_Swagman')
    state.players[0]!.occupationPlayed.push(STUB_ID)
    session.loadState(state)

    const resp = driveAccepts(session, session.takeAction(0, 'farm-expansion'))

    const farm = resp.state.actionSpaces.find((s) => s.id === 'farm-expansion')!
    const grain = resp.state.actionSpaces.find((s) => s.id === 'grain-seeds')!
    expect(farm.takenBy.length + grain.takenBy.length).toBe(1)
    expect(grain.takenBy.length).toBe(1)
    expect(farm.takenBy).toEqual([])
  })
})

// Scenario 2: cascade dispatch - third-party listener visibility.
//
// Stub observer listens on `place-farmer` after for grain-seeds and
// increments a trace counter via card extra-data. Two paths exercised:
//   (a) direct placement on grain-seeds: counter increments (sanity).
//   (b) reach grain-seeds via A129 jump from farm-expansion:
//       runPlaceFarmerAfterHooks fires once on entry (ctx.space=
//       farm-expansion), so the observer's grain-seeds filter does NOT
//       match. The second placement does NOT re-trigger after-hooks.
// This makes explicit that game-core's place-farmer after-phase is keyed
// to the takeAction entry space, not the eventual jump destination.
describe('cascade dispatch - place-farmer after fires once keyed on entry space', () => {
  const STUB_OBS_ID = '__test_grain_seeds_observer__'
  const LISTENER_ID = 'stub-grain-seeds-observer-listener'
  const TRACE_KEY = 'observed'

  beforeEach(() => {
    const registry = requireActiveCardRegistry('stub-cascade-test')
    registry.registerListener({
      id: LISTENER_ID,
      cardIds: [STUB_OBS_ID],
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'grain-seeds') return
        const prev = readCardExtraData<number>(ctx.player, STUB_OBS_ID, TRACE_KEY) ?? 0
        writeCardExtraData(ctx.player, STUB_OBS_ID, TRACE_KEY, prev + 1)
      },
    })
  })

  afterEach(() => {
    requireActiveCardRegistry('stub-cascade-test').removeListenersWhere(
      (l) => l.id === LISTENER_ID,
    )
  })

  it('observer fires when player directly places on grain-seeds (sanity)', () => {
    const { session, state } = setup2P()
    state.players[0]!.occupationPlayed.push(STUB_OBS_ID)
    session.loadState(state)

    const resp = driveAccepts(session, session.takeAction(0, 'grain-seeds'))

    const observed = readCardExtraData<number>(
      resp.state.players[0]!,
      STUB_OBS_ID,
      TRACE_KEY,
    )
    expect(observed).toBeGreaterThanOrEqual(1)
  })

  it('observer does NOT fire on jump-second-placement (after-hook is one-shot keyed to entry)', () => {
    const { session, state } = setup2P('A129_Swagman')
    state.players[0]!.occupationPlayed.push(STUB_OBS_ID)
    session.loadState(state)

    const resp = driveAccepts(session, session.takeAction(0, 'farm-expansion'))

    const observed = readCardExtraData<number>(
      resp.state.players[0]!,
      STUB_OBS_ID,
      TRACE_KEY,
    )
    // farmer landed on grain-seeds (via A129 jump) but the after-hook
    // observer is keyed on ctx.space.id which is the entry space (farm-expansion).
    expect(observed ?? 0).toBe(0)
    const grain = resp.state.actionSpaces.find((s) => s.id === 'grain-seeds')!
    expect(grain.takenBy.length).toBe(1)
  })
})

// Scenario 3: ReplaceHook parity - jump second placement still runs the
// full ActionNode dispatch path (computeReplace included).
//
// grain-seeds' definition expands to a single inner `gain` ActionNode
// (createGainAction in shared/cards/action/common-grain-seeds.ts), so
// computeReplace fires keyed on actionId='gain'. The handler matches
// only when this gain dispatch is the grain-seeds branch, identified by
// either ctx.space.id (direct entry) or actionContext.targetSpaceId
// (jump-routed via place-farmer effect's expandFlow leaf).
describe('ReplaceHook parity - computeReplace fires on jump second placement', () => {
  it('stub computeReplace on grain-seeds inner-gain fires for both direct and jump paths', () => {
    let firedDirect = false
    let firedJump = false

    // setup2P() calls `new GameSession()` which clears all global action hooks
    // (game-core.ts:284). Register stubs AFTER session construction.
    const { session: directSession } = setup2P('A129_Swagman')
    registerActionHook({
      id: 'stub-replace-grain-seeds-direct',
      phases: ['computeReplace'],
      actions: ['gain'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'grain-seeds') return
        firedDirect = true
        return undefined
      },
    })
    try {
      driveAccepts(directSession, directSession.takeAction(0, 'grain-seeds'))
    } finally {
      unregisterActionHook('stub-replace-grain-seeds-direct')
    }
    expect(firedDirect).toBe(true)

    const { session: jumpSession } = setup2P('A129_Swagman')
    registerActionHook({
      id: 'stub-replace-grain-seeds-jump',
      phases: ['computeReplace'],
      actions: ['gain'],
      handler: (ctx) => {
        const target = ctx.actionContext?.targetSpaceId as string | undefined
        if (target !== 'grain-seeds') return
        firedJump = true
        return undefined
      },
    })
    try {
      driveAccepts(jumpSession, jumpSession.takeAction(0, 'farm-expansion'))
    } finally {
      unregisterActionHook('stub-replace-grain-seeds-jump')
    }
    expect(firedJump).toBe(true)
  })
})
