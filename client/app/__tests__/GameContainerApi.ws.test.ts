// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../../shared/contract/events'

import {
  applyPublicEventCancellationSnapshot,
  buildCompactScoreRows,
  canTakeVisibleMoorSpecialAction,
  buildPlaceFarmerChoiceMap,
  buildReplayFeedback,
  clearReplayFeedback,
  devResourceKeysForState,
  allowIncompleteFarmersOfTheMoorMinorDealFromQuery,
  enableThroughTheSeasonsFromQuery,
  farmCommitErrorMessageKey,
  filterPublicFarmHighlightsForPlayer,
  filterPublicFenceHighlightsForPlayer,
  getCurrentlySelectableRoomKeys,
  hasPublicEventHighlights,
  isDevModeAllowedFromQuery,
  maxPlayersFromQuery,
  mergePublicEventHighlights,
  mergePublicEventResourceAnimations,
  playerIdFromWsStatus,
  removePublicEventHighlights,
  removePublicEventResourceAnimations,
  splitBoardActionSpaces,
  shouldShowPendingChoiceInInteractionBar,
} from '../game-container-helpers'
import { seasonActionIdBySeason } from '../../../shared/seasons/action-spaces'
import type { ActionSpace } from '../../../shared/contract/types'
import type { GameState, PlayerState } from '../../../shared/contract/types'
import type { MoorSpecialActionCardState } from '../../../shared/moor/types'
import type { PlayerScoreSummary } from '../../../shared/domain/scoring'
import type { PublicEventResourceAnimation } from '../public-event-notifications'
import { collectNewPublicEventFeedback, maxPublicEventSeq } from '../public-event-notifications'
import type { ReplayTimelineEntry } from '../replay-timeline'

const animation = (id: string): PublicEventResourceAnimation => ({
  id,
  kind: 'move',
  resources: { wood: 1 },
  from: { kind: 'actionSpace', actionId: 'forest' },
  to: { kind: 'playerResources', playerId: 'p1' },
})

describe('GameContainerApi WS player identity', () => {
  it('uses the joined websocket seat as the local player when URL has no player param', () => {
    expect(playerIdFromWsStatus({ phase: 'ready', roomId: 'room-1', playerIndex: 1 })).toBe('p2')
  })

  it('allows dev mode for fixed dev rooms, embedded sandbox, and documented non-game shortcuts', () => {
    expect(isDevModeAllowedFromQuery('?page=game&transport=ws&room=dev2&devMode=1')).toBe(true)
    expect(isDevModeAllowedFromQuery('?page=game&transport=ws&room=dev5&devMode=1')).toBe(true)
    expect(isDevModeAllowedFromQuery('?page=game&transport=ws&room=dev6&devMode=1')).toBe(true)
    expect(isDevModeAllowedFromQuery('?page=game&embedded=1&devMode=1')).toBe(true)
    expect(isDevModeAllowedFromQuery('?page=workshop&player=p1&devMode=1')).toBe(true)
    expect(isDevModeAllowedFromQuery('?player=p1&devMode=1')).toBe(true)
    expect(isDevModeAllowedFromQuery('?page=game&transport=ws&room=abc123&devMode=1')).toBe(false)
    expect(isDevModeAllowedFromQuery('?transport=ws&room=abc123&player=p1&devMode=1')).toBe(false)
    expect(isDevModeAllowedFromQuery('?page=game&devMode=1')).toBe(false)
  })

  it('parses websocket room maxPlayers from query as a 2-6 range', () => {
    expect(maxPlayersFromQuery('?page=game&transport=ws&maxPlayers=6')).toBe(6)
    expect(maxPlayersFromQuery('?page=game&transport=ws&maxPlayers=5')).toBe(5)
    expect(maxPlayersFromQuery('?page=game&transport=ws&maxPlayers=99')).toBe(6)
    expect(maxPlayersFromQuery('?page=game&transport=ws&maxPlayers=1')).toBe(2)
    expect(maxPlayersFromQuery('?page=game&transport=ws&maxPlayers=bogus')).toBe(2)
    expect(maxPlayersFromQuery('?page=game&transport=ws')).toBe(2)
  })

  it('parses the Through the Seasons room option from query', () => {
    expect(enableThroughTheSeasonsFromQuery('?page=game&transport=ws&enableThroughTheSeasons=true')).toBe(true)
    expect(enableThroughTheSeasonsFromQuery('?page=game&transport=ws&enableThroughTheSeasons=1')).toBe(false)
    expect(enableThroughTheSeasonsFromQuery('?page=game&transport=ws')).toBe(false)
  })

  it('parses the incomplete Farmers of the Moor minor-deal room option from query', () => {
    expect(allowIncompleteFarmersOfTheMoorMinorDealFromQuery('?allowIncompleteFarmersOfTheMoorMinorDeal=true')).toBe(true)
    expect(allowIncompleteFarmersOfTheMoorMinorDealFromQuery('?allowIncompleteFarmersOfTheMoorMinorDeal=1')).toBe(false)
    expect(allowIncompleteFarmersOfTheMoorMinorDealFromQuery('?page=game')).toBe(false)
  })

  it('includes FoM resources in the dev resource picker only for Farmers of the Moor games', () => {
    expect(devResourceKeysForState({ enableFarmersOfTheMoor: false })).not.toContain('horse')
    expect(devResourceKeysForState({ enableFarmersOfTheMoor: true })).toEqual(
      expect.arrayContaining(['horse', 'fuel']),
    )
  })

  it('separates season action spaces from the normal action board', () => {
    const makeSpace = (id: string): ActionSpace => ({
      id,
      nameKey: `actions.${id}.name`,
      roundAvailable: 1,
      gainPerRound: {},
      resources: {
        wood: 0,
        clay: 0,
        reed: 0,
        stone: 0,
        food: 0,
        grain: 0,
        vegetable: 0,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: 0,
      },
      takenBy: [],
    })
    const forest = makeSpace('forest')
    const sheep = makeSpace('sheep-market')
    const winter = makeSpace(seasonActionIdBySeason.winter)

    expect(splitBoardActionSpaces([forest, sheep, winter], ['sheep-market'])).toEqual({
      baseActions: [forest],
      seasonActions: [winter],
    })
  })

  it('maps failed farm commits to local interaction error messages', () => {
    expect(farmCommitErrorMessageKey('room', 'NOT_CONNECTED')).toBe('ui.roomErrorNotConnected')
    expect(farmCommitErrorMessageKey('room', 'OCCUPIED')).toBe('ui.roomErrorOccupied')
    expect(farmCommitErrorMessageKey('stable', 'LIMIT_REACHED')).toBe('ui.stableErrorLimit')
    expect(farmCommitErrorMessageKey('plow', 'FENCED')).toBe('ui.plowErrorFenced')
    expect(farmCommitErrorMessageKey('sow', 'NO_SELECTION')).toBe('ui.sowErrorNoSelection')
  })

  it('routes anytime exchange choices to the exchange overlay instead of the bottom interaction bar', () => {
    expect(shouldShowPendingChoiceInInteractionBar(null)).toBe(false)
    expect(shouldShowPendingChoiceInInteractionBar({ promptKey: 'ui.interactionChooseOne' })).toBe(true)
    expect(shouldShowPendingChoiceInInteractionBar({ promptKey: 'ui.interactionExchangeChoice' })).toBe(false)
  })

  it('disables Moor special actions when all workers at home are sick', () => {
    const player = {
      id: 'p1',
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0, fuel: 0, horse: 0,
      },
      workers: [{ id: '1', isActive: true, isNewborn: false }],
      sickWorkerIds: ['1'],
    } as PlayerState
    const state = { players: [player], currentPlayerIndex: 0, actionSpaces: [] } as unknown as GameState
    const card = {
      id: 'moor-special-hiring-fair',
      players: [4],
      actions: ['hiring-fair'],
      image: '',
      location: { kind: 'market' },
    } as MoorSpecialActionCardState

    expect(canTakeVisibleMoorSpecialAction(state, player, card, 'hiring-fair')).toBe(false)
    player.sickWorkerIds = []
    expect(canTakeVisibleMoorSpecialAction(state, player, card, 'hiring-fair')).toBe(true)
  })

  it('maps compact score card bonus VP from the unified category only', () => {
    const rows = buildCompactScoreRows(
      { players: [{ id: 'p1', name: 'Alice' }] },
      [
        {
          playerId: 'p1',
          playerName: 'Alice',
          total: 42,
          categories: [
            { key: 'cards', total: 2, entries: [] },
            { key: 'cardBonusVp', total: 3, entries: [] },
            { key: 'cardsBonus', total: 50, entries: [] },
            { key: 'cardStateBonusVp', total: 60, entries: [] },
            { key: 'cardBonus', total: 70, entries: [] },
          ],
        } as unknown as PlayerScoreSummary,
      ],
      'p1',
    )

    expect(rows).toEqual([
      {
        id: 'p1',
        name: 'Alice',
        isYou: true,
        total: 42,
        breakdown: {
          fields: 0,
          animals: 0,
          cardBonusVp: 3,
          family: 0,
          cards: 2,
        },
      },
    ])
  })

  it('keeps only currently connected room tiles selectable', () => {
    const baseTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 2, col: 1 },
    ]

    expect(getCurrentlySelectableRoomKeys(
      baseTiles,
      new Set(['1-0']),
      new Set(),
    )).toEqual(new Set(['0-0', '1-1']))

    expect(getCurrentlySelectableRoomKeys(
      baseTiles,
      new Set(['1-0']),
      new Set(['1-1']),
    )).toEqual(new Set(['0-0', '0-1', '1-1', '2-1']))
  })

  it('merges and removes public event highlights for timer cleanup', () => {
    const incoming = {
      actionIds: ['forest'],
      farmTiles: [{ playerId: 'p1', key: '0-0' }],
      fenceEdges: [{ playerId: 'p1', edgeId: 'h-0-0' }],
    }

    expect(hasPublicEventHighlights(incoming)).toBe(true)

    const merged = mergePublicEventHighlights({
      actionIds: [],
      farmTiles: [],
      fenceEdges: [],
    }, incoming)

    expect(merged).toEqual(incoming)
    expect(removePublicEventHighlights(merged, incoming)).toEqual({
      actionIds: [],
      farmTiles: [],
      fenceEdges: [],
    })

    const overlapped = mergePublicEventHighlights(merged, incoming)
    expect(removePublicEventHighlights(overlapped, incoming)).toEqual(incoming)
  })

  it('preserves action highlights for public events that do not produce notifications', () => {
    const workerPlaced = {
      schemaVersion: 1,
      id: 'evt-worker',
      seq: 1,
      round: 1,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      type: 'worker.placed',
      workerId: 'w1',
      spaceId: 'forest',
    } satisfies GameEvent

    const feedback = collectNewPublicEventFeedback([workerPlaced], 0, 'en', 'public-test')

    expect(feedback.notifications).toEqual([])
    expect(mergePublicEventHighlights({
      actionIds: [],
      farmTiles: [],
      fenceEdges: [],
    }, feedback.highlights).actionIds).toEqual(['forest'])
  })

  it('maps extra place-farmer choices back to board action space ids', () => {
    const choiceMap = buildPlaceFarmerChoiceMap('ui.interactionPlaceFarmerExtra', [
      { value: 'forest', labelKey: 'actions.forest.name' },
      { value: 'allow-occupied:lessons', labelKey: 'actions.lessons.name' },
      { value: 'clay-pit', labelKey: 'actions.clay-pit.name', disabled: true },
    ])

    expect(choiceMap.get('forest')?.value).toBe('forest')
    expect(choiceMap.get('lessons')?.value).toBe('allow-occupied:lessons')
    expect(choiceMap.get('clay-pit')?.disabled).toBe(true)
    expect(buildPlaceFarmerChoiceMap('ui.interactionChooseOne', [
      { value: 'forest', labelKey: 'actions.forest.name' },
    ])).toEqual(new Map())
  })

  it('removes only one counted resource animation batch occurrence', () => {
    const incoming = [animation('a')]
    const merged = mergePublicEventResourceAnimations([], incoming)
    const overlapped = mergePublicEventResourceAnimations(merged, incoming)
    expect(removePublicEventResourceAnimations(overlapped, incoming)).toEqual(incoming)
  })

  it('collects resource animations for public events that do not produce notifications', () => {
    const moved = {
      schemaVersion: 1,
      id: 'evt-moved',
      seq: 1,
      round: 1,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'actionSpace', spaceId: 'forest' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'collect',
    } satisfies GameEvent

    const feedback = collectNewPublicEventFeedback([moved], 0, 'en', 'public-test')

    expect(feedback.notifications).toEqual([])
    expect(feedback.resourceAnimations).toEqual([expect.objectContaining({ id: 'evt-moved:move:0' })])
    expect(mergePublicEventResourceAnimations([], feedback.resourceAnimations)).toHaveLength(1)
  })

  it('namespaces replay feedback without touching live cursor inputs', () => {
    const event = {
      schemaVersion: 1,
      id: 'evt-replay',
      seq: 1,
      round: 1,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceActionId: 'forest',
      type: 'resource.paid',
      resources: { wood: 1 },
      paymentFor: 'bonus',
    } satisfies GameEvent
    const entry = {
      key: 'event:1:0:evt-replay:1',
      kind: 'event',
      packetSeq: 1,
      packetLocalIndex: 0,
      event,
      eventId: event.id,
      eventSeq: event.seq,
      status: 'active',
      payloadSource: 'currentEvents',
      replayable: true,
    } satisfies ReplayTimelineEntry

    const feedback = buildReplayFeedback(entry, 'en')

    expect(feedback.notifications).toHaveLength(1)
    expect(feedback.notifications.every((item) =>
      item.id.startsWith('replay:event:1:0:evt-replay:1:'))).toBe(true)
    expect(feedback.resourceAnimations).toHaveLength(1)
    expect(feedback.resourceAnimations.every((item) =>
      item.id.startsWith('replay:event:1:0:evt-replay:1:'))).toBe(true)
    expect(feedback.highlights.actionIds).toEqual(['forest'])
  })

  it('does not build replay feedback for missing entries', () => {
    expect(buildReplayFeedback({
      key: 'event:1:0:missing:9',
      kind: 'event',
      packetSeq: 1,
      packetLocalIndex: 0,
      event: null,
      eventId: 'missing',
      eventSeq: 9,
      status: 'missing',
      payloadSource: 'missing',
      replayable: false,
    }, 'en')).toEqual(clearReplayFeedback())
  })

  it('clears canceled public feedback and aligns the cursor to the undo snapshot', () => {
    const canceledEvent = {
      schemaVersion: 1,
      id: 'evt-canceled',
      seq: 3,
      round: 1,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      type: 'resource.paid',
      resources: { wood: 1 },
      paymentFor: 'bonus',
    } satisfies GameEvent
    const undoSnapshotEvents = [
      {
        schemaVersion: 1,
        id: 'evt-kept',
        seq: 2,
        round: 1,
        phase: 'work',
        visibility: 'public',
        actorPlayerId: 'p1',
        type: 'game.started',
      },
    ] satisfies GameEvent[]
    const clearPublicEventFeedback = vi.fn()
    const setLastSeenPublicEventSeq = vi.fn()

    expect(collectNewPublicEventFeedback([canceledEvent], 0, 'en', 'public-test').notifications)
      .toHaveLength(1)

    expect(applyPublicEventCancellationSnapshot({
      publicEventCancellations: [{
        reason: 'undoStep',
        previousMaxSeq: 3,
        nextMaxSeq: 2,
        canceledEventIds: ['evt-canceled'],
        canceledSeqs: [3],
      }],
      state: { events: undoSnapshotEvents },
    }, {
      clearPublicEventFeedback,
      setLastSeenPublicEventSeq,
    })).toBe(true)
    expect(clearPublicEventFeedback).toHaveBeenCalledTimes(1)
    expect(setLastSeenPublicEventSeq).toHaveBeenCalledWith(maxPublicEventSeq(undoSnapshotEvents))
    expect(collectNewPublicEventFeedback(undoSnapshotEvents, setLastSeenPublicEventSeq.mock.calls[0]![0], 'en', 'public-test'))
      .toEqual({
        notifications: [],
        highlights: { actionIds: [], farmTiles: [], fenceEdges: [] },
        resourceAnimations: [],
        nextCursor: 2,
      })
  })

  it('ignores snapshots without public event cancellations', () => {
    const clearPublicEventFeedback = vi.fn()
    const setLastSeenPublicEventSeq = vi.fn()

    expect(applyPublicEventCancellationSnapshot({
      state: { events: [] },
    }, {
      clearPublicEventFeedback,
      setLastSeenPublicEventSeq,
    })).toBe(false)
    expect(clearPublicEventFeedback).not.toHaveBeenCalled()
    expect(setLastSeenPublicEventSeq).not.toHaveBeenCalled()
  })

  it('filters public farm highlights by viewed player', () => {
    expect(filterPublicFarmHighlightsForPlayer([
      { playerId: 'p1', key: '0-0' },
      { playerId: 'p2', key: '0-0' },
    ], 'p1')).toEqual(new Set(['0-0']))

    expect(filterPublicFenceHighlightsForPlayer([
      { playerId: 'p1', edgeId: 'h-0-0' },
      { playerId: 'p2', edgeId: 'h-0-0' },
    ], 'p2')).toEqual(new Set(['h-0-0']))
  })
})
