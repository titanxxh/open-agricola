import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { type GameState, type Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E006_Recount'
import '../../shared/cards/E/E010_StrawHat'
import '../../shared/cards/E/E041_MuddyWaters'
import '../../shared/cards/E/E043_BarnCats'
import '../../shared/cards/E/E044_FodderBeets'
import '../../shared/cards/E/E045_FruitLadder'
import '../../shared/cards/E/E065_Almsbag'
import '../../shared/cards/E/E081_AlchemistsLab'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
type CardId = 'E006_Recount' | 'E010_StrawHat' | 'E041_MuddyWaters' | 'E043_BarnCats'
  | 'E044_FodderBeets' | 'E045_FruitLadder' | 'E065_Almsbag' | 'E081_AlchemistsLab'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = [
  'A116_WoodCutter', 'B121_Geologist', 'C123_Freemason', 'D152_Patron', 'A103_Portmonger',
]

const setupMinor = ({
  cardId, resources = {}, round = 5, occupations = 0, played = false,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  round?: number
  occupations?: number
  played?: boolean
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 4056, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [cardId]
  player.minorPlayed = played ? [cardId] : []
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  state.availableMajorImprovements = []
  if (played && cardId === 'E081_AlchemistsLab') {
    state.actionSpaces.push(...createPlayerActionSpaces(state).filter((space) =>
      !state.actionSpaces.some((existing) => existing.id === space.id)))
  }
  session.loadState(state)
  return session
}

const enterImprovement = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value.startsWith('action-improvement-'))
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId): SessionResponse => {
  let response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return getChoiceOptions(response)?.some((candidate) => candidate.value === cardId) ?? false
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

const prepareRoundEnd = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = Math.max(player.resources.food, 20)
  })
  session.loadState(state)
}

describe('E010 Straw Hat parity', () => {
  it('E010 S1: costs one reed and stays in play', () => {
    const response = playMinor(setupMinor({ cardId: 'E010_StrawHat', resources: { reed: 1 } }), 'E010_StrawHat')
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain('E010_StrawHat')
  })

  const roundEnd = (round: number, farmland = true) => {
    const session = setupMinor({ cardId: 'E010_StrawHat', played: true, round, resources: { food: 20 } })
    if (farmland) {
      const player = session.state.players[0]!
      setWorkersAtHome(session.state, player, 1)
      const worker = player.workers.find((candidate) => candidate.isActive)!
      session.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy = [{ playerId: player.id, workerId: worker.id }]
    }
    prepareRoundEnd(session)
    return { session, response: session.performRoundEnd() }
  }

  it('E010 S2: at round three end a Farmland person may yield one food', () => {
    const { session, response: initial } = roundEnd(3)
    expect(initial.interaction.stateId).toBe('wait')
    if (initial.interaction.stateId !== 'wait') return
    const food = getChoiceOptions(initial)?.find((option) => option.effectPreview && 'resourcesGained' in option.effectPreview && option.effectPreview.resourcesGained?.food === 1)
    expect(food).toBeDefined()
    const response = session.resolveChoice(0, food!.value)
    expect(response.state.players[0]!.resources.food).toBe(21)
  })

  it('E010 S3: at round three end a Farmland person may move and use Day Laborer', () => {
    const { session, response: initial } = roundEnd(3)
    expect(initial.interaction.stateId).toBe('wait')
    if (initial.interaction.stateId !== 'wait') return
    const move = getChoiceOptions(initial)?.find((option) => option.labelKey === 'actions.move-farmer-to-space.name')
    expect(move).toBeDefined()
    let response = session.resolveChoice(0, move!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    response = session.resolveChoice(0, 'day-laborer')
    expect(response.state.players[0]!.resources.food).toBe(22)
    expect(response.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy).toHaveLength(0)
    expect(response.state.round).toBe(4)
  })

  it('E010 S4: outside rounds three and six Straw Hat does not trigger', () => {
    const { response } = roundEnd(4)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('E010_StrawHat')
  })
})

describe('E081 Alchemists Lab parity', () => {
  it('E081 S1: three occupations allow play and create the shared action space', () => {
    const response = playMinor(setupMinor({ cardId: 'E081_AlchemistsLab', occupations: 3 }), 'E081_AlchemistsLab')
    expect(response.state.players[0]!.minorPlayed).toContain('E081_AlchemistsLab')
    expect(response.state.actionSpaces.some((space) => space.id === 'E081_AlchemistsLab')).toBe(true)
  })

  it('E081 S2: fewer than three occupations keeps it unavailable', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'E081_AlchemistsLab', occupations: 2 }), 'E081_AlchemistsLab')).toBe(false)
  })

  it('E081 S3: owner gains one of each building resource type already owned', () => {
    const response = setupMinor({
      cardId: 'E081_AlchemistsLab', played: true, resources: { wood: 2, reed: 1 },
    }).takeAction(0, 'E081_AlchemistsLab')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 0, reed: 2, stone: 0 })
  })

  it('E081 S4: another player pays the owner one food before duplicating held building types', () => {
    const session = setupMinor({ cardId: 'E081_AlchemistsLab', played: true })
    const owner = session.state.players[0]!
    const visitor = session.state.players[1]!
    session.state.currentPlayerIndex = 1
    Object.assign(visitor.resources, { food: 1, clay: 2, stone: 1 })
    session.loadState(session.state)
    const response = session.takeAction(1, 'E081_AlchemistsLab')
    expect(response.state.players[1]!.resources).toMatchObject({ food: 0, clay: 3, stone: 2 })
    expect(response.state.players[0]!.resources.food).toBe(owner.resources.food + 1)
  })

  it('E081 S5: rejects a foodless visitor at the authoritative action entry', () => {
    const session = setupMinor({ cardId: 'E081_AlchemistsLab', played: true })
    const visitor = session.state.players[1]!
    session.state.currentPlayerIndex = 1
    Object.assign(visitor.resources, { food: 0, wood: 1 })
    session.loadState(session.state)
    expect(session.getState().actionAvailability?.E081_AlchemistsLab).toBe(false)
    const response = session.takeAction(1, 'E081_AlchemistsLab')
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[1]!.resources).toMatchObject({ food: 0, wood: 1 })
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'E081_AlchemistsLab')!.takenBy).toHaveLength(0)
  })
})

describe('E065 Almsbag parity', () => {
  it('E065 S1: in round six gains one grain per two completed rounds', () => {
    const response = playMinor(setupMinor({ cardId: 'E065_Almsbag', round: 6 }), 'E065_Almsbag')
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('E065 S2: an occupation keeps it unavailable', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'E065_Almsbag', round: 6, occupations: 1 }), 'E065_Almsbag')).toBe(false)
  })

  it('E065 S3: round one gains no grain', () => {
    const response = playMinor(setupMinor({ cardId: 'E065_Almsbag', round: 1 }), 'E065_Almsbag')
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('E045 Fruit Ladder parity', () => {
  it('E045 S1: pays two wood and schedules every remaining even round', () => {
    const response = playMinor(setupMinor({ cardId: 'E045_FruitLadder', resources: { wood: 2 }, round: 5 }), 'E045_FruitLadder')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response.state, 'E045_FruitLadder', 'food')).toEqual([6, 8, 10, 12, 14])
  })

  it('E045 S2: round fourteen schedules no food', () => {
    const response = playMinor(setupMinor({ cardId: 'E045_FruitLadder', resources: { wood: 2 }, round: 14 }), 'E045_FruitLadder')
    expect(futureRounds(response.state, 'E045_FruitLadder', 'food')).toEqual([])
  })
})

describe('E043 Barn Cats parity', () => {
  const withStables = (count: number, round = 5) => {
    const session = setupMinor({ cardId: 'E043_BarnCats', round })
    session.state.players[0]!.stableTiles = Array.from({ length: count }, (_, index) => ({ row: 0, col: index + 1 }))
    session.loadState(session.state)
    return session
  }

  it('E043 S1: one stable schedules food on the next two rounds', () => {
    const response = playMinor(withStables(1), 'E043_BarnCats')
    expect(futureRounds(response.state, 'E043_BarnCats', 'food')).toEqual([6, 7])
  })

  it('E043 S2: no stable keeps it unavailable', () => {
    expect(cardIsOffered(withStables(0), 'E043_BarnCats')).toBe(false)
  })

  it('E043 S3: four stables schedule food on the next five rounds', () => {
    const response = playMinor(withStables(4), 'E043_BarnCats')
    expect(futureRounds(response.state, 'E043_BarnCats', 'food')).toEqual([6, 7, 8, 9, 10])
  })

  it('E043 S4: round thirteen clips a four-stable schedule to round fourteen', () => {
    const response = playMinor(withStables(4, 13), 'E043_BarnCats')
    expect(futureRounds(response.state, 'E043_BarnCats', 'food')).toEqual([14])
  })
})

describe('E041 Muddy Waters parity', () => {
  const setup = (round: number, cards = 5) => {
    const session = setupMinor({ cardId: 'E041_MuddyWaters', round })
    session.state.players[0]!.occupationPlayed = OCCUPATIONS.slice(0, cards)
    session.loadState(session.state)
    return session
  }

  it('E041 S1: five cards allow play and odd-round alternating schedule', () => {
    const response = playMinor(setup(5), 'E041_MuddyWaters')
    expect(futureRounds(response.state, 'E041_MuddyWaters', 'food')).toEqual([6, 10, 14])
    expect(futureRounds(response.state, 'E041_MuddyWaters', 'clay')).toEqual([8, 12])
  })

  it('E041 S2: fewer than five cards keeps it unavailable', () => {
    expect(cardIsOffered(setup(5, 4), 'E041_MuddyWaters')).toBe(false)
  })

  it('E041 S3: an even round starts the alternating schedule two rounds later', () => {
    const response = playMinor(setup(6), 'E041_MuddyWaters')
    expect(futureRounds(response.state, 'E041_MuddyWaters', 'food')).toEqual([8, 12])
    expect(futureRounds(response.state, 'E041_MuddyWaters', 'clay')).toEqual([10, 14])
  })
})

describe('E006 Recount parity', () => {
  it('E006 S1: grants one of each building resource held at four or more and passes', () => {
    const response = playMinor(setupMinor({
      cardId: 'E006_Recount', resources: { wood: 4, clay: 3, reed: 7, stone: 4 },
    }), 'E006_Recount')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, clay: 3, reed: 8, stone: 5 })
    expect(response.state.players[1]!.minorHand).toContain('E006_Recount')
  })

  it('E006 S2: below all thresholds grants nothing and still passes', () => {
    const response = playMinor(setupMinor({
      cardId: 'E006_Recount', resources: { wood: 3, clay: 3, reed: 3, stone: 3 },
    }), 'E006_Recount')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 3, reed: 3, stone: 3 })
    expect(response.state.players[1]!.minorHand).toContain('E006_Recount')
  })
})

describe('E044 Fodder Beets parity', () => {
  const withFields = (count: number, round = 4) => {
    const session = setupMinor({ cardId: 'E044_FodderBeets', round })
    session.state.players[0]!.fields = Array.from({ length: count }, (_, index) => ({ row: 0, col: index + 1, stacks: [] }))
    session.loadState(session.state)
    return session
  }

  it('E044 S1: three fields allow play and schedule remaining odd rounds', () => {
    const response = playMinor(withFields(3), 'E044_FodderBeets')
    expect(response.state.players[0]!.minorPlayed).toContain('E044_FodderBeets')
    expect(futureRounds(response.state, 'E044_FodderBeets', 'food')).toEqual([5, 7, 9, 11, 13])
  })

  it('E044 S2: fewer than three fields keeps Fodder Beets unavailable', () => {
    const session = withFields(2)
    expect(cardIsOffered(session, 'E044_FodderBeets')).toBe(false)
    const response = playMinor(withFields(2), 'E044_FodderBeets')
    expect(response.state.players[0]!.minorPlayed).not.toContain('E044_FodderBeets')
  })

  it('E044 S3: round twelve keeps only the round-thirteen food', () => {
    const response = playMinor(withFields(3, 12), 'E044_FodderBeets')
    expect(futureRounds(response.state, 'E044_FodderBeets', 'food')).toEqual([13])
  })
})
describe("E044 command boundaries", () => {
  const PLANTER = 'D115_FodderPlanter', BEETS = 'E044_FodderBeets'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function setup(card: string, configure: (state: GameState) => void = () => { }, players = 2) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 4
        for (const p of state.players)
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
        const p = state.players[0]!
        if (card === PLANTER)
          p.occupationPlayed = [card]
        else
          p.minorHand = [card]
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function minorMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const branch = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        r = ok(s.resolveChoice(0, branch.value))
    }
    return r
  }
  function buy(s: GameSession, card: string) {
    const menu = minorMenu(s)
    if (menu.state.players[0]!.minorPlayed.includes(card))
      return menu
    assert(options(menu).some(o => o.value === card && !o.disabled))
    return ok(s.resolveChoice(0, card))
  }
  function deniedBuy(s: GameSession, card: string) {
    const menu = minorMenu(s)
    assert(!JSON.stringify(menu.interaction).includes(`"value":"${card}"`))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    assert(s.state.players[0]!.minorHand.includes(card))
  }
  function fields(state: GameState, count: number) { state.players[0]!.fields = Array.from({ length: count }, (_, i) => ({ row: 0, col: i + 1, stacks: [] })); }
  function future(r: SessionResponse) { return r.state.futureMeeples.filter(m => m.cardId === BEETS).map(m => ({ round: m.round, resources: m.resources })); }
  function naturalTurn(s: GameSession, index: number, space: string) { return confirmNext(s, ok(s.takeAction(index, space))); }
  it("two field tiles including an extra card field cannot satisfy three field tiles", () => {
    for (const extra of [false, true])
      deniedBuy(setup(BEETS, state => {
        fields(state, 2)
        if (extra)
          state.players[0]!.minorPlayed = ['E070_CropRotationField']
      }), BEETS)
    const s = setup(BEETS, state => fields(state, 3))
    const r = buy(s, BEETS)
    assert(r.state.players[0]!.minorPlayed.includes(BEETS))
    assert.deepEqual(future(r).map(m => m.round), [5, 7, 9, 11, 13])
  })
  it("current and past odd rounds never receive food and last rounds invent no future", () => {
    for (const [round, targets] of [[3, [5, 7, 9, 11, 13]], [12, [13]], [13, []], [14, []]] as const) {
      const s = setup(BEETS, state => { state.round = round; fields(state, 3); })
      const r = buy(s, BEETS)
      assert.deepEqual(future(r), targets.map(target => ({ round: target, resources: { food: 1 } })))
      assert.equal(r.state.players[0]!.resources.food, 20)
    }
  })
  it("whole-action undo removes all future food and retry schedules once", () => {
    const s = setup(BEETS, state => fields(state, 3))
    const before = undoRuleSnapshot(s.getState())
    const r = buy(s, BEETS)
    assert.equal(future(r).length, 5)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, BEETS))
    assertUndoRestored(before, s.undoAction())
    assert.deepEqual(future(s.getState()), [])
    assert.deepEqual(future(buy(s, BEETS)).map(m => m.round), [5, 7, 9, 11, 13])
  })
  it("natural next odd round delivers one food exactly once", () => {
    const s = setup(BEETS, state => { state.round = 2; fields(state, 3); })
    let r = confirmNext(s, buy(s, BEETS))
    assert.equal(r.state.round, 2)
    naturalTurn(s, 1, 'grain-seeds')
    naturalTurn(s, 0, 'day-laborer')
    r = naturalTurn(s, 1, 'clay-pit')
    assert.equal(r.state.round, 3)
    assert.equal(r.state.players[0]!.resources.food, 23)
    assert.deepEqual(future(r).map(m => m.round), [5, 7, 9, 11, 13])
    const work = ok(s.takeAction(0, 'grain-seeds'))
    assert.equal(work.state.players[0]!.resources.food, 23)
  })
  it("natural even round pays no scheduled food", () => {
    const s = setup(BEETS, state => { state.round = 1; fields(state, 3); })
    confirmNext(s, buy(s, BEETS))
    naturalTurn(s, 1, 'grain-seeds')
    naturalTurn(s, 0, 'day-laborer')
    const r = naturalTurn(s, 1, 'clay-pit')
    assert.equal(r.state.round, 2)
    assert.equal(r.state.players[0]!.resources.food, 22)
    assert.deepEqual(future(r).map(m => m.round), [3, 5, 7, 9, 11, 13])
  })
})
