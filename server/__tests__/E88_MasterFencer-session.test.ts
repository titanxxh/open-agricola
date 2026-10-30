import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E088_MasterFencer'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit44Cards from './_helpers/audit/ae-negative-44-cards'

const CARD_ID = 'E088_MasterFencer'

const FILLER = '__test_placeholder__'

const FIRST_PASTURE = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const THREE_MORE = ['H-0-2', 'H-1-2', 'V-0-3']

const FOUR_FENCES = ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2']

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, houseType = 'wood', wood = 0, existingFences = false,
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  wood?: number
  existingFences?: boolean
} = {}) => {
  const session = createWorkSession({ seed: 6088, options: { playerCount: 2 } })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.resources.wood = wood
  owner.fenceSegments = existingFences
    ? FIRST_PASTURE.map((edge) => ({ edge, type: 'fence' as const }))
    : []
  owner.pastures = existingFences ? [{
    id: 'master-fencer-first', size: 1, tiles: [{ row: 0, col: 1 }],
    stables: 0, animalType: null, animalCount: 0,
  }] : []
  if (played) state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const startNextRound = (session: GameSession) => session.performRoundEnd()

const acceptMasterFencer = (session: GameSession, response: SessionResponse, cost: 2 | 3) => {
  let current = response
  if (current.interaction.stateId === 'wait'
    && current.interaction.request.kind === 'select-trigger') {
    const trigger = options(current).find((option) =>
      option.value === CARD_ID || option.sourceCard === CARD_ID)
    expect(trigger).toBeDefined()
    current = session.resolveChoice(current.interaction.playerIndex, trigger!.value)
  }
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') return current
  const source = options(current).find(option => option.labelKey === 'actions.activate-card-effect.name')
  if (source) {
    current = session.resolveChoice(current.interaction.playerIndex, source.value)
    expect(current.ok, current.error).toBe(true)
  }
  if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'farm-select') return current
  const branch = options(current).find((option) =>
    option.labelKey === `ui.interactionMasterFencer${cost}`
      || JSON.stringify(option).includes(`interactionMasterFencer${cost}`)
      || option.effectPreview?.resourcesPaid?.wood === cost)
  expect(branch, JSON.stringify(current.interaction)).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, branch!.value)
}

describe('E088 Master Fencer parity', () => {
  it('E088 S1: Master Fencer is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('E088 S2: a non-stone house receives no Master Fencer offer next round', () => {
    const response = startNextRound(setup({ houseType: 'clay', wood: 3 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E088 S3: OA silently skips Master Fencer with only one wood', () => {
    const response = startNextRound(setup({ houseType: 'stone', wood: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E088 S4: paying two wood builds up to three free fences', () => {
    const session = setup({ houseType: 'stone', wood: 2, existingFences: true })
    const pending = acceptMasterFencer(session, startNextRound(session), 2)
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })

    const response = session.commitSelectionChoice(0, { edges: THREE_MORE })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(7)
  })

  it('E088 S5: paying three wood builds four free fences', () => {
    const session = setup({ houseType: 'stone', wood: 3 })
    const pending = acceptMasterFencer(session, startNextRound(session), 3)
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })

    const response = session.commitSelectionChoice(0, { edges: FOUR_FENCES })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('E088 S6: the start-of-round Master Fencer offer may be declined', () => {
    const session = setup({ houseType: 'stone', wood: 3 })
    let response = startNextRound(session)
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'select-trigger') {
      const trigger = options(response).find((option) =>
        option.value === CARD_ID || option.sourceCard === CARD_ID)
      expect(trigger).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, trigger!.value)
    }
    const skip = options(response).find((option) => option.value === '__skip__')
    expect(skip).toBeDefined()
    response = session.resolveChoice(0, skip!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})

describe('ae-negative-44-cards', () => {
  const { sessions, save, ok, make, finish, ONE, end } = audit44Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E088 N1 real round six start pays three wood for exactly four ordinary fences without a worker', () => { const s = make('E088_MasterFencer', st => { st.players[0]!.houseType = 'stone'; st.players[0]!.resources.wood = 3 }, true, 5); let p = end(s); for (let n = 0; n < 12; n++) { assert.ok(p.interaction.stateId === 'wait', JSON.stringify(p.interaction)); const q = p.interaction.request; if (q.kind === 'farm-select') break; assert.ok(q.kind === 'choice' || q.kind === 'select-trigger'); const o = q.options.find(o => JSON.stringify(o).includes('"wood":3')) ?? q.options.find(o => o.sourceCard === 'E088_MasterFencer' && o.value !== '__skip__' && o.value !== '__pass__'); assert.ok(o, JSON.stringify(p.interaction)); p = ok(s.resolveChoice(p.interaction.playerIndex, o.value)) } assert.equal(p.state.round, 6); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select'); const r = finish(s, ok(s.commitSelectionChoice(0, { edges: ONE })), false); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.fenceSegments.length, 4); assert.equal(r.state.actionSpaces.reduce((n, a) => n + a.takenBy.length, 0), 0); save('E088-N1', { p, r }) })
  it('E088 N2 nonstone one wood and decline preserve wood and build no fences', () => { for (const [house, wood, accept] of [['clay', 3, true], ['stone', 1, false], ['stone', 3, false]] as const) { const s = make('E088_MasterFencer', st => { st.players[0]!.houseType = house; st.players[0]!.resources.wood = wood }, true, 5), p = end(s), r = finish(s, p, accept); assert.equal(r.state.players[0]!.resources.wood, wood); assert.equal(r.state.players[0]!.fenceSegments.length, 0); save(`E088-N2-${house}-${wood}`, { p, r }) } })
  it('E088 N3 two-wood branch rejects four new fences and legal adjacent three-fence extension costs exactly two wood', () => { const s = make('E088_MasterFencer', st => { const p = st.players[0]!; p.houseType = 'stone'; p.resources.wood = 2; p.pastures = [{ id: 'initial', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]; p.fenceSegments = ONE.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })) }, true, 5); let p = end(s); for (let n = 0; n < 12; n++) { assert.ok(p.interaction.stateId === 'wait'); const q = p.interaction.request; if (q.kind === 'farm-select') break; assert.ok(q.kind === 'choice' || q.kind === 'select-trigger'); const o = q.options.find(o => o.sourceCard === 'E088_MasterFencer' && o.value !== '__skip__' && o.value !== '__pass__') ?? q.options.find(o => o.value !== '__skip__' && o.value !== '__pass__'); assert.ok(o); p = ok(s.resolveChoice(p.interaction.playerIndex, o.value)) } const rejected = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges: ['H-0-3', 'H-1-3', 'V-0-3', 'V-0-4'] })), r = finish(s, ok(s.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-3'] })), false); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.fenceSegments.length, 7); save('E088-N3', { p, rejected, r }) })
})
