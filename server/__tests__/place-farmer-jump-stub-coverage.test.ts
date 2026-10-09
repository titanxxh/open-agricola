import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { registerActionHook, unregisterActionHook } from '../../shared/actions/hooks'
import { jumpLeaf } from '../../shared/cards/helpers/jump-leaf'
import { gainLeaf } from '../../shared/cards/helpers/pay-gain-node'
import '../../shared/cards/A/A129_Swagman'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const driveAccepts = (
  session: GameSession,
  initialResp: ReturnType<GameSession['takeAction']>,
  maxIters = 30,
  options: { stopAtFarmSelect?: boolean } = {},
): ReturnType<GameSession['takeAction']> => {
  let resp = initialResp
  while (maxIters-- > 0 && resp.interaction.stateId === 'wait') {
    const opts = resp.interaction.request.options ?? []
    const skip = opts.find((o) => o.value === '__skip__')
    const nonSkip = opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel' && o.value !== 'confirm')
    if (resp.interaction.request.kind === 'farm-select') {
      if (options.stopAtFarmSelect) break
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
    } else if (nonSkip) {
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
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
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

// Scenario 1: A->B->A indirect cycle - jumpChain self-check terminates the
// loop on the second hop.
//
// Stub card listens on `place-farmer` after-phase and, when the farmer
// has just landed on grain-seeds, attempts to jump back to farm-expansion.
// Both A129 (entry-path jumper) and the stub are played by the player.
//
//   1. Player takes farm-expansion (entry placement).
//   2. game-core's runPlaceFarmerAfterHooks dispatches A129's listener;
//      A129 jumps farmer to grain-seeds (jumpChain=['A129']).
//   3. The place-farmer ActionNode dispatches its standard `after` listeners
//      against the new space (grain-seeds).
//      The stub's listener matches and emits a jumpLeaf back to
//      farm-expansion after grain-seeds' own ActionNode expansion.
//   4. The stub's jumpLeaf executes: farmer moves back to farm-expansion;
//      jumpChain=['A129', STUB_ID].
//   5. The nested place-farmer dispatches once more on farm-expansion. A129's
//      listener self-check (chain.includes('A129')) returns true, so it
//      skips. No further jumps; chain terminates.
//
// Observable: farmer ends on farm-expansion; grain-seeds is empty;
// only one worker is placed total.
describe('A->B->A indirect cycle - jumpChain self-check terminates on second hop', () => {
  const STUB_ID = '__test_jump_back_card__'
  const LISTENER_ID = 'stub-jump-back-listener'

  const registerJumpBackListener = () => {
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
  }

  afterEach(() => {
    requireActiveCardRegistry('stub-jump-test').removeListenersWhere(
      (l) => l.id === LISTENER_ID,
    )
  })

  it('A129 -> stub -> A129 chain bounces back to farm-expansion and terminates by jumpChain self-check', () => {
    const { session, state } = setup2P('A129_Swagman')
    registerJumpBackListener()
    state.players[0]!.occupationPlayed.push(STUB_ID)
    session.loadState(state)

    const resp = driveAccepts(session, session.takeAction(0, 'farm-expansion'), 30, { stopAtFarmSelect: true })

    const farm = resp.state.actionSpaces.find((s) => s.id === 'farm-expansion')!
    const grain = resp.state.actionSpaces.find((s) => s.id === 'grain-seeds')!
    // Exactly one worker placed total (no duplication).
    expect(farm.takenBy.length + grain.takenBy.length).toBe(1)
    // Final landing space is farm-expansion (stub bounced the farmer back).
    expect(farm.takenBy.length).toBe(1)
    expect(grain.takenBy).toEqual([])
  })
})

// Scenario 2: cascade dispatch - third-party listener visibility on the
// jump destination (the "Y option" in mech-A spec §6.5).
//
// Stub observer listens on `place-farmer` after for grain-seeds and gains food.
//   (a) direct placement on grain-seeds: gains 1 food (sanity).
//   (b) reach grain-seeds via A129 jump from farm-expansion: the standard
//       ActionNode `after` dispatch is keyed on grain-seeds, so the observer
//       matches and gains food.
describe('cascade dispatch - third-party place-farmer after listener fires on jump destination', () => {
  const STUB_OBS_ID = '__test_grain_seeds_observer__'
  const LISTENER_ID = 'stub-grain-seeds-observer-listener'

  const registerObserverListener = () => {
    const registry = requireActiveCardRegistry('stub-cascade-test')
    registry.registerListener({
      id: LISTENER_ID,
      cardIds: [STUB_OBS_ID],
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'grain-seeds') return
        return {
          flow: gainLeaf(STUB_OBS_ID, { food: 1 }),
          sourceCard: STUB_OBS_ID,
        }
      },
    })
  }

  afterEach(() => {
    requireActiveCardRegistry('stub-cascade-test').removeListenersWhere(
      (l) => l.id === LISTENER_ID,
    )
  })

  it('observer fires when player directly places on grain-seeds (sanity)', () => {
    const { session, state } = setup2P()
    registerObserverListener()
    state.players[0]!.occupationPlayed.push(STUB_OBS_ID)
    session.loadState(state)
    const foodBefore = state.players[0]!.resources.food

    const resp = driveAccepts(session, session.takeAction(0, 'grain-seeds'))

    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 1)
  })

  it('observer fires exactly once on the jump destination', () => {
    const { session, state } = setup2P('A129_Swagman')
    registerObserverListener()
    state.players[0]!.occupationPlayed.push(STUB_OBS_ID)
    session.loadState(state)
    const foodBefore = state.players[0]!.resources.food

    const resp = driveAccepts(session, session.takeAction(0, 'farm-expansion'))

    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 1)
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
