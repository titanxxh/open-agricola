import type { FarmyardSpaceState, PlayerState } from '../contract/types'

const positionKey = (tile: { row: number; col: number }) => `${tile.row}-${tile.col}`

const parsePositionKey = (key: string): { row: number; col: number } | null => {
  const match = /^(-?\d+)-(-?\d+)$/.exec(key)
  if (!match) return null
  const row = Number(match[1])
  const col = Number(match[2])
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { row, col }
}

const FARMYARD_SPACE_STATE_KINDS = new Set([
  'blocked-farmyard-space',
  'farmyard-goods-token',
  'field-goods-token',
  'non-field-crop-space',
])

export const normalizeFarmyardSpaceStates = (input: unknown): FarmyardSpaceState[] => {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  return input.flatMap((entry): FarmyardSpaceState[] => {
    if (!entry || typeof entry !== 'object') return []
    const raw = entry as Partial<FarmyardSpaceState>
    if (typeof raw.spaceKey !== 'string' || !parsePositionKey(raw.spaceKey)) return []
    if (typeof raw.sourceCardId !== 'string') return []
    if (typeof raw.kind !== 'string' || !FARMYARD_SPACE_STATE_KINDS.has(raw.kind)) return []
    const key = `${raw.sourceCardId}:${raw.kind}:${raw.spaceKey}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{
      spaceKey: raw.spaceKey,
      sourceCardId: raw.sourceCardId,
      kind: raw.kind,
      ...(raw.resources ? { resources: raw.resources } : {}),
      ...(raw.crop ? { crop: raw.crop } : {}),
      ...(typeof raw.bonusVp === 'number' ? { bonusVp: raw.bonusVp } : {}),
      ...(raw.claimPolicy ? { claimPolicy: raw.claimPolicy } : {}),
      ...(raw.blocksPlacement === true ? { blocksPlacement: true } : {}),
    }]
  })
}

export const getFarmyardSpaceStates = (player: Pick<PlayerState, 'farmyardSpaceStates'>) =>
  player.farmyardSpaceStates ?? []

export const getBlockedFarmyardSpaceKeys = (player: Pick<PlayerState, 'farmyardSpaceStates'>) =>
  new Set(
    getFarmyardSpaceStates(player)
      .filter((state) => state.blocksPlacement === true)
      .map((state) => state.spaceKey),
  )

export const getPlacementBlockedFarmyardSpaceKeys = (player: Pick<PlayerState, 'farmyardSpaceStates'>) =>
  new Set(
    getFarmyardSpaceStates(player)
      .filter((state) =>
        state.blocksPlacement === true ||
        (state.kind === 'non-field-crop-space' && (state.crop?.remaining ?? 0) > 0),
      )
      .map((state) => state.spaceKey),
  )

export const addFarmyardSpaceState = (
  player: PlayerState,
  state: FarmyardSpaceState,
) => {
  const next = normalizeFarmyardSpaceStates([
    ...getFarmyardSpaceStates(player).filter((entry) =>
      !(entry.spaceKey === state.spaceKey && entry.kind === state.kind && entry.sourceCardId === state.sourceCardId),
    ),
    state,
  ])
  player.farmyardSpaceStates = next
}

export const farmyardSpaceStateForTile = (
  player: Pick<PlayerState, 'farmyardSpaceStates'>,
  tile: { row: number; col: number },
) => getFarmyardSpaceStates(player).filter((state) => state.spaceKey === positionKey(tile))
