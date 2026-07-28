import { Badge, Button, Card, Dropdown, Input, Space, Tag, Tooltip } from 'antd'
import { MoreOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons'

const statusPalette = {
  成功: ['#e6f6ef', '#0f8a52'],
  健康: ['#e6f6ef', '#0f8a52'],
  可采集: ['#e6f6ef', '#0f8a52'],
  回归通过: ['#e6f6ef', '#0f8a52'],
  已完成: ['#e6f6ef', '#0f8a52'],
  已发布: ['#e6f6ef', '#0f8a52'],
  已通过: ['#e6f6ef', '#0f8a52'],
  已处置: ['#e6f6ef', '#0f8a52'],
  '失败 · 已处置': ['#e6f6ef', '#0f8a52'],
  '部分成功 · 已处置': ['#e6f6ef', '#0f8a52'],
  启用: ['#e6f6ef', '#0f8a52'],
  运行中: ['#eef0fe', '#4b56d6'],
  采集中: ['#eef0fe', '#4b56d6'],
  重试中: ['#eef0fe', '#4b56d6'],
  '失败 · 处理中': ['#eef0fe', '#4b56d6'],
  '部分成功 · 处理中': ['#eef0fe', '#4b56d6'],
  分析中: ['#eef0fe', '#4b56d6'],
  排队中: ['#eef6ff', '#2f7ed8'],
  候选版本: ['#eef0fe', '#4b56d6'],
  待审核: ['#fbf0dd', '#b06a04'],
  待确认: ['#fbf0dd', '#b06a04'],
  需订正: ['#fdecef', '#cf3350'],
  待确认归属: ['#fbf0dd', '#b06a04'],
  待回归: ['#fbf0dd', '#b06a04'],
  待分析: ['#fbf0dd', '#b06a04'],
  待配置: ['#fbf0dd', '#b06a04'],
  '待人工确认': ['#fbf0dd', '#b06a04'],
  部分失败: ['#fbf0dd', '#b06a04'],
  '失败 · 待处理': ['#fdecef', '#cf3350'],
  '部分成功 · 待处理': ['#fbf0dd', '#b06a04'],
  需处理: ['#fdecef', '#cf3350'],
  需修复: ['#fdecef', '#cf3350'],
  失败: ['#fdecef', '#cf3350'],
  验证失败: ['#fdecef', '#cf3350'],
  规则异常: ['#fdecef', '#cf3350'],
  '列表 0 行': ['#fdecef', '#cf3350'],
  回归失败: ['#fdecef', '#cf3350'],
  内容噪声: ['#fdecef', '#cf3350'],
  重复待确认: ['#f3ecfd', '#7c3aed'],
  已合并: ['#e6f6ef', '#0f8a52'],
  候选版本中: ['#f3ecfd', '#7c3aed'],
  草稿: ['#eef0f3', '#6b7688'],
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

export function SourceCell({ name, dot, onClick, ariaLabel }) {
  const content = (
    <>
      {dot && <span className={`status-dot ${dot}`} />}
      <div className="source-copy">
        <div className="source-name">{name}</div>
      </div>
      {onClick && <RightOutlined className="entity-nav-arrow source-cell-arrow" aria-hidden />}
    </>
  )
  if (!onClick) return <div className="source-cell">{content}</div>
  return <button type="button" className="source-cell source-cell-link" aria-label={ariaLabel || `查看 ${name}`} onClick={onClick}>{content}</button>
}

export function EntityLink({
  title,
  onClick,
  ariaLabel,
  className = '',
  titleClassName = '',
}) {
  return (
    <button
      type="button"
      className={`entity-nav-link ${className}`.trim()}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <span className="entity-nav-copy">
        <span className={`entity-nav-title ${titleClassName}`.trim()}>{title}</span>
      </span>
      <RightOutlined className="entity-nav-arrow" aria-hidden />
    </button>
  )
}

export function RowActions({ primary, reservePrimary = false, quick = [], menu = [], moreLabel = '更多操作', className = '' }) {
  const menuItems = menu.map((action) => action.type === 'divider' ? { type: 'divider' } : ({
    key: action.key,
    icon: action.icon,
    danger: action.danger,
    disabled: action.disabled,
    label: action.label,
    onClick: ({ domEvent }) => {
      domEvent.stopPropagation()
      action.onClick?.()
    },
  }))

  return (
    <Space size={4} className={`table-row-actions ${className}`.trim()}>
      {(primary || reservePrimary) && (
        <span className="table-primary-slot">
          {primary && (
            <Button
              type="link"
              className={`table-primary-action ${primary.className || ''}`.trim()}
              aria-label={primary.ariaLabel || primary.label}
              disabled={primary.disabled}
              onClick={(event) => {
                event.stopPropagation()
                primary.onClick?.()
              }}
            >
              {primary.label}
            </Button>
          )}
        </span>
      )}
      {quick.map((action) => (
        <Tooltip title={action.label} key={action.key}>
          <Button
            type="text"
            className="table-icon-action"
            aria-label={action.label}
            disabled={action.disabled}
            icon={action.icon}
            onClick={(event) => {
              event.stopPropagation()
              action.onClick?.()
            }}
          />
        </Tooltip>
      ))}
      {menuItems.length > 0 && (
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
          <Tooltip title={moreLabel}>
            <Button type="text" className="table-icon-action" aria-label={moreLabel} icon={<MoreOutlined />} onClick={(event) => event.stopPropagation()} />
          </Tooltip>
        </Dropdown>
      )}
    </Space>
  )
}
