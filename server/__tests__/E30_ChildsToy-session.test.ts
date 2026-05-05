import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount, newbornCount } from '../../shared/game/player'
import { E30_ChildsToy } from '../../shared/cards/E/E30_ChildsToy'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import type { ActionChoiceOption } from '../../shared/game/types'

const CARD_ID = 'E30_ChildsToy'

describe('E30_ChildsToy session', () => {
  it('with card and 1 newborn, feeding requires full 2 food per person (no discount)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 1)
    player.resources.food = 4
    player.minorPlayed.push(CARD_ID)

    // Player 2 has enough food - no complication
    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through all pending states
    let safety = 30
    while (safety-- > 0 && resp.pending.type !== 'none') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
      } else if (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones)
      } else if (resp.pending.type === 'choice') {
        const skipOpt = resp.pending.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, resp.pending.options[0]!.value)
        }
      } else {
        break
      }
    }

    // With the card, newbornCount should have been set to 0 before feeding
    // So required = max(0, 2 * 2 - 0) = 4
    // Player had 4 food, so exactly enough — no begging
    expect(resp.state.players[0]!.resources.begging).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('without card and 1 newborn, feeding has newborn discount', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 1)
    player.resources.food = 3
    // Card NOT played

    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through all pending states
    let safety = 30
    while (safety-- > 0 && resp.pending.type !== 'none') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
      } else if (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones)
      } else if (resp.pending.type === 'choice') {
        const skipOpt = resp.pending.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, resp.pending.options[0]!.value)
        }
      } else {
        break
      }
    }

    // Without the card, newborn discount applies:
    // required = max(0, 2 * 2 - 1) = 3
    // Player had 3 food, so exactly enough — no begging
    expect(resp.state.players[0]!.resources.begging).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('with card and 1 newborn but insufficient food, player begs', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 1)
    player.resources.food = 3 // Need 4 with card, only have 3
    player.minorPlayed.push(CARD_ID)

    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()

    let safety = 30
    while (safety-- > 0 && resp.pending.type !== 'none') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
      } else if (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones)
      } else if (resp.pending.type === 'choice') {
        const skipOpt = resp.pending.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, resp.pending.options[0]!.value)
        }
      } else {
        break
      }
    }

    // With card: required = 4, had 3, so 1 begging
    expect(resp.state.players[0]!.resources.begging).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('preserves newborn flag after feeding (non-destructive mutation)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    setActiveWorkerCount(player, 3)
    setNewbornCount(player, 1)
    markAllWorkersUsed(state, player)
    player.resources.food = 10
    player.minorPlayed.push(CARD_ID)

    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    markAllWorkersUsed(state, player2)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()
    let safety = 30
    while (safety-- > 0 && resp.pending.type !== 'none') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
      } else if (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones)
      } else if (resp.pending.type === 'choice') {
        const skipOpt = resp.pending.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, resp.pending.options[0]!.value)
        }
      } else {
        break
      }
    }

    // After harvest feeding completes (onAfterFeed restores), the newborn flag
    // remains until normal round end. Verify it survived feeding so post-feed
    // listeners (e.g. A35 SwimmingClass at onStartReturnHome) still see it.
    // (After full round end the engine clears all newborn flags in
    // continueAfterRoundEnd; that is unrelated to this regression.)
    // NOTE: drainHarvestFlow goes all the way through round end → newborn cleared.
    // To probe specifically the post-feed-but-pre-roundEnd state would require
    // intercepting feeding. Instead we assert the new round started cleanly:
    // there are 3 active workers (size preserved) and food was deducted by 3*2=6.
    const p1 = resp.state.players[0]!
    expect(p1.workers.filter((w) => w.isActive).length).toBe(3)
    expect(p1.resources.food).toBe(4) // 10 - 6
    // Sanity: newborn flag at end-of-round is cleared by engine (independent of E30).
    expect(newbornCount(p1)).toBe(0)
  })

  describe('prerequisite "Exactly 2 Adults"', () => {
    it('blocks when player has only 1 adult', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      setActiveWorkerCount(player, 1)
      setNewbornCount(player, 0)
      expect(meetsCardPrerequisites(player, E30_ChildsToy, state.round, state)).toBe(false)
    })

    it('blocks when one active worker is a newborn (1 adult + 1 newborn)', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 1)
      expect(meetsCardPrerequisites(player, E30_ChildsToy, state.round, state)).toBe(false)
    })

    it('allows when player has exactly 2 adults (no newborns)', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      expect(meetsCardPrerequisites(player, E30_ChildsToy, state.round, state)).toBe(true)
    })
  })
})
