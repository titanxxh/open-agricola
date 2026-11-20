import { parseCommitSelectionPayload } from '../../shared/contract/protocol/commit-selection'
import { parseFenceSelectionPayload } from '../../shared/contract/protocol/farm-selection'
/**
 * Testable core of the local-sandbox engine worker: owns the `GameCore`
 * instance and maps transport method calls onto it. `worker.ts` is a thin
 * onmessage shell around this class so vitest can drive it in Node directly.
 *
 * The dispatch table mirrors `server/game-router.ts` endpoint → session
 * method mappings so browser-local games behave identically to server
 * sandbox games.
 *
 * SCOPE / server-authoritative boundary: this runs ONLY the single-player
 * workshop playtest (a dry-run of the author's own cards, in the author's own
 * browser). It is not a multiplayer game and never writes any shared/server
 * `GameState` — real multiplayer rooms stay fully server-authoritative through
 * `GameSession`. This is the accepted divergence recorded in wayfinder map #605
 * (real-match card execution stays server-side; only the workshop dry-run is
 * local). Do not route multiplayer rule decisions through this path.
 */
import { CLASSIC_EDITION_ENABLED } from '../../shared/contract/card-edition'
import { ClassicAdmissionError, classicAdmissionRejection, parseCardEditionChoice } from '../../shared/session/card-edition-admission'
import { ClassicPoolInsufficientError } from '../../shared/session/classic-deal-pool'
import { GameCore, type SessionResponse } from '../../shared/session/session-core.ts'
import { buildSyncPayload } from '../../shared/session/sync-payload.ts'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization.ts'
import {
  defaultSandboxDeckIds,
  type InitialStateOptions,
} from '../../shared/session/state-bootstrap.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { FenceSelectionPayload, FenceSelectionQuote, GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type {
  FarmChoiceType,
  FarmChoiceValidation,
} from '../../shared/session/farm-choice-validation.ts'
import { prepareLocalCustomCard, registerLocalCustomCard } from './local-custom-card.ts'
import {
  LOCAL_SANDBOX_SCHEMA_VERSION,
  type LocalCardInput,
  type LocalGameConfig,
  type LocalSandboxRequest,
  type LocalSandboxResponse,
  type PersistedLocalGame,
  type ViewerSpec,
} from './protocol.ts'

export type LocalSandboxResult = {
  payload: GameSyncPayload
  persist: PersistedLocalGame
}

const compileCards = (cards: LocalCardInput[]): CustomCardData[] =>
  cards.map((card) => {
    if (!card.source) {
      // Data-only card: GameCore registers the cardJson, no code to run.
      return {
        cardType: card.cardType,
        cardJson: card.cardJson,
        effectCode: null,
        artUrl: card.artUrl ?? null,
      }
    }
    try {
      // A native source supplies its own definition (ADR 0052).
      return prepareLocalCustomCard({ cardId: card.cardJson.id, source: card.source, artUrl: card.artUrl })
    } catch (error) {
      throw new Error(`Card ${card.cardJson.id} failed to compile: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  })

const toInitialStateOptions = (config: LocalGameConfig, classicEditionEnabled: boolean): InitialStateOptions => {
  const playerCount = Number.isFinite(config.playerCount)
    ? Math.max(1, Math.min(6, Math.floor(config.playerCount)))
    : 2
  const requestedDecks = (config.deckIds ?? [])
    .map((deck) => deck.trim().toUpperCase())
    .filter((deck) => (defaultSandboxDeckIds as readonly string[]).includes(deck))
  const deckIds = requestedDecks.length > 0
    ? Array.from(new Set(requestedDecks))
    : [...defaultSandboxDeckIds]
  const enableFarmersOfTheMoor = config.enableFarmersOfTheMoor === true
  const options: InitialStateOptions = {
    ...parseCardEditionChoice(config),
    playerCount,
    deckIds: deckIds as InitialStateOptions['deckIds'],
    enableThroughTheSeasons: config.enableThroughTheSeasons === true,
    enableFarmersOfTheMoor,
    allowIncompleteFarmersOfTheMoorMinorDeal:
      enableFarmersOfTheMoor && config.allowIncompleteFarmersOfTheMoorMinorDeal === true,
    enableSnakeOpening: config.enableSnakeOpening === true,
  }
  const rejection = classicAdmissionRejection({
    ...options,
    enableCommunityDeck: config.enableCommunityDeck,
    enableParentCards: config.enableParentCards,
  }, classicEditionEnabled)
  if (rejection) throw new ClassicAdmissionError(rejection)
  return { ...options, playerCount: Math.max(2, playerCount) }
}

export class LocalSandboxCore {
  private core: GameCore | null = null
  private config: LocalGameConfig | null = null

  private readonly classicEditionEnabled: boolean

  constructor(classicEditionEnabled: boolean = CLASSIC_EDITION_ENABLED) {
    this.classicEditionEnabled = classicEditionEnabled
  }

  init(config: LocalGameConfig, viewer: ViewerSpec): LocalSandboxResult {
    return this.respond(this.reinit(config), viewer)
  }

  restore(persisted: PersistedLocalGame, viewer: ViewerSpec): LocalSandboxResult {
    if (persisted.schemaVersion !== LOCAL_SANDBOX_SCHEMA_VERSION) {
      throw new Error(
        `Persisted local game schema ${persisted.schemaVersion} does not match ${LOCAL_SANDBOX_SCHEMA_VERSION}`,
      )
    }
    const customCards = compileCards(persisted.config.cards)
    const core = new GameCore({
      stateOrSeed: rehydrateState(persisted.serializedState),
      customCards: customCards.length > 0 ? customCards : undefined,
      registerCustomCardImpl: registerLocalCustomCard,
    })
    this.core?.dispose()
    this.core = core
    this.config = persisted.config
    return this.respond(core.withCtx(() => core.getState()), viewer)
  }

  call(method: string, args: unknown[], viewer: ViewerSpec): LocalSandboxResult {
    const core = this.requireCore()
    // Run inside the session card context (like the server router's
    // session.withCtx) so custom-card effects/hooks resolve from
    // SessionCardContext for every command, not just the ones that self-wrap.
    return this.respond(core.withCtx(() => this.dispatch(core, method, args)), viewer)
  }

  quoteFenceSelection(playerIndex: number, requestKey: string, payload: FenceSelectionPayload): FenceSelectionQuote {
    return this.requireCore().quoteFenceSelection(playerIndex, requestKey, payload)
  }

  validateFarmChoice(type: FarmChoiceType, playerId: string, payload: Record<string, unknown>): FarmChoiceValidation {
    return this.requireCore().validateFarmChoice(type, playerId, payload)
  }

  private dispatch(core: GameCore, method: string, args: unknown[]): SessionResponse {
    const a = args as never[]
    switch (method) {
      case 'getState': return core.getState()
      case 'takeAction': return core.takeAction(a[0], a[1])
      case 'takeSpecialAction': return core.takeSpecialAction(a[0], a[1], a[2], a[3])
      case 'resolveChoice': return core.resolveChoice(a[0], a[1], a[2])
      case 'takeAnytimeAction': return core.takeAnytimeAction(a[0], a[1])
      case 'ordinaryDrawKeep': return core.resolveOrdinaryCardDrawChoice(a[0], a[1], a[2])
      case 'commitSelection': return core.commitSelectionChoice(a[0], parseCommitSelectionPayload(a[1]))
      case 'confirmFeed':
        return core.resolveChoice(a[0], 'confirm' as never, { selections: a[1] } as never)
      case 'confirmNextPlayer': {
        const idx = core.getState().state.currentPlayerIndex
        return core.resolveChoice(idx as never, 'confirm' as never)
      }
      case 'confirmPlayerSwitch': {
        const snapshot = core.getState()
        const idx = snapshot.interaction.stateId === 'wait' &&
          snapshot.interaction.request.kind === 'confirm-player-switch'
          ? snapshot.interaction.playerIndex
          : snapshot.state.currentPlayerIndex
        return core.resolveChoice(idx as never, 'confirm' as never)
      }
      case 'performRoundEnd': return core.performRoundEnd()
      case 'setPlayerPreferences': return core.setPlayerPreferences(a[0], a[1])
      case 'undoStep': return core.undoStep()
      case 'undoAction': return core.undoAction()
      case 'newGame': {
        if (!this.config) throw new Error('newGame before init')
        return this.reinit({ ...this.config, seed: a[0] as number | undefined })
      }
      case 'loadGame': return core.loadState(a[0])
      case 'devSetResources': return core.devSetResources(a[0], a[1])
      case 'devSetRound': return core.devSetRound(a[0])
      case 'devDrawCard': return core.devDrawCard(a[0], a[1])
      case 'devPlayCard': return core.devPlayCard(a[0], a[1])
      case 'devCreatePasture': return core.startDevFenceSelect(a[0])
      case 'draftSubmit': return core.submitDraftPick(a[0], a[1])
      case 'soloHandSubmit': return core.submitSoloHandSelection(a[0], a[1])
      case 'parentSubmit': return core.submitParentSelection(a[0], a[1])
      default:
        throw new Error(`Unknown local-sandbox method: ${method}`)
    }
  }

  private reinit(config: LocalGameConfig): SessionResponse {
    const initialStateOptions = toInitialStateOptions(config, this.classicEditionEnabled)
    const customCards = compileCards(config.cards)
    const core = new GameCore({
      stateOrSeed: config.seed,
      customCards: customCards.length > 0 ? customCards : undefined,
      initialStateOptions,
      registerCustomCardImpl: registerLocalCustomCard,
    })
    this.core?.dispose()
    this.core = core
    this.config = config
    return core.withCtx(() => core.getState())
  }

  private respond(resp: SessionResponse, viewer: ViewerSpec): LocalSandboxResult {
    const core = this.requireCore()
    return {
      payload: buildSyncPayload(core, resp, viewer.visiblePlayerIds, viewer.mode),
      persist: {
        schemaVersion: LOCAL_SANDBOX_SCHEMA_VERSION,
        config: this.config!,
        serializedState: serializeSessionSnapshot(resp.state, core),
      },
    }
  }

  private requireCore(): GameCore {
    if (!this.core) throw new Error('Local sandbox not initialized')
    return this.core
  }
}

/**
 * Maps one protocol request onto a `LocalSandboxCore`. Shared by the real
 * worker shell (`worker.ts`) and the in-process fake worker used in tests so
 * both paths run the exact same logic.
 */
export const handleLocalSandboxRequest = (
  core: LocalSandboxCore,
  request: LocalSandboxRequest,
): LocalSandboxResponse => {
  try {
    if (request.kind === 'call' && request.method === 'quoteFenceSelection') {
      const [playerIndex, requestKey, payload] = request.args
      if (typeof playerIndex !== 'number' || typeof requestKey !== 'string') throw new Error('Invalid fence quote request')
      return { kind: 'result', id: request.id, ok: true, raw: core.quoteFenceSelection(playerIndex, requestKey, parseFenceSelectionPayload(payload)) }
    }
    if (request.kind === 'call' && request.method === 'validateFarmChoice') {
      const [type, playerId, payload] = request.args as [FarmChoiceType, string, Record<string, unknown>]
      return { kind: 'result', id: request.id, ok: true, raw: core.validateFarmChoice(type, playerId, payload) }
    }
    const result = request.kind === 'init'
      ? core.init(request.config, request.viewer)
      : request.kind === 'restore'
        ? core.restore(request.persisted, request.viewer)
        : core.call(request.method, request.args, request.viewer)
    return { kind: 'result', id: request.id, ok: true, ...result }
  } catch (error) {
    if (error instanceof ClassicAdmissionError) {
      return { kind: 'result', id: request.id, ok: false, ...error.rejection }
    }
    if (error instanceof ClassicPoolInsufficientError) {
      return { kind: 'result', id: request.id, ok: false, error: error.message, code: error.code, shortfall: error.shortfall }
    }
    return {
      kind: 'result',
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
