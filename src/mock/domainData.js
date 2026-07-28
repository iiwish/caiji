export const initialRules = [
  {
    id: 'RP-0001',
    name: '中国政府采购公告',
    site: '中国政府采购网',
    siteHost: 'ccgp.gov.cn',
    entryUrl: 'https://www.ccgp.gov.cn/cggg/zygg/',
    status: '已发布',
    version: 'v1.4.0',
    candidateVersion: '',
    regression: 'passed',
    health: '健康',
    updatedAt: '07-16 15:32',
    yaml: `name: 中国政府采购公告\nentry_url: https://www.ccgp.gov.cn/cggg/zygg/\nstrategy: html\nlist:\n  item: ul.c_list_bid li\n  link: a::attr(href)\ndetail:\n  title: h2.tc::text\n  content: .vF_detail_content::html\n  publish_time: .vT_detail_main::text\nquality:\n  min_content_length: 200`,
  },
  {
    id: 'RP-0002',
    name: '湖北公共资源交易公告',
    site: '湖北省公共资源交易中心',
    siteHost: 'ggzy.hubei.gov.cn',
    entryUrl: 'https://ggzy.hubei.gov.cn/notice/list',
    status: '候选版本',
    version: 'v1.1.0',
    candidateVersion: 'v1.2.0-rc.1',
    regression: 'pending',
    health: '待回归',
    updatedAt: '07-16 14:48',
    yaml: `name: 湖北公共资源交易公告\nentry_url: https://ggzy.hubei.gov.cn/notice/list\nstrategy: hybrid\nlist:\n  item: ul.article-list > li\n  link: a::attr(href)\ndetail:\n  title: h1::text\n  content: .article-content::html\n  publish_time: span.date::text\nquality:\n  min_content_length: 160`,
  },
  {
    id: 'RP-0003',
    name: '广东招投标监管公告',
    site: '广东省招标投标监管网',
    siteHost: 'gdzbtb.gov.cn',
    entryUrl: 'https://gdzbtb.gov.cn/notice/list',
    status: '需修复',
    version: 'v2.0.1',
    candidateVersion: '',
    regression: 'failed',
    health: '列表 0 行',
    updatedAt: '07-16 14:50',
    yaml: `name: 广东招投标监管公告\nentry_url: https://gdzbtb.gov.cn/notice/list\nstrategy: html\nlist:\n  item: div.m_list div.item\n  link: a::attr(href)\ndetail:\n  title: h1::text\n  content: .detail-body::html\nquality:\n  min_content_length: 180`,
  },
  {
    id: 'RP-0004',
    name: '江苏政府采购公告',
    site: '江苏省政府采购网',
    siteHost: 'ccgp-jiangsu.gov.cn',
    entryUrl: 'https://ccgp-jiangsu.gov.cn/notice/list',
    status: '待审核',
    version: 'v0.9.0',
    candidateVersion: 'v1.0.0-rc.1',
    regression: 'passed',
    health: '待人工确认',
    updatedAt: '07-16 13:58',
    yaml: `name: 江苏政府采购公告\nentry_url: https://ccgp-jiangsu.gov.cn/notice/list\nstrategy: api\nlist:\n  endpoint: /api/notice/list\n  items: data.rows\ndetail:\n  title: title\n  content: content\n  publish_time: publishDate\nquality:\n  min_content_length: 200`,
  },
]

export const initialTasks = [
  { id: 'TK-001', name: '中国政府采购日常增量', site: '中国政府采购网', ruleId: 'RP-0001', ruleVersion: 'v1.4.0', versionPolicy: '跟随最新发布', collectionMode: '增量', initialScope: '全量', bootstrapStatus: '已完成', continuousEnabled: true, scope: '增量', executionMode: '定时', frequency: '每 30 分钟', cron: '*/30 * * * *', nextRun: '16:10', status: '启用', concurrency: 4 },
  { id: 'TK-002', name: '湖北公共资源增量', site: '湖北省公共资源交易中心', ruleId: 'RP-0002', ruleVersion: 'v1.1.0', versionPolicy: '固定当前版本', collectionMode: '增量', initialScope: '全量', bootstrapStatus: '已完成', continuousEnabled: true, scope: '增量', executionMode: '定时', frequency: '每 1 小时', cron: '0 * * * *', nextRun: '16:30', status: '启用', concurrency: 3 },
  { id: 'TK-003', name: '全国公共资源历史回补', site: '全国公共资源交易平台', ruleId: 'RP-0001', ruleVersion: 'v1.4.0', versionPolicy: '固定当前版本', collectionMode: '全量', initialScope: '全量', bootstrapStatus: '进行中', continuousEnabled: true, scope: '全量', executionMode: '定时', frequency: '每天', cron: '0 3 * * *', nextRun: '待执行', status: '已暂停', concurrency: 6 },
  { id: 'TK-004', name: '广东监管公告增量', site: '广东省招标投标监管网', ruleId: 'RP-0003', ruleVersion: 'v2.0.1', versionPolicy: '跟随最新发布', collectionMode: '增量', initialScope: '全量', bootstrapStatus: '已完成', continuousEnabled: true, scope: '增量', executionMode: '定时', frequency: '每 2 小时', cron: '0 */2 * * *', nextRun: '-', status: '规则异常', concurrency: 2 },
]

export const initialUsers = [
  { id: 'U-001', name: 'qidev_qi', role: '超级管理员', status: '启用', lastLogin: '07-16 15:42' },
  { id: 'U-002', name: 'collector_ops', role: '采集运营', status: '启用', lastLogin: '07-16 13:20' },
  { id: 'U-003', name: 'rule_maintainer', role: '能力维护', status: '启用', lastLogin: '07-15 18:03' },
]

export const initialExecutions = [
  { id: 'EX-1487', taskId: 'TK-001', task: '中国政府采购日常增量', site: '中国政府采购网', url: 'https://www.ccgp.gov.cn/cggg/zygg/', ruleId: 'RP-0001', ruleVersion: 'v1.4.0', status: '成功', discovered: 3320, articles: 3204, finishedAt: '07-16 15:40', duration: '2m18s', issue: '', stage: '', retryOf: '', logs: ['15:37:42 执行开始', '15:37:45 列表发现 3,320 条', '15:39:56 正文入库 3,204 条', '15:40:00 质量检查通过'] },
  { id: 'EX-1486', taskId: 'TK-002', task: '湖北公共资源增量', site: '湖北省公共资源交易中心', url: 'https://ggzy.hubei.gov.cn/notice/list', ruleId: 'RP-0002', ruleVersion: 'v1.1.0', status: '成功', discovered: 1904, articles: 1860, finishedAt: '07-16 15:30', duration: '1m52s', issue: '', stage: '', retryOf: '', logs: ['15:28:08 执行开始', '15:28:12 列表发现 1,904 条', '15:30:00 入库完成'] },
  { id: 'EX-1485', taskId: 'TK-003', task: '全国公共资源历史回补', site: '全国公共资源交易平台', url: 'https://ggzy.gov.cn/', ruleId: 'RP-0001', ruleVersion: 'v1.4.0', status: '运行中', discovered: 13022, articles: 12480, finishedAt: '-', duration: '14m06s', issue: '', stage: '', retryOf: '', logs: ['15:10:00 执行开始', '15:23:40 已处理 13,022 个详情页', '15:24:06 正在执行质量检查'] },
  { id: 'EX-1484', taskId: 'TK-004', task: '广东监管公告增量', site: '广东省招标投标监管网', url: 'https://gdzbtb.gov.cn/notice/list', ruleId: 'RP-0003', ruleVersion: 'v2.0.1', status: '失败', discovered: 0, articles: 0, finishedAt: '07-16 14:50', duration: '0m12s', issue: '页面结构变化，列表定位失败', stage: '列表发现', retryOf: '', logs: ['14:50:00 执行开始', '14:50:09 GET /notice/list 200', '14:50:12 选择器 div.m_list div.item 匹配 0 个节点', '14:50:12 执行失败 PARSE_EMPTY'] },
  { id: 'EX-1483', taskId: 'TK-001', task: '中国政府采购日常增量', site: '中国政府采购网', url: 'https://www.ccgp.gov.cn/cggg/zygg/', ruleId: 'RP-0001', ruleVersion: 'v1.4.0', status: '部分失败', discovered: 690, articles: 642, finishedAt: '07-16 15:00', duration: '0m48s', issue: '48 个详情页请求超时', stage: '明细抓取', retryOf: '', logs: ['14:59:12 执行开始', '14:59:26 列表发现 690 条', '15:00:00 48 个详情页请求超时'] },
  { id: 'EX-1482', taskId: 'TK-004', task: '广东监管公告增量', site: '广东省招标投标监管网', url: 'https://gdzbtb.gov.cn/notice/list', ruleId: 'RP-0003', ruleVersion: 'v2.0.1', status: '失败', discovered: 0, articles: 0, finishedAt: '07-16 12:50', duration: '0m11s', issue: '页面结构变化，列表定位失败', stage: '列表发现', retryOf: '', logs: ['12:50:00 执行开始', '12:50:08 GET /notice/list 200', '12:50:11 列表选择器匹配 0 个节点', '12:50:11 执行失败 PARSE_EMPTY'] },
  { id: 'EX-1481', taskId: 'TK-004', task: '广东监管公告增量', site: '广东省招标投标监管网', url: 'https://gdzbtb.gov.cn/notice/list', ruleId: 'RP-0003', ruleVersion: 'v2.0.1', status: '失败', discovered: 0, articles: 0, finishedAt: '07-16 10:50', duration: '0m10s', issue: '页面结构变化，列表定位失败', stage: '列表发现', retryOf: '', logs: ['10:50:00 执行开始', '10:50:07 GET /notice/list 200', '10:50:10 列表选择器匹配 0 个节点', '10:50:10 执行失败 PARSE_EMPTY'] },
]

export const initialArticles = [
  { id: 'AR-3204', title: '市中心医院医疗设备采购项目公开招标公告', site: '中国政府采购网', publishTime: '2026-07-16', collectedAt: '07-16 15:39', quality: '通过', executionId: 'EX-1487', ruleId: 'RP-0001', url: 'https://www.ccgp.gov.cn/cggg/zygg/202607/t20260716_3204.htm', content: '受采购人委托，现对市中心医院医疗设备采购项目进行公开招标。符合资格条件的供应商应在规定时间内获取采购文件并提交投标文件。' },
  { id: 'AR-3203', title: '政务云平台三期扩容建设项目竞争性磋商公告', site: '中国政府采购网', publishTime: '2026-07-16', collectedAt: '07-16 15:39', quality: '通过', executionId: 'EX-1487', ruleId: 'RP-0001', url: 'https://www.ccgp.gov.cn/cggg/zygg/202607/t20260716_3203.htm', content: '政务云平台三期扩容建设项目已具备采购条件，现采用竞争性磋商方式选择供应商。' },
  { id: 'AR-1860', title: '城市道路养护工程施工招标公告', site: '湖北省公共资源交易中心', publishTime: '2026-07-16', collectedAt: '07-16 15:29', quality: '通过', executionId: 'EX-1486', ruleId: 'RP-0002', url: 'https://ggzy.hubei.gov.cn/notice/1860', content: '城市道路养护工程施工项目现公开招标，建设内容包括道路修复、排水设施维护和交通组织优化。' },
  { id: 'AR-1859', title: '省属高校实验设备定点采购项目询价公告', site: '湖北省公共资源交易中心', publishTime: '2026-07-15', collectedAt: '07-16 15:29', quality: '内容噪声', executionId: 'EX-1486', ruleId: 'RP-0002', url: 'https://ggzy.hubei.gov.cn/notice/1859', content: '首页 > 采购公告 > 当前位置。省属高校实验设备定点采购项目现进行询价采购。版权所有，技术支持。' },
  { id: 'AR-12480', title: '智慧交通信号控制系统升级改造项目招标', site: '全国公共资源交易平台', publishTime: '2026-07-14', collectedAt: '07-16 15:23', quality: '重复待确认', executionId: 'EX-1485', ruleId: 'RP-0001', url: 'https://ggzy.gov.cn/project/12480', rawType: 'json', content: '智慧交通信号控制系统升级改造项目已批准建设，现对系统设备和集成服务进行公开招标。' },
]

export const initialIntakeBatches = [
  {
    id: 'IB-021',
    name: '湖北与江苏采购入口接入',
    status: '需处理',
    createdAt: '2026-07-16T15:58:00+08:00',
    updatedAt: '07-16 15:58',
    urls: [
      { id: 'URL-01', site: '湖北省公共资源交易中心', url: 'https://ggzy.hubei.gov.cn/notice/list', source: '输入', judgment: '已归属', confidence: 96, ruleId: 'RP-0002', samples: 5, status: '待审核', issue: '' },
      { id: 'URL-02', site: '江苏省政府采购网', url: 'https://ccgp-jiangsu.gov.cn/notice/list', source: '输入', judgment: '可确认', confidence: 88, ruleId: 'RP-0004', samples: 5, status: '待确认归属', issue: '' },
      { id: 'URL-03', site: '江苏省政府采购网', url: 'https://ccgp-jiangsu.gov.cn/notice/result', source: '自动发现', judgment: '已归属', confidence: 91, ruleId: 'RP-0004', samples: 0, status: '验证失败', issue: '列表定位失败' },
    ],
  },
  {
    id: 'IB-020',
    name: '四川招投标入口分析',
    status: '分析中',
    createdAt: '2026-07-16T15:40:00+08:00',
    updatedAt: '07-16 15:40',
    readyAt: Date.now() + 1400,
    urls: [
      { id: 'URL-04', site: '四川省招标投标网', url: 'https://cdzbtb.com/notice/list', source: '输入', judgment: '识别中', confidence: 0, ruleId: '', samples: 0, status: '分析中', issue: '' },
    ],
  },
  {
    id: 'IB-019',
    name: '中国政府采购中央公告验证',
    status: '已完成',
    createdAt: '2026-07-16T14:12:00+08:00',
    updatedAt: '07-16 14:12',
    urls: [
      { id: 'URL-05', site: '中国政府采购网', url: 'https://www.ccgp.gov.cn/cggg/zygg/', source: '输入', judgment: '已归属', confidence: 98, ruleId: 'RP-0001', samples: 5, status: '已通过', issue: '' },
    ],
  },
]

const htmlExtractionSkill = `---
name: html-extraction
version: 2.4.1
---

# HTML 列表与正文提取

## 输入契约
- entry_url
- sample_html
- site_access_policy

## 输出契约
- list_discovery_rule
- detail_extraction_rule
- quality_gates

## 发布门禁
Golden Samples 必须全部通过，候选快照必须与回归快照一致。`

const jsonApiSkill = `---
name: json-api-discovery
version: 1.8.0
---

# JSON API 入口识别

## 输入契约
- entry_url
- network_samples
- response_schema

## 输出契约
- api_endpoint
- pagination_contract
- field_mapping

## 发布门禁
接口响应结构、翻页参数和字段映射必须通过 Golden Samples 回归。`

const accessRepairSkill = `---
name: restricted-access-repair
version: 1.2.0-rc.2
---

# 访问受限诊断与修复

## 输入契约
- blocked_url
- response_fingerprint
- current_access_policy

## 输出契约
- restriction_type
- recommended_strategy
- retry_policy

## 发布门禁
诊断结果不得泄露凭证，20 个受限访问样本必须全部通过。`

export const initialCapabilities = [
  {
    id: 'SK-001', name: 'HTML 列表与正文提取', version: 'v2.4.1', status: '已发布', rules: 42, successRate: '96.8%', updatedAt: '07-15 18:20',
    document: htmlExtractionSkill, publishedDocument: htmlExtractionSkill, regression: 'passed', goldenPassed: 20, goldenTotal: 20,
    history: [{ version: 'v2.4.1', status: '已发布', time: '07-15 18:20', operator: 'rule_maintainer' }, { version: 'v2.4.0', status: '已发布', time: '07-02 10:30', operator: 'rule_maintainer' }],
  },
  {
    id: 'SK-002', name: 'JSON API 入口识别', version: 'v1.8.0', status: '已发布', rules: 18, successRate: '98.2%', updatedAt: '07-14 10:05',
    document: jsonApiSkill, publishedDocument: jsonApiSkill, regression: 'passed', goldenPassed: 20, goldenTotal: 20,
    history: [{ version: 'v1.8.0', status: '已发布', time: '07-14 10:05', operator: 'rule_maintainer' }, { version: 'v1.7.2', status: '已发布', time: '06-28 16:12', operator: 'rule_maintainer' }],
  },
  {
    id: 'SK-003', name: '访问受限诊断与修复', version: 'v1.2.0-rc.2', status: '候选版本', rules: 9, successRate: '88.4%', updatedAt: '07-16 11:42',
    document: accessRepairSkill, publishedDocument: accessRepairSkill.replace('version: 1.2.0-rc.2', 'version: 1.1.0').replace('- retry_policy', '- access_evidence'), regression: 'pending', goldenPassed: 18, goldenTotal: 20,
    history: [{ version: 'v1.1.0', status: '已发布', time: '06-30 09:18', operator: 'rule_maintainer' }, { version: 'v1.0.0', status: '已发布', time: '06-12 14:42', operator: 'qidev_qi' }],
  },
]
