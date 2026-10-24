import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import { parsePendingMoorSpecialActionChoice } from './game-container-helpers'

export type InteractionFocusTarget = 'occupation-hand' | 'minor-hand' | 'major-supply' | 'actions' | 'controls' | 'farm'

export const interactionFocusRequestKey = (interaction: ClientInteractionState): string =>
  interaction.stateId === 'wait'
    ? interaction.requestKey ?? JSON.stringify([interaction.playerIndex, interaction.spaceId, interaction.sourceCard,
      interaction.promptKey, interaction.promptParams, interaction.request])
    : interaction.stateId

export const getInteractionFocusTarget = (
  interaction: ClientInteractionState,
): InteractionFocusTarget | null => {
  if (interaction.stateId !== 'wait' || interaction.request.kind === 'private-prompt') return null
  if (interaction.request.kind === 'farm-select' || interaction.request.kind === 'animal-reorg' ||
    (interaction.request.kind === 'selection' && interaction.request.selection.kind === 'farm-position')) return 'farm'
  if (interaction.request.kind === 'choice' && interaction.request.options.some(option => !option.disabled &&
    (option.target || parsePendingMoorSpecialActionChoice(option)?.tile))) return 'farm'
  if (interaction.request.kind === 'selection' && interaction.request.selection.kind === 'occupation-hand') {
    return 'occupation-hand'
  }
  if (interaction.request.kind === 'choice' && interaction.promptKey === 'ui.interactionChooseOccupation') {
    return 'occupation-hand'
  }
  return null
}

const revealTarget = (target: InteractionFocusTarget, playerId: string): boolean => {
  const node = Array.from(document.querySelectorAll<HTMLElement>(`[data-interaction-focus="${target}"]`))
    .find(candidate => !candidate.closest('[hidden]') && (!candidate.dataset.focusPlayer || candidate.dataset.focusPlayer === playerId))
  if (!node) return false
  document.querySelectorAll('[data-interaction-focused]').forEach(previous => previous.removeAttribute('data-interaction-focused'))
  node.setAttribute('data-interaction-focused', 'true')
  if (target === 'controls') return true
  const viewport = window.visualViewport
  const viewportTop = (viewport?.offsetTop ?? 0) + 12
  const bar = node.closest('.app')?.querySelector<HTMLElement>('.interaction-bar')
  const viewportBottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
    bar?.getBoundingClientRect().top ?? window.innerHeight) - 12
  const bounds = node.getBoundingClientRect()
  const firstCard = node.querySelector<HTMLElement>('.player-card.selectable, .player-card')
  const bottom = firstCard?.getBoundingClientRect().bottom ?? bounds.bottom
  if (bounds.top >= viewportTop && bottom <= viewportBottom) return true
  window.scrollBy({ top: bounds.top - viewportTop, behavior: 'instant' })
  return true
}

export const useInteractionFocus = ({ interaction, canFocus, playerId, onViewPlayer, targetOverride, localRequest }: {
  interaction: ClientInteractionState
  canFocus: boolean
  playerId: string
  onViewPlayer: (playerId: string) => void
  targetOverride?: InteractionFocusTarget | null
  localRequest?: { key: string; target: InteractionFocusTarget }
}) => {
  const [followingAction, setFollowingAction] = useState(false)
  const lastFocusedRequest = useRef<string | null>(null)
  const requestKey = interactionFocusRequestKey(interaction) + (localRequest ? `:${localRequest.key}` : '')
  const requestedTarget = localRequest?.target ?? targetOverride ?? getInteractionFocusTarget(interaction)
  const complete = !localRequest && (interaction.stateId === 'idle' || (interaction.stateId === 'wait' && interaction.request.kind === 'confirm-next-player'))
  const target = requestedTarget ?? (followingAction && !complete ? 'controls' : null)

  useEffect(() => {
    if (!canFocus || lastFocusedRequest.current === requestKey) return
    if (!requestedTarget && !followingAction) return
    const nextTarget = complete ? 'actions' : target
    if (!nextTarget) return
    if (nextTarget !== 'actions' && nextTarget !== 'controls') onViewPlayer(playerId)
    const frame = window.requestAnimationFrame(() => {
      if (!revealTarget(nextTarget, playerId)) return
      lastFocusedRequest.current = requestKey
      setFollowingAction(!complete)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [canFocus, complete, followingAction, onViewPlayer, playerId, requestKey, requestedTarget, target])

  const returnToTarget = useCallback(() => {
    if (!canFocus || !target) return
    onViewPlayer(playerId)
    window.requestAnimationFrame(() => revealTarget(target, playerId))
  }, [canFocus, onViewPlayer, playerId, target])

  return { hasTarget: canFocus && target !== null && !complete, returnToTarget }
}
