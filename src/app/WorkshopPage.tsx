import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from './PageRouter'
import { AiCardDesigner, type ExtractedCard } from './workshop/AiCardDesigner'
import { ResourceText } from '../components/common/ResourceText'
import { API_BASE } from '../config'

type WorkshopCard = {
  id: string
  card_id: string
  card_type: 'minor' | 'occupation'
  name: string
  description: string
  card_json: Record<string, unknown>
  effect_dsl: Record<string, unknown> | null
  art_url: string | null
  status: 'draft' | 'published'
  author_id?: string
  author_name: string
  like_count: number
  liked_by_me: boolean
  featured?: number
  created_at: number
  updated_at: number
}

type CardVersion = {
  id: string
  version_number: number
  card_json: Record<string, unknown>
  effect_dsl: Record<string, unknown> | null
  art_url: string | null
  created_at: number
}

type Comment = {
  id: string
  body: string
  author_name: string
  created_at: number
}

type View = 'home' | 'sandbox' | 'editor' | 'detail'

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// ── Card Preview Tile ────────────────────────────────────────────────────────

function CardTile({ card, onSelect, onLike, mine, t }: {
  card: WorkshopCard
  onSelect: (c: WorkshopCard) => void
  onLike: (id: string) => void
  mine?: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <div className="ws-card-tile" onClick={() => onSelect(card)}>
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

function CardSourceViewer({ card, token, t }: { card: WorkshopCard; token: string | null; t: (key: string, params?: Record<string, string | number>) => string }) {
  const [code, setCode] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadCode = async () => {
    if (code) { setShowCode(!showCode); return }
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/workshop/cards/preview-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          card_id: card.card_id,
          card_type: card.card_type,
          name: card.name,
          description: card.description,
          card_json: card.card_json,
          effect_dsl: card.effect_dsl,
        }),
      })
      const d = await r.json()
      if (d.ok) { setCode(d.code); setShowCode(true) }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const effectCode = (card as Record<string, unknown>).effect_code as string | null
  if (effectCode) {
    return (
      <div className="ws-detail-section">
        <h3>{t('platform.cardCode')}</h3>
        <pre className="ws-code">{effectCode}</pre>
        <p className="ws-code-note">{t('platform.codeNote')}</p>
      </div>
    )
  }

  return (
    <div className="ws-detail-section">
      <h3>{t('platform.effect')}</h3>
      <pre className="ws-code">{JSON.stringify(card.effect_dsl, null, 2)}</pre>
      <div className="ws-code-toolbar">
        <button type="button" className="btn-secondary ws-btn-sm" onClick={loadCode} disabled={loading}>
          {loading ? t('platform.generating') : showCode ? t('platform.hideCode') : t('platform.showCode')}
        </button>
      </div>
      {showCode && code && (
        <pre className="ws-code" style={{ marginTop: '8px' }}>{code}</pre>
      )}
    </div>
  )
}

// ── Card Detail Panel ────────────────────────────────────────────────────────

function CardDetail({ card, token, onBack, onEdit, onAddSandbox, isOwner, isUserAdmin, onRefresh, t }: {
  card: WorkshopCard
  token: string | null
  onBack: () => void
  onEdit?: () => void
  onAddSandbox: (id: string) => void
  isOwner?: boolean
  isUserAdmin?: boolean
  onRefresh?: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [liked, setLiked] = useState(card.liked_by_me)
  const [likeCount, setLikeCount] = useState(card.like_count)
  const [submitting, setSubmitting] = useState(false)
  const [versions, setVersions] = useState<CardVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
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
    const r = await fetch(`${API_BASE}/api/workshop/cards/${card.id}/versions`, { headers: authHeaders(token) })
    const d = await r.json()
    if (d.ok) { setVersions(d.versions); setShowVersions(true) }
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
        </div>
      </div>

      {(card.effect_dsl || 'effect_code' in card) && (
        <CardSourceViewer card={card} token={token} t={t} />
      )}

      {showVersions && (
        <div className="ws-detail-section">
          <h3>{t('platform.versionHistoryCount', { count: versions.length })}</h3>
          {versions.length === 0 ? (
            <p className="ws-empty">{t('platform.noVersions')}</p>
          ) : (
            <ul className="ws-versions">
              {versions.map(v => (
                <li key={v.id} className="ws-version-item">
                  <span className="ws-version-num">v{v.version_number}</span>
                  <span className="ws-version-date">{new Date(v.created_at).toLocaleString()}</span>
                  <span className="ws-version-name">{(v.card_json as Record<string, unknown>).name as string || '—'}</span>
                  <button type="button" className="btn-secondary ws-btn-xs" onClick={() => handleRevert(v.id)}>{t('platform.revert')}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
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

const RESOURCE_KEYS = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle']

function CardEditor({ initial, token, onSaved, onCancel, t }: {
  initial?: WorkshopCard
  token: string | null
  onSaved: () => void
  onCancel: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [cardId, setCardId] = useState(initial?.card_id ?? 'CUSTOM_')
  const [cardType, setCardType] = useState<'minor' | 'occupation'>(initial?.card_type ?? 'minor')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [vp, setVp] = useState(String((initial?.card_json as Record<string, unknown>)?.vp ?? 0))
  const [cost, setCost] = useState<Record<string, number>>(
    ((initial?.card_json as Record<string, unknown>)?.cost as Record<string, number>) ?? {}
  )
  const [dslText, setDslText] = useState(initial?.effect_dsl ? JSON.stringify(initial.effect_dsl, null, 2) : '')
  const [effectMode, setEffectMode] = useState<'dsl' | 'code'>('dsl')
  const [codeText, setCodeText] = useState('')
  const [codeErrors, setCodeErrors] = useState<string[]>([])
  const [validating, setValidating] = useState(false)
  const [artUrl, setArtUrl] = useState<string | null>(initial?.art_url ?? null)
  const [showAi, setShowAi] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAiImport = (extracted: ExtractedCard, importedArtUrl: string | null) => {
    setName(extracted.card.name)
    setCardId(extracted.card.id)
    setCardType(extracted.card.card_type)
    setDesc((extracted.card.desc ?? []).join(' '))
    setVp(String(extracted.card.vp ?? 0))
    setCost(extracted.card.cost ?? {})
    if (extracted.effects && Object.keys(extracted.effects).length > 0) {
      setDslText(JSON.stringify(extracted.effects, null, 2))
    }
    if (importedArtUrl) setArtUrl(importedArtUrl)
    setShowAi(false)
  }

  const handleCostChange = (res: string, val: string) => {
    const n = Number(val)
    if (n <= 0) {
      const next = { ...cost }
      delete next[res]
      setCost(next)
    } else {
      setCost(prev => ({ ...prev, [res]: n }))
    }
  }

  const handleValidateCode = async () => {
    if (!codeText.trim()) { setCodeErrors([t('platform.enterCode')]); return }
    setValidating(true)
    setCodeErrors([])
    try {
      const r = await fetch(`${API_BASE}/api/workshop/cards/validate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ source: codeText }),
      })
      const d = await r.json()
      if (d.ok && d.valid) {
        setCodeErrors([])
        setError('')
      } else {
        setCodeErrors(d.errors ?? [t('platform.validationFailed')])
      }
    } catch {
      setCodeErrors([t('platform.networkError')])
    } finally {
      setValidating(false)
    }
  }

  const handleSave = async (publishStatus: 'draft' | 'published') => {
    setError('')
    if (!name.trim()) { setError(t('platform.cardNameRequired')); return }
    if (!cardId.startsWith('CUSTOM_') || cardId.length < 8) { setError(t('platform.cardIdInvalid')); return }

    let effectDsl = null
    if (effectMode === 'dsl' && dslText.trim()) {
      try { effectDsl = JSON.parse(dslText) } catch { setError(t('platform.dslJsonError')); return }
    }

    const cardJson = {
      id: cardId,
      name,
      deck: 'CUSTOM',
      number: 0,
      desc: desc ? [desc] : [],
      cost,
      vp: Number(vp) || 0,
      implemented: true,
    }

    setSaving(true)
    try {
      const r = await fetch(`${API_BASE}/api/workshop/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          id: initial?.id,
          card_id: cardId,
          card_type: cardType,
          name,
          description: desc,
          card_json: cardJson,
          effect_dsl: effectMode === 'dsl' ? effectDsl : null,
          effect_code: effectMode === 'code' ? codeText : undefined,
          art_url: artUrl,
          status: publishStatus,
        }),
      })
      const d = await r.json()
      if (d.ok) {
        onSaved()
      } else {
        setError(d.error ?? t('platform.saveFailed'))
      }
    } catch {
      setError(t('platform.networkError'))
    } finally {
      setSaving(false)
    }
  }

  if (showAi) {
    return (
      <div className="ws-editor">
        <AiCardDesigner
          onImport={handleAiImport}
          onClose={() => setShowAi(false)}
        />
      </div>
    )
  }

  return (
    <div className="ws-editor">
      <div className="ws-editor-header">
        <h2>{initial ? t('platform.editCard') : t('platform.createCardTitle')}</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button type="button" className="btn-secondary ws-btn-sm ai-open-btn" onClick={() => setShowAi(true)}>
            {t('platform.aiDesigner')}
          </button>
          <button type="button" className="btn-link" onClick={onCancel}>{t('platform.cancel')}</button>
        </div>
      </div>
      {artUrl && <img src={artUrl} alt="card art" className="ws-editor-art-preview" />}

      <div className="ws-editor-form">
        <div className="ws-form-row">
          <div className="form-field">
            <label>{t('platform.cardName')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('platform.cardNamePlaceholder')} />
          </div>
          <div className="form-field">
            <label>{t('platform.cardType')}</label>
            <select value={cardType} onChange={e => setCardType(e.target.value as 'minor' | 'occupation')}>
              <option value="minor">{t('platform.minor')}</option>
              <option value="occupation">{t('platform.occupation')}</option>
            </select>
          </div>
        </div>

        <div className="form-field">
          <label>{t('platform.cardId')}</label>
          <input value={cardId} onChange={e => setCardId(e.target.value)} placeholder={t('platform.cardIdPlaceholder')} />
        </div>

        <div className="form-field">
          <label>{t('platform.description')}</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder={t('platform.descPlaceholder')} />
        </div>

        <div className="ws-form-row">
          <div className="form-field ws-field-sm">
            <label>{t('platform.vpField')}</label>
            <input type="number" value={vp} onChange={e => setVp(e.target.value)} min={0} max={20} />
          </div>
        </div>

        <div className="ws-cost-editor">
          <label>{t('platform.costLabel')}</label>
          <div className="ws-cost-grid">
            {RESOURCE_KEYS.map(res => (
              <div key={res} className="ws-cost-cell">
                <span>{res}</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={cost[res] ?? 0}
                  onChange={e => handleCostChange(res, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="form-field">
          <div className="ws-effect-mode-toggle">
            <button type="button" className={`ws-tab-sm${effectMode === 'dsl' ? ' active' : ''}`} onClick={() => setEffectMode('dsl')}>
              {t('platform.dslMode')}
            </button>
            <button type="button" className={`ws-tab-sm${effectMode === 'code' ? ' active' : ''}`} onClick={() => setEffectMode('code')}>
              {t('platform.codeMode')}
            </button>
          </div>

          {effectMode === 'dsl' ? (
            <>
              <label>{t('platform.dslLabel')}</label>
              <textarea
                value={dslText}
                onChange={e => setDslText(e.target.value)}
                rows={8}
                placeholder={'{\n  "onReturnHome": {\n    "optional": true,\n    "flow": [{ "action": "gain", "params": { "food": 2 } }]\n  }\n}'}
                className="ws-code-input"
              />
              <p className="ws-code-note">{t('platform.dslNote')}</p>
            </>
          ) : (
            <>
              <label>{t('platform.tsLabel')}</label>
              <textarea
                value={codeText}
                onChange={e => { setCodeText(e.target.value); setCodeErrors([]) }}
                rows={12}
                placeholder={'registerCardEffect({\n  id: "CUSTOM_MyCard",\n  onReturnHome: (state, player) => {\n    return { type: "leaf", actionId: "gain", params: { food: 2 }, sourceCard: "CUSTOM_MyCard" }\n  },\n})'}
                className="ws-code-input"
              />
              <div className="ws-code-toolbar">
                <button type="button" className="btn-secondary ws-btn-sm" onClick={handleValidateCode} disabled={validating}>
                  {validating ? t('platform.validating') : t('platform.validateCode')}
                </button>
                <button type="button" className="btn-secondary ws-btn-sm" onClick={async () => {
                  const r = await fetch(`${API_BASE}/api/workshop/cards/generate-template`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
                    body: JSON.stringify({ card_id: cardId, card_type: cardType, name, description: desc, card_json: { cost, vp: Number(vp) || 0, desc: desc ? [desc] : [] } }),
                  })
                  const d = await r.json()
                  if (d.ok && d.code) setCodeText(d.code)
                }}>
                  {t('platform.generateTemplate')}
                </button>
                {dslText.trim() && (
                  <button type="button" className="btn-secondary ws-btn-sm" onClick={async () => {
                    try {
                      const dsl = JSON.parse(dslText)
                      const r = await fetch(`${API_BASE}/api/workshop/cards/preview-code`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
                        body: JSON.stringify({ card_id: cardId, card_type: cardType, name, description: desc, card_json: { cost, vp: Number(vp) || 0, desc: desc ? [desc] : [] }, effect_dsl: dsl }),
                      })
                      const d = await r.json()
                      if (d.ok && d.code) setCodeText(d.code)
                    } catch { setError(t('platform.dslJsonError')) }
                  }}>
                    {t('platform.generateFromDsl')}
                  </button>
                )}
                {codeErrors.length === 0 && codeText.trim() && !validating && (
                  <span className="ws-code-ok">{t('platform.validationPassed')}</span>
                )}
              </div>
              {codeErrors.length > 0 && (
                <ul className="ws-code-errors">
                  {codeErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              <p className="ws-code-note">
                {t('platform.codeApiNote')}
              </p>
            </>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="ws-editor-actions">
          <button type="button" className="btn-secondary" onClick={() => handleSave('draft')} disabled={saving}>
            {t('platform.saveDraft')}
          </button>
          <button type="button" className="btn-primary" onClick={() => handleSave('published')} disabled={saving}>
            {t('platform.publishCard')}
          </button>
        </div>
      </div>
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

function SandboxSummaryPanel({
  cards,
  onOpenSandbox,
  onStartGame,
  t,
}: {
  cards: WorkshopCard[]
  onOpenSandbox: () => void
  onStartGame: (cardIds: string[], mode: 'single' | 'multi') => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <div className="ws-sandbox-summary">
      <div>
        <div className="ws-sandbox-summary-title">{t('platform.sandbox')}</div>
        <div className="ws-sandbox-summary-text">
          {cards.length > 0
            ? t('platform.sandboxSummaryFilled', {
              count: cards.length,
              cards: `${cards.slice(0, 3).map(card => card.name).join(', ')}${cards.length > 3 ? '…' : ''}`,
            })
            : t('platform.sandboxSummaryEmpty')}
        </div>
      </div>
      <div className="ws-sandbox-summary-actions">
        <button type="button" className="btn-secondary ws-btn-sm" onClick={onOpenSandbox}>
          {t('platform.openSandbox')}
        </button>
        <button
          type="button"
          className="btn-primary ws-btn-sm"
          onClick={() => onStartGame(cards.map(card => card.id), 'single')}
          disabled={cards.length === 0}
        >
          {t('platform.singleTest')}
        </button>
        <button
          type="button"
          className="btn-secondary ws-btn-sm"
          onClick={() => onStartGame(cards.map(card => card.id), 'multi')}
          disabled={cards.length === 0}
        >
          {t('platform.multiTest')}
        </button>
      </div>
    </div>
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
  onClose,
  onSave,
  t,
}: {
  token: string | null
  currentCards: WorkshopCard[]
  onClose: () => void
  onSave: (cardIds: string[]) => Promise<void>
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [myCards, setMyCards] = useState<WorkshopCard[]>([])
  const [publishedCards, setPublishedCards] = useState<WorkshopCard[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>(currentCards.map(card => card.id))
  const [publishedSearchInput, setPublishedSearchInput] = useState('')
  const [publishedSearch, setPublishedSearch] = useState('')
  const [loadingMine, setLoadingMine] = useState(false)
  const [loadingPublished, setLoadingPublished] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedIds(currentCards.map(card => card.id))
  }, [currentCards])

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

  const myCardIds = new Set(myCards.map(card => card.id))
  const selectablePublishedCards = publishedCards.filter(card => !myCardIds.has(card.id))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(selectedIds)
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
  onSelect,
  onStartGame,
  onRemove,
  onOpenReset,
  t,
}: {
  cards: WorkshopCard[]
  onSelect: (c: WorkshopCard) => void
  onStartGame: (cardIds: string[], mode: 'single' | 'multi') => void
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
          <div className="ws-sandbox-btns">
            <button
              type="button"
              className="btn-primary"
              onClick={() => onStartGame(cards.map(card => card.id), 'single')}
            >
              {t('platform.singleTest')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onStartGame(cards.map(card => card.id), 'multi')}
            >
              {t('platform.multiTest')}
            </button>
          </div>
        </>
      )}
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
  const prevView = useRef<View>('home')
  const prevBrowseQuery = useRef({ search: '', sort: 'recent' as 'recent' | 'popular' })

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

  const loadSandboxCards = useCallback(async () => {
    if (!token) {
      setSandboxCards([])
      return
    }
    const response = await fetch(`${API_BASE}/api/workshop/sandbox`, {
      headers: authHeaders(token),
    })
    const data = await response.json()
    if (data.ok) setSandboxCards(data.cards)
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
    void loadSandboxCards()
  }, [loadSandboxCards])

  const refreshAllSections = useCallback(() => {
    if (browsePage === 1) {
      void loadBrowseCards(1, search, sort)
    } else {
      setBrowsePage(1)
    }
    void loadFeaturedCards()
    void loadMyCards()
    void loadSandboxCards()
  }, [browsePage, loadBrowseCards, loadFeaturedCards, loadMyCards, loadSandboxCards, search, sort])

  const updateCardCollections = useCallback((cardId: string, updater: (card: WorkshopCard) => WorkshopCard) => {
    const patchList = (cards: WorkshopCard[]) =>
      cards.map(card => card.id === cardId ? updater(card) : card)
    setBrowseCards(prev => patchList(prev))
    setFeaturedCards(prev => patchList(prev))
    setMyCards(prev => patchList(prev))
    setSandboxCards(prev => patchList(prev))
    setSelectedCard(prev => prev && prev.id === cardId ? updater(prev) : prev)
  }, [])

  const handleAddSandbox = async (cardDbId: string) => {
    if (!token) return
    await fetch(`${API_BASE}/api/workshop/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({ workshop_card_id: cardDbId }),
    })
    await loadSandboxCards()
  }

  const handleRemoveSandboxCard = async (cardDbId: string) => {
    if (!token) return
    await fetch(`${API_BASE}/api/workshop/sandbox/${cardDbId}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })
    await loadSandboxCards()
  }

  const handleResetSandbox = async (nextCardIds: string[]) => {
    if (!token) return
    const currentIds = new Set(sandboxCards.map(card => card.id))
    const targetIds = new Set(nextCardIds)
    const removals = [...currentIds].filter(id => !targetIds.has(id))
    const additions = [...targetIds].filter(id => !currentIds.has(id))

    await Promise.all(removals.map(cardId =>
      fetch(`${API_BASE}/api/workshop/sandbox/${cardId}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      }),
    ))
    await Promise.all(additions.map(cardId =>
      fetch(`${API_BASE}/api/workshop/sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ workshop_card_id: cardId }),
      }),
    ))
    await loadSandboxCards()
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

  const handleStartSandboxGame = async (cardIds: string[], mode: 'single' | 'multi') => {
    if (mode === 'multi') {
      setPage('game', { transport: 'ws', customCards: cardIds.join(',') })
      return
    }
    try {
      const response = await fetch(`${API_BASE}/api/game/new-sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ customCardIds: cardIds }),
      })
      const data = await response.json()
      if (data.ok) {
        setPage('game')
      } else {
        alert(t('platform.sandboxFailed', { error: data.error ?? t('platform.sandboxUnknownError') }))
      }
    } catch {
      alert(t('platform.sandboxNetworkError'))
    }
  }

  const goBack = () => {
    setSelectedCard(null)
    setView(prevView.current)
  }

  const selectCard = (card: WorkshopCard) => {
    prevView.current = view
    setSelectedCard(card)
    setView('detail')
  }

  if (view === 'detail' && selectedCard) {
    return (
      <div className="ws-page">
        <WorkshopNav
          view={view}
          user={user}
          sandboxCount={sandboxCards.length}
          onOpenHome={() => { setSelectedCard(null); setView('home') }}
          onOpenSandbox={() => setView('sandbox')}
          onCreateCard={() => {
            prevView.current = view
            setEditCard(undefined)
            setView('editor')
          }}
          t={t}
        />
        <CardDetail
          card={selectedCard}
          token={token}
          onBack={goBack}
          onEdit={selectedCard.author_id === user?.id || selectedCard.author_name === user?.displayName || selectedCard.author_name === user?.username
            ? () => { setEditCard(selectedCard); setView('editor') }
            : undefined}
          onAddSandbox={handleAddSandbox}
          isOwner={selectedCard.author_id === user?.id || selectedCard.author_name === user?.displayName}
          isUserAdmin={!!user?.isAdmin}
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
          user={user}
          sandboxCount={sandboxCards.length}
          onOpenHome={() => { setEditCard(undefined); setView('home') }}
          onOpenSandbox={() => setView('sandbox')}
          onCreateCard={() => {
            setEditCard(undefined)
            setView('editor')
          }}
          t={t}
        />
        <CardEditor
          initial={editCard}
          token={token}
          onSaved={() => {
            setEditCard(undefined)
            setView('home')
            refreshAllSections()
          }}
          onCancel={() => {
            setEditCard(undefined)
            setView(prevView.current)
          }}
          t={t}
        />
      </div>
    )
  }

  if (view === 'sandbox') {
    return (
      <div className="ws-page">
        <WorkshopNav
          view={view}
          user={user}
          sandboxCount={sandboxCards.length}
          onOpenHome={() => setView('home')}
          onOpenSandbox={() => setView('sandbox')}
          onCreateCard={() => {
            prevView.current = view
            setEditCard(undefined)
            setView('editor')
          }}
          t={t}
        />
        <SandboxView
          cards={sandboxCards}
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
            onClose={() => setResetSandboxOpen(false)}
            onSave={handleResetSandbox}
            t={t}
          />
        )}
      </div>
    )
  }

  return (
    <div className="ws-page">
      <WorkshopNav
        view={view}
        user={user}
        sandboxCount={sandboxCards.length}
        onOpenHome={() => setView('home')}
        onOpenSandbox={() => setView('sandbox')}
        onCreateCard={() => {
          prevView.current = view
          setEditCard(undefined)
          setView('editor')
        }}
        t={t}
      />

      {user && (
        <div className="ws-home-header">
          <SandboxSummaryPanel
            cards={sandboxCards}
            onOpenSandbox={() => setView('sandbox')}
            onStartGame={handleStartSandboxGame}
            t={t}
          />
        </div>
      )}

      {user && (
        <WorkshopSection
          title={t('platform.myCards')}
          subtitle={t('platform.myCardsSubtitle')}
          actions={(
            <button
              type="button"
              className="btn-primary ws-btn-sm"
              onClick={() => {
                prevView.current = view
                setEditCard(undefined)
                setView('editor')
              }}
            >
              {t('platform.createCard')}
            </button>
          )}
        >
          {myLoading ? (
            <div className="ws-loading">{t('platform.loadingMore')}</div>
          ) : myCards.length === 0 ? (
            <p className="rooms-empty">{t('platform.noMyCards')}</p>
          ) : (
            <div className="ws-card-grid">
              {myCards.map(card => (
                <CardTile key={card.id} card={card} onSelect={selectCard} onLike={handleLike} mine t={t} />
              ))}
            </div>
          )}
        </WorkshopSection>
      )}

      <WorkshopSection
        title={t('platform.featured')}
        subtitle={t('platform.featuredSubtitle')}
      >
        {featuredLoading ? (
          <div className="ws-loading">{t('platform.loadingMore')}</div>
        ) : featuredCards.length === 0 ? (
          <p className="rooms-empty">{t('platform.noFeatured')}</p>
        ) : (
          <div className="ws-card-grid">
            {featuredCards.map(card => (
              <CardTile key={card.id} card={card} onSelect={selectCard} onLike={handleLike} t={t} />
            ))}
          </div>
        )}
      </WorkshopSection>

      <WorkshopSection
        title={t('platform.browse')}
        subtitle={t('platform.browseSubtitle')}
        actions={(
          <div className="ws-toolbar">
            <form onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()) }} className="ws-search">
              <input
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder={t('platform.searchPlaceholder')}
              />
              <button type="submit" className="btn-primary ws-btn-sm">{t('platform.searchBtn')}</button>
            </form>
            <div className="ws-sort">
              <button type="button" className={`ws-sort-btn${sort === 'recent' ? ' active' : ''}`} onClick={() => setSort('recent')}>{t('platform.sortRecent')}</button>
              <button type="button" className={`ws-sort-btn${sort === 'popular' ? ' active' : ''}`} onClick={() => setSort('popular')}>{t('platform.sortPopular')}</button>
            </div>
          </div>
        )}
      >
        {browseCards.length === 0 && !browseLoading ? (
          <p className="rooms-empty">{t('platform.noPublished')}</p>
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
      </WorkshopSection>

      {resetSandboxOpen && (
        <SandboxResetModal
          token={token}
          currentCards={sandboxCards}
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
  user,
  sandboxCount,
  onOpenHome,
  onOpenSandbox,
  onCreateCard,
  t,
}: {
  view: View
  user: { username: string; displayName: string } | null
  sandboxCount: number
  onOpenHome: () => void
  onOpenSandbox: () => void
  onCreateCard: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <div className="ws-nav">
      <div className="ws-nav-left">
        <button type="button" className="btn-link ws-back-home" onClick={() => setPage('lobby')}>{t('platform.backToLobbyShort')}</button>
        <h1>{t('platform.workshopTitle')}</h1>
      </div>
      <div className="ws-nav-actions">
        {view !== 'home' && (
          <button type="button" className="btn-link ws-nav-link" onClick={onOpenHome}>
            {t('platform.backToWorkshopHome')}
          </button>
        )}
        {user && (
          <>
            <button
              type="button"
              className={`btn-secondary ws-btn-sm ws-nav-action${view === 'sandbox' ? ' active' : ''}`}
              onClick={onOpenSandbox}
            >
              {t('platform.sandbox')}{sandboxCount > 0 ? ` (${sandboxCount})` : ''}
            </button>
            <button type="button" className="btn-primary ws-btn-sm" onClick={onCreateCard}>
              {t('platform.createCard')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
