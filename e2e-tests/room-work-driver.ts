import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ClientCommand } from '../shared/contract/protocol/ws'

type WorkCommand = Extract<ClientCommand, { type: 'getState' | 'choice' }>
type RoomWorkDriver = {
  snapshot: (playerIndex: number) => Promise<GameSyncPayload>
  command: (playerIndex: number, body: WorkCommand) => Promise<void>
}

/** Resolve setup/handoff prompts before the history scenario places a worker. */
export async function resolveRoomWorkPrompts(driver: RoomWorkDriver): Promise<GameSyncPayload> {
  let current = await driver.snapshot(0)
  for (let step = 0; step < 16; step++) {
    if (current.interaction.stateId !== 'wait') return current
    if (current.interaction.request.kind === 'private-prompt') {
      const actor = current.interaction.playerIndex
      await driver.command(actor, { type: 'getState' })
      current = await driver.snapshot(actor)
      if (current.interaction.stateId !== 'wait') throw new Error('Missing actor prompt')
    }
    const pending = current.interaction.request
    // Normal Rooms have random hands. Decline optional round-one setup through
    // its owning seat before driving the history scenario's worker placements.
    if (current.state.phase === 'playing' && current.state.round === 1 && current.state.roundPhase === 'preparation'
      && pending.kind === 'choice' && pending.options.some(option => option.value === '__skip__')) {
      await driver.command(current.interaction.playerIndex, { type: 'choice', value: '__skip__' })
      current = await driver.snapshot(0)
      continue
    }
    if (pending.kind !== 'confirm-next-player' && pending.kind !== 'confirm-player-switch') {
      throw new Error(`Unexpected room prompt: ${JSON.stringify({
        round: current.state.round, roundPhase: current.state.roundPhase, interaction: current.interaction,
      })}`)
    }
    const actor = pending.kind === 'confirm-next-player' ? pending.nextPlayerIndex : pending.fromPlayerIndex
    await driver.command(actor, { type: 'choice', value: 'confirm' })
    current = await driver.snapshot(0)
  }
  throw new Error('Room did not reach work after resolving prompts')
}
