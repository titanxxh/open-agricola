import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow, FarmTilePosition, FarmyardSpaceState, Resource } from '../../contract/types'
import { positionKey } from '../../domain/farm'
import { getFarmyardSpaceStates } from '../../domain/farmyard-space-states'
import { hasClaimableFarmyardGoodsTokens } from '../../domain/farmyard-space-token-claims'
import { getOwnOrdinaryFenceReserveCount } from '../../domain/supply-tokens'
import type { MoorSpecialActionId } from '../../moor/types'

type ClearedSpaceTokenConfig = {
  cardId: string
  listenerId: string
  actions: MoorSpecialActionId[]
  kind: FarmyardSpaceState['kind']
  resources?: Partial<Resource>
  bonusVp?: number
  blocksPlacement?: boolean
  optional?: boolean
  consumeFence?: boolean
}

const payloadTile = (context: CardListenerContext): FarmTilePosition | undefined => {
  const payload = context.extraData?.payload
  if (!payload || typeof payload !== 'object') return undefined
  const tile = (payload as { tile?: unknown }).tile
  if (!tile || typeof tile !== 'object') return undefined
  const { row, col } = tile as FarmTilePosition
  if (!Number.isFinite(row) || !Number.isFinite(col)) return undefined
  return { row, col }
}

const specialEffectLeaf = (
  cardId: string,
  params: Record<string, unknown>,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: cardId,
  params,
})

const addStateFlow = (
  config: ClearedSpaceTokenConfig,
  tile: FarmTilePosition,
): ActionFlow => {
  const state: FarmyardSpaceState = {
    spaceKey: positionKey(tile),
    sourceCardId: config.cardId,
    kind: config.kind,
    ...(config.resources ? { resources: config.resources } : {}),
    ...(typeof config.bonusVp === 'number' ? { bonusVp: config.bonusVp } : {}),
    ...(config.blocksPlacement ? { blocksPlacement: true } : {}),
    ...(config.kind === 'farmyard-goods-token' ? { claimPolicy: 'when-no-longer-unused' as const } : {}),
  }
  const children = [
    ...(config.consumeFence ? [specialEffectLeaf(config.cardId, {
      kind: 'consume-supply-token',
      key: 'fence',
      amount: 1,
    })] : []),
    specialEffectLeaf(config.cardId, {
      kind: 'add-farmyard-space-state',
      state,
    }),
  ]
  return children.length === 1 ? children[0]! : { type: 'seq', children }
}

export const makeClearedSpaceTokenListener = (
  config: ClearedSpaceTokenConfig,
): CardListenerRegistration => ({
  id: config.listenerId,
  cardIds: [config.cardId],
  phases: ['after' as ActionHookPhase],
  actions: config.actions,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.extraData?.terrainCleared === false) return
    const player = context.ownerPlayer ?? context.player
    if (config.consumeFence && getOwnOrdinaryFenceReserveCount(player) <= 0) return
    const tile = payloadTile(context)
    if (!tile) return
    const flow = addStateFlow(config, tile)
    return {
      flow: config.optional ? { type: 'seq', optional: true, children: [flow] } : flow,
      sourceCard: config.cardId,
    }
  },
})

export const makeFarmyardGoodsClaimListener = (
  cardId: string,
): CardListenerRegistration => ({
  id: `${cardId}-claim-farmyard-goods-token`,
  cardIds: [cardId],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const player = context.ownerPlayer ?? context.player
    if (!hasClaimableFarmyardGoodsTokens(player, cardId)) return
    return {
      flow: specialEffectLeaf(cardId, { kind: 'claim-farmyard-goods-tokens' }),
      sourceCard: cardId,
    }
  },
})

export const farmyardSpaceBonus = (cardId: string) =>
  (_state: unknown, player: { farmyardSpaceStates?: FarmyardSpaceState[] }) =>
    getFarmyardSpaceStates(player)
      .filter((state) => state.sourceCardId === cardId)
      .reduce((sum, state) => sum + (state.bonusVp ?? 0), 0)
