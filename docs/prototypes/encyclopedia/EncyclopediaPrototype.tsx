import { useEffect, useMemo, useRef, useState } from 'react'
import { PlayerCard } from '../../../client/components/common/PlayerCard'
import { ParentCardFace } from '../../../client/components/common/ParentCardFace'
import { ResourceText } from '../../../client/components/common/ResourceText'
import { publicAssetUrl } from '../../../client/utils/public-asset-url'
import { entries } from './fixtures.generated'
import type { Entry } from './types'
import '../../../client/styles/pages/game.css'
import './prototype.css'

// Three disposable encyclopedia layouts on ?page=encyclopedia-prototype&variant=A|B|C.
const variantNames = { A: '卡面画廊', B: '目录对照', C: '正文浏览' }
type Variant = keyof typeof variantNames
type Context = 'library' | 'lobby' | 'game'
type Scenario = 'normal' | 'empty' | 'missing' | 'error' | 'unknown'
const kindNames: Record<Entry['kind'], string> = {
  minor: '小改良', occupation: '职业', major: '主要改良', mother: '母亲', father: '父亲',
  special: '特殊行动', terrain: '开局地形', season: '季节规则',
}
const resourceNames: Record<string, string> = { wood: '木材', clay: '黏土', reed: '芦苇', stone: '石料', food: '食物', grain: '谷物', vegetable: '蔬菜' }
const initialVariant = (): Variant => {
  const value = new URLSearchParams(location.search).get('variant')
  return value === 'B' || value === 'C' ? value : 'A'
}
const initialContext = (): Context => {
  const value = new URLSearchParams(location.search).get('context')
  return value === 'game' || value === 'lobby' ? value : 'library'
}
const iconNames: Record<string, string> = { ...resourceNames, stable: '畜栏', fence: '围栏', bake: '烤面包', field: '田' }
const searchText = (text: string) => text.toLowerCase().replaceAll('木头', '木材').replaceAll('马厩', '畜栏')
  .replace(/<([a-z_]+)>/g, (_, token: string) => token + ' ' + (iconNames[token] ?? token))

function Face({ entry, missing = false }: { entry: Entry; missing?: boolean }) {
  if (!missing && (entry.kind === 'minor' || entry.kind === 'occupation' || entry.kind === 'major')) {
    return <PlayerCard cardId={entry.id} cardType={entry.kind} locale="zh" enablePreview={false} />
  }
  if (!missing && (entry.id === 'PR01' || entry.id === 'PS01')) return <ParentCardFace id={entry.id} locale="zh" />
  return <article className={`ep-face ep-face-${entry.kind}`}>
    <span className="ep-kicker">{entry.number}</span><h3>{entry.nameZh}</h3>
    {entry.image && !missing ? <img src={publicAssetUrl(entry.image)} alt={entry.nameZh} /> : null}
    {entry.terrain.length > 0 ? <div className="ep-terrain" aria-label="开局地形布局">{Array.from({ length: 15 }, (_, index) => {
      const tile = entry.terrain.find(t => t.row === Math.floor(index / 5) && t.col === index % 5)
      return <span key={index} className={`ep-tile-${tile?.kind ?? 'empty'}`}>{tile?.kind === 'forest' ? '林' : tile ? '沼' : '·'}</span>
    })}</div> : null}
    {missing ? <div className="ep-no-art">图片暂缺 · 文字仍可查阅</div> : null}
    <ResourceText text={missing ? entry.bodyEn : entry.bodyZh || entry.bodyEn} />
  </article>
}

function EntryMeta({ entry }: { entry: Entry }) {
  return <div className="ep-meta"><span>{entry.group} · {kindNames[entry.kind]}</span><span>{entry.costLabel}</span>
    <span>{entry.points === null ? '未列固定分' : `${entry.points} 固定分`}{entry.bonus ? ' · 额外加分' : ''}{entry.upgrade ? ' · 可退牌升级' : ''}</span></div>
}

function Detail({ entry, missing, copied, share, close }: {
  entry: Entry; missing: boolean; copied: boolean; share: () => void; close: () => void
}) {
  return <div className="ep-detail-body">
    <div className="ep-detail-top"><span className="ep-kicker">{entry.number}</span><button type="button" onClick={close} aria-label="关闭详情">关闭 ×</button></div>
    <h2>{entry.nameZh}</h2><p className="ep-english">{entry.nameEn}</p><EntryMeta entry={entry} />
    <div className="ep-detail-face"><Face entry={entry} missing={missing} /></div>
    <h3>牌面文字</h3>{missing ? <p className="ep-fallback">本段中文暂缺，显示英文</p> : null}
    <div className="ep-rule-text"><ResourceText text={missing ? entry.bodyEn : entry.bodyZh || entry.bodyEn} /></div>
    {(entry.rulesZh || entry.rulesEn) ? <><h3>规则补充</h3><ResourceText text={entry.rulesZh || entry.rulesEn} /></> : null}
    <p className="ep-detail-note">百科展示牌面费用与分值；实际支付和得分以对局为准。</p>
    <div className="ep-detail-actions"><button type="button" className="ep-primary" onClick={share}>{copied ? '已复制单卡链接' : '复制单卡链接'}</button><button type="button" onClick={close}>返回结果</button></div>
  </div>
}

export default function EncyclopediaPrototype() {
  const [variant, setVariant] = useState(initialVariant)
  const [context, setContext] = useState(initialContext)
  const [open, setOpen] = useState(() => initialContext() === 'library')
  const [scenario, setScenario] = useState<Scenario>('normal')
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<string[]>([])
  const [kinds, setKinds] = useState<string[]>([])
  const [resources, setResources] = useState<string[]>([])
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [bonusOnly, setBonusOnly] = useState(false)
  const [unlisted, setUnlisted] = useState(false)
  const [upgradeOnly, setUpgradeOnly] = useState(false)
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('card'))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draft, setDraft] = useState('木房：第 1 行，第 3 列')
  const [updates, setUpdates] = useState(0)
  const entryButton = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const resultButton = useRef<HTMLButtonElement | null>(null)
  const detailDialog = useRef<HTMLDialogElement>(null)
  const filterDialog = useRef<HTMLDialogElement>(null)
  const scrollPosition = useRef(0)

  const changeVariant = (next: Variant) => {
    setVariant(next)
    const url = new URL(location.href); url.searchParams.set('variant', next); history.replaceState(null, '', url)
  }
  const cycleVariant = (direction: number) => {
    const all: Variant[] = ['A', 'B', 'C']
    changeVariant(all[(all.indexOf(variant) + direction + all.length) % all.length])
  }
  const openEntry = (entry: Entry, button?: HTMLButtonElement) => {
    if (button) resultButton.current = button
    setSelected(entry.key); setCopied(false)
    const url = new URL(location.href); url.searchParams.set('card', entry.key); history.pushState({ encyclopediaDetail: true }, '', url)
  }
  const closeEntry = () => {
    setSelected(null); setCopied(false)
    if (history.state?.encyclopediaDetail === true) history.back()
    else { const url = new URL(location.href); url.searchParams.delete('card'); history.replaceState(null, '', url) }
    requestAnimationFrame(() => resultButton.current?.focus())
  }
  const closeLibrary = () => {
    closeEntry(); setFiltersOpen(false); setOpen(false)
    requestAnimationFrame(() => { window.scrollTo(0, scrollPosition.current); entryButton.current?.focus() })
  }
  const openLibrary = () => {
    if (context === 'lobby') setContext('library')
    scrollPosition.current = window.scrollY; setOpen(true)
    requestAnimationFrame(() => searchInput.current?.focus())
  }
  const clearFilters = () => { setGroups([]); setKinds([]); setResources([]); setMin(''); setMax(''); setBonusOnly(false); setUnlisted(false); setUpgradeOnly(false) }
  const toggle = (values: string[], value: string, setter: (values: string[]) => void) => setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value])

  useEffect(() => {
    const pop = () => setSelected(new URLSearchParams(location.search).get('card'))
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const editing = event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (editing) return
        event.preventDefault(); cycleVariant(event.key === 'ArrowLeft' ? -1 : 1)
      }
      if (event.key === 'Escape' && selected && variant !== 'A' && !filtersOpen) closeEntry()
      if (event.key === 'Escape' && !selected && !filtersOpen && context !== 'library' && open) closeLibrary()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  useEffect(() => {
    if (context !== 'game') return
    const timer = window.setInterval(() => setUpdates(value => value + 1), 4000)
    return () => window.clearInterval(timer)
  }, [context])
  useEffect(() => {
    const dialog = detailDialog.current
    if (selected && variant === 'A' && dialog && !dialog.open) dialog.showModal()
    if ((!selected || variant !== 'A') && dialog?.open) dialog.close()
  }, [selected, variant])
  useEffect(() => {
    const dialog = filterDialog.current
    if (filtersOpen && dialog && !dialog.open) dialog.showModal()
    if (!filtersOpen && dialog?.open) dialog.close()
  }, [filtersOpen])

  useEffect(() => {
    if (selected && variant === 'C') requestAnimationFrame(() => document.getElementById(`ep-entry-${selected}`)?.scrollIntoView({ block: 'nearest' }))
  }, [selected, variant])

  const filtered = useMemo(() => {
    const words = searchText(query).trim().split(/\s+/).filter(Boolean)
    if (scenario === 'empty') return []
    return entries.filter(entry => {
      const body = searchText([entry.nameEn, entry.nameZh, entry.id, entry.number, entry.bodyEn, entry.bodyZh, entry.rulesEn, entry.rulesZh].join(' '))
      const numeric = entry.points !== null && (min === '' || entry.points >= Number(min)) && (max === '' || entry.points <= Number(max))
      return words.every(word => body.includes(word))
        && (!groups.length || groups.includes(entry.group))
        && (!kinds.length || kinds.includes(entry.kind))
        && (!resources.length || resources.some(resource => entry.costResources.includes(resource)))
        && ((min === '' && max === '' && !unlisted) || (numeric && (min !== '' || max !== '' || !unlisted)) || (unlisted && entry.points === null))
        && (!bonusOnly || entry.bonus) && (!upgradeOnly || entry.upgrade)
    }).sort((a,b) => {
      const rank = (entry: Entry) => {
        const q = searchText(query.trim())
        if (!q) return 4
        if ([entry.id, entry.number].some(id => id.toLowerCase() === q)) return 0
        if ([entry.nameEn,entry.nameZh].some(name => searchText(name) === q)) return 1
        if (words.some(word => searchText(entry.nameEn + ' ' + entry.nameZh).includes(word))) return 2
        return 3
      }
      return rank(a) - rank(b) || entries.indexOf(a) - entries.indexOf(b)
    })
  }, [query, groups, kinds, resources, min, max, bonusOnly, unlisted, upgradeOnly, scenario])
  const current = scenario === 'unknown' ? undefined : entries.find(entry => entry.key === selected)
  const activeFilters = groups.length + kinds.length + resources.length + Number(min !== '') + Number(max !== '') + Number(bonusOnly) + Number(unlisted) + Number(upgradeOnly)
  const share = async () => {
    if (!current) return
    const url = new URL(location.pathname, location.origin)
    url.searchParams.set('page', 'encyclopedia-prototype'); url.searchParams.set('variant', variant); url.searchParams.set('card', current.key)
    await navigator.clipboard.writeText(url.href); setCopied(true)
  }
  const chooseScenario = (value: string) => {
    if (value !== 'normal' && value !== 'empty' && value !== 'missing' && value !== 'error' && value !== 'unknown') return
    setScenario(value)
    if (value === 'missing' || value === 'unknown') { setSelected(entries[0].key); setOpen(true) }
  }

  const filters = <div className="ep-filter-fields">
    <div className="ep-section-head"><h3>筛选</h3><button type="button" onClick={clearFilters}>清空条件</button></div>
    <fieldset><legend>牌组或扩展</legend>{[...new Set(entries.map(entry => entry.group))].map(group => <label key={group}><input type="checkbox" checked={groups.includes(group)} onChange={() => toggle(groups,group,setGroups)} />{group}</label>)}</fieldset>
    <fieldset><legend>牌型</legend>{Object.entries(kindNames).map(([kind,label]) => <label key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={() => toggle(kinds,kind,setKinds)} />{label}</label>)}</fieldset>
    <fieldset><legend>印刷费用资源</legend>{Object.entries(resourceNames).map(([resource,label]) => <label key={resource}><input type="checkbox" checked={resources.includes(resource)} onChange={() => toggle(resources,resource,setResources)} />{label}</label>)}<label><input type="checkbox" checked={upgradeOnly} onChange={event => setUpgradeOnly(event.target.checked)} />可退牌升级</label><small>任一印刷费用方案含该资源即可</small></fieldset>
    <fieldset><legend>固定分值</legend><div className="ep-range"><input aria-label="最低固定分" inputMode="decimal" type="number" step="0.25" placeholder="最低" value={min} onChange={event => setMin(event.target.value)} /><span>至</span><input aria-label="最高固定分" inputMode="decimal" type="number" step="0.25" placeholder="最高" value={max} onChange={event => setMax(event.target.value)} /></div>
      <label><input type="checkbox" checked={unlisted} onChange={event => setUnlisted(event.target.checked)} />包含未列固定分</label><label><input type="checkbox" checked={bonusOnly} onChange={event => setBonusOnly(event.target.checked)} />标有额外加分</label><small>支持负数与小数；不计算对局得分</small></fieldset>
  </div>
  const detail = current ? <Detail entry={current} missing={scenario === 'missing'} copied={copied} share={() => void share()} close={closeEntry} />
    : <div className="ep-empty"><h2>未收录这条资料</h2><p>链接中的身份不在当前目录中。</p><button type="button" onClick={closeEntry}>返回百科</button></div>
  const empty = <div className="ep-empty"><h2>没有找到匹配资料</h2><p>试试卡名、编号，或减少筛选条件。</p><button type="button" onClick={() => { clearFilters(); setQuery(''); setScenario('normal') }}>清空查询与筛选</button></div>
  const resultHeading = <div className="ep-section-head"><p><strong>{filtered.length}</strong> 条样本结果 <span className="ep-muted">· 中英文同时检索</span></p><button type="button" className="ep-filter-button" onClick={() => setFiltersOpen(true)}>筛选{activeFilters ? ` (${activeFilters})` : ''}</button></div>
  const ledger = <div className="ep-ledger">{filtered.map(entry => <article key={entry.key} id={`ep-entry-${entry.key}`} className={selected === entry.key ? 'is-expanded' : ''}>
    <button type="button" className="ep-ledger-row" onClick={event => selected === entry.key ? closeEntry() : openEntry(entry,event.currentTarget)}><span className="ep-kicker">{entry.number}</span><strong>{entry.nameZh}</strong><span>{kindNames[entry.kind]}</span><span>{entry.costLabel}</span><span>{entry.points === null ? '—' : `${entry.points} 分`}</span><span>{selected === entry.key ? '收起 −' : '展开 +'}</span></button>
    {selected === entry.key ? detail : <p><ResourceText text={entry.bodyZh.split('\n')[0] || entry.bodyEn} /></p>}
  </article>)}</div>

  return <div className={`ep-root ep-variant-${variant}`}>
    <header className="ep-site-header"><a href="?page=encyclopedia-prototype" className="ep-brand">Open Agricola</a><nav><button type="button" onClick={() => { setContext('lobby'); setOpen(false) }}>大厅</button><button type="button" disabled>工坊</button><button type="button" className="is-current" onClick={() => { setContext('library'); setOpen(true) }}>卡牌百科</button><button type="button" disabled>设置</button></nav><span className="ep-guest">访客 · 无需登录</span></header>
    <div className="ep-prototype-notice">讨论原型 · 16 条代表资料 · A/B/C 比较布局，尚非完整百科</div>
    {context !== 'library' ? <main className="ep-host">
      <div className="ep-section-head"><h1>{context === 'game' ? '青禾的农场' : '游戏大厅'}</h1><button type="button" ref={entryButton} className="ep-primary" onClick={openLibrary}>查卡百科</button></div>
      {context === 'game' ? <><p>对局示意 · 正在选择建房位置 · 收到 {updates} 次模拟更新</p><label className="ep-draft-label">待提交的建房草稿<input aria-label="建房草稿" value={draft} onChange={event => setDraft(event.target.value)} /></label><div className="ep-farm">{Array.from({length:15},(_,i) => <div key={i}>{i === 0 || i === 5 ? '木房' : i === 7 ? '麦田' : '空地'}</div>)}</div><p>打开百科后，草稿保留，模拟更新继续。</p></> : <><div className="ep-lobby-card"><h2>继续你的农场</h2><p>双人局 · 第 6 回合</p><button type="button" onClick={() => { setContext('game'); setOpen(false) }}>查看对局示意</button></div><p>还没开始游戏，也可以从这里查卡。</p></>}
    </main> : null}
    {open ? <section className={context === 'library' ? 'ep-library' : 'ep-library ep-over-game'} aria-label="卡牌百科">
      <div className="ep-library-head"><div><span className="ep-kicker">CARD ENCYCLOPEDIA</span><h1>卡牌百科</h1><p>查找官方卡牌、父母卡与扩展规则。</p></div>{context !== 'library' ? <button type="button" onClick={closeLibrary}>返回{context === 'game' ? '对局' : '大厅'} ×</button> : null}</div>
      <div className="ep-search-row"><input ref={searchInput} type="search" aria-label="搜索卡牌" placeholder="搜索卡名、编号、牌面文字…" value={query} onChange={event => setQuery(event.target.value)} /><span>例如 A004 · fireplace · 木头</span></div>
      {scenario === 'error' ? <div role="alert" className="ep-empty"><h2>百科资料暂时无法加载</h2><p>你的查询和对局草稿已保留。</p><button type="button" className="ep-primary" onClick={() => setScenario('normal')}>重新加载</button>{context !== 'library' ? <button type="button" onClick={closeLibrary}>返回对局</button> : null}</div> : <>
        {variant === 'A' ? <div className="ep-gallery-layout"><aside className="ep-sidebar">{filters}</aside><div>{resultHeading}{filtered.length ? <div className="ep-gallery">{filtered.map(entry => <button type="button" className="ep-gallery-item" key={entry.key} onClick={event => openEntry(entry,event.currentTarget)} aria-label={`查看 ${entry.nameZh}`}><div className="ep-card-slot"><Face entry={entry} /></div><div className="ep-gallery-caption"><strong>{entry.nameZh}</strong><span>{entry.group} · {kindNames[entry.kind]}</span><span>{entry.costLabel}{entry.points !== null ? ` · ${entry.points} 分` : ''}</span></div></button>)}</div> : empty}</div></div> : null}
        {variant === 'B' ? <div className="ep-compare-layout"><div>{resultHeading}<p className="ep-filter-summary">{activeFilters ? `${activeFilters} 个筛选条件` : '全部牌组 · 全部牌型'}<button type="button" onClick={() => setFiltersOpen(true)}>编辑筛选</button></p>{filtered.length ? <div className="ep-result-list">{filtered.map(entry => <button type="button" className={selected === entry.key ? 'is-selected' : ''} key={entry.key} onClick={event => openEntry(entry,event.currentTarget)}><span className="ep-kicker">{entry.number}</span><strong>{entry.nameZh}</strong><EntryMeta entry={entry} /><span className="ep-list-arrow">›</span></button>)}</div> : empty}</div><aside className={`ep-comparison-detail ${selected ? 'has-selection' : ''}`}>{selected ? detail : <div className="ep-empty"><span className="ep-book-symbol">▤</span><h2>从左侧选一张卡</h2><p>结果与详情并排，连续查卡更方便。</p></div>}</aside></div> : null}
        {variant === 'C' ? <div className="ep-reading-layout"><div className="ep-reading-filter">{filters}</div>{resultHeading}{filtered.length ? ledger : empty}</div> : null}
        {variant === 'C' && selected && !current ? detail : null}
      </>}
    </section> : null}
    <dialog ref={detailDialog} className="ep-detail-dialog" onCancel={event => { event.preventDefault(); closeEntry() }}>{selected ? detail : null}</dialog>
    <dialog ref={filterDialog} className="ep-filter-dialog" onCancel={event => { event.preventDefault(); setFiltersOpen(false) }}><div className="ep-filter-dialog-top"><h2>筛选资料</h2><button type="button" onClick={() => setFiltersOpen(false)}>关闭 ×</button></div>{filters}<button type="button" className="ep-primary ep-filter-apply" onClick={() => setFiltersOpen(false)}>查看 {filtered.length} 条结果</button></dialog>
    {context !== 'game' ? <nav className="ep-platform-tabs" aria-label="手机主导航"><button type="button" onClick={() => { setContext('lobby'); setOpen(false) }}>大厅</button><button type="button" disabled>工坊</button><button type="button" className={open ? 'is-current' : ''} onClick={() => { setContext('library'); setOpen(true) }}>百科</button><button type="button" disabled>设置</button></nav> : null}
    <div className="ep-prototype-tools">
      <div className="ep-variant-switcher" aria-label="原型布局切换"><button type="button" aria-label="上一个布局" onClick={() => cycleVariant(-1)}>←</button><strong>{variant} · {variantNames[variant]}</strong><button type="button" aria-label="下一个布局" onClick={() => cycleVariant(1)}>→</button></div>
      <div className="ep-demo-controls"><label>入口<select aria-label="原型入口" value={context} onChange={event => { const next = event.target.value; if (next !== 'library' && next !== 'lobby' && next !== 'game') return; setContext(next); setOpen(next === 'library'); closeEntry() }}><option value="library">独立百科</option><option value="lobby">大厅示意</option><option value="game">对局示意</option></select></label><label>场景<select aria-label="原型场景" value={scenario} onChange={event => chooseScenario(event.target.value)}><option value="normal">正常</option><option value="empty">无结果</option><option value="missing">缺图与英文回退</option><option value="error">加载失败</option><option value="unknown">未收录</option></select></label>
      <details><summary>原型状态</summary><pre>{JSON.stringify({variant,context,open,query,groups,kinds,resources,min,max,bonusOnly,unlisted,upgradeOnly,selected,scenario,draft,updates},null,2)}</pre></details></div>
    </div>
  </div>
}
