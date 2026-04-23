import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { useLocale } from '../../contexts/LocaleContext'
import { SelectButton } from './SelectButton'

type LocaleSelectProps = {
  locale: Locale
  setLocale: (value: Locale) => void
  className?: string
}

export function LocaleSelect({ locale, setLocale, className }: LocaleSelectProps) {
  return (
    <SelectButton<Locale>
      value={locale}
      onChange={setLocale}
      options={[
        { value: 'zh', label: t(locale, 'ui.languageZh') },
        { value: 'en', label: t(locale, 'ui.languageEn') },
      ]}
      size="sm"
      ariaLabel={t(locale, 'ui.languageSelectLabel')}
      className={className}
    />
  )
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  return <LocaleSelect locale={locale} setLocale={setLocale} className={className} />
}
