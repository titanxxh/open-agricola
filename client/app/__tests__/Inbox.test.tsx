// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InboxButton, InboxProvider } from '../Inbox'
import { openInboxNotification } from '../../services/inbox-notification'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn<(path: string, options?: RequestInit) => Promise<Response>>() }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'account-a' }, apiFetch }) }))
vi.mock('../../contexts/LocaleContext', () => ({ useLocale: () => ({ locale: 'en', t: (key: string) => key }) }))

const entry = {
  id: 951, submissionId: 'issue-431-submission', issueNumber: 431,
  issueUrl: 'https://github.com/titanxxh/open-agricola/issues/431',
  kind: 'needs_info', reportSummary: 'Report from an older page',
  explanation: 'Please add the missing screenshot.', missingItems: ['Screenshot'],
  createdAt: 1_800_000_000_000, version: 1, readAt: null,
} as const

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (path, options) => {
    if (path === '/api/v1/inbox') return Response.json({ ok: true, messages: [], nextCursor: 991, unreadCount: 2 })
    if (path === '/api/v1/inbox/951') return Response.json({ ok: true, message: entry })
    if (path === '/api/v1/inbox/951/read' && options?.method === 'POST') {
      return Response.json({ ok: true, message: { ...entry, readAt: 1_800_000_001_000 } })
    }
    return Response.json({ ok: false, code: 'feedback_not_found' }, { status: 404 })
  })
})

describe('opening the inbox from a notification', () => {
  it('opens the exact message beyond the first page in one dialog and marks only that message read', async () => {
    render(<InboxProvider><InboxButton /><InboxButton menuItem /><main>Active room</main></InboxProvider>)
    act(() => openInboxNotification({ userId: 'account-a', messageId: 951 }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('heading', { name: entry.reportSummary })).toBeVisible()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText('Active room')).toBeVisible()
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/v1/inbox/951/read', { method: 'POST' }))
    expect(apiFetch.mock.calls.filter(([path]) => path.endsWith('/read'))).toEqual([['/api/v1/inbox/951/read', { method: 'POST' }]])
  })

  it('shows the same generic notice for a missing message and an unavailable notification', async () => {
    render(<InboxProvider><main>Settings</main></InboxProvider>)
    act(() => openInboxNotification({ userId: 'account-a', messageId: 952 }))
    expect(await screen.findByText('webPush.notificationUnavailable')).toBeVisible()
    expect(apiFetch.mock.calls.some(([path]) => path.endsWith('/read'))).toBe(false)
    act(() => openInboxNotification({ userId: 'account-a', messageId: null }))
    expect(screen.getByText('webPush.notificationUnavailable')).toBeVisible()
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  it('ignores a notification resolved for a previous account', () => {
    render(<InboxProvider><main>Active room</main></InboxProvider>)
    act(() => openInboxNotification({ userId: 'account-b', messageId: 951 }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalledWith('/api/v1/inbox/951')
  })
})
