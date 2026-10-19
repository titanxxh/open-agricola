import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { chooseSupplyWorkerTurn } from './_helpers/supply-worker-turn'
import type { GameSession } from '../game/authoritative-session'
import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import { serializeStateForPlayer } from '../../shared/session/serialization'
import { reserveSupplyWorker } from '../../shared/domain/supply-workers'
import { familySize, markAllWorkersUsed, setWorkersAtHome, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/M/M053_ForestHut'
import '../../shared/cards/A/A081_InterimStorage'
import '../../shared/cards/A/A127_Lodger'
import '../../shared/cards/B/B023_FinalScenario'
import '../../shared/cards/E/E028_Bookmark'
import '../../shared/cards/E/E140_Carter'

const M053 = 'M053_ForestHut'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const tracked = (session: GameSession) => { sessions.push(session); return session }

describe('complete activated schedule collection through fresh two-player sessions', () => {
  it('shows no date for a forest-bound worker, then the actual unlocked offer and return obligation', () => {
    const session = tracked(createWorkSession({ seed: 8053, options: {
      enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, configure: state => {
      state.round = 5
      state.players.forEach(player => { player.resources.food = 30; player.resources.fuel = 30; setWorkersAtHome(state, player, 2) })
      const owner = state.players[0]!
      owner.minorPlayed = [M053]
      owner.farmTerrain = [{ row: 0, col: 0, kind: 'forest' }]
      const worker = reserveSupplyWorker(owner, M053)!
      owner.cardStates[M053] = { extraData: { temporaryWorkerId: worker.id, boundForest: { row: 0, col: 0 }, boundForestDepth: 1 } }
    } }))
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))).toEqual([])
    const special = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('fell-trees'))!
    const removed = session.takeSpecialAction(0, special.id, 'fell-trees', { tile: { row: 0, col: 0 } })
    expect(removed.ok, removed.error).toBe(true)
    const before = JSON.stringify(session.state)
    const planned = session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))
    expect(planned.map(entry => entry.timing).sort()).toEqual(['afterBeforeReturnHomeHooks', 'contributeExtraTurn'])
    expect(JSON.stringify(planned)).not.toMatch(/temporaryWorkerId|boundForest|set-flag/)
    expect(JSON.stringify(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)))).toBe(JSON.stringify(planned))
    expect(JSON.stringify(session.state)).toBe(before)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    chooseSupplyWorkerTurn(session, M053)
    const placed = session.resolveChoice(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    expect(familySize(placed.state.players[0]!)).toBe(2)
    expect(placed.state.players[0]!.workers.find(worker => worker.supplyUse?.sourceCard === M053)?.supplyUse).toMatchObject({ status: 'temporary', returnRound: 5 })
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)).map(entry => entry.timing)).toEqual(['afterBeforeReturnHomeHooks'])
    const ending = session.getState().state
    ending.players.forEach(player => markAllWorkersUsed(ending, player))
    session.loadState(ending)
    const returned = session.performRoundEnd()
    expect(returned.ok, returned.error).toBe(true)
    expect(returned.state.round).toBe(6)
    expect(returned.state.players[0]!.workers.some(worker => worker.supplyUse?.sourceCard === M053)).toBe(false)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))).toEqual([])
    expect(returned.state.events.some(event => event.type === 'worker.returned' && event.to === 'supply')).toBe(true)
  })
  it('retains original-owner stored obligations, exposes a bounded window formula, and keeps hidden hand identities out of action plans', () => {
    const session = tracked(createWorkSession({ seed: 8081, configure: state => {
      state.round = 6
      state.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(state, player) })
      const owner = state.players[0]!
      owner.cardStates.A081_InterimStorage = { counters: { wood: 2 } }
      owner.occupationPlayed = ['E140_Carter']
      owner.cardStates.E140_Carter = { extraData: { triggerRound: 7 } }
      owner.minorPlayed = ['E028_Bookmark']
      owner.cardStates.E028_Bookmark = { extraData: { triggerRound: 9 } }
      owner.occupationHand = ['__private_occupation__']
      state.players[1]!.minorHand = ['A081_InterimStorage']
    } }))
    const before = JSON.stringify(session.state)
    const owner = session.state.players[0]!
    const plans = session.withCtx(() => collectScheduledEffectPreviews(session.state, owner, session.actionHooks))
    expect(plans.map(plan => [plan.sourceCard, plan.round, plan.timing])).toEqual([
      ['A081_InterimStorage', 7, 'onRoundStart'], ['E140_Carter', 7, 'afterCollect'], ['E028_Bookmark', 9, 'onRoundStart'],
    ])
    expect(plans[1]?.description).toMatchObject({ effectPreview: { kind: 'ruleOperation', operation: { kind: 'gain-per-building-resource-collected', resource: 'food', perBuildingResource: 1 } } })
    const spectator = session.withCtx(() => serializeStateForPlayer(session.state, null, { actionHooks: session.actionHooks }))
    expect(spectator.players[0]!.scheduledEffects).toEqual(plans)
    expect(JSON.stringify(spectator.players[0]!.scheduledEffects)).not.toContain('__private_occupation__')
    expect(JSON.stringify(session.state)).toBe(before)
    const matured = session.performRoundEnd()
    expect(matured.ok, matured.error).toBe(true)
    expect(matured.state.players[0]!.resources.wood).toBe(2)
    expect(matured.state.players[1]!.resources.wood).toBe(0)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)).some(plan => plan.sourceCard === 'A081_InterimStorage')).toBe(false)
  })
  it('projects temporary room expiry without its private state key and executes the same expiry', () => {
    const session = tracked(createWorkSession({ seed: 8127, configure: state => {
      state.round = 9
      const owner = state.players[0]!
      owner.occupationPlayed = ['A127_Lodger']
      owner.cardStates.A127_Lodger = { extraData: { hasRoom: true } }
      setActiveWorkerCount(owner, 3)
      state.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(state, player) })
    } }))
    const plan = session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))[0]
    expect(plan?.description).toEqual({ kind: 'conditional', condition: { kind: 'extra-room-active', fact: 'hasRoom' }, body: {
      kind: 'action', showLabel: false, labelKey: 'actions.special-effect.name', effectPreview: {
        kind: 'ruleOperation', operation: { kind: 'expire-extra-room', removeUnhousedWorker: true },
      },
    } })
    const ending = session.performRoundEnd()
    expect(ending.ok, ending.error).toBe(true)
    expect(familySize(ending.state.players[0]!)).toBe(2)
    expect(ending.state.players[0]!.cardStates.A127_Lodger?.extraData?.hasRoom).toBe(false)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))).toEqual([])
  })
  it('uses the exclusive action-space expiry actual onRoundStart stage', () => {
    const session = tracked(createWorkSession({ seed: 8023, configure: state => {
      state.round = 13
      state.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(state, player) })
      const owner = state.players[0]!
      owner.minorPlayed = ['B023_FinalScenario']
      const space = state.actionSpaces[0]!
      space.exclusiveUse = { playerId: owner.id, sourceCardId: 'B023_FinalScenario', untilRound: 14 }
    } }))
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))[0]).toMatchObject({ round: 14, timing: 'onRoundStart' })
    const ending = session.performRoundEnd()
    expect(ending.ok, ending.error).toBe(true)
    expect(ending.state.round).toBe(14)
    expect(ending.state.actionSpaces[0]!.exclusiveUse).toBeUndefined()
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))).toEqual([])
  })
})
