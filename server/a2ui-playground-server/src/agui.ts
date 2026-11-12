// AG-UI 事件类型与 SSE 序列化

interface AguiBaseEvent {
  type: string;
  timestamp?: number;
}

export interface RunStartedEvent extends AguiBaseEvent {
  type: 'RUN_STARTED';
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent extends AguiBaseEvent {
  type: 'RUN_FINISHED';
  threadId: string;
  runId: string;
}

export interface RunErrorEvent extends AguiBaseEvent {
  type: 'RUN_ERROR';
  message: string;
  code?: string;
}

export interface StepStartedEvent extends AguiBaseEvent {
  type: 'STEP_STARTED';
  stepName: string;
}

export interface StepFinishedEvent extends AguiBaseEvent {
  type: 'STEP_FINISHED';
  stepName: string;
}

export interface TextMessageStartEvent extends AguiBaseEvent {
  type: 'TEXT_MESSAGE_START';
  messageId: string;
  role: 'assistant';
}

export interface TextMessageContentEvent extends AguiBaseEvent {
  type: 'TEXT_MESSAGE_CONTENT';
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends AguiBaseEvent {
  type: 'TEXT_MESSAGE_END';
  messageId: string;
}

/** 自定义事件：A2UI 协议文本通过 a2ui.jsonl.chunk 分块推送 */
export interface CustomEvent extends AguiBaseEvent {
  type: 'CUSTOM';
  name: string;
  value: unknown;
}

/** A2UI 协议分块事件名，与客户端约定保持一致 */
export const A2UI_CHUNK_EVENT = 'a2ui.jsonl.chunk';

export type AguiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | CustomEvent;

/** 序列化为 SSE 的 data 帧 */
export function toSseEvent(event: AguiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
