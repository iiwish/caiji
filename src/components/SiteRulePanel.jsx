import { useEffect, useState } from 'react'
import { Alert, App as AntApp, Button, Descriptions, Empty, Input, Space, Timeline, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  EditOutlined,
  ExperimentOutlined,
  RocketOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageTitle, SectionCard, StatusTag } from './ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { getSiteWorkspacePath } from '../app/routes'

function createCandidateVersion(version) {
  const parts = version.replace(/^v/, '').split('.').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return `${version}-rc.1`
  return `v${parts[0]}.${parts[1]}.${parts[2] + 1}-rc.1`
}

export function SiteRulePanel({ site, rule, standalone = false, onOpenPlan }) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { tasks, executions, updateRule, runRegression, publishRule, validateAndPublishRule, startSiteAnalysis, runTask } = usePrototype()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(rule?.yaml || '')
  const fromExecutionId = params.get('fromExecution')
  const fromFailureId = params.get('fromFailure')
  const editRequested = params.get('edit') === '1'
  const sourceExecution = executions.find((execution) => execution.id === fromExecutionId)
  const boundTasks = tasks.filter((task) => task.siteId === site.id || task.site === site.name || task.ruleId === rule?.id)

  useEffect(() => {
    setEditing(editRequested)
    setDraft(rule?.yaml || '')
  }, [rule?.id, rule?.yaml, editRequested])

  const beginAnalysis = (kind) => {
    const url = rule?.entryUrl || site.entryUrl || `https://${site.host}`
    const result = startSiteAnalysis({
      siteName: site.name,
      siteHost: site.host,
      url,
      ruleId: rule?.id,
      kind,
      failureId: fromFailureId || '',
      sourceExecutionId: fromExecutionId || '',
      folderId: site.folderId,
    })
    navigate(`/ai?entry=${encodeURIComponent(result.entryId)}&site=${encodeURIComponent(site.host)}&mode=${kind}${fromExecutionId ? `&fromExecution=${encodeURIComponent(fromExecutionId)}` : ''}`)
  }

  if (!rule) {
    return (
      <div className="site-rule-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<><strong>该网站还没有可用的采集规则</strong><span>规则会在 URL 完成 AI 分析并审核通过后写入当前网站。</span></>}
        >
          <Button type="primary" icon={<RobotOutlined />} onClick={() => beginAnalysis('reanalyze')}>继续 AI 分析</Button>
        </Empty>
      </div>
    )
  }

  const ruleReady = rule.status === '已发布' && rule.version !== 'v0.0.0'

  const openPlans = () => {
    if (onOpenPlan) {
      onOpenPlan()
      return
    }
    navigate(getSiteWorkspacePath(site, 'plan'))
  }

  const retrySourceExecution = () => {
    if (!sourceExecution) return
    const executionId = runTask(sourceExecution.taskId, sourceExecution.id)
    if (!executionId) {
      message.warning('请先发布可用规则并恢复采集计划')
      return
    }
    message.success(`已创建重跑执行 ${executionId}`)
    navigate(`/executions/${executionId}`)
  }

  const saveCandidate = () => {
    const publishedYaml = rule.publishedYaml || rule.yaml
    if (draft.trim() === publishedYaml.trim()) {
      message.warning('候选内容与当前发布版本一致，请先完成有效修改')
      return
    }
    updateRule(rule.id, {
      yaml: draft,
      publishedYaml,
      status: '候选版本',
      candidateVersion: rule.candidateVersion || createCandidateVersion(rule.version),
      regression: 'pending',
      regressionMessage: '',
      health: '待回归',
    })
    setEditing(false)
    message.success('已保存候选版本，线上采集计划继续使用当前发布版本')
  }

  const publish = () => {
    const result = publishRule(rule.id)
    if (!result) return message.warning('请先运行并通过回归验证')
    if (result.syncedTasks) message.success(`已发布 ${result.version}，同步更新 ${result.syncedTasks} 个采集计划`)
    else message.success(`已发布 ${result.version}`)
  }

  const validateAndPublishRepair = () => {
    const result = validateAndPublishRule(rule.id)
    if (!result.ok) {
      message.error(`验证未通过：${result.reason}`)
      return
    }
    if (result.syncedTasks) message.success(`验证通过并发布 ${result.version}，已恢复 ${result.syncedTasks} 个采集计划`)
    else message.success(`验证通过并发布 ${result.version}`)
  }

  const applyRepairSuggestion = () => {
    const repaired = rule.yaml.includes('div.m_list div.item')
      ? rule.yaml.replace('div.m_list div.item', 'section.notice-list article.notice-item')
      : `${rule.yaml.trim()}\n\nrepair:\n  fallback_selector: article.notice-item`
    setDraft(repaired)
    setEditing(true)
    message.info('已应用修复建议，请检查后保存候选版本')
  }

  return (
    <div className="site-rule-panel">
      <section className="site-rule-summary">
        <div>
          <div className="site-rule-title"><h2>{standalone ? '规则配置与发布' : '采集规则'}</h2><StatusTag value={rule.status} /></div>
          <span className="mono muted">{rule.id} · {rule.entryUrl}</span>
        </div>
        <Space wrap>
          {(boundTasks.length > 0 || ruleReady) && <Button onClick={openPlans}>{boundTasks.length ? '查看采集计划' : '创建采集计划'}</Button>}
          {!editing && <Button icon={<EditOutlined />} onClick={() => { setDraft(rule.yaml); setEditing(true) }}>编辑规则</Button>}
          {rule.status !== '需修复' && <Tooltip title="重新识别页面结构并生成候选规则，不影响当前生产版本"><Button aria-label="AI 重新分析" icon={<RobotOutlined />} onClick={() => beginAnalysis('reanalyze')} /></Tooltip>}
        </Space>
      </section>

      {sourceExecution && (
        <Alert
          className="rule-repair-context"
          type={ruleReady ? 'success' : 'warning'}
          showIcon
          title={ruleReady ? `规则已可用，可以重跑 ${sourceExecution.id}` : rule.candidateVersion ? '候选修复规则已生成' : `正在修复失败执行 ${sourceExecution.id}`}
          description={ruleReady
            ? '重跑会创建一条新的采集记录，并保留原失败执行用于追溯。'
            : rule.candidateVersion
              ? `${rule.candidateVersion} 尚未影响生产；验证通过后将发布并恢复关联计划。`
              : `${sourceExecution.stage || '采集执行'} · ${sourceExecution.issue}`}
          action={ruleReady
            ? <Button type="primary" icon={<RocketOutlined />} onClick={retrySourceExecution}>重跑任务</Button>
            : rule.candidateVersion
              ? <Button type="primary" icon={<ExperimentOutlined />} onClick={validateAndPublishRepair}>验证并发布修复</Button>
              : null}
        />
      )}

      <Descriptions className="site-rule-facts" column={{ xs: 1, sm: 3 }} items={[
        { key: 'version', label: '发布版本', children: <span className="mono">{rule.version}</span> },
        { key: 'candidate', label: '候选版本', children: <span className="mono">{rule.candidateVersion || '-'}</span> },
        { key: 'health', label: '规则健康', children: <StatusTag value={rule.health} /> },
      ]} />

      {rule.status === '需修复' && (
        <Alert
          className="workflow-alert"
          type="error"
          showIcon
          title="最近执行未能匹配列表内容"
          description="建议修正选择器，保存候选版本并完成回归后再发布。"
          action={<Space wrap><Button icon={<ThunderboltOutlined />} onClick={applyRepairSuggestion}>应用修复建议</Button><Button type="primary" danger icon={<RobotOutlined />} onClick={() => beginAnalysis('diagnose')}>AI 诊断修复</Button></Space>}
        />
      )}

      <div className="site-rule-editor-grid">
        <SectionCard
          title={<PageTitle>规则配置</PageTitle>}
          extra={editing ? (
            <Space>
              <Button onClick={() => { setDraft(rule.yaml); setEditing(false) }}>取消</Button>
              <Button type="primary" onClick={saveCandidate}>保存候选</Button>
            </Space>
          ) : <span className="mono muted">{rule.version}</span>}
        >
          {editing
            ? <Input.TextArea className="code-editor site-rule-editor" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
            : <pre className="code-block site-rule-code"><code>{rule.yaml}</code></pre>}
        </SectionCard>

        <div className="site-rule-side">
          <SectionCard title={<PageTitle>验证与发布</PageTitle>}>
            <Timeline items={[
              { color: 'green', icon: <CheckCircleOutlined />, content: <div><strong>生产版本 {rule.version}</strong><p className="muted">采集计划继续使用已冻结版本</p></div> },
              { color: rule.candidateVersion ? 'blue' : 'gray', content: <div><strong>{rule.candidateVersion || '暂无候选版本'}</strong><p className="muted">编辑规则会生成候选快照</p></div> },
              { color: rule.regression === 'passed' ? 'green' : rule.regression === 'failed' ? 'red' : 'gray', content: <div><strong>回归验证：{rule.regression === 'passed' ? '已通过' : rule.regression === 'failed' ? '未通过' : '待运行'}</strong><p className="muted">{rule.regressionPassed ?? (rule.regression === 'passed' ? 20 : 0)}/{rule.regressionTotal || 20} 个样本{rule.regressionMessage ? ` · ${rule.regressionMessage}` : ''}</p></div> },
            ]} />
            <div className="stack-actions">
              <Button block icon={<ExperimentOutlined />} disabled={!rule.candidateVersion} onClick={() => {
                const result = runRegression(rule.id)
                result.passed
                  ? message.success(`回归验证完成：${result.passedCount}/${result.total} 通过`)
                  : message.error(`回归未通过：${result.reason}`)
              }}>运行回归</Button>
              <Button block type="primary" icon={<RocketOutlined />} disabled={!rule.candidateVersion || rule.regression !== 'passed'} onClick={publish}>发布候选版本</Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
