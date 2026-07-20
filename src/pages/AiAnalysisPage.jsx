import { useEffect, useMemo, useState } from 'react'
import { App as AntApp, Button, Form, Input, Modal, Progress, Table } from 'antd'
import {
  CaretRightOutlined,
  CheckOutlined,
  CloseOutlined,
  CodeOutlined,
  CopyOutlined,
  EditOutlined,
  ExpandAltOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

const hubeiSamples = [
  '关于市中心医院医疗设备采购项目的公开招标公告',
  '武汉市政务云平台三期扩容建设项目竞争性磋商公告',
  '2026年度城市道路养护工程施工招标公告',
  '省属高校实验设备定点采购项目询价公告',
  '智慧交通信号控制系统升级改造项目招标',
]

const analysisProfiles = {
  'ggzy.hubei.gov.cn': {
    source: 'hubei_ggzy',
    confidence: 96,
    fields: [
      { name: 'title', label: '标题', selector: 'a::attr(title)', sample: hubeiSamples[0] },
      { name: 'url', label: '详情链接', selector: 'a::attr(href)', sample: '/notice/detail/8842.html' },
      { name: 'pub_date', label: '发布时间', selector: 'span.date::text', sample: '2026-07-16' },
      { name: 'raw', label: '原始数据', selector: 'detail_page::html', sample: '<html>…详情页原始 HTML…</html>', raw: true },
    ],
    samples: hubeiSamples,
    container: 'ul.article-list > li',
    nextPage: 'a.next::attr(href)',
  },
  'ccgp-jiangsu.gov.cn': {
    source: 'jiangsu_ccgp',
    confidence: 71,
    fields: [
      { name: 'title', label: '标题', selector: 'h3 a::text', sample: '南京市XX区政务云平台建设项目' },
      { name: 'url', label: '详情链接', selector: 'h3 a::attr(href)', sample: '/detail?id=99213' },
      { name: 'pub_date', label: '发布时间', selector: './/em/text()', sample: '2026/07/15' },
      { name: 'raw', label: '原始数据', selector: '— 未定位', sample: '（详情页原始数据待确认）', raw: true },
    ],
    samples: ['南京市XX区政务云平台建设项目', '苏州市轨道交通信号系统采购公告', '无锡市第一人民医院DR设备采购项目', '常州市老旧小区改造工程监理服务采购', '徐州市生活垃圾分类设施采购及安装项目'],
    container: 'div.m_list div.item',
    nextPage: null,
    warnings: ['列表容器 div.m_list 置信度偏低，请人工确认', '字段 buyer 未能稳定定位，值为 null'],
  },
  'cdzbtb.com': {
    source: 'sichuan_zbtb',
    confidence: 89,
    fields: [
      { name: 'title', label: '标题', selector: 'td.title a::attr(title)', sample: '成都地铁XX号线土建工程施工招标' },
      { name: 'url', label: '详情链接', selector: 'td.title a::attr(href)', sample: '/jyxx/2026/0714/551.htm' },
      { name: 'pub_date', label: '发布时间', selector: 'td.date::text', sample: '2026-07-14' },
      { name: 'raw', label: '原始数据', selector: 'detail_page::json', sample: '{ "content": "…详情页原始 JSON…" }', raw: true },
    ],
    samples: ['成都地铁XX号线土建工程施工招标', '四川省人民医院医用耗材集中采购公告', '绵阳市城区路灯节能改造工程招标', '宜宾市档案数字化加工服务采购项目', '乐山市水质在线监测系统建设项目公告'],
    container: 'table.list tr[height]',
    nextPage: 'a.next::attr(href)',
  },
  'www.ccgp.gov.cn': {
    source: 'ccgp_central',
    confidence: 98,
    fields: [
      { name: 'title', label: '标题', selector: 'h2 a::text', sample: '中央国家机关办公设备采购公告' },
      { name: 'url', label: '详情链接', selector: 'h2 a::attr(href)', sample: '/cggg/zygg/202607/t20260716_3204.htm' },
      { name: 'pub_date', label: '发布时间', selector: 'span.time::text', sample: '2026-07-16' },
      { name: 'raw', label: '原始数据', selector: 'article::html', sample: '<article>…公告正文…</article>', raw: true },
    ],
    samples: ['中央国家机关办公设备采购公告', '公共服务平台扩容建设项目公告', '医疗设备采购公开招标公告', '信息化运维服务竞争性磋商公告', '科研仪器设备采购项目公告'],
    container: 'ul.c_list_bid > li',
    nextPage: 'a.next::attr(href)',
  },
}

function getHost(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function getEntryPath(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}` || '/'
  } catch {
    return url
  }
}

function displayStatus(status) {
  if (['待确认归属', '验证失败'].includes(status)) return '需订正'
  return status
}

function buildProfile(entry) {
  const host = getHost(entry.url)
  const known = analysisProfiles[host]
  const fallbackSamples = ['采购项目公开招标公告', '信息化服务竞争性磋商公告', '城市建设项目资格预审公告', '办公设备采购询价公告', '公共服务平台运维项目公告']
  const profile = known || {
    source: host.replace(/\W+/g, '_'),
    confidence: entry.confidence || 84,
    fields: [
      { name: 'title', label: '标题', selector: 'article a::text', sample: fallbackSamples[0] },
      { name: 'url', label: '详情链接', selector: 'article a::attr(href)', sample: '/notice/detail/1001.html' },
      { name: 'pub_date', label: '发布时间', selector: 'time::text', sample: '2026-07-16' },
      { name: 'raw', label: '原始数据', selector: 'detail_page::html', sample: '<html>…详情页原始 HTML…</html>', raw: true },
    ],
    samples: fallbackSamples,
    container: 'article.notice-item',
    nextPage: 'a.next::attr(href)',
  }

  const fieldSelectors = Object.fromEntries(profile.fields.filter((field) => !field.raw).map((field) => [field.name, field.selector]))
  const config = {
    source: profile.source,
    name: entry.site,
    entry: entry.url,
    list: { container: profile.container, next_page: profile.nextPage },
    fields: fieldSelectors,
    request: { method: 'GET', interval_ms: 1500, timeout_ms: 30000 },
    dedup: ['url', 'title'],
    ...(profile.warnings ? { _warnings: profile.warnings } : {}),
  }
  const rawField = profile.fields.find((field) => field.raw)
  const rawContent = rawField?.selector.includes('json')
    ? JSON.stringify({ url: `https://${host}${profile.fields.find((field) => field.name === 'url')?.sample}`, title: profile.samples[0], pub_date: '2026-07-16', content_html: '<div class="detail">…完整公告正文…</div>', attachments: [{ name: '招标文件.pdf', url: '/files/zbwj.pdf' }] }, null, 2)
    : `<!DOCTYPE html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><title>${profile.samples[0]}</title></head>\n<body>\n  <article class="notice-detail">\n    <h1>${profile.samples[0]}</h1>\n    <time>2026-07-16</time>\n    <div class="content">受采购人委托，现对本项目进行公开招标，欢迎符合条件的供应商参与。</div>\n  </article>\n</body>\n</html>`

  return { ...profile, confidence: entry.confidence || profile.confidence, config, rawContent }
}

export function AiAnalysisPage() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const { intakeBatches, updateBatchUrl, addBatch } = usePrototype()
  const entryFilter = params.get('entry')
  const siteFilter = params.get('site')
  const [selectedUrlId, setSelectedUrlId] = useState(entryFilter || intakeBatches[0]?.urls[0]?.id || '')
  const [createOpen, setCreateOpen] = useState(false)
  const [rawPreview, setRawPreview] = useState(null)
  const [editingConfig, setEditingConfig] = useState(false)
  const [workingDraft, setWorkingDraft] = useState('')
  const [configDrafts, setConfigDrafts] = useState({})
  const [repairPrompt, setRepairPrompt] = useState('')
  const [workingUrlId, setWorkingUrlId] = useState('')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [createForm] = Form.useForm()

  const allEntries = useMemo(() => intakeBatches.flatMap((batch) => batch.urls.map((url, urlIndex) => ({
    ...url,
    batchId: batch.id,
    batchName: batch.name,
    createdAt: batch.createdAt,
    readyAt: batch.readyAt,
    updatedAt: batch.updatedAt,
    urlIndex,
  }))).sort((left, right) => {
    const timestamp = (entry) => {
      const explicitTime = Number(entry.createdAt) || Date.parse(entry.createdAt)
      if (Number.isFinite(explicitTime)) return explicitTime
      const queuedTime = Number(entry.readyAt) - 1400
      if (Number.isFinite(queuedTime)) return queuedTime
      const entryTime = Number(entry.id.match(/^URL-(\d{13})/)?.[1])
      if (Number.isFinite(entryTime) && entryTime > 0) return entryTime
      const updatedTime = Date.parse(`${new Date().getFullYear()}-${entry.updatedAt}`)
      if (Number.isFinite(updatedTime)) return updatedTime
      return Number(entry.batchId.replace('IB-', ''))
    }
    return timestamp(right) - timestamp(left) || left.urlIndex - right.urlIndex
  }), [intakeBatches])
  const visibleEntries = useMemo(() => allEntries.filter((entry) => (
    (!pendingOnly || entry.status !== '已通过')
    && `${entry.site}${entry.url}${entry.batchName}${entry.status}`.toLowerCase().includes(search.toLowerCase())
  )), [allEntries, pendingOnly, search])
  const selected = allEntries.find((entry) => entry.id === selectedUrlId) || allEntries[0]

  useEffect(() => {
    const contextualEntry = allEntries.find((entry) => entry.id === entryFilter)
      || allEntries.find((entry) => getHost(entry.url) === siteFilter)
    if (contextualEntry && contextualEntry.id !== selectedUrlId) setSelectedUrlId(contextualEntry.id)
  }, [allEntries, entryFilter, selectedUrlId, siteFilter])

  if (!selected) return null

  const profile = buildProfile(selected)
  const baseConfigText = JSON.stringify(profile.config, null, 2)
  const configText = configDrafts[selected.id] || baseConfigText
  const confidence = selected.status === '分析中' ? 0 : profile.confidence
  const pendingCount = allEntries.filter((entry) => entry.status !== '已通过').length
  const isAnalyzing = selected.status === '分析中' || workingUrlId === selected.id
  const isRestarting = workingUrlId === selected.id
  const isSiteRevision = Boolean(selected.analysisKind)

  const selectEntry = (entry) => {
    setSelectedUrlId(entry.id)
    const nextParams = new URLSearchParams(params)
    nextParams.set('entry', entry.id)
    nextParams.set('site', getHost(entry.url))
    setParams(nextParams, { replace: true })
    setEditingConfig(false)
    setRepairPrompt('')
  }

  const togglePendingFilter = () => {
    const nextPendingOnly = !pendingOnly
    setPendingOnly(nextPendingOnly)
    if (nextPendingOnly && selected.status === '已通过') {
      const firstPending = allEntries.find((entry) => entry.status !== '已通过')
      if (firstPending) selectEntry(firstPending)
    }
  }

  const updateSelected = (patch) => updateBatchUrl(selected.batchId, selected.id, patch)

  const runAnalysis = (prompt = '') => {
    const nextStatus = selected.status === '已通过' ? '已通过' : '待审核'
    setWorkingUrlId(selected.id)
    updateSelected({ status: '分析中', issue: '' })
    window.setTimeout(() => {
      updateBatchUrl(selected.batchId, selected.id, { status: nextStatus, judgment: '已归属', confidence: profile.confidence, samples: 5, issue: '' })
      setWorkingUrlId('')
      message.success(prompt ? '二次分析完成，已生成新的候选配置' : '重新分析完成')
    }, 900)
  }

  const approveSelected = () => {
    updateSelected({ status: '已通过', judgment: '已归属', samples: 5, issue: '' })
    message.success(isSiteRevision ? '已生成网站候选规则，生产版本保持不变' : '已审核通过，网站及采集规则已进入网站管理')
  }

  const submitCorrection = () => {
    if (!repairPrompt.trim()) {
      message.warning('请先填写修正提示词')
      return
    }
    const prompt = repairPrompt
    setRepairPrompt('')
    runAnalysis(prompt)
  }

  const submitBatch = async () => {
    const values = await createForm.validateFields()
    const urls = values.urls.split(/\n+/).map((item) => item.trim()).filter(Boolean)
    try {
      urls.forEach((url) => new URL(url))
    } catch {
      message.error('请输入完整有效的 URL，每行一个')
      return
    }
    addBatch(values.name, urls)
    setSelectedUrlId('')
    setCreateOpen(false)
    createForm.resetFields()
    message.success('AI 分析批次已创建')
  }

  const copyConfig = async () => {
    await navigator.clipboard.writeText(configText)
    message.success('采集配置已复制')
  }

  const fieldColumns = [
    { title: '字段', dataIndex: 'label', width: 150, render: (value, row) => <div className="ai-field-name"><strong>{value}</strong><span className="mono">{row.name}</span></div> },
    { title: 'CSS / XPath 选择器', dataIndex: 'selector', width: 220, render: (value) => <code className={`selector-code ${value.includes('未定位') ? 'invalid' : ''}`}>{value}</code> },
    {
      title: '示例值', dataIndex: 'sample', render: (value, row) => row.raw
        ? <button className="raw-preview" onClick={() => setRawPreview({ title: `${selected.site} · 原始数据`, content: profile.rawContent })}><span className="mono">{value}</span><b>展开正文 <ExpandAltOutlined /></b></button>
        : <span className="ai-field-sample">{value}</span>,
    },
  ]

  const sampleRows = profile.samples.map((title, index) => ({
    id: index + 1,
    title,
    date: `2026-07-${String(16 - index).padStart(2, '0')}`,
    url: `/notice/detail/${8842 - index * 7}.html`,
    rawTag: profile.fields.find((field) => field.raw)?.selector.includes('json') ? 'raw_json' : 'raw_html',
  }))
  const sampleColumns = [
    { title: '#', dataIndex: 'id', width: 46, render: (value) => <span className="mono ai-row-number">{value}</span> },
    { title: '标题', dataIndex: 'title', render: (value) => <strong className="ai-sample-title">{value}</strong> },
    { title: '发布时间', dataIndex: 'date', width: 112, responsive: ['md'], render: (value) => <span className="mono ai-table-muted">{value}</span> },
    { title: '详情链接', dataIndex: 'url', width: 190, responsive: ['lg'], render: (value) => <span className="mono ai-detail-link">{value}</span> },
    { title: '原始数据', dataIndex: 'rawTag', width: 112, render: (value) => <Button className="ai-raw-button" size="small" icon={<ExpandAltOutlined />} onClick={() => setRawPreview({ title: `${selected.site} · ${value}`, content: profile.rawContent })}>{value}</Button> },
  ]

  return (
    <div className="page-content ai-analysis-layout">
      <section className="analysis-surface ai-analysis-queue">
        <header className="ai-queue-header">
          <div>
            <div className="ai-queue-title">
              <h2>分析队列</h2>
              <button className={`ai-queue-filter ${pendingOnly ? 'active' : ''}`} type="button" aria-pressed={pendingOnly} onClick={togglePendingFilter}>{pendingCount} 个待处理</button>
            </div>
            <p>AI 已完成解析，待人工审核</p>
          </div>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建</Button>
        </header>
        <div className="ai-analysis-queue-list">
          {visibleEntries.map((entry) => (
            <button className={`ai-analysis-item ${entry.id === selected.id ? 'active' : ''}`} key={entry.id} onClick={() => selectEntry(entry)} aria-pressed={entry.id === selected.id}>
              <span className="ai-analysis-item-top"><strong>{entry.site}</strong><StatusTag value={displayStatus(entry.status)} /></span>
              <span className="ai-analysis-item-entry"><span className="mono">{entry.id}</span><span className="mono" title={entry.url}>{getEntryPath(entry.url)}</span></span>
              <span className="ai-analysis-item-meta"><span className="mono">{getHost(entry.url)}</span><span className="mono">置信度 {entry.status === '分析中' ? '解析中' : `${entry.confidence || buildProfile(entry).confidence}%`}</span></span>
            </button>
          ))}
          {!visibleEntries.length && <div className="ai-queue-empty">{pendingOnly ? '没有待处理的数据源' : '没有匹配的数据源'}</div>}
        </div>
      </section>

      <main className="ai-analysis-main">
        <section className="analysis-surface ai-detail-header">
          <span className="ai-detail-icon"><RobotOutlined /></span>
          <div className="ai-detail-identity">
            <div><h1>{selected.site}</h1><StatusTag value={displayStatus(selected.status)} /></div>
            <span className="mono">{selected.url}</span>
          </div>
          <div className="ai-detail-actions">
            <Button icon={<ReloadOutlined />} disabled={isRestarting} onClick={() => runAnalysis()}>{selected.status === '分析中' ? '重新开始分析' : '重新分析'}</Button>
            <Button type="primary" icon={<CheckOutlined />} disabled={isAnalyzing || selected.status === '已通过'} onClick={approveSelected}>{selected.status === '已通过' ? '已审核' : '审核通过'}</Button>
          </div>
        </section>

        {isAnalyzing ? (
          <section className="analysis-surface ai-pipeline-card">
            <header className="ai-section-header">
              <div><RobotOutlined /><h2>AI 分析流水线</h2><StatusTag value="分析中" /></div>
              <span className="mono">3 / 5 样本页面已加载</span>
            </header>
            <Progress percent={62} showInfo={false} />
            <div className="ai-pipeline-steps">
              {['加载入口页面', '识别列表容器', '推断字段选择器', '试采集与校验', '生成采集配置'].map((step, index) => <div className={index < 2 ? 'done' : index === 2 ? 'active' : ''} key={step}><span>{index < 2 ? <CheckOutlined /> : index + 1}</span><strong>{step}</strong></div>)}
            </div>
          </section>
        ) : (
          <>
            <section className="analysis-surface ai-fields-card">
              <header className="ai-section-header">
                <div><h2>识别字段</h2><span className="ai-section-count mono">{profile.fields.length}</span></div>
                <div className="ai-confidence"><span>整体置信度</span><Progress percent={confidence} strokeColor="#16a35a" showInfo={false} size="small" /><strong className="mono">{confidence}%</strong></div>
              </header>
              <Table className="ai-detail-table" rowKey="name" size="middle" columns={fieldColumns} dataSource={profile.fields} pagination={false} scroll={{ x: 650 }} />
            </section>

            <section className="analysis-surface ai-samples-card">
              <header className="ai-section-header">
                <div><h2>采集样例</h2><span className="ai-section-count mono">{sampleRows.length}</span></div>
                <p>试采集列表页前 5 条，校验字段是否正确</p>
              </header>
              <Table className="ai-detail-table" rowKey="id" size="middle" columns={sampleColumns} dataSource={sampleRows} pagination={false} />
            </section>

            <section className="analysis-surface ai-config-card">
              <header className="ai-section-header ai-config-header">
                <div><CodeOutlined /><h2>生成的采集配置</h2><span className="ai-config-kind">下载器配置 · JSON</span></div>
                <div className="ai-config-actions">
                  {editingConfig ? (
                    <>
                      <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingConfig(false)}>取消</Button>
                      <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => { setConfigDrafts((items) => ({ ...items, [selected.id]: workingDraft })); setEditingConfig(false); message.success('人工订正已保存') }}>保存订正</Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" icon={<CopyOutlined />} onClick={copyConfig}>复制</Button>
                      <Button size="small" icon={<EditOutlined />} onClick={() => { setWorkingDraft(configText); setEditingConfig(true) }}>人工订正</Button>
                    </>
                  )}
                </div>
              </header>
              {editingConfig ? (
                <Input.TextArea className="ai-config-editor" spellCheck={false} value={workingDraft} onChange={(event) => setWorkingDraft(event.target.value)} />
              ) : (
                <div className="ai-code-viewer">
                  {configText.split('\n').map((line, index) => <div className="mono" key={`${index}-${line}`}><span>{index + 1}</span><code>{line || ' '}</code></div>)}
                </div>
              )}
            </section>

            <section className="analysis-surface ai-correction-card">
              <div className="ai-correction-title"><RobotOutlined /><h2>二次分析 · 修正提示词</h2></div>
              <Input.TextArea rows={3} value={repairPrompt} onChange={(event) => setRepairPrompt(event.target.value)} placeholder="例如：列表容器应为 div.m_list，请重新定位「采购单位」字段…" />
              <div className="ai-correction-footer"><span>AI 将结合你的提示重新解析页面结构并生成新代码</span><Button className="ai-submit-analysis" type="primary" icon={<CaretRightOutlined />} onClick={submitCorrection}>提交二次分析</Button></div>
            </section>
          </>
        )}
      </main>

      <Modal title="新建 AI 分析" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submitBatch} okText="创建并开始分析" width={640}>
        <Form form={createForm} layout="vertical" initialValues={{ name: '新 URL 接入分析' }}>
          <Form.Item name="name" label="批次名称" rules={[{ required: true, message: '请输入批次名称' }]}><Input /></Form.Item>
          <Form.Item name="urls" label="URL，每行一个" rules={[{ required: true, message: '请至少输入一个 URL' }]}>
            <Input.TextArea rows={7} placeholder={'https://example.com/notice/list\nhttps://example.com/notice/result'} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={rawPreview?.title} open={Boolean(rawPreview)} onCancel={() => setRawPreview(null)} footer={<Button onClick={() => setRawPreview(null)}>关闭</Button>} width={860}>
        <p className="raw-modal-sub">完整原始数据仅用于人工核对字段与选择器。</p>
        <pre className="raw-modal-code">{rawPreview?.content}</pre>
      </Modal>
    </div>
  )
}
