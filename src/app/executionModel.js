export function getExecutionAttempts(execution) {
  if (!execution) return []
  if (Array.isArray(execution.attempts) && execution.attempts.length) return execution.attempts
  return [{
    number: 1,
    status: execution.status,
    startedAt: execution.startedAt || '—',
    finishedAt: execution.finishedAt || '—',
    duration: execution.duration || '—',
    ruleVersion: execution.ruleVersion || '—',
    discovered: execution.discovered || 0,
    articles: execution.articles || 0,
    issue: execution.issue || '',
    stage: execution.stage || '',
    logs: execution.logs || [],
  }]
}

export function getExecutionAttemptCount(execution) {
  return getExecutionAttempts(execution).length
}

export function getLatestExecutionAttempt(execution) {
  return getExecutionAttempts(execution).at(-1) || null
}
