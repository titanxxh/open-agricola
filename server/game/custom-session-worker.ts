import { importRecoveryCatalog, snapshotForWorker } from '../../shared/session/recovery-catalog'
import { parentPort } from 'node:worker_threads'
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import {
  rehydrateState,
  serializeSessionSnapshot,
  type PersistedSessionSnapshot,
} from '../../shared/session/serialization.ts'
import { GameSession, type SessionResponse } from './authoritative-session.ts'
import type { CustomSessionMethod } from './custom-session-executor.ts'
import {
  validateFarmChoice,
  type FarmChoiceType,
} from '../../shared/session/farm-choice-validation.ts'

type Request = {
  id: number
  method: CustomSessionMethod
  args: unknown[]
  init?: {
    snapshot: PersistedSessionSnapshot
    cardWarnings: string[]
    customCards: CustomCardData[]
  }
}

type Success = {
  id: number
  ok: true
  response: Omit<SessionResponse, 'state'>
  snapshot: PersistedSessionSnapshot
  payloads: {
    debug: GameSyncPayload
    spectator: GameSyncPayload
    viewers: Record<string, GameSyncPayload>
  }
  raw?: unknown
}

let session: GameSession | null = null
let customCards: CustomCardData[] = []

const restore = (
  snapshot: PersistedSessionSnapshot,
  cardWarnings: string[],
): void => {
  session?.dispose()
  session = new GameSession(rehydrateState(snapshot), customCards)
  session.cardWarnings.splice(0, session.cardWarnings.length, ...cardWarnings)
}

const dispatch = (method: CustomSessionMethod, args: unknown[]): { response: SessionResponse; raw?: unknown } => {
  if (!session) throw new Error('custom session worker is not initialized')
  if (method === 'updatePlayerNames') {
    for (const [playerIndex, name] of args[0] as Array<[number, string]>) {
      session.updatePlayerName(playerIndex, name)
    }
    return { response: session.getState() }
  }
  if (method === 'confirmCurrentPlayer') {
    const snapshot = session.getState()
    const idx = snapshot.interaction.stateId === 'wait' &&
      (snapshot.interaction.request.kind === 'confirm-next-player' ||
        snapshot.interaction.request.kind === 'confirm-player-switch')
      ? snapshot.interaction.playerIndex
      : snapshot.state.currentPlayerIndex
    return {
      response: session.resolveChoice(idx, 'confirm'),
    }
  }
  if (method === 'validateFarmChoice') {
    const [type, playerId, payload] = args as [FarmChoiceType, string, Record<string, unknown>]
    return {
      response: session.getState(),
      raw: validateFarmChoice(session.getStateForRead(), type, playerId, payload),
    }
  }
  const fn = (session as unknown as Record<string, unknown>)[method]
  if (typeof fn !== 'function') throw new Error(`unknown custom session method: ${method}`)
  const raw = (fn as (...values: unknown[]) => unknown).apply(session, args)
  if (method === 'getAvailableActions') {
    return { response: session.getState(), raw }
  }
  return { response: raw as SessionResponse }
}

const buildResult = (response: SessionResponse) => {
  if (!session) throw new Error('custom session worker is not initialized')
  const snapshot = snapshotForWorker(serializeSessionSnapshot(response.state, session))
  const serialized = snapshot.frame
  const debug = session.buildSyncPayload(response, null, 'debug', serialized)
  const spectator = session.buildSyncPayload(response, null, 'viewer', serialized)
  const viewers = Object.fromEntries(response.state.players.map((player) => [
    player.id,
    session!.buildSyncPayload(response, player.id, 'viewer', serialized),
  ]))
  const { state: _state, ...responseWithoutState } = response
  return {
    response: responseWithoutState,
    snapshot,
    payloads: { debug, spectator, viewers },
  }
}

parentPort?.on('message', (request: Request) => {
  let checkpoint: PersistedSessionSnapshot | null = null
  let checkpointWarnings: string[] = []
  try {
    if (request.init) {
      customCards = request.init.customCards
      importRecoveryCatalog(request.init.snapshot)
      restore(request.init.snapshot, request.init.cardWarnings)
    }
    if (!session) throw new Error('custom session worker is not initialized')
    checkpoint = serializeSessionSnapshot(session.state, session)
    checkpointWarnings = [...session.cardWarnings]
    const { response, raw } = session.withCtx(() => dispatch(request.method, request.args))
    const commandWarnings = session.cardWarnings.slice(checkpointWarnings.length)
    if (commandWarnings.length > 0) throw new Error(commandWarnings.join('; '))
    const result: Success = {
      id: request.id,
      ok: true,
      ...buildResult(response),
      ...(raw === undefined ? {} : { raw }),
    }
    parentPort?.postMessage(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!session || !checkpoint) {
      parentPort?.postMessage({ id: request.id, ok: false, error: message })
      return
    }
    try {
      const commandWarnings = session.cardWarnings.slice(checkpointWarnings.length)
      restore(checkpoint, [...checkpointWarnings, ...commandWarnings])
      const response = { ...session.getState(), ok: false, error: message }
      parentPort?.postMessage({ id: request.id, ok: false, error: message, ...buildResult(response) })
    } catch {
      parentPort?.postMessage({ id: request.id, ok: false, error: message })
    }
  }
})
