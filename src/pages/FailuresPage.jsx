import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Button, Modal, Segmented, Select, Table, Tag, Tooltip } from 'antd'
import {
  CloseOutlined,
  GlobalOutlined,
  HistoryOutlined,
  ReloadOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { failureRows } from '../data'
import { EntityLink, RowActions } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { getSiteWorkspacePath } from '../app/routes'

const HANDLING_FILTERS = ['全部', '自动处理', '人工处理']
const ERROR_FILTERS = ['请求超时', '解析失败', '反爬拦截', 'HTTP 5xx']
const RETRY_SUCCEEDED_TODAY = 23

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

function parseRetryProgress(value) {
  const [attempted = 0, maximum = 0] = String(value || '').split('/').map((item) => Number(item.trim()))
  return {
    attempted: Number.isFinite(attempted) ? attempted : 0,
    maximum: Number.isFinite(maximum) ? maximum : 0,
  }
}

function classifyHandling(row, diagnosis) {
  const retry = parseRetryProgress(row.retries)

  if (diagnosis.kind === 'rule') {
    return {
      mode: 'diagnose',
      label: '人工处理',
      status: '待诊断',
      strategy: 'AI 生成候选规则 + 回归验证',
      reason: row.code === 'FIELD_NULL'
        ? '关键业务字段提取异常，不能直接降级入库'
        : '页面结构变化需要审核新的生产规则',
      nextAction: 'AI 诊断并生成修复规则',
    }
  }

  if (diagnosis.kind === 'access') {
    return {
      mode: 'diagnose',
      label: '人工处理',
      status: '待诊断',
      strategy: '调整访问频率、请求身份或凭证',
      reason: row.code === 'CAPTCHA'
        ? '验证码或滑块验证不允许自动绕过'
        : '访问策略涉及凭证与合规配置',
      nextAction: '调整采集配置',
    }
  }

  if (row.code === 'HTTP_502') {
    return {
      mode: 'retry',
      label: '自动处理',
      status: '等待重试',
      strategy: '指数退避 + 服务可用性探测',
      reason: '外部服务短时异常，保持当前规则并等待恢复',
      nextAction: '5 分钟后自动探测',
    }
  }

  if (retry.attempted < retry.maximum) {
    return {
      mode: 'retry',
      label: '自动处理',
      status: '等待重试',
      strategy: '退避重试 + 节点切换',
      reason: `仍有 ${retry.maximum - retry.attempted} 次自动重试机会`,
      nextAction: '30 秒后自动重试',
    }
  }

  return {
    mode: 'diagnose',
    label: '人工处理',
    status: '待诊断',
    strategy: '检查网络、代理与目标站点连通性',
    reason: `自动重试已达到上限 ${retry.maximum} 次`,
    nextAction: '检查采集配置',
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
    const diagnosis = classifyFailure(row)
    groups.set(id, {
      ...row,
      id,
      rows: [row],
      pages: [row.page],
      impact: INCIDENT_IMPACT[row.code] || 1,
      diagnosis,
      handling: classifyHandling(row, diagnosis),
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

function workflowTone(status, fallback) {
  if (status === '已解决') return 'resolved'
  if (status === '重试中') return 'recovering'
  if (status === '验证中') return 'validating'
  if (status === '补采中') return 'recovering'
  if (['诊断中', '待修复规则'].includes(status)) return 'analyzing'
  return fallback
}

function workflowStatusLabel(status) {
  if (status === '补采中') return '数据恢复中'
  return status
}

export function FailuresPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const { sites, rules, tasks, executions, intakeBatches, failureWorkflows, startSiteAnalysis } = usePrototype()
  const [handlingScope, setHandlingScope] = useState('全部')
  const [errorCategory, setErrorCategory] = useState()
  const [retryingIds, setRetryingIds] = useState([])
  const [analysisQueuedIds, setAnalysisQueuedIds] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [batchFeedback, setBatchFeedback] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const baseIncidents = useMemo(() => buildIncidents(failureRows), [])
  const incidents = useMemo(() => {
    const analysisEntries = intakeBatches.flatMap((batch) => batch.urls)
    return baseIncidents.map((incident) => {
      const workflow = failureWorkflows[incident.id]
      if (!workflow) return incident
      const analysisEntry = analysisEntries.find((entry) => entry.id === workflow.analysisEntryId)
      const status = workflow.status === '诊断中' && analysisEntry && !['排队中', '分析中'].includes(analysisEntry.status)
        ? '待修复规则'
        : workflow.status
      return { ...incident, workflow: { ...workflow, status } }
    })
  }, [baseIncidents, failureWorkflows, intakeBatches])
  const scopedIncidents = useMemo(() => incidents.filter((incident) => (
    showHistory
      ? incident.workflow?.status === '已解决'
      : incident.workflow?.status !== '已解决'
  )), [incidents, showHistory])
  const visibleIncidents = useMemo(() => scopedIncidents.filter((incident) => {
    const matchesHandling = handlingScope === '全部'
      || (handlingScope === '自动处理' && incident.handling.mode === 'retry')
      || (handlingScope === '人工处理' && incident.handling.mode === 'diagnose')
    const matchesCategory = !errorCategory || incident.err === errorCategory
    const matchesSearch = `${incident.site}${incident.pages.join('')}${incident.err}${incident.msg}${incident.code}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesHandling && matchesCategory && matchesSearch
  }), [errorCategory, handlingScope, scopedIncidents, search])

  useEffect(() => {
    const visibleIds = new Set(visibleIncidents.map((incident) => incident.id))
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.has(id))
      return next.length === current.length ? current : next
    })
  }, [visibleIncidents])

  const getIncidentContext = (incident) => {
    if (!incident) return { site: null, rule: null, relatedTasks: [], sourceExecution: null, sourceExecutions: [] }
    const site = sites.find((item) => item.name === incident.site)
    const rule = rules.find((item) => item.site === incident.site || (site && item.siteHost === site.host))
    const relatedTasks = tasks.filter((task) => task.site === incident.site || task.ruleId === rule?.id)
    const sourceExecutions = executions.filter((execution) => {
      if (execution.site !== incident.site || !['失败', '部分失败'].includes(execution.status)) return false
      if (rule?.id && execution.ruleId && execution.ruleId !== rule.id) return false
      const failureText = `${execution.stage || ''}${execution.issue || ''}`
      if (incident.diagnosis.kind === 'rule') return /结构|列表|定位|选择器|解析|字段/.test(failureText)
      if (incident.diagnosis.kind === 'access') return /登录|验证码|封禁|访问|身份/.test(failureText)
      return /超时|HTTP|网络|服务/.test(failureText)
    })
    return { site, rule, relatedTasks, sourceExecution: sourceExecutions[0], sourceExecutions }
  }

  const queueRetry = (rows) => {
    const newIds = rows.map((incident) => incident.id).filter((id) => !retryingIds.includes(id))
    if (!newIds.length) {
      message.info('所选故障已经在重试中')
      return
    }
    setRetryingIds((current) => [...new Set([...current, ...newIds])])
    setSelectedIds((current) => current.filter((id) => !newIds.includes(id)))
    message.success(`已提交 ${newIds.length} 个故障重试任务`)
  }

  const openCollectionConfig = (incident) => {
    const { site } = getIncidentContext(incident)
    if (site) navigate(getSiteWorkspacePath(site, 'plan'))
    else message.warning('当前故障尚未关联网站资产')
  }

  const runDiagnosis = (requestedIncidents, { openFirst = false } = {}) => {
    const groupedBySite = new Map()

    requestedIncidents.forEach((incident) => {
      const context = getIncidentContext(incident)
      if (!context.site) return
      const key = context.rule?.id || context.site.host
      const group = groupedBySite.get(key) || { incident, context, incidentIds: [] }
      group.incidentIds.push(incident.id)
      groupedBySite.set(key, group)
    })

    if (!groupedBySite.size) {
      message.warning('所选故障尚未关联网站资产')
      return
    }

    const launched = [...groupedBySite.values()].map(({ incident, context, incidentIds }) => {
      const result = startSiteAnalysis({
        siteName: context.site.name,
        siteHost: context.site.host,
        url: context.rule?.entryUrl || context.site.entryUrl || `https://${context.site.host}`,
        ruleId: context.rule?.id,
        kind: 'diagnose',
        failureId: incident.id,
        failureIds: incidentIds,
        sourceExecutionId: context.sourceExecution?.id || '',
        sourceExecutionIds: context.sourceExecutions.map((execution) => execution.id),
        folderId: context.site.folderId,
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
    message.success(`已为 ${launched.length} 个网站提交故障诊断`)
  }

  const openWorkflow = (incident) => {
    const workflow = incident.workflow
    if (!workflow) return
    if (['重试中', '验证中', '补采中', '已解决'].includes(workflow.status)) {
      const executionId = workflow.retryExecutionId
        || (workflow.status === '验证中'
          ? workflow.validationExecutionId
          : workflow.recoveryExecutionId || workflow.validationExecutionId)
      if (executionId) navigate(`/executions/${executionId}`)
      return
    }
    if (workflow.analysisEntryId) {
      const params = new URLSearchParams({ entry: workflow.analysisEntryId, mode: 'diagnose', fromFailure: incident.id })
      if (workflow.sourceExecutionId) params.set('fromExecution', workflow.sourceExecutionId)
      navigate(`/ai?${params.toString()}`)
    }
  }

  const columns = [
    {
      title: '网站',
      dataIndex: 'site',
      width: 170,
      render: (value) => <span className="table-single-value" title={value}>{value}</span>,
    },
    {
      title: '错误类型',
      dataIndex: 'err',
      width: 90,
      render: (value) => <Tag variant="filled" className={`failure-error-tag ${ERROR_TONES[value] || 'gray'}`}>{value}</Tag>,
    },
    {
      title: '失败页面',
      width: 230,
      render: (_, incident) => <EntityLink className="failure-incident-link" title={incident.pages[0]} titleClassName="mono failure-incident-path" onClick={() => setSelectedIncident(incident)} ariaLabel={`处理 ${incident.site} 的${incident.err}故障`} />,
    },
    {
      title: '处理方式',
      width: 84,
      render: (_, incident) => <span className={`failure-handling-tag ${incident.handling.mode}`}>{incident.handling.label}</span>,
    },
    {
      title: '系统诊断',
      width: 180,
      render: (_, incident) => <span className="table-single-value" title={incident.diagnosis.title}>{incident.diagnosis.title}</span>,
    },
    {
      title: '影响页面',
      dataIndex: 'impact',
      width: 82,
      align: 'right',
      render: (value) => <span className="mono value-strong">{value}</span>,
    },
    {
      title: '处理状态',
      width: 92,
      render: (_, incident) => {
        const retrying = retryingIds.includes(incident.id)
        const analyzing = analysisQueuedIds.includes(incident.id)
        const status = incident.workflow?.status || (retrying ? '重试中' : analyzing ? '诊断中' : incident.handling.status)
        const tone = workflowTone(status, retrying ? 'queued' : analyzing ? 'analyzing' : incident.handling.mode)
        return <span className={`failure-resolution-status ${tone}`}>{workflowStatusLabel(status)}</span>
      },
    },
    {
      title: '时间',
      dataIndex: 'time',
      width: 86,
      render: (value) => <span className="mono muted failure-time">{value}</span>,
    },
    {
      title: '操作',
      width: 116,
      fixed: 'right',
      align: 'right',
      render: (_, incident) => {
        const retrying = retryingIds.includes(incident.id)
        const analyzing = analysisQueuedIds.includes(incident.id)
        const retryFirst = incident.handling.mode === 'retry'
        const { site } = getIncidentContext(incident)
        const workflowStatus = incident.workflow?.status
        const workflowPrimary = workflowStatus
          ? {
              label: workflowStatus === '已解决' ? '查看结果' : workflowStatus === '重试中' ? '查看重试' : workflowStatus === '补采中' ? '查看恢复' : workflowStatus === '验证中' ? '查看验证' : '查看诊断',
              onClick: () => workflowStatus === '已解决' ? setSelectedIncident(incident) : openWorkflow(incident),
            }
          : null
        return <RowActions
          primary={workflowPrimary || (retryFirst
            ? { label: retrying ? '重试中' : '重试', disabled: retrying, onClick: () => queueRetry([incident]) }
            : { label: analyzing ? '诊断中' : '诊断', disabled: analyzing, onClick: () => runDiagnosis([incident], { openFirst: true }) })}
          menu={[
            ...(site ? [
              { key: 'site', icon: <GlobalOutlined />, label: '查看网站', onClick: () => navigate(getSiteWorkspacePath(site, 'overview')) },
              { type: 'divider' },
            ] : []),
            ...(!workflowStatus && retryFirst
              ? [{ key: 'diagnose', icon: <RobotOutlined />, label: analyzing ? '诊断中' : 'AI 诊断', disabled: analyzing, onClick: () => runDiagnosis([incident], { openFirst: true }) }]
              : []),
          ]}
          moreLabel="更多"
        />
      },
    },
  ]

  const activeIncident = selectedIncident
    ? incidents.find((incident) => incident.id === selectedIncident.id) || selectedIncident
    : null
  const activeContext = getIncidentContext(activeIncident)
  const activeRetryExecution = executions.find((execution) => execution.id === (
    activeIncident?.workflow?.retryExecutionId
      || activeIncident?.workflow?.recoveryExecutionId
      || activeIncident?.workflow?.validationExecutionId
  ))
  const selectedIncidents = incidents.filter((incident) => selectedIds.includes(incident.id))
  const retryTargets = selectedIncidents.filter((incident) => incident.handling.mode === 'retry' && !incident.workflow && !retryingIds.includes(incident.id))
  const diagnosisTargets = selectedIncidents.filter((incident) => !incident.workflow && !analysisQueuedIds.includes(incident.id))
  const openIncidents = incidents.filter((incident) => incident.workflow?.status !== '已解决')
  const retryFirstIncidents = openIncidents.filter((incident) => incident.handling.mode === 'retry')
  const diagnoseFirstIncidents = openIncidents.filter((incident) => incident.handling.mode === 'diagnose')
  const resolvedIncidents = incidents.filter((incident) => incident.workflow?.status === '已解决')
  const failureStats = [
    { label: '当前故障', value: openIncidents.length, meta: `影响 ${openIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面`, tone: 'red' },
    { label: '自动处理', value: retryFirstIncidents.length, meta: `影响 ${retryFirstIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面`, tone: 'blue' },
    { label: '人工处理', value: diagnoseFirstIncidents.length, meta: `影响 ${diagnoseFirstIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面`, tone: 'amber' },
    { label: '今日重试成功', value: RETRY_SUCCEEDED_TODAY, meta: '恢复正常采集', tone: 'green' },
  ]

  return (
    <div className="page-content failures-page">
      {!showHistory && <div className="failure-stat-grid">
        {failureStats.map((stat) => (
          <section className="failure-stat-card" key={stat.label}>
            <div><i className={stat.tone} /><span>{stat.label}</span></div>
            <strong className="mono">{stat.value}</strong>
            <small>{stat.meta}</small>
          </section>
        ))}
      </div>}

      {showHistory && (
        <Alert
          className="failure-history-alert"
          type="info"
          showIcon
          icon={<HistoryOutlined />}
          title="故障历史"
          description="这里仅保留已经完成处置的聚合故障；日常失败队列只展示仍需处理或正在处理的问题。"
        />
      )}

      <div className="failure-toolbar">
        <div className="failure-toolbar-filters">
          {!showHistory && <Segmented
            className="failure-filter"
            value={handlingScope}
            onChange={setHandlingScope}
            options={HANDLING_FILTERS.map((value) => ({
              value,
              label: value === '自动处理'
                ? `自动处理 ${retryFirstIncidents.length}`
                : value === '人工处理'
                  ? `人工处理 ${diagnoseFirstIncidents.length}`
                  : value,
            }))}
          />}
          <Select
            allowClear
            value={errorCategory}
            placeholder="全部错误类型"
            options={ERROR_FILTERS.map((value) => ({ value, label: value }))}
            onChange={setErrorCategory}
          />
        </div>
        <div className="failure-toolbar-actions">
          <Button
            icon={<HistoryOutlined />}
            onClick={() => {
              setShowHistory((current) => !current)
              setHandlingScope('全部')
              setSelectedIds([])
              setSelectedIncident(null)
            }}
          >
            {showHistory ? '返回失败队列' : `故障历史${resolvedIncidents.length ? `（${resolvedIncidents.length}）` : ''}`}
          </Button>
          {!showHistory && selectedIds.length > 0 && (
            <div className="failure-toolbar-selection">
              <span>已选 <strong className="mono">{selectedIds.length}</strong></span>
              <Tooltip title="取消选择"><Button type="text" aria-label="取消选择" icon={<CloseOutlined />} onClick={() => setSelectedIds([])} /></Tooltip>
            </div>
          )}
          {!showHistory && <Tooltip title={retryTargets.length ? `重试所选 ${retryTargets.length} 个故障` : '请先选择需要重试的故障'}>
            <span><Button icon={<ReloadOutlined />} disabled={!retryTargets.length} onClick={() => queueRetry(retryTargets)}>重试{retryTargets.length ? `（${retryTargets.length}）` : ''}</Button></span>
          </Tooltip>}
          {!showHistory && <Tooltip title={diagnosisTargets.length ? `诊断所选 ${diagnosisTargets.length} 个故障，同一网站会自动合并` : '请先选择需要诊断的故障'}>
            <span><Button type="primary" icon={<RobotOutlined />} disabled={!diagnosisTargets.length} onClick={() => runDiagnosis(diagnosisTargets)}>AI 诊断{diagnosisTargets.length ? `（${diagnosisTargets.length}）` : ''}</Button></span>
          </Tooltip>}
        </div>
      </div>

      {!showHistory && batchFeedback && (
        <Alert
          className="failure-batch-feedback"
          type="success"
          showIcon
          closable
          onClose={() => setBatchFeedback(null)}
          title={`已提交 ${batchFeedback.count} 个网站的故障诊断`}
          description={`${batchFeedback.incidentCount} 个故障已按网站去重；新建 ${batchFeedback.createdCount} 个诊断任务${batchFeedback.existingCount ? `，复用 ${batchFeedback.existingCount} 个活动任务` : ''}。`}
          action={<Button onClick={() => navigate(batchFeedback.firstUrl)}>查看诊断</Button>}
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
          scroll={{ x: 1166 }}
          rowSelection={showHistory ? undefined : {
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys),
            columnWidth: 48,
            getCheckboxProps: (incident) => ({
              disabled: Boolean(incident.workflow) || (retryingIds.includes(incident.id) && analysisQueuedIds.includes(incident.id)),
            }),
          }}
          locale={{ emptyText: search ? '没有匹配的故障事件' : showHistory ? '暂无已解决故障' : '当前没有需要处理的故障' }}
        />
      </section>
      <div className="failure-summary">{showHistory
        ? `当前显示 ${visibleIncidents.length} 个已解决故障 · 共影响 ${visibleIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面`
        : `当前显示 ${visibleIncidents.length} 个待处理或处理中故障 · 共影响 ${visibleIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面`}</div>

      <Modal
        className="failure-workbench-modal"
        title="故障处理"
        width={720}
        centered
        open={Boolean(activeIncident)}
        onCancel={() => setSelectedIncident(null)}
        destroyOnHidden
        footer={activeIncident && (
          <div className="failure-modal-actions">
            <Button onClick={() => setSelectedIncident(null)}>关闭</Button>
            {['access', 'retry'].includes(activeIncident.diagnosis.kind) && activeIncident.handling.mode === 'diagnose' && <Button icon={<SettingOutlined />} onClick={() => openCollectionConfig(activeIncident)}>{activeIncident.diagnosis.kind === 'access' ? '调整采集配置' : '检查采集配置'}</Button>}
            {activeIncident.handling.mode === 'retry' && !activeIncident.workflow && <Button
              type={activeIncident.handling.mode === 'retry' ? 'primary' : 'default'}
              icon={<ReloadOutlined />}
              disabled={retryingIds.includes(activeIncident.id)}
              onClick={() => queueRetry([activeIncident])}
            >
              {retryingIds.includes(activeIncident.id) ? '重试中' : '重试失败页面'}
            </Button>}
            {!activeIncident.workflow && <Button
              type={activeIncident.handling.mode === 'diagnose' ? 'primary' : 'default'}
              danger={activeIncident.diagnosis.kind === 'rule'}
              icon={<RobotOutlined />}
              disabled={analysisQueuedIds.includes(activeIncident.id)}
              onClick={() => runDiagnosis([activeIncident], { openFirst: true })}
            >
              {analysisQueuedIds.includes(activeIncident.id) ? '诊断中' : 'AI 诊断'}
            </Button>}
            {activeIncident.workflow && <Button type="primary" icon={<RobotOutlined />} onClick={() => openWorkflow(activeIncident)}>
              {activeIncident.workflow.status === '已解决' ? '查看重试结果' : activeIncident.workflow.status === '重试中' ? '查看重试进度' : activeIncident.workflow.status === '补采中' ? '查看数据恢复' : activeIncident.workflow.status === '验证中' ? '查看规则验证' : '查看诊断任务'}
            </Button>}
          </div>
        )}
      >
        {activeIncident && (
          <div className="failure-workbench">
            <header>
              <div><strong>{activeIncident.site}</strong><span className="mono">{activeIncident.code}</span></div>
              <Tag variant="filled" className={`failure-error-tag ${ERROR_TONES[activeIncident.err] || 'gray'}`}>{activeIncident.err}</Tag>
            </header>

            <section className={`failure-handling-panel ${activeIncident.handling.mode}`}>
              <div>
                <span className={`failure-handling-tag ${activeIncident.handling.mode}`}>{activeIncident.handling.label}</span>
                <span className={`failure-resolution-status ${workflowTone(activeIncident.workflow?.status, retryingIds.includes(activeIncident.id) ? 'queued' : analysisQueuedIds.includes(activeIncident.id) ? 'analyzing' : activeIncident.handling.mode)}`}>
                  {workflowStatusLabel(activeIncident.workflow?.status || (retryingIds.includes(activeIncident.id) ? '重试中' : analysisQueuedIds.includes(activeIncident.id) ? '诊断中' : activeIncident.handling.status))}
                </span>
              </div>
              <h3>{activeIncident.diagnosis.kind === 'rule' && activeIncident.workflow ? '使用新规则重试' : activeIncident.handling.strategy}</h3>
              <p>{activeIncident.handling.reason}</p>
              <small>下一步：{activeIncident.workflow?.status === '重试中'
                ? '系统正在用新规则完成验证、合并缺口采集和范围对账'
                : activeIncident.workflow?.status === '验证中'
                ? '系统正在验证新规则，通过后自动恢复已锁定的数据范围'
                : activeIncident.workflow?.status === '补采中'
                  ? '系统正在按锁定范围重新执行并完成游标对账'
                  : activeIncident.workflow?.status === '已解决'
                    ? '原失败执行保留失败事实，处置结果已关联到本次故障重试'
                    : activeIncident.workflow?.status === '待修复规则'
                      ? '完成规则订正和自动回归，确认范围后发布规则并重试'
                      : retryingIds.includes(activeIncident.id)
                ? '正在重试失败页面并验证结果'
                : analysisQueuedIds.includes(activeIncident.id)
                  ? '正在分析错误原因并生成处理建议'
                  : activeIncident.handling.nextAction}</small>
            </section>

            <section className={`failure-diagnosis-panel ${activeIncident.diagnosis.kind}`}>
              <span>{activeIncident.diagnosis.stage}</span>
              <h3>{activeIncident.diagnosis.title}</h3>
              <p>{activeIncident.diagnosis.recommendation}</p>
            </section>

            <section className="failure-impact-grid">
              <div><span>故障影响页面</span><strong className="mono">{activeIncident.impact}</strong></div>
              <div><span>失败执行</span><strong className="mono">{activeContext.sourceExecutions.length}</strong></div>
              <div><span>规则版本</span><strong className="mono">{activeContext.rule?.version || '-'}</strong></div>
              <div><span>原执行重试</span><strong className="mono">{activeIncident.retries}</strong></div>
            </section>

            {activeIncident.workflow?.recoveryPlan && (
              <section className="failure-workbench-section failure-recovery-plan">
                <div className="failure-section-heading"><h3>合并重试范围</h3><span>{activeIncident.workflow.recoveryPlan.mode}</span></div>
                <div className="failure-recovery-grid">
                  <div><span>范围起点</span><strong>{activeIncident.workflow.recoveryPlan.start}</strong></div>
                  <div><span>范围终点</span><strong>{activeIncident.workflow.recoveryPlan.end}</strong></div>
                  <div><span>区间口径</span><strong>{activeIncident.workflow.recoveryPlan.boundary || '起点不含，终点包含；失败执行不推进游标'}</strong></div>
                  <div><span>范围依据</span><strong>{activeIncident.workflow.recoveryPlan.basis}</strong></div>
                  <div><span>入库与对账</span><strong>{activeIncident.workflow.reconciliation || activeIncident.workflow.recoveryPlan.deduplication}</strong></div>
                  <div><span>关闭条件</span><strong>{activeIncident.workflow.recoveryPlan.closure || '故障重试成功且范围对账无未覆盖游标后关闭故障'}</strong></div>
                  {activeRetryExecution?.status === '成功' && <div><span>重试数量口径</span><strong>故障影响 {activeIncident.impact} 个页面；重试发现 {activeRetryExecution.discovered} 条，入库 {activeRetryExecution.articles} 条，重复 {Math.max(0, activeRetryExecution.discovered - activeRetryExecution.articles)} 条</strong></div>}
                </div>
                <div className="failure-recovery-links">
                  <span>原失败执行：{activeIncident.workflow.sourceExecutionIds?.join('、') || activeIncident.workflow.sourceExecutionId || '未关联'}</span>
                  {activeIncident.workflow.retryExecutionId
                    ? <span>故障重试执行：{activeIncident.workflow.retryExecutionId}（验证、采集与对账合并记录）</span>
                    : <><span>规则验证执行：{activeIncident.workflow.validationExecutionId || '待创建'}</span><span>数据恢复执行：{activeIncident.workflow.recoveryExecutionId || '待创建'}</span></>}
                </div>
              </section>
            )}

            <section className="failure-workbench-section">
              <div className="failure-section-heading"><h3>失败页面</h3><span>按错误指纹聚合</span></div>
              <div className="failure-page-list">
                {activeIncident.pages.map((page) => <code key={page}>{absolutePageUrl(page, activeContext)}</code>)}
                {activeIncident.impact > activeIncident.pages.length && <span>另有 {activeIncident.impact - activeIncident.pages.length} 个同类页面</span>}
              </div>
            </section>

            <section className="failure-workbench-section">
              <div className="failure-section-heading"><h3>执行日志</h3><span>{activeIncident.time}</span></div>
              <pre className="failure-workbench-log">{incidentLog(activeIncident)}</pre>
            </section>

            {activeContext.relatedTasks.length > 0 && (
              <button type="button" className="failure-related-task" onClick={() => openCollectionConfig(activeIncident)}>
                <span>关联采集计划</span>
                <strong>{activeContext.relatedTasks.map((task) => `${task.site}采集计划`).join('、')}</strong>
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
