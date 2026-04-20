import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { useLocale } from '../../contexts/LocaleContext'

type LocaleSelectProps = {
  locale: Locale
  setLocale: (value: Locale) => void
  className?: string
}

export function LocaleSelect({ locale, setLocale, className }: LocaleSelectProps) {
  return (
    <select
      className={`locale-select${className ? ` ${className}` : ''}`}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label={t(locale, 'ui.languageSelectLabel')}
    >
      <option value="zh">{t(locale, 'ui.languageZh')}</option>
      <option value="en">{t(locale, 'ui.languageEn')}</option>
    </select>
  )
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  return <LocaleSelect locale={locale} setLocale={setLocale} className={className} />
}
