import { Button, Segmented, Table } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

const CHART_WIDTH = 720
const CHART_HEIGHT = 200
const CHART_TOP = 16
const CHART_BOTTOM = 24

const chartRanges = {
  今日: {
    values: [820, 540, 360, 240, 180, 260, 620, 1480, 2360, 3120, 3480, 3210, 2680, 2980, 3320, 3560, 3280, 2740, 2160, 1680, 1980, 1620, 1180, 760],
    labels: Array.from({ length: 24 }, (_, index) => index % 3 === 0 ? String(index).padStart(2, '0') : ''),
    currentIndex: 15,
    subtitle: '按小时统计 · 单位：条',
  },
  本周: {
    values: [88640, 93420, 105680, 101260, 118540, 124860, 128432],
    labels: ['周一', '周二', '周三', '周四', '周五', '周六', '今日'],
    currentIndex: 6,
    subtitle: '按日统计 · 单位：条',
  },
  本月: {
    values: [84200, 91280, 88640, 103520, 109840, 98260, 112400, 118760, 105320, 121840, 125600, 128432],
    labels: ['07/01', '', '', '07/10', '', '', '07/19', '', '', '07/28', '', '今日'],
    currentIndex: 11,
    subtitle: '按周期统计 · 单位：条',
  },
}

function smoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  points.slice(0, -1).forEach((point, index) => {
    const previous = points[index - 1] || point
    const next = points[index + 1]
    const afterNext = points[index + 2] || next
    const tension = 0.16
    const controlOneX = point.x + (next.x - previous.x) * tension
    const controlOneY = point.y + (next.y - previous.y) * tension
    const controlTwoX = next.x - (afterNext.x - point.x) * tension
    const controlTwoY = next.y - (afterNext.y - point.y) * tension
    path += ` C ${controlOneX.toFixed(1)} ${controlOneY.toFixed(1)} ${controlTwoX.toFixed(1)} ${controlTwoY.toFixed(1)} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
  })
  return path
}

function TrendChart({ range }) {
  const data = chartRanges[range]
  const [hoveredIndex, setHoveredIndex] = useState(range === '今日' ? 4 : null)
  const max = Math.max(...data.values)
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM
  const points = data.values.map((value, index) => ({
    value,
    x: data.values.length === 1 ? 0 : index / (data.values.length - 1) * CHART_WIDTH,
    y: CHART_TOP + (1 - value / max) * plotHeight,
  }))
  const pastPoints = points.slice(0, data.currentIndex + 1)
  const futurePoints = points.slice(data.currentIndex)
  const pastPath = smoothPath(pastPoints)
  const areaPath = `${pastPath} L ${pastPoints.at(-1).x.toFixed(1)} ${CHART_HEIGHT - CHART_BOTTOM} L ${pastPoints[0].x.toFixed(1)} ${CHART_HEIGHT - CHART_BOTTOM} Z`
  const hovered = hoveredIndex === null ? null : points[hoveredIndex]
  const hoverLabel = hoveredIndex === null
    ? ''
    : range === '今日'
      ? `${String(hoveredIndex).padStart(2, '0')}:00`
      : data.labels[hoveredIndex] || `第 ${hoveredIndex + 1} 期`

  return (
    <div className="dashboard-chart" onMouseLeave={() => setHoveredIndex(null)}>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${range}采集量趋势图`}>
        <defs>
          <linearGradient id={`dashboard-area-${range}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5761dd" stopOpacity=".2" />
            <stop offset="70%" stopColor="#5761dd" stopOpacity=".03" />
            <stop offset="100%" stopColor="#5761dd" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[16, 56, 96, 136, 176].map((y) => (
          <line key={y} x1="0" y1={y} x2={CHART_WIDTH} y2={y} stroke={y === 176 ? '#e7e9ef' : '#eef0f4'} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={areaPath} fill={`url(#dashboard-area-${range})`} />
        {futurePoints.length > 1 && (
          <path d={smoothPath(futurePoints)} fill="none" stroke="#b6bdea" strokeWidth="2.5" strokeDasharray="1 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        <path d={pastPath} fill="none" stroke="#4b56d6" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>

      {hovered && (
        <>
          <span className="dashboard-chart-guide" style={{ left: `${hovered.x / CHART_WIDTH * 100}%` }} />
          <span className="dashboard-chart-dot" style={{ left: `${hovered.x / CHART_WIDTH * 100}%`, top: `${hovered.y / CHART_HEIGHT * 100}%` }} />
          <span className="dashboard-chart-tooltip" style={{ left: `${hovered.x / CHART_WIDTH * 100}%`, top: `${hovered.y / CHART_HEIGHT * 100}%` }}>
            <small>{hoverLabel}</small>
            <strong className="mono">{hovered.value.toLocaleString()} 条</strong>
          </span>
        </>
      )}

      <div className="dashboard-chart-hit-layer" style={{ gridTemplateColumns: `repeat(${data.values.length}, minmax(0, 1fr))` }}>
        {data.values.map((value, index) => (
          <button
            className="dashboard-chart-hit"
            key={`${range}-${index}`}
            aria-label={`${data.labels[index] || index + 1}，${value.toLocaleString()} 条`}
            onMouseEnter={() => setHoveredIndex(index)}
            onFocus={() => setHoveredIndex(index)}
          >
            <span className="mono">{data.labels[index]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function getStartedAt(execution) {
  if (execution.status !== '运行中') return execution.finishedAt
  const time = execution.logs?.[0]?.match(/^\d{2}:\d{2}/)?.[0]
  return time ? `07-16 ${time}` : '-'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const { executions } = usePrototype()
  const [chartRange, setChartRange] = useState('今日')

  const batchRows = useMemo(() => executions
    .filter((item) => `${item.id}${item.task}${item.site}`.toLowerCase().includes(search.toLowerCase()))
    .map((item) => ({
      ...item,
      batchId: `B-20726-${item.id.replace('EX-', '')}`,
      type: item.task.includes('历史') ? '全量采集' : '定时增量',
      startedAt: getStartedAt(item),
    }))
    .sort((first, second) => second.startedAt.localeCompare(first.startedAt))
    .slice(0, 6), [executions, search])

  const kpis = [
    { label: '今日采集总量', value: '128,432', unit: '条', delta: '▲ 12.4%', tone: 'indigo', icon: <DatabaseOutlined />, target: '/articles' },
    { label: '成功批次', value: '1,204', unit: '个', delta: '▲ 3.1%', tone: 'green', icon: <CheckOutlined />, target: '/executions?status=成功' },
    { label: '失败次数', value: '37', unit: '次', delta: '▼ 8.0%', tone: 'red', icon: <CloseOutlined />, target: '/failures' },
    { label: '活跃数据源', value: '86', unit: '个', delta: '▲ 2 个', tone: 'blue', icon: <GlobalOutlined />, target: '/sites' },
  ]

  const columns = [
    { title: '批次 ID', dataIndex: 'batchId', width: 132, responsive: ['md'], render: (value) => <span className="mono dashboard-batch-id">{value}</span> },
    { title: '数据源', dataIndex: 'site', render: (value) => <strong className="dashboard-source-name">{value}</strong> },
    { title: '类型', dataIndex: 'type', width: 112, responsive: ['lg'], render: (value) => <span className={`dashboard-type-tag ${value === '全量采集' ? 'full' : ''}`}>{value}</span> },
    { title: '采集量', dataIndex: 'articles', width: 100, align: 'right', render: (value) => <strong className="mono dashboard-count">{value.toLocaleString()}</strong> },
    { title: '耗时', dataIndex: 'duration', width: 90, align: 'right', responsive: ['md'], render: (value) => <span className="mono dashboard-table-muted">{value}</span> },
    { title: '开始时间', dataIndex: 'startedAt', width: 124, responsive: ['lg'], render: (value) => <span className="mono dashboard-table-muted">{value}</span> },
    { title: '状态', dataIndex: 'status', width: 96, render: (value) => <StatusTag value={value === '运行中' ? '采集中' : value} /> },
  ]

  return (
    <div className="page-content dashboard-page">
      <div className="dashboard-kpi-grid">
        {kpis.map((kpi) => (
          <button className="dashboard-kpi-card" key={kpi.label} onClick={() => navigate(kpi.target)}>
            <span className="dashboard-kpi-top">
              <span>{kpi.label}</span>
              <span className={`dashboard-kpi-icon ${kpi.tone}`}>{kpi.icon}</span>
            </span>
            <span className="dashboard-kpi-value">
              <strong className="mono">{kpi.value}</strong>
              <small>{kpi.unit}</small>
            </span>
            <span className="dashboard-kpi-change">
              <b>{kpi.delta}</b>
              <span>较昨日</span>
            </span>
          </button>
        ))}
      </div>

      <div className="dashboard-overview-grid">
        <section className="dashboard-surface dashboard-chart-card">
          <header className="dashboard-surface-header">
            <div>
              <h2>{chartRange === '今日' ? '今日采集量趋势' : `${chartRange}采集量趋势`}</h2>
              <p>{chartRanges[chartRange].subtitle}</p>
            </div>
            <Segmented className="dashboard-range" size="small" value={chartRange} onChange={setChartRange} options={['今日', '本周', '本月']} />
          </header>
          <TrendChart key={chartRange} range={chartRange} />
        </section>

        <section className="dashboard-surface dashboard-success-card">
          <header className="dashboard-surface-header">
            <div>
              <h2>成功率</h2>
              <p>今日 1,241 个批次</p>
            </div>
          </header>
          <div className="dashboard-success-body">
            <div className="dashboard-donut" role="img" aria-label="今日采集成功率 97%">
              <div className="dashboard-donut-inner">
                <strong className="mono">97.0%</strong>
                <span>采集成功</span>
              </div>
            </div>
            <div className="dashboard-success-legend">
              <div><i className="success" /><span>成功</span><strong className="mono">1,204</strong></div>
              <div><i className="warning" /><span>部分失败</span><strong className="mono">30</strong></div>
              <div><i className="danger" /><span>失败</span><strong className="mono">7</strong></div>
            </div>
          </div>
        </section>
      </div>

      <section className="dashboard-surface dashboard-recent-card">
        <header className="dashboard-recent-header">
          <h2>最近采集任务</h2>
          <Button type="link" size="small" icon={<RightOutlined />} iconPlacement="end" onClick={() => navigate('/executions')}>查看全部</Button>
        </header>
        <Table
          className="dashboard-recent-table"
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={batchRows}
          pagination={false}
          onRow={(row) => ({ onClick: () => navigate(`/executions/${row.id}`) })}
        />
      </section>
    </div>
  )
}
