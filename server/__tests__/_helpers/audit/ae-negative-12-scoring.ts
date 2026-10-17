// Helpers of ae-negative-12-scoring-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, FarmTilePosition } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { takeMajorImprovementFromSupply } from '../../../../shared/cards/major/supply'

// Design: fresh two-player native sessions; score thresholds use controlled legal
// farms, while build and purchase cases drive actual commands. No rule code changes.
export const ARCH = 'A098_StableArchitect', GRAZER = 'A099_FellowGrazer', COOK = 'A101_CookeryOutfitter'
export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/12-scoring-probes'
export function save(id: string, value: unknown) {
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2))
}
export function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response }
export function setup(card: string, configure: (state: GameState) => void = () => {}, played = true, owner = 0) {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = 14
    for (const player of state.players) Object.assign(player.resources, { food: 40, wood: 15, clay: 5, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    const player = state.players[owner]!
    player.occupationPlayed = played ? [card] : []
    player.occupationHand = played ? ['__test_placeholder__'] : [card]
    configure(state)
    for (const player of state.players) for (const card of player.improvements) takeMajorImprovementFromSupply(state, card)
  } })
  sessions.push(session)
  assert.equal(session.getState().state.players.length, 2)
  return session
}
export function bonus(response: SessionResponse, card: string, owner = 0) {
  assert.ok(response.scores)
  return response.scores[owner]!.categories.find(category => category.key === 'cardBonusVp')?.entries
    .filter(entry => entry.type === 'bonus' && entry.cardId === card).reduce((sum, entry) => sum + entry.score, 0) ?? 0
}
export function pasture(state: GameState, tiles: FarmTilePosition[], owner = 0) {
  const player = state.players[owner]!
  player.pastures.push({ id: `pasture-${player.pastures.length}`, tiles, animalType: null, animalCount: 0 })
  const edges = new Set<string>()
  for (const { row, col } of tiles) for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
    if (edges.has(edge)) edges.delete(edge); else edges.add(edge)
  }
  for (const edge of edges) if (!player.fenceSegments.some(segment => segment.edge === edge)) player.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } })
}
export function choices(response: SessionResponse) {
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice', JSON.stringify(response.interaction))
  return response.interaction.request.options
}
export function complete(session: GameSession, response: SessionResponse) {
  for (let n = 0; n < 5 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; n++) {
    const option = choices(response).find(option => option.value === '__done__' || option.value === '__skip__')
    assert.ok(option, JSON.stringify(response.interaction))
    response = ok(session.resolveChoice(response.interaction.playerIndex, option.value))
  }
  return response
}
