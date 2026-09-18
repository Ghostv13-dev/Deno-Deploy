// Ambient stubs for validation only. Real types come from the "gramio"
// npm package and "@cloudflare/workers-types" once `npm install` runs.

declare module "gramio" {
  export interface RawMessage {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  }
  export interface RawCallbackQuery {
    id: string;
    from: { id: number; username?: string };
    data?: string;
    message?: RawMessage;
  }
  export interface RawChatJoinRequest {
    chat: { id: number };
    from: { id: number; username?: string; first_name?: string };
    date: number;
  }

  export interface Context {
    bot: Bot;
    text?: string;
    payload: RawMessage | RawCallbackQuery | RawChatJoinRequest | any;
    queryData?: any;
    data?: string;
    send(text: string, opts?: any): Promise<RawMessage>;
  }

  export type NextFunction = () => Promise<void>;

  export class Bot {
    constructor(token: string);
    command(name: string, handler: (context: Context) => any): this;
    on(event: string, handler: (context: Context) => any): this;
    callbackQuery(trigger: CallbackData<any> | string | RegExp, handler: (context: Context) => any): this;
    onStart(handler: (info: any) => any): this;
    onError(handler: (info: any) => any): this;
    use(handler: (context: Context) => any): this;
    start(opts?: any): Promise<void>;
    handleUpdate(update: unknown): Promise<void>;
    api: {
      sendMessage(params: any): Promise<RawMessage>;
      editMessageText(params: any): Promise<unknown>;
      editMessageReplyMarkup(params: any): Promise<unknown>;
      deleteMessage(params: any): Promise<unknown>;
      answerCallbackQuery(params: any): Promise<unknown>;
      approveChatJoinRequest(params: any): Promise<unknown>;
      declineChatJoinRequest(params: any): Promise<unknown>;
      [key: string]: (params: any) => Promise<any>;
    };
  }

  export class InlineKeyboard {
    url(text: string, url: string): this;
    text(text: string, data: string): this;
    row(): this;
  }

  export class CallbackData<Schema extends Record<string, unknown>> {
    constructor(id: string);
    number(key: string): this;
    string(key: string): this;
    pack(data: Schema): string;
  }
}

// --- Cloudflare Workers globals (subset actually used in this project) ---

declare global {
  interface D1Result<T = unknown> {
    results: T[];
    success: boolean;
  }
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    run(): Promise<D1Result>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
  }
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
  }

  interface KVNamespacePutOptions {
    expirationTtl?: number;
  }
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
    delete(key: string): Promise<void>;
  }

  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }

  interface ScheduledEvent {
    cron: string;
    scheduledTime: number;
  }
}

export {};
