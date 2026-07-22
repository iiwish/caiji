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

### Collection Strategy Modes

#### Source Truth

- Original collection-management prototype: `/Users/iiwish/Downloads/采集平台重设计-导出.html`
- User comparison screenshot: `/var/folders/my/cfl1vvhj0jgdz48pmvgc27lw0000gn/T/codex-clipboard-f8b7e2c4-d611-4559-bf04-323bdf33ddcf.png`

#### Implementation Evidence

- Desktop strategy viewport: `/Users/iiwish/daas/caiji3/strategy-qa.png`
- Viewport: 1295x925 desktop.
- State: `/tasks?task=TK-001`, `定时增量` selected, `每 30 分钟` selected.

#### Findings

- The strategy workspace explicitly separates `全量采集` and `定时增量` as mutually exclusive collection modes.
- Full collection is described as historical backfill or data reconstruction; incremental collection is described as scheduled new-record collection with deduplication.
- Scheduling is a distinct section shared by both modes, with Cron editing, interpreted schedule copy, quick frequency presets, and the next execution time.
- The plan list, filters, create dialog, saved task data, dashboard type labels, and newly created execution records use the same explicit mode vocabulary.
- Switching between both modes, saving the selected mode, and restoring the persisted incremental state passed browser interaction checks.
- Typography, spacing, colors, borders, radii, controls, and copy match the provided reference while retaining the existing console design system. The page uses no image assets in this workflow.
- Production build and `git diff --check` pass. No P0, P1, or P2 findings remain.

#### Comparison History

1. P1: The lifecycle-oriented strategy mixed first-run state, historical scope, and continuous updates into one flow. Resolved with two explicit collection modes and a separate scheduling section.
2. P2: Execution state previously inferred full versus incremental behavior from bootstrap fields. Resolved by persisting `collectionMode` and copying it into each new collection execution.
3. Final pass: Joint source and implementation review at the same desktop viewport shows the intended mode and frequency hierarchy without layout regressions.

### Access Configuration Placement

#### Source Truth

- Original collection-management prototype: `/Users/iiwish/Downloads/采集平台重设计-导出.html`
- Focused request-header reference: `/var/folders/my/cfl1vvhj0jgdz48pmvgc27lw0000gn/T/codex-clipboard-a9991f59-27e7-434d-9737-f13b6c90e576.png`

#### Implementation Evidence

- Task configuration viewport: `/Users/iiwish/daas/caiji3/artifacts/tasks-access-config-focused.png`
- Focused comparison: `/Users/iiwish/daas/caiji3/artifacts/request-headers-comparison.png`
- Viewport: 1295x925 desktop.
- State: `/tasks?task=TK-005`, access and request-header configuration visible.

#### Findings

- Website details contain only Overview and Collection Rules; legacy `tab=access` links resolve to Overview without a blank panel.
- Task details contain the access URL, login mode, connection strategy, proxy strategy, dynamic credential fields, and editable request headers.
- The request-header card matches the reference hierarchy, inline heading treatment, input proportions, technical labels, and add/delete controls.
- Fonts, spacing, colors, borders, icons, and copy are consistent with the existing collection-management surface and the focused source reference.
- Login-mode selection reveals the relevant credential inputs. Request-header add/delete and task-level save/reset controls remain available.
- Browser verification found no warning or error logs. No P0, P1, or P2 findings remain.

#### Comparison History

1. P1: Access configuration lived in Website Management instead of Collection Task details. Resolved by moving the workflow into the task configuration page and removing the website tab.
2. P2: The first moved request-header section stacked its helper copy and used neutral button styling. Resolved by matching the reference's inline heading, indigo add action, 36px rows, and light input surfaces.
3. Final pass: Focused side-by-side comparison and browser interaction checks passed.

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
- The log action opens traceable page-level failure evidence without coupling the queue to the collection-record table.
- Collection records retain historical failed and partially failed batches, while failure recovery remains an independent page-level workflow in `/failures`.
- Desktop at 1280x900 matches the source hierarchy. Mobile at 390x844 has no document or main-content horizontal overflow; metrics become a 2x2 grid and the table keeps row actions fixed while using internal horizontal scrolling.
- Production build passes, `/failures` returns HTTP 200, and the final browser check produced no warning or error logs.

### Comparison History

1. P1: Failure handling previously existed only as a filtered collection-record view, so users could not inspect page-level causes or retry individual failures. Resolved with the dedicated failure queue and evidence workflow.
2. P2: The first desktop table width hid retry and timestamp columns beneath the fixed action column. Resolved by rebalancing fixed column widths to preserve all six source columns at 1280px.
3. P2: Mobile needs both the source identity and recovery actions. Resolved by keeping the action column fixed and placing the remaining table width inside an internal scroll surface.
4. Final pass: Side-by-side desktop comparison, mobile screenshots, interaction tests, route checks, and browser logs show no remaining P0, P1, or P2 findings.

## Collection Record Details

### Source Truth

- Original modal implementation: `/Users/iiwish/Downloads/采集平台重设计-导出.html`
- User reference screenshot: `/var/folders/my/cfl1vvhj0jgdz48pmvgc27lw0000gn/T/codex-clipboard-2863549c-ad2d-4762-8c7e-13f171a02c89.png`

### Implementation Evidence

- Desktop modal: `/Users/iiwish/daas/caiji3/docs/executions-detail-qa-2026-07-20/execution-detail-desktop-final.png`
- Expanded raw record: `/Users/iiwish/daas/caiji3/docs/executions-detail-qa-2026-07-20/execution-detail-expanded-final.png`
- Mobile modal: `/Users/iiwish/daas/caiji3/docs/executions-detail-qa-2026-07-20/execution-detail-mobile.png`
- State: `/executions/EX-1483`, 642-item partial-success batch, local prototype data.

### Findings

- Collection-record details open as an Ant Design modal over the record list instead of replacing the page.
- The Ant Design table matches the reference hierarchy: notice title, publish date, purchasing organization, type, pagination, and expandable rows.
- Expanding a row reveals the detail URL and scrollable `raw_html` payload without leaving the batch context.
- Modal search filters title, organization, type, date, and detail URL. Browser verification returned one row for `市中心医院` and updated the result summary.
- Direct `/executions/:executionId` links open the same list-and-modal state, preserving links from the dashboard, tasks, and articles.
- Desktop verification found no document or modal-table horizontal overflow. Mobile verification at 390x844 keeps search visible and confines wide table content to its internal scroll surface.
- Production build passes. Expand, search, pagination rendering, empty-batch handling, and close behavior use the same component.

### Comparison History

1. P1: The previous route opened a standalone troubleshooting page instead of showing collected detail rows. Resolved with a batch-detail modal tied to the record list.
2. P1: The HTML reference used a static custom table without the requested search capability. Resolved with an Ant Design table and searchable mock collection records.
3. P2: The first mobile pass hid the search input because its Ant Design wrapper matched a broad span rule. Resolved by targeting only the result-count label.
4. P2: The first compact desktop width clipped the type column. Resolved by rebalancing table columns; the final table client and scroll widths both measure 812px.
5. Final pass: Joint source/implementation review, desktop and mobile screenshots, and interaction tests show no remaining P0, P1, or P2 findings.

## Platform Model Configuration

### Source Truth

- User reference screenshot: `/var/folders/my/cfl1vvhj0jgdz48pmvgc27lw0000gn/T/codex-clipboard-c202b882-4491-4625-bc47-a5c1a2c4e9aa.png`
- Intended adaptation: preserve the reference information architecture while using the existing light console design system.

### Implementation Evidence

- Desktop page: `/Users/iiwish/daas/caiji3/docs/settings-model-qa-2026-07-20/settings-models-final.png`
- Add-model dialog: `/Users/iiwish/daas/caiji3/docs/settings-model-qa-2026-07-20/settings-model-modal.png`
- State: `/settings`, Platform Configuration selected, all model statuses visible.
- Browser viewport: 1280x720 CSS pixels; captured at device pixel ratio 2.

### Comparison Evidence

- Focused side-by-side comparison: `/Users/iiwish/daas/caiji3/docs/settings-model-qa-2026-07-20/model-config-comparison.png`
- The focused comparison covers the default/enhanced selectors, model-list hierarchy, columns, semantic states, and edit affordances. A separate full-view comparison was unnecessary because the reference contains only this settings region.

### Findings

- The platform configuration follows the reference hierarchy: default and enhanced model selectors, a dense model table, add action, provider/type/code/status columns, and edit controls.
- The light palette, typography, spacing, radii, borders, and Ant Design icons match the existing console rather than copying the reference's unrelated dark theme. Status colors remain semantically equivalent.
- Descriptive helper text and a status filter improve model selection and diagnosis without changing the reference workflow.
- Add and edit dialogs expose name, provider, type, code, status, and optional credentials. Duplicate provider/code validation and active-model disable protection cover the important error paths.
- The previous Prototype Data tab is absent. Platform Configuration, Users and Roles, and Audit Records remain available.
- Add-model open, form entry, save, pagination count update, modal close, and production build passed. The final fresh browser tab produced no console errors.
- The page uses no custom image assets; all visible symbols use the existing Ant Design icon library.

### Comparison History

1. P1: The previous platform configuration exposed one hardcoded model and budget value, so operators could not manage providers or default/enhanced roles. Resolved with the full selector and model-list workflow.
2. P2: The first browser interaction pass reported an Ant Design form-instance warning because the model form was mounted lazily. Resolved by keeping the modal form mounted with `forceRender`; the fresh-tab console check is clean.
3. Final pass: The focused source/implementation comparison and dialog screenshot show no remaining P0, P1, or P2 findings.

final result: passed
