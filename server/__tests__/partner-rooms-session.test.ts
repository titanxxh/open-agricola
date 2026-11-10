import { afterEach, describe, expect, it } from 'vitest'
import type { CostModifier, GameState } from '../../shared/contract/types'
import type { TeamConfiguration } from '../../shared/contract/team'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const team = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration
const table = (configure: (state: GameState) => void = () => {}, moor = false) => {
  const session = createWorkSession({ seed: 1628, options: { playerCount: 4, teamConfig: team, enableFarmersOfTheMoor: moor }, configure(state) {
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
      if (moor) player.farmTerrain = []
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    Object.assign(state.players[0]!.resources, { wood: 20, clay: 20, reed: 20 })
    state.players[2]!.houseType = 'clay'
    configure(state)
  } })
  sessions.push(session)
  expect(session.state.team?.playerTeams).toEqual([0, 1, 0, 1])
  return session
}

const selectBranch = (session: GameSession, action: 'construct' | 'stables') => {
  const response = session.getState()
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') return response
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected expansion choice')
  const branch = response.interaction.request.options.find(option => option.labelKey === `actions.${action}.name`)
  expect(branch).toBeDefined()
  return session.resolveChoice(0, branch!.value)
}

describe('Partner Build rooms', () => {
  it('uses target clay material and builder resources, keeping the same farm for subsequent stables', () => {
    const session = table()
    const offered = session.takeAction(0, 'farm-expansion')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', defaultValue: 'target-farm:p1' } })
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const selected = selectBranch(session, 'construct')
    expect(selected.ok, selected.error).toBe(true)
    expect(selected.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farmOwnerPlayerId: 'p3', farm: { farmType: 'room', maxSelections: 3 } } })
    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 20, clay: 14, reed: 17 })
    expect(built.state.players[0]!.rooms).toBe(2)
    expect(built.state.players[2]!).toMatchObject({ rooms: 3, houseType: 'clay' })
    expect(built.state.players[2]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
    expect(built.state.events).toContainEqual(expect.objectContaining({ type: 'farm.roomBuilt', actorPlayerId: 'p1', targetPlayerId: 'p3', rooms: [{ playerId: 'p3', row: 1, col: 1, type: 'clay' }] }))
    expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerRoomsBuiltClay', playerId: 'p1', playerRefs: { owner: 'p3' } }))
    expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'clayRooms')?.total).toBe(3)
    const stable = selectBranch(session, 'stables')
    expect(stable.ok, stable.error).toBe(true)
    expect(stable.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { farmOwnerPlayerId: 'p3', farm: { farmType: 'stable' } } })
    const completed = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.players[0]!.resources).toMatchObject({ wood: 17, clay: 14, reed: 17 })
    expect(completed.state.players[2]!.stableTiles).toEqual([{ row: 0, col: 2 }])
  })

  it.each([
    { card: 'M036_PeatMoss', material: 'wood', minor: true, payment: { wood: 3, reed: 1 }, round: 14 },
    { card: 'D015_ClaySupports', material: 'clay', minor: true, payment: { clay: 2, wood: 1, reed: 1 }, round: 14 },
    { card: 'B013_CarpentersParlor', material: 'wood', minor: true, payment: { wood: 2, reed: 2 }, round: 14 },
    { card: 'B126_Carpenter', material: 'clay', minor: false, payment: { clay: 3, reed: 2 }, round: 14 },
    { card: 'D121_ClayPlasterer', material: 'clay', minor: false, payment: { clay: 3, reed: 2 }, round: 14 },
    { card: 'C128_WoodenHutExtender', material: 'wood', minor: false, payment: { wood: 5, reed: 1 }, round: 5 },
    { card: 'C128_WoodenHutExtender', material: 'wood', minor: false, payment: { wood: 4, reed: 1 }, round: 7 },
    { card: 'C128_WoodenHutExtender', material: 'wood', minor: false, payment: { wood: 3, reed: 1 }, round: 14 },
  ] as const)('$card uses its complete room price on the target material in round $round', ({ card, material, minor, payment, round }) => {
    const session = table(state => {
      state.round = round
      const payer = state.players[0]!
      payer.houseType = material === 'wood' ? 'clay' : 'wood'
      Object.assign(payer.resources, { wood: 0, clay: 0, reed: 0 }, payment)
      if (minor) payer.minorPlayed = [card]
      else payer.occupationPlayed = [card]
      state.players[2]!.houseType = material
    }, card === 'M036_PeatMoss')
    const offered = session.takeAction(0, 'farm-expansion')
    expect(offered.ok, offered.error).toBe(true)
    const chosen = session.resolveChoice(0, 'target-farm:p3')
    expect(chosen.ok, chosen.error).toBe(true)
    expect(selectBranch(session, 'construct').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
    expect(built.state.players[0]!.rooms).toBe(2)
    expect(built.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', bonusSources: expect.arrayContaining([card]) }))
    expect(built.state.players[2]!).toMatchObject({ rooms: 3, houseType: material })
    expect(built.state.players[2]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
  })

  it.each(['p1', 'p3'])('preserves the combined Parlor and Carpenter price on %s without rebating the partner premium twice', target => {
    const session = table(state => {
      state.players[0]!.minorPlayed = ['B013_CarpentersParlor']
      state.players[0]!.occupationPlayed = ['B126_Carpenter']
      Object.assign(state.players[0]!.resources, { wood: 0, clay: 0, reed: 2 })
      state.players[2]!.houseType = 'wood'
    })
    expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
    expect(session.resolveChoice(0, `target-farm:${target}`).ok).toBe(true)
    expect(selectBranch(session, 'construct').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
    expect(built.state.players[target === 'p1' ? 0 : 2]!.rooms).toBe(3)
  })

  it.each([
    { minor: ['A014_CarpentersHammer'], occupations: [], material: 'clay', count: 2, payment: { clay: 9, reed: 4 } },
    { minor: ['A014_CarpentersHammer'], occupations: [], material: 'clay', count: 1, payment: { clay: 6, reed: 3 } },
    { minor: [], occupations: ['A123_FrameBuilder'], material: 'clay', count: 1, payment: { clay: 4, wood: 1, reed: 3 } },
    { minor: [], occupations: ['C088_CarpentersApprentice'], material: 'wood', count: 1, payment: { wood: 4, reed: 3 } },
    { minor: [], occupations: ['E150_RockBeater'], material: 'stone', count: 1, payment: { stone: 4, reed: 3 } },
    { minor: ['B013_CarpentersParlor'], occupations: ['C088_CarpentersApprentice'], material: 'wood', count: 2, payment: { reed: 4 } },
    { minor: ['D015_ClaySupports'], occupations: ['B145_BrushwoodCollector'], material: 'clay', count: 1, payment: { clay: 2, wood: 2 } },
    { minor: ['D015_ClaySupports', 'C014_StrawThatchedRoof'], occupations: [], material: 'clay', count: 1, payment: { clay: 2, wood: 1 } },
  ] as const)('combines builder $minor/$occupations on $material rooms', ({ minor, occupations, material, count, payment }) => {
    const session = table(state => {
      state.players[0]!.minorPlayed = [...minor]
      state.players[0]!.occupationPlayed = [...occupations]
      Object.assign(state.players[0]!.resources, { wood: 0, clay: 0, reed: 0, stone: 0 }, payment)
      state.players[2]!.houseType = material
    })
    expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    expect(selectBranch(session, 'construct').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, count) })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
    expect(built.state.players[2]!.rooms).toBe(2 + count)
    expect(built.state.players[0]!.rooms).toBe(2)
  })

  it('offers only wooden target farms for Lumber Virtuoso even when its builder lives in clay', () => {
    const session = table(state => {
      state.round = 4
      state.players[0]!.houseType = 'clay'
      state.players[0]!.occupationPlayed = ['D129_LumberVirtuoso', 'C088_CarpentersApprentice']
      Object.assign(state.players[0]!.resources, { wood: 8, clay: 0, reed: 3 })
      state.players[2]!.houseType = 'wood'
      for (const player of state.players) {
        player.resources.food = 20
        markAllWorkersUsed(state, player)
      }
    })
    const harvest = session.performRoundEnd()
    expect(harvest.ok, harvest.error).toBe(true)
    expect(harvest.interaction.stateId).toBe('wait')
    if (harvest.interaction.stateId !== 'wait' || harvest.interaction.request.kind !== 'choice') throw new Error('Expected harvest choice')
    const rooms = harvest.interaction.request.options.find(option => option.value !== '__skip__' && JSON.stringify(option).includes('construct'))
    expect(rooms).toBeDefined()
    const offered = session.resolveChoice(0, rooms!.value)
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.state.players[0]!.resources.wood).toBe(5)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', options: [{ value: 'target-farm:p3' }] } })
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'target-farm:p1'))
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 0 })
    expect(built.state.players[0]!.rooms).toBe(2)
    expect(built.state.players[2]!.rooms).toBe(3)
  })

  it('does not share the farm owner cards or resources with the builder', () => {
    const session = table(state => {
      Object.assign(state.players[0]!.resources, { wood: 0, clay: 3, reed: 2 })
      state.players[2]!.occupationPlayed = ['D121_ClayPlasterer']
      Object.assign(state.players[2]!.resources, { wood: 30, clay: 30, reed: 30 })
    })
    assertRejectedUnchanged(session, () => session.takeAction(0, 'farm-expansion'))
  })

  it('keeps explicit residence conditions on the payer through both material-filter stages', () => {
    const session = table(state => {
      Object.assign(state.players[0]!.resources, { wood: 0, clay: 5, reed: 3 })
      state.players[0]!.activeModifiers = [
        { type: 'bonus', cardId: 'WoodResident', appliesTo: ['construct'], discount: { clay: 1 }, optional: false, conditions: { houseTypeWood: 1, roomMaterialClay: 1, minNumRooms: 1 } },
        { type: 'bonus', cardId: 'ClayResident', appliesTo: ['construct'], discount: { reed: 2 }, optional: false, conditions: { houseTypeClay: 1 } },
      ]
    })
    expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    expect(selectBranch(session, 'construct').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0 })
    expect(built.state.players[2]!.rooms).toBe(3)
  })

  it('keeps House Artist reed savings on its card-granted build and off ordinary expansion', () => {
    const prepare = (state: GameState) => {
      state.players[0]!.occupationPlayed = ['A149_HouseArtist']
      Object.assign(state.players[0]!.resources, { wood: 0, clay: 6, reed: 2 })
      state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food = 2
    }
    const ordinary = table(prepare)
    assertRejectedUnchanged(ordinary, () => ordinary.takeAction(0, 'farm-expansion'))
    const session = table(prepare)
    let response = session.takeAction(0, 'traveling-players')
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; step += 1) {
      if (response.interaction.request.options.some(option => option.value === 'target-farm:p3')) break
      const accept = response.interaction.request.options.find(option => option.value !== '__skip__' && !option.disabled)
      expect(accept).toBeDefined()
      response = session.resolveChoice(0, accept!.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, food: 2 })
    expect(built.state.players[2]!.rooms).toBe(3)
    expect(built.state.players[0]!.rooms).toBe(2)
  })

  it('restores a locked partner payment and permits undo without charging either farm twice', () => {
    const session = table(state => {
      state.players[0]!.minorPlayed = ['D015_ClaySupports']
      Object.assign(state.players[0]!.resources, { wood: 1, clay: 6, reed: 3 })
    })
    expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    expect(selectBranch(session, 'construct').ok).toBe(true)
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(2, { rooms: [{ row: 1, col: 1 }] }))
    const pending = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'prompt.selectPayment' })
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') throw new Error('Expected room payment')
    const alternative = pending.interaction.request.options.find(option => {
      const paid = option.effectPreview
      return paid?.kind === 'payment' && paid.resourcesPaid.clay === 2 && paid.resourcesPaid.wood === 1 && paid.resourcesPaid.reed === 1
    })
    expect(pending.interaction.request.options.some(option => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid.clay === 6 && option.effectPreview.resourcesPaid.reed === 3)).toBe(true)
    expect(alternative).toBeDefined()
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const externalModifier = { type: 'bonus', cardId: 'ExternalModifier', appliesTo: ['renovation'], discount: { stone: 1 }, optional: true } satisfies CostModifier
    const recovered = rehydrateState(JSON.parse(JSON.stringify(snapshot)))
    recovered.state.players[0]!.activeModifiers = [externalModifier, {
      type: 'trade', cardId: 'D015_ClaySupports', appliesTo: ['construct'], scope: 'unit',
      from: { wood: 1 }, to: { clay: 3, reed: 1 }, conditions: { houseTypeClay: 1 },
    }]
    const restored = new GameSession(recovered)
    sessions.push(restored)
    expect(restored.state.players[0]!.activeModifiers.map(modifier => modifier.cardId)).toEqual(['ExternalModifier', 'D015_ClaySupports'])
    expect(restored.state.players[0]!.activeModifiers[0]).toEqual(externalModifier)
    expect(restored.getState().interaction).toEqual(pending.interaction)
    assertRejectedUnchanged(restored, () => restored.resolveChoice(0, 'target-farm:p1'))
    const built = restored.resolveChoice(0, alternative!.value)
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 4, reed: 2 })
    expect(built.state.players[2]!.rooms).toBe(3)
    expect(built.state.players[0]!.rooms).toBe(2)
    const undone = restored.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 6, reed: 3 })
    expect(undone.state.players[2]!.rooms).toBe(2)
  })
})
