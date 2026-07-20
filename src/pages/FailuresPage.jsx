import { useMemo, useState } from 'react'
import { App as AntApp, Button, Modal, Segmented, Space, Table, Tag } from 'antd'
import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { failureRows } from '../data'
import { SourceCell } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

const FAILURE_STATS = [
  { label: '今日失败总数', value: 37, tone: 'red' },
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

function failureLog(row) {
  return [
    `${row.time} ERROR ${row.code}`,
    `${row.time} source=${row.site}`,
    `${row.time} page=${row.page}`,
    `${row.time} message=${row.msg}`,
    `${row.time} retries=${row.retries}`,
  ].join('\n')
}

export function FailuresPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const { executions } = usePrototype()
  const [category, setCategory] = useState('全部错误')
  const [queuedKeys, setQueuedKeys] = useState([])
  const [logRow, setLogRow] = useState(null)

  const visibleRows = useMemo(() => failureRows.filter((row) => {
    const matchesCategory = category === '全部错误' || row.err === category
    const matchesSearch = `${row.site}${row.page}${row.err}${row.msg}${row.code}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesCategory && matchesSearch
  }), [category, search])

  const relatedExecution = logRow
    ? executions.find((execution) => execution.site === logRow.site && ['失败', '部分失败'].includes(execution.status))
    : null

  const queueRetry = (rows) => {
    const newKeys = rows.map((row) => row.key).filter((key) => !queuedKeys.includes(key))
    if (!newKeys.length) {
      message.info('当前错误已加入重试队列')
      return
    }
    setQueuedKeys((current) => [...new Set([...current, ...newKeys])])
    message.success(`已将 ${newKeys.length} 个失败页面加入重试队列`)
  }

  const columns = [
    {
      title: '数据源 / 页面',
      width: 220,
      render: (_, row) => <SourceCell name={row.site} host={row.page} />,
    },
    {
      title: '错误类型',
      dataIndex: 'err',
      width: 105,
      render: (value) => <Tag variant="filled" className={`failure-error-tag ${ERROR_TONES[value] || 'gray'}`}>{value}</Tag>,
    },
    {
      title: '错误信息',
      dataIndex: 'msg',
      width: 260,
      render: (value, row) => <div className="failure-message"><span>{value}</span><code>{row.code}</code></div>,
    },
    {
      title: '重试',
      dataIndex: 'retries',
      width: 90,
      render: (value) => <span className="mono failure-retries">{value}</span>,
    },
    {
      title: '时间',
      dataIndex: 'time',
      width: 105,
      render: (value) => <span className="mono muted">{value}</span>,
    },
    {
      title: '操作',
      width: 155,
      fixed: 'right',
      align: 'right',
      render: (_, row) => {
        const queued = queuedKeys.includes(row.key)
        return <Space size={6} className="failure-actions"><Button size="small" type={queued ? 'default' : 'primary'} ghost={!queued} disabled={queued} icon={<ReloadOutlined />} onClick={() => queueRetry([row])}>{queued ? '已入队' : '重试'}</Button><Button size="small" icon={<FileTextOutlined />} onClick={() => setLogRow(row)}>日志</Button></Space>
      },
    },
  ]

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
        <Button icon={<ReloadOutlined />} onClick={() => queueRetry(visibleRows)}>全部重试</Button>
      </div>

      <section className="failure-table-surface">
        <Table
          className="failure-table"
          rowKey="key"
          columns={columns}
          dataSource={visibleRows}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: 935 }}
          locale={{ emptyText: search ? '没有匹配的失败页面' : '当前分类没有失败页面' }}
        />
      </section>
      <div className="failure-summary">当前显示 {visibleRows.length} 条失败样例 · 今日共 37 条失败</div>

      <Modal
        title="失败日志"
        open={Boolean(logRow)}
        onCancel={() => setLogRow(null)}
        width={720}
        footer={[
          relatedExecution && <Button key="execution" onClick={() => navigate(`/executions/${relatedExecution.id}`)}>查看关联采集记录</Button>,
          <Button key="close" type="primary" onClick={() => setLogRow(null)}>关闭</Button>,
        ].filter(Boolean)}
      >
        {logRow && <div className="failure-log-detail"><div><strong>{logRow.site}</strong><span className="mono">{logRow.page}</span></div><pre>{failureLog(logRow)}</pre></div>}
      </Modal>
    </div>
  )
}
