import { afterEach, describe, expect, it } from 'vitest'
import type { ChoiceDescriptionPreview, ChoiceEffectPreview } from '../../shared/contract/types'
import { recallPlacedWorkerAction } from '../../shared/actions/effects/internal/recall-placed-worker'
import { workersAvailable, familySize, markAllWorkersUsed } from '../../shared/domain/player'
import { descriptionEffects } from './_helpers/choice-description'
import { createWorkSession } from './_helpers/session-fixtures'
import '../../shared/cards/A/A071_ClearingSpade'
import '../../shared/cards/C/C018_RollOverPlow'
import '../../shared/cards/C/C057_Crudite'
import '../../shared/cards/C/C069_LandConsolidation'
import '../../shared/cards/B/B157_Salter'
import '../../shared/cards/D/D159_ReedSeller'
import '../../shared/cards/D/D150_GodlySpouse'
import '../../shared/cards/E/E027_PiggyBank'
import '../../shared/cards/E/E086_PenBuilder'
import '../../shared/cards/E/E134_Omnifarmer'
import '../../shared/cards/M/M084_BogPony'
import '../../shared/cards/M/M090_WinterStorehouse'
import '../../shared/cards/M/M125_HardwareStore'
import '../../shared/cards/M/M126_CooperativeStore'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (cardId: string, moor = false) => {
  const session = createWorkSession({ seed: 1117, options: { enableFarmersOfTheMoor: moor }, configure: state => {
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed = cardId.startsWith('B157') || cardId.startsWith('D159') || cardId.startsWith('E086') || cardId.startsWith('E134') ? [] : [cardId]
    player.occupationPlayed = player.minorPlayed.length ? [] : [cardId]
    for (const owner of state.players) {
      Object.assign(owner.resources, { wood: 20, clay: 20, reed: 20, stone: 20, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    }
  } })
  sessions.push(session)
  return session
}
const effects = (description?: ChoiceDescriptionPreview): ChoiceEffectPreview[] => !description ? [] : description.kind === 'action'
  ? description.effectPreview ? [description.effectPreview] : []
  : description.kind === 'conditional' ? effects(description.body) : description.parts.flatMap(effects)
const preview = (session: ReturnType<typeof setup>, cardId: string) => {
  const before = JSON.stringify(session.state)
  const action = session.getState().interaction.anytimeActions.find(entry => entry.sourceCard === cardId)
  expect(action).toBeDefined()
  expect(JSON.stringify(session.state)).toBe(before)
  return { id: action!.id, effects: effects(action!.descriptionPreview) }
}

describe('opaque actions use executable operation data', () => {
  it('Godly Spouse does not recall or activate when the first worker was placed on Meeting Place', () => {
    const card = 'D150_GodlySpouse', session = setup(card)
    const state = session.getState().state, owner = state.players[0]!
    state.round = 8
    owner.minorPlayed = []; owner.occupationPlayed = [card]
    owner.rooms = 3; owner.roomTiles.push({ row: 0, col: 2 })
    const firstWorker = owner.workers[0]!.id, secondWorker = owner.workers[1]!.id
    session.loadState(state)
    let response = session.takeAction(0, 'meeting-place')
    for (let count = 0; count < 12 && response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'confirm-next-player'; count++) {
      const skip = response.interaction.request.options.find(option => option.value === '__skip__' || option.value === '__pass__')
      expect(skip).toBeDefined()
      response = session.resolveChoice(0, skip!.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    response = session.takeAction(1, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find(space => space.id === 'meeting-place')!.takenBy).toContainEqual(expect.objectContaining({ playerId: owner.id, workerId: firstWorker }))
    expect(response.state.actionSpaces.find(space => space.id === 'wish-children')!.takenBy).toContainEqual(expect.objectContaining({ playerId: owner.id, workerId: secondWorker }))
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.workers.filter(worker => worker.isActive && worker.isNewborn)).toHaveLength(1)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.cardStates[card]?.flagged).not.toBe(true)
    expect(response.state.events?.filter(event => event.type === 'card.triggered' && event.cardId === card)).toEqual([])
    expect(response.state.log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === card)).toEqual([])
    expect(response.scores).toHaveLength(2)
  })

  it('Recall describes the actual placed worker and returns it during a real two-player growth action', () => {
    const card = 'D150_GodlySpouse', session = setup(card)
    const state = session.getState().state, owner = state.players[0]!
    state.round = 8
    owner.minorPlayed = []; owner.occupationPlayed = [card]
    owner.rooms = 3; owner.roomTiles.push({ row: 0, col: 2 })
    markAllWorkersUsed(state, state.players[1]!)
    const firstWorker = owner.workers[0]!.id
    session.loadState(state)
    let response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    response = session.resolveChoice(0, 'confirm')
    expect(response.ok, response.error).toBe(true)
    const before = JSON.stringify(session.state)
    const live = session.state
    const preview = recallPlacedWorkerAction.previewEffect?.({ state: live, player: live.players[0]!, space: live.actionSpaces.find(space => space.id === 'grain-seeds')!, sourceCard: card, params: { workerId: firstWorker, noOpIfMissing: true } })
    expect(preview).toEqual({ kind: 'workerRecall', destination: { kind: 'home' }, workers: [{ workerId: firstWorker, spaceId: 'grain-seeds', spaceNameKey: 'actions.grain-seeds.name' }], select: false, noOp: false })
    expect(JSON.stringify(session.state)).toBe(before)
    response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy).toEqual([])
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.cardStates[card]!.flagged).toBe(true)
    expect(recallPlacedWorkerAction.previewEffect?.({ state: response.state, player: response.state.players[0]!, space: response.state.actionSpaces[0]!, params: { workerId: firstWorker, noOpIfMissing: true } })).toMatchObject({ noOp: true, workers: [] })
  })

  it('Exchange describes the current recipe catalog and executes the selected real recipe', () => {
    const session = setup('Major_Fireplace1')
    const state = session.getState().state, player = state.players[0]!
    player.minorPlayed = []
    player.improvements = ['Major_Fireplace1']
    player.resources.boar = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'boar']));
    session.loadState(state)
    const before = JSON.stringify(session.state)
    const exchange = session.getState().interaction.anytimeActions.find(action => action.id === 'exchange')!
    const catalog = effects(exchange.descriptionPreview).find(effect => effect.kind === 'exchangeCatalog')
    expect(catalog?.kind).toBe('exchangeCatalog')
    if (catalog?.kind !== 'exchangeCatalog') throw new Error('missing actual exchange catalog')
    expect(catalog.choices).toContainEqual({ sourceCard: 'Major_Fireplace1', resourcesPaid: { boar: 1 }, resourcesGained: { food: 2 }, minTimes: 1, maxTimes: 1 })
    expect(JSON.stringify(session.state)).toBe(before)
    let response = session.takeAnytimeAction(0, exchange.id)
    const option = response.interaction.request.options.find(option => option.sourceCard === 'Major_Fireplace1' && option.effectPreview?.resourcesPaid?.boar === 1 && option.effectPreview?.resourcesGained?.food === 2)!
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 22 })
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.exchanged', paid: { boar: 1 }, gained: { food: 2 } }))
  })

  it.each([false, true])('Omnifarmer derives the exact deposit and score; skip=%s', skip => {
    const card = 'E134_Omnifarmer', session = setup(card)
    const state = session.getState().state
    state.round = 4
    const player = state.players[0]!
    player.fields = [{ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
    player.cardStates[card] = { extraData: { storedGoods: ['grain'] } }
    for (const owner of state.players) markAllWorkersUsed(state, owner)
    session.loadState(state)
    let response = session.performRoundEnd()
    for (let count = 0; count < 12 && response.interaction.stateId === 'wait' && response.interaction.promptKey !== 'ui.interactionE134Prompt'; count++) {
      if (response.interaction.request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else {
        const pass = response.interaction.request.options.find(option => option.value === '__skip__' || option.value === '__pass__')
        expect(pass).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, pass!.value)
      }
    }
    expect(response.interaction.promptKey).toBe('ui.interactionE134Prompt')
    const option = response.interaction.request.options.find(option => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'payment' && effect.resourcesPaid?.vegetable === 1))!
    expect(descriptionEffects(option.descriptionPreview)).toEqual([
      { kind: 'payment', resourcesPaid: { vegetable: 1 } },
      { kind: 'cardScore', cardId: card, delta: 3 },
    ])
    response = session.resolveChoice(0, skip ? '__skip__' : option.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(skip ? 1 : 0)
    expect(response.state.players[0]!.cardStates[card]!.extraData?.storedGoods).toEqual(skip ? ['grain'] : ['grain', 'vegetable'])
    expect(response.scores[0]!.categories.find(category => category.key === 'cardBonusVp')?.total ?? 0).toBe(skip ? 0 : 3)
  })

  it('Land Consolidation describes three field grain replaced by one field vegetable without supply payment', () => {
    const card = 'C069_LandConsolidation', session = setup(card)
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
    session.loadState(state)
    const action = preview(session, card)
    expect(action.effects).toEqual([{ kind: 'fieldOperation', operation: { kind: 'replace', from: 'grain', fromAmount: 3, to: 'vegetable', toAmount: 1 }, minSelections: 1, maxSelections: 1 }])
    expect(session.takeAnytimeAction(0, action.id).ok).toBe(true)
    const response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 20, grain: 0, vegetable: 0 })
    expect(response.scores).toHaveLength(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'farm.cropRemoved' }))
    expect(response.interaction.anytimeActions.some(entry => entry.id === action.id)).toBe(false)
  })

  it('Crudite describes per-selected-field food and gains eight once for two selected fields', () => {
    const card = 'C057_Crudite', session = setup(card)
    const state = session.getState().state
    state.players[0]!.fields = [2, 3, 1].map((remaining, col) => ({ row: 0, col: col + 2, stacks: [{ kind: 'vegetable', remaining }] }))
    session.loadState(state)
    const action = preview(session, card)
    expect(action.effects).toContainEqual({ kind: 'fieldOperation', operation: { kind: 'remove-top', amount: 1, gain: { food: 4 } }, minSelections: 1, maxSelections: 2 })
    expect(session.takeAnytimeAction(0, action.id).ok).toBe(true)
    const before = session.getState().state.players[0]!.resources.food
    const response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }, { row: 0, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(before + 8)
    expect(response.state.players[0]!.fields.map(field => field.stacks[0]!.remaining)).toEqual([1, 2, 1])
    expect(response.state.events?.filter(event => event.type === 'resource.moved' && event.resources.food === 8)).toHaveLength(1)
  })

  it('Clearing Spade describes a field-to-field move and waits for both targets', () => {
    const card = 'A071_ClearingSpade', session = setup(card)
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }, { row: 0, col: 3, stacks: [] }]
    session.loadState(state)
    const action = preview(session, card)
    expect(action.effects).toContainEqual({ kind: 'fieldOperation', operation: { kind: 'move', amount: 1 }, minSelections: 1, maxSelections: 1 })
    expect(session.takeAnytimeAction(0, action.id).ok).toBe(true)
    expect(session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] }).interaction.request.kind).toBe('selection')
    const response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map(field => field.stacks[0]!.remaining)).toEqual([2, 1])
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it.each(['M090_WinterStorehouse', 'M125_HardwareStore', 'M126_CooperativeStore'])('%s includes the real usage counter cost', card => {
    const session = setup(card, true)
    const state = session.getState().state
    const player = state.players[0]!
    player.cardStates[card] = { counters: { usage: 1 } }
    Object.assign(player.resources, { food: 0, fuel: 0, wood: 1, clay: 0, reed: 0, stone: 0 })
    session.loadState(state)
    const action = preview(session, card)
    expect(action.effects).toContainEqual({ kind: 'cardCounter', cardId: card, counter: 'usage', amount: -1 })
    let response = session.takeAnytimeAction(0, action.id)
    if (card === 'M126_CooperativeStore') {
      const choice = response.interaction.request.options[0]
      expect(choice).toBeDefined()
      response = session.resolveChoice(0, choice!.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[card]!.counters!.usage).toBe(0)
    expect(response.interaction.anytimeActions.some(entry => entry.id === action.id)).toBe(false)
  })

  it('Bog Pony derives lying marker and fuel from the same operation, without spending the horse', () => {
    const card = 'M084_BogPony', session = setup(card, true)
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.horse = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'horse']));
    session.loadState(state)
    const action = preview(session, card)
    expect(action.effects).toContainEqual({ kind: 'animalPose', animal: 'horse', amount: 1, pose: 'lying', resourcesGained: { fuel: 2 } })
    const response = session.takeAnytimeAction(0, action.id)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.horse).toBe(1)
    expect(response.state.players[0]!.cardStates[card]?.extraData?.lyingHorseCount).toBe(1)
    expect(response.state.players[0]!.resources.fuel).toBe((state.players[0]!.resources.fuel ?? 0) + 2)
  })

  it('Pen Builder describes its actual two-animal capacity increment', () => {
    const card = 'E086_PenBuilder', session = setup(card)
    const action = preview(session, card)
    expect(action.effects).toEqual([{ kind: 'payment', resourcesPaid: { wood: 1 } }, { kind: 'animalCapacity', amount: 2 }])
    const response = session.takeAnytimeAction(0, action.id)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(19)
    expect(response.state.players[0]!.cardStates[card]?.counters?.discards).toBe(1)
  })

  it('Salter describes unresolved animal quantities with the actual truncated schedule', () => {
    const card = 'B157_Salter', session = setup(card)
    const state = session.getState().state
    state.round = 13
    const player = state.players[0]!
    player.resources.sheep = 2; player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    player.stableTiles = [{ row: 0, col: 2 }]; player.stableAnimals = { '0-2': 'sheep' }
    session.loadState(state)
    const action = preview(session, card)
    expect(action.effects).toContainEqual(expect.objectContaining({ kind: 'resourceQuantitySchedule', choices: expect.arrayContaining([{ resource: 'sheep', available: 2, rounds: [14], resourcesPerUnit: { food: 1 } }]) }))
    expect(session.takeAnytimeAction(0, action.id).ok).toBe(true)
    const response = session.commitSelectionChoice(0, { resourceCounts: { sheep: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.futureMeeples).toEqual([expect.objectContaining({ round: 14, resources: { food: 2 } })])
  })

  it.each([0, -1, 1.5, Number.NaN, 3])('Salter rejects invalid quantity %s without changing animals or schedules', amount => {
    const card = 'B157_Salter', session = setup(card)
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 2
    player.pastures = [{ id: 'sheep', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: 'sheep', animalCount: 2 }]
    session.loadState(state)
    expect(session.takeAnytimeAction(0, preview(session, card).id).ok).toBe(true)
    const before = structuredClone(session.getState().state.players)
    const response = session.commitSelectionChoice(0, { resourceCounts: { sheep: amount } })
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    expect(response.state.futureMeeples).toEqual([])
    expect(response.interaction.request.kind).toBe('resource-quantity-select')
  })

  it('Salter consumes its owner animal hosted on another player Night Pasture', () => {
    const card = 'B157_Salter', session = setup(card, true)
    const state = session.getState().state
    const guest = state.players[0]!, host = state.players[1]!
    guest.resources.sheep = 1
    host.minorPlayed = ['M033_NightPasture']
    const zoneId = `card:M033_NightPasture:owner:${host.id}:animalOwner:${guest.id}`
    host.cardStates.M033_NightPasture = { extraData: { animalCountsByZone: { [zoneId]: {
      animalCounts: { sheep: 1 }, ownerPlayerId: host.id, animalOwnerPlayerId: guest.id,
      cardId: 'M033_NightPasture', capacity: 1, allowedAnimalType: null,
    } } } }
    session.loadState(state)
    const action = preview(session, card)
    const response = session.takeAnytimeAction(0, action.id)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.futureMeeples.map(entry => entry.round)).toEqual([6, 7, 8])
    const stored = response.state.players[1]!.cardStates.M033_NightPasture?.extraData?.animalCountsByZone
    expect(stored).toEqual({ [zoneId]: { allowedAnimalType: null, animalOwnerPlayerId: guest.id, capacity: 1, cardId: 'M033_NightPasture', ownerPlayerId: host.id } })
  })

  it('Roll-Over Plow describes discarding all crops then plowing and preserves the selected target', () => {
    const card = 'C018_RollOverPlow', session = setup(card)
    const state = session.getState().state
    state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]
    session.loadState(state)
    const action = preview(session, card)
    expect(action.effects).toContainEqual({ kind: 'fieldOperation', operation: { kind: 'discard-all' }, minSelections: 1, maxSelections: 1 })
    expect(session.takeAnytimeAction(0, action.id).ok).toBe(true)
    let response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(response.interaction.request.farm?.farmType).toBe('plow')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 4 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 4, stacks: [] })
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('Piggy Bank pays six stored food and chooses a free major while closing the flag', () => {
    const card = 'E027_PiggyBank', session = setup(card)
    const state = session.getState().state
    state.players[0]!.cardStates[card] = { counters: { food: 6 } }
    session.loadState(state)
    const action = preview(session, card)
    expect(action.effects).toContainEqual(expect.objectContaining({ kind: 'resourceMovement', resources: { food: 6 } }))
    let response = session.takeAnytimeAction(0, action.id)
    expect(response.ok, response.error).toBe(true)
    const option = response.interaction.request.options.find(entry => entry.value === 'major:Major_Fireplace1' || entry.value === 'Major_Fireplace1')
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 20, clay: 20, wood: 20, stone: 20 })
    expect(response.state.players[0]!.cardStates[card]?.counters?.food).toBe(0)
    expect(response.state.players[0]!.cardStates[card]?.flagged ?? false).toBe(false)
    expect(response.interaction.anytimeActions.some(entry => entry.id === action.id)).toBe(false)
  })

  it('Reed Seller describes supply reward and other-player paid purchase from one sale plan', () => {
    const card = 'D159_ReedSeller', session = setup(card)
    const action = preview(session, card)
    expect(action.effects).toEqual([{ kind: 'resourceSale', resourcesSold: { reed: 1 }, supplyReward: { food: 3 }, buyerPays: { food: 2 } }])
    let response = session.takeAnytimeAction(0, action.id)
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    expect(response.interaction.playerIndex).toBe(1)
    response = session.resolveChoice(1, 'buy')
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 19, food: 22 })
    expect(response.state.players[1]!.resources).toMatchObject({ reed: 21, food: 18 })
  })
})
