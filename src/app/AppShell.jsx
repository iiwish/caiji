import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Tag, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  BellOutlined,
  BookOutlined,
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
  ai: ['AI 分析', '创建、审核并追溯网站分析任务', '搜索分析任务、网站或 URL…'],
  sites: ['网站管理', '管理全部导入网站及其接入状态', '搜索网站名称、URL…'],
  tasks: ['采集管理', '管理采集计划、调度策略和运行参数', '搜索采集计划、网站或计划 ID…'],
  executions: ['采集记录', '查看每次生产执行的事实、问题和产物', '搜索批次 ID、采集计划、网站或 URL…'],
  failures: ['失败队列', '排查采集失败的页面与错误原因', '搜索失败页面、错误码…'],
  articles: ['原文库', '查看入库原文、质量状态和来源追溯', '搜索标题、原文编码、URL 或网站…'],
  capabilities: ['Skill 能力', '管理跨网站复用的生成与修复策略', '搜索能力名称或版本…'],
  manual: ['操作手册', '查看故障修复与网站接入的完整操作链路', ''],
  settings: ['设置', '管理用户、模型、通知和审计记录', '搜索设置或审计事件…'],
}

function getWorkspace(pathname) {
  return pathname.split('/').filter(Boolean)[0] || 'dashboard'
}

function getFocusedWorkspaceMeta(location) {
  const segments = location.pathname.split('/').filter(Boolean)
  if (segments[0] === 'ai' && segments[1] === 'history') {
    const params = new URLSearchParams(location.search)
    return params.has('entry')
      ? ['历史分析详情', '查看已归档的分析结果与发布配置', '']
      : ['历史分析记录', '查询已完成的分析、规则版本和来源链路', '搜索历史记录、网站或 URL…']
  }
  if (segments[0] === 'sites' && segments[2] === 'rule') {
    return ['网站规则', '维护采集规则、回归结果和发布版本']
  }
  if (segments[0] === 'capabilities' && segments[1]) {
    return ['Skill 能力维护', '编辑能力文档、运行回归并发布候选版本']
  }
  if (segments[0] === 'articles' && segments[1]) {
    return ['原文详情', '核查正文、质量状态和来源链路']
  }
  if (segments[0] === 'tasks') {
    const params = new URLSearchParams(location.search)
    if (params.get('create') === '1') return ['新建采集计划', '完成基本信息和运行参数后再启用计划']
    if (params.has('task')) return ['采集配置', '维护采集策略、调度参数和访问配置']
  }
  return null
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { intakeBatches, notificationCount, setNotificationCount } = usePrototype()
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 1180)
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)
  const workspace = getWorkspace(location.pathname)
  const focusedMeta = getFocusedWorkspaceMeta(location)
  const meta = focusedMeta || pageMeta[workspace] || pageMeta.dashboard
  const failureCount = 37
  const activeAnalysisEntries = intakeBatches
    .flatMap((batch) => batch.urls)
    .filter((entry) => !['审核完成', '已通过', '已完成', '已取消'].includes(entry.status))
  const intakeNeedsHandling = activeAnalysisEntries.filter((entry) => entry.status !== '分析中').length

  useEffect(() => {
    setSearch('')
  }, [location.pathname, location.search])

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
    { type: 'group', label: '数据接入', children: [
      { key: 'ai', icon: <FileSearchOutlined />, label: <span className="nav-label">AI 分析<Badge count={intakeNeedsHandling} /></span>, title: 'AI 分析', 'aria-label': 'AI 分析' },
      { key: 'sites', icon: <GlobalOutlined />, label: '网站管理', title: '网站管理', 'aria-label': '网站管理' },
      { key: 'tasks', icon: <ScheduleOutlined />, label: '采集管理', title: '采集管理', 'aria-label': '采集管理' },
    ] },
    { type: 'group', label: '运行管理', children: [
      { key: 'executions', icon: <HistoryOutlined />, label: '采集记录', title: '采集记录', 'aria-label': '采集记录' },
      { key: 'failures', icon: <WarningOutlined />, label: <span className="nav-label">失败队列<Badge count={failureCount} /></span>, title: '失败队列', 'aria-label': '失败队列' },
      { key: 'articles', icon: <ReadOutlined />, label: '原文库', title: '原文库', 'aria-label': '原文库' },
    ] },
    { type: 'group', label: '治理', children: [
      { key: 'capabilities', icon: <CodeOutlined />, label: 'Skill 能力', title: 'Skill 能力', 'aria-label': 'Skill 能力' },
    ] },
  ], [intakeNeedsHandling])

  const notificationMenu = {
    items: [
      { key: 'failure', label: `${failureCount} 个失败页面需要处理`, onClick: () => navigate('/failures') },
      { key: 'review', label: `AI 分析队列中有 ${intakeNeedsHandling} 个任务需要处理`, onClick: () => navigate('/ai') },
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
        <div className={`sidebar-utility ${collapsed ? 'collapsed' : ''}`}>
          <Tooltip title={collapsed ? '操作手册' : ''} placement="right">
            <Button
              type="text"
              className={`sidebar-utility-button ${workspace === 'manual' ? 'active' : ''}`}
              aria-label="操作手册"
              aria-current={workspace === 'manual' ? 'page' : undefined}
              icon={<BookOutlined />}
              onClick={() => navigate('/manual')}
            >
              {!collapsed && <span>操作手册</span>}
            </Button>
          </Tooltip>
        </div>
        <div className={`user-panel ${collapsed ? 'collapsed' : ''}`}>
          {!collapsed && <Avatar shape="square">DZ</Avatar>}
          {!collapsed && <div className="user-copy"><strong>qidev_qi</strong><span>工程师 · 管理员</span></div>}
          <Tooltip title="设置" placement="right">
            <Button className="user-settings-button" type="text" aria-label="打开设置" icon={<SettingOutlined />} onClick={() => navigate('/settings')} />
          </Tooltip>
        </div>
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
            {!['dashboard', 'manual'].includes(workspace) && (!focusedMeta || meta[2]) && (
              <SearchBar inputRef={searchRef} placeholder={meta[2]} value={search} onChange={setSearch} />
            )}
            <Outlet context={{ search }} />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
