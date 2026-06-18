import type { ActionFlow, GameState, PlayerState, Resource } from '../contract/types'
import type { MotherCardDefinition, MotherParentCardId } from './types'
import { getParentCardDefinition } from './cards'

const RESERVED_STABLE_KEY = 'motherStableReserved'
const REWARD_SETTLED_KEY = 'motherRewardSettled'

const getMotherDefinition = (id: MotherParentCardId | null): MotherCardDefinition | null => {
  if (!id) return null
  const card = getParentCardDefinition(id)
  return card?.kind === 'mother' ? card : null
}

const ensureParentCardStateExtraData = (
  player: PlayerState,
  cardId: MotherParentCardId,
): Record<string, unknown> => {
  player.cardStates ??= {}
  player.cardStates[cardId] ??= {}
  player.cardStates[cardId].extraData ??= {}
  return player.cardStates[cardId].extraData
}

const parentCardExtraData = (
  player: PlayerState,
  cardId: MotherParentCardId,
): Record<string, unknown> =>
  player.cardStates?.[cardId]?.extraData ?? {}

const hasSettledMotherReward = (
  player: PlayerState,
  cardId: MotherParentCardId,
): boolean =>
  parentCardExtraData(player, cardId)[REWARD_SETTLED_KEY] === true

const markMotherRewardSettled = (
  player: PlayerState,
  cardId: MotherParentCardId,
): void => {
  ensureParentCardStateExtraData(player, cardId)[REWARD_SETTLED_KEY] = true
}

export const reserveSelectedMotherRewards = (state: GameState): void => {
  if (!state.enableParentCards) return
  for (const player of state.players) {
    const card = getMotherDefinition(player.parentCards.mother)
    if (!card || card.gain.type !== 'stable' || !card.gain.fromSupply) continue
    const extraData = ensureParentCardStateExtraData(player, card.id)
    if (extraData[RESERVED_STABLE_KEY] === true) continue
    extraData[RESERVED_STABLE_KEY] = true
    player.supplyTokensConsumed ??= {}
    player.supplyTokensConsumed.stable = (player.supplyTokensConsumed.stable ?? 0) + 1
  }
}

export const getReservedMotherStableCount = (player: PlayerState): number => {
  const mother = player.parentCards.mother
  if (!mother) return 0
  return parentCardExtraData(player, mother)[RESERVED_STABLE_KEY] === true ? 1 : 0
}

export const clearSettledMotherReservations = (state: GameState): void => {
  if (!state.enableParentCards) return
  for (const player of state.players) {
    const card = getMotherDefinition(player.parentCards.mother)
    if (!card || card.round !== state.round) continue
    const extraData = ensureParentCardStateExtraData(player, card.id)
    if (card.gain.type === 'stable' && extraData[RESERVED_STABLE_KEY] === true && player.supplyTokensConsumed?.stable) {
      player.supplyTokensConsumed.stable = Math.max(0, player.supplyTokensConsumed.stable - 1)
      if (player.supplyTokensConsumed.stable === 0) delete player.supplyTokensConsumed.stable
    }
    delete extraData[RESERVED_STABLE_KEY]
    extraData[REWARD_SETTLED_KEY] = true
  }
}

const resourceFlow = (
  player: PlayerState,
  card: MotherCardDefinition,
  resources: Partial<Resource>,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'receive',
  targetPlayerId: player.id,
  sourceCard: card.id,
  params: {
    entries: [{
      cardId: card.id,
      round: card.round,
      resources,
    }],
  },
})

const fieldFlow = (
  player: PlayerState,
  card: MotherCardDefinition,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'plow',
  targetPlayerId: player.id,
  sourceCard: card.id,
  actionContext: { exactCost: { max: 1 } },
})

const stableFlow = (
  player: PlayerState,
  card: MotherCardDefinition,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'stables',
  targetPlayerId: player.id,
  sourceCard: card.id,
  actionContext: { exactCost: { max: 1 } },
})

const buildRewardFlow = (
  player: PlayerState,
  card: MotherCardDefinition,
): ActionFlow | null => {
  switch (card.gain.type) {
    case 'resource':
      markMotherRewardSettled(player, card.id)
      return resourceFlow(player, card, { [card.gain.resource]: card.gain.amount })
    case 'field':
      return fieldFlow(player, card)
    case 'stable':
      return stableFlow(player, card)
  }
}

export const buildMotherRoundRewardFlow = (
  state: GameState,
): { flow: ActionFlow; playerIndex: number } | null => {
  if (!state.enableParentCards) return null
  const children: ActionFlow[] = []
  let firstPlayerIndex = -1
  state.players.forEach((player, playerIndex) => {
    const card = getMotherDefinition(player.parentCards.mother)
    if (!card || card.round !== state.round || hasSettledMotherReward(player, card.id)) return
    const flow = buildRewardFlow(player, card)
    if (!flow) return
    if (firstPlayerIndex === -1) firstPlayerIndex = playerIndex
    children.push(flow)
  })
  if (children.length === 0 || firstPlayerIndex === -1) return null
  return {
    flow: children.length === 1 ? children[0]! : { type: 'seq', children },
    playerIndex: firstPlayerIndex,
  }
}
