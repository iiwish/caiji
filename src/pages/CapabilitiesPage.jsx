import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Button, Descriptions, Grid, Input, Modal, Progress, Segmented, Space, Table, Timeline } from 'antd'
import { CodeOutlined, EditOutlined, ExperimentOutlined, HistoryOutlined, LeftOutlined, RocketOutlined } from '@ant-design/icons'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { PageTitle, RowActions, SectionCard, SourceCell, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

export function CapabilitiesPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { capabilityId } = useParams()
  const screens = Grid.useBreakpoint()
  const { search } = useOutletContext()
  const { capabilities, saveCapabilityCandidate, runCapabilityRegression, publishCapability } = usePrototype()
  const [scope, setScope] = useState('全部')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const selected = capabilities.find((item) => item.id === capabilityId)
  const visible = useMemo(() => capabilities.filter((item) => (scope === '全部' || item.status === scope) && `${item.id}${item.name}${item.version}`.includes(search)), [capabilities, scope, search])

  useEffect(() => {
    setEditing(false)
    setHistoryOpen(false)
    setDraft(selected?.document || '')
  }, [selected?.id, selected?.document])

  const openCapability = (capability) => navigate(`/capabilities/${encodeURIComponent(capability.id)}`)

  const saveCandidate = () => {
    const result = saveCapabilityCandidate(selected.id, draft)
    if (!result.ok) return message.warning(result.reason)
    setEditing(false)
    message.success(`已保存候选版本 ${result.version}`)
  }

  const runRegression = () => {
    const result = runCapabilityRegression(selected.id)
    if (result.passed) message.success(`Golden Samples 回归完成：${result.passedCount}/${result.total}`)
    else message.error(`回归未通过：${result.reason}`)
  }

  const publish = () => {
    const result = publishCapability(selected.id)
    if (!result) return message.warning('请先运行并通过 Golden Samples 回归')
    setEditing(false)
    message.success(`Skill ${result.version} 已发布，影响规则将在下一次生成时使用新版本`)
  }

  if (capabilityId && !selected) {
    return (
      <div className="page-content capability-workspace-page">
        <div className="back-row"><Button icon={<LeftOutlined />} onClick={() => navigate('/capabilities')}>返回 Skill 能力</Button><span>能力维护</span></div>
        <Alert type="error" showIcon title="Skill 能力不存在" />
      </div>
    )
  }

  if (selected) {
    return (
      <div className="page-content capability-workspace-page">
        <div className="back-row"><Button icon={<LeftOutlined />} onClick={() => navigate('/capabilities')}>返回 Skill 能力</Button><span>能力维护</span></div>
        <section className="detail-workspace-header capability-workspace-header">
          <span className="detail-workspace-icon"><CodeOutlined /></span>
          <div className="detail-workspace-identity">
            <div><h1>{selected.name}</h1><StatusTag value={selected.status} /></div>
            <span className="mono">{selected.id} · {selected.version}</span>
          </div>
          <Space wrap>{editing ? <><Button onClick={() => { setDraft(selected.document); setEditing(false) }}>取消</Button><Button type="primary" onClick={saveCandidate}>保存候选</Button></> : <Button icon={<EditOutlined />} onClick={() => { setDraft(selected.document); setEditing(true) }}>编辑 SKILL.md</Button>}</Space>
        </section>

        <Descriptions className="detail-workspace-facts" column={{ xs: 1, sm: 3 }} items={[
          { key: 'rules', label: '影响规则', children: `${selected.rules} 条` },
          { key: 'rate', label: '回归成功率', children: selected.successRate },
          { key: 'updated', label: '更新时间', children: selected.updatedAt },
        ]} />

        <div className="capability-grid">
          <SectionCard title={<PageTitle>SKILL.md</PageTitle>}>
            {editing ? <Input.TextArea className="code-editor capability-editor" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} /> : <pre className="code-block capability-code"><code>{selected.document}</code></pre>}
          </SectionCard>
          <SectionCard title={<PageTitle>候选发布</PageTitle>}>
            <Timeline items={[
              { color: 'green', content: '格式检查通过' },
              { color: selected.regression === 'passed' ? 'green' : selected.status === '候选版本' ? 'blue' : 'gray', content: `Golden Samples ${selected.goldenPassed || 0}/${selected.goldenTotal || 20}` },
              { color: selected.status === '已发布' ? 'green' : 'gray', content: selected.status === '已发布' ? `生产版本 ${selected.version}` : '等待发布' },
            ]} />
            {selected.regressionMessage && <Alert className="capability-regression-alert" type={selected.regression === 'passed' ? 'success' : 'error'} showIcon title={selected.regressionMessage} />}
            <Alert type="info" showIcon title="能力发布会影响多条规则，必须先完成 Golden Samples 回归。" />
            <div className="stack-actions">
              <Button block icon={<ExperimentOutlined />} disabled={selected.status !== '候选版本'} onClick={runRegression}>运行回归</Button>
              <Button block icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>版本历史</Button>
              <Button block type="primary" icon={<RocketOutlined />} disabled={selected.status !== '候选版本' || selected.regression !== 'passed'} onClick={publish}>发布候选版本</Button>
            </div>
          </SectionCard>
        </div>

        <Modal title={`${selected.name} · 版本历史`} open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={<Button onClick={() => setHistoryOpen(false)}>关闭</Button>} width={620}>
          <Table rowKey={(row) => `${row.version}-${row.time}`} size="small" pagination={false} dataSource={selected.history || []} columns={[
            { title: '版本', dataIndex: 'version', width: 120, render: (value) => <span className="mono">{value}</span> },
            { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag value={value} /> },
            { title: '发布时间', dataIndex: 'time' },
            { title: '操作人', dataIndex: 'operator', width: 120 },
          ]} />
        </Modal>
      </div>
    )
  }

  const columns = [
    { title: '能力', width: screens.md ? 260 : undefined, render: (_, row) => <SourceCell name={row.name} host={row.id} onClick={() => openCapability(row)} ariaLabel={`查看 ${row.name}`} /> },
    { title: '版本', dataIndex: 'version', width: 130, responsive: ['lg'], render: (value) => <span className="mono">{value}</span> },
    { title: '状态', dataIndex: 'status', width: 120, responsive: ['sm'], render: (value) => <StatusTag value={value} /> },
    { title: '影响规则', dataIndex: 'rules', width: 100, align: 'right', responsive: ['xl'] },
    { title: '回归成功率', dataIndex: 'successRate', width: 170, responsive: ['md'], render: (value) => <Progress percent={Number.parseFloat(value)} size="small" /> },
    { title: '更新时间', dataIndex: 'updatedAt', width: 130, responsive: ['xl'] },
    { title: '操作', width: screens.md ? 100 : 84, fixed: screens.md ? 'right' : undefined, align: 'right', render: (_, row) => <RowActions primary={{ label: '维护', onClick: () => openCapability(row) }} /> },
  ]

  return (
    <div className="page-content">
      <div className="list-toolbar"><Segmented value={scope} onChange={setScope} options={['全部', '已发布', '候选版本']} /><div className="toolbar-spacer" /></div>
      <SectionCard title={<PageTitle count={visible.length}>能力策略</PageTitle>} bodyStyle={{ padding: 0 }}>
        <Table className="capabilities-table" rowKey="id" columns={columns} dataSource={visible} pagination={false} scroll={screens.md ? { x: 720 } : undefined} />
      </SectionCard>
    </div>
  )
}
