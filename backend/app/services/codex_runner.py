import asyncio
import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from ..config import Settings


class CodexRunError(RuntimeError):
    def __init__(self, message: str, code: str = "codex_failed"):
        super().__init__(message)
        self.code = code


EventCallback = Callable[[dict[str, Any]], Awaitable[None]]


def build_analysis_prompt() -> str:
    return """
你是网站采集规则分析器。只读取当前目录中的 manifest.json、list.html 和 detail-*.html，
不得联网，不得修改文件，不得执行与分析无关的命令。

目标：为 manifest.json 中的网站生成一份可执行的 CSS 采集规则候选。

选择器语法：
- 普通 CSS 选择器默认提取元素文本。
- `selector::attr(name)` 提取属性。
- `selector::html` 提取元素内部 HTML。
- 列表字段的选择器相对于每个 list.item_selector 命中的元素。
- 详情字段的选择器相对于整份详情页面。
- 空字符串表示该可选字段无法可靠识别。

要求：
1. list.item_selector 必须只覆盖公告列表行，不得命中表头或导航。
2. list.link_selector 必须提取详情链接 href。
3. detail.content_selector 应覆盖完整公告正文，避免页头、页尾和导航。
4. 优先使用语义稳定的 class 或 meta 属性，避免 nth-child。
5. 仅针对第一页和样例详情验证，不推测未提供页面。
6. 最终只返回符合给定 JSON Schema 的对象。
""".strip()


async def run_codex_analysis(
    run_dir: Path,
    schema_path: Path,
    settings: Settings,
    on_event: EventCallback,
) -> tuple[dict[str, Any], str | None]:
    result_path = run_dir / "result.json"
    events_path = run_dir / "events.jsonl"
    stderr_path = run_dir / "stderr.log"
    command = [
        settings.codex_binary,
        "exec",
        "--ephemeral",
        "--json",
        "--sandbox",
        "read-only",
        "--cd",
        str(run_dir),
        "--output-schema",
        str(schema_path),
        "--output-last-message",
        str(result_path),
    ]
    if settings.codex_model:
        command.extend(["--model", settings.codex_model])
    command.append(build_analysis_prompt())

    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise CodexRunError(
            f"找不到 Codex CLI：{settings.codex_binary}", "codex_not_found"
        ) from exc

    thread_id: str | None = None
    stderr_chunks: list[bytes] = []

    async def read_stdout() -> None:
        nonlocal thread_id
        assert process.stdout is not None
        with events_path.open("w", encoding="utf-8") as events_file:
            async for raw_line in process.stdout:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                events_file.write(f"{line}\n")
                events_file.flush()
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    event = {"type": "unparsed", "message": line}
                if event.get("type") == "thread.started":
                    thread_id = event.get("thread_id")
                await on_event(event)

    async def read_stderr() -> None:
        assert process.stderr is not None
        async for chunk in process.stderr:
            stderr_chunks.append(chunk)

    readers = [asyncio.create_task(read_stdout()), asyncio.create_task(read_stderr())]
    try:
        await asyncio.wait_for(process.wait(), timeout=settings.codex_timeout_seconds)
        await asyncio.gather(*readers)
    except TimeoutError as exc:
        process.kill()
        await process.wait()
        for task in readers:
            task.cancel()
        raise CodexRunError("Codex 分析超时", "codex_timeout") from exc
    finally:
        stderr_path.write_bytes(b"".join(stderr_chunks))

    if process.returncode != 0:
        stderr = b"".join(stderr_chunks).decode("utf-8", errors="replace").strip()
        raise CodexRunError(
            stderr[-2000:] or f"Codex 退出码：{process.returncode}",
            "codex_failed",
        )
    if not result_path.exists():
        raise CodexRunError("Codex 未生成结构化结果", "codex_missing_output")

    try:
        result = json.loads(result_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CodexRunError(
            "Codex 返回结果不是有效 JSON", "codex_invalid_json"
        ) from exc
    return result, thread_id
