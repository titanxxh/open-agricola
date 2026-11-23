import { expect, type Page } from '@playwright/test'
import { createWorkSession } from '../../server/__tests__/_helpers/session-fixtures'
import type { Resource } from '../../shared/contract/types'
import { serializeState } from '../../shared/session/serialization'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { emptyResources } from '../../shared/contract/state-constants'
import { roomSnapshot, type roomDriver } from '../room-command-driver'

/** Round 4 of a 2-player Moor game with every worker placed; the first player's resources come on top of 4 food and 2 fuel. */
export const moorHarvestFixture = (firstPlayerResources: Partial<Resource>) => {
  const fixture = createWorkSession({ seed: 5401, options: {
    enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  }, configure: state => {
    state.round = 4
    for (const space of state.actionSpaces) space.takenBy = []
    for (const player of state.players) {
      player.resources = { ...emptyResources, food: 4, fuel: 2 }
      player.farmTerrain = []
      player.fields = []
      player.pastures = []
      player.improvements = []
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      markAllWorkersUsed(state, player)
    }
    const occupied = state.actionSpaces[0]!
    for (const player of state.players) for (const worker of player.workers) {
      if (worker.isActive) occupied.takenBy.push({ playerId: player.id, workerId: worker.id })
    }
    Object.assign(state.players[0]!.resources, firstPlayerResources)
  } })
  try {
    return fixture.withCtx(() => serializeState(fixture.state, {}))
  } finally { fixture.dispose() }
}

/** Ends the round and skips the other harvest steps until the first player faces `kind`. */
export const startHarvest = async (pages: [Page, Page], driver: ReturnType<typeof roomDriver>, kind: 'feed' | 'heating') => {
  await driver.command(0, { type: 'roundEnd' })
  for (let step = 0; step < 8; step++) {
    const current = await roomSnapshot(pages[0])
    if (current.interaction.stateId !== 'wait') throw new Error('Expected harvest interaction')
    const actor = current.interaction.playerIndex
    const own = await roomSnapshot(pages[actor]!)
    if (own.interaction.stateId !== 'wait') throw new Error('Expected responder')
    if (own.interaction.request.kind === kind) {
      expect(actor).toBe(0)
      return
    }
    await driver.command(actor, { type: 'choice', value: '__skip__' })
  }
  throw new Error(`Expected the first player's ${kind} interaction`)
}
