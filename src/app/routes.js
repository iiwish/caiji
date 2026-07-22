export function getSiteRulePath(siteHost, query = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const search = params.toString()
  return `/sites/${encodeURIComponent(siteHost)}/rule${search ? `?${search}` : ''}`
}
