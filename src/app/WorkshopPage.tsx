import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
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
  author_name: string
  like_count: number
  liked_by_me: boolean
  created_at: number
  updated_at: number
}

type Comment = {
  id: string
  body: string
  author_name: string
  created_at: number
}

type View = 'browse' | 'mine' | 'sandbox' | 'editor' | 'detail'

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// ── Card Preview Tile ────────────────────────────────────────────────────────

function CardTile({ card, onSelect, onLike, mine }: {
  card: WorkshopCard
  onSelect: (c: WorkshopCard) => void
  onLike: (id: string) => void
  mine?: boolean
}) {
  return (
    <div className="ws-card-tile" onClick={() => onSelect(card)}>
      {card.art_url && (
        <img className="ws-card-art-thumb" src={card.art_url} alt={card.name} />
      )}
      <div className="ws-card-tile-body">
        <div className="ws-card-tile-name">{card.name}</div>
        <div className="ws-card-tile-meta">
          <span className="ws-badge">{card.card_type === 'minor' ? '小改进' : '职业'}</span>
          {mine && <span className={`ws-badge ws-badge-${card.status}`}>{card.status === 'published' ? '已发布' : '草稿'}</span>}
          <span className="ws-author">by {card.author_name}</span>
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
          title="点赞"
        >
          ♥ {card.like_count}
        </button>
      </div>
    </div>
  )
}

// ── Card Detail Panel ────────────────────────────────────────────────────────

function CardDetail({ card, token, onBack, onEdit, onAddSandbox }: {
  card: WorkshopCard
  token: string | null
  onBack: () => void
  onEdit?: () => void
  onAddSandbox: (id: string) => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [liked, setLiked] = useState(card.liked_by_me)
  const [likeCount, setLikeCount] = useState(card.like_count)
  const [submitting, setSubmitting] = useState(false)

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
      setComments(prev => [...prev, { id: d.id, body: newComment, author_name: '我', created_at: Date.now() }])
      setNewComment('')
    }
    setSubmitting(false)
  }

  const cardJson = card.card_json
  const cost = cardJson.cost as Record<string, number> | undefined
  const vp = cardJson.vp as number | undefined

  return (
    <div className="ws-detail">
      <button type="button" className="ws-back-btn" onClick={onBack}>← 返回</button>

      <div className="ws-detail-header">
        {card.art_url && <img className="ws-detail-art" src={card.art_url} alt={card.name} />}
        <div className="ws-detail-meta">
          <h2>{card.name}</h2>
          <div className="ws-badges-row">
            <span className="ws-badge">{card.card_type === 'minor' ? '小改进' : '职业'}</span>
            <span className="ws-author">by {card.author_name}</span>
          </div>
          {cost && Object.keys(cost).length > 0 && (
            <div className="ws-detail-cost">
              费用：{Object.entries(cost).map(([r, n]) => `${r} ×${n}`).join('、')}
            </div>
          )}
          {vp !== undefined && vp > 0 && (
            <div className="ws-detail-vp">{vp} 分</div>
          )}
          <p className="ws-detail-desc"><ResourceText text={card.description} /></p>

          <div className="ws-detail-actions">
            <button
              type="button"
              className={`ws-like-btn${liked ? ' liked' : ''}`}
              onClick={handleLike}
            >♥ {likeCount}</button>
            <button type="button" className="btn-secondary ws-btn-sm" onClick={() => onAddSandbox(card.id)}>
              加入沙盒
            </button>
            {onEdit && (
              <button type="button" className="btn-secondary ws-btn-sm" onClick={onEdit}>编辑</button>
            )}
          </div>
        </div>
      </div>

      {card.effect_dsl && (
        <div className="ws-detail-section">
          <h3>效果 DSL</h3>
          <pre className="ws-code">{JSON.stringify(card.effect_dsl, null, 2)}</pre>
          <p className="ws-code-note">此代码在浏览器中可见，在服务器端通过白名单验证后执行。</p>
        </div>
      )}

      <div className="ws-detail-section">
        <h3>评论 ({comments.length})</h3>
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
              placeholder="写评论…"
              rows={2}
            />
            <button type="button" className="btn-primary ws-btn-sm" onClick={handleComment} disabled={submitting}>
              发送
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card Editor ──────────────────────────────────────────────────────────────

const RESOURCE_KEYS = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle']

function CardEditor({ initial, token, onSaved, onCancel }: {
  initial?: WorkshopCard
  token: string | null
  onSaved: () => void
  onCancel: () => void
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

  const handleSave = async (publishStatus: 'draft' | 'published') => {
    setError('')
    if (!name.trim()) { setError('请填写卡牌名称'); return }
    if (!cardId.startsWith('CUSTOM_') || cardId.length < 8) { setError('ID 必须以 CUSTOM_ 开头且不能为空'); return }

    let effectDsl = null
    if (dslText.trim()) {
      try { effectDsl = JSON.parse(dslText) } catch { setError('效果 DSL JSON 格式错误'); return }
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
          effect_dsl: effectDsl,
          art_url: artUrl,
          status: publishStatus,
        }),
      })
      const d = await r.json()
      if (d.ok) {
        onSaved()
      } else {
        setError(d.error ?? '保存失败')
      }
    } catch {
      setError('网络错误')
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
        <h2>{initial ? '编辑卡牌' : '创建卡牌'}</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button type="button" className="btn-secondary ws-btn-sm ai-open-btn" onClick={() => setShowAi(true)}>
            ✦ AI 设计师
          </button>
          <button type="button" className="btn-link" onClick={onCancel}>取消</button>
        </div>
      </div>
      {artUrl && <img src={artUrl} alt="card art" className="ws-editor-art-preview" />}

      <div className="ws-editor-form">
        <div className="ws-form-row">
          <div className="form-field">
            <label>卡牌名称</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="木质厨房" />
          </div>
          <div className="form-field">
            <label>卡牌类型</label>
            <select value={cardType} onChange={e => setCardType(e.target.value as 'minor' | 'occupation')}>
              <option value="minor">小改进</option>
              <option value="occupation">职业</option>
            </select>
          </div>
        </div>

        <div className="form-field">
          <label>卡牌 ID（唯一标识，格式：CUSTOM_名称）</label>
          <input value={cardId} onChange={e => setCardId(e.target.value)} placeholder="CUSTOM_WoodKitchen" />
        </div>

        <div className="form-field">
          <label>描述</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="每次回家时，可以支付 1 粮食获得 3 食物" />
        </div>

        <div className="ws-form-row">
          <div className="form-field ws-field-sm">
            <label>分数 (VP)</label>
            <input type="number" value={vp} onChange={e => setVp(e.target.value)} min={0} max={20} />
          </div>
        </div>

        <div className="ws-cost-editor">
          <label>费用</label>
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
          <label>效果 DSL（JSON，可选）</label>
          <textarea
            value={dslText}
            onChange={e => setDslText(e.target.value)}
            rows={8}
            placeholder={'{\n  "onReturnHome": {\n    "optional": true,\n    "flow": [{ "action": "gain", "params": { "food": 2 } }]\n  }\n}'}
            className="ws-code-input"
          />
          <p className="ws-code-note">只允许白名单内的 action：gain / pay-resources / bonus-vp / exchange</p>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="ws-editor-actions">
          <button type="button" className="btn-secondary" onClick={() => handleSave('draft')} disabled={saving}>
            保存草稿
          </button>
          <button type="button" className="btn-primary" onClick={() => handleSave('published')} disabled={saving}>
            发布卡牌
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sandbox View ─────────────────────────────────────────────────────────────

function SandboxView({ token, onSelect, onStartGame }: {
  token: string | null
  onSelect: (c: WorkshopCard) => void
  onStartGame: (cardIds: string[], mode: 'single' | 'multi') => void
}) {
  const [cards, setCards] = useState<WorkshopCard[]>([])

  const reload = useCallback(() => {
    if (!token) return
    fetch(`${API_BASE}/api/workshop/sandbox`, { headers: authHeaders(token) })
      .then(r => r.json())
      .then(d => { if (d.ok) setCards(d.cards) })
      .catch(() => {})
  }, [token])

  useEffect(() => { reload() }, [reload])

  const handleRemove = async (workshopCardId: string) => {
    await fetch(`${API_BASE}/api/workshop/sandbox/${workshopCardId}`, {
      method: 'DELETE', headers: authHeaders(token),
    })
    reload()
  }

  return (
    <div className="ws-sandbox">
      <h2>我的沙盒</h2>
      {cards.length === 0 ? (
        <p className="rooms-empty">沙盒为空 — 在卡牌列表中点击"加入沙盒"添加卡牌</p>
      ) : (
        <>
          <ul className="ws-sandbox-list">
            {cards.map(c => (
              <li key={c.id} className="ws-sandbox-item">
                <span className="ws-card-tile-name" style={{ cursor: 'pointer' }} onClick={() => onSelect(c)}>{c.name}</span>
                <span className="ws-author">by {c.author_name}</span>
                <button type="button" className="btn-small ws-remove-btn" onClick={() => handleRemove(c.id)}>移除</button>
              </li>
            ))}
          </ul>
          <div className="ws-sandbox-btns">
            <button
              type="button"
              className="btn-primary"
              onClick={() => onStartGame(cards.map(c => c.id), 'single')}
            >
              单人测试
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onStartGame(cards.map(c => c.id), 'multi')}
            >
              多人测试（创建房间）
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
  const [view, setView] = useState<View>('browse')
  const [cards, setCards] = useState<WorkshopCard[]>([])
  const [selectedCard, setSelectedCard] = useState<WorkshopCard | null>(null)
  const [editCard, setEditCard] = useState<WorkshopCard | undefined>(undefined)
  const [sort, setSort] = useState<'recent' | 'popular'>('recent')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPageNum] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const prevView = useRef<View>('browse')

  const loadCards = useCallback(async (
    target: 'browse' | 'mine',
    sortVal: string,
    searchVal: string,
    pageVal: number,
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        sort: sortVal,
        search: searchVal,
        page: String(pageVal),
        status: target === 'mine' ? 'draft' : 'published',
      })
      const r = await fetch(`${API_BASE}/api/workshop/cards?${params}`, {
        headers: authHeaders(token),
      })
      const d = await r.json()
      if (d.ok) {
        setCards(prev => pageVal === 1 ? d.cards : [...prev, ...d.cards])
        setHasMore(d.hasMore)
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (view === 'browse' || view === 'mine') {
      loadCards(view, sort, search, page)
    }
  }, [view, sort, search, page, loadCards])

  // Reset page on sort/search change
  useEffect(() => {
    setPageNum(1)
    setCards([])
  }, [sort, search, view])

  const handleAddSandbox = async (cardDbId: string) => {
    if (!token) return
    await fetch(`${API_BASE}/api/workshop/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({ workshop_card_id: cardDbId }),
    })
    alert('已加入沙盒')
  }

  const handleLike = async (cardDbId: string) => {
    if (!token) return
    const r = await fetch(`${API_BASE}/api/workshop/cards/${cardDbId}/like`, {
      method: 'POST', headers: authHeaders(token),
    })
    const d = await r.json()
    if (d.ok) {
      setCards(prev => prev.map(c =>
        c.id === cardDbId
          ? { ...c, liked_by_me: d.liked, like_count: c.like_count + (d.liked ? 1 : -1) }
          : c
      ))
    }
  }

  const handleStartSandboxGame = async (cardIds: string[], mode: 'single' | 'multi') => {
    if (mode === 'multi') {
      // WS multiplayer: pass card IDs via URL param; createRoom will load them from DB
      setPage('game', { transport: 'ws', customCards: cardIds.join(',') })
      return
    }
    // Single-player HTTP: load custom cards server-side before starting
    try {
      const r = await fetch(`${API_BASE}/api/game/new-sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ customCardIds: cardIds }),
      })
      const d = await r.json()
      if (d.ok) {
        setPage('game')
      } else {
        alert('启动沙盒游戏失败：' + (d.error ?? '未知错误'))
      }
    } catch {
      alert('网络错误，请重试')
    }
  }

  const goBack = () => {
    setSelectedCard(null)
    setView(prevView.current === 'detail' ? 'browse' : prevView.current)
  }

  const selectCard = (c: WorkshopCard) => {
    prevView.current = view
    setSelectedCard(c)
    setView('detail')
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (view === 'detail' && selectedCard) {
    return (
      <div className="ws-page">
        <WorkshopNav view={view} setView={v => { setSelectedCard(null); setView(v) }} user={user} />
        <CardDetail
          card={selectedCard}
          token={token}
          onBack={goBack}
          onEdit={selectedCard.author_name === user?.displayName || selectedCard.author_name === user?.username
            ? () => { setEditCard(selectedCard); setView('editor') }
            : undefined}
          onAddSandbox={handleAddSandbox}
        />
      </div>
    )
  }

  // ── Editor view ──────────────────────────────────────────────────────────
  if (view === 'editor') {
    return (
      <div className="ws-page">
        <WorkshopNav view={view} setView={v => { setEditCard(undefined); setView(v) }} user={user} />
        <CardEditor
          initial={editCard}
          token={token}
          onSaved={() => { setEditCard(undefined); setView('mine'); setPageNum(1); setCards([]) }}
          onCancel={() => { setEditCard(undefined); setView(prevView.current) }}
        />
      </div>
    )
  }

  // ── Sandbox view ─────────────────────────────────────────────────────────
  if (view === 'sandbox') {
    return (
      <div className="ws-page">
        <WorkshopNav view={view} setView={setView} user={user} />
        <SandboxView token={token} onSelect={selectCard} onStartGame={handleStartSandboxGame} />
      </div>
    )
  }

  // ── Browse / Mine view ───────────────────────────────────────────────────
  return (
    <div className="ws-page">
      <WorkshopNav view={view} setView={setView} user={user} />

      <div className="ws-toolbar">
        <form onSubmit={e => { e.preventDefault(); setSearch(searchInput) }} className="ws-search">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="搜索卡牌…"
          />
          <button type="submit" className="btn-primary ws-btn-sm">搜索</button>
        </form>
        {view === 'browse' && (
          <div className="ws-sort">
            <button type="button" className={`ws-sort-btn${sort === 'recent' ? ' active' : ''}`} onClick={() => setSort('recent')}>最新</button>
            <button type="button" className={`ws-sort-btn${sort === 'popular' ? ' active' : ''}`} onClick={() => setSort('popular')}>最热</button>
          </div>
        )}
        {view === 'mine' && (
          <button type="button" className="btn-primary ws-btn-sm" onClick={() => { setEditCard(undefined); prevView.current = view; setView('editor') }}>
            + 创建卡牌
          </button>
        )}
      </div>

      {cards.length === 0 && !loading ? (
        <p className="rooms-empty">
          {view === 'mine' ? '你还没有创建卡牌' : '暂无已发布的卡牌'}
        </p>
      ) : (
        <div className="ws-card-grid">
          {cards.map(c => (
            <CardTile key={c.id} card={c} onSelect={selectCard} onLike={handleLike} mine={view === 'mine'} />
          ))}
        </div>
      )}

      {loading && <div className="ws-loading">加载中…</div>}
      {hasMore && !loading && (
        <button type="button" className="btn-secondary ws-load-more" onClick={() => setPageNum(p => p + 1)}>
          加载更多
        </button>
      )}
    </div>
  )
}

function WorkshopNav({ view, setView, user }: {
  view: View
  setView: (v: View) => void
  user: { username: string; displayName: string } | null
}) {
  return (
    <div className="ws-nav">
      <div className="ws-nav-left">
        <button type="button" className="btn-link ws-back-home" onClick={() => setPage('lobby')}>← 大厅</button>
        <h1>卡牌工坊</h1>
      </div>
      <div className="ws-nav-tabs">
        <button type="button" className={`ws-tab${view === 'browse' ? ' active' : ''}`} onClick={() => setView('browse')}>
          浏览
        </button>
        {user && (
          <button type="button" className={`ws-tab${view === 'mine' ? ' active' : ''}`} onClick={() => setView('mine')}>
            我的卡牌
          </button>
        )}
        {user && (
          <button type="button" className={`ws-tab${view === 'sandbox' ? ' active' : ''}`} onClick={() => setView('sandbox')}>
            沙盒
          </button>
        )}
      </div>
    </div>
  )
}
