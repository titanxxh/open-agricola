import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { C122_Bricklayer } from '../../shared/cards/C/C122_Bricklayer'
import type { PlayerState } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'C122_Bricklayer'

describe('payment stats: bonus saved attribution (session)', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.houseType = 'wood'
    owner.rooms = 2
    // wood→clay renovation base cost is rooms*1 clay + 1 reed = 2 clay + 1 reed.
    // C122 Bricklayer's `renovation` BonusModifier is { discount: { clay: 1 } },
    // so the only affordable solution should use the bonus to pay just 1 clay.
    owner.resources = {
      ...owner.resources,
      wood: 0,
      clay: 1,
      stone: 0,
      reed: 1,
      grain: 0,
      vegetable: 0,
    }
    owner.activeModifiers = [
      ...(C122_Bricklayer.impl.modifiers ?? []),
    ]
    setWorkersAtHome(state, owner, 2)

    session.loadState(state)
    return session
  }

  const walkRenovate = (session: GameSession) => {
    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    let guard = 8
    while (guard-- > 0 && resp.interaction.stateId === 'wait') {
      const promptKey = resp.interaction.promptKey
      if (promptKey === 'ui.interactionChooseRenovationTarget') {
        resp = session.resolveChoice(0, 'clay')
        continue
      }
      const skip = resp.interaction.request.options?.find(
        (opt) => opt.value === '__skip__' || opt.value === 'skip',
      )
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
        continue
      }
      break
    }
    return resp
  }

  it("attributes saved.clay to C122_Bricklayer when its renovation bonus is taken", () => {
    const session = setup()
    const resp = walkRenovate(session)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Renovation must have happened.
    expect(player.houseType).toBe('clay')
    // The 1-clay discount means we paid only 1 clay (not 2) and 1 reed.
    expect(player.resources.clay).toBe(0)
    expect(player.resources.reed).toBe(0)

    const stats = readCardResourceStats(player, CARD_ID)
    expect(stats).toBeDefined()
    // Without this fix the bonus reduction was never written to `saved`.
    expect(stats!.saved).toEqual({ clay: 1 })
  })

  it('does NOT credit a different cost-type modifier even when its cardId appears in activeModifiers', () => {
    // C122_Bricklayer registers TWO BonusModifiers (construct -2 clay,
    // renovation -1 clay). When the player renovates we must only credit the
    // renovation one (-1 clay). Without filtering by appliesTo, the bug would
    // double-count and report saved.clay = 3.
    const session = setup()
    const resp = walkRenovate(session)
    expect(resp.ok).toBe(true)
    const stats = readCardResourceStats(resp.state.players[0]!, CARD_ID)
    expect(stats!.saved).toEqual({ clay: 1 })
    // Explicit guard against the regression: must NOT include construct's 2 clay.
    expect(stats!.saved.clay).not.toBe(3)
  })
})
