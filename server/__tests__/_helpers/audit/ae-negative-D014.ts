// Helpers of ae-negative-D014-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'

export const CARD = 'D014_HammerCrusher'
export const sessions: GameSession[] = []
export function setup(stone = 2, woodHouse = false) {
  const session = createWorkSession({ seed: 14, configure: state => {
    state.round = 6
    state.roundActionOrder[0] = 'house-redevelopment'
    const player = state.players[0]!
    player.minorPlayed = [CARD]
    player.houseType = woodHouse ? 'wood' : 'clay'
    player.resources = { ...player.resources, clay: 3, reed: 2, stone }
  } })
  sessions.push(session)
  return session
}
export function startBuild(session: GameSession) {
  const reward = session.takeAction(0, 'house-redevelopment')
  assert.equal(reward.ok, true, reward.error)
  assert.equal(reward.state.players[0]!.resources.clay, 5)
  assert.equal(reward.state.players[0]!.resources.reed, 3)
  assert.ok(reward.interaction.stateId === 'wait' && reward.interaction.request.kind === 'choice')
  const build = reward.interaction.request.options?.find(option => option.value !== '__skip__')
  assert.ok(build)
  const response = session.resolveChoice(0, build.value)
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select')
  const farm = response.interaction.request.farm
  assert.ok(farm.farmType === 'room')
  assert.ok(farm.selectableTiles[0])
  return farm.selectableTiles[0]
}
export function outcome(response: SessionResponse) {
  const p = response.state.players[0]!
  return { ok: response.ok, rooms: p.roomTiles.length, house: p.houseType,
    clay: p.resources.clay, reed: p.resources.reed, stone: p.resources.stone,
    blocked: response.interaction.stateId === 'wait' && response.interaction.request.kind === 'engine-blocked' }
}
