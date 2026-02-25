import { useCallback, useRef } from 'react'
import type { ActionChoiceOption, GameState, Resource } from '../../shared/game/types'

const API_BASE = 'http://localhost:5175'

type PendingAction =
  | { type: 'choice'; playerIndex: number; spaceId: string; options: ActionChoiceOption[]; promptKey?: string }
  | { type: 'animalReorg'; playerIndex: number; spaceId: string }
  | { type: 'harvestFeed'; playerIndex: number; remaining: number }
  | { type: 'confirmNextPlayer'; nextPlayerIndex: number }
  | { type: 'none' }

export type GameApiResponse = {
  ok: boolean
  state: GameState
  pending: PendingAction
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: Record<string, unknown>
  error?: string
}

type ReorgZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable'
  animalType: 'sheep' | 'boar' | 'cattle' | null
  animalCount: number
}

type FeedSelection = {
  resourceKey: keyof Resource
  count: number
  food: number
}

const post = async (path: string, body?: unknown): Promise<GameApiResponse> => {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return resp.json() as Promise<GameApiResponse>
}

const get = async (path: string): Promise<GameApiResponse> => {
  const resp = await fetch(`${API_BASE}${path}`)
  return resp.json() as Promise<GameApiResponse>
}

export const useGameApi = () => {
  const inflight = useRef(false)

  const guard = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    if (inflight.current) throw new Error('request already in flight')
    inflight.current = true
    try { return await fn() } finally { inflight.current = false }
  }, [])

  const fetchState = useCallback(() => get('/api/game/state'), [])

  const takeAction = useCallback((playerIndex: number, spaceId: string) =>
    guard(() => post('/api/game/action', { playerIndex, spaceId })), [guard])

  const resolveChoice = useCallback((playerIndex: number, value: string) =>
    guard(() => post('/api/game/choice', { playerIndex, value })), [guard])

  const confirmReorg = useCallback((playerIndex: number, zones: ReorgZone[]) =>
    guard(() => post('/api/game/reorg', { playerIndex, zones })), [guard])

  const confirmFeed = useCallback((playerIndex: number, selections: FeedSelection[]) =>
    guard(() => post('/api/game/feed', { playerIndex, selections })), [guard])

  const confirmNextPlayer = useCallback(() =>
    guard(() => post('/api/game/next-player')), [guard])

  const performRoundEnd = useCallback(() =>
    guard(() => post('/api/game/round-end')), [guard])

  const undoStep = useCallback(() =>
    guard(() => post('/api/game/undo')), [guard])

  const undoAction = useCallback(() =>
    guard(() => post('/api/game/undo-action')), [guard])

  const newGame = useCallback(() =>
    guard(() => post('/api/game/new')), [guard])

  const loadGame = useCallback((state: unknown) =>
    guard(() => post('/api/game/load', { state })), [guard])

  return {
    fetchState,
    takeAction,
    resolveChoice,
    confirmReorg,
    confirmFeed,
    confirmNextPlayer,
    performRoundEnd,
    undoStep,
    undoAction,
    newGame,
    loadGame,
  }
}
