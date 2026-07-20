import { Badge, Card, Input, Tag } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

const statusPalette = {
  成功: ['#e6f6ef', '#0f8a52'],
  健康: ['#e6f6ef', '#0f8a52'],
  可采集: ['#e6f6ef', '#0f8a52'],
  回归通过: ['#e6f6ef', '#0f8a52'],
  已完成: ['#e6f6ef', '#0f8a52'],
  已发布: ['#e6f6ef', '#0f8a52'],
  已通过: ['#e6f6ef', '#0f8a52'],
  启用: ['#e6f6ef', '#0f8a52'],
  运行中: ['#eef0fe', '#4b56d6'],
  采集中: ['#eef0fe', '#4b56d6'],
  重试中: ['#eef0fe', '#4b56d6'],
  分析中: ['#eef0fe', '#4b56d6'],
  候选版本: ['#eef0fe', '#4b56d6'],
  待审核: ['#fbf0dd', '#b06a04'],
  需订正: ['#fdecef', '#cf3350'],
  待确认归属: ['#fbf0dd', '#b06a04'],
  待回归: ['#fbf0dd', '#b06a04'],
  待配置: ['#fbf0dd', '#b06a04'],
  '待人工确认': ['#fbf0dd', '#b06a04'],
  部分失败: ['#fbf0dd', '#b06a04'],
  需处理: ['#fdecef', '#cf3350'],
  需修复: ['#fdecef', '#cf3350'],
  失败: ['#fdecef', '#cf3350'],
  验证失败: ['#fdecef', '#cf3350'],
  规则异常: ['#fdecef', '#cf3350'],
  '列表 0 行': ['#fdecef', '#cf3350'],
  回归失败: ['#fdecef', '#cf3350'],
  内容噪声: ['#fdecef', '#cf3350'],
  重复待确认: ['#f3ecfd', '#7c3aed'],
  候选版本中: ['#f3ecfd', '#7c3aed'],
  已暂停: ['#eef0f3', '#6b7688'],
  已停用: ['#eef0f3', '#6b7688'],
}

export function StatusTag({ value }) {
  const [background, color] = statusPalette[value] || ['#f2f3f6', '#6b7688']
  return <Tag variant="filled" className="soft-tag" style={{ background, color }}>{value}</Tag>
}

export function SearchBar({ placeholder, value, onChange, inputRef }) {
  return (
    <Input
      ref={inputRef}
      allowClear
      className="global-search"
      prefix={<SearchOutlined />}
      placeholder={placeholder}
      suffix={<span className="shortcut">⌘K</span>}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function SectionCard({ title, extra, children, className = '', bodyStyle }) {
  return (
    <Card className={`section-card ${className}`} title={title} extra={extra} styles={{ body: bodyStyle }}>
      {children}
    </Card>
  )
}

export function PageTitle({ children, count }) {
  return <span className="card-heading">{children}{count !== undefined && <Badge className="heading-count" count={count} showZero color="#eef0f3" />}</span>
}

export function SourceCell({ name, host, dot }) {
  return (
    <div className="source-cell">
      {dot && <span className={`status-dot ${dot}`} />}
      <div className="source-copy">
        <div className="source-name">{name}</div>
        {host && <div className="mono source-host">{host}</div>}
      </div>
    </div>
  )
}
