import { useLocale } from '../../contexts/LocaleContext'

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  return (
    <div className={`locale-switch ${className ?? ''}`}>
      <button className={locale === 'zh' ? 'active' : ''} onClick={() => setLocale('zh')}>中</button>
      <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>En</button>
    </div>
  )
}
