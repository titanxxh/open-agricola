import { showStandaloneLink, startWorkshopGame } from './bootstrap'

const root = document.getElementById('root')
if (!root) throw new Error('Workshop game root is missing')

void startWorkshopGame(root, async () => {
  const { initializeWorkshopGame } = await import('./initialize')
  await initializeWorkshopGame(root)
}).catch(() => showStandaloneLink(root))
