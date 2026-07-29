import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { useLocale } from '../contexts/LocaleContext'
import { getGameLoadProgress } from './game-load-progress'

export function AppShellLoadScreen() {
  const { t } = useLocale()
  const { percent, labelKey } = getGameLoadProgress('appShell')
  return <GameLoadScreen percent={percent} label={t(labelKey)} />
}
