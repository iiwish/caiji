import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import {
  CaretRightOutlined,
  DeleteOutlined,
  LeftOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

const PAGE_SIZE = 10
const DEDUP_FIELDS = ['url', 'title', 'pub_date', 'buyer', 'project_no', 'region']
const FREQUENCIES = ['每 10 分钟', '每 30 分钟', '每 1 小时', '每 6 小时', '每天', '每 3 天', '每 7 天', '每 15 天', '每 30 天']
const CRON_BY_FREQUENCY = {
  '每 10 分钟': '*/10 * * * *',
  '每 30 分钟': '*/30 * * * *',
  '每 1 小时': '0 * * * *',
  '每 6 小时': '0 */6 * * *',
  每天: '0 3 * * *',
  '每 3 天': '0 3 */3 * *',
  '每 7 天': '0 3 */7 * *',
  '每 15 天': '0 3 */15 * *',
  '每 30 天': '0 3 1 * *',
}

function isRuleReady(rule) {
  return Boolean(rule && rule.version !== 'v0.0.0' && rule.status !== '需修复')
}

function cronDescription(value) {
  const known = {
    '*/10 * * * *': '每 10 分钟执行一次',
    '*/30 * * * *': '每 30 分钟执行一次',
    '0 * * * *': '每小时整点执行',
    '0 */2 * * *': '每 2 小时执行一次',
    '0 */6 * * *': '每 6 小时执行一次',
    '0 3 * * *': '每天 03:00 执行',
    '0 3 */3 * *': '每 3 天 03:00 执行',
    '0 3 */7 * *': '每 7 天 03:00 执行',
    '0 3 */15 * *': '每 15 天 03:00 执行',
    '0 3 1 * *': '每月 1 日 03:00 执行',
  }
  if (known[value]) return known[value]
  return /^[\d*/,\-\s]+$/.test(value.trim()) && value.trim().split(/\s+/).length === 5
    ? '自定义调度规则'
    : '表达式格式待校验'
}

function createDraft(task, rule) {
  const defaultHeaders = [
    { name: 'User-Agent', value: 'Mozilla/5.0 (compatible; CollectorBot/1.0)' },
    { name: 'Referer', value: rule?.siteHost ? `https://${rule.siteHost}/` : '' },
    { name: 'Accept-Language', value: 'zh-CN,zh;q=0.9' },
  ]
  return {
    enabled: task.status === '启用',
    mode: task.scope || '增量',
    frequency: task.frequency || '每 1 小时',
    cron: task.cron || (task.scope === '全量' ? '0 3 * * *' : '*/30 * * * *'),
    concurrency: task.concurrency || 3,
    requestInterval: task.requestInterval || 1.5,
    retryCount: task.retryCount ?? 3,
    dedupFields: task.dedupFields || ['url', 'title'],
    accessUrl: task.accessUrl || rule?.entryUrl || '',
    authMode: task.authMode || '无需登录',
    connectionStrategy: task.connectionStrategy || '自动',
    proxyStrategy: task.proxyStrategy || '按需',
    username: task.username || '',
    password: task.password || '',
    credentialType: task.credentialType || 'Cookie',
    credential: task.credential || '',
    browserSession: task.browserSession || '默认托管会话',
    sessionRefresh: task.sessionRefresh || '失效后自动刷新',
    headers: (task.headers || defaultHeaders).map((header) => ({ ...header })),
  }
}

function CollectionSource({ task, host }) {
  const running = task.status === '启用'
  return (
    <div className="collection-source">
      <i className={running ? 'running' : 'paused'} />
      <div>
        <strong>{task.site}</strong>
        <span className="mono">{host || task.id}</span>
      </div>
    </div>
  )
}

export function TasksPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params] = useSearchParams()
  const ruleFilter = params.get('rule')
  const taskFilter = params.get('task')
  const siteFilter = params.get('site')
  const createRequested = params.get('create') === '1'
  const { tasks, rules, sites, executions, saveTask, createTask, runTask } = usePrototype()
  const [scope, setScope] = useState('全部')
  const [page, setPage] = useState(1)
  const [selectedTaskId, setSelectedTaskId] = useState(taskFilter || null)
  const [draft, setDraft] = useState(null)
  const [createOpen, setCreateOpen] = useState(createRequested)
  const [taskForm] = Form.useForm()

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null
  const selectedRule = selectedTask ? rules.find((rule) => rule.id === selectedTask.ruleId) : null
  const contextSite = siteFilter ? sites.find((site) => site.host === siteFilter) : null
  const contextRule = siteFilter ? rules.find((rule) => rule.siteHost === siteFilter) : null
  const contextRuleReady = isRuleReady(contextRule)
  const siteOptions = useMemo(() => sites
    .filter((site) => isRuleReady(rules.find((rule) => rule.siteHost === site.host)))
    .map((site) => ({ value: site.host, label: `${site.name} · ${site.host}` })), [rules, sites])

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const matchesScope = scope === '全部'
      || (scope === '已启用' && task.status === '启用')
      || (scope === '已暂停' && task.status === '已暂停')
      || (scope === '异常' && task.status === '规则异常')
      || (scope === '全量' && task.scope === '全量')
      || (scope === '增量' && task.scope === '增量')
    const taskRule = rules.find((rule) => rule.id === task.ruleId)
    const taskSite = sites.find((site) => site.name === task.site)
    const taskHost = taskSite?.host || taskRule?.siteHost
    return (!ruleFilter || task.ruleId === ruleFilter)
      && (!taskFilter || task.id === taskFilter)
      && (!siteFilter || taskHost === siteFilter)
      && matchesScope
      && `${task.id}${task.name}${task.site}${task.ruleId}`.toLowerCase().includes(search.trim().toLowerCase())
  }), [tasks, rules, sites, ruleFilter, taskFilter, siteFilter, scope, search])

  useEffect(() => {
    setPage(1)
  }, [scope, search, ruleFilter, taskFilter, siteFilter])

  useEffect(() => {
    if (!selectedTask) return
    setDraft(createDraft(selectedTask, selectedRule))
  }, [selectedTaskId, selectedRule])

  useEffect(() => {
    if (taskFilter) setSelectedTaskId(taskFilter)
  }, [taskFilter])

  useEffect(() => {
    if (!createRequested) return
    setCreateOpen(true)
    if (siteFilter) taskForm.setFieldsValue({ siteHost: siteFilter })
  }, [createRequested, siteFilter, taskForm])

  const pagedTasks = visibleTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const start = visibleTasks.length ? (page - 1) * PAGE_SIZE + 1 : 0
  const end = Math.min(page * PAGE_SIZE, visibleTasks.length)

  const openConfig = (task) => {
    const rule = rules.find((item) => item.id === task.ruleId)
    setSelectedTaskId(task.id)
    setDraft(createDraft(task, rule))
  }

  const backToList = () => {
    setSelectedTaskId(null)
    setDraft(null)
    if (taskFilter || siteFilter) navigate('/tasks')
  }

  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }))

  const setFrequency = (frequency) => {
    updateDraft({ frequency, cron: CRON_BY_FREQUENCY[frequency] })
  }

  const addDedupField = (field) => {
    if (!field || draft.dedupFields.includes(field)) return
    updateDraft({ dedupFields: [...draft.dedupFields, field] })
  }

  const removeDedupField = (field) => {
    updateDraft({ dedupFields: draft.dedupFields.filter((item) => item !== field) })
  }

  const addRequestHeader = () => {
    updateDraft({ headers: [...draft.headers, { name: '', value: '' }] })
  }

  const updateRequestHeader = (index, patch) => {
    updateDraft({ headers: draft.headers.map((header, headerIndex) => headerIndex === index ? { ...header, ...patch } : header) })
  }

  const removeRequestHeader = (index) => {
    updateDraft({ headers: draft.headers.filter((_, headerIndex) => headerIndex !== index) })
  }

  const saveConfig = () => {
    const status = draft.enabled
      ? (selectedRule?.status === '需修复' ? '规则异常' : '启用')
      : '已暂停'
    saveTask(selectedTask.id, {
      scope: draft.mode,
      executionMode: '定时',
      frequency: draft.frequency,
      cron: draft.cron,
      concurrency: draft.concurrency,
      requestInterval: draft.requestInterval,
      retryCount: draft.retryCount,
      dedupFields: draft.dedupFields,
      accessUrl: draft.accessUrl,
      authMode: draft.authMode,
      connectionStrategy: draft.connectionStrategy,
      proxyStrategy: draft.proxyStrategy,
      username: draft.username,
      password: draft.password,
      credentialType: draft.credentialType,
      credential: draft.credential,
      browserSession: draft.browserSession,
      sessionRefresh: draft.sessionRefresh,
      headers: draft.headers.filter((header) => header.name.trim() && header.value.trim()),
      status,
    })
    message.success('任务配置已保存')
  }

  const openCreate = () => {
    const defaultHost = siteOptions.some((option) => option.value === siteFilter) ? siteFilter : siteOptions[0]?.value
    taskForm.setFieldsValue({ siteHost: defaultHost, scope: '增量', frequency: '每 1 小时', versionPolicy: '跟随最新发布', enabled: true })
    setCreateOpen(true)
  }

  const closeCreate = () => {
    setCreateOpen(false)
    if (createRequested) navigate(siteFilter ? `/tasks?site=${encodeURIComponent(siteFilter)}` : '/tasks', { replace: true })
  }

  const submitTask = async () => {
    const values = await taskForm.validateFields()
    const site = sites.find((item) => item.host === values.siteHost)
    const rule = rules.find((item) => item.siteHost === values.siteHost)
    if (!site || !isRuleReady(rule)) {
      message.warning('请先在网站管理中完成并发布采集规则')
      return
    }
    const taskId = createTask({
      name: values.name,
      site: site.name,
      ruleId: rule.id,
      ruleVersion: rule.version,
      versionPolicy: values.versionPolicy,
      scope: values.scope,
      executionMode: '定时',
      frequency: values.frequency,
      cron: CRON_BY_FREQUENCY[values.frequency] || '0 * * * *',
      nextRun: '待计算',
      status: values.enabled ? '启用' : '已暂停',
      concurrency: 3,
    })
    setCreateOpen(false)
    taskForm.resetFields()
    message.success(`采集任务 ${taskId} 已创建`)
    navigate(`/tasks?task=${taskId}`)
  }

  const runNow = () => {
    if (!draft.enabled || selectedTask.status !== '启用' || selectedRule?.status === '需修复') {
      message.warning('请先保存启用状态，并确保绑定规则可用')
      return
    }
    saveConfig()
    const executionId = runTask(selectedTask.id)
    if (!executionId) {
      message.warning('当前配置暂时无法执行')
      return
    }
    message.success('已创建新的采集执行记录')
    navigate(`/executions/${executionId}`)
  }

  const columns = [
    {
      title: '任务',
      width: 250,
      render: (_, task) => <div className="collection-task-identity"><strong>{task.name}</strong><span className="mono">{task.id}</span></div>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: '关联网站',
      width: 230,
      render: (_, task) => {
        const rule = rules.find((item) => item.id === task.ruleId)
        const site = sites.find((item) => item.name === task.site)
        return <CollectionSource task={task} host={site?.host || rule?.siteHost} />
      },
    },
    {
      title: '采集范围',
      width: 112,
      render: (_, task) => <span className={`collection-mode-tag ${task.scope === '全量' ? 'full' : 'incremental'}`}>{task.scope}采集</span>,
    },
    { title: '调度频率', dataIndex: 'frequency', width: 130, responsive: ['sm'] },
    { title: '版本策略', dataIndex: 'versionPolicy', width: 125, responsive: ['xl'] },
    { title: '下次执行', dataIndex: 'nextRun', width: 115, responsive: ['md'], render: (value) => <span className="mono muted">{value}</span> },
    { title: '最近结果', width: 105, responsive: ['lg'], render: (_, task) => {
      const latest = executions.find((execution) => execution.taskId === task.id)
      return latest ? <StatusTag value={latest.status} /> : <span className="muted">暂无执行</span>
    } },
    {
      title: '操作',
      width: 100,
      align: 'right',
      fixed: 'right',
      render: (_, task) => <Button type="link" className="collection-config-link" onClick={(event) => { event.stopPropagation(); openConfig(task) }}>配置</Button>,
    },
  ]

  if (selectedTask && draft) {
    return (
      <div className="page-content collection-config-page">
        <div className="back-row">
          <Button icon={<LeftOutlined />} onClick={backToList}>返回列表</Button>
          <span>任务配置</span>
        </div>

        <section className="collection-config-surface collection-config-header">
          <div>
            <h1>{selectedTask.name}</h1>
            <span className="mono">{selectedTask.id}</span>
          </div>
          <div className="collection-task-switch">
            {selectedRule?.status === '需修复' && <StatusTag value="规则异常" />}
            <span>任务状态</span>
            <Switch aria-label={`启用采集任务：${selectedTask.name}`} checked={draft.enabled} onChange={(enabled) => updateDraft({ enabled })} />
            <Tooltip title={!draft.enabled || selectedTask.status !== '启用' || selectedRule?.status === '需修复' ? '保存启用状态并确保规则可用后才能立即执行' : '使用当前配置创建一次采集记录'}>
              <Button icon={<CaretRightOutlined />} disabled={!draft.enabled || selectedTask.status !== '启用' || selectedRule?.status === '需修复'} onClick={runNow}>立即执行</Button>
            </Tooltip>
          </div>
        </section>

        <section className="collection-config-surface collection-config-section">
          <h2>采集模式</h2>
          <div className="mode-grid">
            <button type="button" className={`mode-card ${draft.mode === '全量' ? 'active' : ''}`} onClick={() => updateDraft({ mode: '全量', frequency: '每天', cron: '0 3 * * *' })}>
              <span className="radio-dot" />
              <span><strong>全量采集</strong><p>抓取关联网站的全部历史公告，通常用于首次接入或数据重建</p></span>
            </button>
            <button type="button" className={`mode-card ${draft.mode === '增量' ? 'active' : ''}`} onClick={() => updateDraft({ mode: '增量' })}>
              <span className="radio-dot" />
              <span><strong>定时增量</strong><p>按调度周期只抓取新增公告，自动去重，节省资源，推荐日常使用</p></span>
            </button>
          </div>
        </section>

        <section className="collection-config-surface collection-config-section">
          <div className="collection-section-heading">
            <h2>采集频率</h2>
            <span>下次采集：<b className="mono">{selectedTask.nextRun}</b></span>
          </div>
          <div className="collection-cron-block">
            <div className="collection-field-label">Cron 表达式 <span>高级</span></div>
            <div className="collection-cron-row">
              <Input className="mono" value={draft.cron} onChange={(event) => updateDraft({ cron: event.target.value, frequency: '自定义' })} placeholder="*/30 * * * *" />
              <span className={cronDescription(draft.cron) === '表达式格式待校验' ? 'invalid' : ''}>{cronDescription(draft.cron)}</span>
            </div>
          </div>
          <div className="frequency-chips">
            {FREQUENCIES.map((frequency) => (
              <button type="button" className={draft.frequency === frequency ? 'active' : ''} key={frequency} onClick={() => setFrequency(frequency)}>{frequency}</button>
            ))}
          </div>
        </section>

        <section className="collection-config-surface collection-config-section">
          <h2>高级参数</h2>
          <div className="collection-advanced-grid">
            <label>并发数<InputNumber min={1} max={20} value={draft.concurrency} onChange={(concurrency) => updateDraft({ concurrency })} /></label>
            <label>请求间隔<InputNumber min={0.1} max={60} step={0.1} suffix="秒" value={draft.requestInterval} onChange={(requestInterval) => updateDraft({ requestInterval })} /></label>
            <div className="collection-dedup-field">
              <span>去重字段</span>
              <div className="collection-dedup-values">
                {draft.dedupFields.map((field) => <Tag key={field} className="mono" closable onClose={() => removeDedupField(field)}>{field}</Tag>)}
                <Select
                  className="collection-dedup-select"
                  value={null}
                  placeholder="添加字段"
                  onChange={addDedupField}
                  options={DEDUP_FIELDS.filter((field) => !draft.dedupFields.includes(field)).map((field) => ({ value: field, label: field }))}
                />
              </div>
            </div>
            <label>失败重试次数<InputNumber min={0} max={10} suffix="次" value={draft.retryCount} onChange={(retryCount) => updateDraft({ retryCount })} /></label>
          </div>
        </section>

        <section className="collection-config-surface collection-config-section collection-access-section">
          <div className="collection-access-heading">
            <span className="collection-access-icon"><SafetyCertificateOutlined /></span>
            <div><h2>访问与登录</h2><p>为当前采集任务配置连接方式、代理和登录凭证。</p></div>
          </div>
          <label className="collection-access-url">网站 URL<Input className="mono" value={draft.accessUrl} disabled /></label>
          <div className="collection-access-grid">
            <label>登录方式<Select value={draft.authMode} onChange={(authMode) => updateDraft({ authMode })} options={['无需登录', '账号密码', 'Cookie / Token', '浏览器会话'].map((value) => ({ value, label: value }))} /></label>
            <label>连接策略<Select value={draft.connectionStrategy} onChange={(connectionStrategy) => updateDraft({ connectionStrategy })} options={['自动', 'HTTP', 'Browser', 'Hybrid'].map((value) => ({ value, label: value }))} /></label>
            <label>代理策略<Select value={draft.proxyStrategy} onChange={(proxyStrategy) => updateDraft({ proxyStrategy })} options={['不使用', '按需', '固定出口'].map((value) => ({ value, label: value }))} /></label>
          </div>

          {draft.authMode === '账号密码' && (
            <div className="collection-auth-fields">
              <label>用户名<Input value={draft.username} autoComplete="off" onChange={(event) => updateDraft({ username: event.target.value })} /></label>
              <label>密码<Input.Password value={draft.password} autoComplete="new-password" onChange={(event) => updateDraft({ password: event.target.value })} /></label>
            </div>
          )}

          {draft.authMode === 'Cookie / Token' && (
            <div className="collection-auth-fields">
              <label>凭证类型<Select value={draft.credentialType} onChange={(credentialType) => updateDraft({ credentialType })} options={['Cookie', 'Bearer Token', 'API Key'].map((value) => ({ value, label: value }))} /></label>
              <label>凭证内容<Input.Password value={draft.credential} placeholder="输入 Cookie、Token 或 API Key" onChange={(event) => updateDraft({ credential: event.target.value })} /></label>
            </div>
          )}

          {draft.authMode === '浏览器会话' && (
            <div className="collection-auth-fields">
              <label>会话环境<Select value={draft.browserSession} onChange={(browserSession) => updateDraft({ browserSession })} options={['默认托管会话', '新建隔离会话'].map((value) => ({ value, label: value }))} /></label>
              <label>登录态维护<Select value={draft.sessionRefresh} onChange={(sessionRefresh) => updateDraft({ sessionRefresh })} options={['失效后自动刷新', '每次任务前验证', '仅手动更新'].map((value) => ({ value, label: value }))} /></label>
            </div>
          )}
        </section>

        <section className="collection-config-surface collection-config-section collection-headers-section">
          <div className="collection-headers-heading">
            <div><h2>请求头 Headers</h2><p>自定义请求头，用于身份标识与反爬绕过</p></div>
            <Button icon={<PlusOutlined />} onClick={addRequestHeader}>添加请求头</Button>
          </div>
          <div className="collection-header-list">
            {draft.headers.map((header, index) => (
              <div className="collection-header-row" key={index}>
                <Input className="mono" aria-label={`请求头 ${index + 1} 名称`} placeholder="Header 名称" value={header.name} onChange={(event) => updateRequestHeader(index, { name: event.target.value })} />
                <Input className="mono" aria-label={`请求头 ${index + 1} 值`} placeholder="值" value={header.value} onChange={(event) => updateRequestHeader(index, { value: event.target.value })} />
                <Tooltip title="删除请求头"><Button aria-label={`删除请求头 ${index + 1}`} icon={<DeleteOutlined />} onClick={() => removeRequestHeader(index)} /></Tooltip>
              </div>
            ))}
          </div>
        </section>

        <div className="collection-save-bar">
          <Button onClick={() => setDraft(createDraft(selectedTask, selectedRule))}>重置</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={saveConfig}>保存配置</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content collection-page">
      {(ruleFilter || taskFilter || siteFilter) && <Alert className="context-filter-alert" type="info" showIcon title={<>当前仅显示{ruleFilter ? '规则' : taskFilter ? '任务' : '网站'} <b className="mono">{ruleFilter || taskFilter || contextSite?.name || siteFilter}</b> 的采集任务</>} closable onClose={() => navigate('/tasks')} />}

      <div className="collection-list-toolbar"><Segmented className="collection-filter" value={scope} onChange={setScope} options={['全部', '已启用', '已暂停', '异常', '全量', '增量']} /><div className="toolbar-spacer" /><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建任务</Button></div>

      {siteFilter && !visibleTasks.length ? (
        <section className="collection-table-surface collection-context-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<><strong>{contextSite?.name || siteFilter} 暂无采集任务</strong><span>{contextRuleReady ? `网站规则 ${contextRule.id} 已就绪，可以创建运行计划。` : '请先完成并发布网站采集规则，再创建运行计划。'}</span></>}
          >
            <Space wrap>
              {contextRuleReady && <Button type="primary" onClick={openCreate}>创建采集任务</Button>}
              {contextRule && <Button type={contextRuleReady ? 'default' : 'primary'} onClick={() => navigate(`/sites?site=${encodeURIComponent(contextRule.siteHost)}&tab=rule`)}>{contextRuleReady ? '查看网站规则' : '完成采集规则'}</Button>}
              <Button onClick={() => navigate('/sites')}>返回网站管理</Button>
            </Space>
          </Empty>
        </section>
      ) : (
        <section className="collection-table-surface">
          <div className="collection-table-header">
            <h2>采集任务</h2>
            <span>{tasks.length}</span>
          </div>
          <Table
            className="collection-table"
            rowKey="id"
            columns={columns}
            dataSource={pagedTasks}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 1120 }}
            onRow={(task) => ({ onClick: () => openConfig(task) })}
          />
        </section>
      )}

      <div className="collection-pagination">
        <span>第 {start}–{end} 项 · 共 {visibleTasks.length} 个任务</span>
        <Pagination current={page} pageSize={PAGE_SIZE} total={visibleTasks.length} showSizeChanger={false} hideOnSinglePage onChange={setPage} />
      </div>

      <Modal title="新建采集任务" open={createOpen} onCancel={closeCreate} onOk={submitTask} okText="创建任务" width={620}>
        <Form form={taskForm} layout="vertical" initialValues={{ scope: '增量', frequency: '每 1 小时', versionPolicy: '跟随最新发布', enabled: true }}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}><Input placeholder="例如：政府采购公告日常增量" /></Form.Item>
          <Form.Item name="siteHost" label="关联网站" rules={[{ required: true, message: '请选择网站' }]}><Select showSearch optionFilterProp="label" options={siteOptions} placeholder="选择已完成接入的网站" /></Form.Item>
          <div className="task-create-grid">
            <Form.Item name="scope" label="采集范围"><Select options={['增量', '全量'].map((value) => ({ value, label: `${value}采集` }))} /></Form.Item>
            <Form.Item name="frequency" label="调度频率"><Select options={FREQUENCIES.map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item name="versionPolicy" label="规则版本策略"><Select options={['跟随最新发布', '固定当前版本'].map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item name="enabled" label="创建后启用" valuePropName="checked"><Switch /></Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
