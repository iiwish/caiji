import { useMemo, useState } from 'react'
import { App as AntApp, Button, Form, Input, Modal, Select, Table, Tabs, Tag } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useOutletContext } from 'react-router-dom'
import { PageTitle, RowActions, SectionCard, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

const INITIAL_MODELS = [
  { id: 'MD-001', name: 'OpenAI 常规', provider: 'OpenAI', type: '默认', code: 'gpt-4.1-mini', status: '可用' },
  { id: 'MD-002', name: 'OpenAI 增强', provider: 'OpenAI', type: '增强', code: 'gpt-5', status: '可用' },
  { id: 'MD-003', name: 'Azure OpenAI 常规', provider: 'Azure OpenAI', type: '默认', code: 'gpt-4.1', status: '可用' },
  { id: 'MD-004', name: 'Azure OpenAI 增强', provider: 'Azure OpenAI', type: '增强', code: 'gpt-5', status: '可用' },
  { id: 'MD-005', name: '本地兼容网关 常规', provider: '本地兼容网关', type: '默认', code: 'qwen-compatible', status: '降级' },
  { id: 'MD-006', name: '本地兼容网关 增强', provider: '本地兼容网关', type: '增强', code: 'deepseek-compatible', status: '降级' },
  { id: 'MD-007', name: '备用模型池 常规', provider: '备用模型池', type: '默认', code: 'gpt-4.1-mini', status: '停用' },
  { id: 'MD-008', name: '备用模型池 增强', provider: '备用模型池', type: '增强', code: 'gpt-5-pro', status: '停用' },
  { id: 'MD-009', name: '诊断模型 常规', provider: 'Browser 诊断模型', type: '默认', code: 'gpt-4.1', status: '可用' },
  { id: 'MD-010', name: '诊断模型 增强', provider: 'Browser 诊断模型', type: '增强', code: 'gpt-5', status: '可用' },
]

export function SettingsPage() {
  const { message } = AntApp.useApp()
  const { search } = useOutletContext()
  const { auditEvents, saveUser, users } = usePrototype()
  const [models, setModels] = useState(INITIAL_MODELS)
  const [defaultModelId, setDefaultModelId] = useState('MD-001')
  const [modelStatus, setModelStatus] = useState('全部状态')
  const [modelOpen, setModelOpen] = useState(false)
  const [editingModel, setEditingModel] = useState(null)
  const [userOpen, setUserOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [modelForm] = Form.useForm()
  const [userForm] = Form.useForm()
  const filteredAudit = auditEvents.filter((item) => `${item.action}${item.object}${item.operator}`.includes(search))
  const visibleModels = useMemo(() => models.filter((model) => (
    (modelStatus === '全部状态' || model.status === modelStatus) &&
    `${model.name}${model.provider}${model.code}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [modelStatus, models, search])
  const selectableModels = models.filter((model) => model.status !== '停用')
  const modelOptions = selectableModels.map((model) => ({ value: model.id, label: `${model.name} · ${model.code}` }))
  const openModel = (model = null) => {
    setEditingModel(model)
    modelForm.resetFields()
    modelForm.setFieldsValue(model || { name: '', provider: 'OpenAI', type: '默认', code: '', status: '可用' })
    setModelOpen(true)
  }
  const saveModelChanges = async () => {
    try {
      const values = await modelForm.validateFields()
      if (editingModel && values.status === '停用' && editingModel.id === defaultModelId) {
        message.warning('请先切换当前使用的模型，再将其停用')
        return
      }
      if (editingModel) {
        setModels((current) => current.map((model) => model.id === editingModel.id ? { ...model, ...values } : model))
      } else {
        setModels((current) => [...current, { id: `MD-${String(current.length + 1).padStart(3, '0')}`, ...values }])
      }
      setModelOpen(false)
      message.success(editingModel ? '模型配置已更新' : '模型已添加')
    } catch {
      // Ant Design keeps the dialog open and displays field-level validation.
    }
  }
  const openUser = (user = null) => {
    setEditingUser(user)
    userForm.resetFields()
    userForm.setFieldsValue(user || { name: '', role: '采集运营', status: '启用' })
    setUserOpen(true)
  }
  const saveUserChanges = async () => {
    try {
      const values = await userForm.validateFields()
      values.name = values.name.trim()
      saveUser({ ...editingUser, ...values })
      setUserOpen(false)
      message.success(editingUser ? '用户信息已更新' : '用户已添加')
    } catch {
      // Ant Design keeps the dialog open and displays field-level validation.
    }
  }
  const modelColumns = [
    { title: '模型名称', dataIndex: 'name', width: 220, render: (value, model) => <div className="model-name-cell"><strong>{value}</strong><span className="mono">{model.id}</span></div> },
    { title: '提供商', dataIndex: 'provider', width: 180 },
    { title: '模型编码', dataIndex: 'code', width: 190, render: (value) => <span className="mono model-code">{value}</span> },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <Tag className={`model-status-tag ${value === '可用' ? 'available' : value === '降级' ? 'degraded' : 'disabled'}`}>{value}</Tag> },
    { title: '操作', width: 72, fixed: 'right', align: 'center', render: (_, model) => <RowActions quick={[{ key: 'edit', label: `编辑 ${model.name}`, icon: <EditOutlined />, onClick: () => openModel(model) }]} /> },
  ]
  return (
    <div className="page-content settings-page">
      <Tabs items={[
        { key: 'general', label: '平台配置', children: <div className="settings-platform-stack">
          <SectionCard className="model-settings-surface" title={<PageTitle>模型配置</PageTitle>} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModel()}>添加模型</Button>} bodyStyle={{ padding: 0 }}>
            <div className="model-selection-grid single">
              <label className="model-selection-field inline"><span>默认模型</span><Select value={defaultModelId} options={modelOptions} onChange={(value) => { setDefaultModelId(value); message.success('默认模型已切换') }} /></label>
            </div>
            <div className="model-list-toolbar"><div><strong>模型列表</strong><span>共 {visibleModels.length} 个模型</span></div><Select aria-label="按模型状态筛选" value={modelStatus} onChange={setModelStatus} options={['全部状态', '可用', '降级', '停用'].map((value) => ({ value, label: value }))} /></div>
            <Table className="model-settings-table" rowKey="id" columns={modelColumns} dataSource={visibleModels} tableLayout="fixed" pagination={{ pageSize: 8, showSizeChanger: false }} scroll={{ x: 762 }} locale={{ emptyText: search ? '没有匹配的模型' : '当前状态下没有模型' }} />
          </SectionCard>
        </div> },
        { key: 'users', label: '用户与角色', children: <SectionCard title={<PageTitle count={users.length}>平台用户</PageTitle>} extra={<Button icon={<PlusOutlined />} onClick={() => openUser()}>添加用户</Button>} bodyStyle={{ padding: 0 }}><Table rowKey="id" pagination={false} dataSource={users} columns={[{ title: '用户', dataIndex: 'name', render: (value) => <strong>{value}</strong> }, { title: '角色', dataIndex: 'role' }, { title: '状态', dataIndex: 'status', render: (value) => <StatusTag value={value} /> }, { title: '最近登录', dataIndex: 'lastLogin' }, { title: '操作', width: 72, align: 'center', render: (_, user) => <RowActions quick={[{ key: 'edit', label: `编辑 ${user.name}`, icon: <EditOutlined />, onClick: () => openUser(user) }]} /> }]} /></SectionCard> },
        { key: 'audit', label: '审计记录', children: <SectionCard title={<PageTitle count={filteredAudit.length}>最近操作</PageTitle>} bodyStyle={{ padding: 0 }}><Table rowKey="id" pagination={{ pageSize: 8, showSizeChanger: false }} dataSource={filteredAudit} locale={{ emptyText: '完成审核、发布、执行或配置操作后，审计记录会显示在这里' }} columns={[{ title: '时间', dataIndex: 'time', width: 180 }, { title: '操作', dataIndex: 'action' }, { title: '对象', dataIndex: 'object', render: (value) => <span className="mono">{value}</span> }, { title: '操作人', dataIndex: 'operator', width: 120 }]} /></SectionCard> },
      ]} />

      <Modal title={editingModel ? '编辑模型' : '添加模型'} open={modelOpen} onCancel={() => setModelOpen(false)} onOk={saveModelChanges} okText="保存" forceRender>
        <Form form={modelForm} layout="vertical">
          <Form.Item name="name" label="模型名称" rules={[{ required: true, whitespace: true, message: '请输入模型名称' }]}><Input placeholder="例如 OpenAI 常规" /></Form.Item>
          <Form.Item name="provider" label="提供商" rules={[{ required: true, message: '请选择提供商' }]}><Select options={['OpenAI', 'Azure OpenAI', '本地兼容网关', '备用模型池', 'Browser 诊断模型'].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="code" label="模型编码" rules={[
            { required: true, whitespace: true, message: '请输入模型编码' },
            { validator: (_, value) => {
              const provider = modelForm.getFieldValue('provider')
              return !value || models.every((model) => model.id === editingModel?.id || model.provider !== provider || model.code !== value.trim())
                ? Promise.resolve()
                : Promise.reject(new Error('该提供商下已存在相同模型编码'))
            } },
          ]}><Input className="mono" placeholder="例如 gpt-4.1-mini" /></Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择模型状态' }]}><Select options={['可用', '降级', '停用'].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="apiKey" label="API Key"><Input.Password placeholder={editingModel ? '留空则沿用已有密钥' : '可稍后配置'} /></Form.Item>
        </Form>
      </Modal>
      <Modal title={editingUser ? '编辑用户' : '添加用户'} open={userOpen} onCancel={() => setUserOpen(false)} onOk={saveUserChanges} okText="保存">
        <Form form={userForm} layout="vertical">
          <Form.Item name="name" label="用户名" rules={[
            { required: true, whitespace: true, message: '请输入用户名' },
            { validator: (_, value) => !value || users.every((user) => user.id === editingUser?.id || user.name !== value.trim()) ? Promise.resolve() : Promise.reject(new Error('用户名已存在')) },
          ]}>
            <Input placeholder="例如 collector_ops" autoComplete="off" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={['超级管理员', '采集运营', '能力维护', '只读审计'].map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={['启用', '已停用'].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
