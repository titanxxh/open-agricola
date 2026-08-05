// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardDetailPrSection, type WorkshopCard } from '../../WorkshopPage'

const approvedCard: WorkshopCard = {
  id: 'card-db-1',
  card_id: 'CUSTOM_MedievalMallet',
  card_type: 'minor',
  name: 'Medieval Mallet',
  description: 'Description',
  card_json: {},
  effect_code: null,
  art_url: null,
  review_status: 'approved',
  live: false,
  author_id: 'author-1',
  author_name: 'Author',
  like_count: 0,
  liked_by_me: false,
  created_at: 1,
  updated_at: 1,
}

const workspace = {
  id: approvedCard.id,
  authorId: 'author-1',
  revision: 7,
  reviewStatus: 'approved',
  live: false,
  draft: {
    cardId: approvedCard.card_id,
    cardType: approvedCard.card_type,
    name: approvedCard.name,
    description: approvedCard.description,
    cardJson: approvedCard.card_json,
    effectCode: null,
    compiledCode: null,
    codeManifest: null,
    artUrl: null,
    generation: {},
  },
  approvedVersionId: 'version-1',
  sandboxPassVersionId: 'version-1',
  sandboxPassedAt: 1,
}

afterEach(cleanup)

describe('Workshop card detail publish action', () => {
  it('publishes an approved offline card with the authoritative workspace revision', async () => {
    const reloadCard = vi.fn()
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/workspace')) {
        return new Response(JSON.stringify({
          ok: true,
          workspace,
          readiness: { ready: true },
        }))
      }
      if (path.endsWith('/publish') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          ok: true,
          workspace: { ...workspace, revision: 8, live: true },
          versionId: 'version-1',
        }))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <CardDetailPrSection
        card={approvedCard}
        currentUserId="author-1"
        apiFetch={apiFetch}
        reloadCard={reloadCard}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: '发布上线' }))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/workshop/cards/card-db-1/publish',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseRevision: 7 }),
        },
      )
    })
    await waitFor(() => expect(reloadCard).toHaveBeenCalledTimes(1))
  })

  it('shows a publish error and refreshes authoritative card state', async () => {
    const reloadCard = vi.fn()
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/workspace')) {
        return new Response(JSON.stringify({
          ok: true,
          workspace,
          readiness: { ready: true },
        }))
      }
      if (path.endsWith('/publish') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Draft revision conflict',
          current: { ...workspace, revision: 8 },
        }), { status: 409 })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <CardDetailPrSection
        card={approvedCard}
        currentUserId="author-1"
        apiFetch={apiFetch}
        reloadCard={reloadCard}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: '发布上线' }))

    expect(await screen.findByText('Draft revision conflict')).toBeInTheDocument()
    expect(reloadCard).toHaveBeenCalledTimes(1)
  })

  it('does not offer publish for a card that is already live', async () => {
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      workspace: { ...workspace, live: true },
      readiness: { ready: true },
    })))

    render(
      <CardDetailPrSection
        card={{ ...approvedCard, live: true }}
        currentUserId="author-1"
        apiFetch={apiFetch}
        reloadCard={() => {}}
      />,
    )

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: '发布上线' })).toBeNull()
  })
})
