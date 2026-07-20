# Frontend Design QA

## Dashboard

## Source Truth

- Original prototype: `/Users/iiwish/daas/caiji3/docs/采集平台重设计-导出.html`
- User comparison screenshot: `/var/folders/my/cfl1vvhj0jgdz48pmvgc27lw0000gn/T/codex-clipboard-2ad4bc8e-cf97-4b96-8841-cc3f67806208.png`
- Extracted right-pane reference: `/Users/iiwish/daas/caiji3/docs/dashboard-redesign-qa-2026-07-20/source-html-right-pane.png`

## Implementation Evidence

- Desktop: `/Users/iiwish/daas/caiji3/docs/dashboard-redesign-qa-2026-07-20/dashboard-desktop-1440x900.png`
- Mobile top: `/Users/iiwish/daas/caiji3/docs/dashboard-redesign-qa-2026-07-20/dashboard-mobile-390x844.png`
- Mobile batch list: `/Users/iiwish/daas/caiji3/docs/dashboard-redesign-qa-2026-07-20/dashboard-mobile-table-390x844.png`
- State: `/dashboard`, default `今日` trend range, local prototype data.

## Comparison Evidence

- Full-view comparison: `/Users/iiwish/daas/caiji3/docs/dashboard-redesign-qa-2026-07-20/comparison-full.png`
- Focused KPI and health comparison: `/Users/iiwish/daas/caiji3/docs/dashboard-redesign-qa-2026-07-20/comparison-focus.png`
- The focused comparison covers the highest-priority fidelity region: search, four KPI cards, range control, trend chart, success-rate donut, and legend.

## Findings

- Visual hierarchy matches the HTML prototype: four KPI cards, trend and success-rate split view, then the recent-batch table.
- KPI values, deltas, chart shape, hover tooltip, future dotted line, success breakdown, status colors, and table density match the reference direction.
- Desktop audit at 1440x900 found no horizontal overflow in the document, main content, or dashboard descendants.
- Mobile audit at 390x844 found no horizontal overflow. KPI cards form a stable 2x2 grid, the chart and donut stack, and the table reduces to data source, count, and status.
- `今日 / 本周 / 本月` changes the chart dataset and title. Global search filters the recent-batch table; the browser check returned one Hubei row for `湖北`.
- KPI cards, recent rows, and `查看全部` preserve navigation to the existing React workflows.
- Five recent rows are shown because the React prototype currently has five execution records; the source screenshot's sixth row is not fabricated.
- Production build passes and the final browser reload produced no new console warnings or errors.

## Comparison History

1. P1: The previous React dashboard used a filter bar, five sparse metrics, one oversized linear chart, and a pending-only table. This diverged from the source's monitoring hierarchy. Resolved by rebuilding the dashboard around the source's four KPIs, health view, and recent-batch workflow.
2. P2: Browser review found Ant Design's deprecated `iconPosition` prop on `查看全部`. Resolved by using `iconPlacement="end"`; the final reload produced no new warning.
3. Final pass: Desktop and mobile screenshots show no remaining P0, P1, or P2 fidelity or usability findings.

## AI Analysis

### Source Truth

- Original prototype: `/Users/iiwish/daas/caiji3/docs/采集平台重设计-导出.html`
- User comparison screenshot: `/var/folders/my/cfl1vvhj0jgdz48pmvgc27lw0000gn/T/codex-clipboard-b4cd1d7c-0d43-4889-9ade-c4f8b90fff7f.png`
- Extracted right-pane reference: `/Users/iiwish/daas/caiji3/docs/ai-analysis-qa-2026-07-20/source-html-ai-right-pane.png`

### Implementation Evidence

- Desktop: `/Users/iiwish/daas/caiji3/docs/ai-analysis-qa-2026-07-20/ai-analysis-desktop-1280x720.png`
- Desktop configuration section: `/Users/iiwish/daas/caiji3/docs/ai-analysis-qa-2026-07-20/ai-analysis-config-1280x720.png`
- Mobile top and field details: `/Users/iiwish/daas/caiji3/docs/ai-analysis-qa-2026-07-20/ai-analysis-mobile-390x844.png`
- Mobile configuration and correction prompt: `/Users/iiwish/daas/caiji3/docs/ai-analysis-qa-2026-07-20/ai-analysis-mobile-config-390x844.png`
- State: `/ai`, Hubei source selected, local prototype data.

### Comparison Evidence

- Full-view comparison: `/Users/iiwish/daas/caiji3/docs/ai-analysis-qa-2026-07-20/comparison-ai-full.png`
- Focused workspace comparison: `/Users/iiwish/daas/caiji3/docs/ai-analysis-qa-2026-07-20/comparison-ai-detail.png`
- The focused comparison covers the analysis queue, source header, recognized fields, confidence, and collection-sample hierarchy.

### Findings

- The React page now follows the HTML prototype's master-detail workflow: analysis queue on the left and a complete review workspace on the right.
- Recognized fields expose the field name, technical identifier, selector, sample value, confidence, and raw HTML preview.
- Five trial collection samples are visible with links and raw-data inspection; the generated JSON configuration supports copy and manual correction.
- The correction prompt can launch a second analysis, while reanalysis and approval remain available in the detail header.
- Queue selection, configuration edit/cancel, and raw-data modal interactions passed browser checks.
- Desktop audit at 1280x720 found no horizontal overflow. Mobile audit at 390x844 found no document or main-content overflow; the queue becomes horizontally scrollable and tables reduce to the highest-priority columns.
- Five queue entries are shown because the React prototype currently contains five URL records; the source screenshot's four-item sample is not used to discard current prototype data.

### Comparison History

1. P1: The previous React page stopped at batch and URL attribution, so users could not review extraction output or approve a usable collector configuration. Resolved by restoring the full field, sample, JSON, and correction workflow from the HTML prototype.
2. P2: The first responsive pass compressed the queue header and action buttons at 390px. Resolved by allowing the queue summary to shrink and by giving detail actions stable equal-width controls.
3. Final pass: Side-by-side desktop comparison and mobile screenshots show no remaining P0, P1, or P2 fidelity or usability findings.

## Website Management

### Source Truth

- Original prototype: `/Users/iiwish/daas/caiji3/docs/采集平台重设计-导出.html`
- User comparison screenshot: `/var/folders/my/cfl1vvhj0jgdz48pmvgc27lw0000gn/T/codex-clipboard-21fda5b6-9188-4a5b-9968-577ad56655e1.png`
- Extracted right-pane reference: `/Users/iiwish/daas/caiji3/docs/sites-qa-2026-07-20/source-html-sites-right-pane.png`

### Implementation Evidence

- Desktop: `/Users/iiwish/daas/caiji3/docs/sites-qa-2026-07-20/sites-desktop-1280x900.png`
- Mobile: `/Users/iiwish/daas/caiji3/docs/sites-qa-2026-07-20/sites-mobile-390x844.png`
- State: `/sites`, all sources, list view, first page, local prototype data.

### Comparison Evidence

- Full-view comparison: `/Users/iiwish/daas/caiji3/docs/sites-qa-2026-07-20/comparison-sites-full.png`
- Focused workspace comparison: `/Users/iiwish/daas/caiji3/docs/sites-qa-2026-07-20/comparison-sites-workspace.png`
- The focused comparison covers KPI hierarchy, status filters, view controls, actions, table density, and source status treatment.

### Findings

- The React page now matches the HTML prototype's asset-management hierarchy: four summary metrics, status filters, list/card view switch, import/create actions, dense source table, and explicit pagination.
- Row actions follow source status: pending sources open AI analysis, analyzing sources open analysis review, and completed, paused, or abnormal sources open collection configuration.
- Filtering, list/card switching, pagination, and the source-detail modal passed browser interaction checks.
- Desktop audit at 1280x900 found no document or main-content horizontal overflow.
- Mobile audit at 390x844 found no document or main-content overflow. Metrics form a stable 2x2 grid; the source table uses an internal horizontal scroll region so status and actions remain reachable.
- The summary metrics retain the prototype's fleet totals while the table continues to use the current 28-source working dataset.

### Comparison History

1. P1: The previous React page omitted the fleet summary, view switch, explicit source actions, and page-level pagination. Resolved by rebuilding the list around the HTML prototype's full management workflow.
2. P2: The initial mobile table could clip hidden columns. Resolved by adding an internal horizontal scroll surface while keeping the document width stable.
3. Final pass: Side-by-side comparison and responsive screenshots show no remaining P0, P1, or P2 fidelity or usability findings.

## Collection Tasks

### Source Truth

- Original prototype: `/Users/iiwish/daas/caiji3/docs/采集平台重设计-导出.html`
- HTML task-list reference: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/source-html-tasks-list-1280x900.png`
- HTML configuration references: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/source-html-task-config-top-1280x900.png` and `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/source-html-task-config-bottom-1280x900.png`

### Implementation Evidence

- Desktop list: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/tasks-list-1280x900.png`
- Desktop configuration: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/task-config-top-1280x900.png` and `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/task-config-bottom-1280x900.png`
- Mobile list: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/tasks-list-mobile-390x844.png`
- Mobile configuration: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/task-config-mobile-390x844.png` and `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/task-config-mobile-bottom-390x844.png`
- State: `/tasks`, all sources, local prototype data; configuration evidence uses 中国政府采购网.

### Comparison Evidence

- Task list comparison: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/comparison-tasks-list.png`
- Configuration top comparison: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/comparison-task-config-top.png`
- Configuration bottom comparison: `/Users/iiwish/daas/caiji3/docs/tasks-qa-2026-07-20/comparison-task-config-bottom.png`

### Findings

- The React page follows the HTML prototype's collection-management hierarchy: status/mode filters, a dense source table, explicit source status, configuration actions, and pagination summary.
- Configuration is a full workspace rather than a modal. It includes task enablement, full/incremental mode, Cron and quick frequencies, concurrency, request interval, deduplication fields, retries, request headers, reset, save, and immediate execution.
- Source hosts are resolved from website assets before rule metadata, so a task bound to a shared or placeholder rule still displays the correct website domain.
- Filter switching, configuration entry, frequency changes, reset, header add/delete, and save feedback passed browser interaction checks.
- Desktop at 1280x900 preserves the reference's visual hierarchy. Mobile at 390x844 has no document or main-content horizontal overflow; the task table keeps configuration actions fixed at the right while the remaining columns use an internal horizontal scroll surface.
- The React list contains four task records because that is the current prototype SSOT. The HTML reference's additional sample rows are not fabricated.
- Production build passes, and the local `/tasks` route returns HTTP 200.

### Comparison History

1. P1: The previous task surface used a technical task table and modal-oriented editing, which obscured the source-centered collection workflow. Resolved by rebuilding it around the HTML list and full-page configuration model.
2. P1: The original configuration path did not expose the complete operational parameters shown in the HTML prototype. Resolved by restoring scheduling, advanced parameters, deduplication, headers, and explicit save/reset controls.
3. P2: The initial responsive table hid the configuration action beyond the scroll area. Resolved by fixing the action column to the right while preserving internal table scrolling.
4. Final pass: Side-by-side desktop comparison, mobile screenshots, and interaction tests show no remaining P0, P1, or P2 fidelity or usability findings.

## Failure Queue

### Source Truth

- Original prototype: `/Users/iiwish/daas/caiji3/docs/采集平台重设计-导出.html`
- HTML failure-queue reference: `/Users/iiwish/daas/caiji3/docs/failures-qa-2026-07-20/source-html-failures-1280x900.png`

### Implementation Evidence

- Desktop: `/Users/iiwish/daas/caiji3/docs/failures-qa-2026-07-20/failures-desktop-1280x900.png`
- Mobile: `/Users/iiwish/daas/caiji3/docs/failures-qa-2026-07-20/failures-mobile-390x844.png`
- Failure log: `/Users/iiwish/daas/caiji3/docs/failures-qa-2026-07-20/failure-log-dialog-1280x900.png`
- State: `/failures`, all errors, local prototype data.

### Comparison Evidence

- Full-view comparison: `/Users/iiwish/daas/caiji3/docs/failures-qa-2026-07-20/comparison-failures.png`
- The comparison covers navigation placement, four failure metrics, error filters, retry action, error metadata, and table density at the same 1280x900 viewport.

### Findings

- A dedicated failure queue now sits directly below collection records in the production navigation, with the source prototype's count badge and page metadata.
- The page matches the HTML hierarchy: four failure metrics, error-category filters, bulk retry, six representative failed pages, retry counts, timestamps, and row actions.
- Error search and category filtering work. Per-row and bulk retry actions enter the visible queue state and provide success feedback.
- The log action opens traceable failure evidence and links to a related collection record when one exists.
- Dashboard failure metrics, notifications, and the legacy `/executions?scope=needs-handling` entry now route to `/failures`. Collection records retain historical failed batches but no longer present failure handling as a list-level mode.
- Desktop at 1280x900 matches the source hierarchy. Mobile at 390x844 has no document or main-content horizontal overflow; metrics become a 2x2 grid and the table keeps row actions fixed while using internal horizontal scrolling.
- Production build passes, `/failures` returns HTTP 200, and the final browser check produced no warning or error logs.

### Comparison History

1. P1: Failure handling previously existed only as a filtered collection-record view, so users could not inspect page-level causes or retry individual failures. Resolved with the dedicated failure queue and evidence workflow.
2. P2: The first desktop table width hid retry and timestamp columns beneath the fixed action column. Resolved by rebalancing fixed column widths to preserve all six source columns at 1280px.
3. P2: Mobile needs both the source identity and recovery actions. Resolved by keeping the action column fixed and placing the remaining table width inside an internal scroll surface.
4. Final pass: Side-by-side desktop comparison, mobile screenshots, interaction tests, route checks, and browser logs show no remaining P0, P1, or P2 findings.

final result: passed
