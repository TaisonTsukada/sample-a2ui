import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Task, TaskStatus } from '@lit/task';
import { v0_8 } from '@a2ui/lit';
import type { Action, AnyComponentNode, A2UIClientEventMessage } from '@a2ui/web_core';

// Register all a2ui-* custom elements as a side effect
const { Data, UI } = v0_8;
void (UI as unknown);

type Processor = ReturnType<typeof Data.createSignalA2uiMessageProcessor>;

@customElement('todo-agent-app')
export class TodoAgentApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #333;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .shell {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    .title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #1a73e8;
    }

    .chat-form {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .chat-form input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .chat-form input:focus {
      border-color: #1a73e8;
    }

    .chat-form button {
      padding: 10px 20px;
      background: #1a73e8;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .chat-form button:hover:not(:disabled) {
      background: #1558b0;
    }

    .chat-form button:disabled {
      background: #aaa;
      cursor: not-allowed;
    }

    .loading {
      text-align: center;
      color: #666;
      padding: 16px;
      font-style: italic;
    }

    .error {
      background: #fce8e6;
      color: #c5221f;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .response-text {
      background: #e8f0fe;
      color: #333;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .surfaces {
      margin-top: 8px;
    }
  `;

  private processor: Processor = Data.createSignalA2uiMessageProcessor();
  private sessionId = `session-${Date.now()}`;
  private _seq = 0;

  @state() accessor _request: { message: string; seq: number } | null = null;

  private chatTask = new Task(this, {
    args: () => [this._request] as const,
    task: async ([req], { signal }) => {
      if (!req) return null;

      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: req.message, session_id: this.sessionId }),
        signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      console.log('Agent response:', data);

      this.processor.clearSurfaces();
      if (data.messages?.length > 0) {
        this.processor.processMessages(data.messages);
      }

      return {
        text: (data.text || '') as string,
        surfaceIds: Array.from(this.processor.getSurfaces().keys()),
      };
    },
  });

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('a2uiaction', this.handleA2UIAction);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('a2uiaction', this.handleA2UIAction);
  }

  private handleA2UIAction = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      action: Action;
      sourceComponentId: string;
      sourceComponent: AnyComponentNode | null;
    };

    const { action, sourceComponentId, sourceComponent } = detail;

    const surfaceEl = (e.composedPath() as Element[]).find(
      (el) => el.tagName?.toLowerCase() === 'a2ui-surface'
    ) as (HTMLElement & { surfaceId?: string }) | undefined;
    const surfaceId = surfaceEl?.surfaceId ?? '';

    const context: { [k: string]: unknown } = {};
    if (action.context) {
      for (const { key, value } of action.context) {
        if (value.path !== undefined) {
          context[key] = sourceComponent
            ? this.processor.getData(sourceComponent, value.path, surfaceId)
            : null;
        } else if (value.literalString !== undefined) {
          context[key] = value.literalString;
        } else if (value.literalNumber !== undefined) {
          context[key] = value.literalNumber;
        } else if (value.literalBoolean !== undefined) {
          context[key] = value.literalBoolean;
        }
      }
    }

    const clientMsg: A2UIClientEventMessage = {
      userAction: {
        name: action.name,
        surfaceId,
        sourceComponentId,
        timestamp: new Date().toISOString(),
        ...(Object.keys(context).length > 0 ? { context } : {}),
      },
    };

    this._request = { message: JSON.stringify(clientMsg), seq: ++this._seq };
  };

  private handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).elements.namedItem('message') as HTMLInputElement;
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    this._request = { message, seq: ++this._seq };
  }

  render() {
    return html`
      <div class="shell">
        <h1 class="title">Todo Agent</h1>

        <form class="chat-form" @submit=${this.handleSubmit}>
          <input
            name="message"
            type="text"
            placeholder="例: タスク一覧を見せて / Buy milk を追加"
            ?disabled=${this.chatTask.status === TaskStatus.PENDING}
            autocomplete="off"
          />
          <button type="submit" ?disabled=${this.chatTask.status === TaskStatus.PENDING}>
            ${this.chatTask.status === TaskStatus.PENDING ? '...' : '送信'}
          </button>
        </form>

        ${this.chatTask.render({
          pending: () => html`<div class="loading">考え中...</div>`,
          complete: (result) =>
            result
              ? html`
                  ${result.text
                    ? html`<div class="response-text">${result.text}</div>`
                    : ''}
                  ${result.surfaceIds.length > 0
                    ? html`
                        <section class="surfaces">
                          ${result.surfaceIds.map(
                            (surfaceId) => html`
                              <a2ui-surface
                                .surfaceId=${surfaceId}
                                .processor=${this.processor}
                              ></a2ui-surface>
                            `
                          )}
                        </section>
                      `
                    : ''}
                `
              : '',
          error: (e) =>
            html`<div class="error">
              ${e instanceof Error ? e.message : 'エラーが発生しました'}
            </div>`,
        })}
      </div>
    `;
  }
}
