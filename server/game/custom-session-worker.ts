import { parentPort } from 'node:worker_threads'
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import {
  rehydrateState,
  type SerializedGameState,
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
    serialized: SerializedGameState
    checkpoint: ReturnType<GameSession['createCommandCheckpoint']>
    cardWarnings: string[]
    customCards: CustomCardData[]
  }
}

type Success = {
  id: number
  ok: true
  response: Omit<SessionResponse, 'state'>
  serialized: SerializedGameState
  checkpoint: ReturnType<GameSession['createCommandCheckpoint']>
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
  serialized: SerializedGameState,
  checkpoint: ReturnType<GameSession['createCommandCheckpoint']>,
  cardWarnings: string[],
): void => {
  session?.dispose()
  session = new GameSession(rehydrateState(serialized), customCards)
  session.restoreCommandCheckpoint(checkpoint)
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
    return {
      response: session.resolveChoice(session.state.currentPlayerIndex, 'confirm'),
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
  const debug = session.buildSyncPayload(response, null, 'debug')
  const spectator = session.buildSyncPayload(response, null)
  const viewers = Object.fromEntries(response.state.players.map((player) => [
    player.id,
    session!.buildSyncPayload(response, player.id),
  ]))
  const { state: _state, ...responseWithoutState } = response
  return {
    response: responseWithoutState,
    serialized: debug.state,
    checkpoint: JSON.parse(JSON.stringify(
      session.createCommandCheckpoint(),
    )) as ReturnType<GameSession['createCommandCheckpoint']>,
    payloads: { debug, spectator, viewers },
  }
}

parentPort?.on('message', (request: Request) => {
  let checkpoint: ReturnType<GameSession['createCommandCheckpoint']> | null = null
  let commandWarnings: string[] = []
  try {
    if (request.init) {
      customCards = request.init.customCards
      restore(request.init.serialized, request.init.checkpoint, request.init.cardWarnings)
    }
    if (!session) throw new Error('custom session worker is not initialized')
    const warningCount = session.cardWarnings.length
    checkpoint = session.createCommandCheckpoint()
    const { response, raw } = session.withCtx(() => dispatch(request.method, request.args))
    commandWarnings = session.cardWarnings.slice(warningCount)
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
      session.restoreCommandCheckpoint(checkpoint)
      session.cardWarnings.push(...commandWarnings)
      const response = { ...session.getState(), ok: false, error: message }
      parentPort?.postMessage({ id: request.id, ok: false, error: message, ...buildResult(response) })
    } catch {
      parentPort?.postMessage({ id: request.id, ok: false, error: message })
    }
  }
})
