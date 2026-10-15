import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import type { GameSession } from '../game/authoritative-session'
import '../../shared/cards/A/A081_InterimStorage'
import '../../shared/cards/C/C051_FishingNet'
import '../../shared/cards/D/D074_RoyalWood'
import '../../shared/cards/D/D134_OysterEater'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('activated plans describe and execute the same obligations', () => {
  it('lists only the next release of currently stored goods, then transfers them exactly once at maturity', () => {
    const session = createWorkSession({ seed: 6081, configure: state => {
      state.round = 6
      state.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(state, player) })
      const owner = state.players[0]!
      owner.minorPlayed = ['A081_InterimStorage']
      owner.resources.wood = 0
      owner.resources.clay = 0
      owner.cardStates.A081_InterimStorage = { counters: { wood: 2, clay: 1 } }
    } })
    sessions.push(session)
    const before = JSON.stringify(session.state)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))).toEqual([{
      round: 7, sourceCard: 'A081_InterimStorage', timing: 'onRoundStart', count: 1,
      description: { kind: 'action', showLabel: false, labelKey: 'actions.special-effect.name', effectPreview: {
        kind: 'ruleOperation', operation: { kind: 'take-stored-resources', resources: { wood: 2, clay: 1, reed: 0 }, takeAll: true },
      } },
    }])
    expect(JSON.stringify(session.state)).toBe(before)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 1 })
    expect(response.state.players[0]!.cardStates.A081_InterimStorage?.counters).toMatchObject({ wood: 0, clay: 0 })
    expect(response.state.events.filter(event => event.type === 'card.stackChanged' && event.cardId === 'A081_InterimStorage')).toHaveLength(2)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))).toEqual([])
    expect(response.interaction.stateId).toBe('idle')
  })
  it('keeps action-space deposits separate from player gains and hides internal refund and skip-state keys', () => {
    const session = createWorkSession({ seed: 6051, configure: state => {
      state.round = 5
      state.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(state, player) })
      const owner = state.players[0]!
      owner.minorPlayed = ['C051_FishingNet', 'D074_RoyalWood']
      owner.occupationPlayed = ['D134_OysterEater']
      owner.cardStates.C051_FishingNet = { extraData: { pendingDeposits: 1, depositEpisode: 1 } }
      owner.cardStates.D074_RoyalWood = { extraData: { woodSpent: 5 } }
      owner.cardStates.D134_OysterEater = { extraData: { skipNextPlacement: 2, skipRound: 5 } }
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 0
    } })
    sessions.push(session)
    const before = JSON.stringify(session.state)
    const views = session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))
    expect(views.find(entry => entry.sourceCard === 'C051_FishingNet')?.description).toMatchObject({ effectPreview: { kind: 'ruleOperation', operation: { kind: 'put-on-action-space', spaceId: 'fishing', spaceNameKey: 'actions.fishing.name', resources: { food: 2 } } } })
    expect(views.find(entry => entry.sourceCard === 'D074_RoyalWood')?.description).toMatchObject({ effectPreview: { kind: 'ruleOperation', operation: { resource: 'wood', paidAmount: 5, amount: 2, divisor: 2 } } })
    expect(views.find(entry => entry.sourceCard === 'D134_OysterEater')?.description).toMatchObject({ effectPreview: { kind: 'ruleOperation', operation: { kind: 'skip-next-turns', count: 2 } } })
    expect(JSON.stringify(views)).not.toMatch(/woodSpent|skipNextPlacement|countFact/)
    expect(JSON.stringify(session.state)).toBe(before)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(30)
    expect(response.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food).toBe(3)
    expect(response.state.players[0]!.cardStates.C051_FishingNet?.extraData?.pendingDeposits).toBe(0)
    expect(response.interaction.stateId).toBe('idle')
  })
})
