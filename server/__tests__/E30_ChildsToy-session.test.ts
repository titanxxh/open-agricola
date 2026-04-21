import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount } from '../../shared/game/player'
import '../../shared/cards/E/E30_ChildsToy'
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
      if (resp.pending.type === 'harvestFeed') {
        resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
      } else if (resp.pending.type === 'animalReorg') {
        resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones)
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
      if (resp.pending.type === 'harvestFeed') {
        resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
      } else if (resp.pending.type === 'animalReorg') {
        resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones)
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
      if (resp.pending.type === 'harvestFeed') {
        resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
      } else if (resp.pending.type === 'animalReorg') {
        resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones)
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
})
