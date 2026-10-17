// Helpers of ae-negative-57-livestock-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { ActionChoiceOption, GameState, PlayerState } from '../../../../shared/contract/types'
import type { AnimalKey } from '../../../../shared/contract/animals'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/57/livestock-oa-probes'
export const animals = ['sheep', 'boar', 'cattle'] as const
export const fenceEdges = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
export function ok(response: SessionResponse): SessionResponse {
  assert.equal(response.ok, true, `${response.error} ${JSON.stringify(response.interaction)}`)
  return JSON.parse(JSON.stringify(response))
}
export function save(id: string, value: unknown) {
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2))
}
export function make(card: string, configure: (state: GameState) => void = () => {}, played = true, round = 5) {
  const session = createWorkSession({ seed: 4257, options: { playerCount: 4 }, configure(state) {
    state.round = round
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.occupationPlayed = []
      player.minorPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 100, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    }
    state.players[0]!.occupationPlayed = played ? [card] : []
    state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [card, 'A110_Roughcaster']
    configure(state)
  } })
  sessions.push(session)
  return session
}
export function pasture(player: PlayerState, animal: AnimalKey | null = null, count = 0, stable = false) {
  player.pastures = [{ id: 'negative58-pasture', tiles: [{ row: 0, col: 1 }], animalType: animal, animalCount: count }]
  player.fenceSegments = fenceEdges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
  player.stableTiles = stable ? [{ row: 0, col: 1 }] : []
  if (animal) player.resources[animal] = count
}
export function finish(session: GameSession, initial: SessionResponse, accept = false): SessionResponse {
  let response = ok(initial)
  for (let step = 0; step < 80 && response.interaction.stateId === 'wait'; step++) {
    response = passPreparationExchanges(session, response)
    const interaction = response.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind === 'confirm-next-player') return ok(response)
    const request = interaction.request
    if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (request.kind === 'select-trigger') {
      const option = request.options.find(option => !('disabled' in option && option.disabled) && option.value !== '__pass__' && option.labelKey !== 'actions.exchange.name')
      assert.ok(option, JSON.stringify(interaction))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else if (request.kind === 'choice') {
      const option = (accept ? request.options.find(option => !option.disabled && !['__skip__', '__done__', '__pass__'].includes(option.value) && option.labelKey !== 'actions.exchange.name') : undefined)
        ?? request.options.find(option => !option.disabled && ['__skip__', '__done__', '__pass__'].includes(option.value))
      assert.ok(option, JSON.stringify(interaction))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else if (request.kind === 'animal-reorg') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { zones: request.zones }))
    else if (request.kind === 'feed') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
    else if (request.kind === 'farm-select' && request.farm.farmType === 'plow') response = ok(session.commitSelectionChoice(interaction.playerIndex, { tile: request.farm.selectableTiles.find(tile => tile.row === 0 && tile.col === 2) ?? request.farm.selectableTiles[0]! }))
    else assert.fail(`Unexpected pending ${JSON.stringify(interaction)}`)
  }
  assert.notEqual(response.interaction.stateId, 'wait', 'Pending resolution exceeded safety limit')
  return ok(response)
}
export function play(session: GameSession, card: string) {
  let response = ok(session.takeAction(0, 'lessons'))
  if (response.state.players[0]!.occupationHand.includes(card)) {
    assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
    const choice = response.interaction.request.options.find(option => option.value === card)
    assert.ok(choice)
    response = ok(session.resolveChoice(response.interaction.playerIndex, choice.value))
  }
  assert.ok(response.state.players[0]!.occupationPlayed.includes(card))
  return response
}
export function enter(session: GameSession, initial: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) {
  let response = ok(initial)
  for (let step = 0; step < 16; step++) {
    const interaction = response.interaction
    assert.ok(interaction.stateId === 'wait', JSON.stringify(interaction))
    const request = interaction.request
    if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (request.kind === 'select-trigger') {
      const option = request.options.find(option => option.value !== '__pass__' && option.labelKey !== 'actions.exchange.name')
      assert.ok(option)
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else {
      assert.equal(request.kind, 'choice')
      assert.ok(request.kind === 'choice')
      if (request.options.some(predicate)) return response
      const option = request.options.find(option => !option.disabled && !['__skip__', '__done__', '__pass__'].includes(option.value))
      assert.ok(option, JSON.stringify(request))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    }
  }
  assert.fail('Card decision was not reached')
}
export function choose(session: GameSession, response: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) {
  const pending = enter(session, response, predicate)
  assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
  const option = pending.interaction.request.options.find(predicate)
  assert.ok(option)
  return ok(session.resolveChoice(pending.interaction.playerIndex, option.value))
}
export function count(response: SessionResponse) { return animals.map(animal => response.state.players[0]!.resources[animal]) }
export function ready(session: GameSession) {
  let response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') response = confirmNext(session, response)
  response = finish(session, response)
  assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction))
  return response
}
export function collect(session: GameSession, actor: number, space: string, houseAnimal = false): SessionResponse {
  let response = ok(session.takeAction(actor, space))
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
    const request = response.interaction.request
    const player = response.state.players[response.interaction.playerIndex]!
    const house = request.zones.find(zone => zone.zoneType === 'house')
    const type = space === 'sheep-market' ? 'sheep' : space === 'pig-market' ? 'boar' : 'cattle'
    const zones = request.zones.map(zone => ({ ...zone, animalType: houseAnimal && zone.id === house?.id ? type : !houseAnimal && zone.zoneType === 'pasture' ? type : null, animalCount: houseAnimal && zone.id === house?.id ? player.resources[type] : !houseAnimal && zone.zoneType === 'pasture' ? player.resources[type] : 0 }))
    response = ok(session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones }))
  }
  return finish(session, response)
}
export function priorThenPig(session: GameSession, actor: 0 | 1, first: string) {
  let response = ok(session.takeAction(actor, first))
  response = finish(session, response)
  for (let step = 0; step < 4; step++) {
    response = ready(session)
    const next = response.state.currentPlayerIndex
    if (next === 0) return collect(session, 0, 'pig-market')
    const space = ['day-laborer', 'reed-bank', 'clay-pit'].find(id => session.getActionAvailability(next)[id])
    assert.ok(space)
    finish(session, ok(session.takeAction(next, space)))
  }
  assert.fail('Owner pig collection not reached')
}
