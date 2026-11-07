export type DraftMode = 'none' | 'simultaneous'
export type DraftStageKind = 'standard' | 'occupation' | 'farmersOfTheMoorMinor' | 'publishedMinor'

export type DraftPickPayload = {
  opportunityKey: string
  occCardId?: string
  minorCardId?: string
}

export type DraftPool = { occ: string[]; minor: string[] }

export type DraftStageSpec = {
  kind: DraftStageKind
  poolSize: number
  totalRounds: number
  pools: Record<string, DraftPool>
}

export type DraftStage = Omit<DraftStageSpec, 'pools'> & {
  seats: Record<string, { kept: DraftPool; inbox: Record<number, DraftPool> }>
}

export type DraftState = {
  mode: 'simultaneous'
  seatOrder: string[]
  stages: DraftStage[]
  lastManualPickerId: string | null
}

export type DraftView = DraftState
