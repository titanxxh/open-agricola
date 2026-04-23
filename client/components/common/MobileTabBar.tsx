import { useContext } from 'react'
import { LocaleContext } from '../../contexts/LocaleContext'

type Tab = 'lobby' | 'workshop' | 'settings'

interface Props {
  current: Tab
  onNavigate: (t: Tab) => void
}

const FALLBACK_LABELS: Record<Tab, string> = {
  lobby: '大厅',
  workshop: '工坊',
  settings: '设置',
}

const TABS: { key: Tab; icon: string; i18nKey: string }[] = [
  { key: 'lobby', icon: '🏠', i18nKey: 'platform.tabLobby' },
  { key: 'workshop', icon: '🛠️', i18nKey: 'platform.tabWorkshop' },
  { key: 'settings', icon: '⚙️', i18nKey: 'platform.tabSettings' },
]

export function MobileTabBar({ current, onNavigate }: Props) {
  const ctx = useContext(LocaleContext)
  const labelFor = (tab: Tab, key: string): string => {
    if (!ctx) return FALLBACK_LABELS[tab]
    const translated = ctx.t(key)
    // If translation key is not found, t() returns the key itself; fall back to zh.
    return translated === key ? FALLBACK_LABELS[tab] : translated
  }
  return (
    <nav className="mobile-tab-bar" aria-label="主导航">
      {TABS.map((tab) => {
        const label = labelFor(tab.key, tab.i18nKey)
        return (
          <button
            key={tab.key}
            type="button"
            data-tab={tab.key}
            aria-label={label}
            className={`mobile-tab-bar__tab${current === tab.key ? ' is-active' : ''}`}
            onClick={() => onNavigate(tab.key)}
          >
            <span className="mobile-tab-bar__icon" aria-hidden>{tab.icon}</span>
            <span className="mobile-tab-bar__label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
