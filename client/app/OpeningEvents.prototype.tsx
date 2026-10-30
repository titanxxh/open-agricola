// Three LE layouts on the existing lobby/game routes. Fixed UI replies, no rule engine or mutations.
import { useEffect, useState, type ReactNode } from 'react'
import { BrandMark } from '../components/common/BrandMark'
import './OpeningEvents.prototype.css'

type Variant = 'A' | 'B' | 'C'
type Mode = 'off' | 'random' | 'specific'
const variants: Variant[] = ['A', 'B', 'C']
const variantNames = { A: '顶部入口', B: '常驻规则卡', C: '随结算展开' }
const events = {
  LE01: { name: '宠物爱好者', english: 'Pet Lovers', short: '木／砖／石屋，整屋可养 1／2／3 只不同种宠物。', body: '额度按整栋房屋计算，不按房间叠加。所有事件宠物放在最左列最下方的普通宠物房。与 Animal Tamer 选择一套完整安置规则，不能混用。', example: '两间石屋：事件可养羊、野猪、牛各 1 只；Animal Tamer 可按每房 1 只，养 2 只同种动物。' },
  LE02: { name: '丰收', english: 'Good Harvest', short: '每次供养，全家所需食物总额减 1，最低为 0。', body: '先结算其他家庭成员修正，再将供养总额减 1。每位玩家每次供养只减一次。供养为 0 时仍保留供养阶段；取暖费用另算。', example: '其他修正后的家庭供养为 3 食物，事件减 1，实际需付 2 食物。' },
  LE03: { name: '流浪木匠', english: 'Wandering Carpenters', short: '打出发展卡时，木材费用减 1，最低为 0。', body: '包括由卡牌提供的打出发展卡机会，并与其他折扣或替代费用共同结算。免费打出时不会额外返还木头；独立支付仍保留。', example: '印刷费用 3 木，Lumber Mill 减 1，事件再减 1，实际支付 1 木。' },
  LE04: { name: '求知欲', english: 'Inquisitive Minds', short: '打出职业时免除学费，其他独立费用仍需支付。', body: '适用于行动格和卡牌提供的职业学费。给其他玩家的独立支付、职业牌自身的额外费用或返还资源，不因免学费而取消。', example: 'Lover 在第 10 回合打出：学费为 0，牌面额外费用 4 食物仍需支付。' },
}
type EventId = keyof typeof events
type Scene = 'create' | 'waiting' | 'draft' | 'solo' | 'parents' | 'work' | 'animals' | 'feeding' | 'improvement' | 'occupation' | 'replay'
const scenes: Array<{ id: Scene; name: string }> = [
  { id: 'create', name: '建局' }, { id: 'waiting', name: '等待房' },
  { id: 'draft', name: '轮抽首帧' }, { id: 'solo', name: '单人选牌首帧' }, { id: 'parents', name: '父母牌首帧' },
  { id: 'work', name: '对局中' }, { id: 'animals', name: '宠物安置' }, { id: 'feeding', name: '供养' },
  { id: 'improvement', name: '发展费用' }, { id: 'occupation', name: '职业学费' }, { id: 'replay', name: '回放' },
]
const eventIds: EventId[] = ['LE01', 'LE02', 'LE03', 'LE04']
const params = new URLSearchParams(window.location.search)
const initialScene = scenes.find(s => s.id === params.get('scene'))?.id ?? 'create'
const initialVariant = variants.find(v => v === params.get('variant')) ?? 'A'
function sceneEvent(scene: Scene): EventId {
  if (scene === 'feeding' || scene === 'replay') return 'LE02'
  if (scene === 'improvement') return 'LE03'
  if (scene === 'occupation') return 'LE04'
  return 'LE01'
}

export default function OpeningEventsPrototypePage() {
  const [variant, setVariant] = useState<Variant>(initialVariant)
  const [scene, setScene] = useState<Scene>(initialScene)
  const [mode, setMode] = useState<Mode>(initialScene === 'create' ? 'off' : 'random')
  const [chosen, setChosen] = useState<EventId>(sceneEvent(initialScene))
  const [event, setEvent] = useState<EventId | null>(initialScene === 'create' || initialScene === 'waiting' ? null : sceneEvent(initialScene))
  const [detail, setDetail] = useState(false)
  const [tab, setTab] = useState<'action' | 'rules' | 'log'>('action')
  const [zero, setZero] = useState(false)
  const [feedingCase, setFeedingCase] = useState<'family' | 'reduced' | 'alreadyZero'>('family')
  const [scheme, setScheme] = useState<'event' | 'tamer' | 'mixed'>('event')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [extra, setExtra] = useState(false)

  function updateUrl(nextVariant: Variant, nextScene: Scene) {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', nextVariant)
    url.searchParams.set('scene', nextScene)
    url.searchParams.set('page', nextScene === 'create' || nextScene === 'waiting' ? 'lobby' : 'game')
    window.history.replaceState(null, '', url)
  }
  function switchVariant(next: Variant) { setVariant(next); updateUrl(next, scene) }
  function switchScene(next: Scene) {
    setScene(next); setReceipt(null); setDetail(false); setTab('action'); setZero(false); setFeedingCase('family'); setScheme('event'); setExtra(false)
    setMode(next === 'create' ? 'off' : 'random'); setEvent(next === 'create' || next === 'waiting' ? null : sceneEvent(next)); setChosen(sceneEvent(next))
    updateUrl(variant, next)
  }
  function cycle(direction: number) {
    const next = variants[(variants.indexOf(variant) + direction + variants.length) % variants.length]
    if (next) switchVariant(next)
  }
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); cycle(e.key === 'ArrowRight' ? 1 : -1) }
      if (e.key === 'Escape') setDetail(false)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const lobby = scene === 'create' || scene === 'waiting'
  const opening = scene === 'draft' || scene === 'solo' || scene === 'parents'
  const current = event ? events[event] : null
  const publicChoice = mode === 'off' ? '关闭' : mode === 'random' ? '随机，开局公开' : `${events[chosen].name} · ${chosen}`
  const eventEntry = <button className="lep-event-chip" onClick={() => setDetail(true)}>本局事件 · {current ? current.name : '未启用'} <span>查看规则</span></button>
  const eventCard = <section className="lep-event-card"><div className="lep-eyebrow">整局适用 · 全体玩家</div><h2>{current ? current.name : '未启用开局事件'}</h2>{current && event && <><div className="lep-muted">{current.english} · {event}</div><p>{current.short}</p><p className="lep-small">{current.body}</p><div className="lep-example">{current.example}</div><button onClick={() => setExtra(!extra)} aria-expanded={extra}>已有卡牌与扩展如何组合</button>{extra && <p className="lep-small">{event === 'LE01' ? 'Domestician Expert 的额外养羊区独立使用；Milking Place 禁止房屋动物时仍不能养。启用 Farmers of the Moor 后，马也可作为一种宠物，额度仍为 1／2／3。' : event === 'LE02' ? 'Child’s Toy、Old Miser 等先修正家庭供养，事件最后对总额减 1。标准单人同样对供养总额减 1。' : event === 'LE03' ? '与 Lumber Mill、Wood Expert 等按同一费用报价结算。免费打出不会返木，独立支付不减。' : 'Private Teacher 的职业学费可免；Puppeteer 向对手支付食物、Lover 的额外费用及 Forestry Studies 返还木头仍保留。'}</p>}</>}</section>

  function lines(rows: Array<[string, string]>) {
    return <dl className="lep-lines">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  }
  const contribution = scene === 'feeding' ? feedingCase === 'alreadyZero' ? '本局事件 · 丰收：本次没有进一步减少食物' : '本局事件 · 丰收：供养所需食物减少 1' : scene === 'improvement' ? zero ? '本局事件 · 流浪木匠：本次节省 0 木' : '本局事件 · 流浪木匠：木材费用减少 1' : scene === 'occupation' ? '本局事件 · 求知欲：免除职业学费' : scheme === 'tamer' ? '采用 Animal Tamer 的完整安置方案，未叠加事件额度。' : '本局事件 · 宠物爱好者：采用整屋宠物规则'
  const hint = scene === 'feeding' ? '供养减免已计入下方应付总额。' : scene === 'improvement' ? '所选支付方案已包含事件与卡牌折扣。' : scene === 'occupation' ? '学费为 0；牌面独立费用仍保留。' : scene === 'animals' ? '整屋选择一套合法方案，不能将两套额度相加。' : '随时查看本局事件；当前行动没有额外结算。'
  let action: ReactNode
  if (scene === 'animals') {
    action = <><h2>安置动物</h2><p className="lep-muted">两间石屋 · 已打出 Animal Tamer · 等待确认</p><div className="lep-options" role="group" aria-label="完整安置方案">{[
      { id: 'event', title: '事件方案', text: '羊、野猪、牛各 1 只，放在 B1。' },
      { id: 'tamer', title: 'Animal Tamer 方案', text: '羊 2 只，A1、B1 各 1 只。' },
      { id: 'mixed', title: '混合额度示例', text: '羊 2 只、野猪 1 只，不构成合法方案。' },
    ].map(item => <button key={item.id} aria-pressed={scheme === item.id} onClick={() => { if (item.id === 'event' || item.id === 'tamer' || item.id === 'mixed') setScheme(item.id); setReceipt(null) }}><strong>{item.title}</strong><span>{item.text}</span></button>)}</div><Farm scheme={scheme} animals /><p className={scheme === 'mixed' ? 'lep-error' : 'lep-notice'} role="status">{scheme === 'event' ? '3 只不同种宠物，实际都在 B1。计为 1 个有动物的农场格。' : scheme === 'tamer' ? '2 只羊按真实房间分放。计为 2 个有动物的农场格。' : '不能把事件与 Animal Tamer 的额度混合。请选择一套完整方案。'}</p><button className="lep-primary" disabled={scheme === 'mixed' || receipt !== null} onClick={() => setReceipt(scheme === 'event' ? '已安置：B1 羊、野猪、牛各 1。使用事件方案，1 个有动物的农场格。' : '已安置：A1 羊 1、B1 羊 1。使用 Animal Tamer，2 个有动物的农场格。')}>确认安置</button></>
  } else if (scene === 'feeding') {
    const empty = feedingCase !== 'family'
    action = <><h2>供养家人</h2><p className="lep-muted">收获 · 玩家小麦 · 持有 5 食物</p><label className="lep-mode-select">供养示例 <select aria-label="供养示例" value={feedingCase} onChange={e => { if (e.target.value === 'family' || e.target.value === 'reduced' || e.target.value === 'alreadyZero') setFeedingCase(e.target.value); setReceipt(null) }}><option value="family">其他修正后 3 食物，事件减到 2</option><option value="reduced">1 食物减到 0</option><option value="alreadyZero">原本已是 0 食物</option></select></label>{lines(feedingCase === 'alreadyZero' ? [['其他家庭修正后的所需食物', '0 食物'], ['本局事件 · 丰收', '无进一步减少'], ['本次应付', '0 食物']] : feedingCase === 'reduced' ? [['其他家庭修正后的所需食物', '1 食物'], ['本局事件 · 丰收', '−1 食物'], ['本次应付', '0 食物']] : [['2 名成人 + 1 名新生儿', '5 食物'], ['Child’s Toy', '+1 食物'], ['Old Miser', '−3 食物'], ['本局事件 · 丰收', '−1 食物'], ['本次应付', '2 食物']])}<p className="lep-notice">{feedingCase === 'alreadyZero' ? '所需食物原本已为 0，事件本次没有产生节省。仍需完成供养步骤。' : empty ? '本次无需食物支付，供养步骤仍需完成。事件实际减少了 1 食物。' : '事件对全家总额减一次。预览与确认支付显示同一份报价。'}取暖另行结算。</p><button className="lep-primary" disabled={receipt !== null} onClick={() => setReceipt(feedingCase === 'alreadyZero' ? '已完成供养 · 实付 0 食物 · 事件减少 0 食物 · 供养流程继续' : empty ? '已完成供养 · 实付 0 食物 · 事件减少 1 食物 · 供养流程继续' : '已完成供养 · 实付 2 食物 · 食物 5 → 3 · 事件减少 1 食物')}>{empty ? '完成供养（0 食物）' : '支付 2 食物并完成供养'}</button></>
  } else if (scene === 'improvement') {
    action = <><h2>支付发展费用</h2><p className="lep-muted">选定发展卡 · 持有 4 木</p><label className="lep-check"><input type="checkbox" checked={zero} onChange={e => { setZero(e.target.checked); setReceipt(null) }} />查看免费打出与独立支付</label>{lines(zero ? [['打出发展卡', '免费'], ['取得本次机会的独立支付', '1 食物'], ['本局事件 · 流浪木匠', '无可减少的木材费用'], ['本次应付', '1 食物']] : [['牌面发展费用', '3 木'], ['卡牌 · Lumber Mill', '−1 木'], ['本局事件 · 流浪木匠', '−1 木'], ['本次应付', '1 木']])}<p className="lep-notice">{zero ? '免费打出不会返还木头，独立支付仍需付清。事件本次没有产生资源节省。' : '此处展示当前选定的支付方案；其他替代方案同样应先取得完整报价。'}</p><button className="lep-primary" disabled={receipt !== null} onClick={() => setReceipt(zero ? '已打出发展卡 · 独立支付 1 食物 · 没有返还木头 · 事件节省 0 木' : '已打出发展卡 · 实付 1 木 · 木 4 → 3 · Lumber Mill 减少 1 木 · 事件减少 1 木')}>{zero ? '支付 1 食物并打出' : '支付 1 木并打出'}</button></>
  } else if (scene === 'occupation') {
    action = <><h2>打出职业 · Lover</h2><p className="lep-muted">第 10 回合 · 持有 6 食物</p>{lines([['本次职业学费', '免除（原需 1 食物）'], ['来源 · 本局事件', '求知欲'], ['Lover 牌面额外费用', '4 食物'], ['本次应付', '4 食物']])}<p className="lep-notice">免学费仍需完成打出职业的流程。Lover 的额外 4 食物属于独立费用，不在学费减免范围。</p><button className="lep-primary" disabled={receipt !== null} onClick={() => setReceipt('已打出 Lover · 实付 4 食物 · 食物 6 → 2 · 本局事件免除学费，独立费用已支付')}>支付 4 食物并打出职业</button></>
  } else if (opening) {
    action = <><h2>{scene === 'draft' ? '轮抽 · 第 1 轮' : scene === 'solo' ? '单人开局 · 选择手牌' : '开局 · 选择父母牌'}</h2><p>{current ? '本局事件已公开，选择前可阅读完整规则。' : '本局未启用事件，按既有流程选择。'}</p><div className="lep-hand">{(scene === 'parents' ? ['父母牌方案一', '父母牌方案二'] : ['职业牌', '次要发展', '职业牌', '次要发展']).map((card, index) => <button key={index} onClick={() => setReceipt(`已选中${card} ${index + 1}。演示到此，未发送真实选择。`)}><span>{card}</span><strong>{index + 1}</strong><small>点选此牌</small></button>)}</div><p className="lep-muted">{scene === 'solo' ? '单人局不经过多人等待房，第一帧选牌前即可查看事件。' : scene === 'parents' ? '事件与父母牌选择同时可见，不等到工作阶段。' : '最后一位玩家确认颜色后进入本帧，轮抽前即可查看事件。'}</p></>
  } else if (scene === 'replay') {
    action = <><h2>回放 · 第 4 回合收获</h2><p className="lep-muted">小麦 · 记录 26 / 41</p>{lines([['家庭供养，其他修正后', '3 食物'], ['本局事件 · 丰收', '−1 食物'], ['已支付', '2 食物']])}<p className="lep-notice">本条结算中的事件贡献：所需食物减少 1。</p><details open><summary>结算来源</summary><p>本局事件列在事件贡献中。Child’s Toy、Old Miser 等单卡效果仍归各自卡牌；事件不会混入单卡收益。</p></details><div className="lep-controls"><button onClick={() => setReceipt('已切换到前一条：小麦取得 2 谷物，没有事件结算。')}>上一条记录</button><button onClick={() => setReceipt('已切换到后一条：收获继续，事件仍为丰收。')}>下一条记录</button></div></>
  } else {
    action = <><h2>第 4 回合 · 工作阶段</h2><p className="lep-muted">轮到小麦 · 还有 1 名家庭成员可派出</p><div className="lep-actions">{[['森林', '3 木'], ['谷物利用', '播种 / 烤面包'], ['发展', '打出发展卡'], ['课程', '打出职业'], ['扩建', '房间 / 马厩'], ['集市', '起始玩家 / 次发']].map(([name, value]) => <button key={name} onClick={() => name === '发展' ? switchScene('improvement') : name === '课程' ? switchScene('occupation') : setReceipt(`演示选择：${name}。当前事件没有新增支付。`)}><strong>{name}</strong><span>{value}</span></button>)}</div><h3>小麦的农场</h3><Farm scheme="event" animals={false} /></>
  }

  const log = <section className="lep-panel"><h2>对局记录</h2><ol className="lep-log"><li>{current ? `开局事件已公开：${current.name}` : '本局未启用开局事件'}</li>{receipt && <li>{receipt}</li>}</ol>{receipt && ['animals', 'feeding', 'improvement', 'occupation'].includes(scene) && <details><summary>本条来源</summary><p>{contribution}</p><p className="lep-muted">单卡效果分别显示，不将事件计入单卡收益。</p></details>}</section>
  return <div className={`lep-root lep-variant-${variant}`}>
    <aside className="lep-lab" aria-label="原型控制"><strong>LE 交互草图 · 模拟数据</strong><label>场景 <select value={scene} onChange={e => { const next = scenes.find(s => s.id === e.target.value); if (next) switchScene(next.id) }}>{scenes.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>{!lobby && <label>演示事件 <select value={event ?? 'off'} onChange={e => { const next = eventIds.find(id => id === e.target.value); setEvent(next ?? null); setDetail(false); setReceipt(null) }}>{!['animals', 'feeding', 'improvement', 'occupation', 'replay'].includes(scene) && <option value="off">未启用</option>}{eventIds.filter(id => !['animals', 'feeding', 'improvement', 'occupation', 'replay'].includes(scene) || id === sceneEvent(scene)).map(id => <option value={id} key={id}>{events[id].name}</option>)}</select></label>}<small>仅比较界面；按钮使用固定演示回复。</small></aside>
    <div className="lep-shell">
      <header className="lep-header"><BrandMark title="Open Agricola" titleAs="h1" /><span className="lep-user">小麦 · {lobby ? '游戏大厅' : scene === 'replay' ? '回放' : scene === 'solo' ? '单人对局' : '2 人对局'}</span>{!lobby && variant === 'A' && eventEntry}</header>
      {lobby ? <div className="lep-lobby"><section className="lep-panel"><h2>{scene === 'create' ? '创建对局' : '等待玩家确认颜色'}</h2>{scene === 'create' ? <><div className="lep-config"><label>人数 <select defaultValue="2"><option>2</option><option>3</option><option>4</option></select></label><label><input type="checkbox" defaultChecked />同时轮抽</label><label><input type="checkbox" />Parent Cards</label><label><input type="checkbox" />Farmers of the Moor</label></div><h3>开局全局事件</h3><p className="lep-muted">全体玩家共用一张事件，整局生效。</p>{variant === 'A' ? <label className="lep-mode-select">事件选择 <select aria-label="事件模式" value={mode} onChange={e => { if (e.target.value === 'off' || e.target.value === 'random' || e.target.value === 'specific') setMode(e.target.value) }}><option value="off">关闭（默认）</option><option value="random">随机一张</option><option value="specific">指定一张</option></select></label> : <div className={`lep-modes ${variant === 'C' ? 'lep-mode-list' : ''}`}>{(['off', 'random', 'specific'] satisfies Mode[]).map(m => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}><strong>{m === 'off' ? '关闭' : m === 'random' ? '随机一张' : '指定一张'}</strong><span>{m === 'off' ? '按原规则开局' : m === 'random' ? '四张等概率，开局公开' : '选择一张，本局固定'}</span></button>)}</div>}{mode === 'specific' && <label className="lep-mode-select">指定事件 <select value={chosen} onChange={e => { const id = eventIds.find(id => id === e.target.value); if (id) setChosen(id) }}>{eventIds.map(id => <option value={id} key={id}>{events[id].name} · {id}</option>)}</select></label>}<p className="lep-notice">{mode === 'off' ? '本局不启用开局事件。' : mode === 'random' ? '创建房间时固定随机结果，等待房不公开。开局前的刷新、重连不会重新抽取。' : events[chosen].short}</p><button className="lep-primary" onClick={() => { setScene('waiting'); setEvent(null); updateUrl(variant, 'waiting') }}>创建对局（演示）</button></> : <><div className="lep-players"><div><b>小麦</b><span>红色 · 已确认</span></div><div><b>牧场</b><span>蓝色 · 待确认</span></div></div>{lines([['开局事件配置', publicChoice], ['轮抽', '启用'], ['人数', '2 人']])}{mode === 'random' && <p className="lep-notice">事件将在开局后公开。当前不显示事件名称、效果或结算预览。</p>}<button className="lep-primary" onClick={() => { setEvent(mode === 'off' ? null : mode === 'specific' ? chosen : 'LE02'); setScene('draft'); updateUrl(variant, 'draft') }}>确认最后一个颜色并开局（演示）</button><button className="lep-back" onClick={() => switchScene('create')}>返回建局</button></>}</section><aside className="lep-panel"><h3>{variant === 'C' ? '配置确认单' : '开局事件是什么？'}</h3>{variant === 'C' && lines([['事件配置', publicChoice], ['事件公开', '开局第一帧'], ['同配置随机新局', '独立抽取，可能重复']])}<p className="lep-small">只启用四张已出版 LE 事件之一。指定模式在等待房显示配置；随机模式在开局前不显示结果。</p></aside></div> : <>
        {opening && <section className="lep-opening"><div className="lep-eyebrow">开局 · 全体玩家可见</div><h2>{current ? `本局事件：${current.name}` : '本局未启用开局事件'}</h2><p>{current ? current.short : '按既有规则进行。'}</p>{current && <button onClick={() => setDetail(true)}>选择前阅读完整规则</button>}</section>}
        {variant === 'C' && <nav className="lep-tabs" aria-label="对局信息"><button aria-pressed={tab === 'action'} onClick={() => setTab('action')}>当前行动</button><button aria-pressed={tab === 'rules'} onClick={() => setTab('rules')}>本局规则 · {current?.name ?? '未启用事件'}</button><button aria-pressed={tab === 'log'} onClick={() => setTab('log')}>结算记录</button></nav>}
        <div className="lep-game-layout"><main className="lep-game-main">{variant === 'C' && tab === 'rules' ? eventCard : variant === 'C' && tab === 'log' ? log : <><section className="lep-panel">{variant === 'C' && <div className="lep-context"><strong>{current ? current.name : '未启用事件'}</strong><p>{current ? hint : '本局按原规则结算。'}</p><button onClick={() => setTab('rules')}>查看本局规则</button></div>}{action}{receipt && <p className="lep-receipt" role="status">{receipt}</p>}</section>{variant !== 'C' && log}</>}</main><aside className="lep-game-side">{variant === 'B' && <details className="lep-sticky-card" open><summary>本局事件 · {current?.name ?? '未启用'}</summary>{eventCard}</details>}<section className="lep-panel"><h3>玩家</h3>{lines(scene === 'solo' ? [['小麦', '单人对局']] : [['小麦 · 当前玩家', '2 人 / 5 食物'], ['牧场', '2 人 / 3 食物']])}<p className="lep-muted lep-small">{opening ? '开局选择阶段' : scene === 'occupation' ? '第 10 回合 · 工作阶段' : scene === 'feeding' || scene === 'replay' ? '第 4 回合 · 收获' : '第 4 回合 · 工作阶段'}</p>{variant === 'C' && <button onClick={() => setTab('log')}>查看事件与卡牌的结算来源</button>}</section></aside></div>
      </>}
      <details className="lep-state"><summary>当前演示状态</summary><p>方案 {variant} · {scenes.find(s => s.id === scene)?.name} · {lobby ? `公开配置：${publicChoice}；玩法快照未发布` : `公开事件：${current?.name ?? '未启用'}；${receipt ? '已有模拟确认记录' : '尚未确认'}`}</p><p>界面数值来自固定场景，不连接真实对局，不执行规则计算。</p></details>
    </div>
    {detail && <div className="lep-overlay" onClick={() => setDetail(false)}><section className="lep-dialog" role="dialog" aria-modal="true" aria-label="本局事件规则" onClick={e => e.stopPropagation()}><button className="lep-close" autoFocus onClick={() => setDetail(false)}>关闭</button>{eventCard}<p className="lep-muted lep-small">本局固定，刷新、重连与撤回不会换事件。</p></section></div>}
    {import.meta.env.DEV && <nav className="lep-switcher" aria-label="切换设计方案"><button aria-label="上一个方案" onClick={() => cycle(-1)}>←</button><span>{variant} · {variantNames[variant]}</span><button aria-label="下一个方案" onClick={() => cycle(1)}>→</button></nav>}
  </div>
}

function Farm({ scheme, animals }: { scheme: 'event' | 'tamer' | 'mixed'; animals: boolean }) {
  return <div className="lep-farm" aria-label="农场版图">{Array.from({ length: 15 }, (_, index) => {
    const room = index === 0 || index === 5
    const pet = !animals ? '' : scheme === 'tamer' && room ? '羊 1' : index === 5 ? scheme === 'mixed' ? '羊 2 · 猪 1' : '羊 1 · 猪 1 · 牛 1' : ''
    return <div key={index} className={`lep-tile ${room ? 'lep-room' : index === 3 ? 'lep-field' : ''}`}><small>{'ABC'[Math.floor(index / 5)]}{index % 5 + 1}</small><span>{room ? '石屋' : index === 3 ? '谷田' : ''}</span>{pet && <b>{pet}</b>}</div>
  })}</div>
}
