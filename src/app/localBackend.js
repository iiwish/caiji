const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : `请求失败（${response.status}）`)
  }
  return body
}

export function createBackendSite(url) {
  return apiRequest('/api/sites', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export function createBackendAnalysis(siteId, sampleLimit = 3) {
  return apiRequest(`/api/sites/${siteId}/analysis`, {
    method: 'POST',
    body: JSON.stringify({ sample_limit: sampleLimit }),
  })
}

export function getBackendJob(jobId) {
  return apiRequest(`/api/jobs/${jobId}`)
}

export function approveBackendAnalysis(jobId) {
  return apiRequest(`/api/analysis-jobs/${jobId}/approve`, { method: 'POST' })
}

export function getBackendSiteRules(siteId) {
  return apiRequest(`/api/sites/${siteId}/rules`)
}

export function getBackendPlan(siteId) {
  return apiRequest(`/api/sites/${siteId}/plan`)
}

export function saveBackendPlan(siteId, { enabled = true, sampleLimit = 3 } = {}) {
  return apiRequest(`/api/sites/${siteId}/plan`, {
    method: 'PUT',
    body: JSON.stringify({ enabled, sample_limit: sampleLimit }),
  })
}

export function executeBackendSite(siteId, sampleLimit = 3) {
  return apiRequest(`/api/sites/${siteId}/execute`, {
    method: 'POST',
    body: JSON.stringify({ sample_limit: sampleLimit }),
  })
}

export function getBackendExecutions(siteId, limit = 50) {
  const params = new URLSearchParams({ site_id: siteId, limit: String(limit) })
  return apiRequest(`/api/executions?${params.toString()}`)
}

export function getBackendExecution(executionId) {
  return apiRequest(`/api/executions/${executionId}`)
}

export function getBackendArticles({ siteId = '', executionId = '', limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (siteId) params.set('site_id', siteId)
  if (executionId) params.set('execution_id', executionId)
  return apiRequest(`/api/articles?${params.toString()}`)
}

export function getBackendArticle(articleId, { executionId = '' } = {}) {
  const params = new URLSearchParams()
  if (executionId) params.set('execution_id', executionId)
  const query = params.size ? `?${params.toString()}` : ''
  return apiRequest(`/api/articles/${articleId}${query}`)
}

export async function waitForBackendJob(jobId, { onProgress, intervalMs = 800 } = {}) {
  while (true) {
    const job = await getBackendJob(jobId)
    onProgress?.(job)
    if (TERMINAL_JOB_STATUSES.has(job.status)) return job
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
  }
}
