import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/D/D079_CarrotMuseum'
import '../../shared/cards/B/B068_Beanfield'

const CARD_ID = 'D079_CarrotMuseum'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('deferred rule quantities', () => {
  it('counts an actual Card Field at the due round without including its crops in supply', () => {
    const session = createWorkSession({ seed: 6079, configure: state => {
      state.round = 8
      const player = state.players[0]!
      player.minorPlayed = [CARD_ID, 'B068_Beanfield']
      player.cardStates.B068_Beanfield = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } }
      Object.assign(player.resources, { wood: 0, stone: 0, vegetable: 3 })
      state.players.forEach(owner => { owner.resources.food = 20; markAllWorkersUsed(state, owner) })
    } })
    sessions.push(session)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, wood: 3, vegetable: 3 })
    expect(response.state.players[0]!.cardStates.B068_Beanfield?.extraData?.cardFieldStacks).toEqual([{ crop: 'vegetable', remaining: 2 }])
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.moved', sourceCardId: CARD_ID, resources: { stone: 1, wood: 3 } }))
    expect(response.scores?.[0]).toBeDefined()
  })
  it('Carrot Museum declares formulas and evaluates the changed farm at each real due phase', () => {
    const session = createWorkSession({ seed: 6079, configure: state => {
      state.round = 8
      state.players.forEach(player => { player.resources.food = 20 })
      const player = state.players[0]!
      Object.assign(player.resources, { wood: 1, clay: 2, stone: 0, vegetable: 1 })
      player.minorHand = [CARD_ID]
    } })
    sessions.push(session)
    let response = session.takeAction(0, 'meeting-place')
    if (!response.state.players[0]!.minorPlayed.includes(CARD_ID) && response.interaction.stateId === 'wait') {
      const accept = response.interaction.request.options?.find(option => option.value !== '__skip__')
      if (accept) response = session.resolveChoice(0, accept.value)
    }
    if (!response.state.players[0]!.minorPlayed.includes(CARD_ID)) response = session.resolveChoice(0, CARD_ID)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, stone: 0 })
    const previews = session.buildSyncPayload(response, null).state.players[0]!.scheduledEffects
    expect(previews.map(entry => entry.round)).toEqual([8, 10, 12])
    expect(previews[0]).toMatchObject({ timing: 'onAfterRoundEnd', description: { effectPreview: { kind: 'formulaGain', resources: {
      stone: { kind: 'fields', crop: 'vegetable' }, wood: { kind: 'supply', resource: 'vegetable' },
    } } } })
    for (const [round, vegetables, fields, wood, stone] of [[8, 3, 2, 3, 2], [10, 1, 0, 4, 2], [12, 2, 1, 6, 3]]) {
      const state = session.getState().state
      state.round = round!
      state.players.forEach(player => markAllWorkersUsed(state, player))
      const player = state.players[0]!
      player.resources.vegetable = vegetables!
      player.fields = Array.from({ length: fields! }, (_, index) => ({ row: index, col: 2, stacks: [{ kind: 'vegetable' as const, remaining: 2 }] }))
      session.loadState(state)
      response = session.performRoundEnd()
      expect(response.ok).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood, stone })
      expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toBe(true)
      expect(response.scores?.[0]).toBeDefined()
    }
    expect(session.buildSyncPayload(response, null).state.players[0]!.scheduledEffects).toEqual([])
  })
})
