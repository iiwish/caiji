# 本地 FastAPI 后端

该目录用于跑通单网站的本地闭环：

`导入网站 -> AI 分析 -> 审核规则 -> 生成采集计划 -> 采集第一页少量公告`

## 启动

建议使用 Python 3.13：

```bash
cd backend
python3.13 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn app.main:app --reload
```

另开两个终端启动隔离 Worker：

```bash
cd backend
.venv/bin/python -m app.worker --queue analysis
```

```bash
cd backend
.venv/bin/python -m app.worker --queue collection
```

API 文档位于 <http://127.0.0.1:8000/docs>。

## 北京公共资源交易平台演示

API 启动后执行：

```bash
cd backend
.venv/bin/python scripts/run_beijing_demo.py --limit 3
```

演示脚本会调用本机已经登录的 Codex CLI。AI 分析只读取保存在
`backend/data/runs/{job_id}` 中的第一页和少量详情样本，Codex 使用
`read-only` 沙箱，不直接访问目标网站。

为了避免本地 POC 变成开放代理，默认只允许访问
`ggzyfw.beijing.gov.cn`。可以通过 `COLLECTOR_ALLOWED_HOSTS` 增加测试域名。

## 数据和运行记录

- SQLite：`backend/data/collector.db`
- AI 证据、JSONL 事件和结果：`backend/data/runs/{job_id}`
- API 任务事件：`GET /api/jobs/{job_id}/events`
- 实时任务进度：`GET /api/jobs/{job_id}/stream`

长任务由独立 Worker 从 SQLite 任务表领取，不使用 FastAPI
`BackgroundTasks`。本地进程重启后，尚未领取的排队任务仍会保留。

`analysis` Worker 才会加载 Codex CLI 相关模块；`collection` Worker 只领取
采集任务，并使用已发布规则进行确定性解析。生产部署应只向 `analysis`
Worker 注入 Agent 凭据，采集 Worker 不配置任何模型或 Agent 权限。

## 当前边界

- 网站资产按规范化入口 URL 去重；同域名的不同路径分别建档，并各自保留一套规则和一个采集计划。
- 网站列表、任务、运行记录、文章和失败记录接口均提供服务端 `limit`
  参数，避免后续直接返回全量数据。
- AI 返回规则会先在第一页和样例详情上进行确定性校验，通过后才能审核发布。
- 本地 POC 使用 SQLite 自动建表；生产实现需要补充正式迁移工具、分布式任务队列、
  运行中任务心跳和多 Worker 抢占控制。
- 当前只允许白名单域名，防止本地采集 API 被当作任意 URL 代理使用。
