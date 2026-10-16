import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, familySize, newbornCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A032_Manger'
import '../../shared/cards/A/A035_SwimmingClass'
import '../../shared/cards/A/A036_FacadesCarving'
import '../../shared/cards/A/A038_WoolBlankets'
import '../../shared/cards/A/A039_Chapel'
import assert from 'node:assert/strict'
import { type GameState, type Resource, type FarmTilePosition } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const FILLER = '__test_placeholder__'

const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

const setupMinor = ({
  cardId, played = false, round = 14, resources = {}, occupations = 0,
}: {
  cardId: string
  played?: boolean
  round?: number
  resources?: Record<string, number>
  occupations?: number
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7032 + round, options: { playerCount: 3 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const enterMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait'
    && !options(response).some((option) => option.value === cardId)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(expectWait(response).interaction.playerIndex, branch.value)
  }
  return response
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = enterMinor(session, cardId)
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === cardId)
    if (card) response = session.resolveChoice(expectWait(response).interaction.playerIndex, card.value)
  }
  return response
}

const bonusScore = (response: SessionResponse, cardId: string, playerIndex = 0) => {
  assert.ok(response.scores)
  return response.scores[playerIndex]!.categories
    .find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0
}

describe('A032 Manger parity', () => {
  const CARD_ID = 'A032_Manger'

  it('A032 S1: paying two wood plays Manger', () => {
    const response = playMinor(setupMinor({ cardId: CARD_ID, resources: { wood: 2 } }), CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A032 S2: Manger scores zero, one, two, three, and four points at the printed pasture-area thresholds', () => {
    for (const [size, expected] of [[5, 0], [6, 1], [7, 2], [8, 3], [10, 4]]) {
      const session = setupMinor({ cardId: CARD_ID, played: true })
      const state = session.getState().state
      state.players[0]!.pastures = [{
        id: `manger-${size}`, animalType: null, animalCount: 0,
        tiles: Array.from({ length: size }, (_, index) => ({ row: Math.floor(index / 5), col: index % 5 })),
      }]
      session.loadState(state)
      expect(bonusScore(session.getState(), CARD_ID), `size=${size}`).toBe(expected)
    }
  })
})

describe('A035 Swimming Class parity', () => {
  const CARD_ID = 'A035_SwimmingClass'

  it('A035 S1: two occupations and one food allow Swimming Class to be played', () => {
    const response = playMinor(setupMinor({
      cardId: CARD_ID, resources: { food: 21 }, occupations: 2,
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(20)
  })

  const finish = (fishing: boolean, newborns: number) => {
    const session = setupMinor({ cardId: CARD_ID, played: true, round: 5 })
    const state = session.getState().state
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 2 + newborns)
    owner.workers.slice(2, 2 + newborns).forEach((worker) => { worker.isNewborn = true })
    state.actionSpaces.find((space) => space.id === (fishing ? 'fishing' : 'forest'))!.takenBy = [
      { playerId: owner.id, workerId: '1' },
    ]
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = [
      { playerId: owner.id, workerId: '2' },
    ]
    for (let index = 0; index < newborns; index++) {
      state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy.push({
        playerId: owner.id, workerId: String(3 + index),
      })
    }
    state.players.slice(1).forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session.performRoundEnd()
  }

  it('A035 S2: returning a Fishing person with one newborn gains two bonus points', () => {
    const response = finish(true, 1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
  })

  it('A035 S3: without a Fishing person or newborn Swimming Class grants no points', () => {
    expect(finish(false, 1).state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
    expect(finish(true, 0).state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('A036 Facades Carving parity', () => {
  const CARD_ID = 'A036_FacadesCarving'

  const setup = (wood = 8) => setupMinor({
    cardId: CARD_ID, round: 8, resources: { wood, clay: 2, food: 2 },
  })

  it('A036 S1: round eight requires eight wood and two clay, then may exchange two food for two points', () => {
    const session = setup()
    let response = playMinor(session, CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const exchange = options(response).find((option) =>
      option.effectPreview && 'resourcesPaid' in option.effectPreview && option.effectPreview.resourcesPaid?.food === 2)
    expect(exchange, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, exchange!.value)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 8, clay: 0, food: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
  })

  it('A036 S2: the Facades Carving food exchange may be declined', () => {
    const session = setup()
    let response = playMinor(session, CARD_ID)
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A036 S3: wood below the current round keeps Facades Carving unavailable', () => {
    const response = enterMinor(setup(7), CARD_ID)
    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })
})

describe('A038 Wool Blankets parity', () => {
  const CARD_ID = 'A038_WoolBlankets'
  const setup = ({ played = false, sheep = 5, houseType = 'wood' }: { played?: boolean; sheep?: number; houseType?: GameState['players'][number]['houseType'] } = {}) => {
    const session = setupMinor({ cardId: CARD_ID, played })
    const state = session.getState().state
    const owner = state.players[0]!
    owner.houseType = houseType
    owner.pastures = [{
      id: 'wool', tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
      animalType: sheep ? 'sheep' : null, animalCount: sheep,
    }]
    session.loadState(state)
    return session
  }

  it('A038 S1: five sheep on the farm allow Wool Blankets to be played', () => {
    expect(playMinor(setup(), CARD_ID).state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A038 S2: fewer than five sheep keep Wool Blankets unavailable', () => {
    const response = enterMinor(setup({ sheep: 4 }), CARD_ID)
    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
  })

  it('A038 S3: wooden, clay, and stone houses score three, two, and zero Wool Blankets points', () => {
    for (const [houseType, expected] of [['wood', 3], ['clay', 2], ['stone', 0]] as const) {
      expect(bonusScore(setup({ played: true, houseType }).getState(), CARD_ID), houseType).toBe(expected)
    }
  })
})

describe('A039 Chapel parity', () => {
  const CARD_ID = 'A039_Chapel'
  const setup = ({ played = false, actor = 0, grain = 0 } = {}) => {
    const session = setupMinor({
      cardId: CARD_ID, played, occupations: 2, resources: played ? {} : { wood: 3, clay: 2 },
    })
    const state = session.getState().state
    state.currentPlayerIndex = actor
    state.players[actor]!.resources.grain = grain
    if (played) {
      state.actionSpaces.push(...createPlayerActionSpaces(state).filter((space) =>
        !state.actionSpaces.some((existing) => existing.id === space.id)))
    }
    session.loadState(state)
    return session
  }

  it('A039 S1: two occupations, three wood, and two clay play Chapel as a public action space', () => {
    const response = playMinor(setup(), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.actionSpaces.some((space) => space.id === CARD_ID)).toBe(true)
  })

  it('A039 S2: the Chapel owner uses it for three bonus points without paying grain', () => {
    const response = setup({ played: true }).takeAction(0, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(bonusScore(response, CARD_ID)).toBe(3)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('A039 S3: a guest pays one grain to the owner and gains three bonus points', () => {
    const response = setup({ played: true, actor: 1, grain: 1 }).takeAction(1, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(bonusScore(response, CARD_ID, 1)).toBe(3)
  })

  it('A039 S4: a guest without grain is rejected at the authoritative action entry', () => {
    const session = setup({ played: true, actor: 1 })
    const before = session.getState().state
    expect(session.getActionAvailability(1)[CARD_ID]).toBe(false)
    const response = session.takeAction(1, CARD_ID)
    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before)
    expect(bonusScore(response, CARD_ID, 1)).toBe(0)
  })
})

describe("A035 command boundaries", () => {
  const SWIM = 'A035_SwimmingClass'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ round = 14, played = false, occupations = 2, resources = {} }: {
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [SWIM, '__test_placeholder__']
        p.minorPlayed = played ? [SWIM] : []
        p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) {
    const o = options(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    assert.ok(r.interaction.stateId === 'wait')
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  function buyMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = buyMenu(s)
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return ok(s.resolveChoice(0, card))
  }
  function deny(s: GameSession, card: string) {
    const r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  }
  function score(r: SessionResponse, card: string) {
    assert.ok(r.scores)
    assert.ok(r.scores[0])
    return r.scores[0].categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === card)?.score ?? 0
  }
  function vp(r: SessionResponse, card: string) {
    return r.state.players[0]!.cardStates[card]?.counters?.bonusVp ?? 0
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return ok(s.takeAction(actor, space))
  }
  function swimSetup() {
    const s = setup({ round: 5, played: true }, state => {
      const p = state.players[0]!
      p.rooms = 3
      p.roomTiles.push({ row: 0, col: 0 })
    })
    const p = s.getState().state.players[0]!
    assert.equal(p.rooms, 3)
    assert.deepEqual(p.roomTiles, [{ row: 2, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 0 }])
    return s
  }
  function roundWithGrowth(s: GameSession, ownFirst = 'fishing', otherFirst = 'forest') {
    turn(s, 0, ownFirst)
    turn(s, 1, otherFirst)
    const grown = turn(s, 0, 'wish-children')
    assert.equal(familySize(grown.state.players[0]!), 3)
    assert.equal(newbornCount(grown.state.players[0]!), 1)
    assert.equal(vp(grown, SWIM), 0)
    const last = turn(s, 1, 'clay-pit')
    assert.equal(vp(last, SWIM), 0)
    return confirmNext(s, last)
  }
  it("actual purchase requires two occupations and pays one food", () => {
    deny(setup({ occupations: 1, resources: { food: 1 } }), SWIM)
    deny(setup({ resources: { food: 0 } }), SWIM)
    const r = buy(setup(), SWIM)
    assert.ok(r.state.players[0]!.minorPlayed.includes(SWIM))
    assert.equal(r.state.players[0]!.resources.food, 39)
  })
  it("actual Fishing and newborn reward only at natural return home", () => {
    const r = roundWithGrowth(swimSetup())
    assert.equal(r.state.round, 6)
    assert.equal(vp(r, SWIM), 2)
    assert.equal(score(r, SWIM), 2)
    assert.equal(familySize(r.state.players[0]!), 3)
    assert.equal(newbornCount(r.state.players[0]!), 0)
  })
  it("actual newborn with no own Fishing cannot inherit opponent Fishing reward", () => {
    for (const opponentSpace of ['forest', 'fishing']) {
      const r = roundWithGrowth(swimSetup(), 'grain-seeds', opponentSpace)
      assert.equal(r.state.round, 6)
      assert.equal(vp(r, SWIM), 0)
      assert.equal(score(r, SWIM), 0)
      assert.equal(familySize(r.state.players[0]!), 3)
    }
  })
  it("Fishing without newborn and prior round Fishing do not award next round growth", () => {
    const s = swimSetup()
    turn(s, 0, 'fishing')
    turn(s, 1, 'forest')
    turn(s, 0, 'grain-seeds')
    const first = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(first.state.round, 6)
    assert.equal(vp(first, SWIM), 0)
    assert.equal(familySize(first.state.players[0]!), 2)
    const r = roundWithGrowth(s, 'grain-seeds')
    assert.equal(r.state.round, 7)
    assert.equal(vp(r, SWIM), 0)
    assert.equal(score(r, SWIM), 0)
    assert.equal(familySize(r.state.players[0]!), 3)
  })
})

describe("A032 command boundaries", () => {
  const MANGER = 'A032_Manger'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ played = true, resources = {} }: {
    played?: boolean
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
        }
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [MANGER, '__test_placeholder__']
        p.minorPlayed = played ? [MANGER] : []
        Object.assign(p.resources, resources)
        configure(state)
        const owned = state.players.flatMap(p => p.improvements)
        state.availableMajorImprovements = state.availableMajorImprovements.filter(id => !owned.includes(id))
      } }))
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function buy(s: GameSession, card: string, space = 'meeting-place') {
    let r = ok(s.takeAction(0, space))
    for (let step = 0; step < 3 && !r.state.players[0]!.minorPlayed.includes(card) && !r.state.players[0]!.improvements.includes(card); step++) {
      const candidate = options(r).find(o => o.value === card) ?? options(r).find(o => o.value.startsWith('action-improvement-'))
      assert(candidate && !candidate.disabled, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(0, candidate.value))
    }
    assert(r.state.players[0]!.minorPlayed.includes(card) || r.state.players[0]!.improvements.includes(card))
    return r
  }
  function denied(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const branch = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        r = ok(s.resolveChoice(0, branch.value))
    }
    assert(!r.state.players[0]!.minorPlayed.includes(card))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      assert(!getChoiceOptions(r).some(o => o.value === card && !o.disabled))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  }
  function bonus(r: SessionResponse, card: string, owner = 0) {
    assert(r.scores)
    return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === card)?.score ?? 0
  }
  function boundary(cells: FarmTilePosition[]) {
    const edges = new Set<string>()
    for (const { row, col } of cells)
      for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
        if (edges.has(edge))
          edges.delete(edge)
        else
          edges.add(edge)
      }
    return [...edges]
  }
  function pastures(state: GameState, groups: FarmTilePosition[][], owner = 0, stable = false, animals = 0) {
    const p = state.players[owner]!
    const edges = [...new Set(groups.flatMap(boundary))]
    assert(edges.length <= 15)
    p.pastures = groups.map((tiles, i) => ({ id: `p${i}`, tiles, animalType: i === 0 && animals ? 'sheep' : null, animalCount: i === 0 ? animals : 0 }))
    p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
    p.stableTiles = stable ? [groups[0]![0]!] : []
    p.resources.sheep = animals
  }
  function manger(area: number, { played = true, wood = 0 } = {}) {
    return setup({ played, resources: { wood } }, state => {
      const p = state.players[0]!
      if (area <= 10) {
        p.roomTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]
      }
      const cells = area <= 10 ? Array.from({ length: area }, (_, n) => ({ row: Math.floor(n / 5), col: n % 5 })) : Array.from({ length: 12 }, (_, n) => ({ row: Math.floor(n / 4), col: n % 4 + 1 }))
      pastures(state, cells.length ? [cells] : [])
    })
  }
  it("one wood rejects purchase and exact two wood activates only the owned pasture bonus", () => {
    denied(manger(6, { played: false, wood: 1 }), MANGER)
    const s = manger(6, { played: false, wood: 2 })
    assert.equal(bonus(s.getState(), MANGER), 0)
    const r = buy(s, MANGER)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(bonus(r, MANGER), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MANGER))
  })
  it("legal finite fence layouts cover every lower threshold and the four point upper cap", () => {
    for (const [area, expected] of [[5, 0], [6, 1], [7, 2], [8, 3], [9, 3], [10, 4], [12, 4]]) {
      const s = manger(area)
      assert.equal(bonus(s.getState(), MANGER), expected)
      assert.equal(bonus(s.getState(), MANGER), expected)
    }
  })
  it("two separate pastures add physical area while stable and animals change no area bonus", () => {
    const groups = [[{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }], [{ row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }]]
    for (const stable of [false, true]) {
      const s = setup({}, state => pastures(state, groups, 0, stable, stable ? 2 : 0))
      assert.equal(bonus(s.getState(), MANGER), 1)
    }
  })
  it("planted fields loose stable and the opponents large pasture do not add owner pasture area", () => {
    const s = manger(5)
    const other = setup({}, state => {
      const p = state.players[0]!
      p.stableTiles = [{ row: 0, col: 1 }]
      p.fields = [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }]
      state.players[1]!.roomTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]
      pastures(state, [Array.from({ length: 10 }, (_, n) => ({ row: Math.floor(n / 5), col: n % 5 }))], 1)
    })
    assert.equal(bonus(s.getState(), MANGER), 0)
    assert.equal(bonus(other.getState(), MANGER), 0)
  })
  it("actual three fence enclosure crosses six spaces and full undo restores five spaces", () => {
    const s = manger(5, { wood: 3 })
    const before = undoRuleSnapshot(s.getState())
    assert.equal(bonus(s.getState(), MANGER), 0)
    const menu = ok(s.takeAction(0, 'fencing'))
    assert(menu.interaction.stateId === 'wait' && menu.interaction.request.kind === 'farm-select', JSON.stringify(menu.interaction))
    const r = ok(s.commitSelectionChoice(0, { edges: ['H-2-0', 'V-1-0', 'V-1-1'] }))
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.fenceSegments.length, 15)
    assert.equal(bonus(r, MANGER), 1)
    assertUndoRestored(before, s.undoAction())
  })
})
