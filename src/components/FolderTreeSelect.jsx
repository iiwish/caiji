import { useMemo, useState } from 'react'
import { App as AntApp, Button, Input, Modal, TreeSelect } from 'antd'
import { FolderAddOutlined } from '@ant-design/icons'
import { ROOT_FOLDER_VALUE, toFolderTreeSelectData } from '../app/siteFolderModel'

export function FolderTreeSelect({
  folders,
  createFolder,
  treeData,
  value,
  onChange,
  onFolderCreated,
  ...selectProps
}) {
  const { message } = AntApp.useApp()
  const [createOpen, setCreateOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [parentId, setParentId] = useState(ROOT_FOLDER_VALUE)
  const parentTreeData = useMemo(() => [{
    key: ROOT_FOLDER_VALUE,
    value: ROOT_FOLDER_VALUE,
    title: '根目录',
    children: toFolderTreeSelectData(folders),
  }], [folders])

  const openCreate = () => {
    setFolderName('')
    setParentId(ROOT_FOLDER_VALUE)
    setCreateOpen(true)
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setFolderName('')
    setParentId(ROOT_FOLDER_VALUE)
  }

  const saveFolder = () => {
    const result = createFolder(folderName, parentId === ROOT_FOLDER_VALUE ? null : parentId)
    if (!result?.ok) {
      message.warning(result?.reason || '文件夹创建失败')
      return
    }
    onChange?.(result.folder.id)
    onFolderCreated?.(result.folder)
    closeCreate()
    message.success(`文件夹“${result.folder.name}”已创建并选中`)
  }

  return (
    <>
      <TreeSelect
        {...selectProps}
        value={value}
        treeData={treeData}
        onChange={onChange}
        popupRender={(menu) => (
          <div className="folder-tree-select-popup">
            {menu}
            <div className="folder-tree-select-create">
              <Button type="text" icon={<FolderAddOutlined />} onClick={openCreate}>新建文件夹</Button>
            </div>
          </div>
        )}
      />
      <Modal
        title="新建文件夹"
        open={createOpen}
        onCancel={closeCreate}
        onOk={saveFolder}
        okText="创建并选中"
        width={420}
      >
        <div className="folder-tree-create-fields">
          <label>
            <span>文件夹名称</span>
            <Input
              autoFocus
              maxLength={30}
              value={folderName}
              placeholder="输入文件夹名称"
              onChange={(event) => setFolderName(event.target.value)}
              onPressEnter={saveFolder}
            />
          </label>
          <label>
            <span>上级文件夹</span>
            <TreeSelect
              value={parentId}
              treeData={parentTreeData}
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
              onChange={setParentId}
            />
          </label>
        </div>
      </Modal>
    </>
  )
}
