import { useEffect, useMemo } from 'react'
import { Alert, App as AntApp, Button, Descriptions, Dropdown, Table, Tabs, Tooltip } from 'antd'
import {
  CalendarOutlined,
  CaretRightOutlined,
  FolderOutlined,
  GlobalOutlined,
  HistoryOutlined,
  LeftOutlined,
  MoreOutlined,
  RobotOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EntityLink, StatusTag } from '../components/ConsoleUI'
import { SiteRulePanel } from '../components/SiteRulePanel'
import { usePrototype } from '../app/PrototypeContext'
import { getFolderPath } from '../app/siteFolderModel'
import { getSiteWorkspacePath } from '../app/routes'
import { TasksPage } from './TasksPage'

const WORKSPACE_SECTIONS = ['overview', 'plan', 'rule', 'executions']

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '')
}

function isActiveAnalysis(entry) {
  const pendingRelease = ['candidate', 'validation_failed', 'ready_to_publish'].includes(entry.releasePhase)
  return pendingRelease || !['审核完成', '已通过', '已完成', '已取消'].includes(entry.status)
}

function executionType(execution, task) {
  if (execution.collectionType) return execution.collectionType
  return (task?.collectionMode || task?.scope) === '全量' ? '全量采集' : '定时增量'
}

function batchId(execution) {
  return `B-20726-${execution.id.replace('EX-', '')}`
}

export function SiteWorkspacePage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { siteId, section = 'overview' } = useParams()
  const [searchParams] = useSearchParams()
  const {
    sites,
    siteFolders,
    rules,
    tasks,
    executions,
    intakeBatches,
    startSiteAnalysis,
    runTask,
  } = usePrototype()

  const site = sites.find((item) => item.id === siteId)
    || sites.find((item) => normalizeHost(item.host) === normalizeHost(siteId))
  const activeSection = WORKSPACE_SECTIONS.includes(section) ? section : 'overview'
  const rule = site ? rules.find((item) => item.siteId === site.id || normalizeHost(item.siteHost) === normalizeHost(site.host)) : null
  const task = site ? tasks.find((item) => item.siteId === site.id || item.site === site.name || item.ruleId === rule?.id) : null
  const siteExecutions = useMemo(() => {
    if (!site) return []
    return executions.filter((execution) => execution.siteId === site.id
      || execution.taskId === task?.id
      || execution.site === site.name)
  }, [executions, site, task?.id])
  const analysisEntries = useMemo(() => {
    if (!site) return []
    return intakeBatches.flatMap((batch) => batch.urls.map((entry) => ({ ...entry, batchId: batch.id })))
      .filter((entry) => normalizeHost(entry.siteHost || (() => {
        try { return new URL(entry.url).host } catch { return '' }
      })()) === normalizeHost(site.host))
  }, [intakeBatches, site])
  const activeAnalysis = analysisEntries.find(isActiveAnalysis)
  const analysisHistoryCount = analysisEntries.filter((entry) => !isActiveAnalysis(entry)).length
  const latestExecution = siteExecutions[0] || null
  const folderPath = site ? getFolderPath(siteFolders, site.folderId) : ''

  let siteStatus = '可采集'
  if (site) {
    if (['已停用', '已暂停'].includes(site.status)) siteStatus = '已停用'
    else if (site.status === '异常' || rule?.status === '需修复') siteStatus = '需处理'
    else if (activeAnalysis?.status === '分析中') siteStatus = '分析中'
    else if (activeAnalysis?.status === '排队中') siteStatus = '排队中'
    else if (activeAnalysis) siteStatus = '待审核'
    else if (!rule || (rule.version === 'v0.0.0' && rule.status !== '已发布')) siteStatus = '待分析'
    else if (['候选版本', '待审核'].includes(rule.status)) siteStatus = '待审核'
  }
  const accessHealth = site?.status === '异常' ? '需处理' : '健康'

  useEffect(() => {
    if (!site || (site.id === siteId && section === activeSection)) return
    navigate(getSiteWorkspacePath(site, activeSection, Object.fromEntries(searchParams.entries())), { replace: true })
  }, [activeSection, navigate, searchParams, section, site, siteId])

  if (!site) {
    return (
      <div className="page-content site-workspace-page">
        <Alert type="error" showIcon title="网站资产不存在" description="请返回网站管理重新选择需要维护的网站。" />
        <Button className="site-workspace-missing-back" icon={<LeftOutlined />} onClick={() => navigate('/sites')}>返回网站管理</Button>
      </div>
    )
  }

  const openAnalysis = () => {
    if (activeAnalysis) {
      navigate(`/ai?entry=${encodeURIComponent(activeAnalysis.id)}&site=${encodeURIComponent(site.host)}`)
      return
    }
    const result = startSiteAnalysis({
      siteName: site.name,
      siteHost: site.host,
      url: site.entryUrl || rule?.entryUrl || `https://${site.host}`,
      ruleId: rule?.id,
      kind: rule ? 'reanalyze' : 'onboarding',
      folderId: site.folderId,
      source: '网站工作台',
    })
    message.success(result.existing ? '已打开该网站的活动分析任务' : 'AI 分析任务已创建')
    navigate(`/ai?entry=${encodeURIComponent(result.entryId)}&site=${encodeURIComponent(site.host)}`)
  }

  const runNow = () => {
    if (!task || task.status !== '启用' || rule?.status === '需修复') {
      navigate(getSiteWorkspacePath(site, 'plan'))
      return
    }
    const executionId = runTask(task.id)
    if (!executionId) return message.warning('当前采集计划暂时无法执行')
    message.success(`采集批次 ${executionId} 已启动`)
    navigate(getSiteWorkspacePath(site, 'executions'))
  }

  const primaryAction = (() => {
    if (['待分析', '排队中', '分析中', '待审核'].includes(siteStatus)) {
      return {
        label: siteStatus === '待分析' ? 'AI 分析' : siteStatus === '排队中' ? '查看队列' : siteStatus === '分析中' ? '查看进度' : '审核规则',
        icon: <RobotOutlined />,
        onClick: openAnalysis,
      }
    }
    if (siteStatus === '需处理') return { label: '处理异常', icon: <WarningOutlined />, danger: true, onClick: () => navigate(getSiteWorkspacePath(site, 'rule')) }
    if (!task) return { label: '创建采集计划', icon: <CalendarOutlined />, onClick: () => navigate(getSiteWorkspacePath(site, 'plan')) }
    if (task.status !== '启用') return { label: '配置采集计划', icon: <CalendarOutlined />, onClick: () => navigate(getSiteWorkspacePath(site, 'plan')) }
    return { label: '立即采集', icon: <CaretRightOutlined />, onClick: runNow }
  })()

  const tabItems = [
    { key: 'overview', label: '概览' },
    { key: 'plan', label: '采集计划' },
    { key: 'rule', label: '采集规则' },
    { key: 'executions', label: '运行记录' },
  ]

  const nextStep = (() => {
    if (siteStatus === '需处理') return { type: 'error', title: '网站访问或采集规则需要处理', description: '修复并发布规则后，现有采集计划会继续使用可用版本。' }
    if (activeAnalysis) return {
      type: 'info',
      title: activeAnalysis.status === '排队中' ? '该网站正在等待 AI 分析调度' : '该网站有进行中的 AI 分析任务',
      description: activeAnalysis.status === '排队中' ? '系统会按受控并发自动启动，当前无需重复创建任务。' : '完成自动回归和人工审核后，规则会发布到当前网站。',
    }
    if (!rule) return { type: 'warning', title: '网站资产尚未生成采集规则', description: '发起 AI 分析后，系统会识别页面结构并生成候选规则。' }
    if (!task) return { type: 'warning', title: '采集规则已经就绪', description: '创建并启用采集计划后，网站才会进入生产调度。' }
    return { type: 'success', title: '网站已经完成生产接入', description: `采集计划${task.status === '启用' ? '正在调度' : '当前未启用'}，最近执行结果会同步到运行记录。` }
  })()

  const executionColumns = [
    { title: '批次 ID', width: 156, render: (_, execution) => <EntityLink title={batchId(execution)} titleClassName="mono" onClick={() => navigate(`/executions/${execution.id}`)} ariaLabel={`查看批次 ${batchId(execution)}`} /> },
    { title: '采集类型', width: 110, render: (_, execution) => <span>{executionType(execution, task)}</span> },
    { title: '采集量', dataIndex: 'articles', width: 90, align: 'right', render: (value) => <span className="mono value-strong">{Number(value || 0).toLocaleString()}</span> },
    { title: '耗时', dataIndex: 'duration', width: 90, align: 'right', render: (value) => <span className="mono muted">{value}</span> },
    { title: '完成时间', dataIndex: 'finishedAt', width: 120, render: (value) => <span className="mono muted">{value}</span> },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag value={value} /> },
  ]

  return (
    <div className="page-content site-workspace-page">
      <div className="site-workspace-breadcrumb">
        <Tooltip title="返回网站管理"><Button type="text" aria-label="返回网站管理" icon={<LeftOutlined />} onClick={() => navigate('/sites')} /></Tooltip>
        <button type="button" onClick={() => navigate('/sites')}>网站管理</button>
        <span>/</span>
        <strong>{site.name}</strong>
      </div>

      <section className="site-workspace-header">
        <span className="site-workspace-icon"><GlobalOutlined /></span>
        <div className="site-workspace-identity">
          <div><h1>{site.name}</h1><StatusTag value={siteStatus} /><StatusTag value={accessHealth} /></div>
          <span className="mono">{site.host}</span>
          <small><FolderOutlined /> {folderPath || '未分组'}</small>
        </div>
        <div className="site-workspace-actions">
          {['overview', 'executions'].includes(activeSection) && (
            <Button type="primary" danger={primaryAction.danger} icon={primaryAction.icon} onClick={primaryAction.onClick}>{primaryAction.label}</Button>
          )}
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{ items: [
              { key: 'analysis', icon: <RobotOutlined />, label: activeAnalysis ? '查看 AI 分析' : '重新分析', onClick: openAnalysis },
              { key: 'history', icon: <HistoryOutlined />, label: `分析记录${analysisHistoryCount ? ` ${analysisHistoryCount}` : ''}`, disabled: !analysisHistoryCount, onClick: () => navigate(`/ai/history?site=${encodeURIComponent(site.host)}`) },
            ] }}
          >
            <Tooltip title="更多"><Button aria-label="更多" icon={<MoreOutlined />} /></Tooltip>
          </Dropdown>
        </div>
      </section>

      <Tabs
        className="site-workspace-tabs"
        activeKey={activeSection}
        items={tabItems}
        onChange={(key) => navigate(getSiteWorkspacePath(site, key))}
      />

      {activeSection === 'overview' && (
        <div className="site-workspace-overview">
          <section className="site-workspace-facts">
            <div><span>累计数据</span><strong className="mono">{site.records || '—'}</strong><small>入库原文</small></div>
            <div><span>采集计划</span><strong>{task ? task.status : '未配置'}</strong><small>{task?.frequency || '尚未进入调度'}</small></div>
            <div><span>采集规则</span><strong className="mono">{rule?.version || '—'}</strong><small>{rule?.status || '待配置'}</small></div>
            <div><span>最近执行</span><strong>{latestExecution?.status || '暂无'}</strong><small>{latestExecution?.finishedAt || '—'}</small></div>
          </section>

          <Alert className="site-workspace-next-step" type={nextStep.type} showIcon title={nextStep.title} description={nextStep.description} />

          <section className="site-workspace-section">
            <header><div><h2>接入信息</h2><span>网站入口与资产来源</span></div></header>
            <Descriptions column={{ xs: 1, sm: 2 }} items={[
              { key: 'entry', label: '入口 URL', children: <span className="mono">{rule?.entryUrl || site.entryUrl || `https://${site.host}`}</span> },
              { key: 'source', label: '资产来源', children: site.importSource ? `${site.importSource} · ${site.importedAt || '刚刚'}` : '已有网站资产' },
              { key: 'urls', label: '已登记入口', children: `${site.entryUrls?.length || 1} 个` },
              { key: 'analysis', label: '历史分析', children: `${analysisHistoryCount} 次` },
            ]} />
          </section>
        </div>
      )}

      {activeSection === 'plan' && <TasksPage embeddedSiteId={site.id} />}
      {activeSection === 'rule' && <SiteRulePanel site={site} rule={rule} onOpenPlan={() => navigate(getSiteWorkspacePath(site, 'plan'))} />}
      {activeSection === 'executions' && (
        <section className="site-workspace-section site-workspace-executions">
          <header><div><h2>运行记录</h2><span>共 {siteExecutions.length} 个采集批次</span></div><Button icon={<HistoryOutlined />} onClick={() => navigate(`/executions?site=${encodeURIComponent(site.name)}`)}>全局记录</Button></header>
          <Table rowKey="id" columns={executionColumns} dataSource={siteExecutions} pagination={{ pageSize: 10, showSizeChanger: false }} tableLayout="fixed" scroll={{ x: 666 }} locale={{ emptyText: '该网站还没有采集记录' }} />
        </section>
      )}
    </div>
  )
}
