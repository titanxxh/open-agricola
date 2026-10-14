import { afterEach, describe, expect, it } from 'vitest'
import '../../shared/cards/register-all'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { cloneState } from '../../shared/session/state-bootstrap'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { BASE_ANIMAL_KEYS } from '../../shared/contract/animals'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
type Animal = 'sheep' | 'boar' | 'cattle'

// #1158: actual four placements enter the ordinary harvest, with finite
// workers unchanged and the two parents physically housed before breeding.
function setup(animal: Animal = 'sheep', round = 4, onlyCooking = false, customCards: CustomCardData[] = [], outsideBreedCard?: 'C084_PerennialRye' | 'D167_PureBreeder') {
  const session = createWorkSession({ seed: 115818, customCards, options: { playerCount: outsideBreedCard === 'D167_PureBreeder' ? 4 : 2 }, configure(state) {
    state.round = round
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 100
    }
    const owner = state.players[0]!
    owner.improvements = ['Major_Fireplace1']
    owner.occupationPlayed = onlyCooking ? [] : ['B104_SheepWalker']
    owner.minorPlayed = customCards.map(card => card.cardJson.id)
    if (outsideBreedCard === 'C084_PerennialRye') {
      owner.minorPlayed.push(outsideBreedCard)
      owner.occupationPlayed = ['A116_WoodCutter', 'A125_Priest']
      owner.resources.grain = 1
    } else if (outsideBreedCard) owner.occupationPlayed = [outsideBreedCard]
    owner.resources[animal] = 2
    owner.resources.vegetable = onlyCooking ? 0 : 1
    owner.pastures = [{ id: 'parents', tiles: [{ row: 0, col: 1 }], animalType: animal, animalCount: 2 }]
    owner.stableTiles = [{ row: 0, col: 1 }]
    owner.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({
      edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
    }))
    state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_Fireplace1')
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
  } })
  sessions.push(session)
  return session
}

function ok(response: SessionResponse) {
  expect(response.ok, response.error).toBe(true)
  return response
}

function advance(session: GameSession, stop: 'animal-reorg' | 'feed' | 'finished' = 'animal-reorg') {
  let response = session.getState()
  for (let n = 0; n < 50; n++) {
    const interaction = response.interaction
    if (response.state.gameOver || (stop === 'finished' && response.state.roundPhase === 'work' && response.state.round > 4)) return response
    if (interaction.stateId === 'idle') {
      const available = session.getActionAvailability(response.state.currentPlayerIndex)
      const action = ['forest', 'reed-bank', 'clay-pit', 'day-laborer', 'fishing', 'copse', 'hollow-4', 'resource-market', 'grain-seeds'].find(id => available[id])
      if (!action) throw new Error('No legal base action')
      response = ok(session.takeAction(response.state.currentPlayerIndex, action))
    } else if (interaction.stateId === 'wait') {
      if (interaction.request.kind === stop) return response
      if (interaction.request.kind === 'feed') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
      else if (interaction.request.kind === 'choice') {
        const cardGain = interaction.request.options.find(option => option.sourceCard === 'D167_PureBreeder' && option.value !== '__skip__')
        response = ok(session.resolveChoice(interaction.playerIndex, cardGain?.value ?? '__skip__'))
      }
      else if (interaction.request.kind === 'confirm-next-player' || interaction.request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm'))
      else throw new Error(`Unexpected request ${interaction.request.kind}`)
    } else throw new Error(`Unexpected interaction ${interaction.stateId}`)
  }
  throw new Error('Harvest did not progress')
}

function cookingOptions(response: SessionResponse) {
  return sessionOptions(response).filter(option => option.effectPreview?.kind === 'resourceExchange'
    && (option.effectPreview.resourcesGained?.food ?? 0) > 0
    && BASE_ANIMAL_KEYS.some(animal => (option.effectPreview?.kind === 'resourceExchange' && (option.effectPreview.resourcesPaid?.[animal] ?? 0) > 0)))
}

function sessionOptions(response: SessionResponse) {
  const interaction = response.interaction
  return interaction.stateId === 'wait' && interaction.request.kind === 'choice' ? interaction.request.options : []
}

function snapshot(response: SessionResponse): SessionResponse {
  return { ...response, state: cloneState(response.state), interaction: structuredClone(response.interaction) }
}

describe('ordinary harvest breeding forbids animal cooking', () => {
  it.each(['sheep', 'boar', 'cattle'] as const)('offers no %s cooking, preserves crop cooking and completes placement', animal => {
    const session = setup(animal)
    const pending = advance(session)
    expect(pending.state.roundPhase).toBe('breeding')
    expect(pending.state.players[0]!.resources[animal]).toBe(3)
    expect(pending.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    const host = session.peekEnginePendingEnvelope()?.hostNodeId
    const opened = ok(session.takeAnytimeAction(0, 'exchange'))
    expect(cookingOptions(opened)).toEqual([])
    expect(sessionOptions(opened)).toContainEqual(expect.objectContaining({ effectPreview: expect.objectContaining({ resourcesPaid: { vegetable: 1 }, resourcesGained: { food: 2 } }) }))
    const cancelled = ok(session.resolveChoice(0, 'cancel'))
    expect(cancelled.interaction).toEqual(pending.interaction)
    expect(session.peekEnginePendingEnvelope()?.hostNodeId).toBe(host)
    const placed = ok(session.resolveChoice(0, 'confirm', { zones: [{ id: 'parents', zoneType: 'pasture', animalType: animal, animalCount: 3 }] }))
    expect(placed.state.players[0]!.pastures[0]!.animalCount).toBe(3)
    expect(advance(session, 'finished').state.round).toBe(5)
  })

  it.each(['trade:0:1', 'bulk:0=1', 'bulk:3=1,0=3'])('rejects forged cooking %s atomically and accepts a legal nonfood trade', choice => {
    const session = setup()
    advance(session)
    const opened = snapshot(ok(session.takeAnytimeAction(0, 'exchange')))
    const stone = sessionOptions(opened).find(option => option.effectPreview?.kind === 'resourceExchange' && (option.effectPreview.resourcesGained?.stone ?? 0) > 0)
    expect(stone, JSON.stringify(sessionOptions(opened))).toBeDefined()
    const rejected = session.resolveChoice(0, choice)
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(opened.state)
    expect(rejected.interaction).toEqual(opened.interaction)
    expect(rejected.state.log).toEqual(opened.state.log)
    const traded = ok(session.resolveChoice(0, `bulk:${stone!.value.split(':')[1]}=1`))
    expect(traded.state.players[0]!.resources).toMatchObject({ sheep: 2, stone: 1 })
    expect(traded.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    ok(session.resolveChoice(0, 'confirm', { zones: [{ id: 'parents', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }] }))
    expect(advance(session, 'finished').state.round).toBe(5)
  })

  it('rejects exchange admission when cooking is the only available recipe', () => {
    const session = setup('sheep', 4, true)
    advance(session)
    const before = snapshot(session.getState())
    expect(before.interaction.anytimeActions.some(action => action.id === 'exchange')).toBe(false)
    const rejected = session.takeAnytimeAction(0, 'exchange')
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
  })

  it('still permits cooking parents during feeding before ordinary breeding', () => {
    const session = setup()
    const feeding = advance(session, 'feed')
    expect(feeding.state.roundPhase).toBe('feeding')
    if (feeding.interaction.stateId !== 'wait' || feeding.interaction.request.kind !== 'feed') throw new Error('Expected feeding')
    const sheep = feeding.interaction.request.exchangeCatalog?.find(entry => entry.from.sheep === 1 && entry.to.food === 2)
    expect(sheep).toBeDefined()
    const food = feeding.state.players[0]!.resources.food
    const cooked = ok(session.resolveChoice(0, 'confirm', { selections: [{ sourceId: sheep!.sourceId, exchangeIndex: sheep!.exchangeIndex, count: 2 }] }))
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 0, food: food + 4 })
    expect(cooked.state.events).toContainEqual(expect.objectContaining({ type: 'harvest.feedConverted', cost: { sheep: 2 }, food: { food: 4 } }))
  })

  it('applies the same prohibition during the final harvest and finishes scoring', () => {
    const session = setup('sheep', 14)
    const pending = advance(session)
    expect(pending.state.round).toBe(14)
    expect(pending.state.roundPhase).toBe('breeding')
    const opened = ok(session.takeAnytimeAction(0, 'exchange'))
    expect(cookingOptions(opened)).toEqual([])
    ok(session.resolveChoice(0, 'cancel'))
    ok(session.resolveChoice(0, 'confirm', { zones: [{ id: 'parents', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 }] }))
    const completed = advance(session, 'finished')
    expect(completed.state.gameOver).toBe(true)
    expect(completed.scores).toHaveLength(2)
    expect(completed.state.players[0]!.resources.sheep).toBe(3)
  })

  it('ends the prohibition before an onEndHarvest animal gain is cooked', () => {
    const id = 'CUSTOM_AfterBreedSheep'
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${id}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'After Breed Sheep' })
const CARD_IMPL = { effect: { id: CARD_ID, onEndHarvest: () => ({ type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, params: { sheep: 1 } }) } }
`, id)
    if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
    const card: CustomCardData = { cardType: 'minor', cardJson: { id, name: 'After Breed Sheep', deck: 'CUSTOM', number: 0, desc: [] }, compiledCode: compiled.compiledCode, codeManifest: compiled.manifest }
    const session = setup('sheep', 4, false, [card])
    advance(session)
    const afterBreed = ok(session.resolveChoice(0, 'confirm', { zones: [{ id: 'parents', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 }] }))
    expect(afterBreed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    expect(afterBreed.state.roundPhase).toBe('harvest')
    expect(afterBreed.state.players[0]!.resources.sheep).toBe(4)
    const opened = ok(session.takeAnytimeAction(0, 'exchange'))
    const recipe = cookingOptions(opened).find(option => option.effectPreview?.kind === 'resourceExchange' && (option.effectPreview.resourcesPaid?.sheep ?? 0) > 0)
    expect(recipe).toBeDefined()
    const food = opened.state.players[0]!.resources.food
    const cooked = ok(session.resolveChoice(0, `bulk:${recipe!.value.split(':')[1]}=1`))
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 3, food: food + 2 })
    ok(session.resolveChoice(0, 'confirm', { zones: [{ id: 'parents', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 }] }))
    expect(advance(session, 'finished').state.round).toBe(5)
  })

  it('starts breeding only after the end-feeding animal gain is cooked and housed', () => {
    const id = 'CUSTOM_EndFeedingSheep'
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${id}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'End Feeding Sheep' })
const CARD_IMPL = { effect: { id: CARD_ID, onEndHarvestFeedingPhase: () => ({ type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, params: { sheep: 1 } }) } }
`, id)
    if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
    const card: CustomCardData = { cardType: 'minor', cardJson: { id, name: 'End Feeding Sheep', deck: 'CUSTOM', number: 0, desc: [] }, compiledCode: compiled.compiledCode, codeManifest: compiled.manifest }
    const session = setup('sheep', 4, false, [card])
    const pending = advance(session)
    expect(pending.state.roundPhase).toBe('feeding')
    expect(pending.state.completedFeedingPhases).toBe(1)
    expect(pending.state.players[0]!.resources.sheep).toBe(3)
    expect(pending.state.events.filter(event => event.type === 'harvest.phaseStarted' && event.harvestPhase === 'breeding')).toEqual([])
    const opened = ok(session.takeAnytimeAction(0, 'exchange'))
    const recipe = cookingOptions(opened)[0]!
    expect(recipe).toBeDefined()
    const cooked = ok(session.resolveChoice(0, `bulk:${recipe.value.split(':')[1]}=1`))
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 98 })
    const ordinaryBreed = ok(session.resolveChoice(0, 'confirm', { zones: [{ id: 'parents', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }] }))
    expect(ordinaryBreed.state.roundPhase).toBe('breeding')
    expect(ordinaryBreed.state.completedFeedingPhases).toBe(1)
    expect(ordinaryBreed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    expect(ordinaryBreed.state.players[0]!.resources.sheep).toBe(3)
    const events = ordinaryBreed.state.events
    const gainIndex = events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === id && event.resources.sheep === 1)
    const cookingIndex = events.findIndex(event => event.type === 'resource.exchanged' && event.paid.sheep === 1)
    const breedingIndex = events.findIndex(event => event.type === 'harvest.phaseStarted' && event.harvestPhase === 'breeding')
    expect(gainIndex).toBeGreaterThan(-1)
    expect(cookingIndex).toBeGreaterThan(gainIndex)
    expect(breedingIndex).toBeGreaterThan(cookingIndex)
    expect(events.filter(event => event.type === 'harvest.phaseStarted' && event.harvestPhase === 'breeding')).toHaveLength(1)
    expect(events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'feeding' && event.actorPlayerId === ordinaryBreed.state.players[0]!.id)).toHaveLength(1)
    const breedMenu = ok(session.takeAnytimeAction(0, 'exchange'))
    expect(cookingOptions(breedMenu)).toEqual([])
    ok(session.resolveChoice(0, 'cancel'))
    ok(session.resolveChoice(0, 'confirm', { zones: [{ id: 'parents', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 }] }))
    const completed = advance(session, 'finished')
    expect(completed.state.round).toBe(5)
    expect(completed.state.completedFeedingPhases).toBe(1)
    expect(completed.state.players[0]!.resources).toMatchObject({ sheep: 3, food: 98 })
  })

  it('still cooks an animal received from a work-phase action before housing it', () => {
    const session = setup('sheep', 5)
    const pending = ok(session.takeAction(0, 'sheep-market'))
    expect(pending.state.roundPhase).toBe('work')
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    const host = session.peekEnginePendingEnvelope()?.hostNodeId
    const before = pending.state.players[0]!.resources.sheep
    const food = pending.state.players[0]!.resources.food
    const opened = ok(session.takeAnytimeAction(0, 'exchange'))
    const recipe = cookingOptions(opened)[0]!
    expect(recipe).toBeDefined()
    const cooked = ok(session.resolveChoice(0, `bulk:${recipe.value.split(':')[1]}=1`))
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: before - 1, food: food + 2 })
    expect(cooked.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    expect(session.peekEnginePendingEnvelope()?.hostNodeId).toBe(host)
  })

  it.each(['C084_PerennialRye', 'D167_PureBreeder'] as const)('still cooks %s animals outside ordinary breeding', card => {
    const session = setup('sheep', 5, false, [], card)
    const pending = card === 'C084_PerennialRye'
      ? ok(session.takeAnytimeAction(0, 'C84-perennial-rye-anytime'))
      : advance(session)
    expect(pending.state.roundPhase).not.toBe('breeding')
    expect(pending.state.players[0]!.resources.sheep).toBe(3)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (card === 'C084_PerennialRye') expect(pending.state.players[0]!.resources.grain).toBe(0)
    const food = pending.state.players[0]!.resources.food
    const opened = ok(session.takeAnytimeAction(0, 'exchange'))
    const recipe = cookingOptions(opened)[0]!
    expect(recipe).toBeDefined()
    const cooked = ok(session.resolveChoice(0, `bulk:${recipe.value.split(':')[1]}=3`))
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 0, food: food + 6 })
    const placed = ok(session.resolveChoice(0, 'confirm', { zones: [] }))
    if (card === 'D167_PureBreeder') expect(placed.state.round).toBe(6)
    else expect(placed.state.round).toBe(5)
    expect(placed.interaction.stateId).toBe('idle')
  })
})
