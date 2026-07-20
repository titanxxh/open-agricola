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

const TABS: { key: Tab; i18nKey: string }[] = [
  { key: 'lobby', i18nKey: 'platform.tabLobby' },
  { key: 'workshop', i18nKey: 'platform.tabWorkshop' },
  { key: 'settings', i18nKey: 'platform.tabSettings' },
]

function TabIcon({ tab }: { tab: Tab }) {
  if (tab === 'lobby') {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9.5 20v-6h5v6" />
      </svg>
    )
  }
  if (tab === 'workshop') {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="m14 4 6 6-3 3-6-6 3-3ZM12.5 11.5 5 19l-2-2 7.5-7.5M4 5l5 5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </svg>
  )
}

export function MobileTabBar({ current, onNavigate }: Props) {
  const ctx = useContext(LocaleContext)
  const navigationLabel = ctx?.t('platform.mainNavigation') ?? '主导航'
  const labelFor = (tab: Tab, key: string): string => {
    if (!ctx) return FALLBACK_LABELS[tab]
    const translated = ctx.t(key)
    // If translation key is not found, t() returns the key itself; fall back to zh.
    return translated === key ? FALLBACK_LABELS[tab] : translated
  }
  return (
    <nav className="mobile-tab-bar" aria-label={navigationLabel}>
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
            <span className="mobile-tab-bar__icon" aria-hidden><TabIcon tab={tab.key} /></span>
            <span className="mobile-tab-bar__label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
