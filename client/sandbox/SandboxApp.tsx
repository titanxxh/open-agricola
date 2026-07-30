import { Suspense, lazy } from 'react'
import { AppShellLoadScreen } from '../app/AppShellLoadScreen'

const WorkshopPage = lazy(() =>
  import('../app/WorkshopPage').then(m => ({ default: m.WorkshopPage })),
)

export default function SandboxApp() {
  return (
    <Suspense fallback={<AppShellLoadScreen />}>
      <WorkshopPage />
    </Suspense>
  )
}
