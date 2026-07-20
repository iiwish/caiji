import { useMemo, useState } from 'react'
import { Alert, App as AntApp, Button, Descriptions, Modal, Segmented, Space, Table } from 'antd'
import { ExportOutlined, LeftOutlined, MergeCellsOutlined, ToolOutlined } from '@ant-design/icons'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { PageTitle, SectionCard, SourceCell, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

function ArticlesList() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params] = useSearchParams()
  const executionFilter = params.get('execution')
  const { articles } = usePrototype()
  const [scope, setScope] = useState('全部')
  const visible = useMemo(() => articles.filter((article) => (
    (!executionFilter || article.executionId === executionFilter) &&
    (scope === '全部' || article.quality !== '通过') &&
    `${article.id}${article.title}${article.site}${article.url}`.includes(search)
  )), [articles, executionFilter, scope, search])
  const columns = [
    { title: '原文', render: (_, row) => <SourceCell name={row.title} host={row.id} /> },
    { title: '来源网站', dataIndex: 'site', width: 220 },
    { title: '发布时间', dataIndex: 'publishTime', width: 118, render: (value) => <span className="mono">{value}</span> },
    { title: '采集时间', dataIndex: 'collectedAt', width: 112, render: (value) => <span className="mono muted">{value}</span> },
    { title: '质量', dataIndex: 'quality', width: 126, render: (value) => <StatusTag value={value} /> },
    { title: '操作', width: 120, fixed: 'right', align: 'right', render: (_, row) => <Button type="link" onClick={() => navigate(`/articles/${row.id}`)}>详情</Button> },
  ]
  return (
    <div className="page-content">
      {executionFilter && <Alert className="context-filter-alert" type="info" showIcon closable onClose={() => navigate('/articles')} title={<>当前仅显示执行 <b className="mono">{executionFilter}</b> 的入库原文</>} />}
      <div className="list-toolbar"><Segmented value={scope} onChange={setScope} options={['全部', '需处理']} /><div className="toolbar-spacer" /><Button icon={<ExportOutlined />} onClick={() => message.success(`已生成 ${visible.length} 条原文的导出任务`)}>导出</Button></div>
      <SectionCard title={<PageTitle count={visible.length}>原文记录</PageTitle>} bodyStyle={{ padding: 0 }}>
        <Table rowKey="id" columns={columns} dataSource={visible} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 980 }} />
      </SectionCard>
    </div>
  )
}

function ArticleDetail({ article }) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { resolveArticleQuality, rules } = usePrototype()
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const sourceRule = rules.find((rule) => rule.id === article.ruleId)
  const siteRulePath = sourceRule ? `/sites?site=${encodeURIComponent(sourceRule.siteHost)}&tab=rule` : '/sites'
  const resolveNoise = () => {
    resolveArticleQuality(article.id, '通过')
    message.success('质量状态已更新；规则修复仍需在回归发布后生效')
  }
  return (
    <div className="page-content detail-page article-detail-page">
      <div className="back-row"><Button icon={<LeftOutlined />} onClick={() => navigate('/articles')}>返回原文库</Button><span>原文详情</span></div>
      <div className="article-detail-grid">
        <article className="article-document">
          <div className="article-heading"><span className="mono muted">{article.id}</span><h1>{article.title}</h1><div><span>{article.site}</span><span>{article.publishTime}</span></div></div>
          <div className="article-body"><p>{article.content}</p><p>本原文由采集平台按照冻结规则版本获取并经过确定性质量门禁，可通过右侧来源信息追溯到对应执行和规则。</p></div>
        </article>
        <aside className="article-aside">
          <SectionCard title={<PageTitle>原文信息</PageTitle>}>
            <Descriptions column={1} items={[
              { key: 'site', label: '来源网站', children: article.site },
              { key: 'publish', label: '发布时间', children: article.publishTime },
              { key: 'collected', label: '采集时间', children: article.collectedAt },
              { key: 'quality', label: '质量状态', children: <StatusTag value={article.quality} /> },
              { key: 'url', label: '原网页', children: <a href={article.url} target="_blank" rel="noreferrer">打开原网页 <ExportOutlined /></a> },
            ]} />
          </SectionCard>
          <SectionCard title={<PageTitle>来源与追溯</PageTitle>}>
            <div className="trace-links"><Button type="link" onClick={() => navigate(`/executions/${article.executionId}`)}>来源执行 <span className="mono">{article.executionId}</span></Button><Button type="link" onClick={() => navigate(siteRulePath)}>网站规则 <span className="mono">{article.ruleId}</span></Button></div>
          </SectionCard>
          {article.quality !== '通过' && <SectionCard title={<PageTitle>质量处理</PageTitle>}>
            <Alert type="warning" showIcon title={article.quality} description={article.quality === '内容噪声' ? '建议定位到产生该原文的规则，调整正文清洗规则并回归发布。' : '请对比候选内容，确认是否属于同一标讯。'} />
            <div className="stack-actions">{article.quality === '内容噪声' ? <><Button block icon={<ToolOutlined />} onClick={() => navigate(siteRulePath)}>修复网站规则</Button><Button block onClick={resolveNoise}>标记本条已确认</Button></> : <Button block type="primary" icon={<MergeCellsOutlined />} onClick={() => setDuplicateOpen(true)}>处理重复候选</Button>}</div>
          </SectionCard>}
        </aside>
      </div>

      <Modal title="重复候选确认" open={duplicateOpen} onCancel={() => setDuplicateOpen(false)} footer={<Space><Button onClick={() => { resolveArticleQuality(article.id, '通过'); setDuplicateOpen(false); message.success('已确认不是重复') }}>不是重复</Button><Button type="primary" onClick={() => { resolveArticleQuality(article.id, '已合并'); setDuplicateOpen(false); message.success('已合并到推荐主记录，来源追溯保持不变') }}>合并到主记录</Button></Space>}>
        <Alert type="info" showIcon title="标题相似度 96%，发布时间相同，正文哈希相似度 91%" />
        <div className="duplicate-compare"><div><span>当前记录</span><strong>{article.id}</strong><p>{article.title}</p></div><div><span>推荐主记录</span><strong>AR-12472</strong><p>{article.title.replace('项目招标', '项目公开招标')}</p></div></div>
      </Modal>
    </div>
  )
}

export function ArticlesPage() {
  const { articleId } = useParams()
  const { articles } = usePrototype()
  if (!articleId) return <ArticlesList />
  const article = articles.find((item) => item.id === articleId)
  if (!article) return <div className="page-content"><Alert type="error" showIcon title="原文记录不存在" /></div>
  return <ArticleDetail article={article} />
}
