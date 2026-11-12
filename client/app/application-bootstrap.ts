export async function startApplication(root: HTMLElement, start: () => Promise<void>): Promise<void> {
  let topLevel = false
  try { topLevel = window.top === window.self } catch { /* An unreadable context cannot start account UI. */ }
  if (topLevel) {
    await start()
    return
  }
  const link = document.createElement('a')
  link.textContent = 'Open Agricola'
  link.href = new URL(import.meta.env.BASE_URL, window.location.origin).href
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  root.replaceChildren(link)
}
