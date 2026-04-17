import { useState } from 'react'
import type { FarmTilePosition } from '../../shared/game/types'
import type { PendingSowCrop } from '../types/ui'

export const useFarmSelection = () => {
  const [pendingFenceEdges, setPendingFenceEdges] = useState<string[]>([])
  const [pendingPalisadeEdges, setPendingPalisadeEdges] = useState<string[]>([])
  const [fencePlacementMode, setFencePlacementMode] = useState<'fence' | 'palisade'>('fence')
  const [fenceError, setFenceError] = useState<{
    code: string
    edges: string[]
    newEdges: string[]
  } | null>(null)
  const [pendingRoomTiles, setPendingRoomTiles] = useState<FarmTilePosition[]>(
    [],
  )
  const [roomError, setRoomError] = useState<string | null>(null)
  const [pendingStableTiles, setPendingStableTiles] = useState<FarmTilePosition[]>(
    [],
  )
  const [stableError, setStableError] = useState<string | null>(null)
  const [pendingPlowTile, setPendingPlowTile] =
    useState<FarmTilePosition | null>(null)
  const [plowError, setPlowError] = useState<string | null>(null)
  const [pendingSowSelections, setPendingSowSelections] = useState<
    Record<string, PendingSowCrop>
  >({})
  const [sowError, setSowError] = useState<string | null>(null)
  const [pendingFieldSelections, setPendingFieldSelections] = useState<Set<string>>(new Set())

  const toggleFenceEdge = (edgeId: string) => {
    const inFence = pendingFenceEdges.includes(edgeId)
    const inPalisade = pendingPalisadeEdges.includes(edgeId)

    if (fencePlacementMode === 'fence') {
      if (inFence) setPendingFenceEdges((prev) => prev.filter((e) => e !== edgeId))
      else if (inPalisade) {
        setPendingPalisadeEdges((prev) => prev.filter((e) => e !== edgeId))
        setPendingFenceEdges((prev) => [...prev, edgeId])
      } else setPendingFenceEdges((prev) => [...prev, edgeId])
    } else {
      if (inPalisade) setPendingPalisadeEdges((prev) => prev.filter((e) => e !== edgeId))
      else if (inFence) {
        setPendingFenceEdges((prev) => prev.filter((e) => e !== edgeId))
        setPendingPalisadeEdges((prev) => [...prev, edgeId])
      } else setPendingPalisadeEdges((prev) => [...prev, edgeId])
    }
  }

  const toggleRoomTile = (
    tile: FarmTilePosition,
    maxRoomSelections: number,
    positionKey: (tile: FarmTilePosition) => string,
  ) => {
    const key = positionKey(tile)
    setPendingRoomTiles((prev) => {
      const set = new Set(prev.map((item) => positionKey(item)))
      if (set.has(key)) {
        return prev.filter((item) => positionKey(item) !== key)
      }
      if (prev.length >= maxRoomSelections) return prev
      return [...prev, tile]
    })
    setRoomError(null)
  }

  const toggleStableTile = (
    tile: FarmTilePosition,
    maxStableSelections: number,
    positionKey: (tile: FarmTilePosition) => string,
  ) => {
    const key = positionKey(tile)
    setPendingStableTiles((prev) => {
      const set = new Set(prev.map((item) => positionKey(item)))
      if (set.has(key)) {
        return prev.filter((item) => positionKey(item) !== key)
      }
      if (prev.length >= maxStableSelections) return prev
      return [...prev, tile]
    })
    setStableError(null)
  }

  const togglePlowTile = (
    tile: FarmTilePosition,
    positionKey: (tile: FarmTilePosition) => string,
  ) => {
    const key = positionKey(tile)
    setPendingPlowTile((prev) => {
      if (prev && positionKey(prev) === key) {
        return null
      }
      return tile
    })
    setPlowError(null)
  }

  const updateSowSelection = (
    tile: FarmTilePosition,
    value: string,
    maxSowSelections: number | undefined,
    positionKey: (tile: FarmTilePosition) => string,
  ) => {
    const key = positionKey(tile)
    setPendingSowSelections((prev) => {
      if (!value) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      if (value !== 'grain' && value !== 'vegetable' && value !== 'wood') return prev
      const alreadySelected = Object.prototype.hasOwnProperty.call(prev, key)
      if (
        !alreadySelected &&
        typeof maxSowSelections === 'number' &&
        maxSowSelections >= 0 &&
        Object.keys(prev).length >= maxSowSelections
      ) {
        return prev
      }
      return { ...prev, [key]: value }
    })
    setSowError(null)
  }

  const toggleFieldSelection = (
    tile: FarmTilePosition,
    maxFieldSelections: number,
    positionKey: (tile: FarmTilePosition) => string,
  ) => {
    const key = positionKey(tile)
    setPendingFieldSelections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else if (next.size < maxFieldSelections) {
        next.add(key)
      }
      return next
    })
  }

  return {
    pendingFenceEdges,
    setPendingFenceEdges,
    pendingPalisadeEdges,
    setPendingPalisadeEdges,
    fencePlacementMode,
    setFencePlacementMode,
    fenceError,
    setFenceError,
    pendingRoomTiles,
    setPendingRoomTiles,
    roomError,
    setRoomError,
    pendingStableTiles,
    setPendingStableTiles,
    stableError,
    setStableError,
    pendingPlowTile,
    setPendingPlowTile,
    plowError,
    setPlowError,
    pendingSowSelections,
    setPendingSowSelections,
    sowError,
    setSowError,
    toggleFenceEdge,
    toggleRoomTile,
    toggleStableTile,
    togglePlowTile,
    updateSowSelection,
    pendingFieldSelections,
    setPendingFieldSelections,
    toggleFieldSelection,
  }
}
