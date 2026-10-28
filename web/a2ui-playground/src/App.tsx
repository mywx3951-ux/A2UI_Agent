import { useState, useSyncExternalStore } from 'react';
import { Button, Card, Modal, Typography } from 'antd';
import { init, parse, treeBuild } from '@a2ui/core';
import { renderMap } from '@a2ui/react';
import mockJsonl from '../../../packages/a2ui-core/Mock/simple-text.jsonl?raw';

const store = init(renderMap);
const { addError, addHydrateNode, addSurface } = store.getState();
const parsed = parse(mockJsonl, renderMap, addError);

Object.values(parsed.hydrateNodeMap).forEach((node) => addHydrateNode(node));
Object.values(parsed.surfaceMap).forEach((surface) => addSurface(surface));

function useA2uiStore() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export default function App() {
  const state = useA2uiStore();
  const [open, setOpen] = useState(false);

  const surface = Object.values(state.surfaceMap)[0];
  const tree = surface ? treeBuild(surface, state.hydrateNodeMap) : null;

  const snapshot = {
    surfaceMap: state.surfaceMap,
    hydrateNodeMap: state.hydrateNodeMap,
    errorMap: state.errorMap,
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

      <Card title="渲染预览" style={{ marginBottom: 16 }}>
        <div style={{ minHeight: 64 }}>{tree?.vnode ?? null}</div>
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
