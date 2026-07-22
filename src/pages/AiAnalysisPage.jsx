import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Button, Empty, Form, Input, Modal, Progress, Segmented, Select, Table, Tooltip, Upload } from 'antd'
import {
  ArrowLeftOutlined,
  CaretRightOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  CodeOutlined,
  CopyOutlined,
  EditOutlined,
  ExpandAltOutlined,
  HistoryOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import Papa from 'papaparse'
import { RowActions, SourceCell, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

const hubeiSamples = [
  '关于市中心医院医疗设备采购项目的公开招标公告',
  '武汉市政务云平台三期扩容建设项目竞争性磋商公告',
  '2026年度城市道路养护工程施工招标公告',
  '省属高校实验设备定点采购项目询价公告',
  '智慧交通信号控制系统升级改造项目招标',
]

const analysisProfiles = {
  'ggzy.hubei.gov.cn': {
    source: 'hubei_ggzy',
    confidence: 96,
    fields: [
      { name: 'title', label: '标题', selector: 'a::attr(title)', sample: hubeiSamples[0] },
      { name: 'url', label: '详情链接', selector: 'a::attr(href)', sample: '/notice/detail/8842.html' },
      { name: 'pub_date', label: '发布时间', selector: 'span.date::text', sample: '2026-07-16' },
      { name: 'raw', label: '原始数据', selector: 'detail_page::html', sample: '<html>…详情页原始 HTML…</html>', raw: true },
    ],
    samples: hubeiSamples,
    container: 'ul.article-list > li',
    nextPage: 'a.next::attr(href)',
  },
  'ccgp-jiangsu.gov.cn': {
    source: 'jiangsu_ccgp',
    confidence: 71,
    fields: [
      { name: 'title', label: '标题', selector: 'h3 a::text', sample: '南京市XX区政务云平台建设项目' },
      { name: 'url', label: '详情链接', selector: 'h3 a::attr(href)', sample: '/detail?id=99213' },
      { name: 'pub_date', label: '发布时间', selector: './/em/text()', sample: '2026/07/15' },
      { name: 'raw', label: '原始数据', selector: '— 未定位', sample: '（详情页原始数据待确认）', raw: true },
    ],
    samples: ['南京市XX区政务云平台建设项目', '苏州市轨道交通信号系统采购公告', '无锡市第一人民医院DR设备采购项目', '常州市老旧小区改造工程监理服务采购', '徐州市生活垃圾分类设施采购及安装项目'],
    container: 'div.m_list div.item',
    nextPage: null,
    warnings: ['列表容器 div.m_list 置信度偏低，请人工确认', '字段 buyer 未能稳定定位，值为 null'],
  },
  'cdzbtb.com': {
    source: 'sichuan_zbtb',
    confidence: 89,
    fields: [
      { name: 'title', label: '标题', selector: 'td.title a::attr(title)', sample: '成都地铁XX号线土建工程施工招标' },
      { name: 'url', label: '详情链接', selector: 'td.title a::attr(href)', sample: '/jyxx/2026/0714/551.htm' },
      { name: 'pub_date', label: '发布时间', selector: 'td.date::text', sample: '2026-07-14' },
      { name: 'raw', label: '原始数据', selector: 'detail_page::json', sample: '{ "content": "…详情页原始 JSON…" }', raw: true },
    ],
    samples: ['成都地铁XX号线土建工程施工招标', '四川省人民医院医用耗材集中采购公告', '绵阳市城区路灯节能改造工程招标', '宜宾市档案数字化加工服务采购项目', '乐山市水质在线监测系统建设项目公告'],
    container: 'table.list tr[height]',
    nextPage: 'a.next::attr(href)',
  },
  'www.ccgp.gov.cn': {
    source: 'ccgp_central',
    confidence: 98,
    fields: [
      { name: 'title', label: '标题', selector: 'h2 a::text', sample: '中央国家机关办公设备采购公告' },
      { name: 'url', label: '详情链接', selector: 'h2 a::attr(href)', sample: '/cggg/zygg/202607/t20260716_3204.htm' },
      { name: 'pub_date', label: '发布时间', selector: 'span.time::text', sample: '2026-07-16' },
      { name: 'raw', label: '原始数据', selector: 'article::html', sample: '<article>…公告正文…</article>', raw: true },
    ],
    samples: ['中央国家机关办公设备采购公告', '公共服务平台扩容建设项目公告', '医疗设备采购公开招标公告', '信息化运维服务竞争性磋商公告', '科研仪器设备采购项目公告'],
    container: 'ul.c_list_bid > li',
    nextPage: 'a.next::attr(href)',
  },
}

function getHost(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '')
}

function analysisRowsFromMatrix(matrix) {
  const rows = matrix.map((cells) => {
    const values = cells.map((cell) => String(cell || '').trim()).filter(Boolean)
    const urlIndex = values.findIndex((cell) => {
      try {
        return ['http:', 'https:'].includes(new URL(cell).protocol)
      } catch {
        return false
      }
    })
    if (urlIndex < 0) return null
    const url = values[urlIndex]
    const host = normalizeHost(getHost(url))
    return { name: values.find((_, index) => index !== urlIndex) || '', url, host }
  }).filter(Boolean)
  return [...new Map(rows.map((row) => [row.host, row])).values()]
}

function parseAnalysisRows(value) {
  const parsed = Papa.parse(String(value || '').replace(/^\uFEFF/, ''), { skipEmptyLines: true })
  return analysisRowsFromMatrix(parsed.data)
}

function isActiveAnalysis(entry) {
  return !['审核完成', '已通过', '已完成', '已取消'].includes(entry.status)
}

function displayStatus(status) {
  if (status === '待确认归属') return '待确认'
  if (status === '验证失败') return '需订正'
  return status
}

function analysisTypeLabel(entry) {
  if (entry.analysisKind === 'diagnose') return '失败修复'
  if (entry.analysisKind === 'onboarding') return '首次接入'
  return '重新分析'
}

function analysisSourceLabel(entry) {
  if (entry.failureId) return '失败队列'
  if (entry.sourceExecutionId) return '采集记录'
  return entry.source || entry.batchName || 'AI 分析'
}

function formatAnalysisTime(entry) {
  const value = entry.completedAt || entry.updatedAt || entry.createdAt
  if (!value) return '—'
  if (typeof value === 'string' && /^\d{2}-\d{2}\s\d{2}:\d{2}$/.test(value)) {
    return `${new Date().getFullYear()}-${value}`
  }
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(value) && !/^\d{13}$/.test(value)) return value
  const parsed = new Date(/^\d{13}$/.test(String(value)) ? Number(value) : value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  const pad = (part) => String(part).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function buildProfile(entry) {
  const host = getHost(entry.url)
  const known = analysisProfiles[host]
  const fallbackSamples = ['采购项目公开招标公告', '信息化服务竞争性磋商公告', '城市建设项目资格预审公告', '办公设备采购询价公告', '公共服务平台运维项目公告']
  const profile = known || {
    source: host.replace(/\W+/g, '_'),
    confidence: entry.confidence || 84,
    fields: [
      { name: 'title', label: '标题', selector: 'article a::text', sample: fallbackSamples[0] },
      { name: 'url', label: '详情链接', selector: 'article a::attr(href)', sample: '/notice/detail/1001.html' },
      { name: 'pub_date', label: '发布时间', selector: 'time::text', sample: '2026-07-16' },
      { name: 'raw', label: '原始数据', selector: 'detail_page::html', sample: '<html>…详情页原始 HTML…</html>', raw: true },
    ],
    samples: fallbackSamples,
    container: 'article.notice-item',
    nextPage: 'a.next::attr(href)',
  }

  const fieldSelectors = Object.fromEntries(profile.fields.filter((field) => !field.raw).map((field) => [field.name, field.selector]))
  const config = {
    source: profile.source,
    name: entry.site,
    entry: entry.url,
    list: { container: profile.container, next_page: profile.nextPage },
    fields: fieldSelectors,
    request: { method: 'GET', interval_ms: 1500, timeout_ms: 30000 },
    dedup: ['url', 'title'],
    ...(profile.warnings ? { _warnings: profile.warnings } : {}),
  }
  const rawField = profile.fields.find((field) => field.raw)
  const rawContent = rawField?.selector.includes('json')
    ? JSON.stringify({ url: `https://${host}${profile.fields.find((field) => field.name === 'url')?.sample}`, title: profile.samples[0], pub_date: '2026-07-16', content_html: '<div class="detail">…完整公告正文…</div>', attachments: [{ name: '招标文件.pdf', url: '/files/zbwj.pdf' }] }, null, 2)
    : `<!DOCTYPE html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><title>${profile.samples[0]}</title></head>\n<body>\n  <article class="notice-detail">\n    <h1>${profile.samples[0]}</h1>\n    <time>2026-07-16</time>\n    <div class="content">受采购人委托，现对本项目进行公开招标，欢迎符合条件的供应商参与。</div>\n  </article>\n</body>\n</html>`

  return { ...profile, confidence: entry.confidence || profile.confidence, config, rawContent }
}

function validateGeneratedConfig(configText) {
  let config
  try {
    config = JSON.parse(configText)
  } catch {
    return { passed: false, passedCount: 0, total: 20, reason: '采集配置不是有效的 JSON' }
  }
  const required = [config?.list?.container, config?.fields?.title, config?.fields?.url]
  if (required.some((value) => !String(value || '').trim())) {
    return { passed: false, passedCount: 12, total: 20, reason: '列表容器或必要字段配置不完整' }
  }
  if (String(config.list.container).includes('div.m_list div.item')) {
    return { passed: false, passedCount: 18, total: 20, reason: '仍有 2 个样本无法匹配当前列表选择器' }
  }
  return { passed: true, passedCount: 20, total: 20, reason: '结构、字段与质量门禁全部通过' }
}

export function AiAnalysisPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const { search } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const {
    intakeBatches,
    rules,
    sites,
    tasks,
    executions,
    updateBatchUrl,
    approveBatchUrl,
    importSites,
    startSiteAnalysis,
    runTask,
  } = usePrototype()
  const entryFilter = params.get('entry')
  const siteFilter = params.get('site')
  const fromExecution = params.get('fromExecution')
  const fromFailure = params.get('fromFailure')
  const isHistoryView = location.pathname === '/ai/history'
  const [selectedUrlId, setSelectedUrlId] = useState(entryFilter || '')
  const [historyType, setHistoryType] = useState('全部类型')
  const [createOpen, setCreateOpen] = useState(false)
  const [createMode, setCreateMode] = useState('new')
  const [createFileName, setCreateFileName] = useState('')
  const [createFileRows, setCreateFileRows] = useState([])
  const [createFileLoading, setCreateFileLoading] = useState(false)
  const [rawPreview, setRawPreview] = useState(null)
  const [editingConfig, setEditingConfig] = useState(false)
  const [workingDraft, setWorkingDraft] = useState('')
  const [configDrafts, setConfigDrafts] = useState({})
  const [repairPrompt, setRepairPrompt] = useState('')
  const [workingUrlId, setWorkingUrlId] = useState('')
  const [handoffEntryId, setHandoffEntryId] = useState('')
  const [createForm] = Form.useForm()

  const allEntries = useMemo(() => intakeBatches.flatMap((batch) => batch.urls.map((url, urlIndex) => ({
    ...url,
    batchId: batch.id,
    batchName: batch.name,
    createdAt: batch.createdAt,
    readyAt: batch.readyAt,
    updatedAt: batch.updatedAt,
    urlIndex,
  }))).sort((left, right) => {
    const timestamp = (entry) => {
      const explicitTime = Number(entry.createdAt) || Date.parse(entry.createdAt)
      if (Number.isFinite(explicitTime)) return explicitTime
      const queuedTime = Number(entry.readyAt) - 1400
      if (Number.isFinite(queuedTime)) return queuedTime
      const entryTime = Number(entry.id.match(/^URL-(\d{13})/)?.[1])
      if (Number.isFinite(entryTime) && entryTime > 0) return entryTime
      const updatedTime = Date.parse(`${new Date().getFullYear()}-${entry.updatedAt}`)
      if (Number.isFinite(updatedTime)) return updatedTime
      return Number(entry.batchId.replace('IB-', ''))
    }
    return timestamp(right) - timestamp(left) || left.urlIndex - right.urlIndex
  }), [intakeBatches])
  const activeEntries = useMemo(() => allEntries.filter(isActiveAnalysis), [allEntries])
  const historicalEntries = useMemo(() => allEntries.filter((entry) => !isActiveAnalysis(entry)), [allEntries])
  const visibleEntries = useMemo(() => activeEntries.filter((entry) => (
    `${entry.site}${entry.url}${entry.batchName}${entry.status}`.toLowerCase().includes(search.toLowerCase())
  )), [activeEntries, search])
  const visibleHistoricalEntries = useMemo(() => historicalEntries.filter((entry) => {
    const typeLabel = analysisTypeLabel(entry)
    const matchesType = historyType === '全部类型' || typeLabel === historyType
    const matchesSite = !siteFilter || normalizeHost(getHost(entry.url)) === normalizeHost(siteFilter)
    const matchesSearch = `${entry.site}${entry.url}${entry.batchName}${entry.status}${entry.ruleId || ''}${entry.releaseVersion || ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesType && matchesSite && matchesSearch
  }), [historicalEntries, historyType, search, siteFilter])
  const requestedEntry = allEntries.find((entry) => entry.id === (entryFilter || (isHistoryView ? '' : selectedUrlId)))
  const selected = requestedEntry
    || (isHistoryView ? null : activeEntries.find((entry) => entry.id === selectedUrlId || entry.id === entryFilter) || activeEntries[0])
  const occupiedAnalysisEntries = useMemo(() => allEntries.filter((entry) => isActiveAnalysis(entry)
    || ['candidate', 'validation_failed', 'ready_to_publish'].includes(entry.releasePhase)), [allEntries])
  const activeHosts = useMemo(() => new Set(occupiedAnalysisEntries.map((entry) => normalizeHost(getHost(entry.url)))), [occupiedAnalysisEntries])
  const availableSites = useMemo(() => sites
    .filter((site) => site.host && !activeHosts.has(normalizeHost(site.host)))
    .map((site) => ({ value: site.id || site.host, label: `${site.name} · ${site.host}` })), [activeHosts, sites])

  useEffect(() => {
    if (!entryFilter) return
    const entry = allEntries.find((item) => item.id === entryFilter)
    if (!entry) return
    if (!isHistoryView && !isActiveAnalysis(entry) && entry.id !== handoffEntryId) navigate(`/ai/history?${params.toString()}`, { replace: true })
    if (isHistoryView && isActiveAnalysis(entry)) navigate(`/ai?${params.toString()}`, { replace: true })
  }, [allEntries, entryFilter, handoffEntryId, isHistoryView, navigate, params])

  useEffect(() => {
    if (isHistoryView && handoffEntryId) setHandoffEntryId('')
  }, [handoffEntryId, isHistoryView])

  useEffect(() => {
    if (params.get('create') !== '1') return
    setCreateMode('new')
    setCreateOpen(true)
    const nextParams = new URLSearchParams(params)
    nextParams.delete('create')
    setParams(nextParams, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (isHistoryView) return
    const requested = allEntries.find((entry) => entry.id === entryFilter)
    if (requested) {
      if (requested.id !== selectedUrlId) setSelectedUrlId(requested.id)
      return
    }
    const contextualEntry = activeEntries.find((entry) => normalizeHost(getHost(entry.url)) === normalizeHost(siteFilter))
    const nextSelected = contextualEntry || activeEntries.find((entry) => entry.id === selectedUrlId) || activeEntries[0]
    if ((nextSelected?.id || '') !== selectedUrlId) setSelectedUrlId(nextSelected?.id || '')
  }, [activeEntries, allEntries, entryFilter, isHistoryView, selectedUrlId, siteFilter])

  const profile = selected ? buildProfile(selected) : null
  const baseConfigText = profile ? JSON.stringify(profile.config, null, 2) : ''
  const configText = selected ? (configDrafts[selected.id] || selected.approvedConfig || baseConfigText) : ''
  const confidence = selected?.status === '分析中' ? 0 : profile?.confidence || 0
  const isAnalyzing = selected?.status === '分析中' || workingUrlId === selected?.id
  const isRestarting = workingUrlId === selected?.id
  const selectedRule = selected ? rules.find((rule) => rule.id === selected.ruleId) : null
  const selectedSourceExecution = selected?.sourceExecutionId || fromExecution || ''
  const selectedFailure = selected?.failureId || fromFailure || ''
  const matchingTasks = selected ? tasks.filter((task) => task.site === selected.site || task.ruleId === selected.ruleId) : []
  const followingTasks = matchingTasks.filter((task) => task.versionPolicy === '跟随最新发布')
  const automaticRegression = selected ? validateGeneratedConfig(configText) : { passed: false, passedCount: 0, total: 20, reason: '' }

  const paramsForEntry = (entry) => {
    const nextParams = new URLSearchParams({ entry: entry.id, site: getHost(entry.url) })
    if (entry.analysisKind) nextParams.set('mode', entry.analysisKind)
    if (entry.failureId) nextParams.set('fromFailure', entry.failureId)
    if (entry.sourceExecutionId) nextParams.set('fromExecution', entry.sourceExecutionId)
    return nextParams
  }

  const selectEntry = (entry) => {
    setHandoffEntryId('')
    setSelectedUrlId(entry.id)
    setParams(paramsForEntry(entry), { replace: true })
    setEditingConfig(false)
    setRepairPrompt('')
  }

  const updateSelected = (patch) => updateBatchUrl(selected.batchId, selected.id, patch)

  const runAnalysis = (prompt = '', nextConfigText = configText) => {
    setWorkingUrlId(selected.id)
    updateSelected({ status: '分析中', issue: '', releasePhase: '', releaseVersion: '', releaseError: '' })
    window.setTimeout(() => {
      const validation = validateGeneratedConfig(nextConfigText)
      updateBatchUrl(selected.batchId, selected.id, {
        status: validation.passed ? '待审核' : '验证失败',
        judgment: '已归属',
        confidence: profile.confidence,
        samples: 5,
        issue: validation.passed ? '' : validation.reason,
        aiRegression: validation.passed ? 'passed' : 'failed',
        regressionPassed: validation.passedCount,
        regressionTotal: validation.total,
      })
      setWorkingUrlId('')
      if (validation.passed) message.success(prompt ? '二次分析及自动回归完成，请审核发布' : '重新分析及自动回归完成，请审核发布')
      else message.error(`自动回归未通过：${validation.reason}`)
    }, 900)
  }

  const approveSelected = () => {
    if (!automaticRegression.passed) return message.error(`自动回归未通过：${automaticRegression.reason}`)
    const result = approveBatchUrl(selected.batchId, selected.id, configText)
    if (!result?.ok) return message.error(result?.reason || '审核失败，请重新加载后再试')
    setHandoffEntryId(selected.id)
    setEditingConfig(false)
    message.success(result.syncedTasks
      ? `审核通过，规则 ${result.version} 已发布，并更新 ${result.syncedTasks} 个采集计划`
      : `审核通过，规则 ${result.version} 已发布`)
  }

  const saveConfigCorrection = () => {
    const validation = validateGeneratedConfig(workingDraft)
    if (validation.passedCount === 0) {
      message.error(validation.reason)
      return
    }
    setConfigDrafts((items) => ({ ...items, [selected.id]: workingDraft }))
    updateSelected({
      status: validation.passed ? '待审核' : '验证失败',
      issue: validation.passed ? '' : validation.reason,
      aiRegression: validation.passed ? 'passed' : 'failed',
      regressionPassed: validation.passedCount,
      regressionTotal: validation.total,
    })
    setEditingConfig(false)
    if (validation.passed) message.success('人工订正已保存，AI 自动回归通过')
    else message.warning(`人工订正已保存，但自动回归未通过：${validation.reason}`)
  }

  const continueAnalysisQueue = () => {
    setHandoffEntryId('')
    const nextEntry = activeEntries[0]
    if (!nextEntry) {
      setSelectedUrlId('')
      navigate('/ai')
      return
    }
    setSelectedUrlId(nextEntry.id)
    setParams(paramsForEntry(nextEntry), { replace: true })
  }

  const continueApprovedFlow = () => {
    if (selectedSourceExecution) {
      const sourceExecution = executions.find((execution) => execution.id === selectedSourceExecution)
      const executionId = sourceExecution ? runTask(sourceExecution.taskId, sourceExecution.id) : null
      if (!executionId) {
        message.warning('未找到可重跑的失败任务，请前往采集管理检查计划状态')
        return
      }
      message.success(`已创建重跑执行 ${executionId}`)
      navigate(`/executions/${executionId}`)
      return
    }
    const onboarding = selected.analysisKind === 'onboarding'
    if (onboarding || !matchingTasks.length) {
      navigate(`/tasks?site=${encodeURIComponent(normalizeHost(getHost(selected.url)))}&create=1${onboarding ? '&setup=onboarding' : ''}`)
      return
    }
    navigate(matchingTasks.length === 1
      ? `/tasks?task=${encodeURIComponent(matchingTasks[0].id)}`
      : `/tasks?site=${encodeURIComponent(normalizeHost(getHost(selected.url)))}`)
  }

  const submitCorrection = () => {
    if (!repairPrompt.trim()) {
      message.warning('请先填写修正提示词')
      return
    }
    const prompt = repairPrompt
    let revisedConfigText = configText
    try {
      const revisedConfig = JSON.parse(configText)
      if (String(revisedConfig?.list?.container || '').includes('div.m_list div.item')) {
        revisedConfig.list.container = 'section.notice-list article.notice-item'
      }
      delete revisedConfig._warnings
      revisedConfigText = JSON.stringify(revisedConfig, null, 2)
      setConfigDrafts((items) => ({ ...items, [selected.id]: revisedConfigText }))
    } catch {
      // Invalid manual JSON remains available for explicit correction.
    }
    setRepairPrompt('')
    runAnalysis(prompt, revisedConfigText)
  }

  const restartHistoricalEntry = (entry) => {
    const result = startSiteAnalysis({
      siteName: entry.site,
      siteHost: entry.siteHost || getHost(entry.url),
      url: entry.url,
      ruleId: entry.ruleId,
      kind: entry.ruleId ? 'reanalyze' : 'onboarding',
      parentAnalysisId: entry.id,
      source: 'AI 分析历史',
    })
    setHandoffEntryId('')
    setSelectedUrlId(result.entryId)
    navigate(`/ai?${new URLSearchParams({ entry: result.entryId, site: normalizeHost(getHost(entry.url)) }).toString()}`, { replace: true })
    message.success(result.existing ? '已打开该网站的活动分析任务' : '重新分析任务已创建')
  }

  const restartHistoricalAnalysis = () => restartHistoricalEntry(selected)

  const readAnalysisFile = async (file) => {
    setCreateFileLoading(true)
    try {
      let matrix
      if (file.name.toLowerCase().endsWith('.csv')) {
        matrix = Papa.parse((await file.text()).replace(/^\uFEFF/, ''), { skipEmptyLines: true }).data
      } else {
        const module = await import('read-excel-file/browser')
        const readXlsxFile = module.default || module
        matrix = await readXlsxFile(file)
      }
      const rows = analysisRowsFromMatrix(matrix)
      setCreateFileName(file.name)
      setCreateFileRows(rows)
      if (!rows.length) message.warning('文件中没有可识别的网站 URL')
    } catch {
      setCreateFileName('')
      setCreateFileRows([])
      message.error('文件解析失败，请检查 CSV 或 XLSX 格式')
    } finally {
      setCreateFileLoading(false)
    }
    return false
  }

  const submitAnalysisTask = async () => {
    const values = await createForm.validateFields()
    if (createMode !== 'existing') {
      const rows = createMode === 'file' ? createFileRows : parseAnalysisRows(values.urls)
      if (!rows.length) return message.warning('请输入至少一个有效的网站 URL')
      importSites(rows, 'AI 分析')
      const results = rows.map((row) => {
        const existingSite = sites.find((site) => normalizeHost(site.host) === row.host)
        const rule = rules.find((item) => normalizeHost(item.siteHost) === row.host)
        return {
          host: row.host,
          ...startSiteAnalysis({
            siteName: row.name || existingSite?.name || '待识别网站',
            siteHost: row.host,
            url: row.url,
            ruleId: rule?.id,
            kind: rule ? 'reanalyze' : 'onboarding',
            source: 'AI 分析',
          }),
        }
      })
      const first = results[0]
      setSelectedUrlId(first.entryId)
      setParams(new URLSearchParams({ entry: first.entryId, site: first.host }), { replace: true })
      setCreateOpen(false)
      createForm.resetFields()
      setCreateFileName('')
      setCreateFileRows([])
      message.success(`已创建 ${results.length} 个分析任务，网站资产已同步`)
      return
    }
    const site = sites.find((item) => (item.id || item.host) === values.siteId)
    if (!site) return message.error('网站资产不存在，请重新选择')
    const rule = rules.find((item) => normalizeHost(item.siteHost) === normalizeHost(site.host))
    const result = startSiteAnalysis({
      siteName: site.name,
      siteHost: site.host,
      url: site.entryUrl || `https://${site.host}`,
      ruleId: rule?.id,
      kind: rule ? 'reanalyze' : 'onboarding',
      source: 'AI 分析',
    })
    setSelectedUrlId(result.entryId)
    setParams(new URLSearchParams({ entry: result.entryId, site: site.host }), { replace: true })
    setCreateOpen(false)
    createForm.resetFields()
    setCreateFileName('')
    setCreateFileRows([])
    message.success(result.existing ? '已打开该网站的活动分析任务' : 'AI 分析任务已创建')
  }

  const closeCreateModal = () => {
    setCreateOpen(false)
    createForm.resetFields()
    setCreateFileName('')
    setCreateFileRows([])
    setCreateFileLoading(false)
  }

  const taskModal = (
    <Modal
      title="新建 AI 分析任务"
      open={createOpen}
      onCancel={closeCreateModal}
      onOk={submitAnalysisTask}
      okText="创建并开始分析"
      width={560}
      okButtonProps={{ disabled: (createMode === 'existing' && !availableSites.length) || (createMode === 'file' && !createFileRows.length) }}
    >
      <Form form={createForm} layout="vertical">
        <Segmented
          block
          className="ai-create-mode"
          value={createMode}
          options={[{ value: 'new', label: '新增 URL' }, { value: 'file', label: '导入文件' }, { value: 'existing', label: '已有网站' }]}
          onChange={(value) => {
            setCreateMode(value)
            createForm.resetFields()
            setCreateFileName('')
            setCreateFileRows([])
          }}
        />
        {createMode === 'new' ? (
          <Form.Item
            name="urls"
            label="网站 URL"
            rules={[{
              validator: (_, value) => parseAnalysisRows(value).length
                ? Promise.resolve()
                : Promise.reject(new Error('请输入至少一个有效的网站 URL')),
            }]}
          >
            <Input.TextArea
              autoSize={{ minRows: 6, maxRows: 10 }}
              placeholder={'每行一个 URL，也可填写“网站名称,URL”\nhttps://example.com/notices\n示例采购网,https://procurement.example.com/list'}
              spellCheck={false}
            />
          </Form.Item>
        ) : createMode === 'file' ? (
          <Upload.Dragger
            className="ai-create-upload"
            accept=".csv,.xlsx"
            maxCount={1}
            showUploadList={false}
            beforeUpload={readAnalysisFile}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">{createFileLoading ? '正在解析文件' : createFileName || '选择 CSV 或 XLSX 文件'}</p>
            <p className="ant-upload-hint">{createFileRows.length ? `已识别 ${createFileRows.length} 个网站 URL` : '支持网站名称、网站 URL 两列'}</p>
          </Upload.Dragger>
        ) : (
          <Form.Item name="siteId" label="网站资产" rules={[{ required: true, message: '请选择需要分析的网站' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={availableSites.length ? '选择网站或搜索域名' : '所有网站均有活动分析任务'}
              options={availableSites}
              notFoundContent="没有可创建任务的网站"
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )

  const historyColumns = [
    {
      title: '完成时间',
      key: 'completedAt',
      width: 156,
      render: (_, entry) => <span className="mono ai-history-time">{formatAnalysisTime(entry)}</span>,
    },
    {
      title: '网站',
      key: 'site',
      render: (_, entry) => <SourceCell name={entry.site} host={normalizeHost(getHost(entry.url))} />,
    },
    {
      title: '分析类型',
      key: 'analysisKind',
      width: 110,
      render: (_, entry) => analysisTypeLabel(entry),
    },
    {
      title: '最终结果',
      dataIndex: 'status',
      width: 110,
      render: (value) => <StatusTag value={displayStatus(value)} />,
    },
    {
      title: '规则版本',
      key: 'ruleVersion',
      width: 150,
      render: (_, entry) => (
        <div className="ai-history-version">
          <strong className="mono">{entry.releaseVersion || '—'}</strong>
          <span className="mono">{entry.ruleId || '未发布规则'}</span>
        </div>
      ),
    },
    {
      title: '来源',
      key: 'source',
      width: 120,
      render: (_, entry) => analysisSourceLabel(entry),
    },
    {
      title: '操作',
      key: 'actions',
      width: 136,
      align: 'right',
      render: (_, entry) => (
        <RowActions
          primary={{
            label: '查看结果',
            onClick: () => navigate(`/ai/history?${new URLSearchParams({ entry: entry.id, site: normalizeHost(getHost(entry.url)) }).toString()}`),
          }}
          menu={[{ key: 'restart', label: '重新分析', icon: <ReloadOutlined />, onClick: () => restartHistoricalEntry(entry) }]}
          moreLabel={`${entry.site} 更多操作`}
        />
      ),
    },
  ]

  if (isHistoryView && !selected) {
    return (
      <div className="page-content ai-history-page">
        <Button className="ai-history-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/ai')}>返回当前任务</Button>
        <section className="analysis-surface ai-history-surface">
          <header className="ai-history-header">
            <div>
              <h2>归档记录</h2>
              <span>{siteFilter ? `${siteFilter} · ` : ''}共 {visibleHistoricalEntries.length} 条</span>
            </div>
            <div className="ai-history-actions">
              <Select
                value={historyType}
                onChange={setHistoryType}
                options={['全部类型', '首次接入', '失败修复', '重新分析'].map((value) => ({ value, label: value }))}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/ai?create=1')}>新建分析</Button>
            </div>
          </header>
          <Table
            className="ai-history-table"
            rowKey="id"
            columns={historyColumns}
            dataSource={visibleHistoricalEntries}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{ emptyText: search || siteFilter || historyType !== '全部类型' ? '没有匹配的历史分析记录' : '暂无历史分析记录' }}
            scroll={{ x: 900 }}
          />
        </section>
      </div>
    )
  }

  if (!selected) {
    return (
      <div className="page-content ai-analysis-layout ai-analysis-empty-layout">
        <section className="analysis-surface ai-analysis-queue">
          <header className="ai-queue-header">
            <div className="ai-queue-title"><h2>当前任务</h2><span className="ai-section-count">0 个</span></div>
            <div className="ai-queue-actions">
              <Tooltip title="历史分析记录"><Button size="small" aria-label="历史分析记录" icon={<HistoryOutlined />} onClick={() => navigate('/ai/history')} /></Tooltip>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建分析</Button>
            </div>
          </header>
        </section>
        <main className="analysis-surface ai-empty-workbench">
          <Empty description="当前没有需要处理或正在分析的任务">
            <Button icon={<HistoryOutlined />} onClick={() => navigate('/ai/history')}>查看历史记录</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建分析任务</Button>
          </Empty>
        </main>
        {taskModal}
      </div>
    )
  }

  const copyConfig = async () => {
    await navigator.clipboard.writeText(configText)
    message.success('采集配置已复制')
  }

  const fieldColumns = [
    { title: '字段', dataIndex: 'label', width: 150, render: (value) => <div className="ai-field-name"><strong>{value}</strong></div> },
    { title: 'CSS / XPath 选择器', dataIndex: 'selector', width: 220, render: (value) => <code className={`selector-code ${value.includes('未定位') ? 'invalid' : ''}`}>{value}</code> },
    {
      title: '示例值', dataIndex: 'sample', render: (value, row) => row.raw
        ? <button className="raw-preview" onClick={() => setRawPreview({ title: `${selected.site} · 原始数据`, content: profile.rawContent })}><span className="mono">{value}</span><b>展开正文 <ExpandAltOutlined /></b></button>
        : <span className="ai-field-sample">{value}</span>,
    },
  ]

  const sampleRows = profile.samples.map((title, index) => ({
    id: index + 1,
    title,
    date: `2026-07-${String(16 - index).padStart(2, '0')}`,
    url: `/notice/detail/${8842 - index * 7}.html`,
    rawTag: profile.fields.find((field) => field.raw)?.selector.includes('json') ? 'raw_json' : 'raw_html',
  }))
  const sampleColumns = [
    { title: '#', dataIndex: 'id', width: 46, render: (value) => <span className="mono ai-row-number">{value}</span> },
    { title: '标题', dataIndex: 'title', render: (value) => <strong className="ai-sample-title">{value}</strong> },
    { title: '发布时间', dataIndex: 'date', width: 112, responsive: ['md'], render: (value) => <span className="mono ai-table-muted">{value}</span> },
    { title: '详情链接', dataIndex: 'url', width: 190, responsive: ['lg'], render: (value) => <span className="mono ai-detail-link">{value}</span> },
    { title: '原始数据', dataIndex: 'rawTag', width: 112, render: (value) => <Button className="ai-raw-button" size="small" icon={<ExpandAltOutlined />} onClick={() => setRawPreview({ title: `${selected.site} · ${value}`, content: profile.rawContent })}>{value}</Button> },
  ]
  const releasePhase = selected.releasePhase || ''
  const isReleaseHandoff = releasePhase === 'published'
  const isHistorical = !isActiveAnalysis(selected)
  const releaseVersion = selected.releaseVersion || selectedRule?.version || '-'
  const approvalNextLabel = selectedSourceExecution
    ? '重跑失败任务'
    : selected.analysisKind === 'onboarding' || !matchingTasks.length
      ? '配置首次采集'
      : '查看采集计划'
  const reviewBlockedReason = selected.status === '分析中'
    ? 'AI 分析尚未完成'
    : editingConfig
      ? '请先保存或取消当前订正'
      : !automaticRegression.passed
        ? `自动回归未通过：${automaticRegression.reason}`
        : ''
  const queueGroups = [
    { key: 'action', label: '需要处理', entries: visibleEntries.filter((entry) => entry.status !== '分析中') },
    { key: 'working', label: '分析中', entries: visibleEntries.filter((entry) => entry.status === '分析中') },
  ].filter((group) => group.entries.length)

  return (
    <div className={`page-content ${isHistoryView ? 'ai-history-detail-layout' : 'ai-analysis-layout'}`}>
      {isHistoryView ? (
        <div className="ai-history-detail-nav">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/ai/history')}>返回历史记录</Button>
          <span className="mono">{selected.id}</span>
        </div>
      ) : (
        <section className="analysis-surface ai-analysis-queue">
          <header className="ai-queue-header">
            <div className="ai-queue-title">
              <h2>当前任务</h2>
              <span className="ai-section-count">{activeEntries.length} 个</span>
            </div>
            <div className="ai-queue-actions">
              <Tooltip title="历史分析记录"><Button size="small" aria-label="历史分析记录" icon={<HistoryOutlined />} onClick={() => navigate('/ai/history')} /></Tooltip>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建分析</Button>
            </div>
          </header>
          <div className="ai-analysis-queue-list">
            {queueGroups.map((group) => (
              <div className="ai-queue-group" key={group.key}>
                <div className="ai-queue-group-label"><span>{group.label}</span><b>{group.entries.length}</b></div>
                {group.entries.map((entry) => (
                  <button className={`ai-analysis-item ${entry.id === selected.id ? 'active' : ''}`} key={entry.id} onClick={() => selectEntry(entry)} aria-pressed={entry.id === selected.id}>
                    <span className="ai-analysis-item-top"><strong>{entry.site}</strong><StatusTag value={displayStatus(entry.status)} /></span>
                    <span className="ai-analysis-item-entry">
                      <span className="mono ai-analysis-item-url" title={`${entry.id} · ${entry.url}`}>{entry.url}</span>
                      <span className="mono ai-analysis-item-confidence" title="置信度">{entry.status === '分析中' ? '解析中' : `${entry.confidence || buildProfile(entry).confidence}%`}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {!visibleEntries.length && <div className="ai-queue-empty">没有匹配的当前任务</div>}
          </div>
        </section>
      )}

      <main className="ai-analysis-main">
        {isReleaseHandoff && !isHistoryView ? (
          <section className="analysis-surface ai-approval-handoff">
            <div className="ai-handoff-heading">
              <div className="ai-handoff-icon success"><CheckCircleOutlined /></div>
              <div>
                <span className="ai-handoff-eyebrow">审核与发布已完成</span>
                <h1>采集规则已发布</h1>
                <p>{selectedSourceExecution
                  ? 'AI 自动回归和人工审核均已通过，生产规则已经更新，可以重跑原失败任务。'
                  : 'AI 自动回归和人工审核均已通过，规则已经同步到网站资产。'}</p>
              </div>
            </div>

            <div className="ai-handoff-facts">
              <div><span>发布版本</span><strong className="mono">{releaseVersion}</strong><small>已同步网站资产</small></div>
              <div><span>AI 自动回归</span><strong>已通过</strong><small>{selected.regressionPassed || selectedRule?.regressionPassed || 20}/{selected.regressionTotal || selectedRule?.regressionTotal || 20} 个样本</small></div>
              <div><span>影响范围</span><strong>{matchingTasks.length} 个采集计划</strong><small>{followingTasks.length} 个将跟随最新版本</small></div>
            </div>

            <div className="ai-handoff-steps" aria-label="规则发布进度">
              <div className="done"><b><CheckOutlined /></b><span><strong>AI 自动回归</strong><small>已通过</small></span></div>
              <i />
              <div className="done"><b><CheckOutlined /></b><span><strong>人工审核</strong><small>已通过</small></span></div>
              <i />
              <div className="done"><b><CheckOutlined /></b><span><strong>发布上线</strong><small>已完成</small></span></div>
            </div>

            <div className="ai-handoff-actions">
              <Button onClick={continueAnalysisQueue}>继续处理队列</Button>
              <Button type="primary" icon={<RocketOutlined />} onClick={continueApprovedFlow}>{approvalNextLabel}</Button>
            </div>
          </section>
        ) : (
          <>
        <section className="analysis-surface ai-detail-header">
          <span className="ai-detail-icon"><RobotOutlined /></span>
          <div className="ai-detail-identity">
            <div><h1>{selected.site}</h1><StatusTag value={displayStatus(selected.status)} /></div>
            <span className="mono">{selected.url}</span>
          </div>
          <div className="ai-detail-actions">
            {isHistorical ? (
              <Button type="primary" icon={<ReloadOutlined />} onClick={restartHistoricalAnalysis}>重新分析</Button>
            ) : (
              <>
                <Button icon={<ReloadOutlined />} disabled={isRestarting} onClick={() => runAnalysis()}>{selected.status === '分析中' ? '重新开始分析' : '重新分析'}</Button>
                <Button type="primary" icon={<CheckOutlined />} title={reviewBlockedReason} disabled={Boolean(reviewBlockedReason)} onClick={approveSelected}>{selected.status === '待确认归属' ? '确认规则' : reviewBlockedReason ? '暂不可审核' : '审核通过'}</Button>
              </>
            )}
          </div>
        </section>

        {isHistorical && (
          <Alert
            className="ai-flow-context"
            type="success"
            showIcon
            title="历史分析记录"
            description={`分析结果已归档${selected.ruleId ? `，关联规则 ${selected.ruleId}${selected.releaseVersion ? ` · ${selected.releaseVersion}` : ''}` : ''}。重新分析将创建一条新任务，不会覆盖当前记录。`}
          />
        )}

        {!isHistorical && selected.analysisKind === 'diagnose' && (
            <Alert
            className="ai-flow-context"
            type="warning"
            showIcon
            title={`正在修复 ${selected.site} 的失败采集`}
            description={`${selectedSourceExecution ? `失败执行 ${selectedSourceExecution}` : selectedFailure || '失败队列'} · AI 自动回归通过后，点击审核通过将直接发布修复规则。`}
          />
        )}

        {!isHistorical && selected.analysisKind === 'onboarding' && (
          <Alert
              className="ai-flow-context"
              type="info"
              showIcon
              title="首次接入分析"
              description="AI 已自动执行样本回归；确认字段和采集样例后，点击审核通过即可发布初始规则。"
          />
        )}

        {!isHistorical && !isAnalyzing && (
          <Alert
            className="ai-flow-context ai-auto-regression"
            type={automaticRegression.passed ? 'success' : 'error'}
            showIcon
            title={automaticRegression.passed ? `AI 自动回归通过 · ${automaticRegression.passedCount}/${automaticRegression.total} 个样本` : `AI 自动回归未通过 · ${automaticRegression.passedCount}/${automaticRegression.total} 个样本`}
            description={automaticRegression.passed ? '结构、字段和质量门禁均已通过，人工审核后将直接发布。' : `${automaticRegression.reason}，请人工订正或重新分析。`}
          />
        )}

        {isAnalyzing ? (
          <section className="analysis-surface ai-pipeline-card">
            <header className="ai-section-header">
              <div><RobotOutlined /><h2>AI 分析流水线</h2><StatusTag value="分析中" /></div>
              <span className="mono">3 / 5 样本页面已加载</span>
            </header>
            <Progress percent={62} showInfo={false} />
            <div className="ai-pipeline-steps">
              {['加载入口页面', '识别列表容器', '推断字段选择器', '试采集与校验', '生成采集配置'].map((step, index) => <div className={index < 2 ? 'done' : index === 2 ? 'active' : ''} key={step}><span>{index < 2 ? <CheckOutlined /> : index + 1}</span><strong>{step}</strong></div>)}
            </div>
          </section>
        ) : (
          <>
            <section className="analysis-surface ai-fields-card">
              <header className="ai-section-header">
                <div><h2>识别字段</h2><span className="ai-section-count mono">{profile.fields.length}</span></div>
                <div className="ai-confidence"><span>整体置信度</span><Progress percent={confidence} strokeColor="#16a35a" showInfo={false} size="small" /><strong className="mono">{confidence}%</strong></div>
              </header>
              <Table className="ai-detail-table" rowKey="name" size="middle" columns={fieldColumns} dataSource={profile.fields} pagination={false} scroll={{ x: 650 }} />
            </section>

            <section className="analysis-surface ai-samples-card">
              <header className="ai-section-header">
                <div><h2>采集样例</h2><span className="ai-section-count mono">{sampleRows.length}</span></div>
                <p>试采集列表页前 5 条，校验字段是否正确</p>
              </header>
              <Table className="ai-detail-table" rowKey="id" size="middle" columns={sampleColumns} dataSource={sampleRows} pagination={false} />
            </section>

            <section className="analysis-surface ai-config-card">
              <header className="ai-section-header ai-config-header">
                <div><CodeOutlined /><h2>生成的采集配置</h2><span className="ai-config-kind">下载器配置 · JSON</span></div>
                <div className="ai-config-actions">
                  {isHistorical ? (
                    <Button size="small" icon={<CopyOutlined />} onClick={copyConfig}>复制</Button>
                  ) : editingConfig ? (
                    <>
                      <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingConfig(false)}>取消</Button>
                      <Button type="primary" size="small" icon={<CheckOutlined />} onClick={saveConfigCorrection}>保存并自动回归</Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" icon={<CopyOutlined />} onClick={copyConfig}>复制</Button>
                      <Button size="small" icon={<EditOutlined />} onClick={() => { setWorkingDraft(configText); setEditingConfig(true) }}>人工订正</Button>
                    </>
                  )}
                </div>
              </header>
              {editingConfig ? (
                <Input.TextArea className="ai-config-editor" spellCheck={false} value={workingDraft} onChange={(event) => setWorkingDraft(event.target.value)} />
              ) : (
                <div className="ai-code-viewer">
                  {configText.split('\n').map((line, index) => <div className="mono" key={`${index}-${line}`}><span>{index + 1}</span><code>{line || ' '}</code></div>)}
                </div>
              )}
            </section>

            {!isHistorical && (
              <section className="analysis-surface ai-correction-card">
                <div className="ai-correction-title"><RobotOutlined /><h2>二次分析 · 修正提示词</h2></div>
                <Input.TextArea rows={3} value={repairPrompt} onChange={(event) => setRepairPrompt(event.target.value)} placeholder="例如：列表容器应为 div.m_list，请重新定位「采购单位」字段…" />
                <div className="ai-correction-footer"><span>AI 将结合你的提示重新解析页面结构并生成新代码</span><Button className="ai-submit-analysis" type="primary" icon={<CaretRightOutlined />} onClick={submitCorrection}>提交二次分析</Button></div>
              </section>
            )}
          </>
        )}
          </>
        )}
      </main>

      {taskModal}

      <Modal title={rawPreview?.title} open={Boolean(rawPreview)} onCancel={() => setRawPreview(null)} footer={<Button onClick={() => setRawPreview(null)}>关闭</Button>} width={860}>
        <p className="raw-modal-sub">完整原始数据仅用于人工核对字段与选择器。</p>
        <pre className="raw-modal-code">{rawPreview?.content}</pre>
      </Modal>
    </div>
  )
}
