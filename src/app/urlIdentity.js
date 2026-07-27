const TRACKING_QUERY_KEYS = new Set([
  'from',
  'spm',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
])

export function normalizeEntryUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.hash = ''
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = ''
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
    const entries = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_QUERY_KEYS.has(key.toLowerCase()))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    url.search = ''
    entries.forEach(([key, item]) => url.searchParams.append(key, item))
    return url.toString()
  } catch {
    return ''
  }
}

export function entryUrlKey(value) {
  return normalizeEntryUrl(value)
}

function ruleVersionParts(rule) {
  const value = String(rule?.candidateVersion || rule?.version || '')
  const match = value.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/)
  if (!match) return [0, 0, 0, 0, 0]
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] ? 0 : 1,
    Number(match[4] || 0),
  ]
}

function compareRuleVersions(left, right) {
  const leftParts = ruleVersionParts(left)
  const rightParts = ruleVersionParts(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index]
  }
  return 0
}

export function findRuleForSite(rules, site) {
  if (!site) return null
  const urlKey = entryUrlKey(site.entryUrl)
  const exactUrlMatches = urlKey
    ? rules.filter((rule) => entryUrlKey(rule.entryUrl) === urlKey)
    : []
  const candidates = exactUrlMatches.length
    ? exactUrlMatches
    : rules.filter((rule) => rule.siteId === site.id)

  return candidates.reduce((selected, rule) => (
    !selected || compareRuleVersions(rule, selected) > 0 ? rule : selected
  ), null)
}
