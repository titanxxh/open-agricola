import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { browserApiFetch } from '../services/browser-api'
import { parsePublicCardCatalog, publicCardReference } from '../../shared/contract/public-card-input'
import type { WorkshopPublicCardCatalogEntry, WorkshopPublicCardSnapshot } from '../../shared/contract/workshop-public-cards'
import { loadPublicSandboxInputs } from '../local-sandbox/public-access'
import { stashLocalSandboxConfig } from '../local-sandbox/workshop-launch'
import { workshopGameUrl } from '../workshop-game/bootstrap'
import '../styles/pages/workshop.css'

/** This entry never mounts author workspaces, AI tools or shared settings effects. */
export function PrereleaseWorkshopPage() {
  const { user } = useAuth(), { t } = useLocale()
  const [cards, setCards] = useState<WorkshopPublicCardCatalogEntry[]>([])
  const [after, setAfter] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [playerCount, setPlayerCount] = useState(2)
  const [decks, setDecks] = useState(['A', 'B', 'C', 'D', 'E'])
  const [browser, setBrowser] = useState(false)
  const [seasons, setSeasons] = useState(false), [moor, setMoor] = useState(false), [snake, setSnake] = useState(false)
  const [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [game, setGame] = useState<{ key: number; browser: boolean } | null>(null)
  const [fixed, setFixed] = useState<WorkshopPublicCardSnapshot[]>([])
  const frame = useRef<HTMLIFrameElement>(null), launch = useRef(0)
  const load = useCallback(async (cursor?: string) => {
    try {
      const response = await browserApiFetch(`/api/workshop/public-sandbox/v1/cards${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(t('platform.sandboxNetworkError'))
      const catalog = parsePublicCardCatalog(await response.json())
      setCards(previous => cursor ? [...previous, ...catalog.cards] : catalog.cards)
      setAfter(catalog.nextCursor)
    } catch { setError(t('platform.sandboxNetworkError')) } finally { setLoading(false) }
  }, [t])
  useEffect(() => { void Promise.resolve().then(() => load()) }, [load])
  const start = async () => {
    const current = ++launch.current
    setError(''); setGame(null); setLoading(true)
    try {
      const publicInputs = await loadPublicSandboxInputs(selected)
      if (current !== launch.current) return
      const config = { cards: [], playerCount, deckIds: decks, publicInputs, enableThroughTheSeasons: seasons, enableFarmersOfTheMoor: moor, enableSnakeOpening: snake }
      stashLocalSandboxConfig(config, user?.id ?? 'anon')
      if (!browser) {
        const response = await browserApiFetch('/api/game/new-sandbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          customCardIds: selected, publicCardBindings: publicInputs.snapshots.map(publicCardReference), playerCount, deckIds: decks,
          enableThroughTheSeasons: seasons, enableFarmersOfTheMoor: moor, enableSnakeOpening: snake,
        }) })
        const value: unknown = await response.json()
        if (!response.ok || !value || typeof value !== 'object' || !('ok' in value) || value.ok !== true) throw new Error(t('platform.publicSandboxPaused'))
      }
      if (current !== launch.current) return
      setFixed(publicInputs.snapshots); setGame({ key: current, browser })
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('platform.sandboxUnknownError')) } finally { setLoading(false) }
  }
  return <main className="ws-page prerelease-workshop-page" data-testid="prerelease-workshop">
    <header className="prerelease-workshop-panel">
    <h1>{t('platform.publicSandboxTitle')}</h1>
    <p>{t('platform.publicSandboxDescription')}</p>
    </header>
    {error && <p role="alert">{error}</p>}
    <fieldset className="prerelease-workshop-panel" disabled={loading}>
      <legend>{t('platform.sandbox')}</legend>
      <label>{t('platform.sandboxPlayerCount')} <select aria-label={t('platform.sandboxPlayerCount')} value={playerCount} onChange={event => setPlayerCount(Number(event.target.value))}>
        {[2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{t('platform.sandboxPlayerCountOption', { count })}</option>)}
      </select></label>
      <label>{t('platform.sandboxExecutionMode')} <select aria-label={t('platform.sandboxExecutionMode')} value={browser ? 'browser' : 'server'} onChange={event => setBrowser(event.target.value === 'browser')}>
        <option value="server">{t('platform.sandboxServerMode')}</option><option value="browser">{t('platform.sandboxBrowserMode')}</option>
      </select></label>
      <fieldset><legend>{t('platform.sandboxDecks')}</legend>{['A', 'B', 'C', 'D', 'E'].map(deck => <label key={deck}><input type="checkbox" checked={decks.includes(deck)} onChange={event => setDecks(previous => event.target.checked ? [...previous, deck] : previous.filter(value => value !== deck))} />{deck}</label>)}</fieldset>
      {([[seasons, setSeasons, 'platform.sandboxVariantThroughTheSeasons'], [moor, setMoor, 'platform.sandboxVariantFarmersOfTheMoor'], [snake, setSnake, 'platform.sandboxVariantSnakeOpening']] as const).map(([enabled, change, key]) =>
        <label key={key}><input type="checkbox" checked={enabled} onChange={event => change(event.target.checked)} />{t(key)}</label>)}
      <div>{cards.map(card => <label key={card.source.workshopCardId} style={{ display: 'block' }}>
        <input type="checkbox" checked={selected.includes(card.source.workshopCardId)} onChange={event => setSelected(previous => event.target.checked ? [...previous, card.source.workshopCardId] : previous.filter(id => id !== card.source.workshopCardId))} />{card.name}
      </label>)}</div>
      {after && <button type="button" onClick={() => { setLoading(true); void load(after) }}>{t('platform.loadMore')}</button>}
      <button type="button" className="btn-primary" disabled={selected.length > 16} onClick={() => { void start() }}>{t('platform.startSandbox')}</button>
    </fieldset>
    {fixed.map(snapshot => snapshot.input.art && <img key={snapshot.sha256} width={160} alt={String(snapshot.input.cardJson.name)} src={`data:${snapshot.input.art.contentType};base64,${snapshot.input.art.base64}`} />)}
    {game && <section><button type="button" onClick={() => { ++launch.current; setGame(null) }}>{t('platform.closeSandbox')}</button>
      <iframe ref={frame} key={game.key} className="sandbox-embed-frame" src={workshopGameUrl(game.browser, true)} title={t('platform.sandbox')} />
    </section>}
  </main>
}
