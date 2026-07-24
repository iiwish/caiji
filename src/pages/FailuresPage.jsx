import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Button, Modal, Segmented, Select, Table, Tag, Tooltip } from 'antd'
import {
  CloseOutlined,
  EditOutlined,
  GlobalOutlined,
  ReloadOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { failureRows } from '../data'
import { EntityLink, RowActions } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { getSiteRulePath, getSiteWorkspacePath } from '../app/routes'

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
      nextAction: 'AI 诊断或编辑规则',
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

export function FailuresPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const { sites, rules, tasks, executions, startSiteAnalysis } = usePrototype()
  const [handlingScope, setHandlingScope] = useState('全部')
  const [errorCategory, setErrorCategory] = useState()
  const [retryingIds, setRetryingIds] = useState([])
  const [analysisQueuedIds, setAnalysisQueuedIds] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [batchFeedback, setBatchFeedback] = useState(null)

  const incidents = useMemo(() => buildIncidents(failureRows), [])
  const visibleIncidents = useMemo(() => incidents.filter((incident) => {
    const matchesHandling = handlingScope === '全部'
      || (handlingScope === '自动处理' && incident.handling.mode === 'retry')
      || (handlingScope === '人工处理' && incident.handling.mode === 'diagnose')
    const matchesCategory = !errorCategory || incident.err === errorCategory
    const matchesSearch = `${incident.site}${incident.pages.join('')}${incident.err}${incident.msg}${incident.code}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesHandling && matchesCategory && matchesSearch
  }), [errorCategory, handlingScope, incidents, search])

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

  const openManualRule = (incident) => {
    const { site, rule, sourceExecution } = getIncidentContext(incident)
    if (!site || !rule) {
      message.warning('当前网站还没有可编辑的采集规则，请使用 AI 重新生成')
      return
    }
    navigate(getSiteRulePath(site, {
      edit: '1',
      fromFailure: incident.id,
      fromExecution: sourceExecution?.id,
    }))
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
        sourceExecutionId: context.sourceExecution?.id || '',
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
      title: '影响',
      dataIndex: 'impact',
      width: 70,
      align: 'right',
      render: (value) => <span className="mono value-strong">{value}</span>,
    },
    {
      title: '处理状态',
      width: 92,
      render: (_, incident) => {
        const retrying = retryingIds.includes(incident.id)
        const analyzing = analysisQueuedIds.includes(incident.id)
        const status = retrying ? '重试中' : analyzing ? '诊断中' : incident.handling.status
        const tone = retrying ? 'queued' : analyzing ? 'analyzing' : incident.handling.mode
        return <span className={`failure-resolution-status ${tone}`}>{status}</span>
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
        return <RowActions
          primary={retryFirst
            ? { label: retrying ? '重试中' : '重试', disabled: retrying, onClick: () => queueRetry([incident]) }
            : { label: analyzing ? '诊断中' : '诊断', disabled: analyzing, onClick: () => runDiagnosis([incident], { openFirst: true }) }}
          menu={[
            ...(site ? [
              { key: 'site', icon: <GlobalOutlined />, label: '查看网站', onClick: () => navigate(getSiteWorkspacePath(site, 'overview')) },
              { type: 'divider' },
            ] : []),
            retryFirst
              ? { key: 'diagnose', icon: <RobotOutlined />, label: analyzing ? '诊断中' : 'AI 诊断', disabled: analyzing, onClick: () => runDiagnosis([incident], { openFirst: true }) }
              : { key: 'retry', icon: <ReloadOutlined />, label: retrying ? '重试中' : '重试失败页面', disabled: retrying, onClick: () => queueRetry([incident]) },
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
  const selectedIncidents = incidents.filter((incident) => selectedIds.includes(incident.id))
  const retryTargets = selectedIncidents.filter((incident) => !retryingIds.includes(incident.id))
  const diagnosisTargets = selectedIncidents.filter((incident) => !analysisQueuedIds.includes(incident.id))
  const retryFirstIncidents = incidents.filter((incident) => incident.handling.mode === 'retry')
  const diagnoseFirstIncidents = incidents.filter((incident) => incident.handling.mode === 'diagnose')
  const failureStats = [
    { label: '当前故障', value: incidents.length, meta: `影响 ${incidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面`, tone: 'red' },
    { label: '自动处理', value: retryFirstIncidents.length, meta: `影响 ${retryFirstIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面`, tone: 'blue' },
    { label: '人工处理', value: diagnoseFirstIncidents.length, meta: `影响 ${diagnoseFirstIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面`, tone: 'amber' },
    { label: '今日重试成功', value: RETRY_SUCCEEDED_TODAY, meta: '恢复正常采集', tone: 'green' },
  ]

  return (
    <div className="page-content failures-page">
      <div className="failure-stat-grid">
        {failureStats.map((stat) => (
          <section className="failure-stat-card" key={stat.label}>
            <div><i className={stat.tone} /><span>{stat.label}</span></div>
            <strong className="mono">{stat.value}</strong>
            <small>{stat.meta}</small>
          </section>
        ))}
      </div>

      <div className="failure-toolbar">
        <div className="failure-toolbar-filters">
          <Segmented
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
          />
          <Select
            allowClear
            value={errorCategory}
            placeholder="全部错误类型"
            options={ERROR_FILTERS.map((value) => ({ value, label: value }))}
            onChange={setErrorCategory}
          />
        </div>
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
          <Tooltip title={diagnosisTargets.length ? `诊断所选 ${diagnosisTargets.length} 个故障，同一网站会自动合并` : '请先选择需要诊断的故障'}>
            <span><Button type="primary" icon={<RobotOutlined />} disabled={!diagnosisTargets.length} onClick={() => runDiagnosis(diagnosisTargets)}>AI 诊断{diagnosisTargets.length ? `（${diagnosisTargets.length}）` : ''}</Button></span>
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
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys),
            columnWidth: 48,
            getCheckboxProps: (incident) => ({
              disabled: retryingIds.includes(incident.id) && analysisQueuedIds.includes(incident.id),
            }),
          }}
          locale={{ emptyText: search ? '没有匹配的故障事件' : '当前分类没有故障事件' }}
        />
      </section>
      <div className="failure-summary">当前显示 {visibleIncidents.length} 个故障事件 · 自动处理 {visibleIncidents.filter((incident) => incident.handling.mode === 'retry').length} 个 · 人工处理 {visibleIncidents.filter((incident) => incident.handling.mode === 'diagnose').length} 个 · 共影响 {visibleIncidents.reduce((sum, incident) => sum + incident.impact, 0)} 个页面</div>

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
            {activeIncident.diagnosis.kind === 'rule' && <Button icon={<EditOutlined />} disabled={!activeContext.rule} onClick={() => openManualRule(activeIncident)}>编辑规则</Button>}
            {['access', 'retry'].includes(activeIncident.diagnosis.kind) && activeIncident.handling.mode === 'diagnose' && <Button icon={<SettingOutlined />} onClick={() => openCollectionConfig(activeIncident)}>{activeIncident.diagnosis.kind === 'access' ? '调整采集配置' : '检查采集配置'}</Button>}
            <Button
              type={activeIncident.handling.mode === 'retry' ? 'primary' : 'default'}
              icon={<ReloadOutlined />}
              disabled={retryingIds.includes(activeIncident.id)}
              onClick={() => queueRetry([activeIncident])}
            >
              {retryingIds.includes(activeIncident.id) ? '重试中' : '重试失败页面'}
            </Button>
            <Button
              type={activeIncident.handling.mode === 'diagnose' ? 'primary' : 'default'}
              danger={activeIncident.diagnosis.kind === 'rule'}
              icon={<RobotOutlined />}
              disabled={analysisQueuedIds.includes(activeIncident.id)}
              onClick={() => runDiagnosis([activeIncident], { openFirst: true })}
            >
              {analysisQueuedIds.includes(activeIncident.id) ? '诊断中' : 'AI 诊断'}
            </Button>
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
                <span className={`failure-resolution-status ${retryingIds.includes(activeIncident.id) ? 'queued' : analysisQueuedIds.includes(activeIncident.id) ? 'analyzing' : activeIncident.handling.mode}`}>
                  {retryingIds.includes(activeIncident.id) ? '重试中' : analysisQueuedIds.includes(activeIncident.id) ? '诊断中' : activeIncident.handling.status}
                </span>
              </div>
              <h3>{activeIncident.handling.strategy}</h3>
              <p>{activeIncident.handling.reason}</p>
              <small>下一步：{retryingIds.includes(activeIncident.id)
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
              <div><span>影响页面</span><strong className="mono">{activeIncident.impact}</strong></div>
              <div><span>关联计划</span><strong className="mono">{activeContext.relatedTasks.length}</strong></div>
              <div><span>规则版本</span><strong className="mono">{activeContext.rule?.version || '-'}</strong></div>
              <div><span>重试进度</span><strong className="mono">{activeIncident.retries}</strong></div>
            </section>

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
