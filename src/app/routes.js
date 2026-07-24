export function getSiteWorkspacePath(site, section = 'overview', query = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const search = params.toString()
  const identifier = typeof site === 'object' ? (site?.id || site?.host) : site
  return `/sites/${encodeURIComponent(identifier || '')}/${section}${search ? `?${search}` : ''}`
}

export function getSiteRulePath(site, query = {}) {
  return getSiteWorkspacePath(site, 'rule', query)
}

export function getSitePlanPath(site, query = {}) {
  return getSiteWorkspacePath(site, 'plan', query)
}
