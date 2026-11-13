import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from 'react';
import { Button, Empty, Input, Switch, Tag, Typography } from 'antd';
import {
  createParser,
  init,
  JsonlBuffer,
  renderTreeFromStore,
  type A2uiParser,
  type A2uiTreeNode,
} from '@a2ui/core';
import { A2uiSurface, renderMap } from '@a2ui/react';
import { API_BASE_URL, streamAgent, streamChat } from './agent-client';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status: 'streaming' | 'done' | 'error';
  /** 用户附带的多模态图片 */
  images?: string[];
}

interface Feedback {
  type: 'success' | 'danger';
  text: string;
}

/** 单次请求最多附带的图片数量，与服务端保持一致 */
const MAX_IMAGES = 4;

let messageSeq = 0;

function nextMessageId(prefix: string): string {
  messageSeq += 1;
  return `${prefix}-${Date.now()}-${messageSeq}`;
}

function useA2uiStore(store: ReturnType<typeof init>) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

type ProtocolMessage = Record<string, unknown>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getMessageSurfaceId(message: ProtocolMessage): string | undefined {
  for (const key of ['surfaceUpdate', 'beginRendering', 'deleteSurface']) {
    const payload = message[key];

    if (isPlainRecord(payload) && typeof payload.surfaceId === 'string') {
      return payload.surfaceId;
    }
  }

  return undefined;
}

/** 把增量补丁合并进当前完整协议，供下一轮作为上下文 */
function mergeProtocolMessage(
  messages: ProtocolMessage[],
  incoming: ProtocolMessage,
): void {
  const surfaceId = getMessageSurfaceId(incoming);

  if (isPlainRecord(incoming.surfaceUpdate)) {
    const update = incoming.surfaceUpdate;
    const components = Array.isArray(update.components) ? update.components : [];
    const existing = messages.find(
      (message) =>
        isPlainRecord(message.surfaceUpdate) &&
        message.surfaceUpdate.surfaceId === surfaceId,
    );

    if (!existing) {
      messages.push(incoming);
      return;
    }

    const existingUpdate = existing.surfaceUpdate as Record<string, unknown>;
    const merged = Array.isArray(existingUpdate.components)
      ? [...existingUpdate.components]
      : [];

    for (const component of components) {
      if (!isPlainRecord(component) || typeof component.id !== 'string') {
        merged.push(component);
        continue;
      }

      const index = merged.findIndex(
        (item) => isPlainRecord(item) && item.id === component.id,
      );

      if (index === -1) merged.push(component);
      else merged[index] = component;
    }

    existingUpdate.components = merged;
    return;
  }

  if (isPlainRecord(incoming.beginRendering)) {
    const index = messages.findIndex(
      (message) =>
        isPlainRecord(message.beginRendering) &&
        message.beginRendering.surfaceId === surfaceId,
    );

    if (index === -1) messages.push(incoming);
    else messages[index] = incoming;
    return;
  }

  if (isPlainRecord(incoming.deleteSurface)) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (getMessageSurfaceId(messages[index]) === surfaceId) {
        messages.splice(index, 1);
      }
    }
    return;
  }

  messages.push(incoming);
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: '你好，我是 A2UI Agent。在左侧描述你想要的页面，服务端会返回 A2UI JSON，右侧实时渲染并展示协议代码。',
  status: 'done',
};

export default function App() {
  const [renderedTree, setRenderedTree] = useState<A2uiTreeNode | null>(null);
  const [store] = useState(() =>
    init(renderMap, (tree) => setRenderedTree(tree)),
  );
  const state = useA2uiStore(store);

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [chatOnly, setChatOnly] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedChars, setStreamedChars] = useState(0);
  const [protocolCount, setProtocolCount] = useState(0);
  const [protocolJson, setProtocolJson] = useState('');
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>(
    [],
  );
  const [showJson, setShowJson] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const codeRef = useRef<HTMLPreElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const parserRef = useRef<A2uiParser | null>(null);
  const protocolRef = useRef<ProtocolMessage[]>([]);

  // 新消息或流式进度更新时，聊天列表自动滚到底部
  useEffect(() => {
    const list = listRef.current;

    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  // JSON 代码面板在生成过程中自动跟随到底部
  useEffect(() => {
    const code = codeRef.current;

    if (!code || !isStreaming) return;

    const nearBottom =
      code.scrollHeight - code.scrollTop - code.clientHeight < 80;

    if (nearBottom) {
      code.scrollTop = code.scrollHeight;
    }
  }, [protocolJson, isStreaming]);

  // 高亮所有选中的组件
  useEffect(() => {
    const container = previewRef.current;

    if (!container) return;

    const selected = new Set(selectedComponentIds);

    container.querySelectorAll('[data-a2ui-id]').forEach((element) => {
      const id = element.getAttribute('data-a2ui-id');

      if (id && selected.has(id)) {
        element.setAttribute('data-a2ui-selected', 'true');
      } else {
        element.removeAttribute('data-a2ui-selected');
      }
    });
  }, [selectedComponentIds, renderedTree]);

  /**
   * Ctrl（Windows / Linux）或 Command（macOS）+ 点击预览组件：
   * 切换该组件的选中状态，支持一次选中多个。
   */
  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;

    const target = (event.target as HTMLElement).closest('[data-a2ui-id]');

    if (!target) return;

    const id = target.getAttribute('data-a2ui-id');

    if (!id) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedComponentIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  };

  const updateMessage = (id: string, patch: Partial<ChatMessage>) => {
    setMessages((previous) =>
      previous.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    );
  };

  /** 把本地图片转成 data URL，最多保留 MAX_IMAGES 张 */
  const addImages = (files: FileList | null) => {
    if (!files) return;

    const candidates = Array.from(files).filter((file) =>
      file.type.startsWith('image/'),
    );
    const remaining = MAX_IMAGES - images.length;

    for (const file of candidates.slice(0, remaining)) {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== 'string') return;

        setImages((previous) =>
          previous.length >= MAX_IMAGES
            ? previous
            : [...previous, reader.result as string],
        );
      };

      reader.readAsDataURL(file);
    }
  };

  const removeImage = (index: number) => {
    setImages((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  /** 清空上一次渲染结果，准备接收新一轮协议 */
  const resetRender = () => {
    store.setState({
      surfaceMap: {},
      hydrateNodeMap: {},
      errorMap: {},
      dataModelMap: {},
    });
    renderTreeFromStore(store);
  };

  /** 仅测试模型对话：不走 A2UI 生成 */
  const sendChat = async (content: string) => {
    const userMessageId = nextMessageId('user');
    const assistantMessageId = nextMessageId('assistant');
    const startedAt = Date.now();

    setInput('');
    setFeedback(null);
    setIsStreaming(true);
    setMessages((previous) => [
      ...previous,
      { id: userMessageId, role: 'user', text: content, status: 'done' },
      {
        id: assistantMessageId,
        role: 'assistant',
        text: '正在生成中…',
        status: 'streaming',
      },
    ]);

    let reply = '';

    try {
      await streamChat(content, {
        onTextDelta: (delta) => {
          reply += delta;
          updateMessage(assistantMessageId, { text: reply });
        },
      });

      updateMessage(assistantMessageId, {
        text: reply || '模型没有返回内容。',
        status: 'done',
      });
      setFeedback({
        type: 'success',
        text: `流式对话完成：${Date.now() - startedAt}ms`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      updateMessage(assistantMessageId, {
        text: `对话失败：${message}`,
        status: 'error',
      });
      setFeedback({
        type: 'danger',
        text: `调用 /api/chat/stream 失败：${message}。请确认 .env 中的 OPENAI_API_KEY 已配置。`,
      });
    } finally {
      setIsStreaming(false);
    }
  };

  /** 请求 A2UI Agent，流式解析协议并渲染 */
  const sendAgent = async (content: string) => {
    const userMessageId = nextMessageId('user');
    const assistantMessageId = nextMessageId('assistant');
    const pendingImages = images;
    const targetComponentIds =
      selectedComponentIds.length > 0 ? selectedComponentIds : undefined;
    const isUpdate =
      protocolRef.current.length > 0 && parserRef.current !== null;
    const currentProtocol = isUpdate
      ? JSON.stringify(protocolRef.current)
      : undefined;
    const history = messages
      .filter((message) => message.id !== 'welcome' && message.status !== 'error')
      .slice(-6)
      .map((message) => ({ role: message.role, content: message.text }));

    setInput('');
    setImages([]);
    setSelectedComponentIds([]);
    setFeedback(null);
    setStreamedChars(0);
    setIsStreaming(true);

    if (!isUpdate) {
      setProtocolCount(0);
      setProtocolJson('');
      resetRender();
      protocolRef.current = [];
      parserRef.current = null;
    }

    setMessages((previous) => [
      ...previous,
      {
        id: userMessageId,
        role: 'user',
        text: targetComponentIds
          ? `${content}\n\n[目标组件: ${targetComponentIds.join(', ')}]`
          : content,
        status: 'done',
        images: pendingImages.length > 0 ? pendingImages : undefined,
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        text: isUpdate ? '正在更新页面…' : '正在请求服务端…',
        status: 'streaming',
      },
    ]);

    // 数据模型统一由 Store 持有：Parser 解析时写入，渲染时读取
    let parser: A2uiParser;

    if (isUpdate && parserRef.current) {
      parser = parserRef.current;
    } else {
      parser = createParser(
        renderMap,
        store.getState().addError,
        store.getState().markHydrateNodeMounted,
        {
          getDataModel: (surfaceId) => store.getState().getDataModel(surfaceId),
          setDataModel: (surfaceId, model) =>
            store.getState().setDataModel(surfaceId, model),
          removeDataModel: (surfaceId) =>
            store.getState().removeDataModel(surfaceId),
          updateModel: (surfaceId, path, value) =>
            store.getState().updateModel(surfaceId, path, value),
        },
      );
      parserRef.current = parser;
    }

    const buffer = new JsonlBuffer();

    let chars = 0;
    let count = 0;
    let serverText = '';
    let hasServerText = false;

    const syncAndRender = () => {
      const result = parser.getResult();
      store.setState({
        surfaceMap: { ...result.surfaceMap },
        hydrateNodeMap: { ...result.hydrateNodeMap },
      });
      renderTreeFromStore(store);
    };

    const consume = (lines: string[]) => {
      if (lines.length === 0) return;

      for (const line of lines) {
        parser.parseLine(line);
        mergeProtocolMessage(protocolRef.current, JSON.parse(line));
        count += 1;
      }

      setProtocolCount(protocolRef.current.length);
      setProtocolJson(JSON.stringify(protocolRef.current, null, 2));
      syncAndRender();

      if (!hasServerText) {
        updateMessage(assistantMessageId, {
          text: isUpdate
            ? `正在更新页面… 已解析 ${count} 条变更`
            : `正在生成页面… 已解析 ${count} 条协议消息`,
        });
      }
    };

    try {
      await streamAgent(content, {
        images: pendingImages,
        currentProtocol,
        history,
        targetComponentIds,
        onChunk: (chunk) => {
          chars += chunk.length;
          setStreamedChars(chars);
          consume(buffer.append(chunk));
        },
        onTextDelta: (delta) => {
          hasServerText = true;
          serverText += delta;
          updateMessage(assistantMessageId, { text: serverText });
        },
        onMessage: (text) => {
          hasServerText = true;
          serverText = text;
          updateMessage(assistantMessageId, { text });
        },
      });

      // 流结束：把缓冲区里已完整的最后一批消息也解析掉
      consume(buffer.flush());

      const surfaceId = Object.keys(parser.getResult().surfaceMap)[0];

      if (hasServerText) {
        updateMessage(assistantMessageId, { status: 'done' });
      } else {
        updateMessage(assistantMessageId, {
          text: isUpdate
            ? count > 0
              ? `已更新 UI${surfaceId ? `（${surfaceId}）` : ''}，共 ${count} 条变更。`
              : '未检测到需要变更的界面内容。'
            : count > 0
              ? `已生成 UI${surfaceId ? `（${surfaceId}）` : ''}，共 ${count} 条协议消息。`
              : '服务端没有返回可渲染的协议消息。',
          status: 'done',
        });
      }
      setFeedback({
        type: 'success',
        text: `AG-UI 流式${
          isUpdate ? '更新' : '返回'
        }完成：${count} 条${isUpdate ? '变更' : '协议消息'} / ${chars} 字符`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      updateMessage(assistantMessageId, {
        text: `${isUpdate ? '更新' : '生成'}失败：${message}`,
        status: 'error',
      });
      setFeedback({
        type: 'danger',
        text: `调用 /api/agent 失败：${message}。请确认 Server 已在 ${API_BASE_URL} 启动。`,
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const send = async () => {
    const content = input.trim();

    if (!content || isStreaming) return;

    if (chatOnly) {
      await sendChat(content);
      return;
    }

    await sendAgent(content);
  };

  const copyJson = async () => {
    if (!protocolJson) return;

    try {
      await navigator.clipboard.writeText(protocolJson);
      setFeedback({ type: 'success', text: 'A2UI JSON 已复制到剪贴板' });
    } catch {
      setFeedback({ type: 'danger', text: '复制失败，请手动选择代码复制' });
    }
  };

  const activeSurface = Object.values(state.surfaceMap)[0];

  return (
    <main
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#f5f5f5',
      }}
    >
      {/* 左侧：对话区，占页面 30% */}
      <aside
        style={{
          width: '30%',
          minWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            A2UI Agent
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {chatOnly
              ? '仅测试模型对话能力，不生成 UI'
              : '输入需求，服务端返回 A2UI JSON 并实时渲染'}
          </Typography.Text>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
            }}
          >
            <Switch
              size="small"
              checked={chatOnly}
              onChange={(checked) => {
                setChatOnly(checked);

                if (checked) setSelectedComponentIds([]);
              }}
              disabled={isStreaming}
            />
            <Typography.Text style={{ fontSize: 12 }}>
              仅测试模型对话
            </Typography.Text>
          </div>
        </div>

        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: '#fafafa',
          }}
        >
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #f0f0f0' }}>
          {selectedComponentIds.length > 0 && !chatOnly ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                flexWrap: 'wrap',
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                目标组件：
              </Typography.Text>
              {selectedComponentIds.map((id) => (
                <Tag
                  key={id}
                  color="blue"
                  closable
                  onClose={() =>
                    setSelectedComponentIds((previous) =>
                      previous.filter((item) => item !== id),
                    )
                  }
                >
                  {id}
                </Tag>
              ))}
              <Button
                size="small"
                type="link"
                style={{ padding: 0 }}
                onClick={() => setSelectedComponentIds([])}
              >
                清空
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                下一条消息将针对这些组件
              </Typography.Text>
            </div>
          ) : null}

          {images.length > 0 ? (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 8,
                flexWrap: 'wrap',
              }}
            >
              {images.map((src, index) => (
                <div
                  key={`${index}-${src.slice(0, 24)}`}
                  style={{ position: 'relative' }}
                >
                  <img
                    src={src}
                    alt={`附件 ${index + 1}`}
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '1px solid #f0f0f0',
                      display: 'block',
                    }}
                  />
                  <button
                    type="button"
                    aria-label="移除图片"
                    onClick={() => removeImage(index)}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      padding: 0,
                      border: 'none',
                      borderRadius: 9,
                      background: 'rgba(0, 0, 0, 0.65)',
                      color: '#fff',
                      fontSize: 12,
                      lineHeight: '18px',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              addImages(event.target.files);
              event.target.value = '';
            }}
          />

          <Input.TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              chatOnly
                ? '输入任意内容测试模型对话，Enter 发送'
                : '描述你想要的页面，Enter 发送，Shift + Enter 换行'
            }
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={isStreaming}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!chatOnly ? (
                <Button
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || images.length >= MAX_IMAGES}
                >
                  添加图片
                </Button>
              ) : null}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {isStreaming
                  ? chatOnly
                    ? '对话中…'
                    : `生成中… 已接收 ${streamedChars} 字符`
                  : 'Enter 发送'}
              </Typography.Text>
            </div>
            <Button
              type="primary"
              onClick={() => void send()}
              loading={isStreaming}
              disabled={!input.trim()}
            >
              发送
            </Button>
          </div>
        </div>
      </aside>

      {/* 右侧：渲染预览 + A2UI JSON，占剩余 70% */}
      <section
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: 24,
          boxSizing: 'border-box',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {showJson ? '页面预览与 JSON' : '页面预览'}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {chatOnly
                ? '仅模型对话模式，暂不生成 UI'
                : showJson
                  ? '左侧为渲染结果，右侧为 A2UI 协议 JSON'
                  : '已隐藏 JSON 代码，仅显示渲染结果'}
            </Typography.Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {chatOnly ? <Tag color="blue">模型对话测试</Tag> : null}
            {chatOnly && isStreaming ? (
              <Tag color="processing">流式对话中</Tag>
            ) : null}
            {!chatOnly && isStreaming ? (
              <Tag color="processing">生成中</Tag>
            ) : null}
            {!chatOnly && !isStreaming && protocolCount > 0 ? (
              <Tag color="success">已完成</Tag>
            ) : null}
            {!chatOnly && protocolCount > 0 ? (
              <Tag>{protocolCount} 条消息</Tag>
            ) : null}
            {!chatOnly ? (
              <Button size="small" onClick={() => setShowJson((value) => !value)}>
                {showJson ? '隐藏' : '显示'}
              </Button>
            ) : null}
            {!chatOnly ? (
              <Button
                size="small"
                onClick={() => void copyJson()}
                disabled={!protocolJson}
              >
                复制 JSON
              </Button>
            ) : null}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
          {chatOnly ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                background: '#fff',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
              }}
            >
              <div style={{ margin: 'auto' }}>
                <Empty description="「仅测试模型对话」已开启，右侧不生成 UI" />
              </div>
            </div>
          ) : (
            <>
              {/* 渲染预览 */}
              <div
                style={{
                  flex: 1.1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#fff',
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: '#595959',
                  }}
                >
                  <span>预览</span>
                  <span style={{ color: '#bfbfbf' }}>
                    Ctrl / ⌘ + 点击可多选
                  </span>
                </div>
                <div
                  ref={previewRef}
                  className="a2ui-preview"
                  onClick={handlePreviewClick}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    overflow: 'auto',
                    padding: 24,
                    boxSizing: 'border-box',
                  }}
                >
                  {renderedTree ? (
                    <A2uiSurface styles={activeSurface?.styles}>
                      {renderedTree.vnode}
                    </A2uiSurface>
                  ) : (
                    <div style={{ margin: 'auto' }}>
                      <Empty description="生成过程中会逐步出现组件" />
                    </div>
                  )}
                </div>
              </div>

              {/* A2UI JSON */}
              {showJson ? (
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0f172a',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      color: '#94a3b8',
                    }}
                  >
                    <span>A2UI JSON</span>
                    <span>{protocolCount} 条消息</span>
                  </div>
                  <pre
                    ref={codeRef}
                    style={{
                      flex: 1,
                      minHeight: 0,
                      margin: 0,
                      padding: 16,
                      overflow: 'auto',
                      color: '#e2e8f0',
                      fontSize: 12,
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {protocolJson || '等待生成…'}
                  </pre>
                </div>
              ) : null}
            </>
          )}
        </div>

        {feedback ? (
          <Typography.Text type={feedback.type}>
            {feedback.text}
          </Typography.Text>
        ) : null}
      </section>
    </main>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 12px',
          borderRadius: 12,
          border: isUser ? 'none' : '1px solid #f0f0f0',
          background: isUser ? '#1677ff' : '#fff',
          color:
            message.status === 'error'
              ? '#cf1322'
              : isUser
                ? '#fff'
                : 'rgba(0, 0, 0, 0.88)',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.images?.length ? (
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 6,
              flexWrap: 'wrap',
            }}
          >
            {message.images.map((src, index) => (
              <img
                key={`${index}-${src.slice(0, 24)}`}
                src={src}
                alt={`附件 ${index + 1}`}
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 6,
                }}
              />
            ))}
          </div>
        ) : null}
        {message.text}
        {message.status === 'streaming' ? (
          <span className="a2ui-chat-cursor" />
        ) : null}
      </div>
    </div>
  );
}
