import type { Locale } from '../../../shared/i18n'
import { getLoadedLocales, t } from '../../../shared/i18n'
import { useLocale } from '../../contexts/LocaleContext'
import { SelectButton } from './SelectButton'
import { getLanguageManifest } from '../../services/language-pack'

type LocaleSelectProps = {
  locale: Locale
  setLocale: (value: Locale) => void
  className?: string
}

function LocaleSelect({ locale, setLocale, className }: LocaleSelectProps) {
  return (
    <SelectButton<Locale>
      value={locale}
      onChange={setLocale}
      options={getLanguageManifest()?.languages.map(language => ({ value: language.id, label: language.name })) ?? getLoadedLocales().map(id => ({ value: id, label: new Intl.DisplayNames([id], { type: 'language' }).of(id) ?? id }))}
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
