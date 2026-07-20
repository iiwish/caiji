import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Modal,
  Pagination,
  Segmented,
  Space,
  Table,
  Tabs,
  Tooltip,
} from 'antd'
import {
  AppstoreOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  LineChartOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { StatusTag } from '../components/ConsoleUI'
import { SiteRulePanel } from '../components/SiteRulePanel'
import { usePrototype } from '../app/PrototypeContext'

const PAGE_SIZE = 12
const INTAKE_STATUSES = new Set(['待分析', '分析中'])

function SiteSource({ site }) {
  return (
    <div className="site-source-cell">
      <strong>{site.name}</strong>
      <span className="mono">{site.host}</span>
    </div>
  )
}

export function SitesPage() {
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const { sites, tasks, rules } = usePrototype()
  const [scope, setScope] = useState('全部')
  const [view, setView] = useState('list')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [detailTab, setDetailTab] = useState('overview')

  const registrySites = useMemo(() => sites
    .filter((row) => !INTAKE_STATUSES.has(row.status) || tasks.some((task) => task.site === row.name))
    .map((row) => {
      const siteRule = rules.find((rule) => rule.siteHost === row.host)
      const siteTasks = tasks.filter((task) => task.site === row.name)
      const status = row.status === '已停用'
        ? '已停用'
        : row.status === '异常' || siteRule?.status === '需修复'
          ? '需处理'
          : !siteRule || (siteRule.version === 'v0.0.0' && siteRule.status !== '已发布')
            ? '待配置'
            : '可采集'
      return {
        ...row,
        status,
        accessHealth: row.status === '异常' ? '需处理' : '健康',
        ruleStatus: siteRule?.status || '待配置',
        ruleVersion: siteRule?.version || '-',
        taskCount: siteTasks.length,
      }
    }), [sites, tasks, rules])

  const visibleRows = useMemo(() => registrySites.filter((row) => (
    (scope === '全部' || row.status === scope) &&
    `${row.name}${row.host}`.toLowerCase().includes(search.trim().toLowerCase())
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
    { label: '待配置', value: countByStatus('待配置'), tone: 'amber', icon: <ClockCircleOutlined /> },
    { label: '需处理', value: countByStatus('需处理'), tone: 'red', icon: <WarningOutlined /> },
  ]
  const selectedRule = selected ? rules.find((rule) => rule.siteHost === selected.host) : null
  const selectedTasks = selected ? tasks.filter((task) => task.site === selected.name) : []
  const selectedTask = selectedTasks[0] || null

  useEffect(() => {
    const host = params.get('site')
    if (!host) return
    const contextualSite = registrySites.find((site) => site.host === host)
    if (!contextualSite) return
    setSelected(contextualSite)
    setDetailTab(params.get('tab') === 'rule' ? 'rule' : 'overview')
  }, [params, registrySites])

  const openSite = (row, tab = 'overview') => {
    setSelected(row)
    setDetailTab(tab)
    const nextParams = new URLSearchParams(params)
    nextParams.set('site', row.host)
    nextParams.set('tab', tab)
    setParams(nextParams, { replace: true })
  }

  const openCollectionConfiguration = (row) => {
    const matchingTasks = tasks.filter((task) => task.site === row.name)
    navigate(matchingTasks.length === 1
      ? `/tasks?task=${encodeURIComponent(matchingTasks[0].id)}`
      : `/tasks?site=${encodeURIComponent(row.host)}`)
  }

  const closeSite = () => {
    setSelected(null)
    const nextParams = new URLSearchParams(params)
    nextParams.delete('site')
    nextParams.delete('tab')
    setParams(nextParams, { replace: true })
  }

  const changeDetailTab = (tab) => {
    setDetailTab(tab)
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', tab)
    setParams(nextParams, { replace: true })
  }

  const columns = [
    {
      title: '网站',
      dataIndex: 'name',
      width: 290,
      render: (_, row) => <SiteSource site={row} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: '访问健康',
      dataIndex: 'accessHealth',
      width: 108,
      responsive: ['sm'],
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: '采集规则',
      width: 170,
      responsive: ['md'],
      render: (_, row) => <div className="site-rule-cell"><strong className="mono">{row.ruleVersion}</strong><StatusTag value={row.ruleStatus} /></div>,
    },
    {
      title: '累计数据',
      dataIndex: 'records',
      align: 'right',
      width: 120,
      responsive: ['lg'],
      render: (value) => <span className="mono value-strong">{value}</span>,
    },
    {
      title: '操作',
      align: 'right',
      width: 190,
      render: (_, row) => (
        <div className="site-row-actions">
          <Button type="link" onClick={() => openCollectionConfiguration(row)}>采集配置</Button>
          <Button type="link" className="site-detail-link" onClick={() => openSite(row)}>详情</Button>
        </div>
      ),
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
          options={['全部', '可采集', '待配置', '需处理', '已停用']}
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
      </div>

      {view === 'list' ? (
        <div className="sites-table-surface">
          <Table
            className="sites-data-table"
            rowKey="key"
            columns={columns}
            dataSource={pagedRows}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 590 }}
          />
        </div>
      ) : (
        <div className="site-grid">
          {pagedRows.map((row) => (
            <article className="site-card" key={row.key}>
              <div className="site-card-head">
                <SiteSource site={row} />
                <StatusTag value={row.status} />
              </div>
              <div className="site-card-stats">
                <div><span>访问健康</span><b>{row.accessHealth}</b></div>
                <div><span>规则版本</span><b className="mono">{row.ruleVersion}</b></div>
                <div><span>关联任务</span><b>{row.taskCount} 个</b></div>
              </div>
              <div className="site-card-actions">
                <Button
                  type={row.status === '需处理' ? 'primary' : 'default'}
                  danger={row.status === '需处理'}
                  icon={<SettingOutlined />}
                  onClick={() => openCollectionConfiguration(row)}
                >
                  采集配置
                </Button>
                <Button onClick={() => openSite(row)}>详情</Button>
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
        title={selected ? `${selected.name} · 网站配置` : '网站配置'}
        open={Boolean(selected)}
        onCancel={closeSite}
        width={1120}
        footer={<Space><Button onClick={closeSite}>关闭</Button><Button type="primary" onClick={() => {
          if (!selectedTask && selected?.status !== '可采集') changeDetailTab('rule')
          else navigate(selectedTask ? `/tasks?site=${encodeURIComponent(selected?.host || '')}` : `/tasks?site=${encodeURIComponent(selected?.host || '')}&create=1`)
        }}>{selectedTask ? '查看采集任务' : selected?.status === '可采集' ? '创建采集任务' : '完成采集规则'}</Button></Space>}
        styles={{ body: { maxHeight: '76vh', overflowY: 'auto' } }}
      >
        {selected && <Tabs activeKey={detailTab} onChange={changeDetailTab} items={[
          { key: 'overview', label: '概览', children: <><Descriptions column={{ xs: 1, sm: 2 }} items={[
            { key: 'name', label: '网站名称', children: selected.name },
            { key: 'url', label: '网站 URL', children: <span className="mono">{selectedRule?.entryUrl || selected.entryUrl || `https://${selected.host}`}</span> },
            { key: 'status', label: '接入状态', children: <StatusTag value={selected.status} /> },
            { key: 'health', label: '访问健康', children: <StatusTag value={selected.accessHealth} /> },
            { key: 'records', label: '累计数据', children: selected.records },
            { key: 'rule', label: '规则状态', children: selectedRule ? <><span className="mono">{selectedRule.id} · {selectedRule.version}</span> <StatusTag value={selectedRule.status} /></> : <StatusTag value="待配置" /> },
            { key: 'tasks', label: '关联任务', children: `${selectedTasks.length} 个` },
          ]} /><Alert className="site-health-alert" type={selected.status === '需处理' ? 'error' : selectedRule ? 'success' : 'warning'} showIcon title={selected.status === '需处理' ? '网站访问或采集规则需要处理，但不会改变已有任务和执行记录。' : selectedRule ? '该网站资产的 URL、访问方式和采集规则已经就绪。' : '该网站尚未生成采集规则，请先完成 AI 分析。'} /></> },
          { key: 'rule', label: '采集规则', children: <SiteRulePanel site={selected} rule={selectedRule} /> },
        ]} />}
      </Modal>
    </div>
  )
}
