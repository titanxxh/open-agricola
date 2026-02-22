import { useState } from 'react'
import type { FarmTilePosition } from '../game/types'

export const useFarmSelection = () => {
  const [pendingFenceEdges, setPendingFenceEdges] = useState<string[]>([])
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
    Record<string, 'grain' | 'vegetable'>
  >({})
  const [sowError, setSowError] = useState<string | null>(null)

  const toggleFenceEdge = (edgeId: string) => {
    setPendingFenceEdges((prev) =>
      prev.includes(edgeId)
        ? prev.filter((edge) => edge !== edgeId)
        : [...prev, edgeId],
    )
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
    positionKey: (tile: FarmTilePosition) => string,
  ) => {
    const key = positionKey(tile)
    setPendingSowSelections((prev) => {
      if (!value) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      if (value !== 'grain' && value !== 'vegetable') return prev
      return { ...prev, [key]: value }
    })
    setSowError(null)
  }

  return {
    pendingFenceEdges,
    setPendingFenceEdges,
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
  }
}
