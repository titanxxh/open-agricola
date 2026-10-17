import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/D/D129_LumberVirtuoso'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { SessionResponse } from '../../shared/session/session-core'
import type { GameState } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

describe('D129_LumberVirtuoso session', () => {
  /**
   * Setup: 2-player game at a harvest round. All workers used so performRoundEnd
   * triggers the harvest flow.
   */
  const setup = (options?: {
    wood?: number
    houseType?: 'wood' | 'clay' | 'stone'
    round?: number
    food?: number
  }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = options?.round ?? 4 // round 4 is a harvest round
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = options?.food ?? 10
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D129_LumberVirtuoso')
    player.houseType = options?.houseType ?? 'wood'
    player.resources.wood = options?.wood ?? 8

    session.loadState(state)
    return session
  }

  it('presents optional choice during harvest when wood >= 5', () => {
    const session = setup({ wood: 8 })
    const resp = session.performRoundEnd()
    // onStartHarvest returns an optional flow → choice pending
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Should have __skip__ option (optional) and real options
    const skipOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
    expect(skipOption).toBeDefined()
  })

  it('can skip the optional flow and continue harvest normally', () => {
    const session = setup({ wood: 8 })
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Skip the optional choice
    resp = session.resolveChoice(0, '__skip__')
    // Harvest continues: eventually reaches feeding or completes
    // Wood should remain unchanged
    const finalState = drainHarvest(session, resp)
    expect(finalState.players[0]!.resources.wood).toBe(8)
  })

  it('NOT triggered when wood < 5', () => {
    const session = setup({ wood: 4 })
    const resp = session.performRoundEnd()
    // With wood < 5, no optional flow from the card — harvest proceeds normally
    // (feeding or none)
    expect(resp.interaction.stateId).toBe('idle')
  })

  it('NOT triggered in non-harvest round', () => {
    const session = setup({ wood: 8, round: 3 })
    const resp = session.performRoundEnd()
    // Round 3 is not a harvest round — goes to next round
    expect(resp.state.round).toBe(4)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.wood).toBe(8)
  })

  it('choosing stables: discards excess wood, then prompts stable placement', () => {
    const session = setup({ wood: 8, houseType: 'wood' })
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // One-step XOR: stables / construct / skip
    const xorOptions = resp.interaction.request.options?.filter((o: ActionChoiceOption) => o.value !== '__skip__') ?? []
    expect(xorOptions.length).toBe(2)

    // Choose first option (stables)
    resp = session.resolveChoice(0, xorOptions[0]!.value)

    // After paying excess wood (8 - 5 = 3 wood paid), wood should be 5
    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(5)

    // Now the stables action should be prompting farm interaction
    expect(resp.interaction.stateId).toBe('wait')
  })

  it('choosing construct (wood rooms): discards excess wood, then prompts room placement', () => {
    const session = setup({ wood: 8, houseType: 'wood' })
    // Give player enough reed to afford a wood room (cost: 5 wood + 2 reed)
    const state = session.getState().state
    state.players[0]!.resources.reed = 5
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const xorOptions = resp.interaction.request.options?.filter((o: ActionChoiceOption) => o.value !== '__skip__') ?? []
    expect(xorOptions.length).toBe(2)

    // Choose second option (construct)
    resp = session.resolveChoice(0, xorOptions[1]!.value)

    // After paying excess wood, wood should be 5
    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(5)

    // Now the construct action should be prompting farm interaction
    expect(resp.interaction.stateId).toBe('wait')
  })

  it('with exactly 5 wood, no excess to pay — still offers action', () => {
    const session = setup({ wood: 5 })
    const resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Should present the optional choice
    const activateOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(activateOption).toBeDefined()
  })

  it('clay house: only stables option (no construct for non-wood house)', () => {
    const session = setup({ wood: 8, houseType: 'clay' })
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Activate the optional flow
    const activateOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(activateOption).toBeDefined()
    resp = session.resolveChoice(0, activateOption!.value)

    // With clay house, only stables is available — the seq flow runs directly
    // (no XOR needed, the card returns seq with optional: true which wraps pay + stables)
    // After paying excess wood (8 - 5 = 3), wood = 5
    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(5)
  })
})

/**
 * Helper: drain through remaining harvest phases (feeding, breeding, etc.)
 * to reach the end of the round. Returns the final response state.
 */
function drainHarvest(session: GameSession, resp: SessionResponse): SessionResponse | GameState {
  let current = resp
  let safety = 50
  while (safety-- > 0) {
    if (current.interaction.stateId !== 'wait') return current.state
    if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'feed') {
      current = session.resolveChoice(current.interaction.playerIndex, 'confirm', { selections: [] })
    } else if (current.interaction.stateId === 'wait' && current.interaction.stateId === 'wait' ? current.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      current = session.resolveChoice(
        current.interaction.playerIndex, 'confirm',
        current.interaction.request.zones,
      )
    } else if (current.interaction.stateId === 'wait') {
      // Skip any remaining choices
      const skipOpt = current.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
      if (skipOpt) {
        current = session.resolveChoice(current.interaction.playerIndex ?? 0, '__skip__')
      } else {
        current = session.resolveChoice(
          current.interaction.playerIndex ?? 0,
          current.interaction.request.options[0]!.value,
        )
      }
    } else {
      break
    }
  }
  return current.state
}

describe('ae-negative-51-family', () => {
  const { sessions, ok, options, save, setup, choose, finish, completeRound, build, offer } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D129 N1 real harvest discards excess wood to five before ordinary paid stable or wood room', () => {
    for (const mode of ['stable-five', 'stable-eight', 'room']) {
      const s = setup('D129_LumberVirtuoso', 4, state => Object.assign(state.players[0]!.resources, { wood: mode === 'stable-five' ? 5 : 8, reed: 2 }))
      let r = offer(s, completeRound(s), 'D129_LumberVirtuoso')
      r = choose(s, r, o => mode === 'room' ? o.labelKey === 'actions.construct.name' || JSON.stringify(o.descriptionPreview).includes('actions.construct.name') : o.labelKey === 'actions.stables.name' || JSON.stringify(o.descriptionPreview).includes('actions.stables.name'))
      if (mode === 'room')
        r = build(s, r)
      else {
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
        r = ok(s.commitSelectionChoice(0, { stables: [r.interaction.request.farm.selectableTiles[0]!] }))
      }
      r = finish(s, r)
      assert.equal(r.state.players[0]!.resources.wood, mode === 'room' ? 0 : 3)
      assert.equal(r.state.players[0]!.resources.reed, mode === 'room' ? 0 : 2)
      assert.equal(r.state.players[0]!.rooms, mode === 'room' ? 3 : 2)
      assert.equal(r.state.players[0]!.stableTiles.length, mode === 'room' ? 0 : 1)
      save(`D129-N1-${mode}`, r)
    }
  })
  it('D129 N2 four wood optional decline and nonwood-house room exclusion preserve resources', () => {
    for (const mode of ['short', 'decline', 'clay']) {
      const s = setup('D129_LumberVirtuoso', 4, state => {
        Object.assign(state.players[0]!.resources, { wood: mode === 'short' ? 4 : 8, reed: 2 })
        if (mode === 'clay')
          state.players[0]!.houseType = 'clay'
      })
      let r = completeRound(s)
      if (mode === 'clay') {
        r = offer(s, r, 'D129_LumberVirtuoso')
        assert.ok(!options(r).some(o => o.labelKey === 'actions.construct.name'))
      }
      r = finish(s, r)
      assert.equal(r.state.players[0]!.resources.wood, mode === 'short' ? 4 : 8)
      assert.equal(r.state.players[0]!.rooms, 2)
      assert.equal(r.state.players[0]!.stableTiles.length, 0)
      save(`D129-N2-${mode}`, r)
    }
  })
})
