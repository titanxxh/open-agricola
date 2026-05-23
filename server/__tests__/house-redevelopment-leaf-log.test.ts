import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A55_JunkRoom'

/**
 * Regression: when a SEQ wraps multiple leaves (renovate-house + optional
 * improvement-any), the renovation `log.actionDetail` must be emitted as soon
 * as renovate-house finishes — i.e. visible in the log BEFORE the player is
 * prompted to skip/play an improvement. This was previously deferred until
 * the entire SEQ completed (or silently dropped due to a snapshot-clearing
 * timing bug).
 */
describe('house-redevelopment leaf-flush logging', () => {
  it('continues into optional improvement choice after auto-resolved renovation', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6
    const owner = state.players[0]!
    owner.houseType = 'wood'
    owner.rooms = 2
    owner.resources.wood = 1
    owner.resources.clay = 5
    owner.resources.reed = 5
    owner.resources.food = 5
    owner.minorHand = ['A55_JunkRoom']
    state.availableMajorImprovements = ['Major_Fireplace1']
    session.loadState(state)

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.options?.some((option) => option.value === '__skip__')).toBe(true)

    const playImprovement = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(playImprovement).toBeDefined()

    const resp2 = session.resolveChoice(0, playImprovement!.value)
    expect(resp2.ok).toBe(true)
    expect(resp2.interaction.stateId).toBe('wait')
    if (resp2.interaction.stateId !== 'wait') return

    expect(resp2.interaction.promptKey).toBe('ui.interactionChooseImprovement')
    expect(resp2.interaction.options?.map((option) => option.value)).toEqual(
      expect.arrayContaining(['major:Major_Fireplace1', 'minor:A55_JunkRoom']),
    )
  })

  it('emits log.actionDetail for renovate-house before improvement choice prompt', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6
    const owner = state.players[0]!
    owner.houseType = 'wood'
    owner.rooms = 2
    owner.resources.clay = 5
    owner.resources.reed = 5
    owner.resources.food = 5
    owner.minorHand = ['Minor_Loam']
    state.availableMajorImprovements = ['Major_Fireplace1']
    session.loadState(state)

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const renovateDetail = resp.state.log.find(
      (e) =>
        e.key === 'log.actionDetail' &&
        (e.params as { action?: string } | undefined)?.action ===
          'actions.renovate-house.name',
    )
    expect(renovateDetail).toBeDefined()
    const detailParts = (renovateDetail!.params as {
      detailParts?: {
        effects?: Record<string, unknown>
        costs?: Record<string, number>
      }
    }).detailParts!
    expect(detailParts.effects?.renovate).toEqual({ from: 'wood', to: 'clay' })
    expect(detailParts.costs ?? {}).toEqual({})

    const payDetail = resp.state.log.find(
      (e) =>
        e.key === 'log.actionDetail' &&
        (e.params as { action?: string } | undefined)?.action ===
          'actions.pay.name',
    )
    expect(payDetail).toBeDefined()
    const payDetailParts = (payDetail!.params as {
      detailParts?: {
        costs?: Record<string, number>
      }
    }).detailParts!
    expect(payDetailParts.costs?.clay).toBe(2)
    expect(payDetailParts.costs?.reed).toBe(1)
  })

  it('does not duplicate renovation in the wrapper actionDetail when improvement is skipped', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6
    const owner = state.players[0]!
    owner.houseType = 'wood'
    owner.rooms = 2
    owner.resources.clay = 5
    owner.resources.reed = 5
    session.loadState(state)

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const wrapperDetails = resp.state.log.filter(
      (e) =>
        e.key === 'log.actionDetail' &&
        (e.params as { action?: string } | undefined)?.action ===
          'actions.house-redevelopment.name',
    )
    expect(wrapperDetails).toEqual([])
  })
})
