import { afterEach, describe, expect, it } from 'vitest'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { ensureCardModifiers } from '../../shared/cards/card-modifiers'
import { OLD_E13_Axe } from '../../shared/cards/classic/E/OLD_E13_Axe'
import { OLD_E218_Carpenter } from '../../shared/cards/classic/E/OLD_E218_Carpenter'
import type { TeamConfiguration } from '../../shared/contract/team'
import type { FarmTilePosition, Resource } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'

const AXE = OLD_E13_Axe.id
const CARPENTER = OLD_E218_Carpenter.id
const sources = [OLD_E13_Axe, OLD_E218_Carpenter]
const rooms: FarmTilePosition[] = [{ row: 1, col: 1 }, { row: 2, col: 1 }]
const sessions: GameSession[] = []
const team = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration

/** Two-player round-one work game by default; partner scenarios explicitly use four cooperative seats. */
function setup({
  played = [AXE, CARPENTER], houseType = 'wood', resources = {}, partnerHouseType,
}: { played?: string[]; houseType?: 'wood' | 'clay' | 'stone'; resources?: Partial<Resource>; partnerHouseType?: 'wood' | 'clay' | 'stone' } = {}) {
  const session = createWorkSession({
    options: partnerHouseType ? { playerCount: 4, teamConfig: team } : undefined,
    customCards: sources.map(source => ({ cardType: source.kind, cardJson: source.meta })),
    configure(state) {
      const owner = state.players[0]!
      Object.assign(owner.resources, { wood: 0, clay: 0, stone: 0, reed: 0, food: 0, ...resources })
      owner.houseType = houseType
      owner.rooms = 2
      owner.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
      owner.minorPlayed = played.includes(AXE) ? [AXE] : []
      owner.occupationPlayed = played.filter(id => id !== AXE)
      if (partnerHouseType) state.players[2]!.houseType = partnerHouseType
    },
  })
  sessions.push(session)
  // These sources are not yet in the public deal pool. Bind only this Session's test registry.
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('classic room cost test')
    for (const source of sources) registry.loadImpl(source.id, source.impl)
    for (const id of played) ensureCardModifiers(session.state.players[0]!, id)
  })
  expect(session.state.players).toHaveLength(partnerHouseType ? 4 : 2)
  return session
}

afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function openConstruction(session: GameSession, partner = false) {
  let response = session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  if (partner) response = session.resolveChoice(0, 'target-farm:p3')
  const construct = getChoiceOptions(response).find(option => option.labelKey === 'actions.construct.name')
  if (construct) response = session.resolveChoice(0, construct.value)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  return response
}

function settle(session: GameSession, initial: SessionResponse, paid: Partial<Resource>) {
  let response = initial
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = getChoiceOptions(response).find(option => {
      const resources = option.labelParams?.resourcesPaid as Partial<Resource> | undefined
      return resources && ['wood', 'clay', 'stone', 'reed'].every(key =>
        (resources[key as keyof Resource] ?? 0) === (paid[key as keyof Resource] ?? 0))
    })
    expect(payment).toBeDefined()
    response = session.resolveChoice(0, payment!.value)
  }
  const done = getChoiceOptions(response).find(option => option.value === '__done__' || option.value === '__skip__')
  if (done) response = session.resolveChoice(0, done.value)
  expect(response.ok, response.error).toBe(true)
  return response
}

function build(session: GameSession, count: number, paid: Partial<Resource>) {
  const before = { ...session.state.players[0]!.resources }
  const beforeScore = session.getState().scores[0]!.total
  openConstruction(session)
  const response = settle(session, session.commitSelectionChoice(0, { rooms: rooms.slice(0, count) }), paid)
  const owner = response.state.players[0]!
  expect(owner.rooms).toBe(2 + count)
  expect(owner.roomTiles).toEqual(expect.arrayContaining(rooms.slice(0, count)))
  for (const key of ['wood', 'clay', 'stone', 'reed'] as const) {
    expect(owner.resources[key]).toBe(before[key] - (paid[key] ?? 0))
  }
  expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', resources: paid }))
  expect(response.state.log).toContainEqual(expect.objectContaining({
    key: 'log.actionDetail',
    params: expect.objectContaining({ detailParts: expect.objectContaining({ effects: { buildRoom: count } }) }),
  }))
  const housePoints = owner.houseType === 'wood' ? 0 : owner.houseType === 'clay' ? 1 : 2
  expect(response.scores[0]!.total).toBe(beforeScore + count * (1 + housePoints))
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: 1 } })
  expect(confirmNext(session, response).state.currentPlayerIndex).toBe(1)
  return response
}

describe('classic room replacement costs', () => {
  it.each([1, 2])('Axe and Carpenter never stack and Axe costs two wood and two reed for each of %i rooms', count => {
    build(setup({ resources: { wood: 2 * count, reed: 2 * count } }), count, { wood: 2 * count, reed: 2 * count })
  })

  it.each(['wood', 'clay', 'stone'] as const)('Carpenter applies the replacement to both %s rooms', houseType => {
    build(setup({ played: [CARPENTER], houseType, resources: { [houseType]: 6, reed: 4 } }), 2, { [houseType]: 6, reed: 4 })
  })

  it.each([
    { played: [AXE, CARPENTER], houseType: 'clay', target: 'wood', paid: { wood: 4, reed: 4 } },
    { played: [CARPENTER], houseType: 'wood', target: 'clay', paid: { clay: 6, reed: 4 } },
  ] as const)('uses the builder cards and complete price for two partner $target rooms while living in $houseType', ({ played, houseType, target, paid }) => {
    const session = setup({ played: [...played], houseType, partnerHouseType: target, resources: paid })
    const ownerBefore = { ...session.state.players[2]!.resources }
    const payerScore = session.getState().scores[0]!.total
    const ownerScore = session.getState().scores[2]!.total
    const selected = openConstruction(session, true)
    expect(selected.interaction).toMatchObject({ request: { farmOwnerPlayerId: 'p3' } })
    const response = settle(session, session.commitSelectionChoice(0, { rooms }), paid)

    expect(response.state.players[0]).toMatchObject({ rooms: 2, resources: { wood: 0, clay: 0, reed: 0 } })
    expect(response.state.players[2]).toMatchObject({ rooms: 4, houseType: target, resources: ownerBefore })
    expect(response.state.players[2]!.roomTiles).toEqual(expect.arrayContaining(rooms))
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', actorPlayerId: 'p1', resources: paid }))
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'farm.roomBuilt', actorPlayerId: 'p1', targetPlayerId: 'p3' }))
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: target === 'wood' ? 'log.partnerRoomsBuiltWood' : 'log.partnerRoomsBuiltClay', playerId: 'p1', playerRefs: { owner: 'p3' },
    }))
    expect(response.scores[0]!.total).toBe(payerScore)
    expect(response.scores[2]!.total).toBe(ownerScore + (target === 'wood' ? 2 : 4))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: 1 } })
  })

  it('Axe does not discount a clay room', () => {
    build(setup({ played: [AXE], houseType: 'clay', resources: { clay: 5, reed: 2 } }), 1, { clay: 5, reed: 2 })
  })

  it('rejects a two-room overspend without changing state, then permits the affordable one-room retry', () => {
    const session = setup({ resources: { wood: 2, reed: 2 } })
    openConstruction(session)
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { rooms }))
    const response = settle(session, session.commitSelectionChoice(0, { rooms: rooms.slice(0, 1) }), { wood: 2, reed: 2 })
    expect(response.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0 } })
    expect(response.state.events.filter(event => event.type === 'farm.roomBuilt')).toHaveLength(1)
  })

  it('does not permit a free room or waive its reeds when both alternatives are present', () => {
    for (const resources of [{ wood: 0, reed: 2 }, { wood: 2, reed: 1 }]) {
      const session = setup({ resources })
      const beforeRooms = session.state.players[0]!.rooms
      const response = session.takeAction(0, 'farm-expansion')
      expect(getChoiceOptions(response).some(option => option.labelKey === 'actions.construct.name')).toBe(false)
      expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select'
        && response.interaction.request.farm.farmType === 'room').toBe(false)
      expect(response.state.players[0]!.rooms).toBe(beforeRooms)
      expect(response.state.players[0]!.resources).toMatchObject(resources)
      expect(response.state.events.some(event => event.type === 'farm.roomBuilt')).toBe(false)
    }
  })

  it('keeps the ordinary five wood and two reed per room when neither card is played', () => {
    build(setup({ played: [], resources: { wood: 10, reed: 4 } }), 2, { wood: 10, reed: 4 })
  })

  it('keeps revised Carpenter costs independent from the classic source registry', () => {
    build(setup({ played: ['B126_Carpenter'], resources: { wood: 6, reed: 4 } }), 2, { wood: 6, reed: 4 })
  })
})
