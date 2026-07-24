import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Input,
  InputNumber,
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
  CodeOutlined,
  DeleteOutlined,
  DownOutlined,
  LeftOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { EntityLink, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { getSiteRulePath, getSiteWorkspacePath } from '../app/routes'

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

const AUTH_FUNCTIONS = [
  { value: 'auth.refresh_oauth_token', label: 'OAuth Token 刷新', module: 'auth/oauth_token.py', signature: 'refresh_token(context)' },
  { value: 'auth.build_request_signature', label: '动态请求签名', module: 'auth/request_signature.py', signature: 'sign_request(url, timestamp, secret_ref)' },
  { value: 'auth.restore_cookie_session', label: 'Cookie 会话恢复', module: 'auth/cookie_session.py', signature: 'restore_session(context)' },
]

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

function getTaskCollectionMode(task) {
  if (task.collectionMode) return task.collectionMode
  return task.scope === '全量' && task.bootstrapStatus !== '已完成' ? '全量' : '增量'
}

function createDraft(task, rule, site) {
  const headers = (task.headers || []).map((header) => ({ ...header }))
  const customHeadersEnabled = task.customHeadersEnabled ?? headers.length > 0
  const authFunctionId = task.authFunctionId || ''
  return {
    isNew: false,
    name: defaultTaskName(site) || task.name,
    siteHost: rule?.siteHost || '',
    versionPolicy: task.versionPolicy || '跟随最新发布',
    enabled: task.status === '启用',
    collectionMode: getTaskCollectionMode(task),
    frequency: task.frequency !== '单次执行' ? (task.frequency || '每 1 小时') : '每 1 小时',
    cron: task.cron || '0 * * * *',
    concurrency: task.concurrency || 3,
    requestInterval: task.requestInterval || 1.5,
    retryCount: task.retryCount ?? 3,
    dedupFields: task.dedupFields || ['url', 'title'],
    customHeadersEnabled,
    authFunctionId,
    headers,
  }
}

function defaultTaskName(site) {
  if (!site) return ''
  return `${site.name}采集计划`
}

function createNewTaskDraft(site, sourceSiteFilter = '') {
  return {
    isNew: true,
    sourceSiteFilter,
    name: defaultTaskName(site),
    siteHost: site?.host || '',
    versionPolicy: '跟随最新发布',
    enabled: false,
    collectionMode: '全量',
    frequency: '每 1 小时',
    cron: CRON_BY_FREQUENCY['每 1 小时'],
    concurrency: 3,
    requestInterval: 1.5,
    retryCount: 3,
    dedupFields: ['url', 'title'],
    customHeadersEnabled: false,
    authFunctionId: '',
    headers: [],
  }
}

export function TasksPage({ embeddedSiteId = '' }) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const { tasks, rules, sites, executions, saveTask, createTask, runTask } = usePrototype()
  const embeddedSite = embeddedSiteId ? sites.find((site) => site.id === embeddedSiteId) : null
  const embeddedRule = embeddedSite ? rules.find((rule) => rule.siteId === embeddedSite.id || rule.siteHost === embeddedSite.host) : null
  const embeddedTask = embeddedSite ? tasks.find((task) => task.siteId === embeddedSite.id || task.site === embeddedSite.name || task.ruleId === embeddedRule?.id) : null
  const embedded = Boolean(embeddedSite)
  const ruleFilter = embedded ? null : params.get('rule')
  const taskFilter = embedded ? embeddedTask?.id || null : params.get('task')
  const siteFilter = embedded ? embeddedSite.host : params.get('site')
  const contextRuleReadyForEmbedded = isRuleReady(embeddedRule)
  const createRequested = embedded ? Boolean(!embeddedTask && contextRuleReadyForEmbedded) : params.get('create') === '1'
  const setupMode = embedded && !embeddedTask ? 'onboarding' : params.get('setup')
  const [scope, setScope] = useState('全部')
  const [page, setPage] = useState(1)
  const [selectedTaskId, setSelectedTaskId] = useState(taskFilter || null)
  const [draft, setDraft] = useState(null)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null
  const contextSite = embeddedSite || (siteFilter ? sites.find((site) => site.host === siteFilter) : null)
  const contextRule = embeddedRule || (siteFilter ? rules.find((rule) => rule.siteHost === siteFilter) : null)
  const contextRuleReady = isRuleReady(contextRule)
  const selectedRule = selectedTask
    ? rules.find((rule) => rule.id === selectedTask.ruleId)
    : draft?.isNew
      ? rules.find((rule) => rule.siteHost === draft.siteHost)
      : null
  const selectedTaskSite = selectedTask
    ? sites.find((site) => site.id === selectedTask.siteId
      || site.name === selectedTask.site
      || site.host === selectedRule?.siteHost)
    : null
  const siteOptions = useMemo(() => sites
    .filter((site) => isRuleReady(rules.find((rule) => rule.siteHost === site.host)) && !tasks.some((task) => task.site === site.name))
    .map((site) => ({ value: site.host, label: `${site.name} · ${site.host}` })), [rules, sites, tasks])

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const matchesScope = scope === '全部'
      || (scope === '已启用' && task.status === '启用')
      || (scope === '已暂停' && ['已暂停', '草稿'].includes(task.status))
      || (scope === '异常' && task.status === '规则异常')
      || (scope === '全量采集' && getTaskCollectionMode(task) === '全量')
      || (scope === '定时增量' && getTaskCollectionMode(task) === '增量')
    const taskRule = rules.find((rule) => rule.id === task.ruleId)
    const taskSite = sites.find((site) => site.id === task.siteId || site.name === task.site || site.host === taskRule?.siteHost)
    const taskHost = taskSite?.host || taskRule?.siteHost
    const taskName = defaultTaskName(taskSite) || task.name
    return (!ruleFilter || task.ruleId === ruleFilter)
      && (!taskFilter || task.id === taskFilter)
      && (!siteFilter || taskHost === siteFilter)
      && matchesScope
      && `${task.id}${taskName}${task.site}${task.ruleId}`.toLowerCase().includes(search.trim().toLowerCase())
  }), [tasks, rules, sites, ruleFilter, taskFilter, siteFilter, scope, search])

  useEffect(() => {
    setPage(1)
  }, [scope, search, ruleFilter, taskFilter, siteFilter])

  useEffect(() => {
    if (!selectedTask) return
    setDraft(createDraft(selectedTask, selectedRule, selectedTaskSite))
  }, [selectedTaskId, selectedRule])

  useEffect(() => {
    if (taskFilter) setSelectedTaskId(taskFilter)
  }, [taskFilter])

  useEffect(() => {
    if (!createRequested) return
    setSelectedTaskId(null)
    setDraft((current) => {
      if (current?.isNew && current.sourceSiteFilter === (siteFilter || '') && current.setupMode === (setupMode || '')) return current
      return {
        ...createNewTaskDraft(contextRuleReady ? contextSite : null, siteFilter || ''),
        setupMode: setupMode || '',
      }
    })
  }, [contextRuleReady, contextSite, createRequested, setupMode, siteFilter])

  const pagedTasks = visibleTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const start = visibleTasks.length ? (page - 1) * PAGE_SIZE + 1 : 0
  const end = Math.min(page * PAGE_SIZE, visibleTasks.length)

  const openConfig = (task) => {
    const rule = rules.find((item) => item.id === task.ruleId)
    const site = sites.find((item) => item.id === task.siteId || item.name === task.site || item.host === rule?.siteHost)
    setSelectedTaskId(task.id)
    setDraft(createDraft(task, rule, site))
    if (!embedded) {
      const nextParams = new URLSearchParams(params)
      nextParams.set('task', task.id)
      nextParams.delete('site')
      nextParams.delete('create')
      setParams(nextParams, { replace: true })
    }
  }

  const backToList = () => {
    setSelectedTaskId(null)
    setDraft(null)
    navigate(embedded ? getSiteWorkspacePath(embeddedSite, 'overview') : '/sites')
  }

  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }))

  const updateDraftSite = (siteHost) => {
    const site = sites.find((item) => item.host === siteHost)
    setDraft((current) => ({
      ...current,
      siteHost,
      name: defaultTaskName(site),
    }))
  }

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

  const toggleCustomHeaders = (enabled) => {
    updateDraft({
      customHeadersEnabled: enabled,
      headers: enabled && !draft.headers.length ? [{ name: '', value: '' }] : draft.headers,
    })
  }

  const updateRequestHeader = (index, patch) => {
    updateDraft({ headers: draft.headers.map((header, headerIndex) => headerIndex === index ? { ...header, ...patch } : header) })
  }

  const removeRequestHeader = (index) => {
    updateDraft({ headers: draft.headers.filter((_, headerIndex) => headerIndex !== index) })
  }

  const getConfigPatch = (enabled = draft.enabled) => {
    const status = enabled
      ? (selectedRule?.status === '需修复' ? '规则异常' : '启用')
      : draft.isNew ? '草稿' : '已暂停'
    const configuredHeaders = draft.customHeadersEnabled
      ? draft.headers.filter((header) => header.name.trim() && header.value.trim())
      : []
    const authEnabled = draft.customHeadersEnabled || Boolean(draft.authFunctionId)
    const site = sites.find((item) => item.host === draft.siteHost) || selectedTaskSite
    return {
      name: defaultTaskName(site),
      versionPolicy: draft.versionPolicy,
      collectionMode: draft.collectionMode,
      initialScope: draft.collectionMode === '全量' ? '全量' : '不回补',
      continuousEnabled: true,
      scope: draft.collectionMode,
      executionMode: '定时',
      frequency: draft.frequency,
      cron: draft.cron,
      nextRun: !selectedTask || selectedTask.nextRun === '—' ? '待计算' : selectedTask.nextRun,
      concurrency: draft.concurrency,
      requestInterval: draft.requestInterval,
      retryCount: draft.retryCount,
      dedupFields: draft.dedupFields,
      authEnabled,
      customHeadersEnabled: draft.customHeadersEnabled,
      authFunctionId: draft.authFunctionId,
      headers: configuredHeaders,
      status,
    }
  }

  const saveConfig = (showMessage = true) => {
    const patch = getConfigPatch()
    if (draft.customHeadersEnabled && !patch.headers.length) {
      message.warning('请填写至少一组完整的自定义 Header，或关闭该选项')
      return null
    }
    if (!selectedTask) return null
    saveTask(selectedTask.id, patch)
    if (showMessage) message.success('采集配置已保存')
    return patch
  }

  const openCreate = () => {
    if (embedded) {
      setSelectedTaskId(null)
      setDraft({
        ...createNewTaskDraft(contextRuleReady ? contextSite : null, siteFilter || ''),
        setupMode: setupMode || '',
      })
      return
    }
    const nextParams = new URLSearchParams()
    nextParams.set('create', '1')
    if (siteFilter && siteOptions.some((option) => option.value === siteFilter)) nextParams.set('site', siteFilter)
    if (setupMode) nextParams.set('setup', setupMode)
    navigate(`/tasks?${nextParams.toString()}`)
  }

  const createFromDraft = (enabled) => {
    const patch = getConfigPatch(enabled)
    const site = sites.find((item) => item.host === draft.siteHost)
    const rule = rules.find((item) => item.siteHost === draft.siteHost)
    if (!site || !isRuleReady(rule)) {
      message.warning('请选择已经发布采集规则的网站')
      return
    }
    const existingTask = tasks.find((task) => task.siteId === site.id || task.site === site.name)
    if (existingTask) {
      message.info('该网站已经配置采集计划，已打开现有配置')
      navigate(embedded ? getSiteWorkspacePath(site, 'plan') : `/tasks?task=${encodeURIComponent(existingTask.id)}`)
      return
    }
    if (draft.customHeadersEnabled && !patch.headers.length) {
      message.warning('请填写至少一组完整的自定义 Header，或关闭该选项')
      return
    }
    const taskId = createTask({
      ...patch,
      site: site.name,
      siteId: site.id,
      ruleId: rule.id,
      ruleVersion: rule.version,
    })
    setSelectedTaskId(taskId)
    message.success(enabled ? `采集计划 ${taskId} 已创建并启用` : `采集计划 ${taskId} 已保存为草稿`)
    navigate(embedded ? getSiteWorkspacePath(site, 'plan') : `/tasks?task=${taskId}${setupMode ? `&setup=${encodeURIComponent(setupMode)}` : ''}`)
  }

  const runNow = () => {
    if (!draft.enabled || selectedRule?.status === '需修复') {
      message.warning('请先启用采集计划，并确保绑定规则可用')
      return
    }
    const patch = saveConfig(false)
    if (!patch) return
    const executionId = runTask(selectedTask.id, '', patch)
    if (!executionId) {
      message.warning('当前配置暂时无法执行')
      return
    }
    message.success(`配置已保存，${draft.collectionMode === '全量' ? '全量' : '增量'}采集批次 ${executionId} 已启动`)
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 90,
      render: (value) => <span className="mono muted">{value}</span>,
    },
    {
      title: '采集计划',
      width: 220,
      render: (_, task) => {
        const rule = rules.find((item) => item.id === task.ruleId)
        const site = sites.find((item) => item.id === task.siteId || item.name === task.site || item.host === rule?.siteHost)
        const taskName = defaultTaskName(site) || task.name
        return <EntityLink title={taskName} onClick={() => openConfig(task)} ariaLabel={`配置采集计划 ${taskName}`} />
      },
    },
    {
      title: '采集模式',
      width: 105,
      render: (_, task) => {
        const mode = getTaskCollectionMode(task)
        return <span className={`collection-mode-tag ${mode === '全量' ? 'full' : 'incremental'}`}>{mode === '全量' ? '全量采集' : '增量采集'}</span>
      },
    },
    { title: '执行频率', dataIndex: 'frequency', width: 120, render: (value) => <span>{value || '每 1 小时'}</span> },
    { title: '下次执行', dataIndex: 'nextRun', width: 115, responsive: ['md'], render: (value) => <span className="mono muted">{value}</span> },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value) => <StatusTag value={value} />,
    },
    { title: '最近结果', width: 105, responsive: ['lg'], render: (_, task) => {
      const latest = executions.find((execution) => execution.taskId === task.id)
      return latest ? <StatusTag value={latest.status} /> : <span className="muted">暂无执行</span>
    } },
  ]
  const boundAuthFunction = draft ? AUTH_FUNCTIONS.find((item) => item.value === draft.authFunctionId) : null
  const isCreating = Boolean(createRequested && draft?.isNew)
  const draftSite = draft?.siteHost ? sites.find((site) => site.host === draft.siteHost) : selectedTaskSite
  const taskDisplayName = defaultTaskName(draftSite) || '采集计划'
  const canCreateTask = Boolean(isCreating && draft.siteHost && isRuleReady(selectedRule))
  if ((selectedTask || isCreating) && draft) {
    return (
      <div className={embedded ? 'collection-config-page collection-config-embedded' : 'page-content collection-config-page'}>
        {!embedded && <div className="back-row">
          <Button icon={<LeftOutlined />} onClick={backToList}>返回网站管理</Button>
          <span>{isCreating ? '新建采集计划' : '采集配置'}</span>
        </div>}

        {setupMode === 'onboarding' && (
          <Alert
            className="collection-setup-alert"
            type="success"
            showIcon
            title="规则已经发布，只差首次采集"
            description={isCreating
              ? '确认采集范围和频率后，保存并启用计划即可完成接入。'
              : '确认采集范围和频率后，点击“开始首次采集”即可完成接入。'}
          />
        )}

        <section className="collection-config-surface collection-config-header">
          <div className="collection-config-identity">
            <div className="collection-title-row">
              <h1>{isCreating && !draftSite ? '新建采集计划' : taskDisplayName}</h1>
            </div>
            <span className="mono">{isCreating ? '保存后生成计划 ID' : selectedTask.id}</span>
          </div>
          <div className="collection-task-switch">
            {isCreating ? <span className="collection-lifecycle-tag">未保存</span> : <>
              {selectedRule?.status === '需修复' && <StatusTag value="规则异常" />}
              <span>计划状态</span>
              <Switch aria-label={`启用采集计划：${taskDisplayName}`} checked={draft.enabled} onChange={(enabled) => updateDraft({ enabled })} />
              <Button type="primary" icon={<CaretRightOutlined />} disabled={!draft.enabled || selectedRule?.status === '需修复'} onClick={runNow}>{setupMode === 'onboarding' ? '开始首次采集' : '立即执行'}</Button>
            </>}
          </div>
        </section>

        <section className="collection-config-surface collection-config-section collection-basic-section">
          <div className="collection-section-heading">
            <div>
              <h2>{isCreating && !embedded ? '基本信息' : '规则版本'}</h2>
              <p>{isCreating && !embedded ? '选择网站后绑定已发布规则' : '控制计划使用最新发布版本或固定版本'}</p>
            </div>
          </div>
          <div className={`collection-basic-grid ${isCreating && !embedded ? 'existing' : 'single'}`}>
            {isCreating && !embedded && (
              <label className="collection-basic-field">
                <span>关联网站 <b>*</b></span>
                <Select
                  showSearch
                  optionFilterProp="label"
                  value={draft.siteHost || undefined}
                  options={siteOptions}
                  placeholder="选择已完成规则发布的网站"
                  onChange={updateDraftSite}
                />
                <small>{selectedRule ? `采集规则 ${selectedRule.id} · ${selectedRule.version}` : '仅可选择已经发布采集规则的网站'}</small>
              </label>
            )}
            <label className="collection-basic-field">
              <span>版本策略</span>
              <Select value={draft.versionPolicy} options={['跟随最新发布', '固定当前版本'].map((value) => ({ value, label: value }))} onChange={(versionPolicy) => updateDraft({ versionPolicy })} />
              <small>{selectedRule ? `当前规则 ${selectedRule.id} · ${selectedRule.version}；` : ''}{draft.versionPolicy === '跟随最新发布' ? '规则发布后自动同步到本计划' : '始终使用创建时绑定的规则版本'}</small>
            </label>
          </div>
        </section>

        <section className="collection-config-surface collection-config-section collection-strategy-section">
          <h2>采集模式</h2>

          <div className="mode-grid collection-mode-grid">
            <button type="button" className={`mode-card ${draft.collectionMode === '全量' ? 'active' : ''}`} onClick={() => updateDraft({ collectionMode: '全量' })}>
              <span className="radio-dot" />
              <span><strong>全量采集</strong></span>
            </button>
            <button type="button" className={`mode-card ${draft.collectionMode === '增量' ? 'active' : ''}`} onClick={() => updateDraft({ collectionMode: '增量' })}>
              <span className="radio-dot" />
              <span><strong>定时增量</strong></span>
            </button>
          </div>
        </section>

        <section className="collection-config-surface collection-config-section collection-frequency-section">
          <div className="collection-section-heading">
            <h2>采集频率</h2>
            <span>下次采集：<b className="mono">{isCreating ? '保存后计算' : selectedTask.nextRun}</b></span>
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

        <details className="collection-config-surface collection-optional-section">
          <summary>
            <div><strong>高级参数</strong></div>
            <DownOutlined className="collection-optional-chevron" />
          </summary>
          <div className="collection-config-section collection-optional-body"><div className="collection-advanced-grid">
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
          </div></div>
        </details>

        <details className="collection-config-surface collection-optional-section collection-auth-details">
          <summary>
            <div className="collection-auth-title">
              <span><SafetyCertificateOutlined /></span>
              <div><h2>鉴权与请求增强</h2></div>
            </div>
            <DownOutlined className="collection-optional-chevron" />
          </summary>
          <div className="collection-config-section collection-auth-section collection-optional-body">
            <div className="collection-auth-body">
              <div className="collection-auth-method collection-header-method">
                <div className="collection-auth-method-heading">
                  <div><strong>自定义 Header</strong></div>
                  <Switch aria-label="启用自定义 Header" size="small" checked={draft.customHeadersEnabled} onChange={toggleCustomHeaders} />
                </div>
                {draft.customHeadersEnabled && (
                  <>
                    <div className="collection-header-list">
                      {draft.headers.map((header, index) => (
                        <div className="collection-header-row" key={index}>
                          <Input className="mono" aria-label={`请求头 ${index + 1} 名称`} placeholder="Header 名称" value={header.name} onChange={(event) => updateRequestHeader(index, { name: event.target.value })} />
                          <Input className="mono" aria-label={`请求头 ${index + 1} 值`} placeholder="值" value={header.value} onChange={(event) => updateRequestHeader(index, { value: event.target.value })} />
                          <Tooltip title="删除请求头"><Button aria-label={`删除请求头 ${index + 1}`} icon={<DeleteOutlined />} onClick={() => removeRequestHeader(index)} /></Tooltip>
                        </div>
                      ))}
                    </div>
                    <Button className="collection-add-header" type="dashed" icon={<PlusOutlined />} onClick={addRequestHeader}>添加 Header</Button>
                  </>
                )}
              </div>

              <div className="collection-auth-method collection-function-method">
                <div className="collection-auth-method-heading">
                  <div><strong>Python 鉴权函数</strong></div>
                </div>
                <Select
                  className="collection-function-select"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  aria-label="绑定 Python 鉴权函数"
                  placeholder="不使用鉴权函数"
                  value={draft.authFunctionId || undefined}
                  onChange={(authFunctionId) => updateDraft({ authFunctionId: authFunctionId || '' })}
                  options={AUTH_FUNCTIONS.map((item) => ({ value: item.value, label: `${item.label} · ${item.module}` }))}
                />
                {boundAuthFunction && (
                  <div className="collection-function-binding">
                    <CodeOutlined />
                    <div>
                      <strong>{boundAuthFunction.module}</strong>
                      <span className="mono">{boundAuthFunction.signature}</span>
                    </div>
                    <Tag>Python</Tag>
                  </div>
                )}
              </div>
            </div>
          </div>
        </details>

        <div className="collection-save-bar">
          {isCreating ? <>
            <Button onClick={backToList}>取消</Button>
            <Button disabled={!canCreateTask} onClick={() => createFromDraft(false)}>保存草稿</Button>
            <Button type="primary" icon={<SaveOutlined />} disabled={!canCreateTask} onClick={() => createFromDraft(true)}>保存并启用</Button>
          </> : <>
            <Button onClick={() => setDraft(createDraft(selectedTask, selectedRule, selectedTaskSite))}>重置</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={() => saveConfig()}>保存配置</Button>
          </>}
        </div>
      </div>
    )
  }

  return (
    <div className={embedded ? 'collection-page collection-config-embedded' : 'page-content collection-page'}>
      {!embedded && (ruleFilter || taskFilter || siteFilter) && <Alert className="context-filter-alert" type="info" showIcon title={<>当前仅显示{ruleFilter ? '规则' : taskFilter ? '计划' : '网站'} <b className="mono">{ruleFilter || taskFilter || contextSite?.name || siteFilter}</b> 的采集计划</>} closable onClose={() => navigate('/tasks')} />}

      {!embedded && <div className="collection-list-toolbar"><Segmented className="collection-filter" value={scope} onChange={setScope} options={['全部', '已启用', '已暂停', '异常', '全量采集', '定时增量']} /><div className="toolbar-spacer" /><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建计划</Button></div>}

      {siteFilter && !visibleTasks.length ? (
        <section className="collection-table-surface collection-context-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<><strong>{contextSite?.name || siteFilter} 暂无采集计划</strong><span>{contextRuleReady ? `网站规则 ${contextRule.id} 已就绪，可以创建采集计划。` : '请先完成并发布网站采集规则，再创建采集计划。'}</span></>}
          >
            <Space wrap>
              {contextRuleReady && <Button type="primary" onClick={openCreate}>创建采集计划</Button>}
              {(contextRule || embedded) && <Button type={contextRuleReady ? 'default' : 'primary'} onClick={() => navigate(embedded ? getSiteWorkspacePath(embeddedSite, 'rule') : getSiteRulePath(contextRule.siteHost))}>{contextRuleReady ? '查看采集规则' : '完成采集规则'}</Button>}
              {!embedded && <Button onClick={() => navigate('/sites')}>返回网站管理</Button>}
            </Space>
          </Empty>
        </section>
      ) : (
        <section className="collection-table-surface">
          <Table
            className="collection-table"
            rowKey="id"
            columns={columns}
            dataSource={pagedTasks}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 730 }}
          />
        </section>
      )}

      <div className="collection-pagination">
        <span>第 {start}–{end} 项 · 共 {visibleTasks.length} 个计划</span>
        <Pagination current={page} pageSize={PAGE_SIZE} total={visibleTasks.length} showSizeChanger={false} hideOnSinglePage onChange={setPage} />
      </div>

    </div>
  )
}
