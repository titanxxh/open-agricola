import { describe, expect, it } from 'vitest'
import { GameSession } from '../authoritative-session.ts'
import type { SessionResponse } from '../authoritative-session.ts'
import { buildGameSyncPayload } from '../sync-payload.ts'

describe('buildGameSyncPayload', () => {
  it('keeps HTTP debug null-viewer payload unfiltered while WS null-viewer payload is a spectator view', () => {
    const session = new GameSession()
    const resp = session.withCtx(() => session.getState())
    const p0 = resp.state.players[0]!
    const waitResp: SessionResponse = {
      ...resp,
      interaction: {
        stateId: 'wait',
        playerIndex: 0,
        sourceCard: 'E078_SleightofHand',
        promptKey: 'ui.interactionSleightOfHand',
        request: {
          kind: 'resource-batch-exchange-select',
          cardId: 'E078_SleightofHand',
          discardAvailableByResource: { wood: 2 },
          receiveResources: ['wood', 'clay', 'reed', 'stone'],
          maxTotal: 2,
        },
        allowedCommands: ['commitSelection'],
        anytimeActions: [],
      },
    }

    const spectator = buildGameSyncPayload({
      session,
      resp: waitResp,
      viewerPlayerId: null,
      mode: 'viewer',
    })
    const debug = buildGameSyncPayload({
      session,
      resp: waitResp,
      viewerPlayerId: null,
      mode: 'debug',
    })
    const player = buildGameSyncPayload({
      session,
      resp: waitResp,
      viewerPlayerId: p0.id,
      mode: 'viewer',
    })

    expect(spectator.interaction.stateId === 'wait' && spectator.interaction.request.kind).toBe('private-prompt')
    expect(spectator.privateEvents ?? []).toEqual([])
    expect(spectator.cardAvailability).toBeUndefined()

    expect(debug.interaction.stateId === 'wait' && debug.interaction.request.kind).toBe('resource-batch-exchange-select')
    expect(debug.privateEvents ?? []).toEqual([])
    expect(debug.cardAvailability).toEqual(waitResp.cardAvailability)

    expect(player.interaction.stateId === 'wait' && player.interaction.request.kind).toBe('resource-batch-exchange-select')
    expect(player.privateEvents).toEqual([
      expect.objectContaining({
        type: 'private.promptShown',
        recipientPlayerId: p0.id,
        promptKind: 'resource-batch-exchange-select',
        sourceCard: 'E078_SleightofHand',
      }),
    ])
  })
})
