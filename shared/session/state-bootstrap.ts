// Catalog-dependent state helpers (server-facing).
//
// For the client-safe slice (pure data, no catalog), see `./state-constants`.
// This module re-exports everything from `./state-constants` so existing
// server/test consumers can keep importing from `shared/logic/state`.

import {
  createDefaultRoomTiles,
  getFarmyardTileKeySet,
  getFarmyardTilePositions,
  normalizeFarmyardExtensions,
  positionKey,
} from '../domain/farm'
import { createRng, createSeed, shuffleWithRng } from '../utils/rng'
import { createActionSpaces } from '../actions'
import { majorImprovementIds } from '../cards/major'
import {
  createMajorImprovementSupply,
  getVisibleMajorImprovementIds,
  normalizeMajorImprovementSupply,
  standardMajorImprovementIds,
} from '../cards/major/supply'
import {
  implementedMinorImprovementCards,
  implementedOccupationCards,
  implementedCommunityMinors,
  implementedCommunityOccupations,
} from '../cards/catalog'
import { initDraftState, initStagedDraftState } from '../draft/draft-manager'
import type { DraftPool, DraftStageSpec } from '../draft/types'
import type { ActionSpace, Field, GameState, OrdinaryCardDecks, PlayerState } from '../contract/types'
import { createPlayerActionSpaces } from '../cards/player-action-space'
import { normalizeFarmyardSpaceStates } from '../domain/farmyard-space-states'
import { normalizeBlockedBy, normalizeTakenBy } from '../domain/space'
import { createInitialPlayerStats } from './stats'
import { dealParentCardsIfNeeded, ensureParentMotherScheduleLogs, startParentSelectionIfNeeded } from '../parents/selection'
import { cardAllowedForPlayerCount } from '../cards/player-count-filter'
import {
  getCustomMinorImprovement,
  getCustomOccupation,
} from '../cards/custom-registry'
import {
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
} from '../cards/registry-display'
import {
  applyRoundGrowth,
  defaultPlayerColors,
  defaultSandboxDeckIds,
  emptyResources,
  generateRoundActionOrder,
  normalizeFenceSegments,
  type DefaultSandboxDeckId,
  type InitialStateOptions,
} from './state-constants'
import {
  assertEventSizeUnderLimit,
  assertGameEventEnvelope,
  assertJsonSafeEvent,
  assertKnownGameEventShape,
  assertPublicGameEvent,
} from '../events/guards'
import { normalizePublicEventArchive } from '../events/archive'
import { eventsToLogEntries } from '../events/log-mapper'
import type { GameEvent } from '../contract/events'
import {
  applySeasonPreparationAdjustments,
  createThroughTheSeasonsState,
  normalizeThroughTheSeasonsState,
} from '../seasons/state'
import { createSeasonActionSpaces, seasonActionIds } from '../seasons/action-spaces'
import {
  createFarmersOfTheMoorState,
  normalizeFarmersOfTheMoorState,
} from '../moor/state'
import { normalizeFarmTerrain } from '../moor/farm-terrain'
import { getMoorStartCardTerrain } from '../moor/start-cards'
import { createMoorActionSpaces } from '../moor/action-spaces'

export * from './state-constants'

const isPersistedGameEvent = (event: unknown): event is GameState['events'][number] => {
  if (typeof event !== 'object' || event === null) return false
  try {
    assertGameEventEnvelope(event)
    assertKnownGameEventShape(event)
    assertPublicGameEvent(event)
    assertJsonSafeEvent(event)
    assertEventSizeUnderLimit(event, 4096)
  } catch {
    return false
  }
  return true
}

const normalizeDeckIds = (deckIds?: string[]): DefaultSandboxDeckId[] => {
  const next = deckIds
    ?.filter((deck): deck is string => typeof deck === 'string')
    .map((deck) => deck.trim().toUpperCase())
    .filter((deck): deck is DefaultSandboxDeckId =>
      (defaultSandboxDeckIds as readonly string[]).includes(deck),
    ) ?? []
  return next.length > 0 ? Array.from(new Set(next)) : [...defaultSandboxDeckIds]
}

const farmersOfTheMoorMinorHandSize = 4
const farmersOfTheMoorPublishedMinorHandSize = 3

export const getImplementedFarmersOfTheMoorMinorIds = (playerCount: number): readonly string[] =>
  implementedMinorImprovementCards
    .filter((card) => card.requiresFarmersOfTheMoor)
    .filter((card) => cardAllowedForPlayerCount(card.players, playerCount))
    .map((card) => card.id)

const resolveFarmersOfTheMoorMinorHandSize = (
  playerCount: number,
  allowIncomplete: boolean,
): number => {
  const available = getImplementedFarmersOfTheMoorMinorIds(playerCount).length
  const required = playerCount * farmersOfTheMoorMinorHandSize
  if (available >= required) return farmersOfTheMoorMinorHandSize
  if (!allowIncomplete) {
    throw new Error(
      `createInitialState: Farmers of the Moor minor pool has ${available} cards; need ${required} or enable allowIncompleteFarmersOfTheMoorMinorDeal`,
    )
  }
  return Math.min(
    farmersOfTheMoorMinorHandSize,
    Math.floor(available / playerCount),
  )
}

const dealFarmersOfTheMoorMinorHands = (
  playerCount: number,
  seed: number,
  handSize: number,
): string[][] => {
  if (handSize <= 0) {
    return Array.from({ length: playerCount }, () => [])
  }
  const shuffled = shuffleWithRng([...getImplementedFarmersOfTheMoorMinorIds(playerCount)], createRng(seed))
  return Array.from({ length: playerCount }, (_, index) =>
    shuffled.slice(index * handSize, index * handSize + handSize),
  )
}

export const dealHands = (
  playerCount: number,
  seed: number,
  extraMinorIds: string[] = [],
  extraOccupationIds: string[] = [],
  deckIds?: string[],
  handSize = 7,
  enableCommunityDeck = false,
) => {
  const rng = createRng(seed)
  const allowedDecks = new Set<string>(normalizeDeckIds(deckIds))
  const allow = (players: string | undefined) =>
    cardAllowedForPlayerCount(players, playerCount)
  const lookupPlayersField = (id: string): string | undefined =>
    getCustomMinorImprovement(id)?.players
    ?? getCustomOccupation(id)?.players
    ?? getRegisteredMinorImprovement(id)?.players
    ?? getRegisteredOccupation(id)?.players
    ?? undefined
  const allowExtra = (id: string) => allow(lookupPlayersField(id))
  const minorPool = Array.from(new Set([
    ...implementedMinorImprovementCards
      .filter((card) => allowedDecks.has(card.deck))
      .filter((card) => allow(card.players))
      .map((card) => card.id),
    ...(enableCommunityDeck
      ? implementedCommunityMinors
          .filter((card) => allow(card.players))
          .map((card) => card.id)
      : []),
    ...extraMinorIds.filter(allowExtra),
  ]))
  const occupationPool = Array.from(new Set([
    ...implementedOccupationCards
      .filter((card) => allowedDecks.has(card.deck))
      .filter((card) => allow(card.players))
      .map((card) => card.id),
    ...(enableCommunityDeck
      ? implementedCommunityOccupations
          .filter((card) => allow(card.players))
          .map((card) => card.id)
      : []),
    ...extraOccupationIds.filter(allowExtra),
  ]))
  const shuffledMinor = shuffleWithRng(minorPool, rng)
  const shuffledOccupation = shuffleWithRng(occupationPool, rng)
  const minorHands: string[][] = []
  const occupationHands: string[][] = []
  for (let index = 0; index < playerCount; index += 1) {
    minorHands.push(shuffledMinor.slice(index * handSize, index * handSize + handSize))
    occupationHands.push(shuffledOccupation.slice(index * handSize, index * handSize + handSize))
  }
  const dealtCount = playerCount * handSize
  return {
    minorHands,
    occupationHands,
    minorDeck: shuffledMinor.slice(dealtCount),
    occupationDeck: shuffledOccupation.slice(dealtCount),
  }
}

const cardIdsInDraft = (draft: GameState['draft']): { occupation: Set<string>; minor: Set<string> } => {
  const occupation = new Set<string>()
  const minor = new Set<string>()
  if (!draft) return { occupation, minor }
  Object.values(draft.pools).forEach((pool) => {
    pool.occ.forEach((id) => occupation.add(id))
    pool.minor.forEach((id) => minor.add(id))
  })
  Object.values(draft.kept).forEach((pool) => {
    pool.occ.forEach((id) => occupation.add(id))
    pool.minor.forEach((id) => minor.add(id))
  })
  draft.stages?.forEach((stage) => {
    Object.values(stage.pools).forEach((pool) => {
      pool.occ.forEach((id) => occupation.add(id))
      pool.minor.forEach((id) => minor.add(id))
    })
  })
  return { occupation, minor }
}

const createFallbackOrdinaryCardDecks = (
  players: PlayerState[],
  seed: number,
  draft: GameState['draft'],
  enableCommunityDeck: boolean,
  options: Pick<InitialStateOptions, 'extraMinorIds' | 'extraOccupationIds' | 'deckIds'> = {},
): OrdinaryCardDecks => {
  const full = dealHands(
    players.length,
    seed,
    options.extraMinorIds ?? [],
    options.extraOccupationIds ?? [],
    options.deckIds,
    0,
    enableCommunityDeck,
  )
  const draftIds = cardIdsInDraft(draft)
  const dealtOccupation = new Set(players.flatMap((player) => player.occupationHand ?? []))
  const dealtMinor = new Set(players.flatMap((player) => player.minorHand ?? []))
  return {
    occupation: full.occupationDeck.filter((id) => !dealtOccupation.has(id) && !draftIds.occupation.has(id)),
    minor: full.minorDeck.filter((id) => !dealtMinor.has(id) && !draftIds.minor.has(id)),
  }
}

const normalizeOrdinaryCardDecks = (
  raw: GameState,
  players: PlayerState[],
  seed: number,
): OrdinaryCardDecks => {
  const decks = raw.ordinaryCardDecks
  if (decks && Array.isArray(decks.occupation) && Array.isArray(decks.minor)) {
    return {
      occupation: decks.occupation.filter((id): id is string => typeof id === 'string'),
      minor: decks.minor.filter((id): id is string => typeof id === 'string'),
    }
  }
  return createFallbackOrdinaryCardDecks(players, seed, raw.draft ?? null, raw.enableCommunityDeck ?? false)
}

export const normalizeState = (raw: GameState): GameState => {
  const seed = raw.gameSeed ?? createSeed()
  const enableFarmersOfTheMoor = raw.enableFarmersOfTheMoor === true
  const farmersOfTheMoor = enableFarmersOfTheMoor
    ? normalizeFarmersOfTheMoorState(
        raw.farmersOfTheMoor,
        (raw.players ?? []).map((player) => player.id),
        seed,
      )
    : null
  const roundActionOrder =
    raw.roundActionOrder?.length === 14
      ? raw.roundActionOrder
      : generateRoundActionOrder(seed)
  const baseSpaces = createActionSpaces(raw.players?.length)
  const spaceMap = new Map(
    (raw.actionSpaces ?? []).map((space) => [space.id, space]),
  )
  const actionSpaces: ActionSpace[] = baseSpaces.map((space): ActionSpace => {
    const stored = spaceMap.get(space.id)
    return {
      ...space,
      resources: stored?.resources ?? space.resources,
      takenBy: normalizeTakenBy(stored?.takenBy),
      blockedBy: normalizeBlockedBy(stored?.blockedBy),
      exclusiveUse: stored?.exclusiveUse,
      maxOccupancy: stored?.maxOccupancy ?? space.maxOccupancy,
    }
  })
  if (enableFarmersOfTheMoor) {
    for (const moorSpace of createMoorActionSpaces(raw.players?.length ?? 2)) {
      const stored = spaceMap.get(moorSpace.id)
      if (stored) {
        moorSpace.resources = stored.resources ?? moorSpace.resources
        moorSpace.takenBy = normalizeTakenBy(stored.takenBy)
        moorSpace.blockedBy = normalizeBlockedBy(stored.blockedBy)
        moorSpace.exclusiveUse = stored.exclusiveUse
        moorSpace.maxOccupancy = stored.maxOccupancy ?? moorSpace.maxOccupancy
      }
      actionSpaces.push(moorSpace)
    }
  }
  if (raw.enableThroughTheSeasons) {
    for (const seasonSpace of createSeasonActionSpaces(raw.players?.length)) {
      const stored = spaceMap.get(seasonSpace.id)
      if (stored) {
        seasonSpace.resources = stored.resources ?? seasonSpace.resources
        seasonSpace.takenBy = normalizeTakenBy(stored.takenBy)
        seasonSpace.blockedBy = normalizeBlockedBy(stored.blockedBy)
        seasonSpace.exclusiveUse = stored.exclusiveUse
        seasonSpace.maxOccupancy = stored.maxOccupancy ?? seasonSpace.maxOccupancy
      }
      actionSpaces.push(seasonSpace)
    }
  }
  // Append PlayerActionCard dynamic spaces
  const playerActionSpaces = createPlayerActionSpaces({ players: raw.players } as GameState)
  for (const pas of playerActionSpaces) {
    const stored = spaceMap.get(pas.id)
    if (stored) {
      pas.resources = stored.resources ?? pas.resources
      pas.takenBy = normalizeTakenBy(stored.takenBy)
      pas.blockedBy = normalizeBlockedBy(stored.blockedBy)
      pas.exclusiveUse = stored.exclusiveUse
      pas.maxOccupancy = stored.maxOccupancy ?? pas.maxOccupancy
    }
    actionSpaces.push(pas)
  }
  // Preserve caller-added spaces not produced by createActionSpaces / PlayerActionCard.
  // (e.g. `__test-worker-sink__` and `card-worker:...` pseudo-spaces.)
  const allBaseActionIds = new Set(createActionSpaces().map((space) => space.id))
  const knownIds = new Set(actionSpaces.map((s) => s.id))
  for (const stored of raw.actionSpaces ?? []) {
    if (knownIds.has(stored.id)) continue
    if (allBaseActionIds.has(stored.id) || seasonActionIds.includes(stored.id)) continue
    actionSpaces.push({
      ...stored,
      takenBy: normalizeTakenBy(stored.takenBy),
      blockedBy: normalizeBlockedBy(stored.blockedBy),
    } as ActionSpace)
  }
  const inDraftPhase = raw.phase === 'draft' && raw.draft != null
  const needsHands =
    !inDraftPhase &&
    raw.players.some(
      (player) =>
        (player.minorHand?.length ?? 0) === 0 ||
        (player.occupationHand?.length ?? 0) === 0,
    )
  const dealtHands = needsHands ? dealHands(raw.players.length, seed) : null
  const players = raw.players.map((player, index) => {
    const improvements = player.improvements ?? []
    const minorHand = player.minorHand ?? []
    const minorPlayed = player.minorPlayed ?? []
    const occupationHand = player.occupationHand ?? []
    const occupationPlayed = player.occupationPlayed ?? []
    const extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
    const playedCards = player.playedCards ?? []
    const normalized: PlayerState = {
      ...player,
      color:
        player.color ?? defaultPlayerColors[index % defaultPlayerColors.length],
      resources: enableFarmersOfTheMoor
        ? {
            ...player.resources,
            fuel: player.resources?.fuel ?? 0,
            horse: player.resources?.horse ?? 0,
          }
        : { ...player.resources },
      houseType: player.houseType ?? 'wood',
      improvements: improvements.length > 0 ? improvements : [],
      minorHand:
        minorHand.length > 0
          ? minorHand
          : dealtHands?.minorHands[index] ?? [],
      minorPlayed: minorPlayed.length > 0 ? minorPlayed : [],
      occupationHand:
        occupationHand.length > 0
          ? occupationHand
          : dealtHands?.occupationHands[index] ?? [],
      occupationPlayed: occupationPlayed.length > 0 ? occupationPlayed : [],
      extraOccupationsFromCards: extraOccupationsFromCards.length > 0 ? extraOccupationsFromCards : [],
      playedCards:
        playedCards.length > 0
          ? playedCards
          : [
              ...improvements.map((id) => `major:${id}`),
              ...minorPlayed.map((id) => `minor:${id}`),
              ...occupationPlayed.map((id) => `occupation:${id}`),
            ],
      houseAnimalType: player.houseAnimalType ?? null,
      houseAnimalCount: player.houseAnimalCount ?? 0,
      workers: player.workers && player.workers.length > 0
        ? player.workers
        : [
            { id: '1', isActive: true,  isNewborn: false },
            { id: '2', isActive: true,  isNewborn: false },
            { id: '3', isActive: false, isNewborn: false },
            { id: '4', isActive: false, isNewborn: false },
            { id: '5', isActive: false, isNewborn: false },
          ],
      stableAnimals: player.stableAnimals ?? {},
      pastures: player.pastures ?? [],
      fenceSegments: normalizeFenceSegments(player.fenceSegments ?? [], player.id),
      stats: player.stats,
      roomTiles:
        player.roomTiles && player.roomTiles.length > 0
          ? [...player.roomTiles]
          : createDefaultRoomTiles(player.rooms ?? 2),
      stableTiles: player.stableTiles ?? [],
      majorEffects: player.majorEffects ?? { wellRounds: 0 },
      parentCards: player.parentCards ?? { mother: null, father: null },
      supplyTokensConsumed: player.supplyTokensConsumed ?? {},
      farmyardExtensions: normalizeFarmyardExtensions(player.farmyardExtensions),
      farmyardSpaceStates: normalizeFarmyardSpaceStates(player.farmyardSpaceStates),
    }
    if (enableFarmersOfTheMoor) {
      const startCardId = farmersOfTheMoor?.startCardByPlayerId[normalized.id]
      const hasRawTerrain = Array.isArray(player.farmTerrain)
      const rawTerrain = normalizeFarmTerrain(player.farmTerrain, normalized)
      normalized.farmTerrain = hasRawTerrain
        ? rawTerrain
        : startCardId
          ? getMoorStartCardTerrain(startCardId)
          : []
      normalized.sickWorkerIds = Array.isArray(player.sickWorkerIds)
        ? player.sickWorkerIds.filter((id): id is string => typeof id === 'string')
        : []
    } else {
      delete normalized.farmyardExtensions
      delete normalized.farmTerrain
      delete normalized.sickWorkerIds
      delete normalized.resources.fuel
      delete normalized.resources.horse
    }
    const desiredRooms = normalized.rooms ?? normalized.roomTiles.length
    if (normalized.roomTiles.length < desiredRooms) {
      const used = new Set(normalized.roomTiles.map((tile) => positionKey(tile)))
      getFarmyardTilePositions(normalized).forEach((pos) => {
        if (normalized.roomTiles.length >= desiredRooms) return
        const key = positionKey(pos)
        if (used.has(key)) return
        normalized.roomTiles.push(pos)
        used.add(key)
      })
    }
    if (normalized.roomTiles.length > desiredRooms) {
      normalized.roomTiles = normalized.roomTiles.slice(0, desiredRooms)
    }
    const used = new Set(normalized.roomTiles.map((tile) => positionKey(tile)))
    normalized.farmTerrain?.forEach((tile) => used.add(positionKey(tile)))
    const allPositions = getFarmyardTilePositions(normalized)
    const allPositionKeys = getFarmyardTileKeySet(normalized)
    const nextEmpty = () =>
      allPositions.find((pos) => !used.has(positionKey(pos)))
    const normalizedStableTiles = (normalized.stableTiles ?? []).filter(
      (tile) => {
        const key = positionKey(tile)
        if (!allPositionKeys.has(key)) return false
        if (used.has(key)) {
          return false
        }
        used.add(key)
        return true
      },
    )
    normalized.stableTiles = normalizedStableTiles
    const normalizedFields = (normalized.fields ?? []).flatMap((rawField) => {
      const field = rawField as Field
      if (!Array.isArray(field.stacks)) field.stacks = []
      const row = Number.isFinite(field.row) ? field.row : -1
      const col = Number.isFinite(field.col) ? field.col : -1
      const key = `${row}-${col}`
      if (allPositionKeys.has(key) && !used.has(key)) {
        used.add(key)
        return [{ ...field, row, col }]
      }
      const next = nextEmpty()
      if (!next) {
        return []
      }
      used.add(positionKey(next))
      return [{ ...field, row: next.row, col: next.col }]
    })
    normalized.fields = normalizedFields
    const stableSet = new Set(
      normalized.stableTiles.map((tile) => positionKey(tile)),
    )
    normalized.pastures = (normalized.pastures ?? []).map((pasture, index) => {
      const tiles = pasture.tiles ?? []
      return {
        ...pasture,
        id: pasture.id ?? `pasture-${index + 1}`,
        tiles,
        stables: tiles.filter((tile) => stableSet.has(positionKey(tile)))
          .length,
      }
    })
    const pastureTileKeys = new Set(
      normalized.pastures.flatMap((pasture) =>
        (pasture.tiles ?? []).map((tile) => positionKey(tile)),
      ),
    )
    const looseStableKeys = new Set(
      normalized.stableTiles
        .map((tile) => positionKey(tile))
        .filter((key) => !pastureTileKeys.has(key)),
    )
    normalized.stableAnimals = Object.fromEntries(
      Object.entries(normalized.stableAnimals ?? {}).filter(([key]) =>
        looseStableKeys.has(key),
      ),
    )
    if (!normalized.houseAnimalType || normalized.houseAnimalCount <= 0) {
      normalized.houseAnimalType = null
      normalized.houseAnimalCount = 0
    } else {
      normalized.houseAnimalCount = Math.min(1, normalized.houseAnimalCount)
    }
    return normalized
  })
  const takenImprovements = new Set(
    players.flatMap((player) => player.improvements),
  )
  const majorImprovementSupply = normalizeMajorImprovementSupply(
    (raw as { majorImprovementSupply?: unknown }).majorImprovementSupply,
    takenImprovements,
  )
  const visibleMajorImprovements = getVisibleMajorImprovementIds(majorImprovementSupply)
  const availableMajorImprovements = (
    visibleMajorImprovements ??
    (raw.availableMajorImprovements?.length
      ? raw.availableMajorImprovements
      : [...standardMajorImprovementIds])
  ).filter(
    (id) => majorImprovementIds.includes(id) && !takenImprovements.has(id),
  )
  const rawEvents = raw.events
  if (!Array.isArray(rawEvents) || !Number.isSafeInteger(raw.nextEventSeq)) {
    throw new Error('Invalid event state')
  }
  const events = rawEvents.filter(isPersistedGameEvent)
  const maxEventSeq = events.reduce(
    (max, event) =>
      Number.isSafeInteger(event.seq) && event.seq > 0 && event.seq > max
        ? event.seq
        : max,
    0,
  )
  const nextEventSeq =
    Number.isSafeInteger(raw.nextEventSeq) && raw.nextEventSeq > maxEventSeq
      ? raw.nextEventSeq
      : maxEventSeq + 1
  if (
    !Array.isArray(raw.publicEventArchive) ||
    !Number.isSafeInteger(raw.nextPublicEventArchivePacketSeq)
  ) {
    throw new Error('Invalid public event archive state')
  }
  const archiveState = normalizePublicEventArchive(
    raw.publicEventArchive,
    raw.nextPublicEventArchivePacketSeq,
  )
  const ordinaryCardDecks = normalizeOrdinaryCardDecks(raw, players, createSeed())
  const enableThroughTheSeasons = raw.enableThroughTheSeasons ?? false
  const normalizedState: GameState = {
    ...raw,
    players,
    actionSpaces,
    gameSeed: seed,
    roundActionOrder,
    availableMajorImprovements,
    majorImprovementSupply,
    phase: raw.phase ?? 'playing',
    roundPhase: raw.roundPhase ?? 'work',
    draft: raw.draft ?? null,
    parentSelection: raw.parentSelection ?? null,
    events,
    nextEventSeq,
    publicEventArchive: archiveState.publicEventArchive,
    nextPublicEventArchivePacketSeq: archiveState.nextPublicEventArchivePacketSeq,
    futureMeeples: raw.futureMeeples ?? [],
    pendingFutureMeeples: raw.pendingFutureMeeples ?? [],
    enableCommunityDeck: raw.enableCommunityDeck ?? false,
    enableParentCards: raw.enableParentCards ?? false,
    enableThroughTheSeasons,
    throughTheSeasons: enableThroughTheSeasons
      ? normalizeThroughTheSeasonsState(raw.throughTheSeasons, seed)
      : null,
    enableFarmersOfTheMoor,
    farmersOfTheMoor,
    ordinaryCardDecks,
    ordinaryCardDrawChoices: raw.ordinaryCardDrawChoices ?? {},
    nextOrdinaryCardDrawChoiceSeq: raw.nextOrdinaryCardDrawChoiceSeq ?? 1,
    completedFeedingPhases: raw.completedFeedingPhases ?? 0,
  }
  ensureParentMotherScheduleLogs(normalizedState)
  return normalizedState
}

export const cloneState = (state: GameState): GameState => {
  let raw: GameState
  if (typeof structuredClone === 'function') {
    try {
      raw = structuredClone(state)
    } catch {
      raw = JSON.parse(JSON.stringify(state)) as GameState
    }
  } else {
    raw = JSON.parse(JSON.stringify(state)) as GameState
  }
  return normalizeState(raw)
}

const createInitialPlayers = (
  seed: number,
  options: InitialStateOptions = {},
): PlayerState[] => {
  const {
    playerCount = 2,
    extraMinorIds = [],
    extraOccupationIds = [],
    deckIds,
    playerNames = [],
    draftMode,
    enableCommunityDeck = false,
    enableFarmersOfTheMoor = false,
    allowIncompleteFarmersOfTheMoorMinorDeal = false,
  } = options
  const count = Math.max(1, Math.min(6, Math.floor(playerCount)))
  let dealtHands = { minorHands: [] as string[][], occupationHands: [] as string[][] }
  if (draftMode !== 'simultaneous') {
    if (enableFarmersOfTheMoor) {
      const ordinaryMinorDeal = dealHands(
        count,
        seed,
        extraMinorIds,
        extraOccupationIds,
        deckIds,
        farmersOfTheMoorPublishedMinorHandSize,
        enableCommunityDeck,
      )
      const occupationDeal = dealHands(
        count,
        seed,
        extraMinorIds,
        extraOccupationIds,
        deckIds,
        7,
        enableCommunityDeck,
      )
      const moorMinorHandSize = resolveFarmersOfTheMoorMinorHandSize(
        count,
        allowIncompleteFarmersOfTheMoorMinorDeal,
      )
      const moorMinorHands = dealFarmersOfTheMoorMinorHands(count, seed, moorMinorHandSize)
      dealtHands = {
        occupationHands: occupationDeal.occupationHands,
        minorHands: ordinaryMinorDeal.minorHands.map((hand, index) => [
          ...(moorMinorHands[index] ?? []),
          ...hand,
        ]),
      }
    } else {
      dealtHands = dealHands(count, seed, extraMinorIds, extraOccupationIds, deckIds, 7, enableCommunityDeck)
    }
  }
  const base: Array<{
    id: PlayerState['id']
    name: string
    color: PlayerState['color']
    startPlayer: boolean
  }> = [
    { id: 'p1', name: 'PlayerA', color: 'red', startPlayer: true },
    { id: 'p2', name: 'PlayerB', color: 'blue', startPlayer: false },
    { id: 'p3', name: 'PlayerC', color: 'black', startPlayer: false },
    { id: 'p4', name: 'PlayerD', color: 'yellow', startPlayer: false },
    { id: 'p5', name: 'PlayerE', color: 'green', startPlayer: false },
    { id: 'p6', name: 'PlayerF', color: 'purple', startPlayer: false },
  ]
  return base.slice(0, count).map((info, index) => {
    const player: PlayerState = {
      id: info.id,
      name: playerNames[index] ?? info.name,
      color: info.color,
      resources: enableFarmersOfTheMoor
        ? { ...emptyResources, food: 2, fuel: 0, horse: 0 }
        : { ...emptyResources, food: 2 },
      workers: [
        { id: '1', isActive: true,  isNewborn: false },
        { id: '2', isActive: true,  isNewborn: false },
        { id: '3', isActive: false, isNewborn: false },
        { id: '4', isActive: false, isNewborn: false },
        { id: '5', isActive: false, isNewborn: false },
      ],
      rooms: 2,
      houseType: 'wood',
      fields: [],
      roomTiles: createDefaultRoomTiles(2),
      stableTiles: [],
      improvements: [],
      minorHand: dealtHands.minorHands[index] ?? [],
      minorPlayed: [],
      occupationHand: dealtHands.occupationHands[index] ?? [],
      occupationPlayed: [],
      extraOccupationsFromCards: [],
      playedCards: [],
      houseAnimalType: null,
      houseAnimalCount: 0,
      stableAnimals: {},
      pastures: [],
      fenceSegments: [],
      majorEffects: { wellRounds: 0 },
      startPlayer: info.startPlayer,
      activeModifiers: [],
      cardStates: {},
      stats: createInitialPlayerStats({ isFirstPlayer: info.startPlayer }),
      parentCards: { mother: null, father: null },
      supplyTokensConsumed: {},
    }
    return player
  })
}

const createRoundSnapshot = (state: GameState): GameState => {
  const snapshot = cloneState(state)
  snapshot.roundStartSnapshot = null
  return snapshot
}

export const createInitialState = (
  seed?: number,
  extraMinorIdsOrOptions: string[] | InitialStateOptions = [],
  extraOccupationIds: string[] = [],
): GameState => {
  const options: InitialStateOptions = Array.isArray(extraMinorIdsOrOptions)
    ? { extraMinorIds: extraMinorIdsOrOptions, extraOccupationIds }
    : extraMinorIdsOrOptions
  const gameSeed =
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.floor(seed)
      : createSeed()
  const roundActionOrder = generateRoundActionOrder(gameSeed)
  const useDraft = options.draftMode === 'simultaneous'
  const players = createInitialPlayers(gameSeed, options)
  const enableFarmersOfTheMoor = options.enableFarmersOfTheMoor === true
  const farmersOfTheMoor = enableFarmersOfTheMoor
    ? createFarmersOfTheMoorState(players.map((player) => player.id), gameSeed)
    : null
  if (enableFarmersOfTheMoor && farmersOfTheMoor) {
    for (const player of players) {
      player.farmTerrain = getMoorStartCardTerrain(farmersOfTheMoor.startCardByPlayerId[player.id]!)
      player.sickWorkerIds = []
      player.resources.fuel = player.resources.fuel ?? 0
      player.resources.horse = player.resources.horse ?? 0
    }
  }
  const ordinaryCardDeckSeed =
    typeof options.ordinaryCardDeckSeed === 'number' && Number.isFinite(options.ordinaryCardDeckSeed)
      ? Math.floor(options.ordinaryCardDeckSeed)
      : createSeed()
  const parentSelectionSeed =
    typeof options.parentSelectionSeed === 'number' && Number.isFinite(options.parentSelectionSeed)
      ? Math.floor(options.parentSelectionSeed)
      : createSeed()
  let ordinaryCardDecks: OrdinaryCardDecks

  let phase: GameState['phase'] = 'playing'
  let draft: GameState['draft'] = null
  if (useDraft) {
    const poolSize = Math.floor(options.draftPoolSize ?? 7)
    if (poolSize < 7 || poolSize > 10) {
      throw new Error(
        `createInitialState: draftPoolSize must be between 7 and 10, got ${poolSize}`,
      )
    }
    const playerCount = players.length
    const seatOrder = players.map((p) => p.id)
    if (enableFarmersOfTheMoor) {
      const occupationDeal = dealHands(
        playerCount,
        gameSeed,
        options.extraMinorIds ?? [],
        options.extraOccupationIds ?? [],
        options.deckIds,
        7,
        options.enableCommunityDeck ?? false,
      )
      const publishedMinorDeal = dealHands(
        playerCount,
        gameSeed,
        options.extraMinorIds ?? [],
        options.extraOccupationIds ?? [],
        options.deckIds,
        farmersOfTheMoorPublishedMinorHandSize,
        options.enableCommunityDeck ?? false,
      )
      const moorMinorHandSize = resolveFarmersOfTheMoorMinorHandSize(
        playerCount,
        options.allowIncompleteFarmersOfTheMoorMinorDeal === true,
      )
      const moorMinorHands = dealFarmersOfTheMoorMinorHands(playerCount, gameSeed, moorMinorHandSize)
      const occupationPools: Record<string, DraftPool> = {}
      const publishedMinorPools: Record<string, DraftPool> = {}
      const moorMinorPools: Record<string, DraftPool> = {}
      seatOrder.forEach((pid, i) => {
        occupationPools[pid] = {
          occ: occupationDeal.occupationHands[i] ?? [],
          minor: [],
        }
        moorMinorPools[pid] = {
          occ: [],
          minor: moorMinorHands[i] ?? [],
        }
        publishedMinorPools[pid] = {
          occ: [],
          minor: publishedMinorDeal.minorHands[i] ?? [],
        }
      })
      const stages: DraftStageSpec[] = [{
        kind: 'occupation',
        poolSize: 7,
        totalRounds: 7,
        pools: occupationPools,
      }]
      if (moorMinorHandSize > 0) {
        stages.push({
          kind: 'farmersOfTheMoorMinor',
          poolSize: moorMinorHandSize,
          totalRounds: moorMinorHandSize,
          pools: moorMinorPools,
        })
      }
      stages.push({
        kind: 'publishedMinor',
        poolSize: farmersOfTheMoorPublishedMinorHandSize,
        totalRounds: farmersOfTheMoorPublishedMinorHandSize,
        pools: publishedMinorPools,
      })
      draft = initStagedDraftState(seatOrder, stages)
    } else {
      const draftDeal = dealHands(
        playerCount,
        gameSeed,
        options.extraMinorIds ?? [],
        options.extraOccupationIds ?? [],
        options.deckIds,
        poolSize,
        options.enableCommunityDeck ?? false,
      )
      const hands: Record<string, DraftPool> = {}
      seatOrder.forEach((pid, i) => {
        hands[pid] = {
          occ: draftDeal.occupationHands[i] ?? [],
          minor: draftDeal.minorHands[i] ?? [],
        }
      })
      draft = initDraftState(seatOrder, hands, poolSize)
    }
    ordinaryCardDecks = createFallbackOrdinaryCardDecks(
      players,
      ordinaryCardDeckSeed,
      draft,
      options.enableCommunityDeck ?? false,
      options,
    )
    phase = 'draft'
  } else {
    ordinaryCardDecks = createFallbackOrdinaryCardDecks(
      players,
      ordinaryCardDeckSeed,
      null,
      options.enableCommunityDeck ?? false,
      options,
    )
  }

  const initialEvents: GameEvent[] = [{
    schemaVersion: 1,
    id: '1',
    seq: 1,
    round: 1,
    phase: 'work',
    type: 'game.started',
    visibility: 'public',
  }]
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]))
  const majorImprovementSupply = createMajorImprovementSupply(players.length, { enableFarmersOfTheMoor })
  const initialState: GameState = {
    round: 1,
    phase,
    roundPhase: 'work',
    draft,
    parentSelection: null,
    currentPlayerIndex: 0,
    players,
    actionSpaces: [
      ...createActionSpaces(players.length),
      ...(enableFarmersOfTheMoor ? createMoorActionSpaces(players.length) : []),
      ...(options.enableThroughTheSeasons ? createSeasonActionSpaces(players.length) : []),
    ],
    log: eventsToLogEntries(initialEvents, { playerNames }),
    events: initialEvents,
    nextEventSeq: 2,
    publicEventArchive: [{
      schemaVersion: 1,
      id: '1',
      packetSeq: 1,
      type: 'publicEvents.committed',
      eventIds: ['1'],
      eventSeqs: [1],
      firstEventSeq: 1,
      lastEventSeq: 1,
    }],
    nextPublicEventArchivePacketSeq: 2,
    roundStartSnapshot: null,
    roundActionOrder,
    gameSeed,
    availableMajorImprovements: getVisibleMajorImprovementIds(majorImprovementSupply) ?? [...standardMajorImprovementIds],
    majorImprovementSupply,
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    enableCommunityDeck: options.enableCommunityDeck ?? false,
    enableParentCards: options.enableParentCards ?? false,
    enableThroughTheSeasons: options.enableThroughTheSeasons ?? false,
    throughTheSeasons: options.enableThroughTheSeasons
      ? createThroughTheSeasonsState(gameSeed)
      : null,
    enableFarmersOfTheMoor,
    farmersOfTheMoor,
    ordinaryCardDecks,
    ordinaryCardDrawChoices: {},
    nextOrdinaryCardDrawChoiceSeq: 1,
    workPhaseObtainedResources: {},
    completedFeedingPhases: 0,
  }
  applyRoundGrowth(initialState)
  applySeasonPreparationAdjustments(initialState)
  if (options.draftParents === false) {
    dealParentCardsIfNeeded(initialState, parentSelectionSeed)
  } else {
    startParentSelectionIfNeeded(initialState, parentSelectionSeed)
  }
  initialState.roundStartSnapshot = createRoundSnapshot(initialState)
  return initialState
}
