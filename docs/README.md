# A2UI ドキュメント

> ADK + A2UI を使ったエージェント開発を学ぶためのガイドです。
> エージェント開発が初めてのエンジニアでもわかるように書かれています。

---

## ドキュメント一覧

| # | ドキュメント | 内容 |
|---|---|---|
| 1 | [A2UIとは何か？](./01-what-is-a2ui.md) | 背景・目的・3レイヤー構成の全体像 |
| 2 | [A2UIプロトコル詳解](./02-protocol.md) | メッセージフォーマット・隣接リストモデル |
| 3 | [コンポーネントカタログ](./03-components.md) | Column, Row, Card, Text, Button の使い方 |
| 4 | [エージェントバックエンド実装](./04-agent-backend.md) | ADK + A2UISchemaManager + FastAPI |
| 5 | [Reactフロントエンド実装](./05-react-frontend.md) | A2UIProvider + useA2UIActions + A2UIRenderer |
| 6 | [アクションライフサイクル](./06-action-lifecycle.md) | ボタンクリックからUI更新までの全ステップ |

---

## 推奨の読み順

```
初めての方:
  01 → 02 → 03 → 04 → 05 → 06
  （概念 → プロトコル → コンポーネント → 実装 → フロントエンド → 全体像）

コードを見てから理解したい方:
  04 → 05 → 06 → 01 → 02 → 03
  （実装から入り、概念・プロトコルで理解を深める）

特定のトピックを知りたい方:
  「UIが描画されない」 → 06（デバッグのヒント）
  「Buttonの書き方」  → 03（Button）または 02（よくある間違い）
  「onActionの仕組み」→ 05（A2UIProvider）または 06（パターンB）
```

---

## クイックスタート

```bash
# 1. バックエンド起動
cd agent
echo "GEMINI_API_KEY=your_key" > .env
uv sync
uv run uvicorn app.server:app --reload --port 8000

# 2. フロントエンド起動（別ターミナル）
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

動作確認:
- 「タスク一覧を見せて」と入力 → 空のタスクリストが表示される
- 「Buy milk を追加して」と入力 → タスクカードが表示される
- [✓ Done] ボタンをクリック → タスクが完了済みに更新される
- [Delete] ボタンをクリック → タスクが削除される
