import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  initialCapabilities,
  initialArticles,
  initialExecutions,
  initialIntakeBatches,
  initialRules,
  initialTasks,
  initialUsers,
} from '../mock/domainData'
import { siteRows as initialSites } from '../data'

const PrototypeContext = createContext(null)
const STORAGE_PREFIX = 'collector.v2.'
let analysisSequence = 0

function nextAnalysisId(prefix) {
  analysisSequence = (analysisSequence + 1) % 100
  return `${prefix}-${Date.now() * 100 + analysisSequence}`
}

function validateRuleCandidate(rule) {
  const candidate = rule.yaml.trim()
  const published = rule.publishedYaml?.trim()
  if (!rule.candidateVersion) return { passed: false, passedCount: 0, total: 20, reason: '请先保存候选版本' }
  if (published && candidate === published) return { passed: false, passedCount: 0, total: 20, reason: '候选内容与当前发布版本完全一致' }

  const requiredSections = ['entry_url:', 'list:', 'detail:', 'title:', 'content:']
  const missing = requiredSections.filter((section) => !candidate.includes(section))
  if (missing.length) return { passed: false, passedCount: 12, total: 20, reason: `缺少必要配置：${missing.join('、')}` }
  if (candidate.includes('div.m_list div.item')) return { passed: false, passedCount: 18, total: 20, reason: 'Golden Sample 中仍有 2 个页面无法匹配旧列表选择器' }
  return { passed: true, passedCount: 20, total: 20, reason: '结构、字段与质量门禁全部通过' }
}

function stripReleaseCandidate(version) {
  return version.replace(/-rc\.\d+$/, '')
}

function nextCandidateVersion(version) {
  const clean = stripReleaseCandidate(version).replace(/^v/, '')
  const parts = clean.split('.').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return `${version}-rc.1`
  return `v${parts[0]}.${parts[1]}.${parts[2] + 1}-rc.1`
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function createExecutionArticles(execution) {
  const collectedAt = formatTimestamp()
  const publishTime = new Date().toISOString().slice(0, 10)
  const titles = ['采购项目公开招标公告', '信息化服务项目竞争性磋商公告', '工程建设项目资格预审公告']
  return titles.map((title, index) => ({
    id: `AR-${execution.id.replace('EX-', '')}-${index + 1}`,
    title: `${execution.site}${title}`,
    site: execution.site,
    publishTime,
    collectedAt,
    quality: '通过',
    executionId: execution.id,
    ruleId: execution.ruleId,
    url: `${execution.url}${execution.url.includes('?') ? '&' : '?'}prototype_article=${index + 1}`,
    rawType: 'html',
    rawContent: `<article class="notice-detail"><h1>${execution.site}${title}</h1><time datetime="${publishTime}">${publishTime}</time><div class="content">本条原文由 ${execution.task} 采集，已通过标题、正文长度、发布时间和重复性检查。</div></article>`,
    content: `本条原文由 ${execution.task} 采集，已通过标题、正文长度、发布时间和重复性检查。`,
  }))
}

function deriveBatchStatus(urls) {
  if (urls.some((row) => row.status === '分析中')) return '分析中'
  if (urls.every((row) => row.status === '已通过')) return '已完成'
  if (urls.every((row) => ['审核完成', '已通过'].includes(row.status))) return '待发布'
  return '需处理'
}

function getUrlHost(url) {
  try {
    return normalizeHost(new URL(url).host)
  } catch {
    return ''
  }
}

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '')
}

function isAnalysisEntryActive(entry) {
  const pendingRelease = ['candidate', 'validation_failed', 'ready_to_publish'].includes(entry.releasePhase)
  return pendingRelease || !['审核完成', '已通过', '已完成', '已取消'].includes(entry.status)
}

function buildRuleYaml(config, siteName, entryUrl) {
  const scalar = (value) => JSON.stringify(String(value || ''))
  const fields = config.fields || {}
  const list = config.list || {}
  const request = config.request || {}
  const dedup = Array.isArray(config.dedup) && config.dedup.length ? config.dedup : ['url', 'title']

  return [
    `name: ${scalar(`${siteName}采集规则`)}`,
    `entry_url: ${scalar(entryUrl)}`,
    `strategy: ${scalar(config.strategy || 'html')}`,
    'list:',
    `  item: ${scalar(list.container)}`,
    `  link: ${scalar(fields.url)}`,
    ...(list.next_page ? [`  next_page: ${scalar(list.next_page)}`] : []),
    'detail:',
    `  title: ${scalar(fields.title)}`,
    `  content: ${scalar(fields.content || 'article, main .content::html')}`,
    `  publish_time: ${scalar(fields.pub_date || 'time::text')}`,
    'request:',
    `  method: ${scalar(request.method || 'GET')}`,
    `  interval_ms: ${Number(request.interval_ms) || 1500}`,
    `  timeout_ms: ${Number(request.timeout_ms) || 30000}`,
    `dedup: ${JSON.stringify(dedup)}`,
    'quality:',
    '  min_content_length: 160',
  ].join('\n')
}

function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const cached = window.localStorage.getItem(key)
      return cached ? JSON.parse(cached) : initialValue
    } catch {
      return initialValue
    }
  })

  const update = (nextValue) => {
    setValue((current) => {
      const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue
      window.localStorage.setItem(key, JSON.stringify(resolved))
      return resolved
    })
  }

  return [value, update]
}

export function PrototypeProvider({ children }) {
  const [rules, setRules] = usePersistentState(`${STORAGE_PREFIX}rules`, initialRules)
  const [tasks, setTasks] = usePersistentState(`${STORAGE_PREFIX}tasks`, initialTasks)
  const [executions, setExecutions] = usePersistentState(`${STORAGE_PREFIX}executions`, initialExecutions)
  const [articles, setArticles] = usePersistentState(`${STORAGE_PREFIX}articles`, initialArticles)
  const [intakeBatches, setIntakeBatches] = usePersistentState(`${STORAGE_PREFIX}intake`, initialIntakeBatches)
  const [sites, setSites] = usePersistentState(`${STORAGE_PREFIX}sites`, initialSites)
  const [capabilities, setCapabilities] = usePersistentState(`${STORAGE_PREFIX}capabilities`, initialCapabilities)
  const [users, setUsers] = usePersistentState(`${STORAGE_PREFIX}users`, initialUsers)
  const [auditEvents, setAuditEvents] = usePersistentState(`${STORAGE_PREFIX}audit`, [])
  const [notificationCount, setNotificationCount] = useState(3)

  useEffect(() => {
    if (!tasks.some((task) => !task.bootstrapStatus)) return
    setTasks((items) => items.map((task) => {
      if (task.bootstrapStatus) return task
      const seededTask = initialTasks.find((item) => item.id === task.id)
      const bootstrapExecution = executions.find((execution) => execution.taskId === task.id && execution.isBootstrap)
      const bootstrapStatus = seededTask?.bootstrapStatus
        || (bootstrapExecution ? (bootstrapExecution.status === '成功' ? '已完成' : ['运行中', '重试中'].includes(bootstrapExecution.status) ? '进行中' : '待开始') : '待开始')
      return {
        ...task,
        initialScope: seededTask?.initialScope || task.initialScope || '全量',
        initialDays: seededTask?.initialDays || task.initialDays || 30,
        bootstrapStatus,
        continuousEnabled: seededTask?.continuousEnabled ?? task.continuousEnabled ?? task.executionMode !== '单次',
      }
    }))
  }, [tasks, executions])

  const recordAudit = (action, object) => {
    const event = {
      id: `AU-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
      action,
      object,
      operator: 'qidev_qi',
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    setAuditEvents((items) => [event, ...items].slice(0, 30))
    setNotificationCount((count) => count + 1)
  }

  const updateBatchUrl = (batchId, urlId, patch) => {
    setIntakeBatches((batches) => batches.map((batch) => (
      batch.id === batchId
        ? (() => {
          const urls = batch.urls.map((row) => row.id === urlId ? { ...row, ...patch } : row)
          return { ...batch, status: deriveBatchStatus(urls), urls, updatedAt: '刚刚' }
        })()
        : batch
    )))
    recordAudit('更新 AI 分析结果', `${batchId}/${urlId}`)
  }

  const approveBatchUrl = (batchId, urlId, approvedConfigText) => {
    const currentEntry = intakeBatches.find((batch) => batch.id === batchId)?.urls.find((row) => row.id === urlId)
    if (!currentEntry) return { ok: false, reason: '分析任务不存在，请重新加载后再试' }
    if (!['待审核', '待确认归属'].includes(currentEntry.status)) {
      return { ok: false, reason: currentEntry.status === '分析中' ? 'AI 分析尚未完成' : '请先完成订正并重新分析' }
    }

    let approvedConfig
    try {
      approvedConfig = JSON.parse(approvedConfigText)
    } catch {
      return { ok: false, reason: '采集配置不是有效的 JSON，请完成订正后再审核' }
    }
    const missingConfig = [
      ['列表容器', approvedConfig?.list?.container],
      ['标题字段', approvedConfig?.fields?.title],
      ['详情链接字段', approvedConfig?.fields?.url],
    ].filter(([, value]) => !String(value || '').trim()).map(([label]) => label)
    if (missingConfig.length) return { ok: false, reason: `采集配置缺少：${missingConfig.join('、')}` }

    const host = getUrlHost(currentEntry.url)
    const existingRule = rules.find((rule) => rule.id === currentEntry.ruleId)
    const nextRuleNumber = Math.max(...rules.map((rule) => Number(rule.id.replace('RP-', ''))), 0) + 1
    const ruleId = existingRule?.id || `RP-${String(nextRuleNumber).padStart(4, '0')}`
    const siteName = currentEntry.site || '待识别网站'
    const baseRule = existingRule || {
      id: ruleId,
      name: `${siteName}采集规则`,
      site: siteName,
      siteHost: host,
      entryUrl: currentEntry.url,
      version: 'v0.0.0',
      candidateVersion: 'v0.1.0-rc.1',
      yaml: `name: ${siteName}采集规则\nentry_url: ${currentEntry.url}\nstrategy: html\nlist:\n  item: article.notice-item\n  link: a::attr(href)\ndetail:\n  title: h1::text\n  content: main article::html\nquality:\n  min_content_length: 160`,
    }
    const analyzedYaml = `${buildRuleYaml(approvedConfig, siteName, currentEntry.url)}\nai_revision:\n  source: ${currentEntry.analysisKind === 'diagnose' ? 'site_diagnosis' : currentEntry.analysisKind === 'onboarding' ? 'site_onboarding' : 'site_analysis'}\n  approved_at: "${formatTimestamp()}"`
    const candidateVersion = existingRule?.candidateVersion || nextCandidateVersion(baseRule.version)
    const candidateRule = {
      ...baseRule,
      id: ruleId,
      site: siteName,
      siteHost: host,
      entryUrl: currentEntry.url,
      yaml: analyzedYaml,
      publishedYaml: existingRule?.publishedYaml || (existingRule?.status === '已发布' ? existingRule.yaml : ''),
      status: '候选版本',
      candidateVersion,
      regression: 'pending',
      regressionMessage: '',
      health: '待回归',
      repairSource: currentEntry.analysisKind || (existingRule ? 'reanalyze' : 'onboarding'),
      updatedAt: '刚刚',
    }
    const validation = validateRuleCandidate(candidateRule)
    if (!validation.passed) {
      setIntakeBatches((batches) => batches.map((batch) => {
        if (batch.id !== batchId) return batch
        const urls = batch.urls.map((row) => row.id === urlId ? {
          ...row,
          status: '验证失败',
          issue: validation.reason,
          aiRegression: 'failed',
          regressionPassed: validation.passedCount,
          regressionTotal: validation.total,
        } : row)
        return { ...batch, status: deriveBatchStatus(urls), urls, updatedAt: '刚刚' }
      }))
      recordAudit('AI 自动回归未通过', `${ruleId}/${validation.reason}`)
      return { ok: false, reason: `AI 自动回归未通过：${validation.reason}` }
    }

    const version = stripReleaseCandidate(candidateVersion)
    const syncedTasks = tasks.filter((task) => task.ruleId === ruleId && task.versionPolicy === '跟随最新发布').length
    const boundTasks = tasks.filter((task) => task.ruleId === ruleId || task.site === siteName)
    const publishedRule = {
      ...candidateRule,
      status: '已发布',
      version,
      candidateVersion: '',
      publishedYaml: analyzedYaml,
      regression: 'passed',
      regressionPassed: validation.passedCount,
      regressionTotal: validation.total,
      regressionMessage: 'AI 生成后自动回归通过，人工审核发布',
      health: '健康',
      repairSource: '',
    }

    setIntakeBatches((batches) => batches.map((batch) => {
      if (batch.id !== batchId) return batch
      const urls = batch.urls.map((row) => row.id === urlId ? {
        ...row,
        ruleId,
        site: siteName,
        status: '已通过',
        judgment: '已归属',
        samples: 5,
        issue: '',
        approvedConfig: approvedConfigText,
        aiRegression: 'passed',
        regressionPassed: validation.passedCount,
        regressionTotal: validation.total,
        releasePhase: 'published',
        releaseVersion: version,
        releaseError: '',
      } : row)
      return { ...batch, status: deriveBatchStatus(urls), urls, updatedAt: '刚刚' }
    }))
    setRules((items) => existingRule
      ? items.map((rule) => rule.id === ruleId ? publishedRule : rule)
      : [publishedRule, ...items])
    setTasks((items) => items.map((task) => task.ruleId === ruleId && task.versionPolicy === '跟随最新发布'
      ? { ...task, ruleVersion: version, status: '启用' }
      : task))
    setSites((items) => items.map((site) => normalizeHost(site.host) === host && !['已停用', '已暂停'].includes(site.status)
      ? {
        ...site,
        status: boundTasks.length ? '已完成' : '待配置',
        entryUrl: currentEntry.url,
        freq: boundTasks[0]?.frequency || site.freq || '待配置',
      }
      : site))
    recordAudit('审核并发布 AI 采集规则', `${ruleId}/${version}`)
    return { ok: true, ruleId, version, syncedTasks, boundTasks: boundTasks.length }
  }

  const importSites = (rows, source = '网站管理') => {
    const nextSites = [...sites]
    let nextNumber = Math.max(...nextSites.map((site) => Number(String(site.id || '').replace('WS-', '')) || 0), 0) + 1
    let created = 0
    let updated = 0
    let skipped = 0
    const siteIds = []

    rows.forEach((row) => {
      let parsedUrl
      try {
        parsedUrl = new URL(String(row.url || '').trim())
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('unsupported protocol')
      } catch {
        skipped += 1
        return
      }

      const host = normalizeHost(parsedUrl.host)
      const entryUrl = parsedUrl.toString()
      const existingIndex = nextSites.findIndex((site) => normalizeHost(site.host) === host)
      if (existingIndex >= 0) {
        const existing = nextSites[existingIndex]
        const importedName = String(row.name || '').trim()
        const existingName = String(existing.name || '').trim()
        nextSites[existingIndex] = {
          ...existing,
          name: importedName || (existingName && normalizeHost(existingName) !== host ? existingName : '待识别网站'),
          host,
          entryUrl,
          entryUrls: [...new Set([...(existing.entryUrls || [existing.entryUrl].filter(Boolean)), entryUrl])],
          freq: String(row.freq || '').trim() || existing.freq || '待配置',
          importedAt: formatTimestamp(),
          importSource: source,
        }
        siteIds.push(existing.id)
        updated += 1
        return
      }

      const id = `WS-${String(nextNumber).padStart(3, '0')}`
      nextNumber += 1
      nextSites.unshift({
        key: `SITE-${Date.now()}-${created}`,
        id,
        name: String(row.name || '').trim() || '待识别网站',
        host,
        entryUrl,
        entryUrls: [entryUrl],
        status: '待分析',
        records: '—',
        freq: String(row.freq || '').trim() || '待配置',
        last: '—',
        importedAt: formatTimestamp(),
        importSource: source,
      })
      siteIds.push(id)
      created += 1
    })

    if (created || updated) {
      setSites(nextSites)
      recordAudit('导入网站资产', `${created} 新增/${updated} 更新/${skipped} 跳过`)
    }
    return { created, updated, skipped, siteIds }
  }

  const startSiteAnalysis = ({ siteName, siteHost, url, ruleId, kind = 'reanalyze', failureId = '', sourceExecutionId = '' }) => {
    const normalizedHost = normalizeHost(siteHost || getUrlHost(url))
    const existing = intakeBatches.flatMap((batch) => batch.urls.map((entry) => ({ ...entry, batchId: batch.id })))
      .find((entry) => normalizeHost(entry.siteHost || getUrlHost(entry.url)) === normalizedHost && isAnalysisEntryActive(entry))
    if (existing) {
      if (kind === 'diagnose') {
        const shouldConvert = existing.analysisKind !== 'diagnose'
        const readyAt = Date.now() + 1400
        setIntakeBatches((batches) => batches.map((batch) => batch.id === existing.batchId ? {
          ...batch,
          ...(shouldConvert ? { name: `${siteName}异常诊断`, status: '分析中', readyAt } : {}),
          updatedAt: '刚刚',
          urls: batch.urls.map((entry) => entry.id === existing.id ? {
            ...entry,
            ...(shouldConvert ? {
              site: siteName,
              siteHost: normalizedHost,
              url,
              source: '失败队列',
              judgment: '识别中',
              confidence: 0,
              ruleId: ruleId || entry.ruleId || '',
              samples: 0,
              status: '分析中',
              issue: '',
              releasePhase: '',
              releaseVersion: '',
              releaseError: '',
            } : {}),
            analysisKind: 'diagnose',
            failureId: failureId || entry.failureId || '',
            sourceExecutionId: sourceExecutionId || entry.sourceExecutionId || '',
          } : entry),
        } : batch))
        if (shouldConvert) recordAudit('复用活动 AI 任务进行失败诊断', `${normalizedHost}/${ruleId || existing.ruleId || 'new-rule'}`)
      }
      return { batchId: existing.batchId, entryId: existing.id, existing: true }
    }

    const targetRuleId = ruleId || ''

    const entryId = nextAnalysisId('URL')
    const batchId = nextAnalysisId('IB')
    const batch = {
      id: batchId,
      name: kind === 'diagnose' ? `${siteName}异常诊断` : kind === 'onboarding' ? `${siteName}首次接入分析` : `${siteName}规则重新分析`,
      status: '分析中',
      createdAt: Date.now(),
      updatedAt: '刚刚',
      readyAt: Date.now() + 1400,
      urls: [{
        id: entryId,
        site: siteName,
        siteHost: normalizedHost,
        url,
        source: kind === 'diagnose' ? '失败队列' : '网站管理',
        judgment: '识别中',
        confidence: 0,
        ruleId: targetRuleId,
        samples: 0,
        status: '分析中',
        issue: '',
        analysisKind: kind,
        failureId,
        sourceExecutionId,
      }],
    }
    setIntakeBatches((items) => [batch, ...items])
    setSites((items) => items.map((site) => normalizeHost(site.host) === normalizedHost && site.status !== '异常'
      ? { ...site, status: '分析中', entryUrl: url }
      : site))
    recordAudit(kind === 'diagnose' ? '发起网站 AI 诊断' : kind === 'onboarding' ? '创建网站 AI 分析任务' : '发起网站 AI 重新分析', `${normalizedHost}/${targetRuleId || 'new-rule'}`)
    return { batchId, entryId }
  }

  const updateRule = (ruleId, patch) => {
    setRules((items) => items.map((rule) => rule.id === ruleId ? { ...rule, ...patch, updatedAt: '刚刚' } : rule))
    recordAudit('更新规则', ruleId)
  }

  const runRegression = (ruleId) => {
    const rule = rules.find((item) => item.id === ruleId)
    if (!rule) return { passed: false, passedCount: 0, total: 20, reason: '规则不存在' }
    const result = validateRuleCandidate(rule)
    setRules((items) => items.map((item) => item.id === ruleId ? {
      ...item,
      regression: result.passed ? 'passed' : 'failed',
      regressionPassed: result.passedCount,
      regressionTotal: result.total,
      regressionMessage: result.reason,
      health: result.passed ? '回归通过' : '回归失败',
      updatedAt: '刚刚',
    } : item))
    recordAudit(result.passed ? '规则回归通过' : '规则回归失败', `${ruleId}/${result.passedCount}/${result.total}`)
    return result
  }

  const publishRule = (ruleId) => {
    const rule = rules.find((item) => item.id === ruleId)
    if (!rule || !rule.candidateVersion || rule.regression !== 'passed') return false
    const nextVersion = stripReleaseCandidate(rule.candidateVersion || rule.version)
    const syncedTasks = tasks.filter((task) => task.ruleId === ruleId && task.versionPolicy === '跟随最新发布').length
    const boundTasks = tasks.filter((task) => task.ruleId === ruleId || task.site === rule.site)
    setRules((items) => items.map((item) => item.id === ruleId ? { ...item, status: '已发布', version: nextVersion, candidateVersion: '', publishedYaml: item.yaml, health: '健康', repairSource: '', updatedAt: '刚刚' } : item))
    setTasks((items) => items.map((task) => task.ruleId === ruleId && task.versionPolicy === '跟随最新发布' ? { ...task, ruleVersion: nextVersion, status: '启用' } : task))
    setSites((items) => items.map((site) => normalizeHost(site.host) === normalizeHost(rule.siteHost) && !['已停用', '已暂停'].includes(site.status)
      ? {
        ...site,
        status: boundTasks.length ? '已完成' : '待配置',
        entryUrl: rule.entryUrl || site.entryUrl,
        freq: boundTasks[0]?.frequency || site.freq || '待配置',
      }
      : site))
    recordAudit('发布规则版本', `${ruleId}/${nextVersion}`)
    return { version: nextVersion, syncedTasks, boundTasks: boundTasks.length }
  }

  const validateAndPublishRule = (ruleId) => {
    const rule = rules.find((item) => item.id === ruleId)
    if (!rule) return { ok: false, reason: '规则不存在' }

    const validation = validateRuleCandidate(rule)
    if (!validation.passed) {
      setRules((items) => items.map((item) => item.id === ruleId ? {
        ...item,
        regression: 'failed',
        regressionPassed: validation.passedCount,
        regressionTotal: validation.total,
        regressionMessage: validation.reason,
        health: '回归失败',
        updatedAt: '刚刚',
      } : item))
      recordAudit('规则验证发布失败', `${ruleId}/${validation.reason}`)
      return { ok: false, ...validation }
    }

    const nextVersion = stripReleaseCandidate(rule.candidateVersion || rule.version)
    const syncedTasks = tasks.filter((task) => task.ruleId === ruleId && task.versionPolicy === '跟随最新发布').length
    setRules((items) => items.map((item) => item.id === ruleId ? {
      ...item,
      status: '已发布',
      version: nextVersion,
      candidateVersion: '',
      publishedYaml: item.yaml,
      regression: 'passed',
      regressionPassed: validation.passedCount,
      regressionTotal: validation.total,
      regressionMessage: validation.reason,
      health: '健康',
      repairSource: '',
      updatedAt: '刚刚',
    } : item))
    setTasks((items) => items.map((task) => task.ruleId === ruleId && task.versionPolicy === '跟随最新发布'
      ? { ...task, ruleVersion: nextVersion, status: '启用' }
      : task))
    if (rule.repairSource === 'diagnose') {
      setSites((items) => items.map((site) => normalizeHost(site.host) === normalizeHost(rule.siteHost) && site.status === '异常'
        ? { ...site, status: '已完成' }
        : site))
    }
    recordAudit('验证并发布规则版本', `${ruleId}/${nextVersion}/${validation.passedCount}`)
    return { ok: true, version: nextVersion, syncedTasks, ...validation }
  }

  const saveTask = (taskId, patch) => {
    setTasks((items) => items.map((task) => task.id === taskId ? { ...task, ...patch } : task))
    recordAudit('保存采集计划', taskId)
  }

  const createTask = (task) => {
    const nextNumber = Math.max(...tasks.map((item) => Number(item.id.replace('TK-', ''))), 0) + 1
    const nextTask = { ...task, id: `TK-${String(nextNumber).padStart(3, '0')}` }
    setTasks((items) => [nextTask, ...items])
    recordAudit('创建采集计划', nextTask.id)
    return nextTask.id
  }

  const saveUser = (user) => {
    if (user.id) {
      setUsers((items) => items.map((item) => item.id === user.id ? { ...item, ...user } : item))
      recordAudit('更新平台用户', user.id)
      return user
    }

    const nextNumber = Math.max(...users.map((item) => Number(item.id.replace('U-', ''))), 0) + 1
    const nextUser = { ...user, id: `U-${String(nextNumber).padStart(3, '0')}`, lastLogin: '-' }
    setUsers((items) => [...items, nextUser])
    recordAudit('添加平台用户', nextUser.id)
    return nextUser
  }

  const runTask = (taskId, retryOf = '', overrides = {}) => {
    const storedTask = tasks.find((item) => item.id === taskId)
    const task = storedTask ? { ...storedTask, ...overrides } : null
    if (!task || task.status !== '启用') return null
    const rule = rules.find((item) => item.id === task.ruleId)
    const retrySource = retryOf ? executions.find((item) => item.id === retryOf) : null
    const collectionMode = task.collectionMode || task.scope || '增量'
    const collectionType = retrySource?.collectionType || (collectionMode === '全量' ? '全量采集' : '定时增量')
    const nextNumber = Math.max(...executions.map((item) => Number(item.id.replace('EX-', ''))), 0) + 1
    const execution = {
      id: `EX-${nextNumber}`,
      taskId: task.id,
      task: task.name,
      site: task.site,
      url: rule?.entryUrl || '-',
      ruleId: task.ruleId,
      ruleVersion: task.ruleVersion,
      status: retryOf ? '重试中' : '运行中',
      discovered: 0,
      articles: 0,
      finishedAt: '-',
      duration: '0m00s',
      issue: '',
      stage: '',
      retryOf,
      isBootstrap: false,
      collectionMode,
      collectionType,
      readyAt: Date.now() + 1800,
      logs: [`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${collectionType}已进入执行队列`],
    }
    setExecutions((items) => [execution, ...items])
    recordAudit(retryOf ? '重试采集执行' : '立即执行采集计划', execution.id)
    return execution.id
  }

  const saveCapabilityCandidate = (capabilityId, document) => {
    const capability = capabilities.find((item) => item.id === capabilityId)
    if (!capability || !document.trim()) return { ok: false, reason: 'SKILL.md 不能为空' }
    const published = capability.publishedDocument || capability.document
    if (document.trim() === published.trim()) return { ok: false, reason: '候选内容与当前发布版本完全一致' }
    const version = capability.status === '候选版本' ? capability.version : nextCandidateVersion(capability.version)
    const normalizedDocument = document.replace(/^version:\s*.+$/m, `version: ${version.replace(/^v/, '')}`)
    setCapabilities((items) => items.map((item) => item.id === capabilityId ? {
      ...item,
      document: normalizedDocument,
      publishedDocument: published,
      version,
      status: '候选版本',
      regression: 'pending',
      goldenPassed: 0,
      updatedAt: '刚刚',
    } : item))
    recordAudit('保存 Skill 候选版本', `${capabilityId}/${version}`)
    return { ok: true, version }
  }

  const runCapabilityRegression = (capabilityId) => {
    const capability = capabilities.find((item) => item.id === capabilityId)
    if (!capability || capability.status !== '候选版本') return { passed: false, passedCount: 0, total: 20, reason: '当前没有候选版本' }
    const required = ['name:', 'version:', '## 输入契约', '## 输出契约', '## 发布门禁']
    const missing = required.filter((section) => !capability.document.includes(section))
    const result = missing.length
      ? { passed: false, passedCount: 14, total: 20, reason: `SKILL.md 缺少：${missing.join('、')}` }
      : { passed: true, passedCount: 20, total: 20, reason: 'Golden Samples 全部通过' }
    setCapabilities((items) => items.map((item) => item.id === capabilityId ? {
      ...item,
      regression: result.passed ? 'passed' : 'failed',
      goldenPassed: result.passedCount,
      goldenTotal: result.total,
      regressionMessage: result.reason,
      successRate: result.passed ? '100%' : `${Math.round((result.passedCount / result.total) * 100)}%`,
      updatedAt: '刚刚',
    } : item))
    recordAudit(result.passed ? 'Skill 回归通过' : 'Skill 回归失败', `${capabilityId}/${result.passedCount}/${result.total}`)
    return result
  }

  const publishCapability = (capabilityId) => {
    const capability = capabilities.find((item) => item.id === capabilityId)
    if (!capability || capability.status !== '候选版本' || capability.regression !== 'passed') return false
    const version = stripReleaseCandidate(capability.version)
    const releasedDocument = capability.document.replace(/^version:\s*.+$/m, `version: ${version.replace(/^v/, '')}`)
    const historyItem = { version, status: '已发布', time: formatTimestamp(), operator: 'qidev_qi' }
    setCapabilities((items) => items.map((item) => item.id === capabilityId ? {
      ...item,
      version,
      status: '已发布',
      document: releasedDocument,
      publishedDocument: releasedDocument,
      history: [historyItem, ...(item.history || [])],
      updatedAt: '刚刚',
    } : item))
    recordAudit('发布 Skill 版本', `${capabilityId}/${version}`)
    return { version }
  }

  const resolveArticleQuality = (articleId, quality) => {
    setArticles((items) => items.map((article) => article.id === articleId ? { ...article, quality } : article))
    recordAudit('处理原文质量', articleId)
  }

  const resetPrototype = () => {
    setRules(initialRules)
    setTasks(initialTasks)
    setExecutions(initialExecutions)
    setArticles(initialArticles)
    setIntakeBatches(initialIntakeBatches)
    setSites(initialSites)
    setCapabilities(initialCapabilities)
    setUsers(initialUsers)
    setAuditEvents([])
    setNotificationCount(3)
  }

  useEffect(() => {
    const managedSites = sites.filter((site) => !['待分析', '分析中'].includes(site.status) || tasks.some((task) => task.site === site.name))
    const missingSites = managedSites.filter((site) => !rules.some((rule) => normalizeHost(rule.siteHost) === normalizeHost(site.host)))
    if (!missingSites.length) return
    const firstRuleNumber = Math.max(...rules.map((rule) => Number(rule.id.replace('RP-', ''))), 0) + 1
    const generatedRules = missingSites.map((site, index) => {
      const id = `RP-${String(firstRuleNumber + index).padStart(4, '0')}`
      const relatedTask = tasks.find((task) => task.site === site.name)
      const relatedExecution = executions.find((execution) => execution.site === site.name)
      const entryUrl = site.entryUrl || relatedExecution?.url || `https://${normalizeHost(site.host)}`
      const yaml = `name: ${site.name}采集规则\nentry_url: ${entryUrl}\nstrategy: html\nlist:\n  item: article.notice-item, ul.notice-list > li\n  link: a::attr(href)\ndetail:\n  title: h1::text\n  content: article, main .content::html\n  publish_time: time::text\nquality:\n  min_content_length: 160`
      return {
        id,
        name: `${site.name}采集规则`,
        site: site.name,
        siteHost: normalizeHost(site.host),
        entryUrl,
        status: site.status === '异常' ? '需修复' : '已发布',
        version: relatedTask?.ruleVersion || 'v1.0.0',
        candidateVersion: '',
        regression: site.status === '异常' ? 'failed' : 'passed',
        health: site.status === '异常' ? '列表 0 行' : '健康',
        updatedAt: '已接入',
        yaml,
        publishedYaml: yaml,
      }
    })
    setRules((items) => [...items, ...generatedRules])
  }, [executions, rules, sites, tasks])

  useEffect(() => {
    const nextTasks = tasks.map((task) => {
      const site = sites.find((item) => item.name === task.site)
      const siteRule = site && rules.find((rule) => normalizeHost(rule.siteHost) === normalizeHost(site.host))
      if (!siteRule || task.ruleId === siteRule.id) return task
      return { ...task, ruleId: siteRule.id, ruleVersion: siteRule.version }
    })
    if (nextTasks.some((task, index) => task !== tasks[index])) setTasks(nextTasks)
  }, [rules, sites, tasks])

  useEffect(() => {
    const pending = executions.filter((execution) => ['运行中', '重试中'].includes(execution.status) && execution.readyAt)
    if (!pending.length) return undefined
    const delay = Math.max(0, Math.min(...pending.map((execution) => execution.readyAt)) - Date.now())
    const timer = window.setTimeout(() => {
      const due = pending.filter((execution) => execution.readyAt <= Date.now())
      if (!due.length) return
      const dueIds = new Set(due.map((execution) => execution.id))
      const completedAt = formatTimestamp()
      setExecutions((items) => items.map((execution) => dueIds.has(execution.id) ? {
        ...execution,
        status: '成功',
        discovered: 5,
        articles: 3,
        finishedAt: completedAt,
        duration: '0m02s',
        readyAt: null,
        logs: [...execution.logs, '列表发现 5 条候选记录', '正文入库 3 条', '质量检查通过，执行完成'],
      } : execution))
      const bootstrappedTaskIds = new Set(due.filter((execution) => execution.isBootstrap).map((execution) => execution.taskId))
      if (bootstrappedTaskIds.size) {
        setTasks((items) => items.map((task) => bootstrappedTaskIds.has(task.id) ? {
          ...task,
          bootstrapStatus: '已完成',
          scope: '增量',
          status: task.continuousEnabled === false ? '已暂停' : task.status,
          nextRun: task.continuousEnabled === false ? '—' : '待计算',
        } : task))
      }
      setArticles((items) => [...due.flatMap(createExecutionArticles), ...items])
      setAuditEvents((items) => [
        ...due.map((execution) => ({ id: `AU-${execution.id}-complete`, action: '采集执行完成', object: `${execution.id}/3 条原文`, operator: 'system', time: new Date().toLocaleString('zh-CN', { hour12: false }) })),
        ...items,
      ].slice(0, 30))
      setNotificationCount((count) => count + due.length)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [executions])

  useEffect(() => {
    const stalled = intakeBatches.filter((batch) => batch.status === '分析中' && !batch.readyAt)
    if (!stalled.length) return
    const stalledIds = new Set(stalled.map((batch) => batch.id))
    setIntakeBatches((items) => items.map((batch) => stalledIds.has(batch.id) ? {
      ...batch,
      readyAt: Date.now() + 1400,
      updatedAt: '刚刚',
    } : batch))
  }, [intakeBatches])

  useEffect(() => {
    const pending = intakeBatches.filter((batch) => batch.status === '分析中' && batch.readyAt)
    if (!pending.length) return undefined
    const delay = Math.max(0, Math.min(...pending.map((batch) => batch.readyAt)) - Date.now())
    const timer = window.setTimeout(() => {
      setIntakeBatches((items) => items.map((batch) => {
        if (!batch.readyAt || batch.readyAt > Date.now()) return batch
        const urls = batch.urls.map((row) => {
          if (row.status !== '分析中') return row
          const knownSite = row.site !== '待识别网站' && Boolean(row.analysisKind)
          return {
            ...row,
            site: row.site,
            judgment: knownSite ? '已归属' : '可确认',
            confidence: 88,
            samples: 5,
            status: knownSite ? '待审核' : '待确认归属',
          }
        })
        return {
          ...batch,
          status: deriveBatchStatus(urls),
          readyAt: null,
          updatedAt: '刚刚',
          urls,
        }
      }))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [intakeBatches])

  useEffect(() => {
    const approvedEntries = intakeBatches.flatMap((batch) => batch.urls).filter((entry) => entry.status === '已通过')
    if (!approvedEntries.length) return
    setSites((items) => {
      let changed = false
      const nextSites = []
      items.forEach((site) => {
        const normalizedHost = normalizeHost(site.host)
        const duplicateIndex = nextSites.findIndex((item) => normalizeHost(item.host) === normalizedHost)
        if (duplicateIndex === -1) {
          nextSites.push(normalizedHost === site.host ? site : { ...site, host: normalizedHost })
          if (normalizedHost !== site.host) changed = true
          return
        }
        const existing = nextSites[duplicateIndex]
        const preferred = existing.records !== '—' ? existing : site
        nextSites[duplicateIndex] = {
          ...preferred,
          host: normalizedHost,
          entryUrl: existing.entryUrl || site.entryUrl,
        }
        changed = true
      })
      approvedEntries.forEach((entry) => {
        const host = getUrlHost(entry.url)
        if (!host) return
        const matchedTask = tasks.find((task) => task.ruleId === entry.ruleId || task.site === entry.site)
        const existingIndex = nextSites.findIndex((site) => site.host === host)
        const promotedStatus = matchedTask ? '已完成' : '待配置'
        if (existingIndex === -1) {
          nextSites.unshift({
            key: `SITE-${entry.id}`,
            id: `WS-${String(nextSites.length + 1).padStart(3, '0')}`,
            name: entry.site || '待识别网站',
            host,
            entryUrl: entry.url,
            status: promotedStatus,
            records: '—',
            freq: matchedTask?.frequency || '待配置',
            last: '—',
          })
          changed = true
          return
        }
        const site = nextSites[existingIndex]
        const nextStatus = ['待分析', '分析中', '待配置'].includes(site.status) ? promotedStatus : site.status
        const nextFrequency = matchedTask?.frequency || site.freq || '待配置'
        if (site.status === nextStatus && site.freq === nextFrequency && site.entryUrl === entry.url) return
        changed = true
        nextSites[existingIndex] = { ...site, entryUrl: entry.url, status: nextStatus, freq: nextFrequency }
      })
      return changed ? nextSites : items
    })
  }, [intakeBatches, tasks])

  const value = useMemo(() => ({
    rules,
    tasks,
    executions,
    articles,
    intakeBatches,
    sites,
    capabilities,
    users,
    auditEvents,
    notificationCount,
    setNotificationCount,
    updateBatchUrl,
    approveBatchUrl,
    importSites,
    startSiteAnalysis,
    updateRule,
    runRegression,
    publishRule,
    validateAndPublishRule,
    saveTask,
    createTask,
    saveUser,
    runTask,
    saveCapabilityCandidate,
    runCapabilityRegression,
    publishCapability,
    resolveArticleQuality,
    resetPrototype,
  }), [rules, tasks, executions, articles, intakeBatches, sites, capabilities, users, auditEvents, notificationCount])

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototype() {
  const context = useContext(PrototypeContext)
  if (!context) throw new Error('usePrototype must be used inside PrototypeProvider')
  return context
}
