# A2UIプロトコル詳解 — メッセージフォーマットを理解する

> A2UIがどのようなJSON構造でUIを表現するか、具体例とともに解説します。

---

## 目次

1. [プロトコルの全体像](#1-プロトコルの全体像)
2. [サーフェス（Surface）とは](#2-サーフェスsurfaceとは)
3. [メッセージの種類](#3-メッセージの種類)
4. [コンポーネントの隣接リストモデル](#4-コンポーネントの隣接リストモデル)
5. [完全なサンプルJSON — Todoリスト表示](#5-完全なサンプルjson--todoリスト表示)
6. [`<a2ui-json>` タグの役割](#6-a2ui-jsonタグの役割)
7. [よくある間違いと注意点](#7-よくある間違いと注意点)

---

## 1. プロトコルの全体像

A2UIの「プロトコル」とは、エージェントとフロントエンドが交わす**共通言語（JSON）**のことです。

LLMの返答テキストの中に `<a2ui-json>...</a2ui-json>` タグが含まれ、その中身がUIの定義です。

```
エージェントの返答テキスト（全体）:
┌─────────────────────────────────────────────┐
│ タスク一覧を表示します。                      │  ← 普通のテキスト
│                                              │
│ <a2ui-json>                                  │  ← ここからA2UI JSON
│ [                                            │
│   {"beginRendering": {...}},                 │  ← メッセージ1
│   {"surfaceUpdate":  {...}}                  │  ← メッセージ2
│ ]                                            │
│ </a2ui-json>                                 │  ← A2UI JSON ここまで
└─────────────────────────────────────────────┘
```

`parse_response()` がこのテキストを解析し、A2UI JSONを抽出します。

---

## 2. サーフェス（Surface）とは

**サーフェス**とは、UIが描画される「名前付き領域」です。

```
┌─────────────────────────────────────────────┐
│ Todo Agent                                   │
│ ┌─────────────────────────────────────────┐ │
│ │ [メッセージ入力欄] [送信]                 │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ ┌── surfaceId: "tasks" ───────────────────┐ │
│ │  My Tasks                               │ │
│ │  ┌─────────────────────────────────┐   │ │
│ │  │ 買い物     ✓ Done    Delete     │   │ │
│ │  └─────────────────────────────────┘   │ │
│ │  ┌─────────────────────────────────┐   │ │
│ │  │ 会議の準備  ✓ Done    Delete     │   │ │
│ │  └─────────────────────────────────┘   │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

- フロントエンドは `<A2UIRenderer surfaceId="tasks" />` を配置するだけ
- エージェントが `surfaceId: "tasks"` を指定してUIを更新する
- 複数のサーフェスを同時に管理できる（例: "tasks" と "detail-panel"）

---

## 3. メッセージの種類

A2UIのメッセージ配列には、主に2種類のメッセージが含まれます。

### 3.1 `beginRendering` — 描画開始の宣言

```json
{
  "beginRendering": {
    "surfaceId": "tasks",
    "root": "root"
  }
}
```

| フィールド | 説明 |
|---|---|
| `surfaceId` | このUIを表示するサーフェスのID |
| `root` | ルートコンポーネントのID（どのコンポーネントを最上位にするか） |

**役割**: 「これからサーフェス "tasks" にUIを描画します。ルートは "root" というIDのコンポーネントです」という宣言。

---

### 3.2 `surfaceUpdate` — コンポーネントの定義

```json
{
  "surfaceUpdate": {
    "surfaceId": "tasks",
    "components": [
      {
        "id": "root",
        "component": {
          "Column": {
            "children": {
              "explicitList": ["header", "task-list"]
            }
          }
        }
      }
    ]
  }
}
```

| フィールド | 説明 |
|---|---|
| `surfaceId` | 更新対象のサーフェスID |
| `components` | コンポーネントの配列（後述の隣接リスト） |

---

## 4. コンポーネントの隣接リストモデル

A2UIのUIツリーは**隣接リスト（Adjacency List）**で表現されます。

### なぜ隣接リストなのか？

ネストされたJSONツリーとの比較で理解しましょう。

#### 従来のネストアプローチ（A2UIでは使わない）

```json
{
  "type": "Column",
  "children": [
    {
      "type": "Text",
      "text": "My Tasks"
    },
    {
      "type": "Card",
      "children": [
        {
          "type": "Row",
          "children": [
            {"type": "Text", "text": "買い物"},
            {"type": "Button", "label": "Done"}
          ]
        }
      ]
    }
  ]
}
```

これは深くネストされ、LLMが生成・管理するには複雑です。

#### A2UIの隣接リストアプローチ

```json
"components": [
  {"id": "root",       "component": {"Column": {"children": {"explicitList": ["header", "task-1"]}}}},
  {"id": "header",     "component": {"Text":   {"text": {"literalString": "My Tasks"}}}},
  {"id": "task-1",     "component": {"Card":   {"child": "task-1-row"}}},
  {"id": "task-1-row", "component": {"Row":    {"children": {"explicitList": ["task-1-title", "task-1-done"]}}}}
  {"id": "task-1-title","component": {"Text":  {"text": {"literalString": "買い物"}}}},
  {"id": "task-1-done", "component": {"Button": {"child": "task-1-done-text", "action": {...}}}}
  {"id": "task-1-done-text", "component": {"Text": {"text": {"literalString": "✓ Done"}}}}
]
```

**すべてフラット（平ら）なリストで、IDで参照し合います。**

```
root
 ├── header (Text: "My Tasks")
 └── task-1 (Card)
      └── task-1-row (Row)
           ├── task-1-title (Text: "買い物")
           └── task-1-done (Button: "✓ Done")
```

### 隣接リストの利点

| 利点 | 説明 |
|---|---|
| **LLMが生成しやすい** | ネストを気にせず、1コンポーネント1エントリで書ける |
| **部分更新が容易** | 特定IDのコンポーネントだけ差し替えられる |
| **参照の一貫性** | IDで参照するため、構造が明確 |

---

## 5. 完全なサンプルJSON — Todoリスト表示

タスクが2件ある場合の完全なA2UI JSONです。

```json
[
  {
    "beginRendering": {
      "surfaceId": "tasks",
      "root": "root"
    }
  },
  {
    "surfaceUpdate": {
      "surfaceId": "tasks",
      "components": [

        // ─── ルートレイアウト ─────────────────────────────
        {
          "id": "root",
          "component": {
            "Column": {
              "children": {
                "explicitList": ["header", "task-list"]
              }
            }
          }
        },

        // ─── ヘッダー ─────────────────────────────────────
        {
          "id": "header",
          "component": {
            "Text": {
              "text": { "literalString": "My Tasks" },
              "usageHint": "h2"
            }
          }
        },

        // ─── タスクリストコンテナ ──────────────────────────
        {
          "id": "task-list",
          "component": {
            "Column": {
              "children": {
                "explicitList": ["task-1", "task-2"]
              }
            }
          }
        },

        // ─── タスク1 ──────────────────────────────────────
        {
          "id": "task-1",
          "component": { "Card": { "child": "task-1-row" } }
        },
        {
          "id": "task-1-row",
          "component": {
            "Row": {
              "children": {
                "explicitList": ["task-1-title", "task-1-complete", "task-1-delete"]
              }
            }
          }
        },
        {
          "id": "task-1-title",
          "component": {
            "Text": { "text": { "literalString": "買い物" } }
          }
        },
        {
          "id": "task-1-complete",
          "component": {
            "Button": {
              "child": "task-1-complete-text",
              "action": {
                "name": "complete_task",
                "context": [
                  { "key": "taskId", "value": { "literalString": "1" } }
                ]
              }
            }
          }
        },
        {
          "id": "task-1-complete-text",
          "component": {
            "Text": { "text": { "literalString": "✓ Done" } }
          }
        },
        {
          "id": "task-1-delete",
          "component": {
            "Button": {
              "child": "task-1-delete-text",
              "action": {
                "name": "delete_task",
                "context": [
                  { "key": "taskId", "value": { "literalString": "1" } }
                ]
              }
            }
          }
        },
        {
          "id": "task-1-delete-text",
          "component": {
            "Text": { "text": { "literalString": "Delete" } }
          }
        },

        // ─── タスク2（完了済み） ───────────────────────────
        {
          "id": "task-2",
          "component": { "Card": { "child": "task-2-row" } }
        },
        {
          "id": "task-2-row",
          "component": {
            "Row": {
              "children": {
                "explicitList": ["task-2-title", "task-2-complete", "task-2-delete"]
              }
            }
          }
        },
        {
          "id": "task-2-title",
          "component": {
            "Text": { "text": { "literalString": "[完了] 会議の準備" } }
          }
        }
        // ... (complete/deleteボタンは省略)
      ]
    }
  }
]
```

このJSONが `processMessages()` に渡されると、Reactが以下のUIをレンダリングします。

```
┌──────────────────────────────────────┐
│ My Tasks                             │  ← header (Text, h2)
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 買い物     [✓ Done]  [Delete]    │ │  ← task-1 (Card > Row)
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ [完了] 会議の準備  [✓ Done] [Delete]│ │  ← task-2 (Card > Row)
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

## 6. `<a2ui-json>` タグの役割

LLMは自然言語テキストとA2UI JSONを**同じ返答の中に**混在させられます。

```
"タスク「買い物」を追加しました。

<a2ui-json>
[{"beginRendering": ...}, {"surfaceUpdate": ...}]
</a2ui-json>"
```

### `parse_response()` の処理

```python
from a2ui.core.parser.parser import parse_response, has_a2ui_parts

response_text = """タスクを追加しました。
<a2ui-json>[{"beginRendering":...}]</a2ui-json>"""

# タグが含まれているか確認
if has_a2ui_parts(response_text):
    parts = parse_response(response_text)
    for part in parts:
        if part.a2ui_json:
            # A2UI JSONを取り出す → processMessages() に渡す
            print(part.a2ui_json)
        elif part.text:
            # 通常テキスト部分
            print(part.text)
```

> **重要**: `parse_response()` は `has_a2ui_parts()` が True の場合のみ呼び出してください。
> A2UIタグがない場合に呼ぶと `ValueError` が発生します。

---

## 7. よくある間違いと注意点

### ❌ NG: Buttonの `child` をインラインで書く

```json
// 間違い: childを直接オブジェクトで書いてしまう
{"id": "btn", "component": {"Button": {
  "child": {"Text": {"text": {"literalString": "Done"}}},
  "action": {...}
}}}
```

```json
// 正しい: childはIDの文字列で参照し、別エントリで定義する
{"id": "btn", "component": {"Button": {"child": "btn-text", "action": {...}}}},
{"id": "btn-text", "component": {"Text": {"text": {"literalString": "Done"}}}}
```

### ❌ NG: action.context をオブジェクトで書く

```json
// 間違い: contextをオブジェクト（ハッシュ）で書いてしまう
"action": {
  "name": "complete_task",
  "context": {"taskId": "1"}
}
```

```json
// 正しい: contextは {key, value} の配列
"action": {
  "name": "complete_task",
  "context": [
    {"key": "taskId", "value": {"literalString": "1"}}
  ]
}
```

### ❌ NG: children に直接配列を書く

```json
// 間違い: childrenを直接配列にする
"children": ["header", "task-1"]
```

```json
// 正しい: explicitListでラップする
"children": {"explicitList": ["header", "task-1"]}
```

### ❌ NG: text をただの文字列で書く

```json
// 間違い: textを文字列で書く
"text": "タスクタイトル"
```

```json
// 正しい: literalStringでラップする
"text": {"literalString": "タスクタイトル"}
```

---

## まとめ

| 概念 | ポイント |
|---|---|
| **サーフェス** | 名前付き描画領域。`surfaceId` で識別 |
| **beginRendering** | 「この surfaceId にこの root を描く」という宣言 |
| **surfaceUpdate** | フラットなcomponents配列でUIを定義 |
| **隣接リスト** | IDで参照し合う平らな構造。ネストしない |
| **Button.child** | 文字列（IDの参照）。別エントリで定義 |
| **action.context** | `[{key, value}]` の配列形式 |
| **text** | `{"literalString": "..."}` でラップ |

次のドキュメント: [03-components.md — コンポーネントカタログ](./03-components.md)
