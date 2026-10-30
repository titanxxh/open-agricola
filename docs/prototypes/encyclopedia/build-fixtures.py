"""Build a small, disposable UI dataset from the current production definitions."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
packs = {
    locale: json.loads(next((ROOT / 'public/i18n').glob(f'{locale}.*.json')).read_text())['messages']
    for locale in ['en', 'zh']
}
manifest = json.loads((ROOT / 'public/cards-manifest.json').read_text())
if isinstance(manifest, dict) and 'cards' in manifest:
    manifest = manifest['cards']
if isinstance(manifest, list):
    manifest = {card['id']: card for card in manifest}

def entry(id, kind, group, number, en, zh, body_en, body_zh, **kwargs):
    return dict(id=id, key=f'{kind}:{id}', kind=kind, group=group, number=number,
                nameEn=en, nameZh=zh, bodyEn=body_en, bodyZh=body_zh,
                rulesEn='', rulesZh='', costResources=[], costLabel='未列资源费用',
                points=None, bonus=False, upgrade=False, image='', terrain=[], **kwargs)

rows = []
ids = ['A004_Baseboards', 'A098_StableArchitect', 'Major_Fireplace1',
       'Major_Fireplace2', 'Major_Fireplace3', 'Major_Joinery', 'Major_CookingHearth1']
ids.append(next(id for id in manifest if id.startswith('M015_')))
for id in ids:
    card = manifest[id].get('meta', manifest[id])
    kind = card.get('type', card.get('kind', 'minor'))
    kind = card.get('playerActionCardType', kind)
    if id.startswith('Major_'): kind = 'major'
    group = '主要改良' if kind == 'major' else '泥沼' if card['deck'] == 'M' else card['deck']
    number = id if kind == 'major' else re.match(r'[A-EM]\d{3}', id)[0]
    fee = card.get('cost', {})
    paths = card.get('altCosts') or ([fee['fee']] if 'fee' in fee else [fee])
    labels = []
    resources = set()
    for path in paths:
        label = []
        for resource, amount in path.items():
            if isinstance(amount, (int, float)) and amount > 0:
                resources.add(resource)
                label.append(f"{amount} {packs['zh'].get('resources.'+resource, resource)}")
        if label: labels.append(' + '.join(label))
    en = packs['en'].get(f'cardFaces.{id}.name', card['name'])
    zh = packs['zh'].get(f'cardFaces.{id}.name', en)
    row = entry(id, kind, group, number, en, zh,
                packs['en'].get(f'cardFaces.{id}.description', '\n'.join(card.get('desc', []))),
                packs['zh'].get(f'cardFaces.{id}.description', ''))
    row.update(costResources=sorted(resources), costLabel=' 或 '.join(labels) or '未列资源费用',
               points=card.get('vp'), bonus=card.get('extraVp', False),
               upgrade=bool(card.get('returnCards') or fee.get('cards')),
               rulesEn=packs['en'].get(f'cardFaces.{id}.rules', ''),
               rulesZh=packs['zh'].get(f'cardFaces.{id}.rules', ''))
    rows.append(row)

for id, kind, en, zh in [('PR01','mother','Mother PR01','母亲 PR01'), ('PS01','father','Father PS01','父亲 PS01')]:
    def parent_text(locale):
        pack = packs[locale]
        if kind == 'mother': return pack[f'parentFaces.{id}.text']
        return '\n'.join(pack[f'parentFaces.{id}.rewards.{tier}.requirement'] + ' → ' + pack[f'parentFaces.{id}.rewards.{tier}.reward'] for tier in [1,2,3])
    row = entry(id,kind,'父母卡',id,en,zh,parent_text('en'),parent_text('zh'))
    row['image'] = f'/assets/parents/portrait/{id}.png'
    row['costLabel'] = '费用不适用'
    if kind == 'mother': row['points'] = -0.75
    rows.append(row)

id = 'moor-special-1-5-6-wood-hire'
rows.append(entry(id,'special','泥沼','特殊行动卡',
    ' / '.join(packs['en'][f'moor.specialActions.{action}'] for action in ['fell-trees','hiring-fair']),
    ' / '.join(packs['zh'][f'moor.specialActions.{action}'] for action in ['fell-trees','hiring-fair']),
    ' / '.join(packs['en'][f'moor.specialActions.{action}'] for action in ['fell-trees','hiring-fair']),
    ' / '.join(packs['zh'][f'moor.specialActions.{action}'] for action in ['fell-trees','hiring-fair'])))
rows[-1].update(image=f'/assets/moor/special-action-card/{id}.webp',costLabel='购卡费用不适用')
source = (ROOT/'shared/moor/start-cards.ts').read_text().split("id: 'moor-start-1'")[1].split("id: 'moor-start-2'")[0]
terrain = [dict(row=int(r),col=int(c),kind=k) for r,c,k in re.findall(r"t\((\d), (\d), '(forest|moor)'\)", source)]
rows.append(entry('moor-start-1','terrain','泥沼','地形 1','Starting layout 1','开局地形 1',
                  'Starting forest and moor positions.','初始森林和沼泽的位置。'))
rows[-1].update(terrain=terrain,costLabel='费用不适用')
actions = dict(winter='romantic-evening',spring='animal-and-fruit',summer='farmers-market',autumn='thanksgiving')
for season,action in actions.items():
    texts = {}
    for locale, pack in packs.items():
        keys = [key for key in pack if key.startswith(f'ui.seasons.boardCopy.{season}') and not key.endswith('Short')]
        texts[locale] = '\n'.join([pack[f'ui.seasons.flowSummary.{season}']] + [pack[key] for key in keys])
    rows.append(entry(f'through-the-seasons:{season}','season','四季',season,
                       packs['en'][f'ui.seasons.{season}'], packs['zh'][f'ui.seasons.{season}'],texts['en'],texts['zh']))
    rows[-1]['costLabel'] = '费用不适用'
(Path(__file__).parent/'fixtures.generated.ts').write_text("import type { Entry } from './types'\n\nexport const entries: Entry[] = "+json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(f'Wrote {len(rows)} representative entries; not the complete encyclopedia.')
