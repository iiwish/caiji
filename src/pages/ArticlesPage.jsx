import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App as AntApp, Button, Descriptions, Modal, Segmented, Space, Spin, Table } from 'antd'
import { CodeOutlined, CopyOutlined, ExportOutlined, LeftOutlined, MergeCellsOutlined, ToolOutlined } from '@ant-design/icons'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { EntityLink, PageTitle, RowActions, SectionCard, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'
import { getBackendArticle, getBackendArticles } from '../app/localBackend'
import { getSiteRulePath } from '../app/routes'

function formatBackendTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function toBackendArticle(article, sites) {
  const sourceSite = sites.find((site) => site.backendSiteId === article.site_id)
  let fallbackSite = article.site_name || ''
  if (!fallbackSite) {
    try {
      fallbackSite = new URL(article.url).hostname
    } catch {
      fallbackSite = article.site_id
    }
  }
  const quality = {
    passed: '通过',
    needs_review: '需处理',
    legacy_unverified: '需处理',
  }[article.quality_status] || '需处理'
  return {
    id: article.id,
    title: article.title,
    site: sourceSite?.name || fallbackSite,
    siteId: sourceSite?.id || '',
    backendSiteId: article.site_id,
    url: article.url,
    publishTime: article.published_at || '—',
    collectedAt: formatBackendTime(article.created_at),
    content: article.content_text,
    rawContent: article.raw_html || '',
    sourceHtml: article.source_html || '',
    rawType: 'html',
    executionId: article.execution_id,
    ruleId: article.rule_id || '',
    versionId: article.version_id || '',
    observationId: article.observation_id || '',
    observationOutcome: article.observation_outcome || '',
    issuer: article.issuer || '—',
    noticeType: article.notice_type || '—',
    quality,
    qualityChecks: article.quality_checks || {},
    qualityIssues: article.quality_issues || [],
    sourceResponse: {
      requestedUrl: article.source_url || article.url,
      finalUrl: article.final_url || article.url,
      statusCode: article.source_status_code || 0,
      contentType: article.source_content_type || '',
      encoding: article.source_encoding || 'utf-8',
      sha256: article.source_sha256 || '',
      fetchedAt: formatBackendTime(article.fetched_at),
    },
    attachments: article.attachments || [],
    backendMode: true,
    dedup: {
      normalizedUrl: article.url,
      fingerprint: article.fingerprint,
      status: '独立记录',
      sourceCount: 1,
    },
  }
}

function getArticleSource(article, rule) {
  const trimmed = String(
    article.backendMode
      ? article.sourceHtml || article.rawContent || ''
      : article.rawContent || '',
  ).trim()
  const inferredType = article.rawType
    || (article.id === 'AR-12480' ? 'json' : '')
    || (/^[\[{]/.test(trimmed) || rule?.yaml?.includes('strategy: api') ? 'json' : 'html')
  if (trimmed) {
    if (inferredType === 'json') {
      try {
        return { type: 'json', content: JSON.stringify(JSON.parse(trimmed), null, 2) }
      } catch {
        return { type: 'json', content: trimmed }
      }
    }
    return { type: 'html', content: trimmed }
  }
  if (inferredType === 'json') {
    return {
      type: 'json',
      content: JSON.stringify({
        id: article.id,
        title: article.title,
        url: article.url,
        publish_time: article.publishTime,
        source: article.site,
        content: article.content,
        collected_at: article.collectedAt,
      }, null, 2),
    }
  }
  return {
    type: 'html',
    content: `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <title>${article.title}</title>\n</head>\n<body>\n  <article class="notice-detail" data-source="${article.site}">\n    <h1>${article.title}</h1>\n    <time datetime="${article.publishTime}">${article.publishTime}</time>\n    <div class="notice-content">\n      <p>${article.content}</p>\n    </div>\n  </article>\n</body>\n</html>`,
  }
}

function ArticlesList({ articles, backendError = '' }) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const { search } = useOutletContext()
  const [params] = useSearchParams()
  const executionFilter = params.get('execution')
  const [scope, setScope] = useState('全部')
  const visible = useMemo(() => articles.filter((article) => {
    const needsHandling = ['需处理', '内容噪声', '重复待确认'].includes(article.quality)
    const matchesScope = scope === '全部'
      || (scope === '需处理' && needsHandling)
      || (scope === '多来源' && (article.dedup?.sourceCount || 1) > 1)
    return (!executionFilter || article.executionId === executionFilter)
      && matchesScope
      && `${article.id}${article.title}${article.site}${article.url}${article.dedup?.canonicalId || ''}`.includes(search)
  }), [articles, executionFilter, scope, search])
  const columns = [
    { title: 'ID', dataIndex: 'id', width: 110, render: (value) => <span className="mono">{value}</span> },
    { title: '原文', dataIndex: 'title', width: 340, render: (value, row) => <EntityLink title={value} onClick={() => navigate(`/articles/${row.id}`)} ariaLabel={`查看原文 ${value}`} /> },
    { title: '来源网站', dataIndex: 'site', width: 220 },
    {
      title: '归并状态',
      width: 130,
      render: (_, article) => <span className="article-merge-status">{(article.dedup?.sourceCount || 1) > 1 ? `${article.dedup.sourceCount} 个来源` : '单一来源'}</span>,
    },
    { title: '发布时间', dataIndex: 'publishTime', width: 118, render: (value) => <span className="mono">{value}</span> },
    { title: '质量', dataIndex: 'quality', width: 126, render: (value) => <StatusTag value={value} /> },
    { title: '操作', width: 112, fixed: 'right', align: 'right', render: (_, row) => !['需处理', '内容噪声', '重复待确认'].includes(row.quality)
      ? <span className="table-action-empty">—</span>
      : <RowActions primary={{ label: row.backendMode ? '查看质量' : '处理质量', onClick: () => navigate(`/articles/${row.id}?focus=quality`) }} /> },
  ]
  return (
    <div className="page-content">
      {backendError && <Alert className="context-filter-alert" type="warning" showIcon title="真实原文暂时不可用" description={backendError} />}
      {executionFilter && <Alert className="context-filter-alert" type="info" showIcon closable onClose={() => navigate('/articles')} title={<>当前仅显示执行 <b className="mono">{executionFilter}</b> 的入库原文</>} />}
      <div className="list-toolbar"><Segmented value={scope} onChange={setScope} options={['全部', '需处理', '多来源']} /><div className="toolbar-spacer" /><Button icon={<ExportOutlined />} onClick={() => message.success(`已生成 ${visible.length} 条原文的导出任务`)}>导出</Button></div>
      <SectionCard bodyStyle={{ padding: 0 }}>
        <Table rowKey="id" columns={columns} dataSource={visible} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 1156 }} />
      </SectionCard>
    </div>
  )
}

function ArticleDetail({ article }) {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { resolveArticleQuality, rules, sites } = usePrototype()
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const qualitySectionRef = useRef(null)
  const qualityFocused = params.get('focus') === 'quality' && ['需处理', '内容噪声', '重复待确认'].includes(article.quality)
  const sourceRule = rules.find((rule) => rule.id === article.ruleId)
  const sourceSite = article.backendMode
    ? sites.find((site) => site.backendSiteId === article.backendSiteId)
    : sites.find((site) => site.id === sourceRule?.siteId)
  const dedup = article.dedup || {}
  const duplicateCandidate = dedup.candidate
  const rawSource = getArticleSource(article, sourceRule)
  const sourceLines = rawSource.content.split('\n')
  const sourceBytes = new Blob([rawSource.content]).size
  const siteRulePath = sourceSite ? getSiteRulePath(sourceSite) : '/sites'
  const resolveNoise = () => {
    resolveArticleQuality(article.id, '通过')
    message.success('质量状态已更新；规则修复仍需在回归发布后生效')
  }
  const copySource = async () => {
    await navigator.clipboard.writeText(rawSource.content)
    message.success('原始内容已复制')
  }
  useEffect(() => {
    if (!qualityFocused || !qualitySectionRef.current) return undefined
    const frame = window.requestAnimationFrame(() => qualitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return () => window.cancelAnimationFrame(frame)
  }, [article.id, qualityFocused])
  return (
    <div className="page-content detail-page article-detail-page">
      <div className="back-row"><Button icon={<LeftOutlined />} onClick={() => navigate('/articles')}>返回原文库</Button><span>原文详情</span></div>
      <div className="article-detail-grid">
        <article className="article-document">
          <div className="article-heading"><span className="mono muted">{article.id}</span><h1>{article.title}</h1><div><span>{article.site}</span><span>{article.publishTime}</span></div></div>
          <section className="article-source-viewer">
            <header className="article-source-toolbar">
              <div><CodeOutlined /><strong>{article.backendMode ? '完整响应快照' : '原始内容'}</strong><span className={`article-source-kind ${rawSource.type}`}>{rawSource.type.toUpperCase()}</span></div>
              <Button size="small" icon={<CopyOutlined />} onClick={copySource}>复制</Button>
            </header>
            <div className="article-source-meta"><span>{sourceLines.length} 行</span><span>{sourceBytes.toLocaleString()} Bytes</span><span className="mono">{article.sourceResponse?.encoding?.toUpperCase() || 'UTF-8'}</span>{article.backendMode && <span className="mono">HTTP {article.sourceResponse.statusCode || '—'}</span>}</div>
            <div className="article-source-code" role="region" aria-label={`${rawSource.type.toUpperCase()} 原始内容`}>
              {sourceLines.map((line, index) => <div className="article-source-line" key={`${index}-${line}`}><span>{index + 1}</span><code>{line || ' '}</code></div>)}
            </div>
          </section>
        </article>
        <aside className="article-aside">
          <SectionCard title={<PageTitle>原文信息</PageTitle>}>
            <Descriptions column={1} items={[
              { key: 'site', label: '来源网站', children: article.site },
              { key: 'publish', label: '发布时间', children: article.publishTime },
              { key: 'collected', label: '采集时间', children: article.collectedAt },
              { key: 'issuer', label: '发布单位', children: article.issuer || '—' },
              { key: 'noticeType', label: '公告类型', children: article.noticeType || '—' },
              { key: 'format', label: '内容格式', children: <span className={`article-source-kind ${rawSource.type}`}>{rawSource.type.toUpperCase()}</span> },
              { key: 'quality', label: '质量状态', children: <StatusTag value={article.quality} /> },
              { key: 'canonical', label: '归并记录', children: <span className="mono">{dedup.canonicalId || '—'}</span> },
              { key: 'sources', label: '来源数量', children: `${dedup.sourceCount || 1} 个网站来源` },
              { key: 'url', label: '原网页', children: <a href={article.url} target="_blank" rel="noreferrer">打开原网页 <ExportOutlined /></a> },
            ]} />
          </SectionCard>
          <SectionCard title={<PageTitle>来源与追溯</PageTitle>}>
            <div className="trace-links"><Button type="link" onClick={() => navigate(`/executions/${article.executionId}`)}>来源执行 <span className="mono">{article.executionId}</span></Button><Button type="link" onClick={() => navigate(siteRulePath)}>网站规则 <span className="mono">{article.ruleId}</span></Button></div>
            <div className="article-dedup-trace">
              <div><span>标准 URL</span><code>{dedup.normalizedUrl || article.url}</code></div>
              <div><span>内容指纹</span><code>{dedup.fingerprint || '—'}</code></div>
              {article.backendMode && <div><span>响应指纹</span><code>{article.sourceResponse?.sha256 || '—'}</code></div>}
              {article.backendMode && <div><span>原文版本</span><code>{article.versionId || '—'}</code></div>}
              <div><span>归并状态</span><strong>{dedup.status || '独立记录'}</strong></div>
            </div>
          </SectionCard>
          {article.backendMode && article.attachments?.length > 0 && (
            <SectionCard title={<PageTitle>附件归档</PageTitle>}>
              <div className="article-attachment-list">
                {article.attachments.map((attachment) => (
                  <div key={attachment.id}>
                    <div><strong>{attachment.name}</strong><StatusTag value={attachment.status === 'archived' ? '已归档' : '需处理'} /></div>
                    <span>{attachment.size_bytes ? `${(attachment.size_bytes / 1024).toFixed(1)} KB` : attachment.error_message || '等待归档'}</span>
                    <a href={attachment.archived_url || attachment.url} target="_blank" rel="noreferrer">{attachment.archived_url ? '打开归档' : '打开源文件'} <ExportOutlined /></a>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
          {['需处理', '内容噪声', '重复待确认'].includes(article.quality) && (
            <div ref={qualitySectionRef} className={qualityFocused ? 'article-quality-focus' : ''}>
              <SectionCard title={<PageTitle>质量处理</PageTitle>}>
                <Alert type="warning" showIcon title={article.quality} description={article.backendMode ? (article.qualityIssues?.join('；') || '后端质量检查未通过') : article.quality === '内容噪声' ? '建议定位到产生该原文的规则，调整正文清洗规则并回归发布。' : '请对比候选内容，确认是否属于同一标讯。'} />
                {!article.backendMode && <div className="stack-actions">{article.quality === '内容噪声' ? <><Button block icon={<ToolOutlined />} onClick={() => navigate(siteRulePath)}>修复网站规则</Button><Button block onClick={resolveNoise}>标记本条已确认</Button></> : <Button block type="primary" icon={<MergeCellsOutlined />} onClick={() => setDuplicateOpen(true)}>处理重复候选</Button>}</div>}
              </SectionCard>
            </div>
          )}
        </aside>
      </div>

      <Modal title="跨网站重复候选确认" open={duplicateOpen} onCancel={() => setDuplicateOpen(false)} footer={<Space><Button onClick={() => { resolveArticleQuality(article.id, '通过'); setDuplicateOpen(false); message.success('已确认不是重复，当前记录保持独立') }}>不是重复</Button><Button type="primary" onClick={() => { resolveArticleQuality(article.id, '已合并'); setDuplicateOpen(false); message.success('已归并到主记录，两个网站来源均已保留') }}>归并到主记录</Button></Space>}>
        <Alert type="info" showIcon title="系统通过业务标识、标题与正文指纹发现跨网站重复内容" />
        <div className="duplicate-signals">
          <div><span>业务标识</span><strong className="mono">{dedup.signals?.businessKey || '未识别'}</strong></div>
          <div><span>标题相似度</span><strong className="mono">{dedup.signals?.titleSimilarity || 0}%</strong></div>
          <div><span>正文相似度</span><strong className="mono">{dedup.signals?.contentSimilarity || 0}%</strong></div>
          <div><span>发布时间</span><strong>{dedup.signals?.samePublishDate ? '一致' : '不一致'}</strong></div>
        </div>
        <div className="duplicate-compare"><div><span>当前来源 · {article.site}</span><strong>{article.id}</strong><p>{article.title}</p></div><div><span>推荐主记录 · {duplicateCandidate?.site || '其他网站'}</span><strong>{duplicateCandidate?.id || '—'}</strong><p>{duplicateCandidate?.title || article.title}</p></div></div>
      </Modal>
    </div>
  )
}

export function ArticlesPage() {
  const { articleId } = useParams()
  const navigate = useNavigate()
  const [pageParams] = useSearchParams()
  const sourceExecutionId = articleId ? pageParams.get('execution') || '' : ''
  const { articles: prototypeArticles, sites } = usePrototype()
  const [backendArticles, setBackendArticles] = useState(null)
  const [backendDetail, setBackendDetail] = useState(null)
  const [backendLoading, setBackendLoading] = useState(true)
  const [backendError, setBackendError] = useState('')

  useEffect(() => {
    let active = true
    setBackendLoading(true)
    getBackendArticles({ limit: 200 }).then((items) => {
      if (!active) return
      setBackendArticles(items)
      setBackendError('')
    }).catch((error) => {
      if (!active) return
      setBackendArticles([])
      setBackendError(error.message || '无法读取真实原文')
    }).finally(() => {
      if (active) setBackendLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const realArticles = useMemo(
    () => (backendArticles || []).map((article) => toBackendArticle(article, sites)),
    [backendArticles, sites],
  )
  const backendManagedSiteNames = useMemo(
    () => new Set(sites.filter((site) => site.backendSiteId).map((site) => site.name)),
    [sites],
  )
  const articles = useMemo(() => [
    ...realArticles,
    ...prototypeArticles.filter((article) => !backendManagedSiteNames.has(article.site)),
  ], [backendManagedSiteNames, prototypeArticles, realArticles])
  const article = articleId ? articles.find((item) => item.id === articleId) : null

  useEffect(() => {
    if (!article?.backendMode) {
      setBackendDetail(null)
      return undefined
    }
    let active = true
    setBackendLoading(true)
    getBackendArticle(article.id, { executionId: sourceExecutionId || article.executionId }).then((item) => {
      if (active) setBackendDetail(toBackendArticle(item, sites))
    }).catch((error) => {
      if (active) setBackendError(error.message || '无法读取真实原文详情')
    }).finally(() => {
      if (active) setBackendLoading(false)
    })
    return () => {
      active = false
    }
  }, [article?.backendMode, article?.executionId, article?.id, sites, sourceExecutionId])

  useEffect(() => {
    if (!articleId || backendLoading || article) return
    const stalePrototype = prototypeArticles.find((item) => item.id === articleId)
    if (stalePrototype && backendManagedSiteNames.has(stalePrototype.site)) {
      navigate('/articles', { replace: true })
    }
  }, [article, articleId, backendLoading, backendManagedSiteNames, navigate, prototypeArticles])

  if (!articleId) return <ArticlesList articles={articles} backendError={backendError} />
  if (backendLoading && article?.backendMode) return <div className="page-content"><Spin /></div>
  const resolvedArticle = backendDetail?.id === articleId ? backendDetail : article
  if (!resolvedArticle) {
    if (backendLoading) return <div className="page-content"><Spin /></div>
    return <div className="page-content"><Alert type="error" showIcon title="原文记录不存在" /></div>
  }
  return <ArticleDetail article={resolvedArticle} />
}
