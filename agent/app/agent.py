from google.adk.agents.llm_agent import LlmAgent
from google.adk.runners import Runner
from google.adk.artifacts import InMemoryArtifactService
from google.adk.sessions import InMemorySessionService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService

from a2ui.core.schema.constants import VERSION_0_8
from a2ui.core.schema.manager import A2uiSchemaManager
from a2ui.basic_catalog.provider import BasicCatalog
from a2ui.core.schema.common_modifiers import remove_strict_validation

from .tools import list_tasks, add_task, complete_task, delete_task

ROLE_DESCRIPTION = (
    "あなたはTodoリスト管理アシスタントです。"
    " ユーザーのリクエストに応じてタスクを管理し、必ず A2UI JSON UI を生成してレスポンスに含めてください。"
)

UI_DESCRIPTION = """
タスク一覧を表示する際は必ず以下の構造で A2UI JSON を生成してください：

- surfaceId は常に "tasks" を使用する
- root コンポーネントは Column（id: "root"）
- 子要素にヘッダー Text（usageHint: "h2", text: "My Tasks"）と、タスクの Column を含める
- タスクが0件の場合は空であることを示す Text を表示する
- タスクが1件以上の場合、各タスクを Card でラップし、その中に Row を配置する
  - Row の子要素：タスクのタイトル Text、"✓ Done" Button、"Delete" Button
  - "✓ Done" Button の action: name="complete_task", context=[{key:"taskId", value:{literalString:"<id>"}}]
  - "Delete" Button の action: name="delete_task", context=[{key:"taskId", value:{literalString:"<id>"}}]
  - 完了済みタスクのタイトルは "[完了] " プレフィックスをつける
- UIからアクション JSON（{"userAction": {"name": "...", "context": {...}}}）を受け取った場合は、
  name と context.taskId を読み取って対応するツールを呼び出す（taskId は int に変換）
"""

schema_manager = A2uiSchemaManager(
    VERSION_0_8,
    catalogs=[BasicCatalog.get_config(version=VERSION_0_8)],
    schema_modifiers=[remove_strict_validation],
)

INSTRUCTION = schema_manager.generate_system_prompt(
    role_description=ROLE_DESCRIPTION,
    ui_description=UI_DESCRIPTION,
    include_schema=True,
    include_examples=False,
)

_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="todo_agent",
    description="Todoリストを管理するエージェント",
    instruction=INSTRUCTION,
    tools=[list_tasks, add_task, complete_task, delete_task],
)

runner = Runner(
    app_name=_agent.name,
    agent=_agent,
    artifact_service=InMemoryArtifactService(),
    session_service=InMemorySessionService(),
    memory_service=InMemoryMemoryService(),
)

USER_ID = "user"
