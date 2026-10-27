import { describe, expect, it } from 'vitest'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { work, buyMinor, openMinor, restore } from './_helpers/standard-solo-cards'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, getChoiceOptions, undoRuleSnapshot } from './_helpers/session-assertions'
import { readPublicCardMarkers } from '../../shared/cards/helpers/public-card-markers'

const CARD = 'M027_GardenPath'
const evidence = createScenarioEvidence(import.meta.url)
const make = (playerCount: number, clay = 1, forest = true) => evidence.track(work({ playerCount, seed: 6027, configure(state) {
  for (const player of state.players) {
    Object.assign(player.resources, { food: 0, fuel: 0, clay })
    if (!forest) player.farmTerrain = player.farmTerrain?.filter(tile => tile.kind !== 'forest')
  }
  state.players[0]!.minorHand = [CARD]
} }))

describe('Garden Path adopted solo interpretation', () => {
  it('pays clay, grants wood once and removes the solo card without a self marker', () => {
    const original = make(1)
    const before = undoRuleSnapshot(original.getState())
    const scores = original.getState().scores
    const bought = buyMinor(original, CARD)
    expect(bought.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 3 })
    expect(bought.state.players[0]!.minorHand).toEqual([])
    expect(bought.state.players[0]!.minorPlayed).toEqual([])
    expect(readPublicCardMarkers(bought.state.players[0]!, CARD)).toEqual([])
    expect(bought.state.ordinaryCardDecks.minor).not.toContain(CARD)
    expect(bought.state.events.filter(event => event.type === 'card.destroyed' && event.cardId === CARD))
      .toEqual([expect.objectContaining({ reason: 'passed', playerId: 'p1' })])
    expect(bought.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD))
      .toEqual([expect.objectContaining({ resources: { wood: 3 } })])
    expect(bought.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === CARD))
      .toEqual([expect.objectContaining({ resources: { clay: 1 } })])
    expect(bought.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardDestroyed', params: expect.objectContaining({ cardId: CARD }) }))
    expect(bought.scores).toEqual(scores)
    const session = evidence.track(restore(original))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
    assertUndoRestored(before, session.undoAction())
    const repeated = buyMinor(session, CARD)
    expect(repeated.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 3 })
    expect(repeated.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD)).toHaveLength(1)
  })

  it('moves the unique marker and real hand back when the second participant buys it', () => {
    const session = make(2)
    let response = buyMinor(session, CARD)
    expect(readPublicCardMarkers(response.state.players[1]!, CARD)).toEqual([expect.objectContaining({ sourcePlayerId: 'p1', score: -1 })])
    expect(response.scores![1]!.categories).toContainEqual(expect.objectContaining({
      key: 'cardBonusVp', total: -1, entries: [expect.objectContaining({ cardId: CARD, score: -1 })],
    }))
    confirmNext(session, response)
    response = buyMinor(session, CARD, 1, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map(player => ({ clay: player.resources.clay, wood: player.resources.wood })))
      .toEqual([{ clay: 0, wood: 3 }, { clay: 0, wood: 3 }])
    expect(response.state.players[0]!.minorHand).toEqual([CARD])
    expect(response.state.players[1]!.minorHand).toEqual(['__test_placeholder__'])
    expect(readPublicCardMarkers(response.state.players[1]!, CARD)).toEqual([])
    expect(readPublicCardMarkers(response.state.players[0]!, CARD)).toEqual([expect.objectContaining({ sourcePlayerId: 'p2', score: -1 })])
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'cardBonusVp', total: -1 }))
    expect(response.scores![1]!.categories.find(category => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
    expect(response.state.events.filter(event => event.type === 'card.passed' && event.cardId === CARD))
      .toEqual([expect.objectContaining({ fromPlayerId: 'p1', toPlayerId: 'p2' }), expect.objectContaining({ fromPlayerId: 'p2', toPlayerId: 'p1' })])
    evidence.record('marker after real second purchase', response)
  })

  it.each([{ clay: 0, forest: true }, { clay: 1, forest: false }])('rejects a purchase with clay=$clay and forest=$forest', ({ clay, forest }) => {
    const session = make(1, clay, forest)
    const scores = session.getState().scores
    const response = openMinor(session)
    expect(getChoiceOptions(response).some(option => option.value === CARD)).toBe(false)
    for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
    expect(session.state.players[0]!.minorHand).toEqual([CARD])
    expect(session.state.players[0]!.resources).toMatchObject({ clay, wood: 0 })
    expect(readPublicCardMarkers(session.state.players[0]!, CARD)).toEqual([])
    expect(session.getState().scores).toEqual(scores)
  })
})
