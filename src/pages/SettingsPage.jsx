import { useState } from 'react'
import { Alert, App as AntApp, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useOutletContext } from 'react-router-dom'
import { PageTitle, SectionCard, StatusTag } from '../components/ConsoleUI'
import { usePrototype } from '../app/PrototypeContext'

export function SettingsPage() {
  const { message, modal } = AntApp.useApp()
  const { search } = useOutletContext()
  const { auditEvents, resetPrototype, saveUser, users } = usePrototype()
  const [modelOpen, setModelOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [userForm] = Form.useForm()
  const filteredAudit = auditEvents.filter((item) => `${item.action}${item.object}${item.operator}`.includes(search))
  const reset = () => modal.confirm({ title: '重置演示数据？', content: '所有本地操作状态会恢复为初始原型数据。', okText: '确认重置', okButtonProps: { danger: true }, onOk: () => { resetPrototype(); message.success('演示数据已重置') } })
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
  return (
    <div className="page-content settings-page">
      <Tabs items={[
        { key: 'general', label: '平台配置', children: <div className="settings-grid"><SectionCard title={<PageTitle>模型与成本</PageTitle>} extra={<Button onClick={() => setModelOpen(true)}>编辑</Button>}><div className="setting-line"><div><strong>规则生成模型</strong><span>用于 AI 分析、规则生成和修复建议</span></div><b>collector-reasoner</b></div><div className="setting-line"><div><strong>单批次预算上限</strong><span>超出后暂停新增 Agent 任务</span></div><b>¥ 20.00</b></div></SectionCard><SectionCard title={<PageTitle>生产默认值</PageTitle>}><Form layout="vertical" initialValues={{ concurrency: 4, retention: 180, notify: true }}><Form.Item name="concurrency" label="默认并发数"><InputNumber min={1} max={20} /></Form.Item><Form.Item name="retention" label="执行日志保留天数"><InputNumber min={30} max={365} suffix="天" /></Form.Item><Form.Item name="notify" label="异常通知" valuePropName="checked"><Switch /></Form.Item><Button type="primary" onClick={() => message.success('平台默认值已保存')}>保存配置</Button></Form></SectionCard></div> },
        { key: 'users', label: '用户与角色', children: <SectionCard title={<PageTitle count={users.length}>平台用户</PageTitle>} extra={<Button icon={<PlusOutlined />} onClick={() => openUser()}>添加用户</Button>} bodyStyle={{ padding: 0 }}><Table rowKey="id" pagination={false} dataSource={users} columns={[{ title: '用户', dataIndex: 'name', render: (value) => <strong>{value}</strong> }, { title: '角色', dataIndex: 'role' }, { title: '状态', dataIndex: 'status', render: (value) => <StatusTag value={value} /> }, { title: '最近登录', dataIndex: 'lastLogin' }, { title: '操作', align: 'right', render: (_, user) => <Button type="link" onClick={() => openUser(user)}>编辑</Button> }]} /></SectionCard> },
        { key: 'audit', label: '审计记录', children: <SectionCard title={<PageTitle count={filteredAudit.length}>最近操作</PageTitle>} bodyStyle={{ padding: 0 }}><Table rowKey="id" pagination={{ pageSize: 8, showSizeChanger: false }} dataSource={filteredAudit} locale={{ emptyText: '完成审核、发布、执行或配置操作后，审计记录会显示在这里' }} columns={[{ title: '时间', dataIndex: 'time', width: 180 }, { title: '操作', dataIndex: 'action' }, { title: '对象', dataIndex: 'object', render: (value) => <span className="mono">{value}</span> }, { title: '操作人', dataIndex: 'operator', width: 120 }]} /></SectionCard> },
        { key: 'prototype', label: '原型数据', children: <SectionCard title={<PageTitle>演示环境</PageTitle>}><Alert type="warning" showIcon title="当前项目使用本地模拟数据，不会触发真实采集、模型费用或外部系统写入。" /><Space className="prototype-actions"><Button danger icon={<ReloadOutlined />} onClick={reset}>重置演示数据</Button></Space></SectionCard> },
      ]} />

      <Modal title="模型与成本配置" open={modelOpen} onCancel={() => setModelOpen(false)} onOk={() => { setModelOpen(false); message.success('模型配置已保存') }} okText="保存">
        <Form layout="vertical" initialValues={{ model: 'collector-reasoner', budget: 20, api: '' }}>
          <Form.Item name="model" label="规则生成模型"><Select options={['collector-reasoner', 'collector-fast', 'collector-local'].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="budget" label="单批次预算上限"><InputNumber min={1} max={500} prefix="¥" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="api" label="API Key"><Input.Password placeholder="留空则沿用已有密钥" /></Form.Item>
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
