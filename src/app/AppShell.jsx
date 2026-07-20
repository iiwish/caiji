import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Tag, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  BellOutlined,
  CodeOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  HistoryOutlined,
  ExperimentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReadOutlined,
  ScheduleOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SearchBar } from '../components/ConsoleUI'
import { usePrototype } from './PrototypeContext'

const { Header, Content, Sider } = Layout

const pageMeta = {
  dashboard: ['采集仪表盘', '实时监控全平台采集运行状况', '搜索批次、数据源…'],
  ai: ['AI 分析', '自动解析目标网站，生成并校验采集配置', '搜索分析队列中的数据源…'],
  sites: ['网站管理', '按 URL 管理访问方式、采集规则和数据资产状态', '搜索网站名称、URL…'],
  tasks: ['采集任务', '管理采集范围、调度计划和运行参数', '搜索任务名称、网站或任务 ID…'],
  executions: ['采集记录', '查看每次生产执行的事实、问题和产物', '搜索执行编码、任务、网站或 URL…'],
  failures: ['失败队列', '排查采集失败的页面与错误原因', '搜索失败页面、错误码…'],
  articles: ['原文库', '查看入库原文、质量状态和来源追溯', '搜索标题、原文编码、URL 或网站…'],
  capabilities: ['Skill 能力', '管理跨网站复用的生成与修复策略', '搜索能力名称或版本…'],
  settings: ['设置', '管理用户、模型、通知和审计记录', '搜索设置或审计事件…'],
}

function getWorkspace(pathname) {
  return pathname.split('/').filter(Boolean)[0] || 'dashboard'
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { intakeBatches, notificationCount, setNotificationCount } = usePrototype()
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 1180)
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)
  const workspace = getWorkspace(location.pathname)
  const meta = pageMeta[workspace] || pageMeta.dashboard
  const failureCount = 37
  const intakeNeedsHandling = intakeBatches.filter((item) => item.status === '需处理').length

  useEffect(() => {
    setSearch('')
  }, [location.pathname])

  useEffect(() => {
    if (workspace === 'dashboard') return undefined

    const focusSearch = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [workspace])

  useEffect(() => {
    const compactNavigation = window.matchMedia('(max-width: 1180px)')
    const syncNavigation = (event) => setCollapsed(event.matches)
    compactNavigation.addEventListener('change', syncNavigation)
    return () => compactNavigation.removeEventListener('change', syncNavigation)
  }, [])

  const navItems = useMemo(() => [
    { type: 'group', label: '总览', children: [{ key: 'dashboard', icon: <AppstoreOutlined />, label: '监控大盘', title: '监控大盘', 'aria-label': '监控大盘' }] },
    { type: 'group', label: '接入与资产', children: [
      { key: 'ai', icon: <FileSearchOutlined />, label: <span className="nav-label">AI 分析<Badge count={intakeNeedsHandling} /></span>, title: 'AI 分析', 'aria-label': 'AI 分析' },
      { key: 'sites', icon: <GlobalOutlined />, label: '网站管理', title: '网站管理', 'aria-label': '网站管理' },
    ] },
    { type: 'group', label: '生产', children: [
      { key: 'tasks', icon: <ScheduleOutlined />, label: '采集任务', title: '采集任务', 'aria-label': '采集任务' },
      { key: 'executions', icon: <HistoryOutlined />, label: '采集记录', title: '采集记录', 'aria-label': '采集记录' },
      { key: 'failures', icon: <WarningOutlined />, label: <span className="nav-label">失败队列<Badge count={failureCount} /></span>, title: '失败队列', 'aria-label': '失败队列' },
      { key: 'articles', icon: <ReadOutlined />, label: '原文库', title: '原文库', 'aria-label': '原文库' },
    ] },
    { type: 'group', label: '治理', children: [
      { key: 'capabilities', icon: <CodeOutlined />, label: 'Skill 能力', title: 'Skill 能力', 'aria-label': 'Skill 能力' },
      { key: 'settings', icon: <SettingOutlined />, label: '设置', title: '设置', 'aria-label': '设置' },
    ] },
  ], [intakeNeedsHandling])

  const notificationMenu = {
    items: [
      { key: 'failure', label: `${failureCount} 个失败页面需要处理`, onClick: () => navigate('/failures') },
      { key: 'review', label: `${intakeNeedsHandling} 个 AI 批次需要处理`, onClick: () => navigate('/ai') },
      { key: 'read', label: '全部标记为已读', onClick: () => setNotificationCount(0) },
    ],
  }

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" width={236} collapsedWidth={68} collapsed={collapsed} trigger={null}>
        <div className="brand">
          <span className="brand-mark"><DatabaseOutlined /></span>
          {!collapsed && <div><strong>标讯智采平台</strong><small>COLLECTOR AI</small></div>}
        </div>
        <Menu
          className="nav-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[workspace]}
          items={navItems}
          onClick={({ key }) => navigate(`/${key}`)}
        />
        <button className={`user-panel ${collapsed ? 'collapsed' : ''}`} onClick={() => navigate('/settings')}>
          <Avatar shape="square">DZ</Avatar>
          {!collapsed && <><div><strong>qidev_qi</strong><span>工程师 · 管理员</span></div><SettingOutlined /></>}
        </button>
      </Sider>

      <Layout className="main-layout">
        <Header className="top-header">
          <Button className="sider-trigger" type="text" aria-label={collapsed ? '展开导航' : '收起导航'} icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
          <div className="page-title"><strong>{meta[0]}</strong><span>{meta[1]}</span></div>
          <div className="header-actions">
            <Tooltip title="本地模拟数据，不会触发真实采集、模型费用或外部系统写入">
              <Tag className="prototype-tag" icon={<ExperimentOutlined />}>演示环境</Tag>
            </Tooltip>
            <Tag className="running-tag" variant="filled"><Badge status="success" /> 采集运行中</Tag>
            <Dropdown menu={notificationMenu} placement="bottomRight" trigger={['click']}>
              <Tooltip title="通知">
                <Badge dot={notificationCount > 0}><Button aria-label={`通知，${notificationCount} 条未读`} icon={<BellOutlined />} /></Badge>
              </Tooltip>
            </Dropdown>
          </div>
        </Header>
        <Content className="main-content">
          <div className="content-inner">
            {workspace !== 'dashboard' && (
              <SearchBar inputRef={searchRef} placeholder={meta[2]} value={search} onChange={setSearch} />
            )}
            <Outlet context={{ search }} />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
