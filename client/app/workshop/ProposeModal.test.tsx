// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProposeModal } from './ProposeModal'
import {
  completePropose,
  openOAuthPopupAndWait,
  startPropose,
} from '../../services/workshop-pr'

vi.mock('../../services/workshop-pr', () => ({
  startPropose: vi.fn(),
  completePropose: vi.fn(),
  openOAuthPopupAndWait: vi.fn(),
}))

describe('ProposeModal', () => {
  it('shows backend error message when propose fails with an unknown code', async () => {
    vi.mocked(startPropose).mockResolvedValue({
      ok: false,
      needsAuth: true,
      authUrl: '/api/workshop/github/oauth/start?hs=abc',
      handshakeId: 'abc',
    })
    vi.mocked(openOAuthPopupAndWait).mockResolvedValue({ ok: true })
    vi.mocked(completePropose).mockResolvedValue({
      ok: false,
      code: 'unknown',
      message: 'community_cards.md markers not found',
    })

    render(
      <ProposeModal
        card={{
          id: 'card-db-id',
          card_id: 'CUSTOM_MedievalMallet',
          name: '中世纪木槌',
          art_url: null,
        }}
        onClose={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: '发起 PR' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('community_cards.md markers not found')
    })
  })

  it('surfaces the GitHub HTTP status and explains a 404 fork failure', async () => {
    vi.mocked(startPropose).mockResolvedValue({
      ok: false,
      needsAuth: true,
      authUrl: '/api/workshop/github/oauth/start?hs=abc',
      handshakeId: 'abc',
    })
    vi.mocked(openOAuthPopupAndWait).mockResolvedValue({ ok: true })
    vi.mocked(completePropose).mockResolvedValue({
      ok: false,
      code: 'fork_create_failed',
      message: 'fork create failed',
      status: 404,
    })

    render(
      <ProposeModal
        card={{
          id: 'card-db-id',
          card_id: 'CUSTOM_MedievalMallet',
          name: '中世纪木槌',
          art_url: null,
        }}
        onClose={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: '发起 PR' }))

    await waitFor(() => {
      const alert = screen.getByRole('alert').textContent ?? ''
      expect(alert).toContain('fork_create_failed (HTTP 404)')
      expect(alert).toContain('private')
      expect(alert).toContain('协作者')
    })
  })

  it('falls back to a generic explanation for an unmapped code with a status', async () => {
    vi.mocked(startPropose).mockResolvedValue({
      ok: false,
      needsAuth: true,
      authUrl: '/api/workshop/github/oauth/start?hs=abc',
      handshakeId: 'abc',
    })
    vi.mocked(openOAuthPopupAndWait).mockResolvedValue({ ok: true })
    vi.mocked(completePropose).mockResolvedValue({
      ok: false,
      code: 'commit_failed',
      message: 'commit failed',
      status: 401,
    })

    render(
      <ProposeModal
        card={{
          id: 'card-db-id',
          card_id: 'CUSTOM_MedievalMallet',
          name: '中世纪木槌',
          art_url: null,
        }}
        onClose={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: '发起 PR' }))

    await waitFor(() => {
      const alert = screen.getByRole('alert').textContent ?? ''
      expect(alert).toContain('commit_failed (HTTP 401)')
      expect(alert).toContain('GitHub 授权已失效')
    })
  })
})
