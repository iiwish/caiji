import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Grid, Input, Modal, Select, Table } from 'antd'
import { CalendarOutlined, ClearOutlined, DatabaseOutlined, GlobalOutlined, SearchOutlined, ToolOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { EntityLink, RowActions, SectionCard, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { recordDetails } from '../data'
import { getSiteRulePath, getSiteWorkspacePath } from '../app/routes'

const { RangePicker } = DatePicker

function getExecutionType(row, tasks) {
  if (row.collectionType) return row.collectionType
  const task = tasks.find((item) => item.id === row.taskId)
  const scope = task?.scope || '增量'
  return task?.executionMode === '单次' ? `单次${scope}` : `定时${scope}`
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

function BatchDetailsModal({ execution, open, onClose, onRepairRule, onViewTask }) {
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
            <p>{execution.site} · 共采集 <b className="mono">{execution.articles.toLocaleString()}</b> 条 · {execution.finishedAt}{execution.retryOf ? <> · 重跑自 <b className="mono">{getBatchId({ id: execution.retryOf })}</b></> : null}</p>
          </div>
        </div>
      )}
    >
      {execution && ['失败', '部分失败'].includes(execution.status) && (
        <Alert
          className="execution-diagnostic-alert"
          type={execution.status === '失败' ? 'error' : 'warning'}
          showIcon
          title={`${execution.stage || '采集执行'}：${execution.issue || '执行过程中存在失败项'}`}
          description={<div className="execution-diagnostic-meta"><span>规则 <b className="mono">{execution.ruleId} · {execution.ruleVersion}</b></span><span>执行耗时 <b className="mono">{execution.duration}</b></span></div>}
          action={isRuleFailure(execution)
            ? <Button type="primary" danger icon={<ToolOutlined />} onClick={() => onRepairRule(execution)}>修复网站规则</Button>
            : <Button onClick={() => onViewTask(execution)}>查看采集计划</Button>}
        />
      )}
      {execution?.logs?.length > 0 && ['失败', '部分失败'].includes(execution.status) && (
        <details className="execution-diagnostic-log">
          <summary>查看执行日志</summary>
          <pre className="mono">{execution.logs.join('\n')}</pre>
        </details>
      )}
      <div className="batch-details-search">
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
      />
    </Modal>
  )
}

function ExecutionsList({ initialExecution }) {
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params] = useSearchParams()
  const screens = Grid.useBreakpoint()
  const { executions, tasks, sites } = usePrototype()
  const statusParam = params.get('status')
  const siteParam = params.get('site')
  const [siteFilter, setSiteFilter] = useState(siteParam || undefined)
  const [typeFilter, setTypeFilter] = useState()
  const [statusFilter, setStatusFilter] = useState(statusParam || undefined)
  const [dateRange, setDateRange] = useState(null)
  const [selectedExecution, setSelectedExecution] = useState(initialExecution || null)

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
    && `${row.id}${getBatchId(row)}${row.site}采集计划${row.site}${row.url}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [executions, tasks, search, siteFilter, typeFilter, statusFilter, dateRange])

  const siteOptions = useMemo(() => [...new Set(executionRows.map((row) => row.site))].map((value) => ({ value, label: value })), [executionRows])
  const typeOptions = useMemo(() => [...new Set(executionRows.map((row) => row.collectionType))].map((value) => ({ value, label: value })), [executionRows])
  const statusOptions = useMemo(() => [...new Set(executionRows.map((row) => row.status))].map((value) => ({ value, label: value })), [executionRows])

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

  const renderActions = (row) => {
    const menuItems = [
      ...(isRuleFailure(row) ? [{ key: 'repair-rule', icon: <ToolOutlined />, label: '修复网站规则', onClick: () => navigate(getExecutionRulePath(row, true)) }] : []),
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
    { title: '采集量', dataIndex: 'articles', width: 90, align: 'right', render: (value) => <span className="mono value-strong">{value.toLocaleString()}</span> },
    { title: '耗时', dataIndex: 'duration', width: 82, align: 'right', render: (value) => <span className="mono muted execution-duration">{value}</span> },
    { title: '完成时间', dataIndex: 'finishedAt', width: 116, render: (value) => <span className="mono muted execution-finished-at">{value}</span> },
    { title: '状态', dataIndex: 'status', width: 102, render: (value) => <StatusTag value={value} /> },
    { title: '操作', width: 72, fixed: 'right', align: 'right', render: (_, row) => renderActions(row) },
  ]

  return (
    <div className="page-content execution-records-page">
      {(statusParam || siteParam) && <Alert className="context-filter-alert" type="info" showIcon closable onClose={() => navigate('/executions')} title={`已从关联入口带入筛选：${siteParam || statusParam}`} />}
      <div className="records-toolbar">
        <div className="records-filters" aria-label="采集记录筛选">
          <Select aria-label="按数据源筛选" allowClear value={siteFilter} placeholder="全部数据源" options={siteOptions} onChange={setSiteFilter} />
          <Select aria-label="按采集类型筛选" allowClear value={typeFilter} placeholder="采集类型" options={typeOptions} onChange={setTypeFilter} />
          <Select aria-label="按执行状态筛选" allowClear value={statusFilter} placeholder="执行状态" options={statusOptions} onChange={setStatusFilter} />
          <RangePicker aria-label="按完成日期筛选" allowClear value={dateRange} onChange={setDateRange} placeholder={['开始日期', '结束日期']} />
          {(siteFilter || typeFilter || statusFilter || dateRange) && <Button type="text" icon={<ClearOutlined />} onClick={clearFilters}>重置</Button>}
        </div>
      </div>

      {screens.md === false ? (
        <section className="execution-mobile-section" aria-label="采集批次列表">
          <div className="execution-mobile-list">
            {visible.map((row) => (
              <article className="execution-mobile-item" key={row.id}>
                <div className="execution-mobile-head"><EntityLink className="execution-mobile-id" title={getBatchId(row)} titleClassName="mono" onClick={() => openDetails(row)} ariaLabel={`查看批次 ${getBatchId(row)}`} /><StatusTag value={row.status} /></div>
                <div className="execution-mobile-source"><strong>{row.site}</strong></div>
                <dl>
                  <div><dt>采集类型</dt><dd>{getExecutionType(row, tasks)}</dd></div>
                  <div><dt>入库原文</dt><dd className="mono value-strong">{row.articles.toLocaleString()}</dd></div>
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
          <Table rowKey="id" columns={columns} dataSource={executionRows.filter((row) => visible.some((item) => item.id === row.id))} pagination={{ pageSize: 10, showSizeChanger: false }} tableLayout="fixed" scroll={{ x: 1007 }} />
        </SectionCard>
      )}
      <BatchDetailsModal
        execution={selectedExecution}
        open={Boolean(selectedExecution)}
        onClose={closeDetails}
        onRepairRule={(row) => navigate(getExecutionRulePath(row, true))}
        onViewTask={(row) => {
          const site = getExecutionSite(row)
          navigate(site ? getSiteWorkspacePath(site, 'plan') : `/tasks?task=${row.taskId}`)
        }}
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
