import { useState } from 'react'
import { Button, Image, Segmented } from 'antd'
import {
  BookOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  ScheduleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const JOURNEYS = {
  recovery: {
    label: '失败后重新生成规则并重采',
    shortLabel: '失败修复与重采',
    icon: <WarningOutlined />,
    summary: '适用于页面结构变化、字段规则失效等规则类故障。先诊断影响，再生成候选规则，发布后只重跑原失败任务。',
    route: ['识别规则故障', '提交 AI 诊断', '审核并发布规则', '重跑并验收'],
    startLabel: '打开失败队列',
    startPath: '/failures',
    steps: [
      {
        id: 'recovery-identify',
        title: '确认故障属于规则问题',
        description: '进入失败队列后，优先查看错误类型、系统诊断、重试次数和系统建议。解析失败、列表容器不匹配、字段返回空值通常需要重新生成规则；请求超时或 HTTP 5xx 应先直接重试。',
        actions: ['按“解析失败”筛选，或直接定位目标网站', '查看系统建议是否为“生成规则”', '可勾选同类故障后批量生成，同一网站会自动合并'],
        checkpoint: '继续条件：系统建议为“生成规则”，且故障关联到网站资产和现有采集规则。',
        image: '/manual/failure-queue.jpg',
        imageAlt: '失败队列中筛选解析失败并选择故障',
        caption: '失败队列会按错误指纹聚合页面，并给出重试、调整配置或生成规则的处理建议。',
      },
      {
        id: 'recovery-diagnose',
        title: '检查影响范围并提交 AI 重新生成',
        description: '点击“诊断处理”打开故障工作台，核对错误码、影响页面、关联计划、规则版本和执行日志。确认是规则问题后，点击“AI 重新生成规则”。',
        actions: ['确认失败页面属于同一网站和同一错误指纹', '检查日志中的旧选择器、响应状态和最后一次重试结果', '提交后系统会复用活动分析任务，避免同一网站重复分析'],
        checkpoint: '完成标志：进入 AI 分析队列，并保留原失败执行与故障事件的关联。',
        image: '/manual/failure-diagnosis.jpg',
        imageAlt: '故障处理工作台展示诊断、影响范围和 AI 重新生成入口',
        caption: '故障工作台将错误、影响范围、关联计划和日志集中到一次处理上下文中。',
      },
      {
        id: 'recovery-review',
        title: '审核识别字段、样例与自动回归',
        description: 'AI 完成分析后，逐项检查列表容器、标题、详情链接、发布时间和原始数据定位，并抽查试采集样例。自动回归未通过时，使用“人工订正”或修正提示词重新分析，不能直接发布。',
        actions: ['展开原始数据，确认选择器对应真实页面内容', '检查样例标题、时间和详情链接是否稳定', '自动回归通过后点击“审核通过”，系统发布新规则并同步跟随最新版本的计划'],
        checkpoint: '继续条件：AI 自动回归通过，候选规则已审核发布，规则版本号已更新。',
        image: '/manual/ai-rule-review.jpg',
        imageAlt: 'AI 分析页面展示识别字段、采集样例和生成配置',
        caption: '审核重点是字段定位和样例真实性；失败样例必须先订正并重新回归。',
      },
      {
        id: 'recovery-rerun',
        title: '重跑原失败任务并完成验收',
        description: '规则发布完成后点击“重跑失败任务”。系统会基于原执行创建新的重跑批次，不改变原失败记录。进入采集记录查看状态、采集量、耗时和执行日志。',
        actions: ['等待重跑状态变为“成功”', '打开采集明细，抽查标题、采购单位、类型和详情链接', '必要时前往原文库核对正文与来源链路'],
        checkpoint: '闭环标准：新规则已发布、重跑成功、采集量大于 0，且未再次出现相同错误指纹。',
        image: '/manual/execution-result.jpg',
        imageAlt: '采集记录中的成功批次和采集明细',
        caption: '采集明细用于确认重跑不是“空成功”，应至少抽查一组真实入库数据。',
      },
    ],
  },
  onboarding: {
    label: '导入网站、AI 分析并配置采集',
    shortLabel: '网站接入与首次采集',
    icon: <GlobalOutlined />,
    summary: '适用于首次接入新网站。先批量建立网站资产，再通过受控队列分析规则，经发布后配置采集计划并完成首次执行验收。',
    route: ['新建分析任务', 'AI 分析并发布', '配置采集计划', '执行并验收'],
    startLabel: '打开 AI 分析',
    startPath: '/ai',
    steps: [
      {
        id: 'onboarding-import',
        title: '导入网站并创建受控分析批次',
        description: '网站管理支持只导入资产而不触发 AI；需要分析时进入 AI 分析创建批次。可以粘贴 URL、导入 CSV 或 XLSX，也可以选择已有网站。系统先按域名合并网站，同一批次最多并发分析 20 个，其余任务保持排队。',
        actions: ['每行填写一个 URL，或使用“网站名称,URL”格式', '批量文件使用网站名称、网站 URL 两列，并选择归属文件夹', '创建后查看运行数和排队数；需要让出 AI 资源时暂停批次，稍后再继续'],
        checkpoint: '完成标志：网站资产已新增或更新，分析批次已创建，超出并发上限的任务处于“排队中”。',
        image: null,
        imageAlt: '',
        caption: '',
      },
      {
        id: 'onboarding-analyze',
        title: '确认网站归属并发布采集规则',
        description: 'AI 按受控并发从队列中取出任务，识别网站归属、列表结构、字段选择器和请求配置，并试采集样例。左侧任务队列按需要处理、分析中和排队中分组分页展示。',
        actions: ['确认网站名称和入口 URL 对应同一数据源', '检查标题、详情链接、发布时间和正文定位', '自动回归通过后审核发布；无需处理时可取消仍在排队的任务'],
        checkpoint: '继续条件：规则状态为“已发布”，网站资产进入可配置采集计划的状态。',
        image: '/manual/ai-rule-review.jpg',
        imageAlt: 'AI 分析页面展示网站字段识别与自动回归结果',
        caption: 'AI 分析不仅生成选择器，还必须用采集样例和自动回归证明配置可用。',
      },
      {
        id: 'onboarding-task',
        title: '创建并启用采集计划',
        description: '规则发布后进入网站详情的采集计划页。计划名称和所属网站由网站资产自动确定，只需确认规则版本策略、采集模式与频率。首次接入通常先执行全量采集，日常运行再使用定时增量。',
        actions: ['首次历史回补选择“全量采集”，日常任务选择“定时增量”', '设置采集频率；并发、间隔、重试和鉴权按需展开配置', '尚未确认时保存草稿，确认无误后点击“保存并启用”'],
        checkpoint: '完成标志：计划已生成 ID、状态为启用，并已绑定发布规则。',
        image: '/manual/task-configuration.jpg',
        imageAlt: '新建采集计划页面展示网站、采集模式和频率配置',
        caption: '基本信息和运行策略在同一页面完成，高级参数与鉴权默认折叠。',
      },
      {
        id: 'onboarding-run',
        title: '执行首次采集并检查入库结果',
        description: '启用后可立即执行，也可等待调度。执行状态、采集量、日志和明细统一进入网站详情的运行记录；入库时系统会按标准 URL、业务标识和内容指纹识别跨网站重复内容。',
        actions: ['进入运行记录确认执行从“运行中”变为“成功”', '打开采集明细抽查字段和原始内容，不只检查状态标签', '在原文库查看多来源归并记录；重复候选经人工确认后归并到主记录，所有网站来源继续保留'],
        checkpoint: '闭环标准：采集执行成功、有效数据已入库、重复内容已归并并保留多来源追溯，后续调度已按计划生效。',
        image: '/manual/execution-result.jpg',
        imageAlt: '成功采集批次展示入库数据明细',
        caption: '执行成功后仍需抽查明细和原文，确认采集量与数据质量同时达标。',
      },
    ],
  },
}

const FLOW_ICONS = [<FileSearchOutlined key="analyze" />, <RobotOutlined key="ai" />, <ScheduleOutlined key="schedule" />, <DatabaseOutlined key="database" />]

export function ManualPage() {
  const navigate = useNavigate()
  const [journeyKey, setJourneyKey] = useState('recovery')
  const journey = JOURNEYS[journeyKey]

  return (
    <div className="page-content manual-page">
      <section className="manual-intro">
        <div className="manual-intro-icon"><BookOutlined /></div>
        <div>
          <span className="manual-eyebrow">OPERATION RUNBOOK</span>
          <h1>采集平台操作手册</h1>
          <p>面向采集运营与规则维护人员，覆盖故障修复和新网站接入两条完整生产链路。</p>
        </div>
        <div className="manual-intro-meta">
          <span>2 条用户旅程</span>
          <span>8 个操作阶段</span>
          <span>内容更新于 2026-07-23</span>
        </div>
      </section>

      <div className="manual-journey-switch">
        <Segmented
          block
          value={journeyKey}
          onChange={setJourneyKey}
          options={Object.entries(JOURNEYS).map(([key, item]) => ({ value: key, label: <span>{item.icon}{item.shortLabel}</span> }))}
        />
      </div>

      <section className="manual-journey-header">
        <div>
          <span className="manual-journey-index">用户旅程 {journeyKey === 'recovery' ? '01' : '02'}</span>
          <h2>{journey.label}</h2>
          <p>{journey.summary}</p>
        </div>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => navigate(journey.startPath)}>{journey.startLabel}</Button>
      </section>

      <nav className="manual-flow" aria-label={`${journey.label}流程`}>
        {journey.route.map((label, index) => (
          <a href={`#${journey.steps[index].id}`} key={label}>
            <b>{FLOW_ICONS[index]}</b>
            <span><small>0{index + 1}</small><strong>{label}</strong></span>
          </a>
        ))}
      </nav>

      <div className="manual-layout">
        <aside className="manual-toc">
          <strong>本旅程步骤</strong>
          {journey.steps.map((step, index) => <a key={step.id} href={`#${step.id}`}><span>0{index + 1}</span>{step.title}</a>)}
          <div className="manual-role-note"><CheckCircleOutlined /><span><strong>建议角色</strong>采集运营、规则维护</span></div>
        </aside>

        <article className="manual-article">
          {journey.steps.map((step, index) => (
            <section className="manual-step" id={step.id} key={step.id}>
              <header>
                <span>0{index + 1}</span>
                <div><small>STEP {index + 1}</small><h3>{step.title}</h3></div>
              </header>
              <p className="manual-step-description">{step.description}</p>
              <ol>
                {step.actions.map((action) => <li key={action}>{action}</li>)}
              </ol>
              <div className="manual-checkpoint"><CheckCircleOutlined /><span>{step.checkpoint}</span></div>
              {step.image && (
                <figure>
                  <Image src={step.image} alt={step.imageAlt} preview={{ mask: '查看大图' }} />
                  <figcaption>{step.caption}</figcaption>
                </figure>
              )}
            </section>
          ))}

          <footer className="manual-complete">
            <CheckCircleOutlined />
            <div><strong>旅程完成</strong><span>{journeyKey === 'recovery' ? '故障、规则版本、重跑批次和入库结果已形成完整追溯链路。' : '网站资产、发布规则、采集计划、执行批次和原文数据已全部建立关联。'}</span></div>
          </footer>
        </article>
      </div>
    </div>
  )
}
