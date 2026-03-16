# エージェントバックエンド実装 — ADK + A2UISchemaManager

> ADK（Agent Development Kit）を使ったPythonバックエンドの実装を解説します。
> エージェント開発初体験の方でも理解できるよう、基礎から説明します。

---

## 目次

1. [ADKとは何か？](#1-adkとは何か)
2. [プロジェクト構成](#2-プロジェクト構成)
3. [状態管理 — state.py](#3-状態管理--statepy)
4. [ツール関数 — tools.py](#4-ツール関数--toolspy)
5. [エージェント設定 — agent.py](#5-エージェント設定--agentpy)
6. [FastAPIサーバー — server.py](#6-fastapiサーバー--serverpy)
7. [全体の流れを追う](#7-全体の流れを追う)
8. [環境構築](#8-環境構築)

---

## 1. ADKとは何か？

**ADK（Agent Development Kit）** はGoogle製のPythonライブラリです。LLMエージェントの開発に必要な以下の機能を提供します。

```
ADKが提供するもの:
  ├── LlmAgent        : エージェントの定義（モデル + 指示 + ツール）
  ├── Runner          : エージェントの実行エンジン（非同期ループ）
  ├── SessionService  : 会話履歴の管理（誰が何を言ったか）
  ├── MemoryService   : 長期記憶（別会話をまたいだ記憶）
  └── ArtifactService : ファイルや画像などの成果物管理
```

### 「ツール」とは何か

ツール（Tool）は**LLMが呼び出せるPython関数**です。

```python
# これがツール
def add_task(title: str) -> str:
    """新しいタスクを追加します。

    Args:
        title: タスクのタイトル
    """
    task = state.add_task(title)
    return json.dumps({"added": task})
```

LLMは「タスクを追加して」というユーザーの要求に対して、
自分でこの関数を呼び出す判断をします。

```
ユーザー: "Buy milk を追加して"
  ↓
LLM（内部で考える）: "タスク追加のリクエストだ。add_task ツールを呼ぼう"
  ↓
LLM → add_task(title="Buy milk") を呼び出す
  ↓
ツール: {"added": {"id": 1, "title": "Buy milk"}} を返す
  ↓
LLM: 結果をもとに返答を生成（+ A2UI UIも生成）
```

### セッションとは

**セッション**は「1人のユーザーとの1つの会話スレッド」です。

```
user: "ミルクを追加して"
agent: "ミルクを追加しました"   ← セッション1のターン1
user: "それを完了にして"         ← 「それ」がミルクだとわかる（会話の文脈）
agent: "ミルクを完了にしました" ← セッション1のターン2
```

セッション内では過去の発言が記憶され、文脈を持った会話ができます。

---

## 2. プロジェクト構成

```
agent/
├── pyproject.toml          # 依存関係の定義（uvで管理）
├── .python-version         # Pythonバージョン（3.12推奨）
└── app/
    ├── __init__.py
    ├── state.py            # タスクの在庫（インメモリDB）
    ├── tools.py            # LLMが呼べる関数
    ├── agent.py            # LlmAgent + Runner の設定
    └── server.py           # FastAPI エンドポイント
```

### pyproject.toml の依存関係

```toml
[project]
name = "sample-a2ui-agent"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "google-adk>=1.8.0",       # ADKライブラリ
    "fastapi>=0.100.0",         # WebフレームワークAPI
    "uvicorn[standard]>=0.20.0",# ASGIサーバー
    "a2ui-agent",               # A2UI Python SDK
    "python-dotenv>=1.0.0",     # .envファイル読み込み
]

[tool.uv]
package = false                 # このプロジェクト自体はパッケージ化しない

[tool.uv.sources]
# a2ui-agentはローカルパスから取得（npm link的な）
a2ui-agent = { path = "/path/to/A2UI/agent_sdks/python" }
```

> `package = false` にしないと、uvがプロジェクト自体のビルドを試みてエラーになります。

---

## 3. 状態管理 — state.py

タスクデータをメモリ上で管理します（本番ではDBに置き換えます）。

```python
# app/state.py
from dataclasses import dataclass, field
from typing import List
import itertools

@dataclass
class Task:
    id: int
    title: str
    completed: bool = False

_tasks: List[Task] = []          # モジュールレベルでタスクを保持
_counter = itertools.count(1)    # ID採番（1, 2, 3, ...）


def get_tasks() -> List[Task]:
    """現在の全タスクを返す"""
    return list(_tasks)  # コピーを返す（外部から直接変更させない）


def add_task(title: str) -> Task:
    """新しいタスクを追加して返す"""
    task = Task(id=next(_counter), title=title)
    _tasks.append(task)
    return task


def complete_task(task_id: int) -> Task | None:
    """タスクを完了済みにする。見つからなければ None"""
    for task in _tasks:
        if task.id == task_id:
            task.completed = True
            return task
    return None


def delete_task(task_id: int) -> bool:
    """タスクを削除する。削除できたら True"""
    global _tasks
    before = len(_tasks)
    _tasks = [t for t in _tasks if t.id != task_id]
    return len(_tasks) < before
```

> **設計のポイント**: `state.py` はUIの概念を一切知りません。
> 純粋なデータ操作のみを担当します。これがA2UIの重要な分離です。

---

## 4. ツール関数 — tools.py

ADKのツール関数は「**LLMが呼べる通常のPython関数**」です。

```python
# app/tools.py
import json
from . import state


def list_tasks() -> str:
    """現在のタスク一覧を返します。"""
    tasks = state.get_tasks()
    data = [{"id": t.id, "title": t.title, "completed": t.completed} for t in tasks]
    return json.dumps(data, ensure_ascii=False)


def add_task(title: str) -> str:
    """新しいタスクを追加します。

    Args:
        title: タスクのタイトル
    """
    task = state.add_task(title)
    tasks = state.get_tasks()
    data = [{"id": t.id, "title": t.title, "completed": t.completed} for t in tasks]
    return json.dumps(
        {"added": {"id": task.id, "title": task.title}, "tasks": data},
        ensure_ascii=False
    )


def complete_task(task_id: int) -> str:
    """タスクを完了済みにします。

    Args:
        task_id: 完了にするタスクのID（整数）
    """
    result = state.complete_task(task_id)
    tasks = state.get_tasks()
    data = [{"id": t.id, "title": t.title, "completed": t.completed} for t in tasks]
    if result is None:
        return json.dumps({"error": f"Task {task_id} not found", "tasks": data}, ensure_ascii=False)
    return json.dumps({"completed": task_id, "tasks": data}, ensure_ascii=False)


def delete_task(task_id: int) -> str:
    """タスクを削除します。

    Args:
        task_id: 削除するタスクのID（整数）
    """
    deleted = state.delete_task(task_id)
    tasks = state.get_tasks()
    data = [{"id": t.id, "title": t.title, "completed": t.completed} for t in tasks]
    if not deleted:
        return json.dumps({"error": f"Task {task_id} not found", "tasks": data}, ensure_ascii=False)
    return json.dumps({"deleted": task_id, "tasks": data}, ensure_ascii=False)
```

### ツール設計のポイント

**1. docstringが重要**

```python
def add_task(title: str) -> str:
    """新しいタスクを追加します。

    Args:
        title: タスクのタイトル
    """
```

ADKはdocstringをLLMに渡します。LLMはこれを読んで「どのツールをいつ使うか」を判断します。docstringが充実しているほど、LLMが適切にツールを使えるようになります。

**2. ツールはデータだけを返す（UIは返さない）**

```python
# ✅ A2UIらしい実装: データだけ返す
return json.dumps({"added": {...}, "tasks": [...]})

# ❌ 間違った実装: ツールがA2UI JSONを生成する
return f'<a2ui-json>[{"beginRendering":...}]</a2ui-json>'
```

A2UIでは**LLMがUIの設計者**です。ツールはデータを提供するだけで、
UIの構造をどう表現するかはLLMが決めます。

**3. 常に最新のタスクリストを含めて返す**

操作後の全タスクリストを `tasks` フィールドに含めることで、
LLMが「操作後の状態でUI全体を再描画する」のに必要な情報を持てます。

---

## 5. エージェント設定 — agent.py

```python
# app/agent.py
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


# ─── システムプロンプトの構成要素 ───────────────────────────────

# 1. エージェントの役割説明
ROLE_DESCRIPTION = (
    "あなたはTodoリスト管理アシスタントです。"
    " ユーザーのリクエストに応じてタスクを管理し、必ず A2UI JSON UI を生成してレスポンスに含めてください。"
)

# 2. UIの生成ルール
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


# ─── A2UISchemaManager: スキーマ付きシステムプロンプトを生成 ────

schema_manager = A2uiSchemaManager(
    VERSION_0_8,                                      # スキーマバージョン
    catalogs=[BasicCatalog.get_config(version=VERSION_0_8)],  # 使うコンポーネントカタログ
    schema_modifiers=[remove_strict_validation],      # 厳密バリデーションを外す
)

INSTRUCTION = schema_manager.generate_system_prompt(
    role_description=ROLE_DESCRIPTION,
    ui_description=UI_DESCRIPTION,
    include_schema=True,     # コンポーネントスキーマをプロンプトに含める
    include_examples=False,  # 例を含めない（トークン節約）
)


# ─── LlmAgent の定義 ────────────────────────────────────────────

_agent = LlmAgent(
    model="gemini-2.5-flash",    # 使用するLLMモデル
    name="todo_agent",           # エージェントの内部名
    description="Todoリストを管理するエージェント",
    instruction=INSTRUCTION,     # システムプロンプト
    tools=[list_tasks, add_task, complete_task, delete_task],  # 使えるツール
)


# ─── Runner の設定 ───────────────────────────────────────────────

runner = Runner(
    app_name=_agent.name,
    agent=_agent,
    artifact_service=InMemoryArtifactService(),   # ファイル管理（未使用）
    session_service=InMemorySessionService(),      # 会話履歴（メモリ内）
    memory_service=InMemoryMemoryService(),        # 長期記憶（未使用）
)

USER_ID = "user"
```

### A2UISchemaManager の役割

```
generate_system_prompt() が生成するプロンプト（概念図）:

┌────────────────────────────────────────────────────────────┐
│ あなたはTodoリスト管理アシスタントです。...                   │ ← ROLE_DESCRIPTION
│                                                              │
│ ## A2UI Workflow                                             │
│ UIを返す場合は <a2ui-json>...</a2ui-json> で囲む            │ ← A2UIルール（自動追加）
│                                                              │
│ ## UI Instructions                                           │
│ タスク一覧は surfaceId "tasks" で...                        │ ← UI_DESCRIPTION
│                                                              │
│ ## Component Schema                                          │
│ ### Column                                                   │
│ {"children": {"explicitList": [...]}}                       │ ← スキーマ（自動追加）
│                                                              │
│ ### Button                                                   │
│ {"child": "...", "action": {"name": "...", ...}}            │
│ ...全コンポーネントのスキーマが続く                           │
└────────────────────────────────────────────────────────────┘
```

LLMはこのプロンプトを読んで、正しいA2UIフォーマットでUIを生成します。

### InMemory vs 永続化サービス

| サービス | InMemory | 本番用（永続化） |
|---|---|---|
| `SessionService` | `InMemorySessionService` | データベースバックエンド |
| `MemoryService` | `InMemoryMemoryService` | Vector DBなど |
| `ArtifactService` | `InMemoryArtifactService` | GCSなどのストレージ |

このサンプルではすべてメモリ内です。サーバー再起動でデータは消えます。

---

## 6. FastAPIサーバー — server.py

```python
# app/server.py
import logging
import re
from typing import Any

from dotenv import load_dotenv
load_dotenv()  # .envファイルからGEMINI_API_KEYを読み込む（最初に実行）

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.genai import types

from a2ui.core.parser.parser import parse_response, has_a2ui_parts
from .agent import runner, USER_ID

logger = logging.getLogger(__name__)

app = FastAPI(title="Sample A2UI Todo Agent")

# フロントエンド（Vite dev server）からのアクセスを許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


class ChatResponse(BaseModel):
    text: str          # LLMの返答テキスト（A2UIタグを除いたもの）
    messages: list[Any]  # A2UIメッセージ配列


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    app_name = runner.app_name  # "todo_agent"

    # ─── セッション管理（なければ作成） ───────────────────────
    session = await runner.session_service.get_session(
        app_name=app_name,
        user_id=USER_ID,
        session_id=request.session_id,
    )
    if session is None:
        session = await runner.session_service.create_session(
            app_name=app_name,
            user_id=USER_ID,
            session_id=request.session_id,
        )

    # ─── ユーザーメッセージの構築 ──────────────────────────────
    new_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=request.message)],
    )

    # ─── エージェント実行 ─────────────────────────────────────
    final_response_text = ""
    try:
        async for event in runner.run_async(
            user_id=USER_ID,
            session_id=session.id,
            new_message=new_message,
        ):
            if event.is_final_response():
                if event.content and event.content.parts:
                    final_response_text = "\n".join(
                        p.text for p in event.content.parts if p.text
                    )
                break
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    logger.info("Final response: %s", final_response_text[:300])

    # ─── A2UIパース ────────────────────────────────────────────
    a2ui_messages: list[Any] = []
    plain_text = final_response_text

    if has_a2ui_parts(final_response_text):
        try:
            parts = parse_response(final_response_text)
            for part in parts:
                if part.a2ui_json:
                    if isinstance(part.a2ui_json, list):
                        a2ui_messages.extend(part.a2ui_json)
                    else:
                        a2ui_messages.append(part.a2ui_json)
            # A2UIタグをテキストから除去
            plain_text = re.sub(
                r"<a2ui-json>.*?</a2ui-json>", "", final_response_text, flags=re.DOTALL
            ).strip()
        except Exception as e:
            logger.warning("Failed to parse A2UI response: %s", e)

    return ChatResponse(text=plain_text, messages=a2ui_messages)
```

### `runner.run_async()` のイベントループ

`runner.run_async()` は**ジェネレータ**です。エージェントの処理中に様々なイベントが発生します。

```
イベントの流れ:

  event(tool_call: add_task("Buy milk"))   ← ツール呼び出し
  event(tool_result: {"added": {...}})     ← ツール結果
  event(partial_response: "タスク...")    ← LLMの途中レスポンス
  event(final_response: "タスクを追加...<a2ui-json>...</a2ui-json>")  ← 最終レスポンス
```

`is_final_response()` が `True` になったイベントが最終的な返答です。

### A2UI JSONのパース処理

```python
if has_a2ui_parts(final_response_text):   # <a2ui-json> タグがあるか確認
    parts = parse_response(final_response_text)
    for part in parts:
        if part.a2ui_json:    # A2UIの部分
            a2ui_messages.extend(part.a2ui_json)
        # part.text はテキスト部分（自動で分離される）

    # テキストからA2UIタグを除去して plain_text を作る
    plain_text = re.sub(r"<a2ui-json>.*?</a2ui-json>", "", final_response_text, flags=re.DOTALL).strip()
```

---

## 7. 全体の流れを追う

「Buy milk を追加して」とユーザーが入力した場合：

```
1. フロントエンド → POST /chat {"message": "Buy milk を追加して", "session_id": "s123"}

2. server.py:
   - セッション取得（なければ作成）
   - runner.run_async() を呼ぶ

3. ADK（内部）:
   - LLMに会話履歴 + 新メッセージを送る
   - LLMが "add_task('Buy milk') を呼ぶ" と判断
   - add_task("Buy milk") を実行
   - ツール結果をLLMに返す

4. LLM（Gemini）:
   - ツール結果: {"added": {"id": 1, "title": "Buy milk"}, "tasks": [...]}
   - スキーマに従いA2UI JSONを生成
   - 返答: "追加しました！\n<a2ui-json>[...]</a2ui-json>"

5. server.py:
   - final_response_text を受け取る
   - has_a2ui_parts() → True
   - parse_response() → a2ui_messages = [{beginRendering}, {surfaceUpdate}]
   - plain_text = "追加しました！"

6. フロントエンドへの返却:
   {
     "text": "追加しました！",
     "messages": [{"beginRendering": ...}, {"surfaceUpdate": {...}}]
   }
```

---

## 8. 環境構築

### 必要なもの

- Python 3.10+（3.12推奨）
- [uv](https://docs.astral.sh/uv/) パッケージマネージャー
- Gemini API キー（[Google AI Studio](https://aistudio.google.com/) で取得）

### セットアップ

```bash
# 1. agentディレクトリに移動
cd sample-a2ui/agent

# 2. 依存関係インストール
uv sync

# 3. .envファイルにAPIキーを設定
echo "GEMINI_API_KEY=your_api_key_here" > .env

# 4. サーバー起動
uv run uvicorn app.server:app --reload --port 8000
```

### 起動確認

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "タスク一覧を見せて", "session_id": "test"}'
```

期待されるレスポンス:
```json
{
  "text": "現在タスクはありません。",
  "messages": [
    {"beginRendering": {"surfaceId": "tasks", "root": "root"}},
    {"surfaceUpdate": {"surfaceId": "tasks", "components": [...]}}
  ]
}
```

---

## まとめ

| ファイル | 役割 |
|---|---|
| `state.py` | タスクデータの保存・操作。UIを知らない純粋なデータ層 |
| `tools.py` | LLMが呼べる関数。データを返すだけ（UI生成はしない） |
| `agent.py` | `A2UISchemaManager` でスキーマ付きプロンプトを生成し、`LlmAgent` と `Runner` を設定 |
| `server.py` | FastAPIエンドポイント。ADKを非同期実行し、A2UIをパースして返す |

次のドキュメント: [05-react-frontend.md — Reactフロントエンド実装](./05-react-frontend.md)
