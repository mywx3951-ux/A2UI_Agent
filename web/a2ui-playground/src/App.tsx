import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button, Card, Modal, Space, Tree, Typography } from 'antd';
import {
  createParser,
  init,
  JsonlBuffer,
  parse,
  renderTreeFromStore,
  type A2uiParser,
  type A2uiTreeNode,
} from '@a2ui/core';
import { renderMap } from '@a2ui/react';
import simpleText from '../../../packages/a2ui-core/Mock/simple-text.json?raw';
import columnText from '../../../packages/a2ui-core/Mock/column-text.json?raw';
import nestedTree from '../../../packages/a2ui-core/Mock/nested-tree.json?raw';
import mixedTree from '../../../packages/a2ui-core/Mock/mixed-tree.json?raw';
import displayComponents from '../../../packages/a2ui-core/Mock/display-components.json?raw';
import containerComponents from '../../../packages/a2ui-core/Mock/container-components.json?raw';
import formComponents from '../../../packages/a2ui-core/Mock/form-components.json?raw';
import allComponents from '../../../packages/a2ui-core/Mock/all-components.json?raw';
import bindingProfile from '../../../packages/a2ui-core/Mock/binding-profile.json?raw';
import listTemplate from '../../../packages/a2ui-core/Mock/list-template.json?raw';
import shoppingCart from '../../../packages/a2ui-core/Mock/shopping-cart.json?raw';
import localUpdate from '../../../packages/a2ui-core/Mock/local-update.json?raw';
import componentUpdateInitial from '../../../packages/a2ui-core/Mock/component-update-initial.json?raw';
import componentUpdatePatch from '../../../packages/a2ui-core/Mock/component-update-patch.json?raw';

type MockKey =
  | 'text'
  | 'column'
  | 'nested'
  | 'mixed'
  | 'display'
  | 'container'
  | 'form'
  | 'all'
  | 'json'
  | 'list'
  | 'cart'
  | 'local'
  | 'update';

const MOCK_KEYS: MockKey[] = [
  'text',
  'column',
  'nested',
  'mixed',
  'display',
  'container',
  'form',
  'all',
  'json',
  'list',
  'cart',
  'local',
  'update',
];

const MOCKS: Record<
  MockKey,
  { label: string; jsonl: string; patch?: string }
> = {
  text: {
    label: '单个 Text',
    jsonl: simpleText,
  },
  column: {
    label: 'Column + 3 Text',
    jsonl: columnText,
  },
  nested: {
    label: '嵌套 Column',
    jsonl: nestedTree,
  },
  mixed: {
    label: 'Row + Column 混合',
    jsonl: mixedTree,
  },
  all: {
    label: '全部 18 个组件',
    jsonl: allComponents,
  },
  display: {
    label: '展示类组件',
    jsonl: displayComponents,
  },
  container: {
    label: '容器类组件',
    jsonl: containerComponents,
  },
  form: {
    label: '表单类组件',
    jsonl: formComponents,
  },
  json: {
    label: 'JSON 数组流（绑定）',
    jsonl: bindingProfile,
  },
  list: {
    label: '动态列表（template）',
    jsonl: listTemplate,
  },
  cart: {
    label: '购物车列表（template）',
    jsonl: shoppingCart,
  },
  local: {
    label: '本地更新（Button → Text）',
    jsonl: localUpdate,
  },
  update: {
    label: '组件增量更新',
    jsonl: componentUpdateInitial,
    patch: componentUpdatePatch,
  },
};

/** 模拟模型 token 输出的块大小与间隔 */
const STREAM_CHUNK_SIZE = 50;
const STREAM_INTERVAL_MS = 50;

/** 非 SSE 接口测试配置 */
const API_BASE_URL = 'http://localhost:3000';
const API_TEST_INPUT = '生成一个购物车页面';

function splitJsonl(jsonl: string): string[] {
  const buffer = new JsonlBuffer();
  return [...buffer.append(jsonl), ...buffer.flush()];
}

function useA2uiStore(store: ReturnType<typeof init>) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

interface TreeNodeData {
  key: string;
  title: string;
  children?: TreeNodeData[];
}

function toTreeData(node: A2uiTreeNode): TreeNodeData {
  return {
    key: node.id,
    title: `${node.id} · ${node.type}`,
    children:
      node.children.length > 0 ? node.children.map(toTreeData) : undefined,
  };
}

function collectTreeKeys(node: A2uiTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectTreeKeys)];
}

export default function App() {
  const [renderedTree, setRenderedTree] = useState<A2uiTreeNode | null>(null);
  const [store] = useState(() =>
    init(renderMap, (tree) => setRenderedTree(tree)),
  );
  const state = useA2uiStore(store);

  const [mockKey, setMockKey] = useState<MockKey>('nested');
  const [open, setOpen] = useState(false);
  const [receivedMessages, setReceivedMessages] = useState(0);
  const [receivedChars, setReceivedChars] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [patchApplied, setPatchApplied] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiFeedback, setApiFeedback] = useState<
    { type: 'success' | 'danger'; text: string } | null
  >(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const parserRef = useRef<A2uiParser | null>(null);

  const jsonl = MOCKS[mockKey].jsonl;
  const totalChars = jsonl.length;
  const totalMessages = useMemo(() => splitJsonl(jsonl).length, [jsonl]);

  const stopStreaming = () => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setIsStreaming(false);
  };

  const startStream = () => {
    stopStreaming();
    setApiFeedback(null);

    store.setState({
      surfaceMap: {},
      hydrateNodeMap: {},
      errorMap: {},
      dataModelMap: {},
    });
    setReceivedMessages(0);
    setReceivedChars(0);
    setIsStreaming(true);
    setPatchApplied(false);

    // 清空上一次的渲染树
    renderTreeFromStore(store);

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
    parserRef.current = parser;

    let cursor = 0;
    let messageCount = 0;

    const syncAndRender = () => {
      const result = parser.getResult();
      store.setState({
        surfaceMap: { ...result.surfaceMap },
        hydrateNodeMap: { ...result.hydrateNodeMap },
      });

      // 由 SDK 决定：状态更新后重新构建并调用 renderTree
      renderTreeFromStore(store);
    };

    const finish = (timer: ReturnType<typeof setInterval>) => {
      clearInterval(timer);
      if (streamTimerRef.current === timer) {
        streamTimerRef.current = null;
      }
      setIsStreaming(false);
    };

    const handleCompletedLines = (lines: string[]) => {
      if (lines.length === 0) return;

      for (const line of lines) {
        parser.parseLine(line);
        messageCount += 1;
      }

      setReceivedMessages(messageCount);
      syncAndRender();
    };

    const timer = setInterval(() => {
      if (cursor >= jsonl.length) {
        handleCompletedLines(buffer.flush());
        finish(timer);
        return;
      }

      // 模拟模型逐块输出原始 JSON 文本，而不是预先切好整行
      const chunk = jsonl.slice(cursor, cursor + STREAM_CHUNK_SIZE);
      cursor += chunk.length;
      setReceivedChars(cursor);

      handleCompletedLines(buffer.append(chunk));
    }, STREAM_INTERVAL_MS);

    streamTimerRef.current = timer;
  };

  /**
   * 模拟 LLM 第二轮返回：只发送差异组件，
   * Parser 按 id 覆盖对应节点，其他节点保持原对象。
   */
  const applyPatch = () => {
    const parser = parserRef.current;
    const patch = MOCKS[mockKey].patch;

    if (!parser || !patch || isStreaming) return;

    const buffer = new JsonlBuffer();
    const lines = [...buffer.append(patch), ...buffer.flush()];

    for (const line of lines) {
      parser.parseLine(line);
    }

    const result = parser.getResult();
    store.setState({
      surfaceMap: { ...result.surfaceMap },
      hydrateNodeMap: { ...result.hydrateNodeMap },
    });

    renderTreeFromStore(store);
    setPatchApplied(true);
  };

  // 首次进入和切换 Mock 时重新播放流式构建
  useEffect(() => {
    startStream();
    return () => stopStreaming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockKey]);

  const treeData = useMemo(
    () => (renderedTree ? [toTreeData(renderedTree)] : []),
    [renderedTree],
  );
  const expandedKeys = useMemo(
    () => (renderedTree ? collectTreeKeys(renderedTree) : []),
    [renderedTree],
  );

  const hasRenderedSurface = Object.keys(state.surfaceMap).length > 0;
  const activeSurfaceId =
    Object.keys(state.surfaceMap)[0] ?? Object.keys(state.dataModelMap)[0];

  const snapshot = {
    surfaceMap: state.surfaceMap,
    hydrateNodeMap: state.hydrateNodeMap,
    errorMap: state.errorMap,
    dataModelMap: state.dataModelMap,
  };

  /** 模拟客户端写回数据模型，验证 Store 驱动的重新渲染 */
  const simulateUpdateModel = () => {
    if (!activeSurfaceId) return;

    const model = store.getState().getDataModel(activeSurfaceId) ?? {};
    const cart = model.cart;

    // 购物车场景：向 /cart/items 追加一行，验证 dataModel 驱动的列表动态渲染
    if (cart !== null && typeof cart === 'object' && !Array.isArray(cart)) {
      const cartModel = cart as Record<string, unknown>;
      const items =
        cartModel.items !== null &&
        typeof cartModel.items === 'object' &&
        !Array.isArray(cartModel.items)
          ? (cartModel.items as Record<string, unknown>)
          : {};

      let index = Object.keys(items).length;

      while (`${index}` in items) index += 1;

      store.getState().updateModel(activeSurfaceId, `/cart/items/${index}`, {
        line: `新商品 ${index + 1} 🛒 1 ￥20.00`,
      });
      return;
    }

    const products = model.products;

    // 动态列表场景：往集合里追加一项，验证列表自动增长
    if (
      products !== null &&
      typeof products === 'object' &&
      !Array.isArray(products)
    ) {
      const keys = Object.keys(products);
      let index = keys.length + 1;

      while (`p${index}` in products) index += 1;

      store.getState().updateModel(activeSurfaceId, `/products/p${index}`, {
        name: `新商品 ${index}`,
        price: `¥${20 + index}`,
      });
      return;
    }

    store.getState().updateModel(activeSurfaceId, '/user/name', 'Grace Hopper');
  };

  /** 调用 Server 的非 SSE 接口，把返回的 messages 直接交给 Parser 渲染 */
  const testNonSseApi = async () => {
    stopStreaming();
    setApiLoading(true);
    setApiFeedback(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ input: API_TEST_INPUT }),
      });

      const payload = (await response.json()) as {
        messages?: unknown[];
        meta?: { model?: string; durationMs?: number };
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      }

      if (!Array.isArray(payload.messages)) {
        throw new Error('响应缺少 messages 数组');
      }

      const text = JSON.stringify(payload.messages);

      store.setState({
        surfaceMap: {},
        hydrateNodeMap: {},
        errorMap: {},
        dataModelMap: {},
      });
      setPatchApplied(false);
      parserRef.current = null;
      renderTreeFromStore(store);

      const result = parse(
        text,
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

      store.setState({
        surfaceMap: { ...result.surfaceMap },
        hydrateNodeMap: { ...result.hydrateNodeMap },
      });

      renderTreeFromStore(store);

      setApiFeedback({
        type: 'success',
        text: `非 SSE 接口成功：${payload.messages.length} 条消息，model=${
          payload.meta?.model ?? 'unknown'
        }，耗时 ${payload.meta?.durationMs ?? 0}ms`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      setApiFeedback({
        type: 'danger',
        text: `非 SSE 接口调用失败：${message}。请确认 Server 已在 ${API_BASE_URL} 启动。`,
      });
    } finally {
      setApiLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 32,
        boxSizing: 'border-box',
        background: '#f5f5f5',
      }}
    >
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        A2UI Playground
      </Typography.Title>

      <Space wrap style={{ marginBottom: 16 }}>
        {MOCK_KEYS.map((key) => (
          <Button
            key={key}
            type={mockKey === key ? 'primary' : 'default'}
            onClick={() => setMockKey(key)}
          >
            {MOCKS[key].label}
          </Button>
        ))}
        <Button onClick={startStream} loading={isStreaming}>
          重新播放流
        </Button>
        <Button onClick={testNonSseApi} loading={apiLoading}>
          测试非 SSE 接口
        </Button>
        <Button onClick={simulateUpdateModel} disabled={!activeSurfaceId}>
          模拟 updateModel
        </Button>
        {MOCKS[mockKey].patch && (
          <Button
            type="primary"
            ghost
            onClick={applyPatch}
            disabled={isStreaming || receivedMessages === 0 || patchApplied}
          >
            应用组件更新（LLM 第二轮）
          </Button>
        )}
      </Space>

      {apiFeedback ? (
        <Typography.Paragraph
          type={apiFeedback.type}
          style={{ marginBottom: 16 }}
        >
          {apiFeedback.text}
        </Typography.Paragraph>
      ) : (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          字符流：{receivedChars} / {totalChars} 字符 · 已解析 {receivedMessages} /
          {totalMessages} 条消息
          {isStreaming ? '（推送中…）' : '（已完成）'}
        </Typography.Paragraph>
      )}

      {patchApplied && (
        <Typography.Paragraph type="success" style={{ marginBottom: 16 }}>
          已应用增量补丁：只提交 price-text 的更新与 notice-text 的新增，
          其余组件的 hydrateNode 对象未变化。
        </Typography.Paragraph>
      )}

      <Card title="渲染预览" style={{ marginBottom: 16 }}>
        <div style={{ minHeight: 64 }}>
          {renderedTree ? (
            renderedTree.vnode
          ) : (
            <Typography.Text type="secondary">等待组件消息…</Typography.Text>
          )}
        </div>

        {renderedTree && !hasRenderedSurface && (
          <Typography.Text
            type="secondary"
            style={{ display: 'block', marginTop: 8 }}
          >
            流式构建中，等待 beginRendering…
          </Typography.Text>
        )}
      </Card>

      <Card title="数据模型（Store）" style={{ marginBottom: 16 }}>
        <pre
          style={{
            margin: 0,
            maxHeight: 240,
            overflow: 'auto',
            padding: 12,
            background: '#fafafa',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {JSON.stringify(state.dataModelMap, null, 2)}
        </pre>
      </Card>

      <Card title="组件树（id · 类型）" style={{ marginBottom: 16 }}>
        {renderedTree ? (
          <Tree
            treeData={treeData}
            expandedKeys={expandedKeys}
            showLine
            selectable={false}
          />
        ) : (
          <Typography.Text type="secondary">等待组件消息…</Typography.Text>
        )}
      </Card>

      <Button type="primary" onClick={() => setOpen(true)}>
        查看 Store
      </Button>

      <Modal
        title="Store 状态"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={860}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {Object.keys(state.surfaceMap).length} 个 Surface，
          {Object.keys(state.hydrateNodeMap).length} 个 HydrateNode，
          {Object.keys(state.errorMap).length} 个 Error
        </Typography.Paragraph>

        <pre
          style={{
            margin: 0,
            maxHeight: '60vh',
            overflow: 'auto',
            padding: 16,
            background: '#fafafa',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </Modal>
    </main>
  );
}
