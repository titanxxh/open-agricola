import type { ActionContext, ActionSpaceUseContext } from '../contract/types'
import type { GameEvent } from '../contract/events'

export type SpaceUseState = {
  spaceId: string
  playerId?: string
  sourceCard?: string
  use: ActionSpaceUseContext
  completePlacement: boolean
  actionContext?: ActionContext
  bodyId: string
  immediateId: string
  afterId: string
  bodyCompleted: boolean
  succeeded: boolean
  actionEvents: GameEvent[]
}

export type SpaceUsePhase = { scopeId: string; phase: 'immediatelyAfter' | 'after' }
