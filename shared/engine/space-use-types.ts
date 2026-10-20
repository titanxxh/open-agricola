import type { ActionContext, ActionSpaceUseContext } from '../contract/types'
import type { GameEvent } from '../contract/events'

export type SpaceUseState = {
  spaceId: string
  playerId?: string
  sourceCard?: string
  use: ActionSpaceUseContext
  completePlacement: boolean
  actionContext?: ActionContext
  succeeded: boolean
  actionEvents: GameEvent[]
}
