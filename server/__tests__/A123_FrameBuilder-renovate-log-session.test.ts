import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'

import '../../shared/cards/A/A123_FrameBuilder'

const CARD_ID = 'A123_FrameBuilder'

describe('A123_FrameBuilder renovation action log attribution', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.houseType = 'wood'
    owner.rooms = 2
    // Base cost for wood→clay with 2 rooms is 2 clay + 1 reed. Give the player
    // no clay, just enough wood + reed so the ONLY affordable solution goes
    // through FrameBuilder's bonus (−2 clay / +1 wood).
    owner.resources = {
      ...owner.resources,
      wood: 1,
      clay: 0,
      stone: 0,
      reed: 1,
    }
    setWorkersAtHome(state, owner, 2)

    session.loadState(state)
    return session
  }

  it('attributes renovate-house log to FrameBuilder when its bonus path is taken', () => {
    const session = setup()

    // Take house-redevelopment (wraps renovate-house + optional improvement).
    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    // Walk through any choice prompts until the flow finishes or asks for the
    // optional improvement step.
    let guard = 8
    while (guard-- > 0 && resp.interaction.stateId === 'wait') {
      const promptKey = resp.interaction.promptKey
      if (promptKey === 'ui.interactionChooseRenovationTarget') {
        resp = session.resolveChoice(0, 'clay')
        continue
      }
      // Skip the optional improvement-any leaf if we're prompted for it.
      const skip = resp.interaction.options?.find(
        (opt) => opt.value === '__skip__' || opt.value === 'skip',
      )
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
        continue
      }
      break
    }

    expect(resp.ok).toBe(true)

    const renovateLog = resp.state.log.find((entry) => {
      if (entry.key !== 'log.actionDetail') return false
      const action = entry.params?.action
      return typeof action === 'string' && action.includes('renovate-house')
    })
    expect(renovateLog).toBeDefined()
    const detailParts = renovateLog!.params?.detailParts as
      | { bonusSources?: string[]; effects?: { renovate?: { from: string; to: string } } }
      | undefined
    expect(detailParts).toBeDefined()
    expect(detailParts!.effects?.renovate).toEqual({ from: 'wood', to: 'clay' })
    expect(detailParts!.bonusSources).toEqual([CARD_ID])

    // After the action finalizes, the scratchpad must be cleared so it
    // doesn't leak into subsequent actions.
    expect(resp.state.players[0]!._activeActionBonusSources).toBeUndefined()
  })

  it('does NOT attribute renovate-house log when paying directly (no bonus used)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.houseType = 'wood'
    owner.rooms = 2
    // Plenty of clay so direct payment is chosen over FrameBuilder's bonus.
    owner.resources = {
      ...owner.resources,
      wood: 0,
      clay: 5,
      stone: 0,
      reed: 1,
    }
    setWorkersAtHome(state, owner, 2)
    session.loadState(state)

    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    let guard = 8
    while (guard-- > 0 && resp.interaction.stateId === 'wait') {
      const promptKey = resp.interaction.promptKey
      if (promptKey === 'ui.interactionChooseRenovationTarget') {
        resp = session.resolveChoice(0, 'clay')
        continue
      }
      const skip = resp.interaction.options?.find(
        (opt) => opt.value === '__skip__' || opt.value === 'skip',
      )
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
        continue
      }
      break
    }

    const renovateLog = resp.state.log.find((entry) => {
      if (entry.key !== 'log.actionDetail') return false
      const action = entry.params?.action
      return typeof action === 'string' && action.includes('renovate-house')
    })
    expect(renovateLog).toBeDefined()
    const detailParts = renovateLog!.params?.detailParts as
      | { bonusSources?: string[] }
      | undefined
    expect(detailParts?.bonusSources).toBeUndefined()
  })
})
