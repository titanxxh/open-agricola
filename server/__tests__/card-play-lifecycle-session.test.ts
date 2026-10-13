import { afterEach, describe, expect, it } from 'vitest'
import type { Resource } from '../../shared/contract/types'
import { REAL_RESOURCE_KEYS } from '../../shared/contract/resource-keys'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { bonusScore, choose, playOccupation, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const setup = (cardId: string, paid = false, configure?: NonNullable<Parameters<typeof createWorkSession>[0]>['configure']) => {
  const session = createWorkSession({ seed: 9707, configure: (state) => {
    const player = state.players[0]!
    player.occupationHand = [cardId]
    player.occupationPlayed = paid ? ['A125_Priest'] : []
    Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 6, grain: 0 })
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

// The bug is in payment/commit/activation ordering, so even resource-only cards
// use the public Session path. Default fixtures are fresh two-player work games.
describe('card activation through onBuy', () => {
  const immediate: Array<[string, Partial<Resource>]> = [
    ['B103_FieldMerchant', { wood: 1, reed: 1 }],
    ['B138_ForestGuardian', { wood: 2 }],
    ['B151_LittlePeasant', { stone: 1 }],
    ['B155_ArtTeacher', { wood: 1, reed: 1 }],
    ['D163_JourneymanBricklayer', { stone: 2 }],
    ['E116_FirCutter', { food: 1 }],
    ['D118_Bonehead', { wood: 1 }],
  ]

  describe.each([false, true])('paid occupation=%s', (paid) => {
    it.each(immediate)('%s grants its immediate resources once after commitment', (cardId, gained) => {
      const session = setup(cardId, paid)
      const before = structuredClone(session.getState().state.players[0]!.resources)
      const response = playOccupation(session, cardId)
      const player = response.state.players[0]!
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
      expect(player.occupationPlayed.filter((id) => id === cardId)).toHaveLength(1)
      expect(player.occupationHand).not.toContain(cardId)
      for (const resource of REAL_RESOURCE_KEYS) {
        expect(player.resources[resource] ?? 0).toBe((before[resource] ?? 0) + (gained[resource] ?? 0)
          - (paid && resource === 'food' ? 1 : 0))
      }
      const played = response.state.events.filter((event) => event.type === 'card.played' && event.cardId === cardId)
      const gains = response.state.events.filter((event) => event.type === 'resource.moved'
        && event.sourceCardId === cardId && event.to.kind === 'player')
      expect(played).toHaveLength(1)
      expect(gains).toHaveLength(1)
      expect(gains[0]!.seq).toBeGreaterThan(played[0]!.seq)
      expect(response.state.events.some((event) => event.type === 'card.triggered'
        && event.cardId === cardId && event.triggerActionId === 'occupation')).toBe(false)
      expect(response.state.log.filter((entry) => entry.key === 'log.cardEffectGain'
        && entry.params?.cardId === cardId)).toHaveLength(1)
      const restored = restoreSession(session)
      sessions.push(restored)
      expect(restored.getState().state.players[0]!.resources).toEqual(player.resources)
      expect(restored.getState().state.events).toEqual(response.state.events)
      if (cardId === 'D118_Bonehead') expect(player.cardStates[cardId]?.stack).toHaveLength(5)
    })
  })

  it.each(['B103_FieldMerchant', 'B138_ForestGuardian', 'B151_LittlePeasant', 'B155_ArtTeacher',
    'D163_JourneymanBricklayer', 'E116_FirCutter', 'D118_Bonehead'])('%s cannot borrow its immediate reward to pay its occupation fee', (cardId) => {
    const session = setup(cardId, true, (state) => { state.players[0]!.resources.food = 0 })
    const before = snapshotResponse(session.getState())
    expect(session.getAvailableActions(0).some((action) => action.spaceId === 'lessons')).toBe(false)
    const rejected = session.takeAction(0, 'lessons')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]).toEqual(before.state.players[0])
    expect(rejected.state.events).toEqual(before.state.events)
    expect(rejected.state.log).toEqual(before.state.log)
    expect(rejected.scores).toEqual(before.scores)
  })

  it.each(['clay', 'stone'] as const)('Little Peasant also gains its stone in a three-room %s house', (houseType) => {
    const session = setup('B151_LittlePeasant', false, (state) => {
      state.players[0]!.houseType = houseType
      state.players[0]!.roomTiles.push({ row: 0, col: 1 })
    })
    expect(playOccupation(session, 'B151_LittlePeasant').state.players[0]!.resources.stone).toBe(1)
  })

  it.each([[1, 5, false], [8, 3, false], [14, 0, false],
    [1, 5, true], [8, 3, true], [14, 0, true]] as const)('Blighter in round %s scores %s once, paid=%s', (round, points, paid) => {
    const cardId = 'E101_Blighter'
    const session = setup(cardId, paid, (state) => { state.round = round })
    const response = playOccupation(session, cardId)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.players[0]!.resources.food).toBe(paid ? 5 : 6)
    expect(bonusScore(response, cardId)).toBe(points)
    expect(response.state.players[0]!.cardStates[cardId]?.counters?.bonusVp ?? 0).toBe(points)
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(bonusScore(restored.getState(), cardId)).toBe(points)
    const reset = session.undoAction()
    expect(reset.ok).toBe(true)
    expect(bonusScore(reset, cardId)).toBe(0)
    expect(bonusScore(playOccupation(session, cardId), cardId)).toBe(points)
  })

  it.each([[0, false, 0], [2, false, 2], [8, false, 7], [2, true, 0]] as const)('Usufructuary with %s opposing occupations, paid=%s, gains %s food', (count, paid, food) => {
    const cardId = 'E157_Usufructuary'
    const others = ['A125_Priest', 'A124_Knapper', 'A123_FrameBuilder', 'A101_CookeryOutfitter',
      'A102_Grocer', 'A103_Portmonger', 'A104_WoodHarvester', 'A105_BarrowPusher']
    const session = setup(cardId, paid, (state) => { state.players[1]!.occupationPlayed = others.slice(0, count) })
    const response = playOccupation(session, cardId)
    expect(response.state.players[0]!.resources.food).toBe(6 + food - (paid ? 1 : 0))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(restored.getState().state.players[0]!.resources.food).toBe(response.state.players[0]!.resources.food)
  })

  it.each([false, true])('Master Huntsman commits before its boar reorganization and resumes once, paid=%s', (paid) => {
    const cardId = 'E165_MasterHuntsman'
    const session = setup(cardId, paid)
    let response = playOccupation(session, cardId)
    expect(response.state.players[0]!.occupationPlayed).toContain(cardId)
    expect(response.state.players[0]!.resources.boar).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(paid ? 5 : 6)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('Expected the immediate boar reorganization')
    }
    const restored = restoreSession(session)
    sessions.push(restored)
    response = restored.getState()
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('Expected restored animal reorganization')
    }
    const house = response.interaction.request.zones.find((zone) => zone.zoneType === 'house')!
    response = restored.resolveChoice(0, 'confirm', { zones: [{ ...house, animalType: 'boar', animalCount: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(Object.values(response.state.players[0]!.houseAnimals).length).toBe(1)
    expect(response.state.players[0]!.resources.boar).toBe(1)
    expect(response.state.log.filter((entry) => entry.key === 'log.cardEffectGain' && entry.params?.cardId === cardId)).toHaveLength(1)
  })

  it.each([false, true])('Task Artisan resumes its onBuy minor choice once and supports full undo, paid=%s', (paid) => {
    const cardId = 'A096_TaskArtisan'
    const minor = 'A030_BakingSheet'
    const session = setup(cardId, paid, (state) => { state.players[0]!.minorHand = [minor, 'A067_CornScoop'] })
    const before = snapshotResponse(session.getState())
    let response = playOccupation(session, cardId)
    expect(response.state.players[0]!.occupationPlayed).toContain(cardId)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(paid ? 5 : 6)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: cardId, request: { kind: 'choice' } })
    const restored = restoreSession(session)
    sessions.push(restored)
    response = restored.getState()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected optional minor choice')
    const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
    response = choose(restored, response, accept.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      expect(response.interaction.request.options?.some((option) => option.value.startsWith('Major_'))).toBe(false)
    }
    response = choose(restored, response, minor)
    expect(response.state.players[0]!.minorPlayed).toContain(minor)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    const undone = restored.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toEqual(before.state.players[0]!.resources)
    expect(undone.state.players[0]!.occupationHand).toEqual(before.state.players[0]!.occupationHand)
    expect(undone.state.players[0]!.minorHand).toEqual(before.state.players[0]!.minorHand)
    expect(undone.state.log).toEqual(before.state.log)
    response = playOccupation(restored, cardId)
    response = choose(restored, response, '__skip__')
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorPlayed).toEqual([])
  })

  it.each([['A139_HollowWarden', false], ['D095_SiteManager', false], ['E095_Miller', false],
    ['A139_HollowWarden', true], ['D095_SiteManager', true], ['E095_Miller', true]] as const)('%s opens its purchase as committed onBuy, paid=%s', (cardId, paid) => {
    const session = setup(cardId, paid, (state) => {
      state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Well']
      state.players[0]!.minorHand = ['A030_BakingSheet']
      state.players[0]!.resources.clay = 2
    })
    const before = snapshotResponse(session.getState())
    let response = playOccupation(session, cardId)
    expect(response.state.players[0]!.occupationPlayed).toContain(cardId)
    const remainingFood = paid ? 5 : 6
    expect(response.state.players[0]!.resources.food).toBe(remainingFood)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: cardId, request: { kind: 'choice' } })
    const restored = restoreSession(session)
    sessions.push(restored)
    response = restored.getState()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected onBuy optional purchase')
    const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
    response = choose(restored, response, accept.value)
    if (!response.state.players[0]!.improvements.includes('Major_Fireplace1')) {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected sourced improvement choice')
      expect(response.interaction.request.options?.some((option) => option.value === 'A030_BakingSheet')).toBe(false)
      if (cardId !== 'D095_SiteManager') {
        expect(response.interaction.request.options?.some((option) => option.value === 'Major_Well')).toBe(false)
      }
      if (response.interaction.request.options?.some((option) => option.value === 'Major_Fireplace1')) {
        response = choose(restored, response, 'Major_Fireplace1')
      }
    }
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
      const clay = response.interaction.request.options!.find((option) => option.effectPreview?.resourcesPaid?.clay === 2)!
      response = choose(restored, response, clay.value)
    }
    expect(response.state.players[0]!.improvements).toEqual(['Major_Fireplace1'])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: remainingFood })
    const occupation = response.state.events.find((event) => event.type === 'card.played' && event.cardId === cardId)!
    const majorFee = response.state.events.find((event) => event.type === 'resource.paid' && event.sourceCardId === 'Major_Fireplace1')!
    expect(majorFee.seq).toBeGreaterThan(occupation.seq)
    expect(snapshotResponse(restored.undoAction())).toEqual(before)
    response = choose(restored, playOccupation(restored, cardId), '__skip__')
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, food: remainingFood })
  })

  it.each([1, 2, 3, 4, 5, 7])('Stallwright as occupation %s keeps its explicit self-inclusive benefit in onBuy', (ordinal) => {
    const cardId = 'E089_Stallwright'
    const previous = ['A125_Priest', 'A124_Knapper', 'A123_FrameBuilder', 'A101_CookeryOutfitter', 'A102_Grocer', 'A103_Portmonger']
    const session = setup(cardId, false, (state) => { state.players[0]!.occupationPlayed = previous.slice(0, ordinal - 1) })
    let response = playOccupation(session, cardId)
    expect(response.state.players[0]!.occupationPlayed).toContain(cardId)
    if ([2, 3, 5, 7].includes(ordinal)) {
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: cardId, request: { kind: 'choice' } })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected onBuy stable')
      const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
      response = choose(session, response, accept.value)
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected stable placement')
      response = session.commitSelectionChoice(0, { stables: [response.interaction.request.farm.selectableTiles[0]!] })
      expect(response.ok).toBe(true)
      expect(response.state.players[0]!.stableTiles).toHaveLength(1)
      expect(response.state.players[0]!.resources.wood).toBe(0)
    } else {
      expect(response.state.players[0]!.stableTiles).toEqual([])
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })
})
