import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from './PageRouter'
import { AiCardDesigner, type ExtractedCard } from './workshop/AiCardDesigner'
import { ProposeModal } from './workshop/ProposeModal'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { ResourceText } from '../components/common/ResourceText'
import { Section } from '../components/common/Section'
import { EmptyState } from '../components/common/EmptyState'
import { API_BASE } from '../config'
import { refreshPrStatus, extractPrNumber } from '../services/workshop-pr'

type WorkshopCard = {
  id: string
  card_id: string
  card_type: 'minor' | 'occupation'
  name: string
  description: string
  card_json: Record<string, unknown>
  effect_code: string | null
  compiled_code?: string | null
  code_manifest?: Record<string, unknown> | null
  art_url: string | null
  status: 'draft' | 'published'
  author_id?: string
  author_name: string
  like_count: number
  liked_by_me: boolean
  featured?: number
  created_at: number
  updated_at: number
  // Workshop → main-repo PR integration (nullable: filled after user clicks "Propose")
  github_pr_url?: string | null
  github_pr_status?: 'open' | 'merged' | 'closed' | null
  github_pr_last_synced_at?: number | null
}

type CardVersion = {
  id: string
  version_number: number
  card_json: Record<string, unknown>
  effect_code: string | null
  art_url: string | null
  created_at: number
}

type Comment = {
  id: string
  body: string
  author_name: string
  created_at: number
}

type SandboxSettings = {
  player_count: number
  deck_ids: string[]
}

const DEFAULT_SANDBOX_SETTINGS: SandboxSettings = {
  player_count: 2,
  deck_ids: ['A', 'B', 'C', 'D', 'E'],
}

type View = 'home' | 'sandbox' | 'editor' | 'detail'

export function getWorkshopCardIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('card')?.trim()
  return value || null
}

type WorkshopUrlView = 'sandbox' | 'editor'

export function getWorkshopViewFromSearch(search: string): WorkshopUrlView | null {
  const value = new URLSearchParams(search).get('view')?.trim()
  if (value === 'sandbox' || value === 'editor') return value
  return null
}

export function buildWorkshopCardUrl(
  pathname: string,
  search: string,
  cardDbId: string | null,
): string {
  return buildWorkshopUrl(pathname, search, { card: cardDbId })
}

export function buildWorkshopUrl(
  pathname: string,
  search: string,
  opts: { view?: WorkshopUrlView | null; card?: string | null } = {},
): string {
  const params = new URLSearchParams(search)
  params.set('page', 'workshop')
  if ('view' in opts) {
    if (opts.view === 'sandbox' || opts.view === 'editor') {
      params.set('view', opts.view)
    } else {
      params.delete('view')
    }
  }
  if ('card' in opts) {
    if (opts.card) {
      params.set('card', opts.card)
    } else {
      params.delete('card')
    }
  }
  const nextSearch = params.toString()
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}`
}

type WorkshopPrActionInput = {
  enabled: boolean
  isAuthor: boolean
  status: WorkshopCard['status']
  githubPrUrl?: string | null
  githubPrStatus?: WorkshopCard['github_pr_status']
}

export function getWorkshopPrActionState(input: WorkshopPrActionInput): {
  visible: boolean
  disabled: boolean
  buttonLabel: string
  secondary: string | null
} {
  if (!input.isAuthor) {
    return { visible: false, disabled: true, buttonLabel: '', secondary: null }
  }
  if (!input.enabled) {
    return { visible: true, disabled: true, buttonLabel: 'PR 功能未开启', secondary: null }
  }
  if (input.status !== 'published') {
    return {
      visible: true,
      disabled: true,
      buttonLabel: '先发布后可发起 PR',
      secondary: '发布后可以提交到主仓库，等待 maintainer review。',
    }
  }

  const prNum = extractPrNumber(input.githubPrUrl)
  if (!input.githubPrUrl) {
    return { visible: true, disabled: false, buttonLabel: '发起 PR 到主仓库', secondary: null }
  }
  if (input.githubPrStatus === 'merged') {
    return {
      visible: true,
      disabled: true,
      buttonLabel: '已合并 ✓',
      secondary: `PR #${prNum} · 社区卡已上线`,
    }
  }
  if (input.githubPrStatus === 'closed') {
    return {
      visible: true,
      disabled: false,
      buttonLabel: '重新发起 PR',
      secondary: `上次 PR #${prNum} 已关闭 · 点击重开`,
    }
  }
  return {
    visible: true,
    disabled: false,
    buttonLabel: '更新已有 PR',
    secondary: `#${prNum} 等待 review · 点击重发最新版`,
  }
}

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function normalizeSandboxSettings(raw: unknown): SandboxSettings {
  const source = (raw ?? {}) as Partial<SandboxSettings>
  const playerCount = typeof source.player_count === 'number'
    ? Math.min(4, Math.max(2, Math.floor(source.player_count)))
    : DEFAULT_SANDBOX_SETTINGS.player_count
  const deckIds = Array.isArray(source.deck_ids)
    ? source.deck_ids
      .filter((deck): deck is string => typeof deck === 'string')
      .map((deck) => deck.trim().toUpperCase())
      .filter((deck) => DEFAULT_SANDBOX_SETTINGS.deck_ids.includes(deck))
    : []
  return {
    player_count: playerCount,
    deck_ids: deckIds.length > 0 ? Array.from(new Set(deckIds)) : [...DEFAULT_SANDBOX_SETTINGS.deck_ids],
  }
}

export function buildSandboxCardIds(
  cards: ReadonlyArray<{ id: string }>,
  extraCardId?: unknown,
): string[] {
  const ids = cards.map(card => card.id)
  const trimmed = typeof extraCardId === 'string' ? extraCardId.trim() : ''
  if (trimmed && !ids.includes(trimmed)) ids.push(trimmed)
  return ids
}

export type SandboxStartResult = {
  ok: boolean
  error?: string
  cardWarnings?: string[]
}

export async function readSandboxStartResponse(
  response: Response,
  fallbackError: string,
): Promise<SandboxStartResult> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json() as Promise<SandboxStartResult>
  }
  return {
    ok: false,
    error: response.ok
      ? fallbackError
      : `Sandbox start failed (${response.status} ${response.statusText || 'HTTP error'})`,
  }
}

// ── Card Preview Tile ────────────────────────────────────────────────────────

function CardTile({ card, onSelect, onLike, mine, t }: {
  card: WorkshopCard
  onSelect: (c: WorkshopCard) => void
  onLike: (id: string) => void
  mine?: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const prNum = extractPrNumber(card.github_pr_url)
  const prMerged = card.github_pr_status === 'merged'
  return (
    <div className="ws-card-tile" style={{ position: 'relative' }} onClick={() => onSelect(card)}>
      {card.github_pr_url && (
        <a
          href={card.github_pr_url}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          title={prMerged ? `PR #${prNum} merged` : `PR #${prNum} on GitHub`}
          style={{
            position: 'absolute', top: 4, right: 4, fontSize: '0.75em',
            padding: '2px 6px', background: prMerged ? '#2da44e' : '#0969da',
            color: '#fff', borderRadius: 3, textDecoration: 'none', zIndex: 2,
          }}
        >
          PR {prMerged ? '✓' : (prNum ? `#${prNum}` : '')}
        </a>
      )}
      {card.art_url && (
        <img className="ws-card-art-thumb" src={card.art_url} alt={card.name} />
      )}
      <div className="ws-card-tile-body">
        <div className="ws-card-tile-name">{card.name}</div>
        <div className="ws-card-tile-meta">
          <span className="ws-badge">{card.card_type === 'minor' ? t('platform.minor') : t('platform.occupation')}</span>
          {!!card.featured && <span className="ws-badge ws-badge-featured">{t('platform.featuredBadge')}</span>}
          {mine && <span className={`ws-badge ws-badge-${card.status}`}>{card.status === 'published' ? t('platform.published') : t('platform.draft')}</span>}
          <span className="ws-author">{t('platform.by', { name: card.author_name })}</span>
        </div>
        <div className="ws-card-desc">
          <ResourceText text={card.description.slice(0, 80) + (card.description.length > 80 ? '…' : '')} />
        </div>
      </div>
      <div className="ws-card-tile-footer">
        <button
          type="button"
          className={`ws-like-btn${card.liked_by_me ? ' liked' : ''}`}
          onClick={e => { e.stopPropagation(); onLike(card.id) }}
          title={t('platform.likeBtn')}
        >
          ♥ {card.like_count}
        </button>
      </div>
    </div>
  )
}

// ── Card Source Viewer (generated .ts code) ─────────────────────────────────

function CardSourceViewer({ card, t }: { card: WorkshopCard; t: (key: string, params?: Record<string, string | number>) => string }) {
  const effectCode = card.effect_code
  if (!effectCode) return null
  return (
    <div className="ws-detail-section">
      <h3>{t('platform.cardCode')}</h3>
      <pre className="ws-code">{effectCode}</pre>
      <p className="ws-code-note">{t('platform.codeNote')}</p>
    </div>
  )
}

// ── Card Detail PR Section (Propose to main repo) ───────────────────────────

function CardDetailPrSection({
  card,
  currentUserId,
  reloadCard,
}: {
  card: WorkshopCard
  currentUserId: string | undefined
  reloadCard: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const action = getWorkshopPrActionState({
    enabled: true,
    isAuthor: !!currentUserId && card.author_id === currentUserId,
    status: card.status,
    githubPrUrl: card.github_pr_url,
    githubPrStatus: card.github_pr_status,
  })
  if (!action.visible) return null

  async function onRefresh() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const resp = await refreshPrStatus(card.id)
      if (!resp.ok) {
        setRefreshError(resp.code ?? resp.error ?? 'refresh_failed')
      }
      reloadCard()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      style={{
        margin: '12px 0',
        padding: 12,
        border: '1px solid rgba(128,128,128,0.25)',
        borderRadius: 4,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        className={action.disabled ? 'btn-secondary ws-btn-sm' : 'btn-primary ws-btn-sm'}
        disabled={action.disabled}
        onClick={() => setModalOpen(true)}
      >
        {action.buttonLabel}
      </button>
      {action.secondary && (
        <span style={{ fontSize: '0.9em', opacity: 0.75 }}>{action.secondary}</span>
      )}
      {card.github_pr_url && (
        <>
          <a
            href={card.github_pr_url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.9em' }}
            title="在 GitHub 中打开 PR"
          >
            🔗 打开
          </a>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            style={{ background: 'transparent', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 3, cursor: 'pointer', padding: '2px 8px' }}
            title="从 GitHub 同步 PR 状态"
          >
            {refreshing ? '⟳ ...' : '⟳ 刷新'}
          </button>
          {refreshError && (
            <span style={{ color: 'crimson', fontSize: '0.85em' }}>
              刷新失败：{refreshError}
            </span>
          )}
        </>
      )}
      {modalOpen && (
        <ProposeModal
          card={{ id: card.id, card_id: card.card_id, name: card.name, art_url: card.art_url }}
          onClose={() => { setModalOpen(false); reloadCard() }}
          onSuccess={() => reloadCard()}
        />
      )}
    </div>
  )
}

// ── Card Detail Panel ────────────────────────────────────────────────────────

function CardDetail({ card, token, onBack, onEdit, onAddSandbox, isOwner, isUserAdmin, onRefresh, currentUserId, t }: {
  card: WorkshopCard
  token: string | null
  onBack: () => void
  onEdit?: () => void
  onAddSandbox: (id: string) => void
  isOwner?: boolean
  isUserAdmin?: boolean
  onRefresh?: () => void
  currentUserId?: string
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [liked, setLiked] = useState(card.liked_by_me)
  const [likeCount, setLikeCount] = useState(card.like_count)
  const [submitting, setSubmitting] = useState(false)
  const [versions, setVersions] = useState<CardVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [isFeatured, setIsFeatured] = useState(!!card.featured)

  useEffect(() => {
    fetch(`${API_BASE}/api/workshop/cards/${card.id}/comments`)
      .then(r => r.json())
      .then(d => { if (d.ok) setComments(d.comments) })
      .catch(() => {})
  }, [card.id])

  const handleLike = async () => {
    const r = await fetch(`${API_BASE}/api/workshop/cards/${card.id}/like`, {
      method: 'POST', headers: authHeaders(token),
    })
    const d = await r.json()
    if (d.ok) {
      setLiked(d.liked)
      setLikeCount(c => c + (d.liked ? 1 : -1))
    }
  }

  const handleComment = async () => {
    if (!newComment.trim()) return
    setSubmitting(true)
    const r = await fetch(`${API_BASE}/api/workshop/cards/${card.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({ body: newComment }),
    })
    const d = await r.json()
    if (d.ok) {
      setComments(prev => [...prev, { id: d.id, body: newComment, author_name: t('platform.me'), created_at: Date.now() }])
      setNewComment('')
    }
    setSubmitting(false)
  }

  const fetchVersions = async () => {
    if (showVersions) { setShowVersions(false); return }
    setVersionsLoading(true)
    setVersionsError(null)
    setShowVersions(true)
    try {
      const r = await fetch(`${API_BASE}/api/workshop/cards/${card.id}/versions`, { headers: authHeaders(token) })
      const d = await r.json()
      if (d.ok && Array.isArray(d.versions)) {
        setVersions(d.versions)
      } else {
        setVersions([])
        setVersionsError(d.error ?? '加载版本历史失败')
      }
    } catch {
      setVersions([])
      setVersionsError('网络错误，无法加载版本历史')
    } finally {
      setVersionsLoading(false)
    }
  }

  const handleRevert = async (versionId: string) => {
    const r = await fetch(`${API_BASE}/api/workshop/cards/${card.id}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({ version_id: versionId }),
    })
    const d = await r.json()
    if (d.ok) { onRefresh?.() }
  }

  const handleFeatureToggle = async () => {
    const r = await fetch(`${API_BASE}/api/workshop/cards/${card.id}/feature`, {
      method: 'POST', headers: authHeaders(token),
    })
    const d = await r.json()
    if (d.ok) setIsFeatured(d.featured)
  }

  const [cardStatus, setCardStatus] = useState(card.status)

  const handleTogglePublish = async () => {
    const newStatus = cardStatus === 'published' ? 'draft' : 'published'
    const r = await fetch(`${API_BASE}/api/workshop/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({
        card_id: card.card_id,
        card_type: card.card_type,
        name: card.name,
        description: card.description,
        card_json: card.card_json,
        effect_code: card.effect_code,
        art_url: card.art_url,
        status: newStatus,
      }),
    })
    const d = await r.json()
    if (d.ok) { setCardStatus(newStatus); onRefresh?.() }
  }

  const cardJson = card.card_json
  const cost = cardJson.cost as Record<string, number> | undefined
  const vp = cardJson.vp as number | undefined

  return (
    <div className="ws-detail">
      <button type="button" className="ws-back-btn" onClick={onBack}>{t('platform.back')}</button>

      <div className="ws-detail-header">
        {card.art_url && <img className="ws-detail-art" src={card.art_url} alt={card.name} />}
        <div className="ws-detail-meta">
          <h2>{card.name}</h2>
          <div className="ws-badges-row">
            <span className="ws-badge">{card.card_type === 'minor' ? t('platform.minor') : t('platform.occupation')}</span>
            <span className={`ws-badge ws-badge-${cardStatus}`}>{cardStatus === 'published' ? t('platform.published') : t('platform.draft')}</span>
            {!!card.featured && <span className="ws-badge ws-badge-featured">{t('platform.featuredBadge')}</span>}
            <span className="ws-author">{t('platform.by', { name: card.author_name })}</span>
          </div>
          {cost && Object.keys(cost).length > 0 && (
            <div className="ws-detail-cost">
              {t('platform.cost')}：{Object.entries(cost).map(([r, n]) => t('platform.costEntry', { resource: r, count: n })).join(t('platform.costSeparator'))}
            </div>
          )}
          {vp !== undefined && vp > 0 && (
            <div className="ws-detail-vp">{t('platform.vpLabel', { vp })}</div>
          )}
          <p className="ws-detail-desc"><ResourceText text={card.description} /></p>

          <div className="ws-detail-actions">
            <button
              type="button"
              className={`ws-like-btn${liked ? ' liked' : ''}`}
              onClick={handleLike}
            >♥ {likeCount}</button>
            <button type="button" className="btn-secondary ws-btn-sm" onClick={() => onAddSandbox(card.id)}>
              {t('platform.addToSandbox')}
            </button>
            {onEdit && (
              <button type="button" className="btn-secondary ws-btn-sm" onClick={onEdit}>{t('platform.edit')}</button>
            )}
            {isOwner && (
              <button
                type="button"
                className={`ws-btn-sm ${cardStatus === 'published' ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleTogglePublish}
              >
                {cardStatus === 'published' ? t('platform.unpublish') : t('platform.publish')}
              </button>
            )}
            {isOwner && (
              <button type="button" className="btn-secondary ws-btn-sm" onClick={fetchVersions}>
                {showVersions ? t('platform.hideVersions') : t('platform.versionHistory')}
              </button>
            )}
            {isUserAdmin && card.status === 'published' && (
              <button type="button" className={`btn-secondary ws-btn-sm${isFeatured ? ' liked' : ''}`} onClick={handleFeatureToggle}>
                {isFeatured ? t('platform.unfeature') : t('platform.setFeatured')}
              </button>
            )}
          </div>

          <CardDetailPrSection
            card={card}
            currentUserId={currentUserId}
            reloadCard={() => onRefresh?.()}
          />
        </div>
      </div>

      {showVersions && (
        <div className="ws-detail-section ws-version-history-panel">
          <h3>{t('platform.versionHistoryCount', { count: versions.length })}</h3>
          {versionsLoading ? (
            <p className="ws-empty">正在加载版本历史...</p>
          ) : versionsError ? (
            <p className="ws-empty ws-version-error">{versionsError}</p>
          ) : versions.length === 0 ? (
            <p className="ws-empty">{t('platform.noVersions')}</p>
          ) : (
            <ul className="ws-versions">
              {versions.map(v => {
                const vJson = v.card_json as Record<string, unknown>
                const vDesc = Array.isArray(vJson.desc) ? (vJson.desc as string[]).join(' / ') : ''
                return (
                  <li key={v.id} className="ws-version-item">
                    <div className="ws-version-header">
                      <span className="ws-version-num">v{v.version_number}</span>
                      <span className="ws-version-date">{new Date(v.created_at).toLocaleString()}</span>
                      <span className="ws-version-name">{vJson.name as string || '—'}</span>
                      <button type="button" className="btn-secondary ws-btn-xs" onClick={() => handleRevert(v.id)}>{t('platform.revert')}</button>
                    </div>
                    {vDesc && <p className="ws-version-desc">{vDesc}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {card.effect_code && (
        <CardSourceViewer card={card} t={t} />
      )}

      <div className="ws-detail-section">
        <h3>{t('platform.commentsCount', { count: comments.length })}</h3>
        <ul className="ws-comments">
          {comments.map(c => (
            <li key={c.id} className="ws-comment">
              <span className="ws-comment-author">{c.author_name}</span>
              <span className="ws-comment-body">{c.body}</span>
            </li>
          ))}
        </ul>
        {token && (
          <div className="ws-comment-form">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder={t('platform.commentPlaceholder')}
              rows={2}
            />
            <button type="button" className="btn-primary ws-btn-sm" onClick={handleComment} disabled={submitting}>
              {t('platform.send')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card Editor ──────────────────────────────────────────────────────────────

function CardEditor({ initial, onCancel, onAddToSandboxAndRestart, sandboxErrors, onSandboxErrorsConsumed }: {
  initial?: WorkshopCard
  token: string | null
  onCancel: () => void
  onAddToSandboxAndRestart?: (cardDbId: string) => Promise<void>
  t: (key: string, params?: Record<string, string | number>) => string
  sandboxErrors?: string[] | null
  onSandboxErrorsConsumed?: () => void
}) {
  const handleAiImport = (_extracted: ExtractedCard, _importedArtUrl: string | null) => {
    // AI designer handles everything now; this callback is kept for interface compatibility
  }

  return (
    <div className="ws-editor ws-editor-ai">
      <AiCardDesigner
        initialCard={initial}
        onImport={handleAiImport}
        onClose={onCancel}
        onAddToSandboxAndRestart={onAddToSandboxAndRestart}
        sandboxErrors={sandboxErrors}
        onSandboxErrorsConsumed={onSandboxErrorsConsumed}
      />
    </div>
  )
}

// ── Workshop Dashboard ───────────────────────────────────────────────────────

function WorkshopSection({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="ws-section">
      <div className="ws-section-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="ws-section-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="ws-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

function SelectableSandboxCard({
  card,
  selected,
  onToggle,
  t,
}: {
  card: WorkshopCard
  selected: boolean
  onToggle: (id: string) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <label className={`ws-select-card${selected ? ' selected' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(card.id)}
      />
      <div className="ws-select-card-body">
        <div className="ws-select-card-name">{card.name}</div>
        <div className="ws-select-card-meta">
          <span className="ws-badge">{card.card_type === 'minor' ? t('platform.minor') : t('platform.occupation')}</span>
          {!!card.featured && <span className="ws-badge ws-badge-featured">{t('platform.featuredBadge')}</span>}
          <span className={`ws-badge ws-badge-${card.status}`}>{card.status === 'published' ? t('platform.published') : t('platform.draft')}</span>
          <span className="ws-author">{t('platform.by', { name: card.author_name })}</span>
        </div>
      </div>
    </label>
  )
}

function SandboxResetModal({
  token,
  currentCards,
  currentSettings,
  onClose,
  onSave,
  t,
}: {
  token: string | null
  currentCards: WorkshopCard[]
  currentSettings: SandboxSettings
  onClose: () => void
  onSave: (cardIds: string[], settings: SandboxSettings) => Promise<void>
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [myCards, setMyCards] = useState<WorkshopCard[]>([])
  const [publishedCards, setPublishedCards] = useState<WorkshopCard[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>(currentCards.map(card => card.id))
  const [playerCount, setPlayerCount] = useState(currentSettings.player_count)
  const [deckIds, setDeckIds] = useState<string[]>(currentSettings.deck_ids)
  const [publishedSearchInput, setPublishedSearchInput] = useState('')
  const [publishedSearch, setPublishedSearch] = useState('')
  const [loadingMine, setLoadingMine] = useState(false)
  const [loadingPublished, setLoadingPublished] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedIds(currentCards.map(card => card.id))
  }, [currentCards])

  useEffect(() => {
    setPlayerCount(currentSettings.player_count)
    setDeckIds(currentSettings.deck_ids)
  }, [currentSettings])

  const loadMyCards = useCallback(async () => {
    if (!token) return
    setLoadingMine(true)
    try {
      const params = new URLSearchParams({
        scope: 'mine',
        sort: 'recent',
        page: '1',
      })
      const response = await fetch(`${API_BASE}/api/workshop/cards?${params}`, {
        headers: authHeaders(token),
      })
      const data = await response.json()
      if (data.ok) setMyCards(data.cards)
    } finally {
      setLoadingMine(false)
    }
  }, [token])

  const loadPublishedCards = useCallback(async () => {
    setLoadingPublished(true)
    try {
      const params = new URLSearchParams({
        status: 'published',
        sort: 'popular',
        page: '1',
        search: publishedSearch,
      })
      const response = await fetch(`${API_BASE}/api/workshop/cards?${params}`, {
        headers: authHeaders(token),
      })
      const data = await response.json()
      if (data.ok) setPublishedCards(data.cards)
    } finally {
      setLoadingPublished(false)
    }
  }, [publishedSearch, token])

  useEffect(() => {
    void loadMyCards()
  }, [loadMyCards])

  useEffect(() => {
    void loadPublishedCards()
  }, [loadPublishedCards])

  const toggleSelected = (cardId: string) => {
    setSelectedIds(prev =>
      prev.includes(cardId)
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId],
    )
  }

  const toggleDeck = (deckId: string) => {
    setDeckIds((prev) => {
      const next = prev.includes(deckId)
        ? prev.filter((entry) => entry !== deckId)
        : [...prev, deckId]
      return next.length > 0 ? next : [...DEFAULT_SANDBOX_SETTINGS.deck_ids]
    })
  }

  const myCardIds = new Set(myCards.map(card => card.id))
  const selectablePublishedCards = publishedCards.filter(card => !myCardIds.has(card.id))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(selectedIds, {
        player_count: playerCount,
        deck_ids: deckIds,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ws-modal-overlay" onClick={onClose}>
      <div className="ws-modal ws-reset-modal" onClick={event => event.stopPropagation()}>
        <div className="ws-modal-header">
          <div>
            <h2>{t('platform.resetSandboxTitle')}</h2>
            <p>{t('platform.resetSandboxSubtitle')}</p>
          </div>
          <button type="button" className="btn-link" onClick={onClose}>{t('platform.cancel')}</button>
        </div>

        <div className="ws-modal-toolbar">
          <div className="ws-sandbox-config-panel">
            <div className="ws-sandbox-config-group">
              <span className="ws-sandbox-config-label">{t('platform.sandboxPlayerCount')}</span>
              <div className="ws-sandbox-chip-row">
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={`ws-sandbox-chip${playerCount === count ? ' active' : ''}`}
                    onClick={() => setPlayerCount(count)}
                  >
                    {t('platform.sandboxPlayerCountOption', { count })}
                  </button>
                ))}
              </div>
            </div>
            <div className="ws-sandbox-config-group">
              <span className="ws-sandbox-config-label">{t('platform.sandboxDecks')}</span>
              <div className="ws-sandbox-chip-row">
                {DEFAULT_SANDBOX_SETTINGS.deck_ids.map((deckId) => (
                  <button
                    key={deckId}
                    type="button"
                    className={`ws-sandbox-chip${deckIds.includes(deckId) ? ' active' : ''}`}
                    onClick={() => toggleDeck(deckId)}
                  >
                    {deckId}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <form
            className="ws-search"
            onSubmit={event => {
              event.preventDefault()
              setPublishedSearch(publishedSearchInput.trim())
            }}
          >
            <input
              value={publishedSearchInput}
              onChange={event => setPublishedSearchInput(event.target.value)}
              placeholder={t('platform.resetSandboxSearchPlaceholder')}
            />
            <button type="submit" className="btn-secondary ws-btn-sm">{t('platform.searchBtn')}</button>
          </form>
          <div className="ws-reset-selection-count">{t('platform.sandboxSelectionCount', { count: selectedIds.length })}</div>
        </div>

        <div className="ws-reset-modal-body">
          <WorkshopSection
            title={t('platform.myCards')}
            subtitle={t('platform.resetSandboxMineSubtitle')}
          >
            {loadingMine ? (
              <div className="ws-loading">{t('platform.loadingMore')}</div>
            ) : myCards.length === 0 ? (
              <p className="rooms-empty">{t('platform.resetSandboxNoMine')}</p>
            ) : (
              <div className="ws-select-card-grid">
                {myCards.map(card => (
                  <SelectableSandboxCard
                    key={card.id}
                    card={card}
                    selected={selectedIds.includes(card.id)}
                    onToggle={toggleSelected}
                    t={t}
                  />
                ))}
              </div>
            )}
          </WorkshopSection>

          <WorkshopSection
            title={t('platform.publishedCards')}
            subtitle={t('platform.resetSandboxPublishedSubtitle')}
          >
            {loadingPublished ? (
              <div className="ws-loading">{t('platform.loadingMore')}</div>
            ) : selectablePublishedCards.length === 0 ? (
              <p className="rooms-empty">{t('platform.resetSandboxNoPublished')}</p>
            ) : (
              <div className="ws-select-card-grid">
                {selectablePublishedCards.map(card => (
                  <SelectableSandboxCard
                    key={card.id}
                    card={card}
                    selected={selectedIds.includes(card.id)}
                    onToggle={toggleSelected}
                    t={t}
                  />
                ))}
              </div>
            )}
          </WorkshopSection>
        </div>

        <div className="ws-modal-actions">
          <button type="button" className="btn-secondary" onClick={() => setSelectedIds([])}>
            {t('platform.clearSelection')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setPlayerCount(DEFAULT_SANDBOX_SETTINGS.player_count)
              setDeckIds([...DEFAULT_SANDBOX_SETTINGS.deck_ids])
            }}
          >
            {t('platform.resetSandboxSettings')}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('platform.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('platform.saving') : t('platform.applySandbox')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sandbox View ─────────────────────────────────────────────────────────────

function SandboxView({
  cards,
  settings,
  onSelect,
  onStartGame,
  onRemove,
  onOpenReset,
  t,
}: {
  cards: WorkshopCard[]
  settings: SandboxSettings
  onSelect: (c: WorkshopCard) => void
  onStartGame: () => void
  onRemove: (workshopCardId: string) => Promise<void>
  onOpenReset: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <div className="ws-sandbox">
      <div className="ws-sandbox-header">
        <div>
          <h2>{t('platform.mySandbox')}</h2>
          <p className="ws-section-subtitle">{t('platform.sandboxManageSubtitle')}</p>
          <p className="ws-section-subtitle">
            {t('platform.sandboxSettingsSummary', {
              players: settings.player_count,
              decks: settings.deck_ids.join(', '),
            })}
          </p>
        </div>
        <button type="button" className="btn-secondary ws-btn-sm" onClick={onOpenReset}>
          {t('platform.resetSandbox')}
        </button>
      </div>
      {cards.length === 0 ? (
        <p className="rooms-empty">{t('platform.resetSandboxEmpty')}</p>
      ) : (
        <>
          <ul className="ws-sandbox-list">
            {cards.map(card => (
              <li key={card.id} className="ws-sandbox-item">
                <div className="ws-sandbox-item-main" onClick={() => onSelect(card)}>
                  <span className="ws-card-tile-name">{card.name}</span>
                  <div className="ws-card-tile-meta">
                    <span className="ws-badge">{card.card_type === 'minor' ? t('platform.minor') : t('platform.occupation')}</span>
                    {!!card.featured && <span className="ws-badge ws-badge-featured">{t('platform.featuredBadge')}</span>}
                    <span className={`ws-badge ws-badge-${card.status}`}>{card.status === 'published' ? t('platform.published') : t('platform.draft')}</span>
                    <span className="ws-author">{t('platform.by', { name: card.author_name })}</span>
                  </div>
                </div>
                <button type="button" className="btn-small ws-remove-btn" onClick={() => void onRemove(card.id)}>{t('platform.remove')}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="ws-sandbox-btns">
        <button
          type="button"
          className="btn-primary"
          onClick={() => { onStartGame() }}
        >
          {t('platform.startSandbox')}
        </button>
      </div>
    </div>
  )
}

// ── Main WorkshopPage ─────────────────────────────────────────────────────────

export function WorkshopPage() {
  const { user, token } = useAuth()
  const { t } = useLocale()
  const [view, setView] = useState<View>('home')
  const [browseCards, setBrowseCards] = useState<WorkshopCard[]>([])
  const [featuredCards, setFeaturedCards] = useState<WorkshopCard[]>([])
  const [myCards, setMyCards] = useState<WorkshopCard[]>([])
  const [sandboxCards, setSandboxCards] = useState<WorkshopCard[]>([])
  const [sandboxSettings, setSandboxSettings] = useState<SandboxSettings>(DEFAULT_SANDBOX_SETTINGS)
  const [selectedCard, setSelectedCard] = useState<WorkshopCard | null>(null)
  const [editCard, setEditCard] = useState<WorkshopCard | undefined>(undefined)
  const [sort, setSort] = useState<'recent' | 'popular'>('recent')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [browsePage, setBrowsePage] = useState(1)
  const [browseHasMore, setBrowseHasMore] = useState(false)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [featuredLoading, setFeaturedLoading] = useState(false)
  const [myLoading, setMyLoading] = useState(false)
  const [resetSandboxOpen, setResetSandboxOpen] = useState(false)
  const [pendingSandboxErrors, setPendingSandboxErrors] = useState<string[] | null>(null)
  const [sandboxActive, setSandboxActive] = useState(false)
  const [sandboxKey, setSandboxKey] = useState(0)
  const prevView = useRef<View>('home')
  const prevBrowseQuery = useRef({ search: '', sort: 'recent' as 'recent' | 'popular' })

  const communityDeckEnabled = import.meta.env.VITE_ENABLE_COMMUNITY_DECK === 'true'

  const fetchCardList = useCallback(async (params: URLSearchParams) => {
    const response = await fetch(`${API_BASE}/api/workshop/cards?${params}`, {
      headers: authHeaders(token),
    })
    return response.json()
  }, [token])

  const loadBrowseCards = useCallback(async (
    pageToLoad: number,
    searchValue: string,
    sortValue: 'recent' | 'popular',
  ) => {
    setBrowseLoading(true)
    try {
      const params = new URLSearchParams({
        sort: sortValue,
        search: searchValue,
        page: String(pageToLoad),
        status: 'published',
      })
      const data = await fetchCardList(params)
      if (data.ok) {
        setBrowseCards(prev => pageToLoad === 1 ? data.cards : [...prev, ...data.cards])
        setBrowseHasMore(data.hasMore)
      }
    } finally {
      setBrowseLoading(false)
    }
  }, [fetchCardList])

  const loadFeaturedCards = useCallback(async () => {
    setFeaturedLoading(true)
    try {
      const params = new URLSearchParams({
        featured: '1',
        status: 'published',
        sort: 'popular',
        page: '1',
      })
      const data = await fetchCardList(params)
      if (data.ok) setFeaturedCards(data.cards)
    } finally {
      setFeaturedLoading(false)
    }
  }, [fetchCardList])

  const loadMyCards = useCallback(async () => {
    if (!token) {
      setMyCards([])
      return
    }
    setMyLoading(true)
    try {
      const params = new URLSearchParams({
        scope: 'mine',
        sort: 'recent',
        page: '1',
      })
      const data = await fetchCardList(params)
      if (data.ok) setMyCards(data.cards)
    } finally {
      setMyLoading(false)
    }
  }, [fetchCardList, token])

  const loadSandboxData = useCallback(async () => {
    if (!token) {
      setSandboxCards([])
      setSandboxSettings(DEFAULT_SANDBOX_SETTINGS)
      return
    }
    const response = await fetch(`${API_BASE}/api/workshop/sandbox`, {
      headers: authHeaders(token),
    })
    const data = await response.json()
    if (data.ok) {
      setSandboxCards(data.cards)
      setSandboxSettings(normalizeSandboxSettings(data.settings))
    }
  }, [token])

  useEffect(() => {
    const queryChanged =
      prevBrowseQuery.current.search !== search ||
      prevBrowseQuery.current.sort !== sort

    if (queryChanged) {
      prevBrowseQuery.current = { search, sort }
      setBrowseCards([])
      setBrowseHasMore(false)
      if (browsePage !== 1) {
        setBrowsePage(1)
        return
      }
    }

    void loadBrowseCards(browsePage, search, sort)
  }, [browsePage, search, sort, loadBrowseCards])

  useEffect(() => {
    void loadFeaturedCards()
  }, [loadFeaturedCards])

  useEffect(() => {
    void loadMyCards()
  }, [loadMyCards])

  useEffect(() => {
    void loadSandboxData()
  }, [loadSandboxData])

  const refreshAllSections = useCallback(() => {
    if (browsePage === 1) {
      void loadBrowseCards(1, search, sort)
    } else {
      setBrowsePage(1)
    }
    void loadFeaturedCards()
    void loadMyCards()
    void loadSandboxData()
  }, [browsePage, loadBrowseCards, loadFeaturedCards, loadMyCards, loadSandboxData, search, sort])

  const updateCardCollections = useCallback((cardId: string, updater: (card: WorkshopCard) => WorkshopCard) => {
    const patchList = (cards: WorkshopCard[]) =>
      cards.map(card => card.id === cardId ? updater(card) : card)
    setBrowseCards(prev => patchList(prev))
    setFeaturedCards(prev => patchList(prev))
    setMyCards(prev => patchList(prev))
    setSandboxCards(prev => patchList(prev))
    setSelectedCard(prev => prev && prev.id === cardId ? updater(prev) : prev)
  }, [])

  // Community cards = cards whose PR has been merged. Currently filtered
  // client-side from the loaded browse/featured/my lists — the backend
  // doesn't yet support a direct "merged" filter. Users wanting the full
  // list can paginate through the main browse grid.
  const communityCards: WorkshopCard[] = (() => {
    if (!communityDeckEnabled) return []
    const seen = new Set<string>()
    const out: WorkshopCard[] = []
    for (const list of [browseCards, featuredCards, myCards]) {
      for (const c of list) {
        if (c.github_pr_status === 'merged' && !seen.has(c.id)) {
          seen.add(c.id)
          out.push(c)
        }
      }
    }
    return out
  })()

  const handleAddSandbox = async (cardDbId: string) => {
    if (!token) return
    await fetch(`${API_BASE}/api/workshop/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({ workshop_card_id: cardDbId }),
    })
    await loadSandboxData()
  }

  const handleRemoveSandboxCard = async (cardDbId: string) => {
    if (!token) return
    await fetch(`${API_BASE}/api/workshop/sandbox/${cardDbId}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })
    await loadSandboxData()
  }

  const handleResetSandbox = async (nextCardIds: string[], nextSettings: SandboxSettings) => {
    if (!token) return
    await fetch(`${API_BASE}/api/workshop/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({
        workshop_card_ids: nextCardIds,
        settings: nextSettings,
      }),
    })
    await loadSandboxData()
  }

  const handleLike = async (cardDbId: string) => {
    if (!token) return
    const response = await fetch(`${API_BASE}/api/workshop/cards/${cardDbId}/like`, {
      method: 'POST',
      headers: authHeaders(token),
    })
    const data = await response.json()
    if (data.ok) {
      updateCardCollections(cardDbId, card => ({
        ...card,
        liked_by_me: data.liked,
        like_count: card.like_count + (data.liked ? 1 : -1),
      }))
    }
  }

  const handleStartSandboxGame = async (extraCardId?: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/game/new-sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          customCardIds: buildSandboxCardIds(sandboxCards, extraCardId),
          playerCount: sandboxSettings.player_count,
          deckIds: sandboxSettings.deck_ids,
        }),
      })
      const data = await readSandboxStartResponse(response, t('platform.sandboxUnknownError'))
      if (data.ok) {
        const warnings: string[] = data.cardWarnings ?? []
        setSandboxActive(true)
        setSandboxKey(k => k + 1)
        if (warnings.length > 0) {
          // Cards had registration errors — feed back to AI designer
          setPendingSandboxErrors(warnings)
        }
      } else {
        const errors = [data.error ?? t('platform.sandboxUnknownError')]
        setPendingSandboxErrors(errors)
        alert(errors.join('\n'))
      }
    } catch (err) {
      const detail = err instanceof Error && err.message ? `: ${err.message}` : ''
      alert(`${t('platform.sandboxNetworkError')}${detail}`)
    }
  }

  const writeWorkshopUrl = useCallback((
    opts: { view?: 'sandbox' | 'editor' | null; card?: string | null },
    mode: 'push' | 'replace' = 'push',
  ) => {
    const nextUrl = buildWorkshopUrl(window.location.pathname, window.location.search, opts)
    if (mode === 'push') {
      window.history.pushState(null, '', nextUrl)
    } else {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [])

  const navigateView = useCallback((
    next: 'home' | 'sandbox' | 'editor',
    mode: 'push' | 'replace' = 'push',
  ) => {
    if (next === 'home') {
      setSelectedCard(null)
      setEditCard(undefined)
    }
    setView(next)
    writeWorkshopUrl({ view: next === 'home' ? null : next, card: null }, mode)
  }, [writeWorkshopUrl])

  const loadCardDetail = useCallback(async (cardDbId: string) => {
    const response = await fetch(`${API_BASE}/api/workshop/cards/${cardDbId}`, {
      headers: authHeaders(token),
    })
    const data = await response.json()
    if (data.ok) {
      setSelectedCard(data.card)
      setView('detail')
    }
  }, [token])

  useEffect(() => {
    const syncFromUrl = () => {
      const cardDbId = getWorkshopCardIdFromSearch(window.location.search)
      if (cardDbId) {
        void loadCardDetail(cardDbId)
        return
      }
      const v = getWorkshopViewFromSearch(window.location.search)
      setSelectedCard(null)
      if (v === 'sandbox' || v === 'editor') {
        setView(v)
      } else {
        setEditCard(undefined)
        setView('home')
      }
    }

    syncFromUrl()
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [loadCardDetail])

  const goBack = () => {
    const target = prevView.current
    const next = target === 'sandbox' || target === 'editor' ? target : 'home'
    navigateView(next, 'replace')
  }

  const selectCard = (card: WorkshopCard) => {
    prevView.current = view === 'detail' ? prevView.current : view
    setSelectedCard(card)
    setView('detail')
    writeWorkshopUrl({ card: card.id }, 'push')
  }

  if (view === 'detail' && selectedCard) {
    return (
      <div className="ws-page">
        <WorkshopNav
          view={view}
          onOpenHome={() => navigateView('home')}
          t={t}
        />
        <CardDetail
          card={selectedCard}
          token={token}
          onBack={goBack}
          onEdit={selectedCard.author_id === user?.id || selectedCard.author_name === user?.displayName || selectedCard.author_name === user?.username
            ? () => { prevView.current = 'detail'; setEditCard(selectedCard); navigateView('editor') }
            : undefined}
          onAddSandbox={handleAddSandbox}
          isOwner={selectedCard.author_id === user?.id || selectedCard.author_name === user?.displayName}
          isUserAdmin={!!user?.isAdmin}
          currentUserId={user?.id}
          onRefresh={() => {
            fetch(`${API_BASE}/api/workshop/cards/${selectedCard.id}`, { headers: authHeaders(token) })
              .then(response => response.json())
              .then(data => {
                if (data.ok) {
                  setSelectedCard(data.card)
                  refreshAllSections()
                }
              })
              .catch(() => {})
          }}
          t={t}
        />
      </div>
    )
  }

  if (view === 'editor') {
    return (
      <div className="ws-page">
        <WorkshopNav
          view={view}
          onOpenHome={() => navigateView('home')}
          t={t}
        />
        <CardEditor
          initial={editCard}
          token={token}
          onCancel={() => {
            const target = prevView.current
            const next = target === 'sandbox' || target === 'detail' ? target : 'home'
            if (next === 'detail' && selectedCard) {
              setEditCard(undefined)
              setView('detail')
              writeWorkshopUrl({ view: null, card: selectedCard.id }, 'replace')
            } else {
              navigateView(next === 'detail' ? 'home' : next, 'replace')
            }
          }}
          onAddToSandboxAndRestart={async (cardDbId: string) => {
            await handleAddSandbox(cardDbId)
            await handleStartSandboxGame(cardDbId)
          }}
          t={t}
          sandboxErrors={pendingSandboxErrors}
          onSandboxErrorsConsumed={() => setPendingSandboxErrors(null)}
        />
        <div className="sandbox-embed">
          <div className="sandbox-embed-toolbar">
            {sandboxActive ? (
              <>
                <button type="button" className="btn-primary ws-btn-sm" onClick={() => { void handleStartSandboxGame() }}>
                  {t('platform.restartSandbox')}
                </button>
                <button type="button" className="btn-secondary ws-btn-sm" onClick={() => setSandboxActive(false)}>
                  {t('platform.closeSandbox')}
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary ws-btn-sm" onClick={() => { void handleStartSandboxGame() }}>
                {t('platform.startSandbox')}
              </button>
            )}
            <details className="ai-designer-dev-help sandbox-embed-tips-details">
              <summary>{t('platform.devHelp')}</summary>
              <p>{t('platform.sandboxDevTips')}</p>
            </details>
          </div>
          {sandboxActive && (
            <iframe
              key={sandboxKey}
              className="sandbox-embed-frame"
              src={`?page=game&player=p1&embedded=1&devMode=1`}
              title="Sandbox"
            />
          )}
        </div>
      </div>
    )
  }

  if (view === 'sandbox') {
    return (
      <div className="ws-page">
        <WorkshopNav
          view={view}
          onOpenHome={() => navigateView('home')}
          t={t}
        />
        <SandboxView
          cards={sandboxCards}
          settings={sandboxSettings}
          onSelect={selectCard}
          onStartGame={handleStartSandboxGame}
          onRemove={handleRemoveSandboxCard}
          onOpenReset={() => setResetSandboxOpen(true)}
          t={t}
        />
        {resetSandboxOpen && (
          <SandboxResetModal
            token={token}
            currentCards={sandboxCards}
            currentSettings={sandboxSettings}
            onClose={() => setResetSandboxOpen(false)}
            onSave={handleResetSandbox}
            t={t}
          />
        )}
        <div className="sandbox-embed">
          <div className="sandbox-embed-toolbar">
            {sandboxActive ? (
              <>
                <button type="button" className="btn-primary ws-btn-sm" onClick={() => { void handleStartSandboxGame() }}>
                  {t('platform.restartSandbox')}
                </button>
                <button type="button" className="btn-secondary ws-btn-sm" onClick={() => setSandboxActive(false)}>
                  {t('platform.closeSandbox')}
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary ws-btn-sm" onClick={() => { void handleStartSandboxGame() }}>
                {t('platform.startSandbox')}
              </button>
            )}
            <details className="ai-designer-dev-help sandbox-embed-tips-details">
              <summary>{t('platform.devHelp')}</summary>
              <p>{t('platform.sandboxDevTips')}</p>
            </details>
          </div>
          {sandboxActive && (
            <iframe
              key={sandboxKey}
              className="sandbox-embed-frame"
              src={`?page=game&player=p1&embedded=1&devMode=1`}
              title="Sandbox"
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ws-page">
      <WorkshopNav
        view={view}
        onOpenHome={() => navigateView('home')}
        t={t}
      />

      {user && (
        <Section
          variant="sandbox"
          icon="🧪"
          title={t('platform.sandbox')}
          className="ws-section-sandbox"
          actions={(
            <>
              <button
                type="button"
                className="btn-secondary ws-btn-sm"
                onClick={() => setResetSandboxOpen(true)}
              >
                {t('platform.adjustConfig')}
              </button>
              <button
                type="button"
                className="btn-primary ws-btn-sm"
                onClick={() => navigateView('sandbox')}
              >
                {t('platform.enterSandbox')}
              </button>
            </>
          )}
        >
          <div className="ws-sandbox-info">
            <span className="ws-chip">
              {t('platform.sandboxPlayerCountOption', { count: sandboxSettings.player_count })}
            </span>
            {sandboxSettings.deck_ids.map(d => (
              <span key={d} className="ws-chip ws-chip-deck">{d}</span>
            ))}
            <span className="ws-chip ws-chip-count">
              {sandboxCards.length > 0
                ? t('platform.sandboxSummaryFilled', {
                  count: sandboxCards.length,
                  cards: `${sandboxCards.slice(0, 3).map(card => card.name).join(', ')}${sandboxCards.length > 3 ? '…' : ''}`,
                })
                : t('platform.sandboxSummaryEmpty')}
            </span>
          </div>
          {sandboxCards.length === 0 && (
            <EmptyState
              art="cards"
              title={t('platform.sandboxEmptyTitle')}
              description={t('platform.sandboxEmptyDesc')}
              variant="compact"
            />
          )}
        </Section>
      )}

      {user && (
        <Section
          variant="parchment"
          icon="📒"
          title={t('platform.myCards')}
          subtitle={t('platform.myCardsSubtitle')}
          mobileCollapsible
          defaultCollapsed
          actions={(
            <button
              type="button"
              className="btn-primary ws-btn-sm"
              onClick={() => {
                prevView.current = view
                setEditCard(undefined)
                navigateView('editor')
              }}
            >
              {t('platform.createCard')}
            </button>
          )}
        >
          {myLoading ? (
            <div className="ws-loading">{t('platform.loadingMore')}</div>
          ) : myCards.length === 0 ? (
            <EmptyState
              art="wheat"
              title={t('platform.noMyCards')}
              description={t('platform.myCardsSubtitle')}
              action={(
                <button
                  type="button"
                  className="btn-primary ws-btn-sm"
                  onClick={() => {
                    prevView.current = view
                    setEditCard(undefined)
                    navigateView('editor')
                  }}
                >
                  {t('platform.createCard')}
                </button>
              )}
            />
          ) : (
            <div className="ws-card-grid">
              {myCards.map(card => (
                <CardTile key={card.id} card={card} onSelect={selectCard} onLike={handleLike} mine t={t} />
              ))}
            </div>
          )}
        </Section>
      )}

      <Section
        variant="secondary"
        icon="⭐"
        title={t('platform.featured')}
        subtitle={t('platform.featuredSubtitle')}
        mobileCollapsible
        defaultCollapsed
      >
        {featuredLoading ? (
          <div className="ws-loading">{t('platform.loadingMore')}</div>
        ) : featuredCards.length === 0 ? (
          <EmptyState
            art="fence"
            title={t('platform.noFeatured')}
            description={t('platform.featuredSubtitle')}
            variant="compact"
          />
        ) : (
          <div className="ws-card-grid">
            {featuredCards.map(card => (
              <CardTile key={card.id} card={card} onSelect={selectCard} onLike={handleLike} t={t} />
            ))}
          </div>
        )}
      </Section>

      {communityDeckEnabled && (
        <WorkshopSection
          title="社区卡"
          subtitle="已合并到主仓库的社区卡（PR 已 merged）。"
        >
          {communityCards.length === 0 ? (
            <p className="rooms-empty">暂无已合并的社区卡。</p>
          ) : (
            <div className="ws-card-grid">
              {communityCards.map(card => (
                <CardTile key={card.id} card={card} onSelect={selectCard} onLike={handleLike} t={t} />
              ))}
            </div>
          )}
        </WorkshopSection>
      )}

      <Section
        variant="parchment"
        icon="🔍"
        title={t('platform.browse')}
        subtitle={t('platform.browseSubtitle')}
        mobileCollapsible
        defaultCollapsed
        actions={(
          <div className="ws-toolbar">
            <form onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()) }} className="ws-search">
              <span className="ws-search__icon" aria-hidden>
                <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
                  <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <line x1="11" y1="11" x2="14" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder={t('platform.searchPlaceholder')}
                aria-label={t('platform.searchBtn')}
              />
              <button type="submit" className="ws-search__submit" aria-label={t('platform.searchBtn')}>
                {t('platform.searchBtn')}
              </button>
            </form>
            <div className="ws-sort-tabs">
              <button
                type="button"
                className={`ws-sort-tab${sort === 'recent' ? ' is-active' : ''}`}
                onClick={() => setSort('recent')}
              >
                {t('platform.sortRecent')}
              </button>
              <button
                type="button"
                className={`ws-sort-tab${sort === 'popular' ? ' is-active' : ''}`}
                onClick={() => setSort('popular')}
              >
                {t('platform.sortPopular')}
              </button>
            </div>
          </div>
        )}
      >
        {browseCards.length === 0 && !browseLoading ? (
          <EmptyState
            art="magnifier"
            title={t('platform.noPublished')}
            description={t('platform.browseSubtitle')}
            variant="compact"
          />
        ) : (
          <div className="ws-card-grid">
            {browseCards.map(card => (
              <CardTile key={card.id} card={card} onSelect={selectCard} onLike={handleLike} t={t} />
            ))}
          </div>
        )}
        {browseLoading && <div className="ws-loading">{t('platform.loadingMore')}</div>}
        {browseHasMore && !browseLoading && (
          <button type="button" className="btn-secondary ws-load-more" onClick={() => setBrowsePage(prev => prev + 1)}>
            {t('platform.loadMore')}
          </button>
        )}
      </Section>

      {resetSandboxOpen && (
        <SandboxResetModal
          token={token}
          currentCards={sandboxCards}
          currentSettings={sandboxSettings}
          onClose={() => setResetSandboxOpen(false)}
          onSave={handleResetSandbox}
          t={t}
        />
      )}
    </div>
  )
}

function WorkshopNav({
  view,
  onOpenHome,
  t,
}: {
  view: View
  onOpenHome: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const isHome = view === 'home'
  const handleBack = isHome ? () => setPage('lobby') : onOpenHome
  const backLabel = isHome ? t('platform.backToLobbyShort') : t('platform.backToWorkshopHome')
  return (
    <div className="ws-nav">
      <div className="ws-nav-left">
        <button type="button" className="ws-back-home" onClick={handleBack}>
          <span aria-hidden="true">‹</span>
          {backLabel}
        </button>
        <h1>{t('platform.workshopTitle')}</h1>
      </div>
      <div className="ws-nav-actions">
        {!isHome && (
          <button type="button" className="btn-link ws-nav-link" onClick={() => setPage('lobby')}>
            {t('platform.backToLobbyPlain')}
          </button>
        )}
        <LocaleSwitcher />
      </div>
    </div>
  )
}
