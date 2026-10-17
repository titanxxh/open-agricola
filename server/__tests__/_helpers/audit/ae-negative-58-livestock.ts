// Helpers of ae-negative-58-livestock-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import { GameSession, type SessionResponse } from '../../../game/authoritative-session'
import type { ActionChoiceOption, GameState, PlayerState } from '../../../../shared/contract/types'
import type { AnimalKey } from '../../../../shared/contract/animals'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/58/oa-probes'
export const animals = ['sheep', 'boar', 'cattle'] as const
export const fenceEdges = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
export function ok(response: SessionResponse): SessionResponse {
  assert.equal(response.ok, true, `${response.error} ${JSON.stringify(response.interaction)}`)
  return JSON.parse(JSON.stringify(response))
}
export function gainOf(option: ActionChoiceOption) {
  const preview = option.effectPreview
  return preview && 'resourcesGained' in preview ? preview.resourcesGained : undefined
}
export function save(id: string, value: unknown) {
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2))
}
export function make(card: string, configure: (state: GameState) => void = () => {}, played = true, round = 5) {
  const session = createWorkSession({ seed: 4258, options: { playerCount: 4 }, configure(state) {
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
    else assert.fail(`Unexpected pending ${JSON.stringify(interaction)}`)
  }
  assert.notEqual(response.interaction.stateId, 'wait', 'Pending resolution exceeded safety limit')
  return ok(response)
}
export function transition(session: GameSession, target: number, accept = false) {
  for (let step = 0; step < 32; step++) {
    let response = session.getState()
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') response = confirmNext(session, response)
    response = finish(session, response, accept)
    if (response.state.round === target) return response
    assert.equal(response.state.round, target - 1)
    const actor = response.state.currentPlayerIndex
    const available = session.getActionAvailability(actor)
    const space = ['grain-seeds', 'day-laborer', 'forest', 'reed-bank', 'clay-pit', 'fishing', 'resource-market', 'copse', 'grove', 'hollow', 'traveling-players', 'eastern-quarry', 'western-quarry'].find(id => available[id])
    assert.ok(space, JSON.stringify(available))
    finish(session, ok(session.takeAction(actor, space)), accept)
  }
  assert.fail('Natural round transition did not complete')
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
export function fencing(session: GameSession, actor = 1) {
  const pending = ok(session.takeAction(actor, 'fencing'))
  assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
  return ok(session.commitSelectionChoice(actor, { edges: fenceEdges, palisadeEdges: [], extraWood: 0 }))
}
export function count(response: SessionResponse) { return animals.map(animal => response.state.players[0]!.resources[animal]) }
export function buildStables(session: GameSession, tiles: { row: number; col: number }[]) {
  let pending = ok(session.takeAction(0, 'farm-expansion'))
  if (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice') pending = choose(session, pending, option => option.labelKey === 'actions.stables.name')
  assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select' && pending.interaction.request.farm.farmType === 'stable', JSON.stringify(pending.interaction))
  return finish(session, ok(session.commitSelectionChoice(0, { stables: tiles })))
}
export function dairy() {
  return make('E167_DairyCrier', state => {
    for (const player of state.players) { player.resources.food = 0; pasture(player) }
  }, false)
}
export type DairyReward = 'food' | 'sheep' | 'pass'
export function resolveDairy(session: GameSession, initial: SessionResponse, rewards: readonly DairyReward[]) {
  let response = ok(initial)
  const visited: number[] = []
  for (let step = 0; step < 48 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    const request = interaction.request
    if (request.kind === 'confirm-next-player') return { response, visited }
    if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (request.kind === 'animal-reorg') {
      const player = response.state.players[interaction.playerIndex]!
      const house = request.zones.find(zone => zone.zoneType === 'house')
      const zones = request.zones.map(zone => ({ ...zone, animalType: zone.zoneType === 'pasture' && player.resources.sheep ? 'sheep' as const : zone.id === house?.id && player.resources.cattle ? 'cattle' as const : null, animalCount: zone.zoneType === 'pasture' ? player.resources.sheep : zone.id === house?.id ? player.resources.cattle : 0 }))
      response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { zones }))
    } else {
      assert.ok(request.kind === 'choice', JSON.stringify(interaction))
      assert.equal(response.state.players[0]!.resources.cattle, 0, 'Owner cattle cannot precede the final reward decision')
      const reward = rewards[interaction.playerIndex]
      const option = request.options.find(option => reward === 'pass' ? option.value === '__skip__' : gainOf(option)?.[reward!] === 2)
      assert.ok(option, JSON.stringify(interaction))
      visited.push(interaction.playerIndex)
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    }
  }
  return { response, visited }
}
