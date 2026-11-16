import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { partnerTable } from './_helpers/partner-build-fixture'
const sessions:GameSession[]=[]
afterEach(()=>sessions.splice(0).forEach(session=>session.dispose()))
const table=(configure:(state:GameState)=>void=()=>{})=>partnerTable(state=>{
  Object.assign(state.players[0]!.resources,{wood:40,clay:40,stone:40,reed:20})
  configure(state)
})
const chooseBranch = (session: GameSession, kind: 'construct' | 'stables') => {
  const response = session.getState()
  if (response.interaction.stateId !== 'wait') throw new Error('missing expansion interaction')
  if (response.interaction.request.kind === 'farm-select') return response
  if (response.interaction.request.kind !== 'choice') throw new Error('missing expansion choice')
  const option = response.interaction.request.options.find(option => option.labelKey === `actions.${kind}.name`)
  if (!option) throw new Error(`missing ${kind} option`)
  return session.resolveChoice(0, option.value)
}
const buildRoom = (session: GameSession, farm = 'p3') => {
  expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
  expect(session.resolveChoice(0, `target-farm:${farm}`).ok).toBe(true)
  expect(chooseBranch(session, 'construct').ok).toBe(true)
  return session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
}
const buildStable = (session: GameSession, farm = 'p3', stables = [{ row: 1, col: 2 }]) => {
  expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
  expect(session.resolveChoice(0, `target-farm:${farm}`).ok).toBe(true)
  expect(chooseBranch(session, 'stables').ok).toBe(true)
  return session.commitSelectionChoice(0, { stables })
}
const square = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const buildFences = (session: GameSession, edges = square) => {
  expect(session.takeAction(0, 'fencing').ok).toBe(true)
  expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
  return session.commitSelectionChoice(0, { edges })
}
const takeAnytime = (session: GameSession, card: string) => {
  const option = session.getState().interaction.anytimeActions.find(option => option.sourceCard === card)
  if (!option) throw new Error(`missing anytime action for ${card}`)
  return session.takeAnytimeAction(0, option.id)
}
const finishReactions = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step += 1) {
    if (response.interaction.request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      expect(response.ok, response.error).toBe(true)
      continue
    }
    if (response.interaction.request.kind !== 'select-trigger') break
    const option = response.interaction.request.options.find(option => !option.disabled)
    if (!option) throw new Error('missing reaction')
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

describe('Partner Build card reactions',()=>{
  it('pays Rustic for the clay room built by its wooden-house owner on the teammate farm', () => {
    const session = table(state => { state.players[0]!.occupationPlayed = ['B111_Rustic'] })
    const built = finishReactions(session, buildRoom(session))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ clay: 34, reed: 17, food: 2 })
    expect(built.state.players[0]!.cardStates.B111_Rustic?.counters?.bonusVp).toBe(1)
    expect(built.state.players[0]!.rooms).toBe(2)
    expect(built.state.players[2]!).toMatchObject({ rooms: 3, resources: { food: 0 } })
    expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerRoomsBuiltClay', playerId: 'p1' }))
    expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'clayRooms')?.total).toBe(3)
  })
  it.each([
    { card: 'A110_Roughcaster', resource: 'food', amount: 3 },
    { card: 'D123_RenovationPreparer', resource: 'stone', amount: 42 },
  ] as const)('$card reads the built clay material instead of the builder wooden residence', ({ card, resource, amount }) => {
    const session = table(state => { state.players[0]!.occupationPlayed = [card] })
    const built = finishReactions(session, buildRoom(session))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources[resource]).toBe(amount)
    expect(built.state.players[2]!.resources[resource]).toBe(0)
    expect(built.state.players[0]!.houseType).toBe('wood')
    expect(built.state.players[2]!.houseType).toBe('clay')
  })

  it('does not reward clay residence when a wooden room was built', () => {
    const session = table(state => {
      state.players[0]!.houseType = 'clay'
      state.players[0]!.occupationPlayed = ['A110_Roughcaster', 'B111_Rustic']
      state.players[2]!.houseType = 'wood'
    })
    const built = finishReactions(session, buildRoom(session))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.food).toBe(0)
    expect(built.state.players[0]!.cardStates.B111_Rustic?.counters?.bonusVp ?? 0).toBe(0)
    expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerRoomsBuiltWood', playerId: 'p1' }))
  })

  it.each([
    { card: 'A093_BedMaker', owner: 0 }, { card: 'A093_BedMaker', owner: 2 },
    { card: 'E052_Cubbyhole', owner: 0 }, { card: 'E052_Cubbyhole', owner: 2 },
  ])('$card belongs to player $owner and does not treat the other farm as your house', ({ card, owner }) => {
    const session = table(state => {
      state.players[0]!.rooms = 3
      state.players[0]!.roomTiles.push({ row: 1, col: 1 })
      state.players[0]!.resources.grain = 1
      if (card === 'A093_BedMaker') state.players[owner]!.occupationPlayed = [card]
      else state.players[owner]!.minorPlayed = [card]
    })
    const built = finishReactions(session, buildRoom(session))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.grain).toBe(1)
    expect(built.state.players[0]!.resources.wood).toBe(40)
    expect(built.state.players[owner]!.cardStates[card]?.counters?.food ?? 0).toBe(0)
    expect(readCardResourceStats(built.state.players[owner]!, card)?.used ?? 0).toBe(0)
  })

  it.each([
    { target: 'stone', ownerHouse: 'wood', gain: 1 },
    { target: 'clay', ownerHouse: 'stone', gain: 0 },
  ] as const)('Journeyman Bricklayer sees $target built rooms when its owner lives in $ownerHouse', ({ target, ownerHouse, gain }) => {
    const session = table(state => {
      state.players[1]!.occupationPlayed = ['D163_JourneymanBricklayer']
      state.players[1]!.houseType = ownerHouse
      state.players[2]!.houseType = target
    })
    const built = finishReactions(session, buildRoom(session))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[1]!.resources.stone).toBe(gain)
    expect(built.state.players[2]!.resources.stone).toBe(0)
  })

  it.each([
    { card: 'C056_FeedFence', minor: true, food: 1 },
    { card: 'D168_Stockman', minor: false, food: 0 },
    { card: 'E114_ShedBuilder', minor: false, food: 0 },
  ])('$card distinguishes a generic stable build from your own fourth stable', ({ card, minor, food }) => {
    const session = table(state => {
      Object.assign(state.players[0]!.resources, { wood: 3, clay: 0, stone: 0, reed: 0 })
      if (minor) state.players[0]!.minorPlayed = [card]
      else state.players[0]!.occupationPlayed = [card]
      state.players[2]!.stableTiles = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }]
    })
    const built = finishReactions(session, buildStable(session))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, food, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    expect(built.state.players[2]!.stableTiles).toHaveLength(4)
    expect(built.state.players[0]!.stableTiles).toEqual([])
    expect(built.state.players[2]!.resources).toMatchObject({ food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerStablesBuilt', playerId: 'p1' }))
  })

  it('awards Trimmer once to its builder owner when two separate builds enclose teammate spaces', () => {
    const session = table(state => { state.players[0]!.occupationPlayed = ['B124_Trimmer', 'A170_Hayward'] })
    const first = finishReactions(session, buildFences(session))
    expect(first.ok, first.error).toBe(true)
    expect(first.state.players[0]!.resources.stone).toBe(42)
    expect(first.state.players[2]!.resources.stone).toBe(0)
    expect(takeAnytime(session, 'A170_Hayward').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const second = finishReactions(session, session.commitSelectionChoice(0, { edges: ['H-0-1', 'H-1-1', 'V-0-2'] }))
    expect(second.ok, second.error).toBe(true)
    expect(second.state.players[0]!.resources).toMatchObject({ wood: 30, stone: 42 })
    expect(second.state.players[2]!.pastures).toHaveLength(2)
  })

  it('Bovine Pioneer gains builder cattle from a newly enclosed teammate space', () => {
    const session = table(state => { state.players[0]!.occupationPlayed = ['C179_BovinePioneer'] })
    const built = finishReactions(session, buildFences(session))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.cattle).toBe(1)
    expect(built.state.players[2]!.resources.cattle).toBe(0)
  })

  it('subdivision of an existing teammate pasture does not create a Trimmer or Bovine Pioneer reward', () => {
    const session = table(state => {
      state.players[0]!.occupationPlayed = ['B124_Trimmer', 'C179_BovinePioneer']
      const owner = state.players[2]!
      const edges = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
      owner.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } }))
      owner.pastures = [{ id: 'existing', tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: null, animalCount: 0 }]
    })
    const built = finishReactions(session, buildFences(session, ['V-0-1']))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 38, stone: 40, cattle: 0 })
    expect(built.state.players[2]!.pastures).toHaveLength(2)
  })

  it('Breeder Buyer combines a teammate clay room with an independently granted stable on the builder farm', () => {
    const session = table(state => {
      state.players[0]!.occupationPlayed = ['A167_BreederBuyer', 'C094_StableCleaner']
      state.players[0]!.resources.food = 2
    })
    const room = finishReactions(session, buildRoom(session))
    expect(room.ok, room.error).toBe(true)
    expect(room.state.players[0]!.turnConstruction?.roomType).toBe('clay')
    expect(room.state.players[2]!.turnConstruction).toBeUndefined()
    expect(takeAnytime(session, 'C094_StableCleaner').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p1').ok).toBe(true)
    const stable = finishReactions(session, session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }))
    expect(stable.ok, stable.error).toBe(true)
    expect(stable.state.players[0]!.resources.boar).toBe(1)
    expect(stable.state.players[0]!.resources).toMatchObject({ wood: 39, clay: 34, reed: 17, food: 1 })
    expect(stable.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 2 }])
    expect(stable.state.players[2]!.stableTiles).toEqual([])
    expect(stable.state.players[2]!.resources.boar).toBe(0)
  })

  it('Stable Milker counts distinct normal piece one on two farms as two builder stables', () => {
    const session = table(state => {
      state.players[0]!.occupationPlayed = ['D166_StableMilker', 'C094_StableCleaner']
      state.players[0]!.resources.food = 2
    })
    const first = finishReactions(session, buildStable(session))
    expect(first.ok, first.error).toBe(true)
    expect(first.state.players[0]!.resources.cattle).toBe(0)
    expect(takeAnytime(session, 'C094_StableCleaner').ok).toBe(true)
    expect(session.resolveChoice(0, 'target-farm:p1').ok).toBe(true)
    const second = finishReactions(session, session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }))
    expect(second.ok, second.error).toBe(true)
    expect(second.state.players[0]!.resources.cattle).toBe(1)
    expect(second.state.players[2]!.resources.cattle).toBe(0)
    expect(second.state.players[0]!.turnConstruction?.stablePieces).toHaveLength(2)
    expect(second.state.players[2]!.turnConstruction).toBeUndefined()
  })

  it('does not offer an unaffordable partner just because Stock Protector can grant two wood before fencing', () => {
    const session = table(state => {
      state.players[0]!.occupationPlayed = ['B094_StockProtector']
      state.players[0]!.resources.wood = 2
    })
    const offered = session.takeAction(0, 'fencing')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } } })
    expect(offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'farm-select' ? offered.interaction.request.farmOwnerPlayerId : undefined).toBeUndefined()
    expect(offered.state.players[0]!.resources.wood).toBe(4)
  })

  it('applies Stock Protector before wood once after binding an affordable target', () => {
    const session = table(state => {
      state.players[0]!.occupationPlayed = ['B094_StockProtector']
      state.players[0]!.resources.wood = 4
    })
    const offered = session.takeAction(0, 'fencing')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.state.players[0]!.resources.wood).toBe(6)
    const target = finishReactions(session, session.resolveChoice(0, 'target-farm:p3'))
    expect(target.ok, target.error).toBe(true)
    expect(target.state.players[0]!.resources.wood).toBe(6)
    const built = finishReactions(session, session.commitSelectionChoice(0, { edges: square }))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
  })

  it('places Shepherd Crook sheep on the builder farm after fencing a large teammate pasture', () => {
    const session = table(state => {
      const builder = state.players[0]!
      builder.minorPlayed = ['A083_ShepherdsCrook']
      builder.fenceSegments = ['H-0-4', 'H-1-4', 'V-0-4', 'V-0-5'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: builder.id } }))
      builder.pastures = [{ id: 'builder-pasture', tiles: [{ row: 0, col: 4 }], animalType: null, animalCount: 0 }]
    })
    const edges = ['H-0-2', 'H-0-3', 'H-2-2', 'H-2-3', 'V-0-2', 'V-0-4', 'V-1-2', 'V-1-4']
    let built = finishReactions(session, buildFences(session, edges))
    expect(built.ok, built.error).toBe(true)
    if (built.interaction.stateId === 'wait' && built.interaction.request.kind === 'animal-reorg') {
      expect(built.interaction.playerIndex).toBe(0)
      const zones = built.interaction.request.zones.map(zone => ({ id: zone.id, zoneType: zone.zoneType,
        animalType: zone.zoneType === 'pasture' ? 'sheep' : null, animalCount: zone.zoneType === 'pasture' ? 2 : 0,
      }))
      assertRejectedUnchanged(session, () => session.resolveChoice(2, 'confirm', { zones }))
      built = session.resolveChoice(0, 'confirm', { zones })
    }
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.sheep).toBe(2)
    expect(built.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 2 })
    expect(built.state.players[2]!.resources.sheep).toBe(0)
    expect(built.state.players[2]!.pastures[0]).toMatchObject({ animalType: null, animalCount: 0 })
    expect(built.state.players[2]!.pastures[0]!.tiles).toHaveLength(4)
  })

  it('does not combine a one-space partner fence with a nested one-space own stable for Fertilizers', () => {
    const session = table(state => {
      state.players[0]!.minorPlayed = ['A073_AgriculturalFertilizers']
      state.players[0]!.occupationPlayed = ['D089_Stablehand']
      state.players[0]!.resources.grain = 1
      state.players[0]!.fields = [{ row: 0, col: 4, stacks: [] }]
    })
    let response = buildFences(session)
    for (let step = 0; step < 12 && response.interaction.stateId === 'wait'; step += 1) {
      const request = response.interaction.request
      if (request.kind === 'choice' && request.options.some(option => option.value === 'target-farm:p1')) break
      if (request.kind === 'confirm-player-switch') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      } else if (request.kind === 'select-trigger' || request.kind === 'choice') {
        const option = request.options.find(option => option.value === 'D089_Stablehand')
          ?? request.options.find(option => option.value !== '__skip__' && !option.disabled)
        if (!option) throw new Error('missing Stablehand continuation')
        response = session.resolveChoice(response.interaction.playerIndex, option.value)
      } else break
      expect(response.ok, response.error).toBe(true)
    }
    expect(session.resolveChoice(0, 'target-farm:p1').ok).toBe(true)
    const built = finishReactions(session, session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }))
    expect(built.ok, built.error).toBe(true)
    expect(built.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(built.state.players[0]!.resources.grain).toBe(1)
    expect(built.state.players[0]!.fields).toEqual([{ row: 0, col: 4, stacks: [] }])
    expect(built.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 2 }])
    expect(built.state.players[2]!.pastures[0]!.tiles).toHaveLength(1)
    expect(readCardResourceStats(built.state.players[0]!, 'A073_AgriculturalFertilizers')?.used ?? 0).toBe(0)
  })

  it('pays Building Tycoon food to the builder and lets its card owner finish an independent teammate build after recovery', () => {
    const session = table(state => {
      state.players[1]!.occupationPlayed = ['D128_BuildingTycoon']
      Object.assign(state.players[1]!.resources, { wood: 6, reed: 3, food: 1 })
    })
    let response = buildRoom(session)
    for (let step = 0; step < 16 && response.interaction.stateId === 'wait'; step += 1) {
      const request = response.interaction.request
      if (request.kind === 'choice' && request.options.some(option => option.value === 'target-farm:p4')) break
      if (request.kind === 'confirm-player-switch') response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      else if (request.kind === 'select-trigger' || request.kind === 'choice') {
        const option = request.options.find(option => option.value !== '__skip__' && !option.disabled)
        if (!option) throw new Error('missing Tycoon continuation')
        response = session.resolveChoice(response.interaction.playerIndex, option.value)
      } else break
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'choice' } })
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[1]!.resources.food).toBe(0)
    expect(response.state.players[2]!.resources.food).toBe(0)
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    assertRejectedUnchanged(restored, () => restored.resolveChoice(0, 'target-farm:p4'))
    expect(restored.resolveChoice(1, 'target-farm:p4').ok).toBe(true)
    const built = finishReactions(restored, restored.commitSelectionChoice(1, { rooms: [{ row: 1, col: 1 }] }))
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[1]!.resources).toMatchObject({ wood: 0, reed: 0, food: 0 })
    expect(built.state.players[0]!.resources.food).toBe(1)
    expect(built.state.players[2]!.resources.food).toBe(0)
    expect(built.state.players[2]!.rooms).toBe(3)
    expect(built.state.players[3]!.rooms).toBe(3)
    expect(built.state.players[1]!.rooms).toBe(2)
  })
})
