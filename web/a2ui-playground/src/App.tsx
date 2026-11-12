import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button, Empty, Input, Switch, Tag, Typography } from 'antd';
import {
  createParser,
  init,
  JsonlBuffer,
  renderTreeFromStore,
  type A2uiTreeNode,
} from '@a2ui/core';
import { renderMap } from '@a2ui/react';
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

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: '你好，我是 A2UI Agent。在左侧描述你想要的界面，我会调用服务端生成 A2UI 协议并实时渲染到右侧。',
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
  const [protocolMessages, setProtocolMessages] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 新消息或流式进度更新时，聊天列表自动滚到底部
  useEffect(() => {
    const list = listRef.current;

    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

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

  /** 仅测试模型对话：不走 A2UI 解析与渲染 */
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

  const send = async () => {
    const content = input.trim();

    if (!content || isStreaming) return;

    if (chatOnly) {
      await sendChat(content);
      return;
    }

    const userMessageId = nextMessageId('user');
    const assistantMessageId = nextMessageId('assistant');
    const pendingImages = images;

    setInput('');
    setImages([]);
    setFeedback(null);
    setStreamedChars(0);
    setProtocolMessages(0);
    setIsStreaming(true);
    setMessages((previous) => [
      ...previous,
      {
        id: userMessageId,
        role: 'user',
        text: content,
        status: 'done',
        images: pendingImages.length > 0 ? pendingImages : undefined,
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        text: '正在请求服务端…',
        status: 'streaming',
      },
    ]);

    resetRender();

    // 数据模型统一由 Store 持有：Parser 解析时写入，渲染时读取
    const parser = createParser(
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
    const buffer = new JsonlBuffer();

    let chars = 0;
    let count = 0;
    // 服务端返回的 assistant 文本；有值时优先于本地进度文案
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
        count += 1;
      }

      setProtocolMessages(count);
      syncAndRender();

      if (!hasServerText) {
        updateMessage(assistantMessageId, {
          text: `正在生成 UI… 已解析 ${count} 条协议消息`,
        });
      }
    };

    try {
      await streamAgent(content, {
        images: pendingImages,
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
          text:
            count > 0
              ? `已生成 UI${surfaceId ? `（${surfaceId}）` : ''}，共 ${count} 条协议消息。`
              : '服务端没有返回可渲染的协议消息。',
          status: 'done',
        });
      }
      setFeedback({
        type: 'success',
        text: `AG-UI 流式返回完成：${count} 条协议消息 / ${chars} 字符`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      updateMessage(assistantMessageId, {
        text: `生成失败：${message}`,
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

  const activeSurfaceId = Object.keys(state.surfaceMap)[0];
  const errorCount = Object.keys(state.errorMap).length;

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
              ? '仅测试模型对话能力，不渲染 A2UI 组件'
              : '输入需求，服务端返回 A2UI 协议并实时渲染'}
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
              onChange={setChatOnly}
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
                : '描述你想要的界面，Enter 发送，Shift + Enter 换行'
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

      {/* 右侧：组件预览区，占剩余 70% */}
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
              组件预览
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {chatOnly
                ? '仅模型对话模式，暂不渲染 UI'
                : activeSurfaceId
                  ? `surface: ${activeSurfaceId}`
                  : '等待服务端返回…'}
            </Typography.Text>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {chatOnly ? <Tag color="blue">模型对话测试</Tag> : null}
            {chatOnly && isStreaming ? (
              <Tag color="processing">流式对话中</Tag>
            ) : null}
            {!chatOnly && isStreaming ? (
              <Tag color="processing">流式生成中</Tag>
            ) : null}
            {!chatOnly && !isStreaming && protocolMessages > 0 ? (
              <Tag color="success">已完成</Tag>
            ) : null}
            {!chatOnly && protocolMessages > 0 ? (
              <Tag>{protocolMessages} 条消息</Tag>
            ) : null}
            {errorCount > 0 ? <Tag color="error">{errorCount} 个渲染错误</Tag> : null}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 24,
            background: '#fff',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            boxSizing: 'border-box',
          }}
        >
          {chatOnly ? (
            <Empty description="「仅测试模型对话」已开启，右侧不渲染 A2UI 组件" />
          ) : renderedTree ? (
            renderedTree.vnode
          ) : (
            <Empty description="在左侧输入需求并发送，生成的 UI 会显示在这里" />
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
          color: message.status === 'error' ? '#cf1322' : isUser ? '#fff' : 'rgba(0, 0, 0, 0.88)',
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
