import type { GameState, PlayerState, Resource } from '../../../game/types'

export type MajorEffectHook =
  | 'onBuy'
  | 'onRoundStart'
  | 'onHarvest'
  | 'onRoundEnd'

export type MajorCardEffect = {
  id: string
  cost: Partial<Resource>
  vp: number
  extraVp: boolean
  description: string[]
  scoring?: {
    resource: keyof Resource
    map: Record<string, number>
  }
  onBuy?: (state: GameState, player: PlayerState) => void
  onRoundStart?: (state: GameState, player: PlayerState) => void
  onHarvest?: (state: GameState, player: PlayerState) => void
  onRoundEnd?: (state: GameState, player: PlayerState) => void
}
