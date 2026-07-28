import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Button, DatePicker, Grid, Input, Modal, Select, Table } from 'antd'
import { CalendarOutlined, CheckCircleOutlined, ClearOutlined, DatabaseOutlined, GlobalOutlined, ReloadOutlined, SearchOutlined, ToolOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { EntityLink, RowActions, SectionCard, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { recordDetails } from '../data'
import { getSiteRulePath, getSiteWorkspacePath } from '../app/routes'
import { getExecutionAttemptCount, getExecutionAttempts } from '../app/executionModel'

const { RangePicker } = DatePicker
const EXECUTION_STATUS_OPTIONS = ['进行中', '成功', '需要处理', '处理中', '已处置', '已取消']

function getExecutionType(row, tasks) {
  if (row.collectionType === '故障重试' || row.purpose === '故障重试') return '故障重试'
  if (row.collectionType === '修复验证') return '规则验证'
  if (row.collectionType === '缺口补采') return '数据恢复'
  if (row.collectionType) return row.collectionType
  if (row.purpose === '修复验证') return '规则验证'
  if (row.purpose === '缺口补采') return '数据恢复'
  const task = tasks.find((item) => item.id === row.taskId)
  const scope = task?.scope || '增量'
  return task?.executionMode === '单次' ? `单次${scope}` : `定时${scope}`
}

function getExecutionResult(row) {
  if (row.purpose === '修复验证') return `${row.validationPassed || row.discovered || 0}/${row.validationTotal || row.discovered || 5} 样本`
  return `${row.articles.toLocaleString()} 条入库`
}

function getExecutionBusinessStatus(row, workflow) {
  const originalStatus = row.status === '部分失败' ? '部分成功' : row.status
  if (row.resolution || workflow?.status === '已解决') {
    return { label: `${originalStatus} · 已处置`, group: '已处置' }
  }
  if (['失败', '部分失败', '部分成功'].includes(row.status)) {
    if (['诊断中', '重试中', '验证中', '补采中'].includes(workflow?.status)) {
      return { label: `${originalStatus} · 处理中`, group: '处理中' }
    }
    return { label: `${originalStatus} · 待处理`, group: '需要处理' }
  }
  if (['排队中', '运行中', '重试中'].includes(row.status)) {
    return { label: row.status, group: '进行中' }
  }
  if (row.status === '成功') return { label: getExecutionAttemptCount(row) > 1 ? '成功（重试后）' : '成功', group: '成功' }
  if (['已取消', '取消'].includes(row.status)) return { label: '已取消', group: '已取消' }
  return { label: row.status, group: row.status }
}

function getExecutionDate(value) {
  if (!value || value === '-') return null
  const date = dayjs(`2026-${value}`)
  return date.isValid() ? date : null
}

function getBatchId(execution) {
  return `B-20726-${execution.id.replace('EX-', '')}`
}

function isRuleFailure(row) {
  return row.status === '失败' && (row.stage === '列表发现' || /结构|定位|选择器|解析/.test(row.issue || ''))
}

function getExecutionRulePath(row, includeSource = false) {
  try {
    const host = new URL(row.url).host.replace(/^www\./, '')
    return getSiteRulePath(host, includeSource ? { fromExecution: row.id } : {})
  } catch {
    return '/sites'
  }
}

function getBatchRecords(execution) {
  if (!execution?.articles) return []
  return recordDetails.slice(0, Math.min(recordDetails.length, execution.articles)).map((record, index) => {
    const detailUrl = `/notice/detail/${8800 + index}.html`
    const projectNo = `ZB-2026-${String(7000 + index * 13).padStart(5, '0')}`
    const raw = `<html>
<head><title>${record.title}</title></head>
<body>
  <div class="notice-detail">
    <h1 class="tit">${record.title}</h1>
    <div class="info">发布时间：${record.date}  采购单位：${record.buyer}  公告类型：${record.type}</div>
    <div class="content">
      <p>受采购人委托，现对本项目进行${record.type}，欢迎符合资格条件的供应商参与投标。</p>
      <p>一、项目编号：${projectNo}</p>
      <p>二、获取采购文件的时间、地点及方式：详见公告正文。</p>
      <p>三、响应截止时间：2026-07-${String(20 + (index % 8)).padStart(2, '0')} 17:00。</p>
    </div>
  </div>
</body>
</html>`
    return { ...record, key: `${execution.id}-${record.key}`, detailUrl, raw }
  })
}

function BatchDetailsModal({ execution, open, onClose, onRepairRule, onRetry, onViewRule, onViewTask, onViewExecution }) {
  const [detailSearch, setDetailSearch] = useState('')
  const [page, setPage] = useState(1)
  const records = useMemo(() => getBatchRecords(execution), [execution])
  const visibleRecords = useMemo(() => {
    const keyword = detailSearch.trim().toLowerCase()
    if (!keyword) return records
    return records.filter((record) => (
      `${record.title}${record.date}${record.buyer}${record.type}${record.detailUrl}`.toLowerCase().includes(keyword)
    ))
  }, [detailSearch, records])
  const isValidation = execution?.purpose === '修复验证'
  const isFailureRetry = execution?.purpose === '故障重试'
  const validationPassed = execution?.validationPassed || execution?.discovered || 0
  const validationTotal = execution?.validationTotal || execution?.discovered || 5
  const sourceExecutionCount = execution?.recoveryPlan?.sourceExecutionIds?.length || (execution?.retryOf ? 1 : 0)
  const attempts = getExecutionAttempts(execution)
  const hasRetryHistory = attempts.length > 1

  useEffect(() => {
    setDetailSearch('')
    setPage(1)
  }, [execution?.id])

  const columns = [
    { title: '公告标题', dataIndex: 'title', width: 360, render: (value) => <strong className="batch-record-title">{value}</strong> },
    { title: '发布时间', dataIndex: 'date', width: 120, render: (value) => <span className="mono batch-record-date">{value}</span> },
    { title: '采购单位', dataIndex: 'buyer', width: 145 },
    { title: '类型', dataIndex: 'type', width: 100, render: (value) => <span className="batch-record-type">{value}</span> },
  ]

  return (
    <Modal
      className="batch-details-modal"
      width={860}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      title={execution && (
        <div className="batch-details-title">
          <span className="batch-details-title-icon"><DatabaseOutlined /></span>
          <div>
            <div className="batch-details-title-line"><strong>采集明细</strong><span className="mono">{getBatchId(execution)}</span></div>
            <p>{execution.site} · {execution.collectionType || execution.purpose || '采集执行'} · {isValidation ? <>验证样本 <b className="mono">{validationPassed}/{validationTotal}</b></> : <>入库 <b className="mono">{execution.articles.toLocaleString()}</b> 条</>} · <b className="mono">{attempts.length}</b> 次尝试 · {execution.finishedAt}{sourceExecutionCount > 1 ? <> · 关联 <b className="mono">{sourceExecutionCount}</b> 个原失败执行</> : execution.retryOf ? <> · 关联原执行 <b className="mono">{getBatchId({ id: execution.retryOf })}</b></> : null}</p>
          </div>
        </div>
      )}
    >
      {execution?.resolution && (
        <Alert
          className="execution-resolution-alert"
          type="success"
          showIcon
          title="原执行结果保留为失败，关联故障已经完成处置"
          description={`修复规则 ${execution.resolution.ruleVersion} 已通过验证，并完成 ${execution.resolution.recoveryPlan?.start || '最后成功游标'} 到 ${execution.resolution.recoveryPlan?.end || '修复发布时刻'} 的故障重试。`}
          action={<Button type="primary" onClick={() => onViewExecution(execution.resolution.retryExecutionId || execution.resolution.recoveryExecutionId)}>查看重试结果</Button>}
        />
      )}
      {execution?.recoveryPlan && (
        <Alert
          className="execution-recovery-alert"
          type={['缺口补采', '故障重试'].includes(execution.purpose) ? 'warning' : 'info'}
          showIcon
          title={isFailureRetry
            ? `一次故障重试覆盖 ${sourceExecutionCount} 个原失败执行`
            : execution.purpose === '缺口补采'
              ? '本执行用于恢复历史缺口，不覆盖原失败执行'
              : '新规则验证通过后自动开始数据恢复'}
          description={`${execution.recoveryPlan.start} → ${execution.recoveryPlan.end}；${execution.recoveryPlan.boundary || '起点不含，终点包含；失败执行不推进游标'}；${execution.recoveryPlan.basis}；${execution.reconciliation || execution.recoveryPlan.deduplication}。`}
        />
      )}
      {hasRetryHistory && execution?.status === '成功' && (
        <Alert
          className="execution-retry-success-alert"
          type="success"
          showIcon
          title={`同一采集记录在第 ${attempts.length} 次尝试后成功`}
          description="采集记录 ID 和采集区间保持不变；失败尝试的状态、规则版本和日志继续保留在下方尝试历史中。"
        />
      )}
      {execution?.status === '重试中' && (
        <Alert
          className="execution-retry-success-alert"
          type="info"
          showIcon
          title={`正在执行第 ${attempts.length} 次尝试`}
          description="本次重试不会新增采集记录，完成后会直接更新当前记录的最终状态。"
        />
      )}
      {execution && ['失败', '部分失败'].includes(execution.status) && (
        <Alert
          className="execution-diagnostic-alert"
          type={execution.status === '失败' ? 'error' : 'warning'}
          showIcon
          title={`${execution.stage || '采集执行'}：${execution.issue || '执行过程中存在失败项'}`}
          description={<div className="execution-diagnostic-meta"><span>规则 <b className="mono">{execution.ruleId} · {execution.ruleVersion}</b></span><span>执行耗时 <b className="mono">{execution.duration}</b></span></div>}
          action={execution.resolution
            ? <Button onClick={() => onViewRule(execution)}>查看修复规则</Button>
            : isRuleFailure(execution)
              ? <Button type="primary" danger icon={<ToolOutlined />} onClick={() => onRepairRule(execution)}>修复网站规则</Button>
            : <Button type="primary" icon={<ReloadOutlined />} onClick={() => onRetry(execution)}>重试本次执行</Button>}
        />
      )}
      {isFailureRetry && (
        <section className="execution-validation-result" aria-label="故障重试过程">
          <CheckCircleOutlined />
          <div><span>故障重试过程</span><strong>{execution.status === '成功' ? '规则验证、缺口采集和范围对账均已完成' : '正在验证新规则并恢复合并缺口'}</strong><small>这三个阶段归入同一条故障重试记录；所有原失败执行单独保留并关联到本记录。</small></div>
        </section>
      )}
      {attempts.length > 0 && (
        <section className="execution-attempt-history" aria-label="执行尝试历史">
          <header>
            <div><h3>执行尝试</h3><span>同一采集记录 · {attempts.length} 次</span></div>
            <small>重试不会新增顶层采集记录</small>
          </header>
          <div className="execution-attempt-list">
            {[...attempts].reverse().map((attempt, index) => (
              <article className={index === 0 ? 'latest' : ''} key={attempt.number}>
                <div className="execution-attempt-head">
                  <strong>尝试 #{attempt.number}</strong>
                  <StatusTag value={attempt.status === '部分失败' ? '部分成功' : attempt.status} />
                  {index === 0 && <span>最近一次</span>}
                  <time className="mono">{attempt.startedAt || '—'} → {attempt.finishedAt || '—'}</time>
                </div>
                <dl>
                  <div><dt>规则版本</dt><dd className="mono">{attempt.ruleVersion || execution.ruleVersion || '—'}</dd></div>
                  <div><dt>发现</dt><dd className="mono">{attempt.discovered || 0}</dd></div>
                  <div><dt>入库</dt><dd className="mono">{attempt.articles || 0}</dd></div>
                  <div><dt>耗时</dt><dd className="mono">{attempt.duration || '—'}</dd></div>
                </dl>
                {(attempt.issue || attempt.logs?.length > 0) && (
                  <details open={index === 0 && ['失败', '部分失败', '重试中'].includes(attempt.status)}>
                    <summary>{attempt.issue || `${attempt.logs.length} 条执行日志`}</summary>
                    <pre className="mono">{(attempt.logs || []).join('\n')}</pre>
                  </details>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {isValidation ? (
        <section className="execution-validation-result" aria-label="规则验证结果">
          <CheckCircleOutlined />
          <div><span>验证结果</span><strong>{validationPassed}/{validationTotal} 个代表样本通过</strong><small>原失败阶段已恢复，允许按锁定范围继续执行数据恢复。</small></div>
        </section>
      ) : <><div className="batch-details-search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索公告标题、采购单位、类型或详情链接"
          value={detailSearch}
          onChange={(event) => {
            setDetailSearch(event.target.value)
            setPage(1)
          }}
        />
        <span className="batch-details-search-count">{detailSearch ? `找到 ${visibleRecords.length} 条` : `展示 ${records.length} 条采集样本`}</span>
      </div>
      <Table
        className="batch-details-table"
        rowKey="key"
        columns={columns}
        dataSource={visibleRecords}
        tableLayout="fixed"
        scroll={{ x: 773, y: 470 }}
        locale={{ emptyText: detailSearch ? '没有匹配的采集明细' : '本次执行未采集到明细数据' }}
        expandable={{
          expandRowByClick: true,
          rowExpandable: () => true,
          expandedRowRender: (record) => (
            <div className="batch-record-expanded">
              <div className="batch-record-link"><span>详情页链接</span><code>{record.detailUrl}</code></div>
              <div className="batch-record-raw-label">原始采集内容 · raw_html</div>
              <pre className="batch-record-raw mono">{record.raw}</pre>
            </div>
          ),
        }}
        pagination={{
          current: page,
          pageSize: 10,
          showSizeChanger: false,
          onChange: setPage,
          showTotal: (total, range) => detailSearch
            ? `第 ${range[0]}–${range[1]} 条 · 找到 ${total} 条`
            : `第 ${range[0]}–${range[1]} 条 · 批次共 ${execution?.articles.toLocaleString() || 0} 条`,
        }}
      /></>}
    </Modal>
  )
}

function ExecutionsList({ initialExecution }) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params] = useSearchParams()
  const screens = Grid.useBreakpoint()
  const { executions, tasks, sites, failureWorkflows, retryExecution } = usePrototype()
  const statusParam = params.get('status')
  const siteParam = params.get('site')
  const [siteFilter, setSiteFilter] = useState(siteParam || undefined)
  const [typeFilter, setTypeFilter] = useState()
  const [statusFilter, setStatusFilter] = useState(statusParam || undefined)
  const [dateRange, setDateRange] = useState(null)
  const [selectedExecution, setSelectedExecution] = useState(initialExecution || null)

  const workflowByExecution = useMemo(() => {
    const workflows = new Map()
    Object.values(failureWorkflows).forEach((workflow) => {
      ;[...new Set([...(workflow.sourceExecutionIds || []), workflow.sourceExecutionId].filter(Boolean))].forEach((executionId) => {
        workflows.set(executionId, workflow)
      })
    })
    return workflows
  }, [failureWorkflows])

  const executionRows = useMemo(() => executions.map((row) => {
    const businessStatus = getExecutionBusinessStatus(row, workflowByExecution.get(row.id))
    return {
      ...row,
      collectionType: getExecutionType(row, tasks),
      businessStatus: businessStatus.label,
      statusGroup: businessStatus.group,
    }
  }), [executions, tasks, workflowByExecution])

  const visible = useMemo(() => executionRows.filter((row) => (
    (!siteFilter || row.site === siteFilter)
    && (!typeFilter || row.collectionType === typeFilter)
    && (!statusFilter || row.statusGroup === statusFilter)
    && (!dateRange || (() => {
      const executionDate = getExecutionDate(row.finishedAt)
      return executionDate
        && !executionDate.isBefore(dateRange[0].startOf('day'))
        && !executionDate.isAfter(dateRange[1].endOf('day'))
    })())
    && `${row.id}${getBatchId(row)}${row.site}采集计划${row.site}${row.url}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [dateRange, executionRows, search, siteFilter, statusFilter, typeFilter])

  const siteOptions = useMemo(() => [...new Set(executionRows.map((row) => row.site))].map((value) => ({ value, label: value })), [executionRows])
  const typeOptions = useMemo(() => [...new Set(executionRows.map((row) => row.collectionType))].map((value) => ({ value, label: value })), [executionRows])
  const statusOptions = EXECUTION_STATUS_OPTIONS.map((value) => ({ value, label: value }))

  useEffect(() => {
    setStatusFilter(statusParam || undefined)
  }, [statusParam])

  useEffect(() => {
    setSiteFilter(siteParam || undefined)
  }, [siteParam])

  useEffect(() => {
    setSelectedExecution(initialExecution || null)
  }, [initialExecution])

  const clearFilters = () => {
    setSiteFilter(undefined)
    setTypeFilter(undefined)
    setStatusFilter(undefined)
    setDateRange(null)
    if (statusParam || siteParam) navigate('/executions', { replace: true })
  }

  const openDetails = (row) => setSelectedExecution(row)
  const getExecutionSite = (row) => {
    const task = tasks.find((item) => item.id === row.taskId)
    return sites.find((site) => site.id === row.siteId || site.id === task?.siteId || site.name === row.site || site.name === task?.site)
  }
  const closeDetails = () => {
    setSelectedExecution(null)
    if (initialExecution) navigate('/executions', { replace: true })
  }
  const selectedExecutionWithType = selectedExecution ? { ...selectedExecution, collectionType: getExecutionType(selectedExecution, tasks) } : null

  const retryRow = (row) => {
    const executionId = retryExecution(row.id)
    if (!executionId) {
      message.warning('当前采集记录不能重试，请检查采集计划状态')
      return
    }
    message.success(`${getBatchId(row)} 已开始第 ${getExecutionAttemptCount(row) + 1} 次尝试`)
    setSelectedExecution(null)
  }

  const renderActions = (row) => {
    const canRetry = ['失败', '部分失败'].includes(row.status) && !row.resolution && !isRuleFailure(row)
    const menuItems = [
      ...(row.resolution ? [{ key: 'resolution', icon: <CheckCircleOutlined />, label: '查看重试结果', onClick: () => navigate(`/executions/${row.resolution.retryExecutionId || row.resolution.recoveryExecutionId}`) }] : []),
      ...(isRuleFailure(row) && !row.resolution ? [{ key: 'repair-rule', icon: <ToolOutlined />, label: '修复网站规则', onClick: () => navigate(getExecutionRulePath(row, true)) }] : []),
      ...(canRetry ? [{ key: 'retry', icon: <ReloadOutlined />, label: '重试本次执行', onClick: () => retryRow(row) }] : []),
      { key: 'task', icon: <CalendarOutlined />, label: '查看采集计划', onClick: () => {
        const site = getExecutionSite(row)
        navigate(site ? getSiteWorkspacePath(site, 'plan') : `/tasks?task=${row.taskId}`)
      } },
      { key: 'rule', icon: <GlobalOutlined />, label: '查看采集规则', onClick: () => {
        const site = getExecutionSite(row)
        navigate(site ? getSiteWorkspacePath(site, 'rule') : getExecutionRulePath(row))
      } },
    ]
    return <RowActions menu={menuItems} moreLabel={`${getBatchId(row)} 更多操作`} />
  }

  const columns = [
    { title: '批次 ID', dataIndex: 'id', width: 148, render: (_, row) => <EntityLink title={getBatchId(row)} titleClassName="mono" onClick={() => openDetails(row)} ariaLabel={`查看批次 ${getBatchId(row)}`} /> },
    { title: '网站', dataIndex: 'site', width: 215, render: (value) => <span className="table-single-value" title={value}>{value}</span> },
    { title: '采集类型', dataIndex: 'collectionType', width: 112, render: (value) => <span className={`collection-mode-tag ${value.includes('全量') ? 'full' : 'incremental'}`}>{value}</span> },
    { title: '尝试', width: 72, align: 'right', render: (_, row) => <span className="mono execution-attempt-count">{getExecutionAttemptCount(row)} 次</span> },
    { title: '执行结果', width: 110, align: 'right', render: (_, row) => <span className="mono value-strong">{getExecutionResult(row)}</span> },
    { title: '耗时', dataIndex: 'duration', width: 82, align: 'right', render: (value) => <span className="mono muted execution-duration">{value}</span> },
    { title: '完成时间', dataIndex: 'finishedAt', width: 116, render: (value) => <span className="mono muted execution-finished-at">{value}</span> },
    { title: '状态', dataIndex: 'businessStatus', width: 154, render: (value) => <StatusTag value={value} /> },
    { title: '操作', width: 72, fixed: 'right', align: 'right', render: (_, row) => renderActions(row) },
  ]

  return (
    <div className="page-content execution-records-page">
      {(statusParam || siteParam) && <Alert className="context-filter-alert" type="info" showIcon closable onClose={() => navigate('/executions')} title={`已从关联入口带入筛选：${siteParam || statusParam}`} />}
      <div className="records-toolbar">
        <div className="records-filters" aria-label="采集记录筛选">
          <Select aria-label="按数据源筛选" allowClear value={siteFilter} placeholder="全部数据源" options={siteOptions} onChange={setSiteFilter} />
          <Select aria-label="按采集类型筛选" allowClear value={typeFilter} placeholder="采集类型" options={typeOptions} onChange={setTypeFilter} />
          <Select aria-label="按状态筛选" allowClear value={statusFilter} placeholder="全部状态" options={statusOptions} onChange={setStatusFilter} />
          <RangePicker aria-label="按完成日期筛选" allowClear value={dateRange} onChange={setDateRange} placeholder={['开始日期', '结束日期']} />
          {(siteFilter || typeFilter || statusFilter || dateRange) && <Button type="text" icon={<ClearOutlined />} onClick={clearFilters}>重置</Button>}
        </div>
      </div>

      {screens.md === false ? (
        <section className="execution-mobile-section" aria-label="采集批次列表">
          <div className="execution-mobile-list">
            {visible.map((row) => (
              <article className="execution-mobile-item" key={row.id}>
                <div className="execution-mobile-head"><EntityLink className="execution-mobile-id" title={getBatchId(row)} titleClassName="mono" onClick={() => openDetails(row)} ariaLabel={`查看批次 ${getBatchId(row)}`} /><StatusTag value={row.businessStatus} /></div>
                <div className="execution-mobile-source"><strong>{row.site}</strong></div>
                <dl>
                  <div><dt>采集类型</dt><dd>{getExecutionType(row, tasks)}</dd></div>
                  <div><dt>执行尝试</dt><dd className="mono">{getExecutionAttemptCount(row)} 次</dd></div>
                  <div><dt>执行结果</dt><dd className="mono value-strong">{getExecutionResult(row)}</dd></div>
                  <div><dt>完成时间</dt><dd className="mono">{row.finishedAt}</dd></div>
                  <div><dt>耗时</dt><dd className="mono">{row.duration}</dd></div>
                </dl>
                <footer>{renderActions(row)}</footer>
              </article>
            ))}
            {!visible.length && <div className="execution-mobile-empty">没有符合当前筛选条件的采集记录</div>}
          </div>
        </section>
      ) : (
        <SectionCard bodyStyle={{ padding: 0 }}>
          <Table rowKey="id" columns={columns} dataSource={visible} pagination={{ pageSize: 10, showSizeChanger: false }} tableLayout="fixed" scroll={{ x: 1023 }} />
        </SectionCard>
      )}
      <BatchDetailsModal
        execution={selectedExecutionWithType}
        open={Boolean(selectedExecution)}
        onClose={closeDetails}
        onRepairRule={(row) => navigate(getExecutionRulePath(row, true))}
        onRetry={retryRow}
        onViewRule={(row) => {
          const site = getExecutionSite(row)
          navigate(site ? getSiteWorkspacePath(site, 'rule') : getExecutionRulePath(row))
        }}
        onViewTask={(row) => {
          const site = getExecutionSite(row)
          navigate(site ? getSiteWorkspacePath(site, 'plan') : `/tasks?task=${row.taskId}`)
        }}
        onViewExecution={(executionId) => navigate(`/executions/${executionId}`)}
      />
    </div>
  )
}

export function ExecutionsPage() {
  const { executionId } = useParams()
  const { executions } = usePrototype()
  if (!executionId) return <ExecutionsList />
  const execution = executionId ? executions.find((item) => item.id === executionId) : null
  if (!execution) return <div className="page-content"><Alert type="error" showIcon title="采集批次不存在" /></div>
  return <ExecutionsList initialExecution={execution} />
}
