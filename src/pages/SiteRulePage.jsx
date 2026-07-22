import { Alert, Button } from 'antd'
import { GlobalOutlined, LeftOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { SiteRulePanel } from '../components/SiteRulePanel'
import { StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '')
}

export function SiteRulePage() {
  const navigate = useNavigate()
  const { siteHost } = useParams()
  const { sites, rules } = usePrototype()
  const decodedHost = siteHost || ''
  const site = sites.find((item) => normalizeHost(item.host) === normalizeHost(decodedHost))
  const rule = rules.find((item) => normalizeHost(item.siteHost) === normalizeHost(decodedHost))

  if (!site) {
    return (
      <div className="page-content site-rule-page">
        <div className="back-row"><Button icon={<LeftOutlined />} onClick={() => navigate('/sites')}>返回网站管理</Button><span>网站规则</span></div>
        <Alert type="error" showIcon title="网站资产不存在" description="请返回网站管理重新选择需要维护的网站。" />
      </div>
    )
  }

  return (
    <div className="page-content site-rule-page">
      <div className="back-row">
        <Button icon={<LeftOutlined />} onClick={() => navigate('/sites')}>返回网站管理</Button>
        <span>网站规则</span>
      </div>
      <section className="detail-workspace-header site-rule-workspace-header">
        <span className="detail-workspace-icon"><GlobalOutlined /></span>
        <div className="detail-workspace-identity">
          <div><h1>{site.name}</h1><StatusTag value={rule?.status || '待配置'} /></div>
          <span className="mono">{site.host}</span>
        </div>
        <Button onClick={() => navigate(`/sites?site=${encodeURIComponent(site.host)}`)}>网站概览</Button>
      </section>
      <section className="site-rule-workspace">
        <SiteRulePanel site={site} rule={rule} standalone />
      </section>
    </div>
  )
}
