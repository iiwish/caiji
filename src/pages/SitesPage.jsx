import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Descriptions,
  Grid,
  Input,
  Modal,
  Pagination,
  Segmented,
  Space,
  Switch,
  Table,
  Tooltip,
} from 'antd'
import {
  AppstoreOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  DownloadOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  LineChartOutlined,
  PlusOutlined,
  RobotOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import Papa from 'papaparse'
import { RowActions, SourceCell, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { getSiteRulePath } from '../app/routes'

const PAGE_SIZE = 12

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '')
}

function getUrlHost(url) {
  try {
    return normalizeHost(new URL(url).host)
  } catch {
    return ''
  }
}

function isActiveAnalysis(entry) {
  return !['审核完成', '已通过', '已完成', '已取消'].includes(entry.status)
}

function isValidWebsiteUrl(url) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function workbookRowsToSites(matrix) {
  if (!matrix.length) return []
  const normalizedHeader = matrix[0].map((value) => String(value || '').trim().toLowerCase())
  const aliases = {
    name: ['名称', '网站名称', '数据源', 'name'],
    url: ['网址', '网站url', 'url', '入口url'],
    freq: ['采集频率', '频率', 'frequency'],
  }
  const findColumn = (field, fallback) => {
    const index = normalizedHeader.findIndex((value) => aliases[field].includes(value))
    return index >= 0 ? index : fallback
  }
  const hasHeader = normalizedHeader.some((value) => Object.values(aliases).flat().includes(value))
  const nameIndex = findColumn('name', 0)
  const urlIndex = findColumn('url', 1)
  const freqIndex = findColumn('freq', 2)
  return matrix.slice(hasHeader ? 1 : 0).map((row, index) => {
    const firstCell = String(row[0] || '').trim()
    const secondCell = String(row[1] || '').trim()
    const isUrlOnlyRow = isValidWebsiteUrl(firstCell) && !isValidWebsiteUrl(secondCell)
    const url = isUrlOnlyRow ? firstCell : String(row[urlIndex] || '').trim()
    const name = isUrlOnlyRow ? '' : String(row[nameIndex] || '').trim()
    const freq = isUrlOnlyRow ? secondCell : String(row[freqIndex] || '').trim()
    return { key: `IMPORT-${index}`, name, url, freq, valid: isValidWebsiteUrl(url) }
  }).filter((row) => row.name || row.url)
}

function pastedTextToSites(value) {
  const parsed = Papa.parse(value.replace(/^\uFEFF/, ''), { skipEmptyLines: true })
  return workbookRowsToSites(parsed.data)
}

function resolveKnownSiteNames(rows, sites) {
  return rows.map((row) => {
    if (row.name) return { ...row, nameSource: 'provided' }
    const host = getUrlHost(row.url)
    const existing = sites.find((site) => normalizeHost(site.host) === host)
    const knownName = String(existing?.name || '').trim()
    const canReuseName = knownName && normalizeHost(knownName) !== host && knownName !== '待识别网站'
    return {
      ...row,
      name: canReuseName ? knownName : '',
      nameSource: canReuseName ? 'recognized' : 'pending',
    }
  })
}

function getSiteId(site) {
  if (site.id) return site.id
  if (Number.isInteger(site.key)) return `WS-${String(site.key + 1).padStart(3, '0')}`
  const checksum = [...site.host].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 1000, 0)
  return `WS-${String(checksum).padStart(3, '0')}`
}

export function SitesPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const { search } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const { sites, tasks, rules, intakeBatches, importSites, startSiteAnalysis } = usePrototype()
  const [scope, setScope] = useState('全部')
  const [view, setView] = useState('list')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importFileName, setImportFileName] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importMethod, setImportMethod] = useState('paste')
  const [pastedUrls, setPastedUrls] = useState('')
  const [analyzeAfterImport, setAnalyzeAfterImport] = useState(true)

  const activeAnalyses = useMemo(() => intakeBatches
    .flatMap((batch) => batch.urls.map((entry) => ({ ...entry, batchId: batch.id })))
    .filter(isActiveAnalysis), [intakeBatches])

  const analysisByHost = useMemo(() => {
    const entries = new Map()
    activeAnalyses.forEach((entry) => {
      const host = normalizeHost(entry.siteHost || getUrlHost(entry.url))
      const current = entries.get(host)
      if (!current || entry.status === '分析中') entries.set(host, entry)
    })
    return entries
  }, [activeAnalyses])

  const registrySites = useMemo(() => sites.map((row) => {
    const host = normalizeHost(row.host)
    const siteRule = rules.find((rule) => normalizeHost(rule.siteHost) === host)
    const siteTasks = tasks.filter((task) => task.site === row.name)
    const analysisEntry = analysisByHost.get(host)
    let status = '可采集'
    if (['已停用', '已暂停'].includes(row.status)) status = '已停用'
    else if (row.status === '异常' || siteRule?.status === '需修复') status = '需处理'
    else if (analysisEntry?.status === '分析中') status = '分析中'
    else if (analysisEntry) status = '待审核'
    else if (!siteRule || (siteRule.version === 'v0.0.0' && siteRule.status !== '已发布')) status = '待分析'
    else if (['候选版本', '待审核'].includes(siteRule.status)) status = '待审核'

    return {
      ...row,
      host,
      id: getSiteId(row),
      status,
      accessHealth: row.status === '异常' ? '需处理' : '健康',
      ruleStatus: siteRule?.status || '待配置',
      ruleVersion: siteRule?.version || '-',
      taskCount: siteTasks.length,
      analysisEntry,
    }
  }), [analysisByHost, sites, tasks, rules])

  const visibleRows = useMemo(() => registrySites.filter((row) => (
    (scope === '全部' || row.status === scope) &&
    `${row.id}${row.name}${row.host}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [registrySites, scope, search])

  useEffect(() => {
    setPage(1)
  }, [scope, search, sites.length])

  const pagedRows = useMemo(() => (
    visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  ), [page, visibleRows])

  const countByStatus = (status) => registrySites.filter((row) => row.status === status).length
  const siteStats = [
    { label: '网站总数', value: registrySites.length, tone: 'indigo', icon: <LineChartOutlined /> },
    { label: '可采集', value: countByStatus('可采集'), tone: 'green', icon: <CheckOutlined /> },
    { label: '待分析', value: countByStatus('待分析'), tone: 'amber', icon: <ClockCircleOutlined /> },
    { label: '需处理', value: countByStatus('需处理'), tone: 'red', icon: <WarningOutlined /> },
  ]
  const selectedRule = selected ? rules.find((rule) => normalizeHost(rule.siteHost) === normalizeHost(selected.host)) : null
  const selectedTasks = selected ? tasks.filter((task) => task.site === selected.name) : []
  const selectedTask = selectedTasks[0] || null

  useEffect(() => {
    const host = params.get('site')
    if (!host) return
    if (params.get('tab') === 'rule') {
      const legacyQuery = Object.fromEntries([...params.entries()].filter(([key]) => !['site', 'tab'].includes(key)))
      navigate(getSiteRulePath(host, legacyQuery), { replace: true })
      return
    }
    const contextualSite = registrySites.find((site) => normalizeHost(site.host) === normalizeHost(host))
    if (!contextualSite) return
    setSelected(contextualSite)
  }, [navigate, params, registrySites])

  const openSite = (row) => {
    setSelected(row)
    const nextParams = new URLSearchParams(params)
    nextParams.set('site', row.host)
    nextParams.delete('tab')
    setParams(nextParams, { replace: true })
  }

  const openCollectionConfiguration = (row) => {
    const matchingTasks = tasks.filter((task) => task.site === row.name)
    navigate(matchingTasks.length === 1
      ? `/tasks?task=${encodeURIComponent(matchingTasks[0].id)}`
      : `/tasks?site=${encodeURIComponent(row.host)}`)
  }

  const openAnalysis = (row) => {
    if (row.analysisEntry) {
      navigate(`/ai?entry=${encodeURIComponent(row.analysisEntry.id)}&site=${encodeURIComponent(row.host)}`)
      return
    }
    const rule = rules.find((item) => normalizeHost(item.siteHost) === normalizeHost(row.host))
    const result = startSiteAnalysis({
      siteName: row.name,
      siteHost: row.host,
      url: row.entryUrl || rule?.entryUrl || `https://${row.host}`,
      ruleId: rule?.id,
      kind: rule ? 'reanalyze' : 'onboarding',
    })
    message.success(result.existing ? '已打开该网站的活动分析任务' : 'AI 分析任务已创建')
    navigate(`/ai?entry=${encodeURIComponent(result.entryId)}&site=${encodeURIComponent(row.host)}`)
  }

  const primaryAction = (row) => {
    if (row.analysisEntry || ['待分析', '分析中', '待审核'].includes(row.status)) return openAnalysis(row)
    return openCollectionConfiguration(row)
  }

  const primaryActionLabel = (row) => {
    if (row.analysisEntry) return '查看分析'
    if (['待分析', '分析中', '待审核'].includes(row.status)) return 'AI 分析'
    return '采集配置'
  }

  const handleImportFile = async (file) => {
    setImportLoading(true)
    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv')
      let matrix
      if (isCsv) {
        const result = Papa.parse((await file.text()).replace(/^\uFEFF/, ''), { skipEmptyLines: true })
        matrix = result.data
      } else {
        const module = await import('read-excel-file/browser')
        const readXlsxFile = module.default || module
        matrix = await readXlsxFile(file)
      }
      const rows = resolveKnownSiteNames(workbookRowsToSites(matrix), sites)
      setImportRows(rows)
      setImportFileName(file.name)
      if (!rows.length) message.warning('文件中没有可识别的网站数据')
    } catch {
      setImportRows([])
      setImportFileName('')
      message.error('文件解析失败，请检查 CSV 或 Excel 列格式')
    } finally {
      setImportLoading(false)
    }
  }

  const submitImport = () => {
    const validRows = importRows.filter((row) => row.valid)
    if (!validRows.length) return message.warning('没有可导入的网站，请先检查文件内容')
    const uniqueRows = [...new Map(validRows.map((row) => [getUrlHost(row.url), row])).values()]
    const source = importFileName || (importMethod === 'paste' ? '批量粘贴' : '批量导入')
    const result = importSites(uniqueRows, source)
    const analysisResults = analyzeAfterImport ? uniqueRows.map((row) => {
      const host = getUrlHost(row.url)
      const rule = rules.find((item) => normalizeHost(item.siteHost) === host)
      return {
        host,
        ...startSiteAnalysis({
          siteName: row.name || '待识别网站',
          siteHost: host,
          url: row.url,
          ruleId: rule?.id,
          kind: rule ? 'reanalyze' : 'onboarding',
        }),
      }
    }) : []
    setImportOpen(false)
    setImportRows([])
    setImportFileName('')
    setPastedUrls('')
    setScope('全部')
    setPage(1)
    if (analysisResults.length) {
      message.success(`已新增 ${result.created} 个、更新 ${result.updated} 个网站，并创建 ${analysisResults.length} 个分析任务`)
      navigate(`/ai?entry=${encodeURIComponent(analysisResults[0].entryId)}&site=${encodeURIComponent(analysisResults[0].host)}`)
      return
    }
    message.success(`新增完成：新增 ${result.created} 个，更新 ${result.updated} 个网站`)
  }

  const updatePastedUrls = (value) => {
    setPastedUrls(value)
    setImportRows(resolveKnownSiteNames(pastedTextToSites(value), sites))
    setImportFileName(value.trim() ? '批量粘贴' : '')
  }

  const openBulkImport = () => {
    setImportMethod('paste')
    setImportRows([])
    setImportFileName('')
    setPastedUrls('')
    setAnalyzeAfterImport(true)
    setImportOpen(true)
  }

  const downloadTemplate = () => {
    const csv = '\uFEFF网站名称,网站URL,采集频率\n湖北省公共资源交易中心,https://ggzy.hubei.gov.cn/notice/list,每 1 小时\n四川省招标投标网,https://cdzbtb.com/notice/list,每 2 小时\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = '网站导入模板.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const closeSite = () => {
    setSelected(null)
    const nextParams = new URLSearchParams(params)
    nextParams.delete('site')
    nextParams.delete('tab')
    setParams(nextParams, { replace: true })
  }

  const importColumns = [
    { title: '网站名称', dataIndex: 'name', width: 180, render: (value) => value || <span className="site-import-name-pending"><RobotOutlined />待 AI 识别</span> },
    { title: '网站 URL', dataIndex: 'url', render: (value) => <span className="mono site-import-url">{value || '—'}</span> },
    { title: '采集频率', dataIndex: 'freq', width: 100, render: (value) => value || '待配置' },
    { title: '校验', dataIndex: 'valid', width: 78, render: (value) => <span className={`site-import-validation ${value ? 'valid' : 'invalid'}`}>{value ? '可新增' : '需检查'}</span> },
  ]

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 90,
      responsive: ['sm'],
      render: (value) => <span className="mono muted">{value}</span>,
    },
    {
      title: '网站',
      dataIndex: 'name',
      width: screens.sm ? 250 : 184,
      render: (_, row) => <SourceCell name={row.name} host={row.host} onClick={() => openSite(row)} ariaLabel={`查看 ${row.name} 概览`} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      responsive: ['sm'],
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: '访问健康',
      dataIndex: 'accessHealth',
      width: 100,
      responsive: ['sm'],
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: '采集规则',
      width: 150,
      responsive: ['md'],
      render: (_, row) => <div className="site-rule-cell"><strong className="mono">{row.ruleVersion}</strong><StatusTag value={row.ruleStatus} /></div>,
    },
    {
      title: '累计数据',
      dataIndex: 'records',
      align: 'right',
      width: 110,
      responsive: ['lg'],
      render: (value) => <span className="mono value-strong">{value}</span>,
    },
    {
      title: '操作',
      align: 'right',
      width: screens.sm ? 148 : 112,
      fixed: screens.sm ? 'right' : undefined,
      render: (_, row) => <RowActions
        primary={{ label: primaryActionLabel(row), onClick: () => primaryAction(row) }}
        moreLabel={`${row.name} 更多操作`}
        menu={[{ key: 'rule', icon: <CodeOutlined />, label: '网站规则', onClick: () => navigate(getSiteRulePath(row.host)) }]}
      />,
    },
  ]

  const start = visibleRows.length ? (page - 1) * PAGE_SIZE + 1 : 0
  const end = Math.min(page * PAGE_SIZE, visibleRows.length)

  return (
    <div className="page-content sites-page">
      <section className="site-stat-grid" aria-label="网站资产概览">
        {siteStats.map((item) => (
          <div className="site-stat-card" key={item.label}>
            <span className={`site-stat-icon ${item.tone}`}>{item.icon}</span>
            <div>
              <strong className="mono">{item.value}</strong>
              <span>{item.label}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="site-toolbar">
        <Segmented
          className="site-status-filter"
          value={scope}
          onChange={setScope}
          options={['全部', '可采集', '待分析', '分析中', '待审核', '需处理', '已停用']}
        />
        <div className="toolbar-spacer" />
        <Tooltip title="列表视图或卡片视图">
          <Segmented
            className="site-view-toggle"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', icon: <UnorderedListOutlined />, 'aria-label': '列表视图' },
              { value: 'grid', icon: <AppstoreOutlined />, 'aria-label': '卡片视图' },
            ]}
          />
        </Tooltip>
        <Button type="primary" icon={<PlusOutlined />} onClick={openBulkImport}>新增 URL</Button>
      </div>

      {view === 'list' ? (
        <div className="sites-table-surface">
          <Table
            className="sites-data-table"
            rowKey="id"
            columns={columns}
            dataSource={pagedRows}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: screens.sm ? 950 : 296 }}
          />
        </div>
      ) : (
        <div className="site-grid">
          {pagedRows.map((row) => (
            <article className="site-card" key={row.id}>
              <div className="site-card-head">
                <SourceCell name={row.name} host={row.host} onClick={() => openSite(row)} ariaLabel={`查看 ${row.name} 概览`} />
                <StatusTag value={row.status} />
              </div>
              <div className="site-card-stats">
                <div><span>访问健康</span><b>{row.accessHealth}</b></div>
                <div><span>规则版本</span><b className="mono">{row.ruleVersion}</b></div>
                <div><span>关联计划</span><b>{row.taskCount} 个</b></div>
              </div>
              <div className="site-card-actions">
                <Button
                  type={row.status === '需处理' ? 'primary' : 'default'}
                  danger={row.status === '需处理'}
                  icon={row.analysisEntry || ['待分析', '分析中', '待审核'].includes(row.status) ? <RobotOutlined /> : <SettingOutlined />}
                  onClick={() => primaryAction(row)}
                >
                  {primaryActionLabel(row)}
                </Button>
                <Tooltip title="网站概览"><Button aria-label={`查看 ${row.name} 概览`} icon={<InfoCircleOutlined />} onClick={() => openSite(row)} /></Tooltip>
                <Tooltip title="网站规则"><Button aria-label={`查看 ${row.name} 规则`} icon={<CodeOutlined />} onClick={() => navigate(getSiteRulePath(row.host))} /></Tooltip>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="site-pagination">
        <span>第 {start}–{end} 项 · 共 {visibleRows.length} 个网站</span>
        <Pagination
          current={page}
          pageSize={PAGE_SIZE}
          total={visibleRows.length}
          showSizeChanger={false}
          hideOnSinglePage
          onChange={setPage}
        />
      </div>

      <Modal
        title={selected ? `${selected.name} · 网站概览` : '网站概览'}
        open={Boolean(selected)}
        onCancel={closeSite}
        width={760}
        footer={<Space><Button onClick={closeSite}>关闭</Button><Button icon={<CodeOutlined />} onClick={() => navigate(getSiteRulePath(selected?.host || ''))}>网站规则</Button><Button type="primary" onClick={() => {
          if (selected?.analysisEntry || ['待分析', '分析中', '待审核'].includes(selected?.status)) openAnalysis(selected)
          else navigate(selectedTask ? `/tasks?site=${encodeURIComponent(selected?.host || '')}` : `/tasks?site=${encodeURIComponent(selected?.host || '')}&create=1`)
        }}>{selected?.analysisEntry ? '查看分析' : ['待分析', '分析中', '待审核'].includes(selected?.status) ? '发起 AI 分析' : selectedTask ? '查看采集计划' : '创建采集计划'}</Button></Space>}
      >
        {selected && <div className="site-overview-modal"><Descriptions column={{ xs: 1, sm: 2 }} items={[
            { key: 'name', label: '网站名称', children: selected.name },
            { key: 'url', label: '网站 URL', children: <span className="mono">{selectedRule?.entryUrl || selected.entryUrl || `https://${selected.host}`}</span> },
            { key: 'status', label: '接入状态', children: <StatusTag value={selected.status} /> },
            { key: 'health', label: '访问健康', children: <StatusTag value={selected.accessHealth} /> },
            { key: 'records', label: '累计数据', children: selected.records },
            { key: 'rule', label: '规则状态', children: selectedRule ? <><span className="mono">{selectedRule.id} · {selectedRule.version}</span> <StatusTag value={selectedRule.status} /></> : <StatusTag value="待配置" /> },
            { key: 'tasks', label: '关联计划', children: `${selectedTasks.length} 个` },
            { key: 'import', label: '资产来源', children: selected.importSource ? `${selected.importSource} · ${selected.importedAt || '刚刚'}` : '已有网站资产' },
          ]} /><Alert className="site-health-alert" type={selected.status === '需处理' ? 'error' : selected.analysisEntry ? 'info' : selectedRule ? 'success' : 'warning'} showIcon title={selected.status === '需处理' ? '网站访问或采集规则需要处理，但不会改变已有采集计划和执行记录。' : selected.analysisEntry ? '该网站已有活动分析任务，可前往 AI 分析继续处理。' : selectedRule ? '该网站资产的 URL、访问方式和采集规则已经就绪。' : '网站资产已入库，尚未创建 AI 分析任务。'} /></div>}
      </Modal>

      <Modal
        className="site-import-modal"
        title="新增 URL"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        width={760}
        footer={<div className="site-import-footer"><Button type="link" icon={<DownloadOutlined />} onClick={downloadTemplate}>下载 CSV 模板</Button><span /><Button onClick={() => setImportOpen(false)}>取消</Button><Button type="primary" disabled={!importRows.some((row) => row.valid)} onClick={submitImport}>{analyzeAfterImport ? '新增并分析' : '新增'} {importRows.filter((row) => row.valid).length} 个 URL</Button></div>}
      >
        <Segmented
          block
          className="site-import-method"
          value={importMethod}
          options={[{ value: 'paste', label: '粘贴 URL' }, { value: 'file', label: '导入文件' }]}
          onChange={(value) => {
            setImportMethod(value)
            setImportRows(value === 'paste' ? resolveKnownSiteNames(pastedTextToSites(pastedUrls), sites) : [])
            setImportFileName(value === 'paste' && pastedUrls.trim() ? '批量粘贴' : '')
          }}
        />
        {importMethod === 'paste' ? (
          <div className="site-import-paste">
            <Input.TextArea
              value={pastedUrls}
              onChange={(event) => updatePastedUrls(event.target.value)}
              placeholder={'每行一个 URL，也可填写“网站名称,URL”\nhttps://example.com/notices\n示例采购网,https://procurement.example.com/list'}
              autoSize={{ minRows: 6, maxRows: 10 }}
              spellCheck={false}
            />
            <span>支持直接粘贴多行 URL；未填写名称时，系统将从网页标题和站点信息中识别网站名称。</span>
          </div>
        ) : (
          <label className={`site-import-dropzone ${importLoading ? 'loading' : ''}`}>
            <input type="file" accept=".csv,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleImportFile(file); event.target.value = '' }} />
            <span className="site-import-drop-icon"><InboxOutlined /></span>
            <strong>{importLoading ? '正在解析文件' : '选择 CSV 或 XLSX 文件'}</strong>
            <span>列：网站名称、网站 URL、采集频率</span>
          </label>
        )}
        <div className="site-import-analysis-option">
          <div><strong>新增后立即创建 AI 分析任务</strong><span>每个 URL 独立分析，结果统一进入 AI 分析队列</span></div>
          <Switch checked={analyzeAfterImport} onChange={setAnalyzeAfterImport} />
        </div>
        {importRows.length > 0 && (
          <section className="site-import-preview">
            <header><div><CheckOutlined /><span>已从 <strong>{importFileName}</strong> 解析到 {importRows.length} 条记录</span></div><span>{importRows.filter((row) => row.valid).length} 条可新增</span></header>
            <Table rowKey="key" size="small" columns={importColumns} dataSource={importRows.slice(0, 8)} pagination={false} scroll={{ x: 650 }} />
          </section>
        )}
      </Modal>
    </div>
  )
}
