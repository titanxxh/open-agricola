// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import type { InteractionRequest } from '../../../shared/contract/types'
import { getInteractionFocusTarget, useInteractionFocus } from '../interaction-focus'

const occupation: ClientInteractionState = {
  stateId: 'wait', playerIndex: 0, spaceId: 'lessons',
  promptKey: 'ui.interactionChooseOccupation', allowedCommands: ['resolveChoice'], anytimeActions: [],
  request: { kind: 'choice', options: [{ value: 'A116_WoodCutter', labelKey: 'occupations.A116_WoodCutter.name' }] },
}
const idle: ClientInteractionState = { stateId: 'idle', allowedCommands: ['takeAction'], anytimeActions: [] }

const Harness = ({ interaction = occupation, permitted = true, terrain = false }: {
  interaction?: ClientInteractionState
  permitted?: boolean
  terrain?: boolean
}) => {
  const focus = useInteractionFocus({ interaction, canFocus: permitted, playerId: 'p1', onViewPlayer: () => {},
    localRequest: terrain ? { key: 'selected-terrain', target: 'farm' } : undefined })
  return <div className="app">
    <div data-interaction-focus="actions">Action spaces</div>
    <div data-interaction-focus="occupation-hand" data-focus-player="p1">Occupations</div>
    <div data-interaction-focus="controls">Payment controls</div>
    <div data-interaction-focus="farm" data-focus-player="p1">Farm targets</div>
    {focus.hasTarget && <button onClick={focus.returnToTarget}>Return to current action</button>}
  </div>
}

beforeEach(() => {
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.interactionFocus === 'occupation-hand' ? 1200 : 10
    return { x: 0, y: top, top, left: 0, right: 320, bottom: top + 180, width: 320, height: 180, toJSON: () => ({}) }
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Interaction Focus', () => {
  it('focuses a locally selected terrain target before a server command and keeps repeated idle snapshots still', async () => {
    const view = render(<Harness interaction={idle} />)
    view.rerender(<Harness interaction={idle} terrain />)
    await waitFor(() => expect(document.querySelector('[data-interaction-focus="farm"]')).toHaveAttribute('data-interaction-focused', 'true'))
    const calls = vi.mocked(window.scrollBy).mock.calls.length
    view.rerender(<Harness interaction={structuredClone(idle)} terrain />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).toHaveBeenCalledTimes(calls)
    view.rerender(<Harness interaction={idle} />)
    await waitFor(() => expect(document.querySelector('[data-interaction-focus="actions"]')).toHaveAttribute('data-interaction-focused', 'true'))
  })

  it.each([
    { label: 'room', request: { kind: 'farm-select', farm: { farmType: 'room', selectableTiles: [{ row: 0, col: 1 }], maxSelections: 1 } } },
    { label: 'stable', request: { kind: 'farm-select', farm: { farmType: 'stable', selectableTiles: [{ row: 0, col: 1 }], maxSelections: 1 } } },
    { label: 'fence', request: { kind: 'farm-select', farm: { farmType: 'fence', selectableEdges: ['H:0:1'] } } },
    { label: 'plow', request: { kind: 'farm-select', farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 1 }] } } },
    { label: 'sow', request: { kind: 'farm-select', farm: { farmType: 'sow', selectableFields: [{ tile: { row: 0, col: 1 }, allowedCrops: ['grain'] }] } } },
    { label: 'position', request: { kind: 'selection', selection: { kind: 'farm-position', selectablePositions: [{ row: 0, col: 1 }], maxSelections: 1 } } },
    { label: 'animal', request: { kind: 'animal-reorg', zones: [] } },
    { label: 'spatial choice', request: { kind: 'choice', options: [{ value: 'opaque-target', labelKey: 'ui.interactionConfirmButton', target: { kind: 'farm-cell', playerId: 'p1', positions: [{ row: 0, col: 1 }] } }] } },
  ] satisfies Array<{ label: string; request: InteractionRequest }>)('focuses the actual $label request on the farm, regardless of action-space or prompt name', ({ request }) => {
    expect(getInteractionFocusTarget({ stateId: 'wait', playerIndex: 0, spaceId: 'lessons',
      allowedCommands: ['commitSelection'], anytimeActions: [], request })).toBe('farm')
  })

  it('reveals the occupation hand once and leaves manual browsing alone until the shortcut is used', async () => {
    const view = render(<Harness />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    expect(document.querySelector('[data-interaction-focus="occupation-hand"]')).toHaveAttribute('data-interaction-focused', 'true')
    view.rerender(<Harness interaction={structuredClone(occupation)} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Return to current action' }))
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledTimes(2))
  })

  it('follows payment and the next occupation without returning until the action is complete', async () => {
    const view = render(<Harness />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    const payment: ClientInteractionState = {
      ...occupation, stateId: 'wait', playerIndex: 0,
      promptKey: 'ui.interactionChooseOne', allowedCommands: ['resolveChoice'], anytimeActions: [],
      request: { kind: 'choice', options: [{ value: 'pay', labelKey: 'ui.interactionConfirmButton' }] },
    }
    view.rerender(<Harness interaction={payment} />)
    await waitFor(() => expect(document.querySelector('[data-interaction-focus="controls"]')).toHaveAttribute('data-interaction-focused', 'true'))
    expect(document.querySelector('[data-interaction-focus="actions"]')).not.toHaveAttribute('data-interaction-focused')
    view.rerender(<Harness />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledTimes(2))
    view.rerender(<Harness interaction={idle} />)
    await waitFor(() => expect(document.querySelector('[data-interaction-focus="actions"]')).toHaveAttribute('data-interaction-focused', 'true'))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('waits for local permission before showing a private target and ignores other players', async () => {
    const view = render(<Harness permitted={false} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    view.rerender(<Harness />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    view.rerender(<Harness permitted={false} interaction={idle} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).toHaveBeenCalledOnce()
  })

  it('highlights a fully visible occupation hand without scrolling', async () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => ({
      x: 0, y: 20, top: 20, left: 0, right: 320, bottom: 200, width: 320, height: 180, toJSON: () => ({}),
    }))
    render(<Harness />)
    await waitFor(() => expect(document.querySelector('[data-interaction-focus="occupation-hand"]')).toHaveAttribute('data-interaction-focused', 'true'))
    expect(window.scrollBy).not.toHaveBeenCalled()
  })

  it('focuses occupation hand multiselect through the same local target', async () => {
    render(<Harness interaction={{
      stateId: 'wait', playerIndex: 0, allowedCommands: ['commitSelection'], anytimeActions: [],
      request: { kind: 'selection', selection: { kind: 'occupation-hand', selectableCards: ['A116_WoodCutter'], minSelections: 1, maxSelections: 1 } },
    }} />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Return to current action' })).toBeVisible()
  })

  it('keeps manual browsing during candidate refreshes but reveals a distinct identical request', async () => {
    const request = { ...occupation, requestKey: 'opaque-first' }
    const view = render(<Harness interaction={request} />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    view.rerender(<Harness interaction={{ ...request, request: {
      kind: 'choice', options: [{ value: 'A124_Knapper', labelKey: 'occupations.A124_Knapper.name' }],
    } }} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).toHaveBeenCalledOnce()
    view.rerender(<Harness interaction={{ ...request, requestKey: 'opaque-second' }} />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledTimes(2))
  })
})
