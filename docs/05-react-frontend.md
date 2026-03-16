# Reactフロントエンド実装 — A2UIProvider & A2UIRenderer

> `@a2ui/react` ライブラリを使ったフロントエンドの実装を解説します。
> Reactの経験があれば、A2UIの使い方はとてもシンプルです。

---

## 目次

1. [A2UI Reactライブラリの全体像](#1-a2ui-reactライブラリの全体像)
2. [A2UIProvider — コンテキストの提供](#2-a2uiprovider--コンテキストの提供)
3. [useA2UIActions — UIの操作](#3-usea2uiactions--uiの操作)
4. [A2UIRenderer — UIの描画](#4-a2uirenderer--uiの描画)
5. [App.tsx の完全な実装解説](#5-apptsx-の完全な実装解説)
6. [セッション管理](#6-セッション管理)
7. [Viteプロキシ設定](#7-viteプロキシ設定)
8. [フロントエンドの環境構築](#8-フロントエンドの環境構築)

---

## 1. A2UI Reactライブラリの全体像

`@a2ui/react` が提供するのは3つのシンプルなAPIです。

```
@a2ui/react が提供するもの:
  ├── A2UIProvider    : Context プロバイダー。onAction を受け取る
  ├── useA2UIActions  : Hook。processMessages, clearSurfaces, getSurfaces
  └── A2UIRenderer    : Component。surfaceId を指定するとUIを描画
```

使い方のイメージ:

```tsx
// App全体をA2UIProviderで包む
<A2UIProvider onAction={handleButtonClick}>
  {/* A2UIProviderの内側でuseA2UIActionsが使える */}
  <ShellContent />
</A2UIProvider>
```

```tsx
// A2UIProvider内のコンポーネントで
function ShellContent() {
  const { processMessages, clearSurfaces, getSurfaces } = useA2UIActions();

  // エージェントからの返答を処理
  processMessages(data.messages);

  // A2UIRendererがサーフェスを描画
  return <A2UIRenderer surfaceId="tasks" />;
}
```

---

## 2. A2UIProvider — コンテキストの提供

`A2UIProvider` はA2UIの**Reactコンテキスト**を提供するラッパーコンポーネントです。

```tsx
import { A2UIProvider } from '@a2ui/react';
import type { Types } from '@a2ui/react';

function App() {
  // ボタンクリック時に呼ばれるコールバック
  const handleAction = (actionMessage: Types.A2UIClientEventMessage) => {
    // actionMessage の中身:
    // {
    //   userAction: {
    //     name: "complete_task",
    //     context: { taskId: "1" }
    //   }
    // }
    console.log('User clicked:', actionMessage);
    // エージェントに送信する処理をここに書く
  };

  return (
    <A2UIProvider onAction={handleAction}>
      {/* この内側でuseA2UIActionsが使える */}
    </A2UIProvider>
  );
}
```

### `onAction` プロパティ

| プロパティ | 型 | 説明 |
|---|---|---|
| `onAction` | `(msg: A2UIClientEventMessage) => void` | Buttonがクリックされたときに呼ばれる |

**`A2UIClientEventMessage` の構造**:

```typescript
interface A2UIClientEventMessage {
  userAction: {
    name: string;                   // アクション名（例: "complete_task"）
    context: Record<string, unknown>; // コンテキスト（例: {taskId: "1"}）
  }
}
```

> 💡 **注意**: A2UI JSONの `action.context` は `[{key, value}]` 配列ですが、
> `onAction` コールバックに渡るときは `{key: value}` のオブジェクトに変換されています。

---

## 3. useA2UIActions — UIの操作

`useA2UIActions()` フックは、A2UIの状態を操作する3つの関数を返します。

```tsx
import { useA2UIActions } from '@a2ui/react';

function MyComponent() {
  const {
    processMessages, // メッセージを処理してUIを更新
    clearSurfaces,   // 全サーフェスをクリア
    getSurfaces,     // 現在のサーフェス一覧を取得
  } = useA2UIActions();
}
```

### `processMessages(messages)`

エージェントから受け取ったA2UIメッセージ配列を処理し、UIを更新します。

```tsx
const data = await fetch('/chat', { ... }).then(r => r.json());

// data.messages: [{beginRendering: ...}, {surfaceUpdate: ...}]
processMessages(data.messages);
// → A2UIRendererが自動的に再描画される
```

### `clearSurfaces()`

すべてのサーフェスのコンポーネントを削除します。
**新しいレスポンスを表示する前に呼ぶ**のが一般的なパターンです。

```tsx
const sendAndProcess = async (message: string) => {
  const data = await fetchFromAgent(message);

  clearSurfaces();          // まず古いUIをクリア
  processMessages(data.messages); // 新しいUIを適用
};
```

> なぜクリアが必要か？ `processMessages` は差分更新です。
> 古いサーフェスに新しいコンポーネントがマージされると意図しないUIになることがあります。
> タスク削除などで「前のUIの名残」が残らないよう、毎回クリアしてから適用します。

### `getSurfaces()`

現在登録されているサーフェスの `Map<string, Surface>` を返します。

```tsx
const surfaces = getSurfaces();
// Map { "tasks" => Surface {...} }

// サーフェスIDの一覧を取得
const surfaceEntries = Array.from(surfaces.entries());
// [["tasks", Surface {...}]]

// サーフェスが存在する場合だけレンダリング
{surfaceEntries.map(([surfaceId]) => (
  <A2UIRenderer key={surfaceId} surfaceId={surfaceId} />
))}
```

---

## 4. A2UIRenderer — UIの描画

`A2UIRenderer` は**指定したサーフェスのUIをReactコンポーネントとして描画**します。

```tsx
import { A2UIRenderer } from '@a2ui/react';

// surfaceId="tasks" のサーフェスを描画
<A2UIRenderer surfaceId="tasks" />
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `surfaceId` | `string` | 描画するサーフェスのID |

`processMessages()` で `surfaceId: "tasks"` のメッセージが処理されると、
`<A2UIRenderer surfaceId="tasks" />` が自動的に再描画されます。

**内部でやっていること（概念）**:
```
A2UIRenderer surfaceId="tasks"
  → サーフェス "tasks" の root コンポーネント = "root" (Column)
  → Column の children = ["header", "task-list"]
  → header: Text → <h2>My Tasks</h2>
  → task-list: Column
      → task-1: Card → <div class="card">
          → task-1-row: Row → <div class="row">
              → task-1-title: Text → <span>買い物</span>
              → task-1-complete: Button → <button onClick={() => onAction({userAction: {name: "complete_task", context: {taskId: "1"}}})}>
```

---

## 5. App.tsx の完全な実装解説

```tsx
// src/App.tsx
import { useState, useCallback, useRef, useEffect, FormEvent } from 'react';
import { A2UIProvider, A2UIRenderer, useA2UIActions } from '@a2ui/react';
import type { Types } from '@a2ui/react';

const SESSION_ID = `session-${Date.now()}`; // ページロードごとに新しいセッションID
```

### なぜ2つのコンポーネントに分けるのか？

```tsx
// ❌ 1つのコンポーネントにまとめようとすると...
function App() {
  const { processMessages } = useA2UIActions(); // ← エラー！
  // useA2UIActionsはA2UIProviderの内側で呼ぶ必要がある
  return <A2UIProvider>...</A2UIProvider>;
}
```

`useA2UIActions()` は `A2UIProvider` が提供するContextを使います。
つまり**A2UIProviderの子コンポーネントの中でしか呼べません**。

```tsx
// ✅ A2UIProviderを外側に、useA2UIActionsを内側のコンポーネントに
function App() {
  // ↓ ここでは useA2UIActions は呼べない

  const sendAndProcessRef = useRef<...>(null);

  const handleAction = useCallback((actionMessage: Types.A2UIClientEventMessage) => {
    // ボタンクリック時: アクションをJSON文字列化してエージェントに送る
    sendAndProcessRef.current?.(JSON.stringify(actionMessage));
  }, []);

  return (
    <A2UIProvider onAction={handleAction}>
      <ShellContent sendAndProcessRef={sendAndProcessRef} />
      {/* ↑ この内側では useA2UIActions が呼べる */}
    </A2UIProvider>
  );
}
```

### `sendAndProcessRef` パターン

`handleAction`（`A2UIProvider` で定義）から `sendAndProcess`（`ShellContent` で定義）を呼ぶための仕組みです。

```tsx
// 問題: handleActionとsendAndProcessが異なるコンポーネントにある

// App (外側)
//   handleAction: ボタンクリック時に呼ばれる関数
//     → sendAndProcess を呼びたいが、ShellContent に定義されている

// ShellContent (内側)
//   sendAndProcess: エージェントにメッセージを送る関数
```

`useRef` を使って関数の参照を共有します：

```tsx
// App.tsx
const sendAndProcessRef = useRef<(...) => void | null>(null);

// ShellContent.tsx
useEffect(() => {
  // ShellContent が定義した sendAndProcess を ref に登録
  sendAndProcessRef.current = sendAndProcess;
}, [sendAndProcess, sendAndProcessRef]);

// これで handleAction から sendAndProcessRef.current() が呼べる
```

### ShellContent の実装

```tsx
function ShellContent({ sendAndProcessRef }: ShellContentProps) {
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string>('');
  const { processMessages, clearSurfaces, getSurfaces } = useA2UIActions();

  const sendAndProcess = useCallback(
    async (message: Types.A2UIClientEventMessage | string) => {
      try {
        setRequesting(true);
        setError(null);

        // messageはstring（テキスト入力）またはJSON文字列（ボタンクリック）
        const body = typeof message === 'string' ? message : JSON.stringify(message);

        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: body, session_id: SESSION_ID }),
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const data = await res.json();
        // data = { text: "追加しました", messages: [{beginRendering}, {surfaceUpdate}] }

        setResponseText(data.text || '');
        clearSurfaces();               // 古いUIを消す
        if (data.messages?.length > 0) {
          processMessages(data.messages); // 新しいUIを適用
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setRequesting(false);
      }
    },
    [clearSurfaces, processMessages]
  );

  // refに登録して App.handleAction から呼べるようにする
  useEffect(() => {
    sendAndProcessRef.current = sendAndProcess;
  }, [sendAndProcess, sendAndProcessRef]);

  const handleSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get('message') as string;
    if (!message?.trim()) return;
    // 入力欄をクリア
    (e.currentTarget.elements.namedItem('message') as HTMLInputElement).value = '';
    sendAndProcess(message);
  }, [sendAndProcess]);

  const surfaces = getSurfaces();
  const surfaceEntries = Array.from(surfaces.entries());

  return (
    <div className="shell">
      <h1 className="title">Todo Agent</h1>

      {/* チャット入力フォーム */}
      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          name="message"
          type="text"
          placeholder="例: タスク一覧を見せて / Buy milk を追加"
          disabled={requesting}
          autoComplete="off"
        />
        <button type="submit" disabled={requesting}>
          {requesting ? '...' : '送信'}
        </button>
      </form>

      {requesting && <div className="loading">考え中...</div>}
      {error && <div className="error">{error}</div>}
      {responseText && !requesting && (
        <div className="response-text">{responseText}</div>
      )}

      {/* A2UIサーフェスを描画 */}
      {!requesting && surfaceEntries.length > 0 && (
        <section className="surfaces">
          {surfaceEntries.map(([surfaceId]) => (
            <A2UIRenderer key={surfaceId} surfaceId={surfaceId} />
          ))}
        </section>
      )}
    </div>
  );
}
```

---

## 6. セッション管理

`SESSION_ID` はページロード時に1回だけ生成されます。

```tsx
const SESSION_ID = `session-${Date.now()}`;
// 例: "session-1710000000000"
```

これにより：
- **同じページセッション**では会話の文脈が保たれる（「それを完了にして」が機能する）
- **ページリロード**で新しいセッションが始まる（過去の会話は引き継がない）

バックエンドでは `session_id` をキーにセッションを管理します。

```python
# server.py
session = await runner.session_service.get_session(
    app_name=app_name,
    user_id=USER_ID,
    session_id=request.session_id,  # フロントから送られてくる
)
if session is None:
    session = await runner.session_service.create_session(...)
```

---

## 7. Viteプロキシ設定

フロントエンドは `localhost:5173` で動き、バックエンドは `localhost:8000` で動きます。
直接 `http://localhost:8000/chat` を叩くとCORSエラーになりますが、
Viteのプロキシ設定でシンプルに解決できます。

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chat': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['@a2ui/react'], // ローカルパッケージの最適化
  },
});
```

これで `fetch('/chat', ...)` が自動的に `http://localhost:8000/chat` に転送されます。

---

## 8. フロントエンドの環境構築

### 必要なもの

- Node.js 18+
- `@a2ui/react` ライブラリのビルド済みdist

### セットアップ

```bash
# 1. @a2ui/react のビルド（初回のみ）
cd /path/to/A2UI/renderers/react
npm install
npm run build  # dist/ ディレクトリが生成される

# 2. フロントエンドの依存関係インストール
cd sample-a2ui/frontend
npm install

# 3. 開発サーバー起動
npm run dev
# → http://localhost:5173 で起動
```

### package.json の依存関係

```json
{
  "dependencies": {
    "@a2ui/react": "file:../../A2UI/renderers/react",
    "@a2ui/web_core": "^0.8.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

> `@a2ui/web_core` は `@a2ui/react` の依存パッケージです。
> `file:` パスのパッケージの依存解決のために明示的に追加しています。

---

## まとめ

| API | 役割 | 使う場所 |
|---|---|---|
| `<A2UIProvider onAction={fn}>` | Contextの提供 + ボタンクリックハンドラ | アプリのルート |
| `useA2UIActions()` | UIの操作 | A2UIProvider内のコンポーネント |
| `processMessages(msgs)` | A2UIメッセージを処理してUI更新 | エージェントの返答受信後 |
| `clearSurfaces()` | 全UIをリセット | processMessages の前 |
| `getSurfaces()` | サーフェス一覧 | A2UIRenderer を動的に表示するとき |
| `<A2UIRenderer surfaceId="...">` | サーフェスの描画 | UI表示エリアに配置 |

次のドキュメント: [06-action-lifecycle.md — アクションライフサイクル完全解説](./06-action-lifecycle.md)
