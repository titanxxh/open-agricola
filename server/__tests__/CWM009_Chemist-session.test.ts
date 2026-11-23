import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { assertUndoRestored, getChoiceOptions, undoRuleSnapshot } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'

const CHEMIST = 'CWM009_Chemist'
const PLACEHOLDER = '__test_placeholder__'
const SKIP = '__skip__'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

/**
 * A new two-player game. P1 has played Chemist and holds 1 clay and no food; Forest holds 3 wood.
 * The Western Quarry is the round-5 card and the Eastern Quarry a round-10 card.
 */
function setup(round: number, configure?: (state: GameState) => void) {
  const session = createWorkSession({
    seed: 9,
    configure(state) {
      state.round = round
      state.currentPlayerIndex = 0
      for (const player of state.players) {
        player.minorHand = [PLACEHOLDER]
        player.occupationHand = [PLACEHOLDER]
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
      }
      const owner = state.players[0]!
      owner.occupationPlayed = [CHEMIST]
      owner.resources.clay = 1
      owner.resources.food = 0
      const order = state.roundActionOrder
      const western = order.indexOf('western-quarry')
      ;[order[4], order[western]] = [order[western]!, order[4]!]
      const forest = state.actionSpaces.find((space) => space.id === 'forest')!
      forest.resources.wood = 3
      configure?.(state)
    },
  })
  sessions.push(session)
  expect(session.state.roundActionOrder.indexOf('western-quarry')).toBe(4)
  expect(session.state.roundActionOrder.indexOf('eastern-quarry')).toBeGreaterThanOrEqual(9)
  return session
}

const space = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find((candidate) => candidate.id === spaceId)!
const targetLabels = (response: SessionResponse) =>
  getChoiceOptions(response).filter((option) => option.value !== SKIP).map((option) => option.labelKey)
const choose = (session: GameSession, response: SessionResponse, labelKey: string) => {
  const option = getChoiceOptions(response).find((candidate) => candidate.labelKey === labelKey)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  const next = session.resolveChoice(0, option!.value)
  expect(next.ok, next.error).toBe(true)
  return next
}
const takeForest = (session: GameSession) => {
  const response = session.takeAction(0, 'forest')
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.wood).toBe(3)
  return response
}
const chemistLogs = (response: SessionResponse) =>
  response.state.log.filter((entry) => entry.params?.cardId === CHEMIST)

describe('CWM009 Chemist places clay only on a revealed building-resource accumulation space', () => {
  it('S1 in round 2 neither quarry is offered; clay goes to the Clay Pit for 2 food, and undo restores it', () => {
    const session = setup(2)
    const before = undoRuleSnapshot(session.getState())

    const offered = takeForest(session)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: CHEMIST })
    expect(targetLabels(offered)).toEqual(['actions.clay-pit.name', 'actions.reed-bank.name'])
    expect(getChoiceOptions(offered).map((option) => option.value)).toContain(SKIP)
    const clayPit = space(offered, 'clay-pit').resources.clay

    const placed = choose(session, offered, 'actions.clay-pit.name')
    expect(placed.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 0, food: 2 })
    expect(space(placed, 'clay-pit').resources.clay).toBe(clayPit + 1)
    expect(space(placed, 'western-quarry').resources.clay).toBe(0)
    expect(space(placed, 'eastern-quarry').resources.clay).toBe(0)
    expect(chemistLogs(placed)).toContainEqual(expect.objectContaining({ key: 'log.cardEffectGain', params: expect.objectContaining({ gain: { food: 2 } }) }))
    expect(placed.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', sourceCardId: CHEMIST, resources: { clay: 1 },
      from: { kind: 'player', playerId: 'p1' }, to: { kind: 'actionSpace', spaceId: 'clay-pit' },
    }))

    assertUndoRestored(before, session.undoAction())
  })

  it('S2 in round 5 the revealed Western Quarry is offered and keeps its stone beside the clay; the Eastern Quarry is not', () => {
    const session = setup(5, (state) => {
      state.actionSpaces.find((candidate) => candidate.id === 'western-quarry')!.resources.stone = 1
    })

    const offered = takeForest(session)
    expect(targetLabels(offered)).toEqual(['actions.clay-pit.name', 'actions.reed-bank.name', 'actions.western-quarry.name'])

    const placed = choose(session, offered, 'actions.western-quarry.name')
    expect(space(placed, 'western-quarry').resources).toMatchObject({ stone: 1, clay: 1 })
    expect(space(placed, 'eastern-quarry').resources.clay).toBe(0)
    expect(placed.state.players[0]!.resources).toMatchObject({ clay: 0, food: 2 })
  })
})

describe('CWM009 Chemist stays silent elsewhere', () => {
  it('N1 skipping keeps the clay and every space unchanged', () => {
    const session = setup(5)
    const offered = takeForest(session)
    const spaces = ['clay-pit', 'reed-bank', 'western-quarry', 'eastern-quarry']
    const before = spaces.map((spaceId) => ({ ...space(offered, spaceId).resources }))

    const skipped = session.resolveChoice(0, SKIP)

    expect(skipped.ok, skipped.error).toBe(true)
    expect(skipped.state.players[0]!.resources).toMatchObject({ clay: 1, food: 0 })
    expect(spaces.map((spaceId) => ({ ...space(skipped, spaceId).resources }))).toEqual(before)
    expect(chemistLogs(skipped)).toEqual([])
  })

  it.each([
    ['P1 has no clay', (state: GameState) => { state.players[0]!.resources.clay = 0 }],
    ['Chemist is still in hand', (state: GameState) => {
      state.players[0]!.occupationPlayed = []
      state.players[0]!.occupationHand = [CHEMIST]
    }],
  ])('N2 no choice after Forest when %s', (_name, configure) => {
    const session = setup(5, configure)

    const taken = takeForest(session)

    expect(taken.interaction.stateId === 'wait' && taken.interaction.sourceCard === CHEMIST).toBe(false)
    expect(taken.state.players[0]!.resources.food).toBe(0)
    expect(chemistLogs(taken)).toEqual([])
  })

  it('N3 a building space that gives no wood does not trigger it', () => {
    const session = setup(5, (state) => {
      state.actionSpaces.find((candidate) => candidate.id === 'clay-pit')!.resources.clay = 2
    })

    const taken = session.takeAction(0, 'clay-pit')

    expect(taken.ok, taken.error).toBe(true)
    expect(taken.interaction.stateId === 'wait' && taken.interaction.sourceCard === CHEMIST).toBe(false)
    expect(taken.state.players[0]!.resources).toMatchObject({ clay: 3, food: 0 })
    expect(chemistLogs(taken)).toEqual([])
  })
})
