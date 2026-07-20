import { useEffect, useState } from 'react'
import { Alert, App as AntApp, Button, Descriptions, Empty, Input, Space, Table, Timeline, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  EditOutlined,
  ExperimentOutlined,
  RocketOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { PageTitle, SectionCard, StatusTag } from './ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

function createCandidateVersion(version) {
  const parts = version.replace(/^v/, '').split('.').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return `${version}-rc.1`
  return `v${parts[0]}.${parts[1]}.${parts[2] + 1}-rc.1`
}

export function SiteRulePanel({ site, rule }) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { tasks, updateRule, runRegression, publishRule, startSiteAnalysis } = usePrototype()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(rule?.yaml || '')

  useEffect(() => {
    setEditing(false)
    setDraft(rule?.yaml || '')
  }, [rule?.id, rule?.yaml])

  const beginAnalysis = (kind) => {
    const url = rule?.entryUrl || site.entryUrl || `https://${site.host}`
    const result = startSiteAnalysis({ siteName: site.name, siteHost: site.host, url, ruleId: rule?.id, kind })
    navigate(`/ai?entry=${encodeURIComponent(result.entryId)}&site=${encodeURIComponent(site.host)}&mode=${kind}`)
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

  const boundTasks = tasks.filter((task) => task.site === site.name)

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
    message.success('已保存候选版本，线上任务继续使用当前发布版本')
  }

  const publish = () => {
    const result = publishRule(rule.id)
    if (!result) return message.warning('请先运行并通过回归验证')
    if (result.syncedTasks) message.success(`已发布 ${result.version}，同步更新 ${result.syncedTasks} 个任务`)
    else message.success(`已发布 ${result.version}`)
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
          <div className="site-rule-title"><h3>采集规则</h3><StatusTag value={rule.status} /></div>
          <span className="mono muted">{rule.id} · {rule.entryUrl}</span>
        </div>
        <Space wrap>
          <Button onClick={() => navigate(`/tasks?site=${encodeURIComponent(site.host)}`)}>查看采集任务</Button>
          {!editing && <Button icon={<EditOutlined />} onClick={() => { setDraft(rule.yaml); setEditing(true) }}>编辑规则</Button>}
          {rule.status !== '需修复' && <Tooltip title="重新识别页面结构并生成候选规则，不影响当前生产版本"><Button aria-label="AI 重新分析" icon={<RobotOutlined />} onClick={() => beginAnalysis('reanalyze')} /></Tooltip>}
        </Space>
      </section>

      <Descriptions className="site-rule-facts" column={{ xs: 1, sm: 2, lg: 4 }} items={[
        { key: 'url', label: '网站 URL', children: <span className="mono">{rule.entryUrl}</span> },
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
              { color: 'green', icon: <CheckCircleOutlined />, content: <div><strong>生产版本 {rule.version}</strong><p className="muted">采集任务继续使用已冻结版本</p></div> },
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

          <SectionCard title={<PageTitle count={boundTasks.length}>采集任务</PageTitle>} bodyStyle={{ padding: 0 }}>
            <Table rowKey="id" size="small" pagination={false} dataSource={boundTasks} columns={[
              { title: '任务', dataIndex: 'name' },
              { title: '版本', dataIndex: 'ruleVersion', width: 80, render: (value) => <span className="mono">{value}</span> },
              { title: '状态', dataIndex: 'status', width: 80, render: (value) => <StatusTag value={value} /> },
            ]} />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
