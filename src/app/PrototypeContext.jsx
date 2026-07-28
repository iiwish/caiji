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
import { initialSiteFolders, migrateSiteFolders } from './siteFolderModel'
import { getExecutionAttempts } from './executionModel'

const PrototypeContext = createContext(null)
const STORAGE_PREFIX = 'collector.v2.'
export const ANALYSIS_CONCURRENCY_LIMIT = 20
let analysisSequence = 0
let executionSequence = 0

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

function buildRecoveryPlan(sourceExecutions, publishedAt = formatTimestamp()) {
  const executions = sourceExecutions.filter(Boolean)
  const sourceExecutionIds = executions.map((execution) => execution.id)
  const firstFailureTime = executions
    .map((execution) => execution.startedAt || execution.finishedAt)
    .filter((value) => value && value !== '-')
    .sort()[0]

  return {
    mode: '连续缺口合并重试',
    start: firstFailureTime
      ? `${firstFailureTime} 之前最后提交成功的游标；无成功游标时使用首次任务配置起点`
      : '首次任务配置的起始边界；未配置时需人工确认',
    end: `${publishedAt} 固化的修复发布快照`,
    boundary: '起点不含，终点包含；失败执行不推进游标',
    basis: sourceExecutionIds.length > 1
      ? `合并 ${sourceExecutionIds.length} 次失败形成的连续缺口`
      : sourceExecutionIds.length === 1
        ? '从原失败执行向前回退到最后成功游标'
        : '使用首次任务配置的起始边界',
    sourceExecutionIds,
    deduplication: '按来源 URL 与内容指纹幂等入库',
    closure: '故障重试成功且范围对账无未覆盖游标后关闭故障',
  }
}

function createExecutionArticles(execution) {
  const collectedAt = formatTimestamp()
  const publishTime = new Date().toISOString().slice(0, 10)
  const titles = ['采购项目公开招标公告', '信息化服务项目竞争性磋商公告', '工程建设项目资格预审公告']
  const attemptNumber = getExecutionAttempts(execution).length
  return titles.map((title, index) => enrichArticleDedup({
    id: `AR-${execution.id.replace('EX-', '')}-A${attemptNumber}-${index + 1}`,
    title: `${execution.site}${title}`,
    site: execution.site,
    publishTime,
    collectedAt,
    quality: '通过',
    executionId: execution.id,
    ruleId: execution.ruleId,
    url: `${execution.url}${execution.url.includes('?') ? '&' : '?'}prototype_attempt=${attemptNumber}&prototype_article=${index + 1}`,
    rawType: 'html',
    rawContent: `<article class="notice-detail"><h1>${execution.site}${title}</h1><time datetime="${publishTime}">${publishTime}</time><div class="content">本条原文由 ${execution.task} 采集，已通过标题、正文长度、发布时间和重复性检查。</div></article>`,
    content: `本条原文由 ${execution.task} 采集，已通过标题、正文长度、发布时间和重复性检查。`,
  }))
}

function deriveBatchStatus(urls) {
  if (urls.some((row) => row.status === '分析中')) return '分析中'
  if (urls.some((row) => row.status === '排队中')) return '排队中'
  if (urls.every((row) => row.status === '已取消')) return '已取消'
  if (urls.every((row) => row.status === '已通过')) return '已完成'
  if (urls.every((row) => ['审核完成', '已通过'].includes(row.status))) return '待发布'
  return '需处理'
}

function stableFingerprint(value) {
  let hash = 2166136261
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `FP-${(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
}

function canonicalizeArticleUrl(value) {
  try {
    const url = new URL(value)
    url.hash = ''
    ;['utm_source', 'utm_medium', 'utm_campaign', 'spm', 'from'].forEach((key) => url.searchParams.delete(key))
    url.hostname = normalizeHost(url.hostname)
    return url.toString()
  } catch {
    return String(value || '')
  }
}

function enrichArticleDedup(article) {
  const normalizedUrl = canonicalizeArticleUrl(article.url)
  const fingerprint = stableFingerprint(`${article.title}|${article.publishTime}|${article.content}`)
  if (article.id === 'AR-12480') {
    return {
      ...article,
      dedup: {
        canonicalId: 'DOC-00012472',
        normalizedUrl,
        fingerprint,
        status: article.quality === '已合并' ? '已归并' : '候选重复',
        sourceCount: 2,
        duplicateOf: article.quality === '已合并' ? 'AR-12472' : '',
        signals: {
          titleSimilarity: 96,
          contentSimilarity: 91,
          samePublishDate: true,
          businessKey: 'PROJECT-TRAFFIC-SIGNAL-2026',
        },
        candidate: {
          id: 'AR-12472',
          site: '市公共资源交易中心',
          title: '智慧交通信号控制系统升级改造项目公开招标',
          url: 'https://ggzy.example.gov.cn/project/12472',
          canonicalId: 'DOC-00012472',
        },
      },
    }
  }
  return {
    ...article,
    dedup: {
      canonicalId: article.dedup?.canonicalId || `DOC-${stableFingerprint(`${article.title}|${article.publishTime}`).replace('FP-', '')}`,
      normalizedUrl,
      fingerprint,
      status: article.dedup?.status || '独立记录',
      sourceCount: article.dedup?.sourceCount || 1,
      duplicateOf: article.dedup?.duplicateOf || '',
      signals: article.dedup?.signals || null,
      candidate: article.dedup?.candidate || null,
    },
  }
}

function migrateArticles(value) {
  const articles = Array.isArray(value) ? value : initialArticles
  return articles.map(enrichArticleDedup)
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

function migrateSites(value) {
  const source = Array.isArray(value) ? value : initialSites
  const seededIdByHost = new Map(initialSites.map((site) => [normalizeHost(site.host), site.id]))
  const reservedIds = new Set(initialSites.map((site) => site.id))
  const usedIds = new Set()
  let nextNumber = Math.max(...source.map((site) => Number(String(site?.id || '').replace('WS-', '')) || 0), initialSites.length) + 1

  return source.map((site, index) => {
    const key = Number.isInteger(site?.key) ? site.key : index
    const seededId = seededIdByHost.get(normalizeHost(site?.host))
    let id = seededId || site?.id
    if (!id || usedIds.has(id) || (!seededId && reservedIds.has(id))) {
      do {
        id = `WS-${String(nextNumber).padStart(3, '0')}`
        nextNumber += 1
      } while (usedIds.has(id) || reservedIds.has(id))
    }
    usedIds.add(id)
    return { ...site, key, id }
  })
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

function usePersistentState(key, initialValue, migrate = (value) => value) {
  const [value, setValue] = useState(() => {
    try {
      const cached = window.localStorage.getItem(key)
      return migrate(cached ? JSON.parse(cached) : initialValue)
    } catch {
      return migrate(initialValue)
    }
  })

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

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
  const [articles, setArticles] = usePersistentState(`${STORAGE_PREFIX}articles`, initialArticles, migrateArticles)
  const [intakeBatches, setIntakeBatches] = usePersistentState(`${STORAGE_PREFIX}intake`, initialIntakeBatches)
  const [sites, setSites] = usePersistentState(`${STORAGE_PREFIX}sites`, initialSites, migrateSites)
  const [siteFolders, setSiteFolders] = usePersistentState(`${STORAGE_PREFIX}site-folders`, initialSiteFolders, migrateSiteFolders)
  const [capabilities, setCapabilities] = usePersistentState(`${STORAGE_PREFIX}capabilities`, initialCapabilities)
  const [users, setUsers] = usePersistentState(`${STORAGE_PREFIX}users`, initialUsers)
  const [auditEvents, setAuditEvents] = usePersistentState(`${STORAGE_PREFIX}audit`, [])
  const [failureWorkflows, setFailureWorkflows] = usePersistentState(`${STORAGE_PREFIX}failure-workflows`, {})
  const [notificationCount, setNotificationCount] = useState(3)
  const defaultSiteFolderId = siteFolders.find((folder) => folder.isDefault)?.id || initialSiteFolders[0].id

  useEffect(() => {
    setSites((items) => items.some((site) => !site.folderId)
      ? items.map((site) => site.folderId ? site : { ...site, folderId: defaultSiteFolderId })
      : items)
  }, [defaultSiteFolderId])

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

  const updateFailureWorkflows = (failureIds, patch) => {
    const ids = [...new Set((Array.isArray(failureIds) ? failureIds : [failureIds]).filter(Boolean))]
    if (!ids.length) return
    setFailureWorkflows((current) => {
      const next = { ...current }
      ids.forEach((failureId) => {
        const currentWorkflow = current[failureId] || { failureId }
        next[failureId] = {
          ...currentWorkflow,
          ...(typeof patch === 'function' ? patch(currentWorkflow) : patch),
          updatedAt: Date.now(),
        }
      })
      return next
    })
  }

  const createExecutionRecord = ({ task, rule, retrySource, purpose = '', failureIds = [], ruleVersion, taskName, url, recoveryPlan = null, blockedByExecutionId = '', status, readyAt }) => {
    if (!task) return null
    const collectionMode = task.collectionMode || task.scope || '增量'
    const collectionType = ['修复验证', '缺口补采', '故障重试'].includes(purpose)
      ? purpose
      : retrySource?.collectionType || (collectionMode === '全量' ? '全量采集' : '定时增量')
    const nextNumber = Math.max(Math.max(...executions.map((item) => Number(item.id.replace('EX-', ''))), 0) + 1, executionSequence + 1)
    executionSequence = nextNumber
    const executionId = `EX-${nextNumber}`
    const startedAt = formatTimestamp()
    const executionStatus = status || (retrySource && purpose !== '修复验证' ? '重试中' : '运行中')
    const firstLog = `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${collectionType}已进入执行队列`
    const execution = {
      id: executionId,
      taskId: task.id || '',
      task: taskName || task.name || `${task.site}采集计划`,
      siteId: task.siteId || rule?.siteId || '',
      site: task.site || rule?.site || '',
      url: url || rule?.entryUrl || retrySource?.url || '-',
      ruleId: rule?.id || task.ruleId,
      ruleVersion: ruleVersion || task.ruleVersion || rule?.version,
      status: executionStatus,
      discovered: 0,
      articles: 0,
      finishedAt: '-',
      duration: '0m00s',
      issue: '',
      stage: '',
      retryOf: retrySource?.id || '',
      purpose,
      failureIds,
      recoveryPlan,
      blockedByExecutionId,
      isBootstrap: false,
      collectionMode,
      collectionType,
      startedAt,
      readyAt: readyAt === undefined ? Date.now() + 1800 : readyAt,
      logs: [firstLog],
      attempts: [{
        number: 1,
        status: executionStatus,
        startedAt,
        finishedAt: '-',
        duration: '0m00s',
        ruleVersion: ruleVersion || task.ruleVersion || rule?.version,
        discovered: 0,
        articles: 0,
        issue: '',
        stage: '',
        purpose,
        logs: [firstLog],
      }],
    }
    setExecutions((items) => [execution, ...items])
    recordAudit(purpose === '修复验证'
      ? '创建规则验证执行'
      : purpose === '缺口补采'
        ? '创建数据恢复执行'
        : purpose === '故障重试'
          ? '创建故障重试执行'
        : retrySource
          ? '重试采集执行'
          : '立即执行采集计划', execution.id)
    return execution
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
    const currentSite = sites.find((site) => normalizeHost(site.host) === host)
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
    const linkedFailureIds = [...new Set([...(currentEntry.failureIds || []), currentEntry.failureId].filter(Boolean))]
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

    const linkedSourceExecutionIds = [...new Set([...(currentEntry.sourceExecutionIds || []), currentEntry.sourceExecutionId].filter(Boolean))]
    const sourceExecutions = executions.filter((execution) => linkedSourceExecutionIds.includes(execution.id))
    const sourceExecution = sourceExecutions[0]
    const sourceTask = tasks.find((task) => task.id === sourceExecution?.taskId)
    const retryTask = sourceTask || boundTasks[0] || (linkedFailureIds.length ? {
      id: `RETRY-${ruleId}`,
      name: `${siteName}故障重试`,
      siteId: currentSite?.id || '',
      site: siteName,
      ruleId,
      ruleVersion: version,
      collectionMode: '增量',
    } : null)
    const recoveryPlan = linkedFailureIds.length ? buildRecoveryPlan(sourceExecutions) : null
    const appendAttemptToSource = linkedFailureIds.length > 0 && sourceExecutions.length === 1
    const mergedRecoveryExecution = linkedFailureIds.length && !appendAttemptToSource
      ? createExecutionRecord({
          task: { ...retryTask, ruleId, ruleVersion: version },
          rule: publishedRule,
          retrySource: sourceExecution,
          purpose: '故障重试',
          failureIds: linkedFailureIds,
          ruleVersion: version,
          taskName: `${siteName}故障重试`,
          url: currentEntry.url,
          recoveryPlan,
        })
      : null
    const retryExecutionId = appendAttemptToSource
      ? retryExecution(sourceExecution.id, {
          ruleVersion: version,
          failureIds: linkedFailureIds,
          purpose: '规则修复重试',
          recoveryPlan,
        })
      : mergedRecoveryExecution?.id || ''

    if (retryExecutionId) {
      updateFailureWorkflows(linkedFailureIds, {
        status: '重试中',
        analysisEntryId: currentEntry.id,
        analysisBatchId: batchId,
        sourceExecutionId: linkedSourceExecutionIds[0] || '',
        sourceExecutionIds: linkedSourceExecutionIds,
        retryExecutionId,
        recoveryPlan,
        ruleId,
        ruleVersion: version,
      })
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
        retryExecutionId,
        recoveryPlan,
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
        status: linkedFailureIds.length ? '需处理' : boundTasks.length ? '已完成' : '待配置',
        entryUrl: currentEntry.url,
        freq: boundTasks[0]?.frequency || site.freq || '待配置',
      }
      : site))
    recordAudit('审核并发布 AI 采集规则', `${ruleId}/${version}`)
    return {
      ok: true,
      ruleId,
      version,
      syncedTasks,
      boundTasks: boundTasks.length,
      retryExecutionId,
      recoveryPlan,
    }
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
          entryUrls: [...new Set([...(existing.entryUrls || [existing.entryUrl].filter(Boolean)), ...(row.entryUrls || []), entryUrl])],
          folderId: row.folderId || existing.folderId || defaultSiteFolderId,
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
        entryUrls: [...new Set([...(row.entryUrls || []), entryUrl])],
        folderId: row.folderId || defaultSiteFolderId,
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

  const createSiteFolder = (name, parentId = null) => {
    const normalizedName = String(name || '').trim()
    if (!normalizedName) return { ok: false, reason: '请输入文件夹名称' }
    const normalizedParentId = parentId && siteFolders.some((folder) => folder.id === parentId) ? parentId : null
    if (siteFolders.some((folder) => folder.parentId === normalizedParentId && folder.name.toLowerCase() === normalizedName.toLowerCase())) {
      return { ok: false, reason: '同级目录中已存在同名文件夹' }
    }
    const folder = {
      id: `SF-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
      name: normalizedName,
      parentId: normalizedParentId,
      isDefault: false,
      sortOrder: Math.max(...siteFolders.filter((item) => item.parentId === normalizedParentId).map((item) => item.sortOrder || 0), -1) + 1,
      createdAt: new Date().toISOString(),
    }
    setSiteFolders((items) => [...items, folder])
    recordAudit('创建网站文件夹', normalizedName)
    return { ok: true, folder }
  }

  const renameSiteFolder = (folderId, name) => {
    const normalizedName = String(name || '').trim()
    if (!normalizedName) return { ok: false, reason: '请输入文件夹名称' }
    const target = siteFolders.find((folder) => folder.id === folderId)
    if (!target) return { ok: false, reason: '文件夹不存在' }
    if (siteFolders.some((folder) => folder.id !== folderId && folder.parentId === target.parentId && folder.name.toLowerCase() === normalizedName.toLowerCase())) {
      return { ok: false, reason: '同级目录中已存在同名文件夹' }
    }
    setSiteFolders((items) => items.map((folder) => folder.id === folderId ? { ...folder, name: normalizedName } : folder))
    recordAudit('重命名网站文件夹', normalizedName)
    return { ok: true }
  }

  const deleteSiteFolder = (folderId) => {
    const folder = siteFolders.find((item) => item.id === folderId)
    if (!folder) return { ok: false, reason: '文件夹不存在' }
    if (folder.isDefault) return { ok: false, reason: '默认文件夹不能删除，请先设置其他默认文件夹' }
    setSiteFolders((items) => items
      .filter((item) => item.id !== folderId)
      .map((item) => item.parentId === folderId ? { ...item, parentId: folder.parentId } : item))
    setSites((items) => items.map((site) => site.folderId === folderId
      ? { ...site, folderId: folder.parentId || defaultSiteFolderId }
      : site))
    recordAudit('删除网站文件夹', folder.name)
    return { ok: true, parentId: folder.parentId }
  }

  const setDefaultSiteFolder = (folderId) => {
    const folder = siteFolders.find((item) => item.id === folderId)
    if (!folder) return { ok: false, reason: '文件夹不存在' }
    setSiteFolders((items) => items.map((item) => ({ ...item, isDefault: item.id === folderId })))
    recordAudit('设置默认网站文件夹', folder.name)
    return { ok: true }
  }

  const moveSitesToFolder = (siteHosts, folderId = defaultSiteFolderId) => {
    const normalizedHosts = new Set(siteHosts.map(normalizeHost))
    if (!normalizedHosts.size) return
    const resolvedFolderId = siteFolders.some((item) => item.id === folderId) ? folderId : defaultSiteFolderId
    const folder = siteFolders.find((item) => item.id === resolvedFolderId)
    setSites((items) => items.map((site) => normalizedHosts.has(normalizeHost(site.host))
      ? { ...site, folderId: resolvedFolderId }
      : site))
    recordAudit('批量移动网站到文件夹', `${normalizedHosts.size} 个/${folder?.name || '默认文件夹'}`)
  }

  const setSitesEnabled = (siteHosts, enabled) => {
    const normalizedHosts = new Set(siteHosts.map(normalizeHost))
    if (!normalizedHosts.size) return 0
    setSites((items) => items.map((site) => normalizedHosts.has(normalizeHost(site.host))
      ? { ...site, status: enabled ? '已完成' : '已停用' }
      : site))
    recordAudit(enabled ? '批量启用网站' : '批量停用网站', `${normalizedHosts.size} 个`)
    return normalizedHosts.size
  }

  const createSiteAnalysisBatch = ({ rows, folderId = defaultSiteFolderId, source = 'AI 分析' }) => {
    const activeByHost = new Map()
    intakeBatches.forEach((batch) => {
      batch.urls.forEach((entry) => {
        const host = normalizeHost(entry.siteHost || getUrlHost(entry.url))
        if (host && isAnalysisEntryActive(entry)) activeByHost.set(host, { batchId: batch.id, entryId: entry.id })
      })
    })
    const siteByHost = new Map(sites.map((site) => [normalizeHost(site.host), site]))
    const ruleByHost = new Map(rules.map((rule) => [normalizeHost(rule.siteHost), rule]))
    const queuedHosts = new Set()
    const seenHosts = new Set()
    const entries = []
    let reused = 0
    let skipped = 0

    rows.forEach((row) => {
      const host = normalizeHost(row.host || getUrlHost(row.url))
      if (!host || seenHosts.has(host)) {
        skipped += 1
        return
      }
      seenHosts.add(host)
      if (activeByHost.has(host)) {
        reused += 1
        return
      }
      const site = siteByHost.get(host)
      const rule = ruleByHost.get(host)
      queuedHosts.add(host)
      entries.push({
        id: nextAnalysisId('URL'),
        site: row.name || site?.name || '待识别网站',
        siteHost: host,
        url: row.url,
        source,
        judgment: '等待调度',
        confidence: 0,
        ruleId: rule?.id || '',
        samples: 0,
        status: '排队中',
        issue: '',
        analysisKind: rule ? 'reanalyze' : 'onboarding',
        folderId: row.folderId || folderId || '',
        queuedAt: Date.now(),
      })
    })

    if (!entries.length) return { batchId: '', entryIds: [], firstHost: '', created: 0, reused, skipped }

    const batchId = nextAnalysisId('IB')
    const batch = {
      id: batchId,
      name: entries.length === 1 ? `${entries[0].site}分析任务` : `${source}批次 · ${entries.length} 个网站`,
      status: '排队中',
      createdAt: Date.now(),
      updatedAt: '刚刚',
      concurrency: ANALYSIS_CONCURRENCY_LIMIT,
      paused: false,
      urls: entries,
    }
    setIntakeBatches((items) => [batch, ...items])
    setSites((items) => items.map((site) => queuedHosts.has(normalizeHost(site.host)) && site.status !== '异常'
      ? { ...site, status: '分析中', ...(folderId ? { folderId } : {}) }
      : site))
    recordAudit('创建受控 AI 分析批次', `${batchId}/${entries.length} 个网站/并发 ${ANALYSIS_CONCURRENCY_LIMIT}`)
    return { batchId, entryIds: entries.map((entry) => entry.id), firstHost: entries[0].siteHost, created: entries.length, reused, skipped }
  }

  const setAnalysisBatchPaused = (batchId, paused) => {
    const batch = intakeBatches.find((item) => item.id === batchId)
    if (!batch) return false
    setIntakeBatches((items) => items.map((item) => item.id === batchId ? {
      ...item,
      paused,
      updatedAt: '刚刚',
    } : item))
    recordAudit(paused ? '暂停 AI 分析批次' : '继续 AI 分析批次', batchId)
    return true
  }

  const cancelAnalysisEntry = (batchId, entryId) => {
    const batch = intakeBatches.find((item) => item.id === batchId)
    const entry = batch?.urls.find((item) => item.id === entryId)
    if (!entry || !['排队中', '分析中'].includes(entry.status)) return false
    setIntakeBatches((items) => items.map((item) => {
      if (item.id !== batchId) return item
      const urls = item.urls.map((row) => row.id === entryId ? {
        ...row,
        status: '已取消',
        readyAt: null,
        completedAt: new Date().toISOString(),
      } : row)
      return { ...item, status: deriveBatchStatus(urls), urls, updatedAt: '刚刚' }
    }))
    recordAudit('取消 AI 分析任务', `${batchId}/${entryId}`)
    return true
  }

  const startSiteAnalysis = ({ siteName, siteHost, url, ruleId, kind = 'reanalyze', failureId = '', failureIds = [], sourceExecutionId = '', sourceExecutionIds = [], parentAnalysisId = '', source = '', folderId }) => {
    const normalizedHost = normalizeHost(siteHost || getUrlHost(url))
    const linkedFailureIds = [...new Set([...(failureIds || []), failureId].filter(Boolean))]
    const linkedSourceExecutionIds = [...new Set([...(sourceExecutionIds || []), sourceExecutionId].filter(Boolean))]
    const existing = intakeBatches.flatMap((batch) => batch.urls.map((entry) => ({ ...entry, batchId: batch.id })))
      .find((entry) => normalizeHost(entry.siteHost || getUrlHost(entry.url)) === normalizedHost && isAnalysisEntryActive(entry))
    if (existing) {
      if (folderId !== undefined) {
        setSites((items) => items.map((site) => normalizeHost(site.host) === normalizedHost ? { ...site, folderId } : site))
        setIntakeBatches((batches) => batches.map((batch) => batch.id === existing.batchId ? {
          ...batch,
          urls: batch.urls.map((entry) => entry.id === existing.id ? { ...entry, folderId } : entry),
        } : batch))
      }
      if (kind === 'diagnose') {
        const shouldConvert = existing.analysisKind !== 'diagnose'
        const readyAt = Date.now() + 1400
        setIntakeBatches((batches) => batches.map((batch) => batch.id === existing.batchId ? {
          ...batch,
          ...(shouldConvert ? { name: `${siteName}异常诊断`, status: '分析中', paused: false } : {}),
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
              readyAt,
            } : {}),
            analysisKind: 'diagnose',
            failureId: linkedFailureIds[0] || entry.failureId || '',
            failureIds: [...new Set([...(entry.failureIds || []), entry.failureId, ...linkedFailureIds].filter(Boolean))],
            sourceExecutionId: linkedSourceExecutionIds[0] || entry.sourceExecutionId || '',
            sourceExecutionIds: [...new Set([...(entry.sourceExecutionIds || []), entry.sourceExecutionId, ...linkedSourceExecutionIds].filter(Boolean))],
          } : entry),
        } : batch))
        if (shouldConvert) recordAudit('复用活动 AI 任务进行失败诊断', `${normalizedHost}/${ruleId || existing.ruleId || 'new-rule'}`)
      }
      if (kind === 'diagnose') {
        updateFailureWorkflows(linkedFailureIds, {
          status: '诊断中',
          analysisEntryId: existing.id,
          analysisBatchId: existing.batchId,
          sourceExecutionId: linkedSourceExecutionIds[0] || existing.sourceExecutionId || '',
          sourceExecutionIds: linkedSourceExecutionIds,
        })
      }
      return { batchId: existing.batchId, entryId: existing.id, existing: true }
    }

    const targetRuleId = ruleId || ''

    const entryId = nextAnalysisId('URL')
    const batchId = nextAnalysisId('IB')
    const batch = {
      id: batchId,
      name: kind === 'diagnose' ? `${siteName}异常诊断` : kind === 'onboarding' ? `${siteName}首次接入分析` : `${siteName}规则重新分析`,
      status: '排队中',
      createdAt: Date.now(),
      updatedAt: '刚刚',
      concurrency: 1,
      paused: false,
      urls: [{
        id: entryId,
        site: siteName,
        siteHost: normalizedHost,
        url,
        source: source || (kind === 'diagnose' ? '失败队列' : '网站管理'),
        judgment: '等待调度',
        confidence: 0,
        ruleId: targetRuleId,
        samples: 0,
        status: '排队中',
        issue: '',
        analysisKind: kind,
        failureId: linkedFailureIds[0] || '',
        failureIds: linkedFailureIds,
        sourceExecutionId: linkedSourceExecutionIds[0] || '',
        sourceExecutionIds: linkedSourceExecutionIds,
        parentAnalysisId,
        folderId: folderId || '',
        queuedAt: Date.now(),
      }],
    }
    setIntakeBatches((items) => [batch, ...items])
    setSites((items) => items.map((site) => normalizeHost(site.host) === normalizedHost && site.status !== '异常'
      ? { ...site, status: '分析中', entryUrl: url, ...(folderId !== undefined ? { folderId } : {}) }
      : site))
    if (kind === 'diagnose') {
      updateFailureWorkflows(linkedFailureIds, {
        status: '诊断中',
        analysisEntryId: entryId,
        analysisBatchId: batchId,
        sourceExecutionId: linkedSourceExecutionIds[0] || '',
        sourceExecutionIds: linkedSourceExecutionIds,
      })
    }
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

  const retryExecution = (executionId, options = {}) => {
    const source = executions.find((execution) => execution.id === executionId)
    if (!source || ['运行中', '重试中', '排队中'].includes(source.status)) return null
    const task = tasks.find((item) => item.id === source.taskId)
    if (!task) return null

    const attempts = getExecutionAttempts(source)
    const nextAttemptNumber = Math.max(...attempts.map((attempt) => attempt.number || 0), 0) + 1
    const startedAt = formatTimestamp()
    const ruleVersion = options.ruleVersion || source.ruleVersion || task.ruleVersion
    const linkedFailureIds = [...new Set([...(source.failureIds || []), ...(options.failureIds || [])].filter(Boolean))]
    const purpose = options.purpose || ''
    const firstLog = `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} 第 ${nextAttemptNumber} 次尝试已进入执行队列`
    const nextAttempt = {
      number: nextAttemptNumber,
      status: '重试中',
      startedAt,
      finishedAt: '-',
      duration: '0m00s',
      ruleVersion,
      discovered: 0,
      articles: 0,
      issue: '',
      stage: '',
      purpose,
      logs: [firstLog],
    }

    setExecutions((items) => items.map((execution) => execution.id === executionId ? {
      ...execution,
      status: '重试中',
      originalStatus: execution.originalStatus || execution.status,
      ruleVersion,
      issue: '',
      stage: '',
      finishedAt: '-',
      duration: '0m00s',
      startedAt,
      readyAt: options.readyAt === undefined ? Date.now() + 1800 : options.readyAt,
      retryCount: nextAttemptNumber - 1,
      activeAttempt: nextAttemptNumber,
      failureIds: linkedFailureIds,
      recoveryPlan: options.recoveryPlan || execution.recoveryPlan,
      attempts: [...attempts, nextAttempt],
      logs: [firstLog],
    } : execution))

    if (linkedFailureIds.length) {
      updateFailureWorkflows(linkedFailureIds, {
        status: '重试中',
        sourceExecutionId: executionId,
        sourceExecutionIds: [executionId],
        retryExecutionId: executionId,
        recoveryPlan: options.recoveryPlan || source.recoveryPlan || null,
        ruleId: source.ruleId,
        ruleVersion,
      })
    }
    recordAudit('重试采集执行', `${executionId}/attempt-${nextAttemptNumber}`)
    return executionId
  }

  const runTask = (taskId, retryOf = '', overrides = {}) => {
    const storedTask = tasks.find((item) => item.id === taskId)
    const task = storedTask ? { ...storedTask, ...overrides } : null
    if (!task) return null
    if (retryOf) return retryExecution(retryOf, { ruleVersion: task.ruleVersion, failureIds: overrides.failureIds || [] })
    if (task.status !== '启用') return null
    const rule = rules.find((item) => item.id === task.ruleId)
    return createExecutionRecord({ task, rule })?.id || null
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
    setArticles((items) => items.map((article) => {
      if (article.id !== articleId) return article
      if (quality === '已合并' && article.dedup?.candidate) {
        return {
          ...article,
          quality,
          dedup: {
            ...article.dedup,
            status: '已归并',
            canonicalId: article.dedup.candidate.canonicalId,
            duplicateOf: article.dedup.candidate.id,
            sourceCount: Math.max(2, article.dedup.sourceCount || 1),
          },
        }
      }
      return {
        ...article,
        quality,
        dedup: article.dedup ? { ...article.dedup, status: quality === '通过' ? '非重复' : article.dedup.status } : article.dedup,
      }
    }))
    recordAudit('处理原文质量', articleId)
  }

  const resetPrototype = () => {
    setRules(initialRules)
    setTasks(initialTasks)
    setExecutions(initialExecutions)
    setArticles(initialArticles)
    setIntakeBatches(initialIntakeBatches)
    setSites(initialSites)
    setSiteFolders(initialSiteFolders)
    setCapabilities(initialCapabilities)
    setUsers(initialUsers)
    setAuditEvents([])
    setFailureWorkflows({})
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
      const repairValidationExecutions = due.filter((execution) => execution.purpose === '修复验证')
      const recoveryExecutions = due.filter((execution) => execution.purpose === '缺口补采')
      const failureRetryExecutions = due.filter((execution) => execution.purpose === '故障重试')
      const retryAttemptExecutions = due.filter((execution) => getExecutionAttempts(execution).length > 1)
      const recoveryIdsToStart = new Set(executions
        .filter((execution) => execution.purpose === '缺口补采' && dueIds.has(execution.blockedByExecutionId))
        .map((execution) => execution.id))
      const completedRetryBySourceExecution = new Map()
      ;[...recoveryExecutions, ...failureRetryExecutions].forEach((execution) => {
        ;(execution.recoveryPlan?.sourceExecutionIds || []).forEach((sourceExecutionId) => {
          completedRetryBySourceExecution.set(sourceExecutionId, execution)
        })
      })
      const completedAt = formatTimestamp()
      setExecutions((items) => items.map((execution) => {
        if (dueIds.has(execution.id)) {
          const attempts = getExecutionAttempts(execution)
          const isRetryAttempt = attempts.length > 1
          const retryRecovered = Math.max(1, (execution.discovered || 3) - (execution.articles || 0))
          const attemptDiscovered = execution.purpose === '修复验证'
            ? 5
            : ['缺口补采', '故障重试'].includes(execution.purpose)
              ? 18
              : isRetryAttempt
                ? retryRecovered
                : 5
          const attemptArticles = execution.purpose === '修复验证'
            ? 0
            : ['缺口补采', '故障重试'].includes(execution.purpose)
              ? 15
              : isRetryAttempt
                ? retryRecovered
                : 3
          const completedLogs = execution.purpose === '修复验证'
            ? [...execution.logs, '代表页面 5/5 通过', '原失败阶段通过，允许启动数据恢复']
            : execution.purpose === '缺口补采'
              ? [...execution.logs, '按恢复区间发现 18 条记录', '幂等入库 15 条，重复 3 条', '区间对账通过，无未覆盖游标']
              : execution.purpose === '故障重试'
                ? [...execution.logs, '新规则代表页面验证 5/5 通过', '按合并缺口范围发现 18 条记录', '幂等入库 15 条，重复 3 条', '范围对账通过，无未覆盖游标']
                : isRetryAttempt
                  ? [...execution.logs, `重新请求 ${attemptDiscovered} 个失败页面`, `成功入库 ${attemptArticles} 条`, '本次采集记录已在重试后完成']
                  : [...execution.logs, '列表发现 5 条候选记录', '正文入库 3 条', '质量检查通过，执行完成']
          return {
            ...execution,
            status: '成功',
            discovered: isRetryAttempt && !execution.purpose ? Math.max(execution.discovered || 0, (execution.articles || 0) + attemptDiscovered) : attemptDiscovered,
            articles: isRetryAttempt && !execution.purpose ? (execution.articles || 0) + attemptArticles : attemptArticles,
            validationPassed: ['修复验证', '故障重试'].includes(execution.purpose) ? 5 : execution.validationPassed,
            validationTotal: ['修复验证', '故障重试'].includes(execution.purpose) ? 5 : execution.validationTotal,
            finishedAt: completedAt,
            duration: '0m02s',
            readyAt: null,
            reconciliation: ['缺口补采', '故障重试'].includes(execution.purpose) ? '区间对账通过，无未覆盖游标' : execution.reconciliation,
            logs: completedLogs,
            attempts: attempts.map((attempt, index) => index === attempts.length - 1 ? {
              ...attempt,
              status: '成功',
              finishedAt: completedAt,
              duration: '0m02s',
              discovered: attemptDiscovered,
              articles: attemptArticles,
              issue: '',
              stage: '',
              logs: completedLogs,
            } : attempt),
          }
        }
        if (recoveryIdsToStart.has(execution.id)) {
          return {
            ...execution,
            status: '运行中',
            startedAt: formatTimestamp(),
            readyAt: Date.now() + 1800,
            logs: [...execution.logs, '规则验证已通过，开始按锁定区间恢复数据'],
          }
        }
        const retryExecution = completedRetryBySourceExecution.get(execution.id)
        if (retryExecution) {
          return {
            ...execution,
            resolution: {
              status: '已处置',
              retryExecutionId: retryExecution.id,
              recoveryExecutionId: retryExecution.id,
              validationExecutionId: retryExecution.blockedByExecutionId,
              ruleVersion: retryExecution.ruleVersion,
              resolvedAt: completedAt,
              recoveryPlan: retryExecution.recoveryPlan,
            },
          }
        }
        return execution
      }))
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
      if (repairValidationExecutions.length) {
        const validatingFailureIds = repairValidationExecutions.flatMap((execution) => execution.failureIds || [])
        updateFailureWorkflows(validatingFailureIds, (workflow) => ({
          status: '补采中',
          validationExecutionId: workflow.validationExecutionId,
        }))
      }
      if (recoveryExecutions.length) {
        const repairedSites = new Set(recoveryExecutions.map((execution) => execution.site))
        const resolvedFailureIds = recoveryExecutions.flatMap((execution) => execution.failureIds || [])
        setSites((items) => items.map((site) => repairedSites.has(site.name) && !['已停用', '已暂停'].includes(site.status)
          ? { ...site, status: '已完成', last: '刚刚' }
          : site))
        updateFailureWorkflows(resolvedFailureIds, (workflow) => ({
          status: '已解决',
          resolvedAt: Date.now(),
          recoveryExecutionId: workflow.recoveryExecutionId,
          reconciliation: '区间对账通过，无未覆盖游标',
        }))
      }
      if (failureRetryExecutions.length) {
        const retriedSites = new Set(failureRetryExecutions.map((execution) => execution.site))
        setSites((items) => items.map((site) => retriedSites.has(site.name) && !['已停用', '已暂停'].includes(site.status)
          ? { ...site, status: '已完成', last: '刚刚' }
          : site))
        failureRetryExecutions.forEach((execution) => {
          updateFailureWorkflows(execution.failureIds || [], {
            status: '已解决',
            resolvedAt: Date.now(),
            retryExecutionId: execution.id,
            reconciliation: '区间对账通过，无未覆盖游标',
          })
        })
      }
      if (retryAttemptExecutions.length) {
        const retriedSites = new Set(retryAttemptExecutions.map((execution) => execution.site))
        setSites((items) => items.map((site) => retriedSites.has(site.name) && !['已停用', '已暂停'].includes(site.status)
          ? { ...site, status: '已完成', last: '刚刚' }
          : site))
        retryAttemptExecutions.forEach((execution) => {
          updateFailureWorkflows(execution.failureIds || [], {
            status: '已解决',
            resolvedAt: Date.now(),
            sourceExecutionId: execution.id,
            sourceExecutionIds: [execution.id],
            retryExecutionId: execution.id,
            reconciliation: '同一采集记录内重试成功，失败尝试日志已保留',
          })
        })
      }
      setArticles((items) => [...due.filter((execution) => execution.purpose !== '修复验证').flatMap(createExecutionArticles), ...items])
      setAuditEvents((items) => [
        ...due.map((execution) => ({ id: `AU-${execution.id}-complete`, action: execution.purpose === '修复验证' ? '规则验证通过' : execution.purpose === '缺口补采' ? '数据恢复与对账完成' : execution.purpose === '故障重试' ? '故障重试与对账完成' : '采集执行完成', object: `${execution.id}/${execution.purpose || '普通采集'}`, operator: 'system', time: new Date().toLocaleString('zh-CN', { hour12: false }) })),
        ...items,
      ].slice(0, 30))
      setNotificationCount((count) => count + due.length)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [executions])

  useEffect(() => {
    const runningCount = intakeBatches.reduce((count, batch) => (
      count + batch.urls.filter((entry) => entry.status === '分析中').length
    ), 0)
    let remainingCapacity = Math.max(0, ANALYSIS_CONCURRENCY_LIMIT - runningCount)
    if (!remainingCapacity || !intakeBatches.some((batch) => !batch.paused && batch.urls.some((entry) => entry.status === '排队中'))) return

    const startedAt = Date.now()
    let changed = false
    const nextBatches = intakeBatches.map((batch) => {
      if (batch.paused || !remainingCapacity) return batch
      const batchRunning = batch.urls.filter((entry) => entry.status === '分析中').length
      let batchCapacity = Math.max(0, Math.min(batch.concurrency || ANALYSIS_CONCURRENCY_LIMIT, ANALYSIS_CONCURRENCY_LIMIT) - batchRunning)
      if (!batchCapacity) return batch
      const urls = batch.urls.map((entry) => {
        if (entry.status !== '排队中' || !remainingCapacity || !batchCapacity) return entry
        changed = true
        remainingCapacity -= 1
        batchCapacity -= 1
        return {
          ...entry,
          status: '分析中',
          judgment: '识别中',
          startedAt,
          readyAt: startedAt + 1400,
        }
      })
      return urls === batch.urls ? batch : { ...batch, status: deriveBatchStatus(urls), urls, updatedAt: '刚刚' }
    })
    if (changed) setIntakeBatches(nextBatches)
  }, [intakeBatches])

  useEffect(() => {
    const pending = intakeBatches.flatMap((batch) => batch.urls
      .filter((entry) => entry.status === '分析中' && (entry.readyAt || batch.readyAt))
      .map((entry) => ({ batchId: batch.id, entryId: entry.id, readyAt: entry.readyAt || batch.readyAt })))
    if (!pending.length) return undefined
    const delay = Math.max(0, Math.min(...pending.map((entry) => entry.readyAt)) - Date.now())
    const timer = window.setTimeout(() => {
      const now = Date.now()
      const dueIds = new Set(pending.filter((entry) => entry.readyAt <= now).map((entry) => `${entry.batchId}/${entry.entryId}`))
      if (!dueIds.size) return
      setIntakeBatches((items) => items.map((batch) => {
        const urls = batch.urls.map((row) => {
          if (row.status !== '分析中' || !dueIds.has(`${batch.id}/${row.id}`)) return row
          const knownSite = row.site !== '待识别网站' && Boolean(row.analysisKind)
          return {
            ...row,
            site: row.site,
            judgment: knownSite ? '已归属' : '可确认',
            confidence: 88,
            samples: 5,
            status: knownSite ? '待审核' : '待确认归属',
            readyAt: null,
          }
        })
        if (urls.every((row, index) => row === batch.urls[index])) return batch
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
            folderId: entry.folderId || defaultSiteFolderId,
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
  }, [defaultSiteFolderId, intakeBatches, tasks])

  const value = useMemo(() => ({
    rules,
    tasks,
    executions,
    articles,
    intakeBatches,
    sites,
    siteFolders,
    defaultSiteFolderId,
    capabilities,
    users,
    auditEvents,
    failureWorkflows,
    notificationCount,
    setNotificationCount,
    updateBatchUrl,
    updateFailureWorkflows,
    approveBatchUrl,
    importSites,
    createSiteFolder,
    renameSiteFolder,
    deleteSiteFolder,
    setDefaultSiteFolder,
    moveSitesToFolder,
    setSitesEnabled,
    createSiteAnalysisBatch,
    setAnalysisBatchPaused,
    cancelAnalysisEntry,
    startSiteAnalysis,
    updateRule,
    runRegression,
    publishRule,
    validateAndPublishRule,
    saveTask,
    createTask,
    saveUser,
    retryExecution,
    runTask,
    saveCapabilityCandidate,
    runCapabilityRegression,
    publishCapability,
    resolveArticleQuality,
    resetPrototype,
  }), [rules, tasks, executions, articles, intakeBatches, sites, siteFolders, defaultSiteFolderId, capabilities, users, auditEvents, failureWorkflows, notificationCount])

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>
}

export function usePrototype() {
  const context = useContext(PrototypeContext)
  if (!context) throw new Error('usePrototype must be used inside PrototypeProvider')
  return context
}
