import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const STEAM = 'C025_SteamMachine'
const COLLECT_REACTION = 'TEST_CollectReaction'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const options = (r: SessionResponse) => r.interaction.stateId === 'wait' ? r.interaction.request.options ?? [] : []
function choose(session: GameSession, r: SessionResponse, value: string) {
  expect(options(r).some(o => o.value === value && !o.disabled), JSON.stringify(r.interaction)).toBe(true)
  if (r.interaction.stateId !== 'wait') throw new Error('Expected choice')
  const next = session.resolveChoice(r.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function collectReaction(session: GameSession) {
  session.withCtx(() => requireActiveCardRegistry('space-use-lifecycle-test').registerListener({
    id: 'test-collect-reaction', cardIds: [COLLECT_REACTION], actions: ['collect'], phases: ['after'],
    handler: () => ({ sourceCard: COLLECT_REACTION, flow: {
      type: 'leaf', actionId: 'gain', sourceCard: COLLECT_REACTION, params: { food: 1 }, optional: true,
    } }),
  }))
}

describe('complete action-space use reactions', () => {
  it.each([
    { card: 'A124_Knapper', round: 5, from: 'clay', to: 'stone', stone: 1, clay: 0 },
    { card: 'B120_Sweep', round: 8, from: 'wood', to: 'clay', stone: 0, clay: 0 },
  ] as const)('$card pays the current renovation with its before reward, including undo and exact retry', scenario => {
    const session = createWorkSession({ configure: state => {
      state.round = scenario.round
      state.roundActionOrder[4] = 'house-redevelopment'
      const p = state.players[0]!
      p.occupationPlayed = [scenario.card]
      p.houseType = scenario.from
      Object.assign(p.resources, { stone: scenario.stone, clay: scenario.clay, reed: 1, food: 0 })
    } })
    sessions.push(session)
    const use = () => {
      let r = session.takeAction(0, 'house-redevelopment')
      expect(r.ok, r.error).toBe(true)
      for (let step = 0; step < 8 && r.interaction.stateId === 'wait'; step++) {
        const skip = options(r).find(o => o.value === '__skip__')
        if (!skip) break
        r = choose(session, r, skip.value)
      }
      expect(r.state.players[0]!.houseType, JSON.stringify(r.interaction)).toBe(scenario.to)
      expect(r.state.players[0]!.resources).toMatchObject({ stone: 0, clay: 0, reed: 0 })
      const events = r.state.events
      const gain = events.findIndex(e => e.type === 'resource.moved' && e.sourceCardId === scenario.card)
      const pay = events.findIndex(e => e.type === 'resource.paid' && e.paymentFor === 'renovation')
      expect(gain).toBeGreaterThanOrEqual(0)
      expect(pay).toBeGreaterThan(gain)
      expect(events.filter(e => e.type === 'card.triggered' && e.sourceCardId === scenario.card)).toHaveLength(1)
      expect(r.state.log.length).toBeGreaterThan(0)
      expect(r.scores).toHaveLength(2)
    }
    use()
    expect(session.undoAction().ok).toBe(true)
    expect(session.getState().state.players[0]!.houseType).toBe(scenario.from)
    expect(session.getState().state.players[0]!.resources).toMatchObject({ stone: scenario.stone, clay: scenario.clay, reed: 1 })
    use()
  })

  it('finishes a collecting reaction before offering Steam Machine baking once across JSON restore', () => {
    let session = createWorkSession({ configure: state => {
      const p = state.players[0]!
      state.actionSpaces.find(s => s.id === 'grain-seeds')!.takenBy = [{ playerId: p.id, workerId: p.workers[1]!.id }]
      p.minorPlayed = [STEAM, COLLECT_REACTION]
      p.improvements = ['Major_Fireplace1']
      Object.assign(p.resources, { grain: 1, food: 0 })
      state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 1
    } })
    sessions.push(session)
    collectReaction(session)
    let r = session.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).toBe(COLLECT_REACTION)
    expect(r.state.events.filter(e => e.type === 'card.triggered' && e.sourceCardId === STEAM)).toHaveLength(0)
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(session)
    collectReaction(session)
    r = choose(session, session.getState(), options(session.getState()).find(o => o.value !== '__skip__')!.value)
    expect(r.state.players[0]!.resources.food).toBe(1)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard, JSON.stringify(r.interaction)).toBe(STEAM)
    r = choose(session, r, options(r).find(o => o.value !== '__skip__')!.value)
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      r = choose(session, r, 'Major_Fireplace1')
    }
    expect(r.state.players[0]!.resources).toMatchObject({ grain: 0, food: 3, wood: 1 })
    expect(r.state.events.filter(e => e.type === 'card.triggered' && e.sourceCardId === STEAM && 'triggerActionId' in e)).toHaveLength(1)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe(STEAM)
  })
})
