const archive = JSON.parse(document.getElementById('offline-cards').textContent)
const search = document.getElementById('offline-search')
const results = document.getElementById('offline-results')
const fold = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/\s+/g, ' ').replace(/\s+(?=\p{Script=Han})|(?<=\p{Script=Han})\s+/gu, '').trim()

const index = archive.entries.map((card) => ({
  card,
  identifiers: card.identifiers.map(fold),
  text: [card.number, ...Object.values(card.fields).map(field => field.text)].map(fold),
}))

function field(element, value) {
  element.append(value.text || archive.labels.missing)
  if (value.status === 'fallback') {
    element.lang = 'en'
    const marker = document.createElement('small')
    marker.lang = archive.locale
    marker.textContent = archive.labels.englishFallback
    element.append(' ', marker)
  }
}

function render() {
  const query = fold(search.value)
  const words = query.split(' ').filter(word => /[\p{L}\p{N}]/u.test(word))
  const exact = []
  const others = []
  for (const item of index) {
    if (query && item.identifiers.includes(query)) exact.push(item.card)
    else if (words.every(word => item.text.some(value => value.includes(word))
      || item.identifiers.some(value => value.includes(word)))) others.push(item.card)
  }

  const fragment = document.createDocumentFragment()
  for (const card of [...exact, ...others]) {
    const item = document.createElement('details')
    const heading = document.createElement('summary')
    heading.append(card.number + ' · ')
    if (card.fields.name) field(heading, card.fields.name)
    item.append(heading)
    for (const key of ['body', 'prerequisite', 'rules']) {
      if (!card.fields[key]) continue
      const paragraph = document.createElement('p')
      field(paragraph, card.fields[key])
      item.append(paragraph)
    }
    fragment.append(item)
  }
  if (!fragment.firstChild) {
    const empty = document.createElement('p')
    empty.textContent = archive.labels.noResults
    fragment.append(empty)
  }
  results.replaceChildren(fragment)
}

search.addEventListener('input', render)
render()
