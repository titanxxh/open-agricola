// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { BugReportBar } from '../BugReportBar'

const FRAME_HASH = 'a'.repeat(64)

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const report = (overrides: Record<string, unknown> = {}) => ({
  submissionId: 'submission-1',
  roomId: 'room-1',
  reporterUserId: 'site-user-1',
  playerIndex: 0,
  lifecycle: 'active',
  roomVersion: 8,
  stepNo: 5,
  frameHash: FRAME_HASH,
  phenomenon: 'The game froze',
  authorIdentity: null,
  status: 'draft',
  issueNumber: null,
  issueUrl: null,
  lastErrorCode: null,
  ...overrides,
})

const renderBar = (props: { roomId: string; stepNo?: number; frameHash?: string }) => {
  window.localStorage.setItem('open-agricola-locale-v2', 'en')
  return render(
    <LocaleProvider>
      <BugReportBar {...props} />
    </LocaleProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('BugReportBar', () => {
  it('requires a phenomenon and submits one hosted Issue from a server-fixed active anchor', async () => {
    const user = userEvent.setup()
    const calls: Array<{ url: string; method: string; body: unknown }> = []
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : null
      calls.push({ url, method, body })
      if (url.endsWith('/api/v1/issue-submission-connection')) {
        return response({ ok: true, enabled: true, connected: false })
      }
      if (url.endsWith('/api/v1/game-contexts/room-1/bug-reports')) {
        return response({ ok: true, report: report({ phenomenon: body.phenomenon }) }, 201)
      }
      if (url.endsWith('/api/v1/bug-reports/submission-1') && method === 'PATCH') {
        return response({
          ok: true,
          report: report({ authorIdentity: body.authorIdentity }),
        })
      }
      if (url.endsWith('/api/v1/bug-reports/submission-1/submit')) {
        return response({
          ok: true,
          report: report({
            authorIdentity: 'hosted',
            status: 'submitted',
            issueNumber: 7,
            issueUrl: 'https://github.com/titanxxh/open-agricola-issues/issues/7',
          }),
        })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderBar({ roomId: 'room-1' })

    await user.click(await screen.findByRole('button', { name: 'Report a bug' }))
    const next = screen.getByRole('button', { name: 'Continue' })
    expect(next).toBeDisabled()
    await user.type(
      screen.getByLabelText('Describe what happened in one sentence'),
      'The game froze',
    )
    await user.click(next)

    expect(await screen.findByText('Automatic game context')).toBeInTheDocument()
    expect(screen.getByText('site-user-1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('radio', { name: /Hosted Issue Identity/ }))
    await user.click(screen.getByRole('checkbox', { name: /public Issue/ }))
    await user.click(screen.getByRole('button', { name: 'Submit Issue' }))

    expect(await screen.findByRole('link', { name: 'Open Issue #7' }))
      .toHaveAttribute(
        'href',
        'https://github.com/titanxxh/open-agricola-issues/issues/7',
      )
    const create = calls.find(({ url }) =>
      url.endsWith('/api/v1/game-contexts/room-1/bug-reports'))
    expect(create?.body).toEqual({ phenomenon: 'The game froze' })
    expect(calls.filter(({ url }) =>
      url.endsWith('/api/v1/bug-reports/submission-1/submit'))).toHaveLength(1)
  })

  it('sends the exact completed replay anchor and preserves the draft for GitHub connection', async () => {
    const user = userEvent.setup()
    let createBody: unknown
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/issue-submission-connection')) {
        return response({ ok: true, enabled: true, connected: false })
      }
      if (url.endsWith('/api/v1/game-contexts/room-1/bug-reports')) {
        createBody = JSON.parse(String(init?.body))
        return response({
          ok: true,
          report: report({
            lifecycle: 'completed',
            roomVersion: 12,
            stepNo: 21,
            phenomenon: 'Wrong score',
          }),
        }, 201)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderBar({ roomId: 'room-1', stepNo: 21, frameHash: FRAME_HASH })

    await user.click(await screen.findByRole('button', { name: 'Report a bug' }))
    await user.type(
      screen.getByLabelText('Describe what happened in one sentence'),
      'Wrong score',
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))

    const connect = screen.getByRole('link', { name: 'Connect GitHub' })
    expect(connect).toHaveAttribute(
      'href',
      '/api/v1/issue-submission-connection/github/start?submissionId=submission-1',
    )
    expect(createBody).toEqual({
      phenomenon: 'Wrong score',
      stepNo: 21,
      frameHash: FRAME_HASH,
    })
    expect(window.location.search).toContain('bugReport=submission-1')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('does not expose an entry when new reports are disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      response({ ok: true, enabled: false, connected: false })))
    renderBar({ roomId: 'room-1' })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Report a bug' }))
        .not.toBeInTheDocument()
    })
  })

  it('offers GitHub reconnection when an in-flight user report loses authentication', async () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '/?bugReport=submission-1')
    let reportReads = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/api/v1/issue-submission-connection')) {
        return response({
          ok: true,
          enabled: true,
          connected: true,
          githubUserId: '99',
        })
      }
      if (url.endsWith('/api/v1/bug-reports/submission-1')) {
        reportReads += 1
        return response({
          ok: true,
          report: report({
            authorIdentity: 'github_user',
            status: reportReads === 1 ? 'queued' : 'needs_reconnect',
          }),
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderBar({ roomId: 'room-1' })

    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(screen.getByRole('link', { name: 'Connect GitHub' }))
      .toBeInTheDocument()
  })

  it('offers GitHub reconnection when submission immediately loses authentication', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/?bugReport=submission-1')
    vi.stubGlobal('fetch', vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input)
      if (url.endsWith('/api/v1/issue-submission-connection')) {
        return response({
          ok: true,
          enabled: true,
          connected: true,
          githubUserId: '99',
        })
      }
      if (
        url.endsWith('/api/v1/bug-reports/submission-1')
        && (init?.method ?? 'GET') === 'GET'
      ) {
        return response({
          ok: true,
          report: report({ authorIdentity: 'github_user' }),
        })
      }
      if (url.endsWith('/api/v1/bug-reports/submission-1')) {
        return response({
          ok: true,
          report: report({ authorIdentity: 'github_user' }),
        })
      }
      if (url.endsWith('/api/v1/bug-reports/submission-1/submit')) {
        return response({
          ok: true,
          report: report({
            authorIdentity: 'github_user',
            status: 'needs_reconnect',
            lastErrorCode: 'github_auth_invalid',
          }),
        }, 202)
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderBar({ roomId: 'room-1' })

    await user.click(await screen.findByRole('button', {
      name: 'Submit Issue',
    }))

    expect(await screen.findByRole('link', { name: 'Connect GitHub' }))
      .toBeInTheDocument()
  })
})
