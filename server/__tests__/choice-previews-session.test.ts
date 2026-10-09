import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { serializeSessionSnapshot, serializeState } from '../../shared/session/serialization'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { ActionChoiceOption, ChoiceDescriptionPreview, ChoiceEffectPreview, SessionResponse } from '../../shared/contract/types'

const choices = (response: SessionResponse): ActionChoiceOption[] => {
  expect(response.ok).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('Expected an authoritative choice')
  }
  return response.interaction.request.options
}

const effects = (description?: ChoiceDescriptionPreview): ChoiceEffectPreview[] => {
  if (!description) return []
  if (description.kind === 'group') return description.parts.flatMap(effects)
  return description.effectPreview ? [description.effectPreview] : []
}

const setup = (cardId: string, round: number, moor = false, playerCount = 2, occupation = false) => {
  const session = new GameSession(409, undefined, {
    playerCount,
    enableFarmersOfTheMoor: moor,
    allowIncompleteFarmersOfTheMoorMinorDeal: moor,
  })
  const state = session.state
  state.round = round
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.farmTerrain = []
    player.resources = { ...player.resources, food: 20, wood: 20, clay: 20, reed: 20, stone: 20, fuel: 20 }
  })
  if (occupation) state.players[0]!.occupationHand.push(cardId)
  else state.players[0]!.minorHand.push(cardId)
  return session
}

const purchaseMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let step = 0; step < 8; step += 1) {
    if (response.state.players[0]!.minorPlayed.includes(cardId)) return response
    const options = choices(response)
    const option = options.find((candidate) => candidate.value === cardId)
      ?? options.find((candidate) => candidate.value.startsWith('action-improvement-'))
      ?? (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment' ? options[0] : undefined)
    if (!option) throw new Error(`Unexpected purchase choices: ${JSON.stringify(options)}`)
    response = session.resolveChoice(0, option.value)
  }
  throw new Error('Purchase did not reach the card choice')
}

const purchasePayment = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let step = 0; step < 8; step += 1) {
    const options = choices(response)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') return response
    const option = options.find((candidate) => candidate.value === cardId)
      ?? options.find((candidate) => candidate.value.startsWith('action-improvement-'))
    if (!option) throw new Error(`Unexpected purchase choice: ${JSON.stringify(options)}`)
    response = session.resolveChoice(0, option.value)
  }
  throw new Error('Expected payment solutions')
}

describe('authoritative choice previews', () => {
  it.each(['E041_MuddyWaters', 'E120_ScrapCollector'])('preserves drain-all scheduling for multi-request %s', (cardId) => {
    const session = setup(cardId, 1, false, 2, cardId === 'E120_ScrapCollector')
    const player = session.state.players[0]!
    player.minorPlayed = ['__a__', '__b__', '__c__', '__d__', '__e__']
    const response = cardId === 'E041_MuddyWaters' ? purchaseMinor(session, cardId) : session.takeAction(0, 'lessons')
    expect(response.ok).toBe(true)
    expect(response.state.pendingFutureMeeples).toHaveLength(0)
    const entries = response.state.futureMeeples.map((entry) => [entry.round, entry.resources])
    expect(entries).toEqual(cardId === 'E041_MuddyWaters'
      ? [[2, { food: 1 }], [6, { food: 1 }], [10, { food: 1 }], [14, { food: 1 }], [4, { clay: 1 }], [8, { clay: 1 }], [12, { clay: 1 }]]
      : [[2, { wood: 1 }], [4, { wood: 1 }], [6, { wood: 1 }], [3, { clay: 1 }], [5, { clay: 1 }], [7, { clay: 1 }]])
    expect(response.state.events.filter((event) => event.type === 'futureMeeple.queued' && event.cardId === cardId)).toHaveLength(2)
  })
  it('declares whole logical-field targets and mixed contents for Scythe', () => {
    const session = setup('E073_Scythe', 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['E073_Scythe']
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }, { kind: 'vegetable', remaining: 1 }] },
      { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
    ]
    session.state.players.forEach((candidate) => markAllWorkersUsed(session.state, candidate))
    const response = session.performRoundEnd()
    const options = choices(response).filter((option) => option.value !== '__skip__')
    expect(options).toHaveLength(2)
    expect(options[0]!.target).toMatchObject({ kind: 'logical-field', playerId: player.id, positions: [{ row: 0, col: 2 }], resources: { grain: 1, vegetable: 1 } })
    const resolved = session.resolveChoice(0, options[0]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 1 })
    expect(resolved.state.players[0]!.fields[0]!.stacks).toHaveLength(0)
    expect(resolved.state.players[0]!.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
  })
  it('binds both Wood Field slots to one whole-field Scythe choice', () => {
    const session = setup('E073_Scythe', 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['E073_Scythe', 'D075_WoodField']
    player.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 2 }] } }
    session.state.players.forEach((candidate) => markAllWorkersUsed(session.state, candidate))
    const response = session.performRoundEnd()
    const option = choices(response).find((choice) => choice.target?.kind === 'logical-field')!
    expect(option.target).toMatchObject({ kind: 'logical-field', fieldId: 'card:D075_WoodField', playerId: player.id, resources: { wood: 5 }, positions: [
      { sourceCard: 'D075_WoodField', cardFieldSlot: 0 }, { sourceCard: 'D075_WoodField', cardFieldSlot: 1 },
    ] })
    const before = JSON.stringify(session.state)
    session.getState()
    expect(JSON.stringify(session.state)).toBe(before)
    const resolved = session.resolveChoice(0, option.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources.wood).toBe(25)
    expect(resolved.state.players[0]!.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([null, null])
  })
  it('restores choice previews without changing the executable future queue', () => {
    const session = setup('M079_PeatSled', 1, true)
    const response = purchaseMinor(session, 'M079_PeatSled')
    const restored = new GameSession()
    const loaded = restored.loadState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))))
    expect(loaded.ok).toBe(true)
    expect(choices(loaded)).toEqual(choices(response))
    const before = JSON.stringify(restored.withCtx(() => serializeState(restored.state, { engineStack: restored.getEngineStack() })))
    for (let i = 0; i < 3; i += 1) restored.getState()
    expect(JSON.stringify(restored.withCtx(() => serializeState(restored.state, { engineStack: restored.getEngineStack() })))).toBe(before)
    const committed = restored.resolveChoice(0, choices(loaded)[2]!.value)
    expect(committed.ok).toBe(true)
    expect(committed.state.futureMeeples).toMatchObject([{ round: 8, resources: { fuel: 5 } }])
    expect(restored.undoStep().ok).toBe(true)
    expect(restored.state.futureMeeples).toHaveLength(0)
  })
  it('declares the legal farm-cell bindings for a scheduled Cut Peat offer', () => {
    const session = setup('M056_PeatCuttingRights', 5, true)
    const player = session.state.players[0]!
    player.minorPlayed = ['M056_PeatCuttingRights']
    player.farmTerrain = [{ row: 2, col: 0, kind: 'moor' }, { row: 2, col: 1, kind: 'moor' }]
    player.cardStates.M056_PeatCuttingRights = { extraData: { scheduledOffers: [
      { id: 'test-cut-peat', kind: 'moor-special-action', dueRound: 6, actionId: 'cut-peat', consumed: false },
    ] } }
    session.state.players.forEach((candidate) => markAllWorkersUsed(session.state, candidate))
    const response = session.performRoundEnd()
    const options = choices(response).filter((option) => option.value !== '__skip__')
    expect(options.map((option) => option.target)).toEqual([
      { kind: 'farm-cell', playerId: player.id, positions: [{ row: 2, col: 0 }] },
      { kind: 'farm-cell', playerId: player.id, positions: [{ row: 2, col: 1 }] },
    ])
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.farmTerrain).toEqual([{ row: 2, col: 0, kind: 'moor' }])
    expect(resolved.state.players[0]!.resources.fuel).toBe(23)
  })
  it.each([
    [0, 0, 1], [1, 1, 2], [2, 1, 1], [3, 0, 1], [4, 1, 2], [5, 1, 1], [6, 0, 1],
  ])('uses Rod Collection nonlinear scoring from stored wood %i', (woodCount, oneWoodDelta, twoWoodDelta) => {
    const session = setup('E038_RodCollection', 5)
    const player = session.state.players[0]!
    player.minorPlayed = ['E038_RodCollection']
    player.occupationPlayed = ['__test_a__', '__test_b__', '__test_c__']
    player.cardStates.E038_RodCollection = { extraData: { woodCount } }
    const started = session.takeAction(0, 'fishing')
    const options = choices(started).filter((option) => option.value !== '__skip__')
    expect(effects(options[0]!.descriptionPreview)).toContainEqual({ kind: 'cardScore', cardId: 'E038_RodCollection', delta: oneWoodDelta })
    expect(effects(options[1]!.descriptionPreview)).toContainEqual({ kind: 'cardScore', cardId: 'E038_RodCollection', delta: twoWoodDelta })
    const before = JSON.stringify(session.state)
    session.getState()
    expect(JSON.stringify(session.state)).toBe(before)
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.cardStates.E038_RodCollection?.extraData?.woodCount).toBe(woodCount + 2)
    expect(resolved.state.players[0]!.resources.wood).toBe(18)
  })

  it('labels Ombudsman penalty as a card contribution, independent of growth scoring', () => {
    const session = setup('D092_ChildOmbudsman', 5)
    const player = session.state.players[0]!
    player.occupationPlayed = ['D092_ChildOmbudsman']
    player.rooms = 3
    player.roomTiles.push({ row: 0, col: 2 })
    player.cardStates.D092_ChildOmbudsman = { extraData: { negativeScore: 2 } }
    const started = session.takeAction(0, 'day-laborer')
    const option = choices(started).find((entry) => entry.value !== '__skip__')!
    expect(effects(option.descriptionPreview)).toContainEqual({ kind: 'cardScore', cardId: 'D092_ChildOmbudsman', delta: -2 })
    const resolved = session.resolveChoice(0, option.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.cardStates.D092_ChildOmbudsman?.extraData?.negativeScore).toBe(4)
    expect(resolved.state.players[0]!.workers.filter((worker) => worker.isNewborn)).toHaveLength(1)
    expect(resolved.scores[0]!.categories.flatMap((category) => category.entries)).toContainEqual(expect.objectContaining({ cardId: 'D092_ChildOmbudsman', score: -4 }))
  })
  it('shows Timber Shingle Maker source-card points beside renovation payments', () => {
    const session = setup('C132_TimberShingleMaker', 5, false, 3)
    const player = session.state.players[0]!
    player.occupationPlayed = ['C132_TimberShingleMaker']
    player.houseType = 'clay'
    player.cardStates.C132_TimberShingleMaker = { counters: { woodPlaced: 2 } }
    session.state.roundActionOrder[0] = 'house-redevelopment'
    const started = session.takeAction(0, 'house-redevelopment')
    const options = choices(started).filter((option) => option.value !== '__skip__')
    expect(options).toHaveLength(2)
    expect(effects(options[0]!.descriptionPreview)).toContainEqual({ kind: 'cardScore', cardId: 'C132_TimberShingleMaker', delta: 1 })
    expect(effects(options[1]!.descriptionPreview)).toContainEqual({ kind: 'cardScore', cardId: 'C132_TimberShingleMaker', delta: 2 })
    const before = JSON.stringify(session.state)
    session.getState()
    expect(JSON.stringify(session.state)).toBe(before)
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.cardStates.C132_TimberShingleMaker?.counters?.woodPlaced).toBe(4)
    expect(resolved.state.players[0]!.resources.wood).toBe(18)
    expect(resolved.scores[0]!.categories.flatMap((category) => category.entries)).toContainEqual(expect.objectContaining({ cardId: 'C132_TimberShingleMaker', score: 4 }))
  })
  it('identifies an Illusionist discard by canonical minor and occupation names', () => {
    const session = setup('B146_Illusionist', 1, false, 3)
    const player = session.state.players[0]!
    player.occupationPlayed = ['B146_Illusionist']
    player.minorHand = ['A019_Handplow']
    player.occupationHand = ['A116_WoodCutter']
    const started = session.takeAction(0, 'forest')
    const response = session.resolveChoice(0, choices(started).find((option) => option.value !== '__skip__')!.value)
    const options = choices(response)
    expect(options.map((option) => option.labelKey)).toEqual(['occupations.A116_WoodCutter.name', 'minorImprovements.A019_Handplow.name'])
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.minorHand).not.toContain('A019_Handplow')
    expect(resolved.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
    expect(resolved.state.players[0]!.resources.wood).toBe(24)
  })
  it('distinguishes the two Lessons spaces and Traveling Players for Junior Artist', () => {
    const session = setup('B152_JuniorArtist', 1, false, 4)
    session.state.players[0]!.occupationPlayed = ['B152_JuniorArtist']
    session.state.players[0]!.occupationHand = ['A116_WoodCutter']
    session.state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 3
    const started = session.takeAction(0, 'day-laborer')
    const accepted = session.resolveChoice(0, choices(started).find((option) => option.value !== '__skip__')!.value)
    const options = choices(accepted)
    expect(options).toHaveLength(3)
    expect(options.map((option) => effects(option.descriptionPreview)[0])).toEqual([
      { kind: 'actionSpace', spaceId: 'lessons-4', nameKey: 'actions.lessons-4.name', descriptionKey: 'actions.lessons-4.description' },
      { kind: 'actionSpace', spaceId: 'lessons', nameKey: 'actions.lessons.name', descriptionKey: 'actions.lessons.description' },
      { kind: 'actionSpace', spaceId: 'traveling-players', nameKey: 'actions.traveling-players.name', descriptionKey: 'actions.traveling-players.description' },
    ])
    const resolved = session.resolveChoice(0, options[2]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.actionSpaces.find((space) => space.id === 'traveling-players')!.takenBy).toMatchObject([{ playerId: session.state.players[0]!.id }])
    expect(resolved.state.players[0]!.resources.food).toBe(24)
  })
  it('coalesces only equivalent remaining Cattle Stall plans near the last round', () => {
    const session = setup('M131_CattleStall', 11, true)
    const response = purchaseMinor(session, 'M131_CattleStall')
    const options = choices(response)
    expect(options).toHaveLength(4)
    expect(options.map((option) => effects(option.descriptionPreview))).toEqual([
      [{ kind: 'futureOffers', entries: [{ round: 13, resources: { sheep: 1 }, resourcesPaid: { food: 1 } }] }],
      [{ kind: 'futureOffers', entries: [{ round: 13, resources: { boar: 1 }, resourcesPaid: { food: 1 } }] }],
      [{ kind: 'futureOffers', entries: [{ round: 13, resources: { cattle: 1 }, resourcesPaid: { food: 1 } }] }],
      [{ kind: 'futureOffers', entries: [{ round: 13, resources: { horse: 1 }, resourcesPaid: { food: 1 } }] }],
    ])
    const resolved = session.resolveChoice(0, options[3]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.cardStates.M131_CattleStall?.extraData?.scheduledOffers).toMatchObject([{ dueRound: 13, animal: 'horse' }])
    const late = setup('M131_CattleStall', 14, true)
    expect(purchaseMinor(late, 'M131_CattleStall').state.players[0]!.cardStates.M131_CattleStall?.extraData?.scheduledOffers).toBeUndefined()
  })
  it('describes Cattle Stall as optional paid future offers, not guaranteed animals', () => {
    const session = setup('M131_CattleStall', 1, true)
    const response = purchaseMinor(session, 'M131_CattleStall')
    const options = choices(response)
    expect(options).toHaveLength(24)
    expect(effects(options[0]!.descriptionPreview)).toEqual([{
      kind: 'futureOffers', entries: [
        { round: 3, resources: { sheep: 1 }, resourcesPaid: { food: 1 } },
        { round: 5, resources: { boar: 1 }, resourcesPaid: { food: 1 } },
        { round: 7, resources: { cattle: 1 }, resourcesPaid: { food: 1 } },
        { round: 9, resources: { horse: 1 }, resourcesPaid: { food: 1 } },
      ],
    }])
    const before = JSON.stringify(session.state)
    session.getState()
    expect(JSON.stringify(session.state)).toBe(before)
    const resolved = session.resolveChoice(0, options[0]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.cardStates.M131_CattleStall?.extraData?.scheduledOffers).toMatchObject([
      { dueRound: 3, animal: 'sheep', consumed: false }, { dueRound: 5, animal: 'boar', consumed: false },
      { dueRound: 7, animal: 'cattle', consumed: false }, { dueRound: 9, animal: 'horse', consumed: false },
    ])
    expect(resolved.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 0, horse: 0 })
  })
  it('shows all Grain Depot schedules before selecting a payment', () => {
    const session = setup('B065_GrainDepot', 5)
    const response = purchasePayment(session, 'B065_GrainDepot')
    const options = choices(response)
    expect(options).toHaveLength(3)
    expect(options.map((option) => effects(option.descriptionPreview).find((effect) => effect.kind === 'futureSchedule'))).toEqual([
      { kind: 'futureSchedule', entries: [{ round: 6, endRound: 7, resources: { grain: 1 } }] },
      { kind: 'futureSchedule', entries: [{ round: 6, endRound: 8, resources: { grain: 1 } }] },
      { kind: 'futureSchedule', entries: [{ round: 6, endRound: 9, resources: { grain: 1 } }] },
    ])
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.futureMeeples.map((entry) => entry.round)).toEqual([6, 7, 8])
    expect(resolved.state.players[0]!.resources.clay).toBe(18)
  })
  it('shows the Canvas Sack outcome bound to each original payment path', () => {
    const session = setup('C040_CanvasSack', 5)
    session.state.players[0]!.resources.grain = 1
    session.state.players[0]!.resources.reed = 1
    const response = purchasePayment(session, 'C040_CanvasSack')
    const options = choices(response)
    const grain = options.find((option) => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid?.grain === 1)!
    const reed = options.find((option) => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid?.reed === 1)!
    expect(effects(grain.descriptionPreview)).toContainEqual({ kind: 'resourceExchange', resourcesGained: { vegetable: 1 } })
    expect(effects(reed.descriptionPreview)).toContainEqual({ kind: 'resourceExchange', resourcesGained: { wood: 4 } })
    const resolved = session.resolveChoice(0, grain.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 1, reed: 1 })
    expect(resolved.state.log).toContainEqual(expect.objectContaining({ key: 'log.playMinorImprovement', params: expect.objectContaining({ improvements: 'C040_CanvasSack' }) }))
  })
  it('shows distinct legal mixed-resource returns to the collected Forest', () => {
    const session = setup('D180_PartTimeWorker', 1, false, 5)
    const player = session.state.players[0]!
    player.occupationPlayed = ['D180_PartTimeWorker', 'C093_InnerDistrictsDirector']
    player.resources.wood = 0
    player.resources.stone = 0
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    let response = session.takeAction(0, 'clay-pit')
    for (let step = 0; step < 8; step += 1) {
      const options = choices(response)
      if (options.some((option) => effects(option.descriptionPreview).some((effect) => effect.kind === 'resourceMovement'))) break
      const option = options.find((candidate) => candidate.value === 'forest')
        ?? options.find((candidate) => candidate.sourceCard === 'C093_InnerDistrictsDirector' && candidate.value !== '__skip__')
      if (!option) throw new Error(`Expected director placement: ${JSON.stringify(options)}`)
      response = session.resolveChoice(0, option.value)
    }
    const options = choices(response).filter((option) => option.value !== '__skip__')
    expect(options).toHaveLength(2)
    expect(options.map((option) => effects(option.descriptionPreview)[0])).toEqual([
      { kind: 'resourceMovement', resources: { wood: 1, stone: 1 }, from: { kind: 'player' }, to: { kind: 'actionSpace', spaceId: 'forest', nameKey: 'actions.forest.name' } },
      { kind: 'resourceMovement', resources: { wood: 2 }, from: { kind: 'player' }, to: { kind: 'actionSpace', spaceId: 'forest', nameKey: 'actions.forest.name' } },
    ])
    const resolved = session.resolveChoice(0, options[0]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources).toMatchObject({ wood: 2, stone: 0, boar: 1 })
    expect(resolved.state.actionSpaces.find((space) => space.id === 'forest')!.resources).toMatchObject({ wood: 1, stone: 1 })
    expect(resolved.state.events).toContainEqual(expect.objectContaining({ type: 'resource.moved', reason: 'return', resources: { wood: 1, stone: 1 } }))
  })
  it('composes Cooperative Store once without exposing its usage counter or offering stone', () => {
    const session = setup('M126_CooperativeStore', 1, true)
    session.state.players[0]!.minorPlayed = ['M126_CooperativeStore']
    session.state.players[0]!.cardStates.M126_CooperativeStore = { counters: { usage: 1 } }
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    const response = session.takeAnytimeAction(0, 'M126-cooperative-store-anytime')
    const options = choices(response)
    const option = options.find((entry) => entry.effectPreview?.kind === 'resourceExchange' && entry.effectPreview.resourcesPaid?.wood === 1 && entry.effectPreview.resourcesGained?.clay === 1)!
    expect(option).toBeDefined()
    expect(effects(option.descriptionPreview)).toEqual([{ kind: 'resourceExchange', resourcesPaid: { wood: 1 }, resourcesGained: { clay: 1 } }])
    expect(options.some((entry) => entry.effectPreview?.kind === 'resourceExchange' && entry.effectPreview.resourcesGained?.stone)).toBe(false)
    const resolved = session.resolveChoice(0, option.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources).toMatchObject({ wood: 19, clay: 21 })
    expect(resolved.state.players[0]!.cardStates.M126_CooperativeStore?.counters?.usage).toBe(0)
    expect(resolved.interaction.anytimeActions.some((action) => action.id === 'M126-cooperative-store-anytime')).toBe(false)
    const undone = session.undoStep()
    expect(undone.ok).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 20, clay: 20 })
    expect(undone.state.players[0]!.cardStates.M126_CooperativeStore?.counters?.usage).toBe(1)
  })
  it('composes an Emissary exchange once and omits bookkeeping', () => {
    const session = setup('D124_Emissary', 1)
    session.state.players[0]!.occupationPlayed = ['D124_Emissary']
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    const response = session.takeAnytimeAction(0, 'D124-emissary-anytime')
    const option = choices(response).find((entry) => entry.effectPreview?.kind === 'resourceExchange' && entry.effectPreview.resourcesPaid?.wood === 1)!
    expect(option).toBeDefined()
    expect(effects(option.descriptionPreview)).toEqual([
      { kind: 'resourceExchange', resourcesPaid: { wood: 1 }, resourcesGained: { stone: 1 } },
    ])
    const before = JSON.stringify(session.state)
    session.getState()
    expect(JSON.stringify(session.state)).toBe(before)
    const resolved = session.resolveChoice(0, option.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources).toMatchObject({ wood: 19, stone: 21 })
    expect(resolved.state.players[0]!.cardStates.D124_Emissary?.stack).toEqual(['wood'])
    expect(resolved.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === 'D124_Emissary')).toHaveLength(1)
  })
  it('distinguishes crops taken from Seed Trader and executes the selected transfer', () => {
    const session = setup('D114_SeedTrader', 1)
    const player = session.state.players[0]!
    player.occupationPlayed = ['D114_SeedTrader']
    player.cardStates.D114_SeedTrader = { counters: { grain: 2, vegetable: 2 } }
    player.resources.food = 3
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    const response = session.takeAnytimeAction(0, 'D114-seed-trader-anytime')
    const options = choices(response)
    expect(options).toHaveLength(2)
    expect(effects(options[0]!.descriptionPreview)).toContainEqual({
      kind: 'resourceMovement', resources: { grain: 1 },
      from: { kind: 'card', cardId: 'D114_SeedTrader' }, to: { kind: 'player' },
    })
    expect(effects(options[1]!.descriptionPreview)).toContainEqual({
      kind: 'resourceMovement', resources: { vegetable: 1 },
      from: { kind: 'card', cardId: 'D114_SeedTrader' }, to: { kind: 'player' },
    })
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]).toMatchObject({ resources: { food: 0, vegetable: 1 }, cardStates: { D114_SeedTrader: { counters: { vegetable: 1, grain: 2 } } } })
    expect(resolved.state.events).toContainEqual(expect.objectContaining({ type: 'card.stackChanged', cardId: 'D114_SeedTrader', reason: 'take' }))
  })
  it('filters expired Peat Sled targets rather than moving them to round 14', () => {
    const session = setup('M079_PeatSled', 5, true)
    const response = purchaseMinor(session, 'M079_PeatSled')
    expect(choices(response).map((option) => effects(option.descriptionPreview))).toEqual([
      [{ kind: 'futureSchedule', entries: [{ round: 7, resources: { fuel: 3 } }] }],
      [{ kind: 'futureSchedule', entries: [{ round: 9, resources: { fuel: 4 } }] }],
      [{ kind: 'futureSchedule', entries: [{ round: 12, resources: { fuel: 5 } }] }],
    ])
    const late = setup('M079_PeatSled', 14, true)
    const completed = purchaseMinor(late, 'M079_PeatSled')
    expect(completed.ok).toBe(true)
    expect(completed.state.futureMeeples).toHaveLength(0)
    expect(completed.state.players[0]!.resources.wood).toBe(19)
  })

  it('describes Bunny Breeder choices and permits declining its schedule', () => {
    const session = setup('E139_BunnyBreeder', 5, false, 3, true)
    const response = session.takeAction(0, 'lessons')
    const options = choices(response)
    expect(options.filter((option) => option.value !== '__skip__')).toHaveLength(9)
    expect(effects(options[8]!.descriptionPreview)).toEqual([
      { kind: 'futureSchedule', entries: [{ round: 14, resources: { food: 9 } }] },
    ])
    const before = JSON.stringify(session.state)
    session.getState()
    expect(JSON.stringify(session.state)).toBe(before)
    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.ok).toBe(true)
    expect(declined.state.futureMeeples).toHaveLength(0)
    expect(declined.state.players[0]!.resources.food).toBe(20)
    expect(declined.state.log).toContainEqual(expect.objectContaining({ key: 'log.playOccupation' }))
  })

  it('keeps Hauberg ordering labels and separate alternating rewards', () => {
    const session = setup('B041_Hauberg', 5)
    session.state.players[0]!.occupationPlayed = ['__test_a__', '__test_b__', '__test_c__']
    const response = purchaseMinor(session, 'B041_Hauberg')
    const options = choices(response)
    expect(options.map((option) => option.labelKey)).toEqual(['resources.wood', 'resources.boar'])
    expect(effects(options[1]!.descriptionPreview)).toEqual([{
      kind: 'futureSchedule', entries: [
        { round: 6, resources: { boar: 1 } },
        { round: 7, resources: { wood: 2 } },
        { round: 8, resources: { boar: 1 } },
        { round: 9, resources: { wood: 2 } },
      ],
    }])
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.futureMeeples.map(({ round, resources }) => ({ round, resources }))).toEqual([
      { round: 6, resources: { boar: 1 } }, { round: 7, resources: { wood: 2 } },
      { round: 8, resources: { boar: 1 } }, { round: 9, resources: { wood: 2 } },
    ])
  })
  it('groups only identical consecutive future rewards alongside their payment', () => {
    const session = setup('B093_Confidant', 5, false, 2, true)
    session.state.players[0]!.resources.food = 4
    const response = session.takeAction(0, 'lessons')
    const options = choices(response)
    expect(options).toHaveLength(3)
    expect(effects(options[0]!.descriptionPreview)).toEqual([
      { kind: 'payment', resourcesPaid: { food: 2 } },
      { kind: 'futureSchedule', entries: [{ round: 6, endRound: 7, resources: { food: 1 } }] },
    ])
    const resolved = session.resolveChoice(0, options[0]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources.food).toBe(2)
    expect(resolved.state.futureMeeples).toMatchObject([
      { round: 6, resources: { food: 1 } },
      { round: 7, resources: { food: 1 } },
    ])
  })
  it('describes stable schedules as optional construction instead of inventory gains', () => {
    const session = setup('A089_StablePlanner', 2, false, 2, true)
    const response = session.takeAction(0, 'lessons')
    const options = choices(response).filter((option) => option.value !== '__skip__')
    expect(options).toHaveLength(3)
    expect(effects(options[1]!.descriptionPreview)).toEqual([{
      kind: 'futureSchedule',
      entries: [
        { round: 5, resources: {}, actions: [{ kind: 'stable', amount: 1 }] },
        { round: 8, resources: {}, actions: [{ kind: 'stable', amount: 1 }] },
      ],
    }])
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.futureMeeples).toMatchObject([
      { round: 5, resources: { stable: 1 } },
      { round: 8, resources: { stable: 1 } },
    ])
    expect(resolved.state.players[0]!.stableTiles).toHaveLength(0)
    expect(resolved.state.log).toContainEqual(expect.objectContaining({ key: 'log.playOccupation' }))
  })
  it('distinguishes Peat Sled schedules without changing the live game on read', () => {
    const session = setup('M079_PeatSled', 4, true)
    const response = purchaseMinor(session, 'M079_PeatSled')
    const options = choices(response)
    expect(options).toHaveLength(4)
    expect(options.map((option) => effects(option.descriptionPreview))).toEqual([
      [{ kind: 'futureSchedule', entries: [{ round: 6, resources: { fuel: 3 } }] }],
      [{ kind: 'futureSchedule', entries: [{ round: 8, resources: { fuel: 4 } }] }],
      [{ kind: 'futureSchedule', entries: [{ round: 11, resources: { fuel: 5 } }] }],
      [{ kind: 'futureSchedule', entries: [{ round: 14, resources: { fuel: 6 } }] }],
    ])
    const before = JSON.stringify(session.state)
    session.getState()
    session.getState()
    expect(JSON.stringify(session.state)).toBe(before)
    const resolved = session.resolveChoice(0, options[1]!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.futureMeeples).toMatchObject([{ round: 8, resources: { fuel: 4 }, cardId: 'M079_PeatSled' }])
    expect(resolved.state.players[0]!.resources.wood).toBe(19)
    expect(resolved.state.log).toContainEqual(expect.objectContaining({
      key: 'log.playMinorImprovement',
      params: expect.objectContaining({ improvements: 'M079_PeatSled' }),
    }))
  })
})
