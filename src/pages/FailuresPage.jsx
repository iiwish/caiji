import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Button, Modal, Segmented, Table, Tag, Tooltip } from 'antd'
import {
  CloseOutlined,
  EditOutlined,
  ReloadOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { failureRows } from '../data'
import { RowActions, SourceCell } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { getSiteRulePath } from '../app/routes'

const FAILURE_STATS = [
  { label: '今日失败页面', value: 37, tone: 'red' },
  { label: '请求超时', value: 14, tone: 'amber' },
  { label: '解析失败', value: 11, tone: 'red' },
  { label: '反爬拦截', value: 8, tone: 'purple' },
]

const FAILURE_FILTERS = ['全部错误', '请求超时', '解析失败', '反爬拦截']

const ERROR_TONES = {
  请求超时: 'amber',
  解析失败: 'red',
  反爬拦截: 'purple',
  'HTTP 5xx': 'blue',
}

const INCIDENT_IMPACT = {
  PARSE_EMPTY: 12,
  ETIMEDOUT: 1,
  CAPTCHA: 8,
  HTTP_502: 3,
  FIELD_NULL: 6,
  ECONNTIMEOUT: 1,
}

function classifyFailure(row) {
  if (row.err === '解析失败') {
    return {
      kind: 'rule',
      stage: row.code === 'FIELD_NULL' ? '字段提取' : '列表解析',
      title: row.code === 'FIELD_NULL' ? '采集字段规则已失效' : '页面结构与当前规则不匹配',
      recommendation: '建议基于失败页面重新识别结构，生成候选规则并验证后发布。',
    }
  }
  if (row.err === '反爬拦截') {
    return {
      kind: 'access',
      stage: '页面访问',
      title: '目标网站触发访问校验',
      recommendation: '规则本身没有明确异常，应优先调整请求头、访问间隔或代理策略。',
    }
  }
  return {
    kind: 'retry',
    stage: row.err === 'HTTP 5xx' ? '服务响应' : '网络请求',
    title: row.err === 'HTTP 5xx' ? '目标服务暂时不可用' : '网络请求未在时限内完成',
    recommendation: '该错误通常可以恢复，建议保留当前规则并重试失败页面。',
  }
}

function buildIncidents(rows) {
  const groups = new Map()
  rows.forEach((row) => {
    const id = `${row.site}-${row.code}`
    const current = groups.get(id)
    if (current) {
      current.rows.push(row)
      current.pages.push(row.page)
      return
    }
    groups.set(id, {
      ...row,
      id,
      rows: [row],
      pages: [row.page],
      impact: INCIDENT_IMPACT[row.code] || 1,
      diagnosis: classifyFailure(row),
    })
  })
  return [...groups.values()]
}

function incidentLog(incident) {
  return incident.rows.flatMap((row) => [
    `${row.time} ERROR ${row.code}`,
    `${row.time} source=${row.site}`,
    `${row.time} page=${row.page}`,
    `${row.time} message=${row.msg}`,
    `${row.time} retries=${row.retries}`,
  ]).join('\n')
}

function absolutePageUrl(page, context) {
  if (/^https?:\/\//i.test(page)) return page
  const baseUrl = context.rule?.entryUrl || context.site?.entryUrl || (context.site?.host ? `https://${context.site.host}/` : '')
  if (!baseUrl) return page
  try {
    return new URL(page, baseUrl).toString()
  } catch {
    return page
  }
}

export function FailuresPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const { sites, rules, tasks, executions, startSiteAnalysis } = usePrototype()
  const [category, setCategory] = useState('全部错误')
  const [queuedIds, setQueuedIds] = useState([])
  const [analysisQueuedIds, setAnalysisQueuedIds] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [batchFeedback, setBatchFeedback] = useState(null)

  const incidents = useMemo(() => buildIncidents(failureRows), [])
  const visibleIncidents = useMemo(() => incidents.filter((incident) => {
    const matchesCategory = category === '全部错误' || incident.err === category
    const matchesSearch = `${incident.site}${incident.pages.join('')}${incident.err}${incident.msg}${incident.code}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesCategory && matchesSearch
  }), [category, incidents, search])

  useEffect(() => {
    const visibleIds = new Set(visibleIncidents.map((incident) => incident.id))
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.has(id))
      return next.length === current.length ? current : next
    })
  }, [visibleIncidents])

  const getIncidentContext = (incident) => {
    if (!incident) return { site: null, rule: null, relatedTasks: [], sourceExecution: null }
    const site = sites.find((item) => item.name === incident.site)
    const rule = rules.find((item) => item.site === incident.site || (site && item.siteHost === site.host))
    const relatedTasks = tasks.filter((task) => task.site === incident.site || task.ruleId === rule?.id)
    const sourceExecution = executions.find((execution) => execution.site === incident.site && ['失败', '部分失败'].includes(execution.status))
    return { site, rule, relatedTasks, sourceExecution }
  }

  const queueRetry = (rows) => {
    const newIds = rows.map((incident) => incident.id).filter((id) => !queuedIds.includes(id))
    if (!newIds.length) {
      message.info('所选故障已加入重试队列')
      return
    }
    setQueuedIds((current) => [...new Set([...current, ...newIds])])
    setSelectedIds((current) => current.filter((id) => !newIds.includes(id)))
    message.success(`已将 ${newIds.length} 个故障加入重试队列`)
  }

  const openCollectionConfig = (incident) => {
    const { site, relatedTasks } = getIncidentContext(incident)
    if (relatedTasks.length === 1) navigate(`/tasks?task=${encodeURIComponent(relatedTasks[0].id)}`)
    else if (site) navigate(`/tasks?site=${encodeURIComponent(site.host)}`)
    else message.warning('当前故障尚未关联网站资产')
  }

  const openManualRule = (incident) => {
    const { site, rule, sourceExecution } = getIncidentContext(incident)
    if (!site || !rule) {
      message.warning('当前网站还没有可编辑的采集规则，请使用 AI 重新生成')
      return
    }
    navigate(getSiteRulePath(site.host, {
      edit: '1',
      fromFailure: incident.id,
      fromExecution: sourceExecution?.id,
    }))
  }

  const regenerateRules = (requestedIncidents, { openFirst = false } = {}) => {
    const groupedByRule = new Map()

    requestedIncidents.forEach((incident) => {
      const context = getIncidentContext(incident)
      if (!context.site) return
      const key = context.rule?.id || context.site.host
      const group = groupedByRule.get(key) || { incident, context, incidentIds: [] }
      group.incidentIds.push(incident.id)
      groupedByRule.set(key, group)
    })

    if (!groupedByRule.size) {
      message.warning('所选故障尚未关联网站资产')
      return
    }

    const launched = [...groupedByRule.values()].map(({ incident, context, incidentIds }) => {
      const result = startSiteAnalysis({
        siteName: context.site.name,
        siteHost: context.site.host,
        url: context.rule?.entryUrl || context.site.entryUrl || `https://${context.site.host}`,
        ruleId: context.rule?.id,
        kind: 'diagnose',
        failureId: incident.id,
        sourceExecutionId: context.sourceExecution?.id || '',
      })
      const params = new URLSearchParams({ entry: result.entryId, site: context.site.host, mode: 'diagnose', fromFailure: incident.id })
      if (context.sourceExecution) params.set('fromExecution', context.sourceExecution.id)
      return { ...result, url: `/ai?${params.toString()}`, incidentIds, site: context.site.name }
    })

    const processedIds = launched.flatMap((item) => item.incidentIds)
    const createdCount = launched.filter((item) => !item.existing).length
    setAnalysisQueuedIds((current) => [...new Set([...current, ...processedIds])])
    setSelectedIds((current) => current.filter((id) => !processedIds.includes(id)))
    setSelectedIncident(null)

    if (openFirst) {
      navigate(launched[0].url)
      return
    }

    setBatchFeedback({
      count: launched.length,
      createdCount,
      existingCount: launched.length - createdCount,
      incidentCount: processedIds.length,
      firstUrl: launched[0].url,
    })
    message.success(`已为 ${launched.length} 个网站提交 AI 规则分析`)
  }

  const columns = [
    {
      title: '故障来源',
      width: 220,
      render: (_, incident) => (
        <div className="failure-source-cell">
          <SourceCell name={incident.site} host={incident.pages[0]} onClick={() => setSelectedIncident(incident)} ariaLabel={`处理 ${incident.site} 故障`} />
        </div>
      ),
    },
    {
      title: '错误类型',
      dataIndex: 'err',
      width: 95,
      render: (value) => <Tag variant="filled" className={`failure-error-tag ${ERROR_TONES[value] || 'gray'}`}>{value}</Tag>,
    },
    {
      title: '系统诊断',
      width: 250,
      render: (_, incident) => <div className="failure-message"><span>{incident.diagnosis.title}</span><code>{incident.code} · {incident.diagnosis.stage}</code></div>,
    },
    {
      title: '重试次数',
      dataIndex: 'retries',
      width: 80,
      render: (value) => <span className="mono failure-retries">{value}</span>,
    },
    {
      title: '系统建议',
      width: 90,
      render: (_, incident) => {
        const queued = queuedIds.includes(incident.id)
        const analyzing = analysisQueuedIds.includes(incident.id)
        const status = queued ? '重试中' : analyzing ? 'AI 分析中' : incident.diagnosis.kind === 'rule' ? '生成规则' : incident.diagnosis.kind === 'access' ? '调整配置' : '重试'
        return <span className={`failure-resolution-status ${queued ? 'queued' : analyzing ? 'analyzing' : incident.diagnosis.kind}`}>{status}</span>
      },
    },
    {
      title: '时间',
      dataIndex: 'time',
      width: 105,
      render: (value) => <span className="mono muted failure-time">{value}</span>,
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      align: 'right',
      render: (_, incident) => {
        const queued = queuedIds.includes(incident.id)
        const analyzing = analysisQueuedIds.includes(incident.id)
        return <RowActions
          primary={{ label: '诊断处理', onClick: () => setSelectedIncident(incident) }}
          quick={[{ key: 'retry', label: queued ? '重试中' : '重试失败页面', icon: <ReloadOutlined />, disabled: queued || analyzing, onClick: () => queueRetry([incident]) }]}
        />
      },
    },
  ]

  const activeContext = getIncidentContext(selectedIncident)
  const selectedIncidents = incidents.filter((incident) => selectedIds.includes(incident.id))
  const retryTargets = selectedIncidents.filter((incident) => !queuedIds.includes(incident.id))
  const ruleTargets = selectedIncidents.filter((incident) => !analysisQueuedIds.includes(incident.id))

  return (
    <div className="page-content failures-page">
      <div className="failure-stat-grid">
        {FAILURE_STATS.map((stat) => (
          <section className="failure-stat-card" key={stat.label}>
            <div><i className={stat.tone} /><span>{stat.label}</span></div>
            <strong className="mono">{stat.value}</strong>
          </section>
        ))}
      </div>

      <div className="failure-toolbar">
        <Segmented className="failure-filter" value={category} onChange={setCategory} options={FAILURE_FILTERS} />
        <div className="failure-toolbar-actions">
          {selectedIds.length > 0 && (
            <div className="failure-toolbar-selection">
              <span>已选 <strong className="mono">{selectedIds.length}</strong></span>
              <Tooltip title="取消选择"><Button type="text" aria-label="取消选择" icon={<CloseOutlined />} onClick={() => setSelectedIds([])} /></Tooltip>
            </div>
          )}
          <Tooltip title={retryTargets.length ? `重试所选 ${retryTargets.length} 个故障` : '请先选择需要重试的故障'}>
            <span><Button icon={<ReloadOutlined />} disabled={!retryTargets.length} onClick={() => queueRetry(retryTargets)}>重试{retryTargets.length ? `（${retryTargets.length}）` : ''}</Button></span>
          </Tooltip>
          <Tooltip title={ruleTargets.length ? `为所选 ${ruleTargets.length} 个故障生成规则，同一网站会自动合并` : '请先选择需要生成规则的故障'}>
            <span><Button type="primary" icon={<RobotOutlined />} disabled={!ruleTargets.length} onClick={() => regenerateRules(ruleTargets)}>生成规则{ruleTargets.length ? `（${ruleTargets.length}）` : ''}</Button></span>
          </Tooltip>
        </div>
      </div>

      {batchFeedback && (
        <Alert
          className="failure-batch-feedback"
          type="success"
          showIcon
          closable
          onClose={() => setBatchFeedback(null)}
          title={`已提交 ${batchFeedback.count} 个网站的 AI 规则分析`}
          description={`${batchFeedback.incidentCount} 个故障已按网站去重；新建 ${batchFeedback.createdCount} 个任务${batchFeedback.existingCount ? `，复用 ${batchFeedback.existingCount} 个活动任务并切换为失败诊断` : ''}。`}
          action={<Button onClick={() => navigate(batchFeedback.firstUrl)}>查看 AI 分析</Button>}
        />
      )}

      <section className="failure-table-surface">
        <Table
          className="failure-table"
          rowKey="id"
          columns={columns}
          dataSource={visibleIncidents}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: 1040 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys),
            columnWidth: 48,
            getCheckboxProps: (incident) => ({ disabled: queuedIds.includes(incident.id) || analysisQueuedIds.includes(incident.id) }),
          }}
          locale={{ emptyText: search ? '没有匹配的故障事件' : '当前分类没有故障事件' }}
        />
      </section>
      <div className="failure-summary">当前显示 {visibleIncidents.length} 个故障事件 · 共影响 {visibleIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面</div>

      <Modal
        className="failure-workbench-modal"
        title="故障处理"
        width={720}
        centered
        open={Boolean(selectedIncident)}
        onCancel={() => setSelectedIncident(null)}
        destroyOnHidden
        footer={selectedIncident && (
          <div className="failure-modal-actions">
            <Button onClick={() => setSelectedIncident(null)}>关闭</Button>
            {selectedIncident.diagnosis.kind === 'rule' && <Button icon={<EditOutlined />} disabled={!activeContext.rule} onClick={() => openManualRule(selectedIncident)}>手动编辑规则</Button>}
            {selectedIncident.diagnosis.kind === 'rule' && <Button type="primary" danger icon={<RobotOutlined />} onClick={() => regenerateRules([selectedIncident], { openFirst: true })}>{analysisQueuedIds.includes(selectedIncident.id) ? '查看 AI 分析' : 'AI 重新生成规则'}</Button>}
            {selectedIncident.diagnosis.kind === 'access' && <Button type="primary" icon={<SettingOutlined />} onClick={() => openCollectionConfig(selectedIncident)}>调整采集配置</Button>}
            <Button type={selectedIncident.diagnosis.kind === 'retry' ? 'primary' : 'default'} icon={<ReloadOutlined />} disabled={queuedIds.includes(selectedIncident.id) || analysisQueuedIds.includes(selectedIncident.id)} onClick={() => queueRetry([selectedIncident])}>{queuedIds.includes(selectedIncident.id) ? '已加入重试' : '重试失败页面'}</Button>
          </div>
        )}
      >
        {selectedIncident && (
          <div className="failure-workbench">
            <header>
              <div><strong>{selectedIncident.site}</strong><span className="mono">{selectedIncident.code}</span></div>
              <Tag variant="filled" className={`failure-error-tag ${ERROR_TONES[selectedIncident.err] || 'gray'}`}>{selectedIncident.err}</Tag>
            </header>

            <section className={`failure-diagnosis-panel ${selectedIncident.diagnosis.kind}`}>
              <span>{selectedIncident.diagnosis.stage}</span>
              <h3>{selectedIncident.diagnosis.title}</h3>
              <p>{selectedIncident.diagnosis.recommendation}</p>
            </section>

            <section className="failure-impact-grid">
              <div><span>影响页面</span><strong className="mono">{selectedIncident.impact}</strong></div>
              <div><span>关联计划</span><strong className="mono">{activeContext.relatedTasks.length}</strong></div>
              <div><span>规则版本</span><strong className="mono">{activeContext.rule?.version || '-'}</strong></div>
              <div><span>失败时间</span><strong className="mono">{selectedIncident.time}</strong></div>
            </section>

            <section className="failure-workbench-section">
              <div className="failure-section-heading"><h3>失败页面</h3><span>按错误指纹聚合</span></div>
              <div className="failure-page-list">
                {selectedIncident.pages.map((page) => <code key={page}>{absolutePageUrl(page, activeContext)}</code>)}
                {selectedIncident.impact > selectedIncident.pages.length && <span>另有 {selectedIncident.impact - selectedIncident.pages.length} 个同类页面</span>}
              </div>
            </section>

            <section className="failure-workbench-section">
              <div className="failure-section-heading"><h3>执行日志</h3><span>{selectedIncident.retries} 次重试</span></div>
              <pre className="failure-workbench-log">{incidentLog(selectedIncident)}</pre>
            </section>

            {activeContext.relatedTasks.length > 0 && (
              <button type="button" className="failure-related-task" onClick={() => openCollectionConfig(selectedIncident)}>
                <span>关联采集计划</span>
                <strong>{activeContext.relatedTasks.map((task) => task.name).join('、')}</strong>
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
