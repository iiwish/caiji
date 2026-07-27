import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Dropdown,
  Grid,
  Input,
  Modal,
  Pagination,
  Segmented,
  Table,
  Tree,
  TreeSelect,
  Tooltip,
  Upload,
} from 'antd'
import {
  AppstoreOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  InboxOutlined,
  LineChartOutlined,
  MoreOutlined,
  RobotOutlined,
  StarOutlined,
  StopOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import Papa from 'papaparse'
import { RowActions, SourceCell, StatusTag } from '../components/ConsoleUI'
import { FolderTreeSelect } from '../components/FolderTreeSelect'
import { usePrototype } from '../app/PrototypeContext'
import { getSiteWorkspacePath } from '../app/routes'
import { entryUrlKey, findRuleForSite, normalizeEntryUrl } from '../app/urlIdentity'
import {
  ROOT_FOLDER_VALUE,
  buildSiteFolderTree,
  getFolderBranchIds,
  getFolderPath,
  toFolderTreeSelectData,
} from '../app/siteFolderModel'

const PAGE_SIZE = 12
const SITE_SCOPE_STATUSES = {
  全部: null,
  可采集: ['可采集'],
  接入中: ['待分析', '排队中', '分析中', '待审核'],
  需处理: ['需处理'],
  已停用: ['已停用'],
}

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '')
}

function getUrlHost(url) {
  try {
    return normalizeHost(new URL(url).host)
  } catch {
    return ''
  }
}

function isValidWebsiteUrl(url) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function workbookRowsToSites(matrix) {
  if (!matrix.length) return []
  const normalizedHeader = matrix[0].map((value) => String(value || '').trim().toLowerCase())
  const aliases = {
    name: ['名称', '网站名称', '数据源', 'name'],
    url: ['网址', '网站url', 'url', '入口url'],
    freq: ['采集频率', '频率', 'frequency'],
  }
  const findColumn = (field, fallback) => {
    const index = normalizedHeader.findIndex((value) => aliases[field].includes(value))
    return index >= 0 ? index : fallback
  }
  const hasHeader = normalizedHeader.some((value) => Object.values(aliases).flat().includes(value))
  const nameIndex = findColumn('name', 0)
  const urlIndex = findColumn('url', 1)
  const freqIndex = findColumn('freq', 2)
  return matrix.slice(hasHeader ? 1 : 0).map((row, index) => {
    const firstCell = String(row[0] || '').trim()
    const secondCell = String(row[1] || '').trim()
    const isUrlOnlyRow = isValidWebsiteUrl(firstCell) && !isValidWebsiteUrl(secondCell)
    const url = isUrlOnlyRow ? firstCell : String(row[urlIndex] || '').trim()
    return {
      key: `IMPORT-${index}`,
      name: isUrlOnlyRow ? '' : String(row[nameIndex] || '').trim(),
      url,
      freq: isUrlOnlyRow ? secondCell : String(row[freqIndex] || '').trim(),
      valid: isValidWebsiteUrl(url),
    }
  }).filter((row) => row.name || row.url)
}

function pastedTextToSites(value) {
  const parsed = Papa.parse(String(value || '').replace(/^\uFEFF/, ''), { skipEmptyLines: true })
  return workbookRowsToSites(parsed.data)
}

function resolveKnownSiteNames(rows, sites) {
  return rows.map((row) => {
    if (row.name) return row
    const host = getUrlHost(row.url)
    const existing = sites.find((site) => entryUrlKey(site.entryUrl) === entryUrlKey(row.url))
      || sites.find((site) => normalizeHost(site.host) === host)
    const knownName = String(existing?.name || '').trim()
    const canReuseName = knownName && normalizeHost(knownName) !== host && knownName !== '待识别网站'
    return { ...row, name: canReuseName ? knownName : '' }
  })
}

function prepareImportRows(rows, sites) {
  const existingUrls = new Set(sites.map((site) => entryUrlKey(site.entryUrl)).filter(Boolean))
  const seenUrls = new Set()
  return resolveKnownSiteNames(rows, sites).map((row) => {
    const normalizedUrl = row.valid ? entryUrlKey(row.url) : ''
    const duplicateInBatch = Boolean(normalizedUrl && seenUrls.has(normalizedUrl))
    if (normalizedUrl) seenUrls.add(normalizedUrl)
    return {
      ...row,
      normalizedUrl,
      duplicateInBatch,
      alreadyExists: Boolean(normalizedUrl && existingUrls.has(normalizedUrl)),
    }
  })
}

function isActiveAnalysis(entry) {
  return !['审核完成', '已通过', '已完成', '已取消'].includes(entry.status)
}

function getSiteId(site) {
  if (site.id) return site.id
  if (Number.isInteger(site.key)) return `WS-${String(site.key + 1).padStart(3, '0')}`
  const checksum = [...entryUrlKey(site.entryUrl || `https://${site.host}`)]
    .reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261)
  return `WS-${checksum.toString(16).padStart(8, '0').toUpperCase()}`
}

export function SitesPage() {
  const { message, modal } = AntApp.useApp()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const { search } = useOutletContext()
  const [params] = useSearchParams()
  const {
    sites,
    siteFolders,
    defaultSiteFolderId,
    tasks,
    rules,
    intakeBatches,
    importSites,
    createSiteFolder,
    renameSiteFolder,
    deleteSiteFolder,
    setDefaultSiteFolder,
    moveSitesToFolder,
    setSitesEnabled,
    createSiteAnalysisBatch,
    startSiteAnalysis,
  } = usePrototype()
  const [scope, setScope] = useState('全部')
  const [folderFilter, setFolderFilter] = useState('all')
  const [view, setView] = useState('list')
  const [page, setPage] = useState(1)
  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState('paste')
  const [importText, setImportText] = useState('')
  const [importRows, setImportRows] = useState([])
  const [importFileName, setImportFileName] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importFolderId, setImportFolderId] = useState('')
  const [folderDialog, setFolderDialog] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [folderParentId, setFolderParentId] = useState(ROOT_FOLDER_VALUE)
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => siteFolders.map((folder) => folder.id))
  const [moveTargets, setMoveTargets] = useState([])
  const [moveFolderId, setMoveFolderId] = useState('')
  const [selectedSiteIds, setSelectedSiteIds] = useState([])

  const activeAnalyses = useMemo(() => intakeBatches
    .flatMap((batch) => batch.urls.map((entry) => ({ ...entry, batchId: batch.id })))
    .filter(isActiveAnalysis), [intakeBatches])

  const analysisByUrl = useMemo(() => {
    const entries = new Map()
    activeAnalyses.forEach((entry) => {
      const urlKey = entryUrlKey(entry.url)
      const current = entries.get(urlKey)
      if (!current || ['分析中', '排队中'].includes(entry.status)) entries.set(urlKey, entry)
    })
    return entries
  }, [activeAnalyses])

  const registrySites = useMemo(() => sites.map((row) => {
    const host = normalizeHost(row.host)
    const normalizedUrl = entryUrlKey(row.entryUrl)
    const siteRule = findRuleForSite(rules, row)
    const siteTasks = tasks.filter((task) => task.siteId === row.id || task.ruleId === siteRule?.id)
    const analysisEntry = analysisByUrl.get(normalizedUrl)
    let status = '可采集'
    if (['已停用', '已暂停'].includes(row.status)) status = '已停用'
    else if (row.status === '异常' || siteRule?.status === '需修复') status = '需处理'
    else if (analysisEntry?.status === '分析中') status = '分析中'
    else if (analysisEntry?.status === '排队中') status = '排队中'
    else if (analysisEntry) status = '待审核'
    else if (!siteRule || (siteRule.version === 'v0.0.0' && siteRule.status !== '已发布')) status = '待分析'
    else if (['候选版本', '待审核'].includes(siteRule.status)) status = '待审核'

    return {
      ...row,
      host,
      normalizedUrl,
      id: getSiteId(row),
      status,
      accessHealth: row.status === '异常' ? '需处理' : '健康',
      ruleStatus: siteRule?.status || '待配置',
      ruleVersion: siteRule?.version || '-',
      taskCount: siteTasks.length,
      collectionTask: siteTasks[0] || null,
      analysisEntry,
    }
  }), [analysisByUrl, sites, tasks, rules])

  const activeFolderBranchIds = useMemo(() => (
    siteFolders.some((folder) => folder.id === folderFilter)
      ? getFolderBranchIds(siteFolders, folderFilter)
      : null
  ), [folderFilter, siteFolders])
  const visibleRows = useMemo(() => registrySites.filter((row) => {
    const matchesFolder = folderFilter === 'all'
      || row.folderId === folderFilter
      || Boolean(activeFolderBranchIds?.has(row.folderId))
    const scopeStatuses = SITE_SCOPE_STATUSES[scope]
    return matchesFolder
      && (!scopeStatuses || scopeStatuses.includes(row.status))
      && `${row.id}${row.name}${row.host}${row.entryUrl}`.toLowerCase().includes(search.trim().toLowerCase())
  }), [activeFolderBranchIds, folderFilter, registrySites, scope, search])
  const selectedSites = useMemo(() => registrySites.filter((row) => selectedSiteIds.includes(row.id)), [registrySites, selectedSiteIds])

  useEffect(() => {
    setPage(1)
  }, [folderFilter, scope, search, sites.length])

  const pagedRows = useMemo(() => (
    visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  ), [page, visibleRows])

  const countByStatus = (status) => registrySites.filter((row) => row.status === status).length
  const onboardingCount = SITE_SCOPE_STATUSES['接入中'].reduce((count, status) => count + countByStatus(status), 0)
  const siteStats = [
    { label: '网站总数', value: registrySites.length, tone: 'indigo', icon: <LineChartOutlined /> },
    { label: '可采集', value: countByStatus('可采集'), tone: 'green', icon: <CheckOutlined /> },
    { label: '接入中', value: onboardingCount, tone: 'amber', icon: <ClockCircleOutlined /> },
    { label: '需处理', value: countByStatus('需处理'), tone: 'red', icon: <WarningOutlined /> },
  ]
  useEffect(() => {
    const identifier = params.get('site')
    if (!identifier) return
    const contextualSite = registrySites.find((site) => site.id === identifier || entryUrlKey(site.entryUrl) === entryUrlKey(identifier))
      || registrySites.find((site) => normalizeHost(site.host) === normalizeHost(identifier))
    if (!contextualSite) return
    const legacyQuery = Object.fromEntries([...params.entries()].filter(([key]) => !['site', 'tab'].includes(key)))
    navigate(getSiteWorkspacePath(contextualSite, params.get('tab') === 'rule' ? 'rule' : 'overview', legacyQuery), { replace: true })
  }, [navigate, params, registrySites])

  const openSite = (row) => {
    navigate(getSiteWorkspacePath(row, 'overview'))
  }

  const openAnalysis = (row) => {
    if (row.analysisEntry) {
      navigate(`/ai?entry=${encodeURIComponent(row.analysisEntry.id)}&site=${encodeURIComponent(row.entryUrl)}`)
      return
    }
    const rule = findRuleForSite(rules, row)
    const result = startSiteAnalysis({
      siteName: row.name,
      siteHost: row.host,
      url: row.entryUrl || rule?.entryUrl || `https://${row.host}`,
      ruleId: rule?.id,
      kind: rule ? 'reanalyze' : 'onboarding',
      folderId: row.folderId || defaultSiteFolderId,
    })
    message.success(result.existing ? '已打开该网站的活动分析任务' : 'AI 分析任务已创建')
    navigate(`/ai?entry=${encodeURIComponent(result.entryId)}&site=${encodeURIComponent(row.entryUrl)}`)
  }

  const workflowAction = (row) => {
    if (row.status === '待分析') return { label: '分析', ariaLabel: `分析 ${row.name}`, onClick: () => openAnalysis(row) }
    if (row.status === '排队中') return { label: '队列', ariaLabel: `查看 ${row.name} 的队列位置`, onClick: () => openAnalysis(row) }
    if (row.status === '分析中') return { label: '进度', ariaLabel: `查看 ${row.name} 的分析进度`, onClick: () => openAnalysis(row) }
    if (row.status === '待审核') return { label: '审核', ariaLabel: `审核 ${row.name} 的分析结果`, onClick: () => openAnalysis(row) }
    if (row.status === '需处理') return { label: '处理', ariaLabel: `处理 ${row.name} 的问题`, className: 'danger', onClick: () => openSite(row) }
    return null
  }

  const managementMenu = (row) => {
    const canReanalyze = !row.analysisEntry && !['待分析', '分析中', '待审核'].includes(row.status)
    return [
      ...(canReanalyze ? [{ key: 'reanalyze', icon: <RobotOutlined />, label: '重新分析', onClick: () => openAnalysis(row) }, { type: 'divider' }] : []),
      { key: 'folder', icon: <FolderOutlined />, label: '移动到文件夹', onClick: () => openMoveToFolder(row) },
    ]
  }

  const openCreateFolder = (parentId = null) => {
    setFolderName('')
    setFolderParentId(parentId || ROOT_FOLDER_VALUE)
    setFolderDialog({ mode: 'create' })
  }

  const openRenameFolder = (folder) => {
    setFolderName(folder.name)
    setFolderParentId(folder.parentId || ROOT_FOLDER_VALUE)
    setFolderDialog({ mode: 'rename', folder })
  }

  const saveFolder = () => {
    const result = folderDialog?.mode === 'rename'
      ? renameSiteFolder(folderDialog.folder.id, folderName)
      : createSiteFolder(folderName, folderParentId === ROOT_FOLDER_VALUE ? null : folderParentId)
    if (!result?.ok) {
      message.warning(result?.reason || '文件夹保存失败')
      return
    }
    setFolderDialog(null)
    setFolderName('')
    if (result.folder) {
      setFolderFilter(result.folder.id)
      setExpandedFolderIds((ids) => [...new Set([...ids, result.folder.parentId, result.folder.id].filter(Boolean))])
    }
    message.success(folderDialog?.mode === 'rename' ? '文件夹已重命名' : '文件夹已创建')
  }

  const confirmDeleteFolder = (folder) => {
    const affectedCount = sites.filter((site) => site.folderId === folder.id).length
    modal.confirm({
      title: `删除文件夹“${folder.name}”？`,
      content: affectedCount
        ? `其中 ${affectedCount} 个网站将移到上级文件夹，子文件夹也会提升一级。网站资产不会被删除。`
        : '子文件夹会提升一级，网站资产不会被删除。',
      okText: '删除文件夹',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        const result = deleteSiteFolder(folder.id)
        if (!result?.ok) {
          message.warning(result?.reason || '文件夹删除失败')
          return
        }
        if (folderFilter === folder.id) setFolderFilter(result.parentId || defaultSiteFolderId)
        setExpandedFolderIds((ids) => ids.filter((id) => id !== folder.id))
        message.success('文件夹已删除')
      },
    })
  }

  const makeDefaultFolder = (folder) => {
    const result = setDefaultSiteFolder(folder.id)
    if (!result?.ok) return message.warning(result?.reason || '默认文件夹设置失败')
    message.success(`“${folder.name}”已设为默认文件夹`)
  }

  const openMoveToFolder = (row) => {
    setMoveTargets([row])
    setMoveFolderId(row.folderId || defaultSiteFolderId)
  }

  const openBatchMoveToFolder = () => {
    if (!selectedSites.length) return
    setMoveTargets(selectedSites)
    const folderIds = new Set(selectedSites.map((site) => site.folderId || defaultSiteFolderId))
    setMoveFolderId(folderIds.size === 1 ? selectedSites[0].folderId || defaultSiteFolderId : defaultSiteFolderId)
  }

  const submitMoveToFolder = () => {
    if (!moveTargets.length) return
    moveSitesToFolder(moveTargets.map((site) => site.id), moveFolderId || defaultSiteFolderId)
    const movedCount = moveTargets.length
    const movedIds = new Set(moveTargets.map((site) => site.id))
    setMoveTargets([])
    setSelectedSiteIds((ids) => ids.filter((id) => !movedIds.has(id)))
    message.success(`${movedCount} 个网站已移动到文件夹`)
  }

  const batchAnalyzeSites = () => {
    if (!selectedSites.length) return
    const result = createSiteAnalysisBatch({
      rows: selectedSites.map((site) => ({
        siteName: site.name,
        siteHost: site.host,
        url: site.entryUrl || `https://${site.host}`,
        folderId: site.folderId || defaultSiteFolderId,
      })),
      folderId: defaultSiteFolderId,
      source: '网站管理批量分析',
    })
    setSelectedSiteIds([])
    if (!result.created) {
      message.info(result.reused ? '所选网站已有活动分析任务' : '所选网站无需重复创建分析任务')
      return
    }
    message.success(`已创建 ${result.created} 个 AI 分析任务，任务将按并发上限排队执行`)
  }

  const batchSetEnabled = (enabled) => {
    const changed = setSitesEnabled(selectedSites.map((site) => site.id), enabled)
    setSelectedSiteIds([])
    message.success(`已${enabled ? '启用' : '停用'} ${changed} 个网站`)
  }

  const resetImport = () => {
    setImportMode('paste')
    setImportText('')
    setImportRows([])
    setImportFileName('')
    setImportLoading(false)
  }

  const openImport = () => {
    resetImport()
    setImportFolderId(siteFolders.some((folder) => folder.id === folderFilter) ? folderFilter : defaultSiteFolderId)
    setImportOpen(true)
  }

  const closeImport = () => {
    setImportOpen(false)
    resetImport()
  }

  const updateImportText = (value) => {
    setImportText(value)
    setImportRows(prepareImportRows(pastedTextToSites(value), sites))
    setImportFileName('')
  }

  const readImportFile = async (file) => {
    setImportLoading(true)
    try {
      let matrix
      if (file.name.toLowerCase().endsWith('.csv')) {
        matrix = Papa.parse((await file.text()).replace(/^\uFEFF/, ''), { skipEmptyLines: true }).data
      } else {
        const module = await import('read-excel-file/browser')
        const readXlsxFile = module.default || module
        matrix = await readXlsxFile(file)
      }
      const rows = prepareImportRows(workbookRowsToSites(matrix), sites)
      setImportRows(rows)
      setImportFileName(file.name)
      if (!rows.length) message.warning('文件中没有可识别的网站数据')
    } catch {
      setImportRows([])
      setImportFileName('')
      message.error('文件解析失败，请检查 CSV 或 XLSX 列格式')
    } finally {
      setImportLoading(false)
    }
    return false
  }

  const submitImport = () => {
    const validRows = importRows.filter((row) => row.valid && !row.duplicateInBatch && !row.alreadyExists)
    if (!validRows.length) {
      message.warning('没有新的入口 URL 可导入')
      return
    }
    const rowsByUrl = new Map()
    validRows.forEach((row) => {
      const normalizedUrl = normalizeEntryUrl(row.url)
      const current = rowsByUrl.get(normalizedUrl)
      rowsByUrl.set(normalizedUrl, {
        ...(current || row),
        name: current?.name || row.name,
        url: current?.url || row.url,
        folderId: importFolderId,
      })
    })
    const result = importSites([...rowsByUrl.values()], importFileName || '网站管理手动导入')
    setImportOpen(false)
    resetImport()
    setScope('全部')
    setPage(1)
    const duplicateCount = importRows.filter((row) => row.valid && row.duplicateInBatch).length
    const summary = [
      `新增 ${result.created} 个`,
      ...((existingImportCount || duplicateCount) ? [`已存在或重复 ${existingImportCount + duplicateCount} 个`] : []),
    ].join('，')
    message.success(`网站导入完成：${summary}；未创建 AI 分析任务`)
  }

  const importColumns = [
    {
      title: '网站名称',
      dataIndex: 'name',
      width: 180,
      render: (value) => value || <span className="site-import-name-pending">待识别网站</span>,
    },
    {
      title: '网站 URL',
      dataIndex: 'url',
      render: (value) => <span className="mono site-import-url">{value || '—'}</span>,
    },
    {
      title: '校验',
      dataIndex: 'valid',
      width: 96,
      render: (value, row) => {
        const label = !value ? '需检查' : row.duplicateInBatch ? '本次重复' : row.alreadyExists ? '已存在' : '可导入'
        const state = !value ? 'invalid' : row.duplicateInBatch || row.alreadyExists ? 'existing' : 'valid'
        return <span className={`site-import-validation ${state}`}>{label}</span>
      },
    },
  ]

  const folderTree = buildSiteFolderTree(siteFolders)
  const folderTreeSelectData = toFolderTreeSelectData(siteFolders)
  const folderParentTreeData = [{
    key: ROOT_FOLDER_VALUE,
    value: ROOT_FOLDER_VALUE,
    title: '根目录',
    children: folderTreeSelectData,
  }]
  const folderCount = (folderId) => {
    const branchIds = getFolderBranchIds(siteFolders, folderId)
    return registrySites.filter((site) => branchIds.has(site.folderId)).length
  }
  const toNavigationTreeData = (folders) => folders.map((folder) => ({
    key: folder.id,
    title: folder.name,
    folder,
    children: toNavigationTreeData(folder.children),
  }))
  const folderNavigationTreeData = toNavigationTreeData(folderTree)

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 90,
      responsive: ['sm'],
      render: (value) => <span className="mono muted">{value}</span>,
    },
    {
      title: '网站',
      dataIndex: 'name',
      width: screens.sm ? 190 : 168,
      render: (_, row) => <SourceCell name={row.name} onClick={() => openSite(row)} ariaLabel={`查看 ${row.name} 概览`} />,
    },
    {
      title: '入口 URL',
      dataIndex: 'entryUrl',
      width: 320,
      responsive: ['sm'],
      render: (value) => <span className="mono table-domain-cell" title={value}>{value}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      responsive: ['sm'],
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: '访问健康',
      dataIndex: 'accessHealth',
      width: 100,
      responsive: ['sm'],
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: '规则版本',
      dataIndex: 'ruleVersion',
      width: 100,
      responsive: ['md'],
      render: (value) => <span className="mono">{value}</span>,
    },
    {
      title: '规则状态',
      dataIndex: 'ruleStatus',
      width: 100,
      responsive: ['md'],
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: '累计数据',
      dataIndex: 'records',
      align: 'right',
      width: 110,
      responsive: ['lg'],
      render: (value) => <span className="mono value-strong">{value}</span>,
    },
    {
      title: '操作',
      align: 'right',
      width: screens.sm ? 96 : 104,
      fixed: screens.sm ? 'right' : undefined,
      render: (_, row) => <RowActions
        className="site-row-actions"
        primary={workflowAction(row)}
        reservePrimary
        moreLabel="更多"
        menu={managementMenu(row)}
      />,
    },
  ]

  const start = visibleRows.length ? (page - 1) * PAGE_SIZE + 1 : 0
  const end = Math.min(page * PAGE_SIZE, visibleRows.length)
  const importableCount = importRows.filter((row) => row.valid && !row.duplicateInBatch && !row.alreadyExists).length
  const existingImportCount = importRows.filter((row) => row.valid && !row.duplicateInBatch && row.alreadyExists).length
  const duplicateImportCount = importRows.filter((row) => row.valid && row.duplicateInBatch).length

  return (
    <div className="page-content sites-page">
      <section className="site-stat-grid" aria-label="网站资产概览">
        {siteStats.map((item) => (
          <div className="site-stat-card" key={item.label}>
            <span className={`site-stat-icon ${item.tone}`}>{item.icon}</span>
            <div>
              <strong className="mono">{item.value}</strong>
              <span>{item.label}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="site-management-workspace">
        <aside className="site-folder-panel" aria-label="网站文件夹">
          <header>
            <strong>文件夹</strong>
            <Tooltip title="新建文件夹">
              <Button type="text" size="small" aria-label="新建网站文件夹" icon={<FolderAddOutlined />} onClick={() => openCreateFolder()} />
            </Tooltip>
          </header>
          <div className="site-folder-list">
            <button type="button" className={folderFilter === 'all' ? 'active' : ''} onClick={() => setFolderFilter('all')}>
              <FolderOpenOutlined /><span>全部网站</span><b>{registrySites.length}</b>
            </button>
            <Tree
              className="site-folder-tree"
              blockNode
              treeData={folderNavigationTreeData}
              selectedKeys={siteFolders.some((folder) => folder.id === folderFilter) ? [folderFilter] : []}
              expandedKeys={expandedFolderIds}
              onExpand={setExpandedFolderIds}
              onSelect={(keys) => keys[0] && setFolderFilter(keys[0])}
              titleRender={({ folder }) => (
                <div className="site-folder-tree-title" title={getFolderPath(siteFolders, folder.id)}>
                  <FolderOutlined />
                  <span className="site-folder-name">{folder.name}</span>
                  {folder.isDefault && <em>默认</em>}
                  <b>{folderCount(folder.id)}</b>
                  <span className="site-folder-tree-more" onClick={(event) => event.stopPropagation()}>
                    <Dropdown
                      trigger={['click']}
                      placement="bottomRight"
                      menu={{ items: [
                        { key: 'child', icon: <FolderAddOutlined />, label: '新建子文件夹', onClick: () => openCreateFolder(folder.id) },
                        { key: 'rename', icon: <EditOutlined />, label: '重命名', onClick: () => openRenameFolder(folder) },
                        { key: 'default', icon: <StarOutlined />, label: '设为默认文件夹', disabled: folder.isDefault, onClick: () => makeDefaultFolder(folder) },
                        { key: 'delete', icon: <DeleteOutlined />, label: '删除文件夹', danger: true, disabled: folder.isDefault, onClick: () => confirmDeleteFolder(folder) },
                      ] }}
                    >
                      <Tooltip title="更多">
                        <Button type="text" size="small" aria-label={`${folder.name} 文件夹操作`} icon={<MoreOutlined />} />
                      </Tooltip>
                    </Dropdown>
                  </span>
                </div>
              )}
            />
          </div>
        </aside>

        <div className="site-list-workspace">
          <div className={`site-toolbar ${selectedSites.length ? 'selection-mode' : ''}`}>
            {selectedSites.length ? (
              <div className="site-selection-toolbar">
                <div className="site-selection-summary">
                  <span className="site-selection-check"><CheckOutlined /></span>
                  <strong>已选择 {selectedSites.length} 个网站</strong>
                  <Button type="link" size="small" onClick={() => setSelectedSiteIds([])}>取消选择</Button>
                </div>
                <div className="site-selection-actions">
                  <Button icon={<FolderOutlined />} onClick={openBatchMoveToFolder}>移动</Button>
                  <Button type="primary" icon={<RobotOutlined />} onClick={batchAnalyzeSites}>AI 分析</Button>
                  <Dropdown
                    trigger={['click']}
                    placement="bottomRight"
                    menu={{ items: [
                      { key: 'enable', icon: <CheckCircleOutlined />, label: '启用网站', onClick: () => batchSetEnabled(true) },
                      { key: 'disable', icon: <StopOutlined />, label: '停用网站', onClick: () => batchSetEnabled(false) },
                    ] }}
                  >
                    <Button icon={<MoreOutlined />}>更多</Button>
                  </Dropdown>
                </div>
              </div>
            ) : (
              <>
                <Segmented
                  className="site-status-filter"
                  value={scope}
                  onChange={setScope}
                  options={Object.keys(SITE_SCOPE_STATUSES)}
                />
                <div className="toolbar-spacer" />
                <Tooltip title="列表视图或卡片视图">
                  <Segmented
                    className="site-view-toggle"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: 'list', icon: <UnorderedListOutlined />, 'aria-label': '列表视图' },
                      { value: 'grid', icon: <AppstoreOutlined />, 'aria-label': '卡片视图' },
                    ]}
                  />
                </Tooltip>
                <Button type="primary" icon={<UploadOutlined />} onClick={openImport}>导入网站</Button>
              </>
            )}
          </div>

      {view === 'list' ? (
        <div className="sites-table-surface">
          <Table
            className="sites-data-table"
            rowKey="id"
            columns={columns}
            dataSource={pagedRows}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: screens.sm ? 1240 : 320 }}
            rowSelection={{
              selectedRowKeys: selectedSiteIds,
              onChange: (keys) => setSelectedSiteIds(keys),
              preserveSelectedRowKeys: true,
              columnWidth: 48,
            }}
          />
        </div>
      ) : (
        <div className="site-grid">
          {pagedRows.map((row) => (
            <article className="site-card" key={row.id}>
              <div className="site-card-head">
                <SourceCell name={row.name} onClick={() => openSite(row)} ariaLabel={`查看 ${row.name} 概览`} />
                <StatusTag value={row.status} />
              </div>
              <div className="site-card-stats">
                <div><span>入口 URL</span><b className="mono" title={row.entryUrl}>{row.entryUrl}</b></div>
                <div><span>访问健康</span><b>{row.accessHealth}</b></div>
                <div><span>规则版本</span><b className="mono">{row.ruleVersion}</b></div>
              </div>
              <div className="site-card-actions">
                {(() => {
                  const action = workflowAction(row)
                  if (!action) return null
                  return <Button className="site-card-primary-action" type={row.status === '需处理' ? 'primary' : 'default'} danger={row.status === '需处理'} icon={<RobotOutlined />} onClick={action.onClick}>{action.label}</Button>
                })()}
                <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: managementMenu(row) }}>
                  <Tooltip title="更多"><Button aria-label="更多" icon={<MoreOutlined />} /></Tooltip>
                </Dropdown>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="site-pagination">
        <span>第 {start}–{end} 项 · 共 {visibleRows.length} 个网站</span>
        <Pagination
          current={page}
          pageSize={PAGE_SIZE}
          total={visibleRows.length}
          showSizeChanger={false}
          hideOnSinglePage
          onChange={setPage}
        />
      </div>
        </div>
      </div>

      <Modal
        className="site-import-modal"
        title="导入网站"
        open={importOpen}
        onCancel={closeImport}
        width={720}
        footer={[
          <Button key="cancel" onClick={closeImport}>取消</Button>,
          <Button key="submit" type="primary" disabled={!importableCount || importLoading} onClick={submitImport}>
            {importableCount ? `导入 ${importableCount} 个网站` : '没有新网站'}
          </Button>,
        ]}
      >
        <Alert
          className="site-import-note"
          type="info"
          showIcon
          title="仅导入网站资产，不会创建 AI 分析任务"
          description="未填写网站名称时保留为“待识别网站”，不会使用域名代替名称。"
        />
        <label className="site-import-folder">
          <span>导入到文件夹</span>
          <FolderTreeSelect
            folders={siteFolders}
            createFolder={createSiteFolder}
            value={importFolderId || defaultSiteFolderId}
            treeData={folderTreeSelectData}
            treeDefaultExpandAll
            showSearch
            treeNodeFilterProp="title"
            onChange={setImportFolderId}
          />
        </label>
        <Segmented
          block
          className="site-import-mode"
          value={importMode}
          options={[{ value: 'paste', label: '粘贴导入' }, { value: 'file', label: '文件导入' }]}
          onChange={(value) => {
            setImportMode(value)
            setImportRows(value === 'paste' ? prepareImportRows(pastedTextToSites(importText), sites) : [])
            setImportFileName('')
          }}
        />
        {importMode === 'paste' ? (
          <div className="site-import-paste">
            <Input.TextArea
              value={importText}
              onChange={(event) => updateImportText(event.target.value)}
              placeholder={'每行一个 URL，也可填写“网站名称,URL”\nhttps://example.com/notices\n示例采购网,https://procurement.example.com/list'}
              autoSize={{ minRows: 6, maxRows: 10 }}
              spellCheck={false}
            />
            <span>每个规范化入口 URL 对应一个网站资产；同域名的不同路径会分别保留。</span>
          </div>
        ) : (
          <Upload.Dragger
            className="site-import-upload"
            accept=".csv,.xlsx"
            maxCount={1}
            showUploadList={false}
            beforeUpload={readImportFile}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">{importLoading ? '正在解析文件' : importFileName || '选择 CSV 或 XLSX 文件'}</p>
            <p className="ant-upload-hint">列：网站名称、网站 URL，采集频率可选</p>
          </Upload.Dragger>
        )}
        {importRows.length > 0 && (
          <section className="site-import-preview">
            <header>
              <strong>导入预览</strong>
              <span>{importableCount} 个可导入{existingImportCount ? ` · ${existingImportCount} 个已存在` : ''}{duplicateImportCount ? ` · ${duplicateImportCount} 个本次重复` : ''}</span>
            </header>
            <Table rowKey="key" size="small" columns={importColumns} dataSource={importRows.slice(0, 8)} pagination={false} scroll={{ x: 620 }} />
          </section>
        )}
      </Modal>

      <Modal
        title={folderDialog?.mode === 'rename' ? '重命名文件夹' : '新建文件夹'}
        open={Boolean(folderDialog)}
        onCancel={() => setFolderDialog(null)}
        onOk={saveFolder}
        okText={folderDialog?.mode === 'rename' ? '保存' : '创建'}
        width={420}
      >
        <div className="site-folder-dialog-fields">
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
          {folderDialog?.mode === 'create' && (
            <label>
              <span>上级文件夹</span>
              <TreeSelect
                value={folderParentId}
                treeData={folderParentTreeData}
                treeDefaultExpandAll
                showSearch
                treeNodeFilterProp="title"
                onChange={setFolderParentId}
              />
            </label>
          )}
        </div>
      </Modal>

      <Modal
        title={moveTargets.length === 1 ? `移动 ${moveTargets[0].name}` : `移动 ${moveTargets.length} 个网站`}
        open={moveTargets.length > 0}
        onCancel={() => setMoveTargets([])}
        onOk={submitMoveToFolder}
        okText="移动"
        width={440}
      >
        <label className="site-move-folder-field">
          <span>目标文件夹</span>
          <FolderTreeSelect
            folders={siteFolders}
            createFolder={createSiteFolder}
            value={moveFolderId || defaultSiteFolderId}
            treeData={folderTreeSelectData}
            treeDefaultExpandAll
            showSearch
            treeNodeFilterProp="title"
            onChange={setMoveFolderId}
          />
        </label>
      </Modal>

    </div>
  )
}
