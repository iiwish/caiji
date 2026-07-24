export const DEFAULT_SITE_FOLDER_ID = 'SF-DEFAULT'
export const ROOT_FOLDER_VALUE = '__root__'
export const UNFILED_FOLDER_VALUE = '__unfiled__'

export const initialSiteFolders = [{
  id: DEFAULT_SITE_FOLDER_ID,
  name: '默认文件夹',
  parentId: null,
  isDefault: true,
  sortOrder: 0,
  createdAt: '',
}]

export function migrateSiteFolders(value) {
  const source = Array.isArray(value) ? value : []
  const normalized = source
    .filter((folder) => folder && folder.id && folder.name)
    .map((folder, index) => ({
      id: String(folder.id),
      name: String(folder.name).trim(),
      parentId: folder.parentId ? String(folder.parentId) : null,
      isDefault: Boolean(folder.isDefault),
      sortOrder: Number.isFinite(folder.sortOrder) ? folder.sortOrder : index,
      createdAt: folder.createdAt || '',
    }))

  let defaultIndex = normalized.findIndex((folder) => folder.isDefault)
  if (defaultIndex < 0) defaultIndex = normalized.findIndex((folder) => folder.name === '默认文件夹')
  if (defaultIndex < 0) {
    normalized.unshift({ ...initialSiteFolders[0] })
    defaultIndex = 0
  }

  const ids = new Set(normalized.map((folder) => folder.id))
  return normalized.map((folder, index) => ({
    ...folder,
    parentId: folder.parentId && folder.parentId !== folder.id && ids.has(folder.parentId) ? folder.parentId : null,
    isDefault: index === defaultIndex,
  }))
}

export function buildSiteFolderTree(folders) {
  const nodes = new Map(folders.map((folder) => [folder.id, { ...folder, children: [] }]))
  const roots = []
  const sorted = [...nodes.values()].sort((left, right) => (
    Number(right.isDefault) - Number(left.isDefault)
      || left.sortOrder - right.sortOrder
      || left.name.localeCompare(right.name, 'zh-CN')
  ))

  sorted.forEach((folder) => {
    const parent = folder.parentId ? nodes.get(folder.parentId) : null
    if (parent && parent.id !== folder.id) parent.children.push(folder)
    else roots.push(folder)
  })
  return roots
}

export function getFolderBranchIds(folders, folderId) {
  const childIds = new Map()
  folders.forEach((folder) => {
    const key = folder.parentId || ROOT_FOLDER_VALUE
    childIds.set(key, [...(childIds.get(key) || []), folder.id])
  })
  const result = new Set()
  const pending = [folderId]
  while (pending.length) {
    const current = pending.pop()
    if (!current || result.has(current)) continue
    result.add(current)
    pending.push(...(childIds.get(current) || []))
  }
  return result
}

export function getFolderPath(folders, folderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const names = []
  const visited = new Set()
  let current = byId.get(folderId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    names.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : null
  }
  return names.join(' / ')
}

export function toFolderTreeSelectData(folders) {
  const mapNode = (folder) => ({
    key: folder.id,
    value: folder.id,
    title: folder.isDefault ? `${folder.name}（默认）` : folder.name,
    children: folder.children.map(mapNode),
  })
  return buildSiteFolderTree(folders).map(mapNode)
}
