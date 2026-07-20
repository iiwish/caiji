import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Button, DatePicker, Descriptions, Dropdown, Grid, Select, Space, Table, Tabs } from 'antd'
import { CaretRightOutlined, ClearOutlined, EllipsisOutlined, LeftOutlined, ReloadOutlined, ToolOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { PageTitle, SectionCard, SourceCell, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

const { RangePicker } = DatePicker

function getExecutionType(row, tasks) {
  const task = tasks.find((item) => item.id === row.taskId)
  const scope = task?.scope || '增量'
  return task?.executionMode === '单次' ? `单次${scope}` : `定时${scope}`
}

function getExecutionDate(value) {
  if (!value || value === '-') return null
  const date = dayjs(`2026-${value}`)
  return date.isValid() ? date : null
}

function getSiteRulePath(row) {
  try {
    const host = new URL(row.url).host.replace(/^www\./, '')
    return `/sites?site=${encodeURIComponent(host)}&tab=rule`
  } catch {
    return '/sites'
  }
}

function ExecutionsList() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params] = useSearchParams()
  const screens = Grid.useBreakpoint()
  const { executions, tasks, runTask } = usePrototype()
  const statusParam = params.get('status')
  const [siteFilter, setSiteFilter] = useState()
  const [typeFilter, setTypeFilter] = useState()
  const [statusFilter, setStatusFilter] = useState(statusParam || undefined)
  const [dateRange, setDateRange] = useState(null)

  const executionRows = useMemo(() => executions.map((row) => ({
    ...row,
    collectionType: getExecutionType(row, tasks),
  })), [executions, tasks])

  const visible = useMemo(() => executions.filter((row) => (
    (!siteFilter || row.site === siteFilter)
    && (!typeFilter || getExecutionType(row, tasks) === typeFilter)
    && (!statusFilter || row.status === statusFilter)
    && (!dateRange || (() => {
      const executionDate = getExecutionDate(row.finishedAt)
      return executionDate
        && !executionDate.isBefore(dateRange[0].startOf('day'))
        && !executionDate.isAfter(dateRange[1].endOf('day'))
    })())
    && `${row.id}${row.task}${row.site}${row.url}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [executions, tasks, search, siteFilter, typeFilter, statusFilter, dateRange])

  const siteOptions = useMemo(() => [...new Set(executionRows.map((row) => row.site))].map((value) => ({ value, label: value })), [executionRows])
  const typeOptions = useMemo(() => [...new Set(executionRows.map((row) => row.collectionType))].map((value) => ({ value, label: value })), [executionRows])
  const statusOptions = useMemo(() => [...new Set(executionRows.map((row) => row.status))].map((value) => ({ value, label: value })), [executionRows])

  useEffect(() => {
    setStatusFilter(statusParam || undefined)
  }, [statusParam])

  useEffect(() => {
    if (params.get('scope') === 'needs-handling') navigate('/failures', { replace: true })
  }, [navigate, params])

  const retry = (row) => {
    const nextId = runTask(row.taskId, row.id)
    if (!nextId) return message.warning('关联任务或规则不可用，无法重试')
    message.success(`已创建重试记录 ${nextId}`)
    navigate(`/executions/${nextId}`)
  }

  const clearFilters = () => {
    setSiteFilter(undefined)
    setTypeFilter(undefined)
    setStatusFilter(undefined)
    setDateRange(null)
    if (statusParam) navigate('/executions', { replace: true })
  }

  const renderActions = (row, mobile = false) => (
    <Space size={mobile ? 2 : 4} className="execution-actions">
      <Button type="link" onClick={() => navigate(`/executions/${row.id}`)}>详情</Button>
      {['失败', '部分失败'].includes(row.status) && <Button size="small" icon={<ReloadOutlined />} onClick={() => retry(row)}>重试</Button>}
      <Dropdown menu={{ items: [{ key: 'task', label: '查看任务', onClick: () => navigate(`/tasks?task=${row.taskId}`) }, { key: 'rule', label: '查看网站规则', onClick: () => navigate(getSiteRulePath(row)) }] }}>
        <Button type="text" aria-label={`${row.id} 更多操作`} icon={<EllipsisOutlined />} />
      </Dropdown>
    </Space>
  )

  const columns = [
    { title: '批次 ID', dataIndex: 'id', width: 112, render: (value) => <Button type="link" className="execution-batch-link mono" onClick={() => navigate(`/executions/${value}`)}>{value}</Button> },
    { title: '数据源', width: 215, render: (_, row) => <SourceCell name={row.site} host={row.task} /> },
    { title: '采集类型', dataIndex: 'collectionType', width: 112, render: (value) => <span className={`collection-mode-tag ${value.includes('全量') ? 'full' : 'incremental'}`}>{value}</span> },
    { title: '采集量', dataIndex: 'articles', width: 90, align: 'right', render: (value) => <span className="mono value-strong">{value.toLocaleString()}</span> },
    { title: '耗时', dataIndex: 'duration', width: 82, align: 'right', render: (value) => <span className="mono muted execution-duration">{value}</span> },
    { title: '完成时间', dataIndex: 'finishedAt', width: 116, render: (value) => <span className="mono muted execution-finished-at">{value}</span> },
    { title: '状态', dataIndex: 'status', width: 102, render: (value) => <StatusTag value={value} /> },
    { title: '操作', width: 158, fixed: 'right', align: 'right', render: (_, row) => renderActions(row) },
  ]

  return (
    <div className="page-content execution-records-page">
      {statusParam && <Alert className="context-filter-alert" type="info" showIcon closable onClose={() => navigate('/executions')} title={`已从关联入口带入筛选：${statusParam}`} />}
      <div className="records-toolbar">
        <div className="records-filters" aria-label="采集记录筛选">
          <Select aria-label="按数据源筛选" allowClear value={siteFilter} placeholder="全部数据源" options={siteOptions} onChange={setSiteFilter} />
          <Select aria-label="按采集类型筛选" allowClear value={typeFilter} placeholder="采集类型" options={typeOptions} onChange={setTypeFilter} />
          <Select aria-label="按执行状态筛选" allowClear value={statusFilter} placeholder="执行状态" options={statusOptions} onChange={setStatusFilter} />
          <RangePicker aria-label="按完成日期筛选" allowClear value={dateRange} onChange={setDateRange} placeholder={['开始日期', '结束日期']} />
          {(siteFilter || typeFilter || statusFilter || dateRange) && <Button type="text" icon={<ClearOutlined />} onClick={clearFilters}>重置</Button>}
        </div>
        <div className="toolbar-spacer" />
        <Button icon={<CaretRightOutlined />} onClick={() => navigate('/tasks')}>进入采集任务</Button>
      </div>

      {screens.md === false ? (
        <section className="execution-mobile-section" aria-label="生产执行记录">
          <header><PageTitle count={visible.length}>生产执行记录</PageTitle></header>
          <div className="execution-mobile-list">
            {visible.map((row) => (
              <article className="execution-mobile-item" key={row.id}>
                <div className="execution-mobile-head"><button className="execution-mobile-id mono" onClick={() => navigate(`/executions/${row.id}`)}>{row.id}</button><StatusTag value={row.status} /></div>
                <div className="execution-mobile-source"><strong>{row.site}</strong><span>{row.task}</span></div>
                <dl>
                  <div><dt>采集类型</dt><dd>{getExecutionType(row, tasks)}</dd></div>
                  <div><dt>入库原文</dt><dd className="mono value-strong">{row.articles.toLocaleString()}</dd></div>
                  <div><dt>完成时间</dt><dd className="mono">{row.finishedAt}</dd></div>
                  <div><dt>耗时</dt><dd className="mono">{row.duration}</dd></div>
                </dl>
                <footer>{renderActions(row, true)}</footer>
              </article>
            ))}
            {!visible.length && <div className="execution-mobile-empty">没有符合当前筛选条件的采集记录</div>}
          </div>
        </section>
      ) : (
        <SectionCard title={<PageTitle count={visible.length}>生产执行记录</PageTitle>} bodyStyle={{ padding: 0 }}>
          <Table rowKey="id" columns={columns} dataSource={executionRows.filter((row) => visible.some((item) => item.id === row.id))} pagination={{ pageSize: 10, showSizeChanger: false }} tableLayout="fixed" scroll={{ x: 987 }} />
        </SectionCard>
      )}
    </div>
  )
}

function ExecutionDetail({ execution }) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { runTask } = usePrototype()
  const [activeEvidence, setActiveEvidence] = useState(['失败', '部分失败', '运行中', '重试中'].includes(execution.status) ? 'logs' : 'articles')
  const retry = () => {
    const nextId = runTask(execution.taskId, execution.id)
    if (!nextId) return message.warning('关联任务或规则不可用，无法重试')
    message.success(`已创建重试记录 ${nextId}`)
    navigate(`/executions/${nextId}`)
  }
  const hasIssue = ['失败', '部分失败'].includes(execution.status)
  const isProcessing = ['运行中', '重试中'].includes(execution.status)
  useEffect(() => {
    if (execution.status === '成功') setActiveEvidence('articles')
  }, [execution.status])
  return (
    <div className="page-content detail-page">
      <div className="back-row"><Button icon={<LeftOutlined />} onClick={() => navigate('/executions')}>返回采集记录</Button><span>执行详情</span></div>
      <SectionCard className="detail-hero" bodyStyle={{ padding: 20 }}>
        <div className="detail-titlebar">
          <div><div className="detail-titleline"><h2>{execution.site} · {execution.task}</h2><StatusTag value={execution.status} /></div><span className="mono muted">{execution.id} · {execution.url}</span></div>
          <Space>{['失败', '部分失败'].includes(execution.status) && <Button icon={<ReloadOutlined />} onClick={retry}>重试并创建新记录</Button>}</Space>
        </div>
        <Descriptions className="detail-facts" column={{ xs: 1, sm: 2, lg: 4 }} items={[
          { key: 'time', label: '完成时间', children: execution.finishedAt },
          { key: 'duration', label: '耗时', children: execution.duration },
          { key: 'discovered', label: '发现', children: execution.discovered.toLocaleString() },
          { key: 'articles', label: '入库原文', children: execution.articles.toLocaleString() },
          { key: 'rule', label: '冻结规则', children: <Button type="link" className="inline-link mono" onClick={() => navigate(getSiteRulePath(execution))}>{execution.ruleId} · {execution.ruleVersion}</Button> },
          { key: 'task', label: '来源任务', children: <Button type="link" className="inline-link mono" onClick={() => navigate(`/tasks?task=${execution.taskId}`)}>{execution.taskId}</Button> },
          { key: 'retry', label: '重试来源', children: execution.retryOf || '-' },
          { key: 'url', label: '冻结 URL', children: <span className="mono">{execution.url}</span> },
        ]} />
      </SectionCard>

      {isProcessing && <Alert type="info" showIcon title={execution.status === '重试中' ? '重试执行正在运行' : '采集执行正在运行'} description="原型会依次完成列表发现、正文入库和质量检查，完成后自动刷新本页状态。" />}

      {hasIssue && <SectionCard className="execution-issue" title={<PageTitle>当前问题</PageTitle>}>
        <div className="issue-workflow">
          <div><StatusTag value="需处理" /><h3>{execution.issue || '重试执行正在等待结果'}</h3><p>阶段：{execution.stage || '执行队列'} · 原执行事实保持不变，修复后会创建新的执行记录。</p></div>
          {execution.ruleId && <Button type="primary" danger icon={<ToolOutlined />} onClick={() => navigate(getSiteRulePath(execution))}>修复网站规则</Button>}
        </div>
      </SectionCard>}

      <SectionCard title={<PageTitle>追查证据</PageTitle>}>
        <Tabs activeKey={activeEvidence} onChange={setActiveEvidence} items={[
          { key: 'logs', label: '执行日志', children: <pre className="execution-log">{execution.logs.join('\n')}</pre> },
          { key: 'articles', label: `产物链路（${execution.articles}）`, children: execution.articles ? <div className="artifact-entry"><div><strong>本次执行已入库 {execution.articles.toLocaleString()} 条原文</strong><p>目标列表会保留执行筛选，便于抽查本次产物。</p></div><Button type="primary" onClick={() => navigate(`/articles?execution=${execution.id}`)}>查看本次入库</Button></div> : <Alert type="info" showIcon title="本次执行没有入库原文" /> },
        ]} />
      </SectionCard>
    </div>
  )
}

export function ExecutionsPage() {
  const { executionId } = useParams()
  const { executions } = usePrototype()
  if (!executionId) return <ExecutionsList />
  const execution = executions.find((item) => item.id === executionId)
  if (!execution) return <div className="page-content"><Alert type="error" showIcon title="执行记录不存在" /></div>
  return <ExecutionDetail execution={execution} />
}
