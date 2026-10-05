// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CardTakedownButton } from '../CardTakedownButton'
afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); vi.restoreAllMocks() })
it('keeps an acknowledged takedown pending until the shared operation completes', async () => {
  vi.useFakeTimers()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const apiFetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, pending: true, operationId: 'operation' }), { status: 202 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, pending: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, pending: false })))
  const completed = vi.fn()
  const view = render(<CardTakedownButton cardId="card" apiFetch={apiFetch} t={key => key} onComplete={completed} />)
  await act(async () => { fireEvent.click(screen.getByRole('button')) })
  expect(screen.getByRole('button').textContent).toBe('platform.cardTakedownPending')
  expect(completed).not.toHaveBeenCalled()
  expect(sessionStorage.getItem('agricola.card-takedown:card')).toBe('operation')
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getByRole('button').textContent).toBe('platform.cardTakedownComplete')
  expect(completed).toHaveBeenCalledOnce()
  expect(sessionStorage.getItem('agricola.card-takedown:card')).toBeNull()
  view.unmount()
})
