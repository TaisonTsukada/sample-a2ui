# コンポーネントカタログ — A2UI v0.8 BasicCatalog

> A2UIで使えるコンポーネントの一覧と使い方を解説します。

---

## 目次

1. [コンポーネントとは](#1-コンポーネントとは)
2. [レイアウト系コンポーネント](#2-レイアウト系コンポーネント)
   - [Column](#column)
   - [Row](#row)
3. [コンテナ系コンポーネント](#3-コンテナ系コンポーネント)
   - [Card](#card)
4. [コンテンツ系コンポーネント](#4-コンテンツ系コンポーネント)
   - [Text](#text)
5. [インタラクション系コンポーネント](#5-インタラクション系コンポーネント)
   - [Button](#button)
6. [コンポーネントの組み合わせパターン](#6-コンポーネントの組み合わせパターン)
7. [スキーマの仕組み — なぜLLMがこれを理解できるのか](#7-スキーマの仕組み--なぜllmがこれを理解できるのか)

---

## 1. コンポーネントとは

A2UIの各コンポーネントは**隣接リストのエントリ**として定義されます。

```json
{
  "id": "my-component",      // ← このコンポーネントのユニークID
  "component": {
    "ComponentType": {       // ← コンポーネントの種類
      // ... プロパティ
    }
  }
}
```

`component` オブジェクトのキーがコンポーネントの種類を決めます。
BasicCatalog v0.8 で使えるコンポーネントは以下のとおりです。

---

## 2. レイアウト系コンポーネント

### Column

**縦方向にコンポーネントを並べる**コンテナです。

```json
{
  "id": "my-column",
  "component": {
    "Column": {
      "children": {
        "explicitList": ["child-1", "child-2", "child-3"]
      }
    }
  }
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `children.explicitList` | `string[]` | 子コンポーネントのIDリスト（順番通りに縦並び） |

**使用例**:
```
┌─────────────────┐
│   child-1       │
│   child-2       │
│   child-3       │
└─────────────────┘
```

---

### Row

**横方向にコンポーネントを並べる**コンテナです。

```json
{
  "id": "my-row",
  "component": {
    "Row": {
      "children": {
        "explicitList": ["left-item", "right-item"]
      }
    }
  }
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `children.explicitList` | `string[]` | 子コンポーネントのIDリスト（順番通りに横並び） |

**使用例**:
```
┌───────────────────────────────────┐
│ left-item    right-item           │
└───────────────────────────────────┘
```

**Todoアプリでの使い方**:

```json
// タスクの1行：タイトル + ボタン2つを横並び
{
  "id": "task-1-row",
  "component": {
    "Row": {
      "children": {
        "explicitList": ["task-1-title", "task-1-complete-btn", "task-1-delete-btn"]
      }
    }
  }
}
```

---

## 3. コンテナ系コンポーネント

### Card

**カード風のスタイルで子コンポーネントをラップする**コンテナです。
1つの子コンポーネントだけを持てます。

```json
{
  "id": "my-card",
  "component": {
    "Card": {
      "child": "card-content"   // ← 子コンポーネントのID（1つだけ）
    }
  }
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `child` | `string` | 子コンポーネントのID（**文字列**、配列ではない） |

> ⚠️ **注意**: `child` は `children` ではなく単数形です。複数の子を持たせたい場合は、子に `Row` や `Column` を使います。

**使用例**:
```
┌────────────────────────────┐
│  card-content              │  ← ボーダー/シャドウつきのカード
└────────────────────────────┘
```

**Todoアプリでの使い方**:

```json
// Cardでタスクをラップ → その中にRowを入れる
[
  {"id": "task-1",     "component": {"Card": {"child": "task-1-row"}}},
  {"id": "task-1-row", "component": {"Row":  {"children": {"explicitList": [...]}}}},
]
```

---

## 4. コンテンツ系コンポーネント

### Text

**テキストを表示する**コンポーネントです。

```json
{
  "id": "my-text",
  "component": {
    "Text": {
      "text": {
        "literalString": "表示したいテキスト"
      },
      "usageHint": "h2"
    }
  }
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `text.literalString` | `string` | 表示するテキスト |
| `usageHint` | `string`（省略可） | 見出しレベルなどのヒント（`"h1"`, `"h2"`, `"h3"` など） |

> ⚠️ **注意**: `"text": "直接文字列"` ではなく、`{"literalString": "..."}` でラップが必要です。

**usageHint の使い方**:

```json
// 見出し（大）
{"id": "title", "component": {"Text": {"text": {"literalString": "My Tasks"}, "usageHint": "h2"}}}

// 通常テキスト（usageHintなし）
{"id": "desc", "component": {"Text": {"text": {"literalString": "タスクはまだありません"}}}}
```

---

## 5. インタラクション系コンポーネント

### Button

**クリックできるボタン**コンポーネントです。ボタンのラベルは子コンポーネントで定義します。

```json
{
  "id": "my-button",
  "component": {
    "Button": {
      "child": "my-button-label",   // ← ラベルとなるコンポーネントのID
      "action": {
        "name": "action_name",      // ← クリック時にエージェントに送るアクション名
        "context": [                // ← アクションに渡すパラメータ
          {
            "key":   "paramName",
            "value": {"literalString": "paramValue"}
          }
        ]
      }
    }
  }
},
// ラベル用Textは必ず別エントリで定義する
{
  "id": "my-button-label",
  "component": {
    "Text": {
      "text": {"literalString": "クリック"}
    }
  }
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `child` | `string` | ボタンのラベルとなるコンポーネントのID |
| `action.name` | `string` | アクションの名前（フロントの `onAction` に渡る） |
| `action.context` | `{key, value}[]` | アクションのパラメータ配列 |

> ⚠️ **注意**: `action.context` は**配列**です。オブジェクト（`{"key": "value"}`）ではありません。

**クリック時の流れ**:

```
[✓ Done] クリック
    ↓
onAction({ userAction: { name: "complete_task", context: { taskId: "1" } } })
    ↓
JSON.stringify してエージェントに送信
    ↓
エージェントが "taskId" を読み取って complete_task(1) を呼ぶ
```

**Todoアプリでの使い方**:

```json
// 完了ボタン（taskId=1）
{"id": "task-1-complete",
 "component": {"Button": {
   "child": "task-1-complete-text",
   "action": {
     "name": "complete_task",
     "context": [{"key": "taskId", "value": {"literalString": "1"}}]
   }
 }}},
{"id": "task-1-complete-text",
 "component": {"Text": {"text": {"literalString": "✓ Done"}}}},

// 削除ボタン（taskId=1）
{"id": "task-1-delete",
 "component": {"Button": {
   "child": "task-1-delete-text",
   "action": {
     "name": "delete_task",
     "context": [{"key": "taskId", "value": {"literalString": "1"}}]
   }
 }}},
{"id": "task-1-delete-text",
 "component": {"Text": {"text": {"literalString": "Delete"}}}}
```

---

## 6. コンポーネントの組み合わせパターン

### パターン1: シンプルなリスト

```json
[
  {"beginRendering": {"surfaceId": "list", "root": "root"}},
  {"surfaceUpdate": {
    "surfaceId": "list",
    "components": [
      {"id": "root",   "component": {"Column": {"children": {"explicitList": ["item-1", "item-2"]}}}},
      {"id": "item-1", "component": {"Text": {"text": {"literalString": "アイテム1"}}}},
      {"id": "item-2", "component": {"Text": {"text": {"literalString": "アイテム2"}}}}
    ]
  }}
]
```

```
item-1
item-2
```

---

### パターン2: カードリスト（Todoアプリの基本パターン）

```
root (Column)
 ├── header (Text: "My Tasks", h2)
 └── task-list (Column)
      ├── task-1 (Card)
      │    └── task-1-row (Row)
      │         ├── task-1-title (Text)
      │         ├── task-1-done (Button)
      │         │    └── task-1-done-text (Text)
      │         └── task-1-del (Button)
      │              └── task-1-del-text (Text)
      └── task-2 (Card)
           └── ...
```

```json
"components": [
  {"id": "root",             "component": {"Column": {"children": {"explicitList": ["header", "task-list"]}}}},
  {"id": "header",           "component": {"Text": {"text": {"literalString": "My Tasks"}, "usageHint": "h2"}}},
  {"id": "task-list",        "component": {"Column": {"children": {"explicitList": ["task-1"]}}}},
  {"id": "task-1",           "component": {"Card": {"child": "task-1-row"}}},
  {"id": "task-1-row",       "component": {"Row": {"children": {"explicitList": ["task-1-title", "task-1-done", "task-1-del"]}}}},
  {"id": "task-1-title",     "component": {"Text": {"text": {"literalString": "買い物"}}}},
  {"id": "task-1-done",      "component": {"Button": {"child": "task-1-done-text", "action": {"name": "complete_task", "context": [{"key": "taskId", "value": {"literalString": "1"}}]}}}},
  {"id": "task-1-done-text", "component": {"Text": {"text": {"literalString": "✓ Done"}}}},
  {"id": "task-1-del",       "component": {"Button": {"child": "task-1-del-text", "action": {"name": "delete_task", "context": [{"key": "taskId", "value": {"literalString": "1"}}]}}}},
  {"id": "task-1-del-text",  "component": {"Text": {"text": {"literalString": "Delete"}}}}
]
```

---

### パターン3: 空状態の表示

```json
"components": [
  {"id": "root",  "component": {"Column": {"children": {"explicitList": ["header", "empty-msg"]}}}},
  {"id": "header","component": {"Text": {"text": {"literalString": "My Tasks"}, "usageHint": "h2"}}},
  {"id": "empty-msg", "component": {"Text": {"text": {"literalString": "タスクはまだありません"}}}}
]
```

---

## 7. スキーマの仕組み — なぜLLMがこれを理解できるのか

「LLMがこんな細かいJSONフォーマットを知っているのか？」と疑問に思うかもしれません。

答えは: **`A2UISchemaManager` がシステムプロンプトにスキーマを埋め込むから**です。

```python
# agent.py
schema_manager = A2uiSchemaManager(
    VERSION_0_8,
    catalogs=[BasicCatalog.get_config(version=VERSION_0_8)],
    schema_modifiers=[remove_strict_validation],
)

INSTRUCTION = schema_manager.generate_system_prompt(
    role_description=ROLE_DESCRIPTION,
    ui_description=UI_DESCRIPTION,
    include_schema=True,   # ← これが True の場合、全コンポーネントのスキーマが含まれる
    include_examples=False,
)
```

生成されるシステムプロンプトには以下が含まれます：

```
[あなたはTodoリスト管理アシスタントです...]

## A2UI Protocol Rules
レスポンスにUIを含める場合は <a2ui-json>...</a2ui-json> タグで囲んでください。

## Component Schema
### Column
{
  "children": {
    "explicitList": ["string", ...]  // 子コンポーネントIDのリスト
  }
}

### Button
{
  "child": "string",  // 子コンポーネントのID
  "action": {
    "name": "string",
    "context": [{"key": "string", "value": {"literalString": "string"}}]
  }
}
// ... 全コンポーネントのスキーマが続く
```

LLMはこのスキーマ情報をもとに、正しいフォーマットでA2UI JSONを生成します。

### `remove_strict_validation` の役割

`remove_strict_validation` は**スキーマから厳密なバリデーション制約を外す**モディファイアです。

```python
schema_modifiers=[remove_strict_validation]
```

これにより：
- LLMが多少フォーマットを外れても許容される（スキーマのエラーで無効化されない）
- LLMが生成しやすいより柔軟なプロンプトになる

---

## コンポーネントID命名規則（推奨）

LLMへのUI説明で一貫した命名規則を使うと、生成されるJSONが管理しやすくなります。

```
{entity}-{index}-{role}-{detail}

例:
  task-1-row         (task 1 の row)
  task-1-title       (task 1 のタイトル Text)
  task-1-done        (task 1 の完了ボタン)
  task-1-done-text   (task 1 の完了ボタンのラベル)
```

---

## まとめ

| コンポーネント | 複数子 | 1つの子 | インタラクション |
|---|:---:|:---:|:---:|
| `Column` | ✅ `children.explicitList` | — | — |
| `Row` | ✅ `children.explicitList` | — | — |
| `Card` | — | ✅ `child` | — |
| `Text` | — | — | — |
| `Button` | — | ✅ `child` | ✅ `action` |

次のドキュメント: [04-agent-backend.md — エージェントバックエンド実装](./04-agent-backend.md)
