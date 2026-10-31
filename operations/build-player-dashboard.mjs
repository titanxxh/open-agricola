import { readFileSync, writeFileSync } from 'node:fs'

const directory = new URL('./grafana/dashboards/', import.meta.url)
const datasource = { type: 'prometheus', uid: 'agricola-prometheus' }
const fresh = '(agricola_opening_collection_success == 1) and on(job,instance) (time() - agricola_opening_last_success_unixtime < 120)'
const observed = expression => `(${expression}) and on(job,instance) (${fresh})`
const selector = (name, labels = '') => `${name}{window="$window"${labels ? ',' + labels : ''}}`
const links = [{ type: 'dashboards', title: '监控看板', tags: ['运行监控'], asDropdown: false, includeVars: true, keepTime: true }]
const names = {
  solo: '单人', hotseat: '热座', multiplayer: '联机', unknown: '未知',
  waiting: '等待玩家', color_confirmation: '确认颜色', parent_selection: '选择父母牌',
  draft: '轮抽', solo_hand_selection: '单人选牌', playing: '正式游戏',
  active: '仍可续局', completed: '正常完赛', terminated: '协商结束', expired: '已过期', removed: '已下架',
  parent_cards: '父母牌', through_the_seasons: '四季', farmers_of_the_moor: '沼泽',
  snake_opening: '蛇形开局', moor_balance_rules: '沼泽平衡规则', community_deck: '社区卡',
}
const renames = Object.entries(names).map(([value, label]) => ({ id: 'renameByRegex', options: { regex: `^${value}$`, renamePattern: label } }))
let id = 0
let y = 0
const panels = []
const description = '只统计永久开局记录启用后确认的开局，开发局不计入。今日按 UTC+8，24 小时与 7 天为滚动窗口。采集失败或超过 120 秒显示未知。'
function group(title, definitions) {
  panels.push({ id: ++id, title, type: 'row', collapsed: false, gridPos: { x: 0, y: y++, w: 24, h: 1 }, panels: [] })
  const width = 24 / definitions.length
  for (const [index, definition] of definitions.entries()) {
    const { title: panelTitle, expr, legend = '', unit = 'short', type = 'stat', help = description, transformations = renames } = definition
    panels.push({
      id: ++id, title: panelTitle, type, description: help, datasource,
      gridPos: { x: index * width, y, w: width, h: 7 },
      fieldConfig: { defaults: { unit, noValue: '未知', min: 0, color: { mode: 'palette-classic' } }, overrides: [] },
      options: {
        reduceOptions: { values: false, calcs: ['lastNotNull'], fields: '' },
        orientation: type === 'bargauge' ? 'horizontal' : 'auto', displayMode: 'basic', showUnfilled: true,
        legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' },
      },
      targets: [{ refId: 'A', expr, legendFormat: legend, format: 'time_series', instant: true }],
      transformations,
    })
  }
  y += 7
}

group('统计覆盖与采集状态', [
  { title: '永久开局记录启用时间', expr: `max(${observed('agricola_opening_tracking_since_unixtime')}) * 1000`, unit: 'dateTimeAsIso', help: '完整统计从此时间开始。更早的过期局没有足够证据，不倒推为零。新注册账号需要观察满 24 小时才进入转化率分母。' },
  { title: '开局数据采集状态', expr: 'min(agricola_opening_collection_success) and on() (time() - max(agricola_opening_last_success_unixtime) < 120)', unit: 'none', help: '1 为采集成功，0 为失败。缺少或过期样本显示未知。账户注册采集与开局采集分别报告状态。' },
])
group('开局数量与账号', [
  { title: '确认开局数', expr: `max(${observed(selector('agricola_opening_games', 'mode="all"'))})` },
  { title: '去重开局账号数', expr: `max(${observed(selector('agricola_opening_accounts', 'mode="all"'))})`, help: description + ' 按开局时入座的现存账号去重。同一账号多局、热座多个座位都只计一个账号；不代表线下实际人数。' },
  { title: '开局模式分布', expr: `max by(mode) (${observed(selector('agricola_opening_games', 'mode=~"solo|hotseat|multiplayer"'))})`, legend: '{{mode}}', type: 'bargauge' },
])
group('当前开局阶段', [
  { title: '当前在线局阶段', expr: `max by(stage) (${observed('agricola_opening_current{mode="all",presence="online"}')})`, legend: '{{stage}}', type: 'bargauge', help: '至少有一个当前有效连接的局。按当前所有者 epoch、存活租约和就绪实例判断在线。开局包括选牌与轮抽；正式游戏单独展示。开发局不计入。' },
  { title: '离线保留局阶段', expr: `max by(stage) (${observed('agricola_opening_current{mode="all",presence="retained"}')})`, legend: '{{stage}}', type: 'bargauge', help: '全员离线但仍可续局的存档。此数量不代表当前有人在玩，也不能单凭当前阶段认定玩家卡住。' },
])
const conversion = milestone => `max(${observed(`agricola_opening_conversion{cohort="$cohort",milestone="${milestone}"}`)})`
const cohortHelp = '按注册批次统计现存账号，仅包含记录启用后注册且已观察满 24 小时的账号。分子是在该账号注册后 24 小时内开局或进入正式游戏的账号数。分母为零时转化率显示未知。'
group('新玩家首次 24 小时', [
  { title: '已观察满24小时的新账号', expr: conversion('eligible'), help: cohortHelp },
  { title: '24小时内开局转化率', expr: `(${conversion('started_24h')} / ${conversion('eligible')}) and (${conversion('eligible')} > 0)`, unit: 'percentunit', help: cohortHelp },
  { title: '24小时内正式游戏转化率', expr: `(${conversion('playing_24h')} / ${conversion('eligible')}) and (${conversion('eligible')} > 0)`, unit: 'percentunit', help: cohortHelp },
])
group('新玩家转化人数', [
  { title: '24小时内开局账号数', expr: conversion('started_24h'), help: cohortHelp },
  { title: '24小时内正式游戏账号数', expr: conversion('playing_24h'), help: cohortHelp },
])
for (const [stage, label, help] of [
  ['waiting', '等人开局', '建房到确认开局。只包含已完成这段等待的局，正在等待的局不当成零秒。'],
  ['preparation', '选牌准备', '确认开局到首次进入正式游戏。只包含首次时间均准确记录的局；旧存档恢复不会被算成首次正式游戏。'],
]) {
  const samples = `max(${observed(selector('agricola_opening_duration_samples', `stage="${stage}"`))})`
  group(`${label}耗时`, [
    { title: `${label}耗时 p50 / p90`, expr: `max by(quantile) (${observed(selector('agricola_opening_duration_seconds', `stage="${stage}"`))}) and on() (${samples} >= 5)`, legend: '{{quantile}}', unit: 's', transformations: [{ id: 'renameByRegex', options: { regex: '^0\\.5$', renamePattern: 'p50' } }, { id: 'renameByRegex', options: { regex: '^0\\.9$', renamePattern: 'p90' } }], help: `${help} 至少 5 个样本才展示分位数。${description}` },
    { title: `${label}耗时样本数`, expr: samples, help },
  ])
}
const outcomes = observed(selector('agricola_opening_outcomes', 'mode="all"'))
group('同一开局批次的后续情况', [
  { title: '开局批次当前结局', expr: `max by(outcome) (${outcomes})`, legend: '{{outcome}}', type: 'bargauge', help: '按所选窗口内开局的同一批局，观察当前正常完赛、协商结束、过期、下架与仍可续局的数量。仍可续局不算失败。' },
  { title: '开局批次当前完赛占比', expr: `(max(${observed(selector('agricola_opening_outcomes', 'mode="all",outcome="completed"'))}) / max(${observed(selector('agricola_opening_games', 'mode="all"'))})) and (max(${observed(selector('agricola_opening_games', 'mode="all"'))}) > 0)`, unit: 'percentunit', help: '分子与分母来自相同开局批次。包含尚未结束的局，因此是截至当前的完赛占比，不能视为最终完局率。' },
])
group('人数与扩展偏好', [
  { title: '开局座位数分布', expr: `max by(seats) (${observed(selector('agricola_opening_seats'))})`, legend: '{{seats}}人', type: 'bargauge', help: description + ' 展示开局配置的座位数，热座座位不等于独立账号。' },
  { title: '开局扩展使用情况', expr: `max by(variant) (${observed(selector('agricola_opening_variants'))})`, legend: '{{variant}}', type: 'bargauge', help: description + ' 每个开关独立计数，同一局可以使用多个扩展，不能将各项相加作为总开局数。' },
])
group('开局请求处理', [
  { title: '建房与入房系统错误', expr: 'sum by(command) (increase(agricola_commands_total{command=~"createRoom|joinRoom|newGame",outcome="error"}[$__range]))', legend: '{{command}}', help: '所选时间范围内的建房、入房和再来一局系统错误尝试。请求重试与重复回执不等于新增开局，规则拒绝单独展示。' },
  { title: '建房与入房规则拒绝', expr: 'sum by(command) (increase(agricola_commands_total{command=~"createRoom|joinRoom|newGame",outcome="rule_rejected"}[$__range]))', legend: '{{command}}', help: '规则拒绝可能来自座位已满或准入限制，应结合系统错误与真实开局数量判断。' },
])

const dashboard = {
  uid: 'open-agricola-players', title: 'Open Agricola 玩家开局与对局情况', schemaVersion: 39, version: 1,
  editable: false, refresh: '15s', timezone: 'Asia/Singapore', time: { from: 'now-24h', to: 'now' },
  tags: ['运行监控', '玩家开局'], links,
  templating: { list: [
    { name: 'window', label: '开局统计窗口', type: 'custom', query: '今日（UTC+8） : today,近24小时 : last_24h,近7天 : last_7d', current: { text: '近24小时', value: 'last_24h' } },
    { name: 'cohort', label: '成熟注册批次', type: 'custom', query: '近7天注册 : last_7d,近30天注册 : last_30d', current: { text: '近7天注册', value: 'last_7d' } },
  ] }, panels,
}
const emit = (url, value) => {
  const json = JSON.stringify(value, null, 2) + '\n'
  if (process.argv.includes('--check')) {
    if (readFileSync(url, 'utf8') !== json) throw new Error(`Regenerate dashboards: node operations/build-player-dashboard.mjs (${url.pathname})`)
  } else writeFileSync(url, json)
}
emit(new URL('players.json', directory), dashboard)
const existingPath = new URL('operations.json', directory)
const existing = JSON.parse(readFileSync(existingPath, 'utf8'))
existing.links = links
existing.version = 5
emit(existingPath, existing)
