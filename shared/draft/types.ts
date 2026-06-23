export type DraftMode = 'none' | 'simultaneous'

export type DraftStageKind = 'standard' | 'occupation' | 'farmersOfTheMoorMinor' | 'publishedMinor'

export type DraftPickPayload = {
  occCardId?: string
  minorCardId?: string
}

export type DraftPool = {
  occ: string[]
  minor: string[]
}

export type DraftStageSpec = {
  kind: Exclude<DraftStageKind, 'standard'>
  poolSize: number
  totalRounds: number
  pools: Record<string, DraftPool>
}

export type DraftState = {
  mode: 'simultaneous'
  stage?: DraftStageKind
  stageIndex?: number
  stages?: DraftStageSpec[]
  round: number               // 1..totalRounds
  totalRounds: number         // 7
  poolSize: number            // 7..10
  seatOrder: string[]         // playerId[] clockwise
  pools: Record<string, DraftPool>           // what each player currently holds
  kept: Record<string, DraftPool>            // cumulative picks
  pendingPicks: Record<string, { occ: string | null; minor: string | null }>
}

/** Client-facing view of draft state. MVP identical to DraftState (per-connection filtering is issue #7). */
export type DraftView = DraftState
