// @a2ui/react：基于 React 的 a2ui 协议渲染引擎

import { Children, type AnimationEvent, type CSSProperties, type ReactNode } from 'react';
import type { A2uiRenderContext, A2uiRenderMap } from '@a2ui/core';
import { ICON_MAP } from './icons.js';

/* -------------------------------------------------------------------------- */
/*                                  类型定义                                   */
/* -------------------------------------------------------------------------- */

/** 绑定值：字面量或数据模型 path */
type Bind<T> =
  | { literalString?: string; path?: string }
  | { literalNumber?: number; path?: string }
  | { literalBoolean?: boolean; path?: string }
  | T;

type Distribution =
  | 'start'
  | 'center'
  | 'end'
  | 'spaceBetween'
  | 'spaceAround'
  | 'spaceEvenly';

type Alignment = 'start' | 'center' | 'end' | 'stretch';

interface FlexProps {
  distribution?: Distribution;
  alignment?: Alignment;
}

interface TextProps {
  text?: Bind<string>;
  usageHint?: string;
}

interface ImageProps {
  url?: Bind<string>;
  altText?: Bind<string>;
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  usageHint?: keyof typeof IMAGE_SIZE;
}

interface IconProps {
  name?: Bind<string>;
}

interface VideoProps {
  url?: Bind<string>;
}

interface AudioPlayerProps {
  url?: Bind<string>;
  description?: Bind<string>;
}

interface ListProps {
  direction?: 'vertical' | 'horizontal';
  alignment?: Alignment;
}

interface DividerProps {
  axis?: 'horizontal' | 'vertical';
}

interface TabsProps {
  tabItems?: Array<{ title?: Bind<string>; child?: string }>;
}

/** 本地 dataModelUpdate 中的单条数据 */
interface LocalDataModelEntry {
  key?: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: LocalDataModelEntry[];
}

/** 与 dataModelUpdate 消息同构的本地更新载荷 */
interface LocalDataModelUpdate {
  surfaceId?: string;
  path?: string;
  contents?: LocalDataModelEntry[];
}

/** Button action：携带 localDataModelUpdate 时，点击后写回本地数据模型 */
interface ButtonAction {
  name?: string;
  localDataModelUpdate?: LocalDataModelUpdate;
}

interface ButtonProps {
  primary?: boolean;
  action?: ButtonAction;
}

interface OpenLinkProps {
  url?: Bind<string>;
  text?: Bind<string>;
}

interface CheckBoxProps {
  label?: Bind<string>;
  value?: Bind<boolean>;
}

interface TextFieldProps {
  label?: Bind<string>;
  text?: Bind<string>;
  textFieldType?: 'date' | 'longText' | 'number' | 'shortText' | 'obscured';
  validationRegexp?: string;
}

interface DateTimeInputProps {
  value?: Bind<string>;
  enableDate?: boolean;
  enableTime?: boolean;
}

interface MultipleChoiceProps {
  selections?: Bind<string[]>;
  options?: Array<{ label?: Bind<string>; value?: string }>;
  maxAllowedSelections?: number;
  variant?: 'checkbox' | 'chips';
  filterable?: boolean;
}

interface SliderProps {
  label?: Bind<string>;
  value?: Bind<number>;
  minValue?: number;
  maxValue?: number;
}

/** 视图组件统一入参 */
interface ViewProps<P> {
  props: P;
  context: A2uiRenderContext;
  children?: ReactNode;
}

/* -------------------------------------------------------------------------- */
/*                                 样式与常量                                  */
/* -------------------------------------------------------------------------- */

const DISTRIBUTION: Record<Distribution, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  spaceBetween: 'space-between',
  spaceAround: 'space-around',
  spaceEvenly: 'space-evenly',
};

const ALIGNMENT: Record<Alignment, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

/** 容器使用虚线边框，便于在预览中看清嵌套层级 */
const CONTAINER_STYLE: CSSProperties = {
  border: '1px dashed #d9d9d9',
  borderRadius: 8,
  padding: 12,
  gap: 8,
  boxSizing: 'border-box',
};

const IMAGE_SIZE: Record<string, CSSProperties> = {
  icon: { width: 24, height: 24 },
  avatar: { width: 40, height: 40, borderRadius: '50%' },
  smallFeature: { width: 120, height: 80 },
  mediumFeature: { width: 240, height: 160 },
  largeFeature: { width: '100%', maxWidth: 480, height: 280 },
  header: { width: '100%', height: 200 },
};

const FIELD_STYLE: CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid #d9d9d9',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
  background: '#fff',
};

/* -------------------------------------------------------------------------- */
/*                                  工具方法                                   */
/* -------------------------------------------------------------------------- */

/**
 * 新组件挂载时播放 0.3s 高亮淡出动画。
 * 动画结束后通过 SDK 暴露的 markMounted 清除标记。
 * 仅处理自身动画，避免子组件动画冒泡导致父容器被提前标记。
 */
function streamFadeProps(context: A2uiRenderContext) {
  if (context.hasMounted) return {};

  return {
    className: 'a2ui-stream-fade',
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) {
        context.markMounted();
      }
    },
  };
}

function asString(
  context: A2uiRenderContext,
  value: unknown,
  fallback = '',
): string {
  const resolved = context.resolve<string>(value);
  return typeof resolved === 'string' ? resolved : fallback;
}

function asNumber(
  context: A2uiRenderContext,
  value: unknown,
  fallback: number,
): number {
  const resolved = context.resolve<number>(value);
  return typeof resolved === 'number' ? resolved : fallback;
}

function asBoolean(
  context: A2uiRenderContext,
  value: unknown,
  fallback = false,
): boolean {
  const resolved = context.resolve<boolean>(value);
  return typeof resolved === 'boolean' ? resolved : fallback;
}

function asArray<T>(
  context: A2uiRenderContext,
  value: unknown,
): T[] {
  const resolved = context.resolve<T[]>(value);
  return Array.isArray(resolved) ? resolved : [];
}

/**
 * 执行 Button 的本地 dataModelUpdate。
 * 协议扩展：action.localDataModelUpdate 与 dataModelUpdate 消息同构，
 * 点击时按 contents 逐项调用 updateModel，写入当前 surface 的数据模型。
 * 返回实际写入条数，便于测试与排查。
 */
export function triggerLocalAction(
  action: ButtonAction | undefined,
  context: Pick<A2uiRenderContext, 'surfaceId' | 'updateModel'>,
): number {
  const update = action?.localDataModelUpdate;

  if (!update || !Array.isArray(update.contents)) return 0;
  if (update.surfaceId && update.surfaceId !== context.surfaceId) return 0;

  const basePath = update.path && update.path.length > 0 ? update.path : '/';

  return update.contents.reduce(
    (count, entry) =>
      count + writeLocalEntry(entry, basePath, context.updateModel),
    0,
  );
}

/** 按 dataModelUpdate 的 contents 结构递归写入叶子节点 */
function writeLocalEntry(
  entry: LocalDataModelEntry | undefined,
  basePath: string,
  updateModel: A2uiRenderContext['updateModel'],
): number {
  if (!entry || typeof entry.key !== 'string' || entry.key === '') return 0;

  const path = joinModelPath(basePath, entry.key);

  if (Array.isArray(entry.valueMap)) {
    return entry.valueMap.reduce(
      (count, child) => count + writeLocalEntry(child, path, updateModel),
      0,
    );
  }

  let value: unknown;

  if (entry.valueString !== undefined) {
    value = entry.valueString;
  } else if (entry.valueNumber !== undefined) {
    value = entry.valueNumber;
  } else if (entry.valueBoolean !== undefined) {
    value = entry.valueBoolean;
  } else {
    return 0;
  }

  updateModel(path, value);
  return 1;
}

function joinModelPath(basePath: string, key: string): string {
  const base = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  return `${base}/${key}`;
}

/* -------------------------------------------------------------------------- */
/*                                  视图实现                                   */
/* -------------------------------------------------------------------------- */

function TextView({ props, context }: ViewProps<TextProps>) {
  const content = asString(context, props.text);
  const fade = streamFadeProps(context);

  switch (props.usageHint) {
    case 'h1':
      return <h1 {...fade}>{content}</h1>;
    case 'h2':
      return <h2 {...fade}>{content}</h2>;
    case 'h3':
      return <h3 {...fade}>{content}</h3>;
    case 'h4':
      return <h4 {...fade}>{content}</h4>;
    case 'h5':
      return <h5 {...fade}>{content}</h5>;
    case 'caption':
      return <small {...fade}>{content}</small>;
    case 'body':
      return <p {...fade}>{content}</p>;
    default:
      return <span {...fade}>{content}</span>;
  }
}

function ImageView({ props, context }: ViewProps<ImageProps>) {
  const url = asString(context, props.url);
  const alt = asString(context, props.altText);
  const size = IMAGE_SIZE[props.usageHint ?? 'mediumFeature'] ?? IMAGE_SIZE.mediumFeature;

  return (
    <img
      {...streamFadeProps(context)}
      src={url}
      alt={alt}
      style={{
        display: 'block',
        objectFit: props.fit ?? 'cover',
        borderRadius: 4,
        background: '#f0f0f0',
        ...size,
      }}
    />
  );
}

function IconView({ props, context }: ViewProps<IconProps>) {
  const name = asString(context, props.name, 'info');

  return (
    <span
      {...streamFadeProps(context)}
      role="img"
      aria-label={name}
      style={{ display: 'inline-flex', color: '#595959' }}
    >
      <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
        {ICON_MAP[name] ?? ICON_MAP.info}
      </svg>
    </span>
  );
}

function VideoView({ props, context }: ViewProps<VideoProps>) {
  const url = asString(context, props.url);

  return (
    <video
      {...streamFadeProps(context)}
      src={url}
      controls
      preload="metadata"
      style={{ width: '100%', maxWidth: 480, borderRadius: 8, background: '#000' }}
    />
  );
}

function AudioPlayerView({ props, context }: ViewProps<AudioPlayerProps>) {
  const url = asString(context, props.url);
  const description = asString(context, props.description);

  return (
    <div
      {...streamFadeProps(context)}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <audio src={url} controls style={{ width: '100%' }} />
      {description ? <small style={{ color: '#8c8c8c' }}>{description}</small> : null}
    </div>
  );
}

function ColumnView({ props, context, children }: ViewProps<FlexProps>) {
  const { distribution, alignment } = props;

  return (
    <div
      {...streamFadeProps(context)}
      style={{
        ...CONTAINER_STYLE,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: DISTRIBUTION[distribution ?? 'start'],
        alignItems: ALIGNMENT[alignment ?? 'stretch'],
      }}
    >
      {children}
    </div>
  );
}

function RowView({ props, context, children }: ViewProps<FlexProps>) {
  const { distribution, alignment } = props;

  return (
    <div
      {...streamFadeProps(context)}
      style={{
        ...CONTAINER_STYLE,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: DISTRIBUTION[distribution ?? 'start'],
        alignItems: ALIGNMENT[alignment ?? 'stretch'],
      }}
    >
      {children}
    </div>
  );
}

function ListView({ props, context, children }: ViewProps<ListProps>) {
  return (
    <div
      {...streamFadeProps(context)}
      style={{
        ...CONTAINER_STYLE,
        display: 'flex',
        flexDirection: props.direction === 'horizontal' ? 'row' : 'column',
        alignItems: ALIGNMENT[props.alignment ?? 'stretch'],
      }}
    >
      {children}
    </div>
  );
}

function CardView({ context, children }: ViewProps<Record<string, never>>) {
  return (
    <div
      {...streamFadeProps(context)}
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 12,
        padding: 16,
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Tabs 采用只读展示：依次渲染每个 tab 的标题与内容，不做切换交互。
 * 子节点顺序与 tabItems 一致，由 treeBuild 注入。
 */
function TabsView({ props, context, children }: ViewProps<TabsProps>) {
  const items = Array.isArray(props.tabItems) ? props.tabItems : [];
  const childArray = Children.toArray(children);

  return (
    <div
      {...streamFadeProps(context)}
      style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}
    >
      {items.map((item, index) => (
        <section
          key={item.child ?? index}
          style={{
            borderTop: index === 0 ? 'none' : '1px solid #f0f0f0',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: '#fafafa',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {asString(context, item.title)}
          </div>
          <div style={{ padding: 12 }}>{childArray[index] ?? null}</div>
        </section>
      ))}
    </div>
  );
}

/**
 * Modal 采用只读展示：渲染入口组件，并在下方直接展开内容面板，
 * 避免依赖点击交互才能看到内容。
 */
function ModalView({ context, children }: ViewProps<Record<string, never>>) {
  const childArray = Children.toArray(children);

  return (
    <div
      {...streamFadeProps(context)}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div>{childArray[0] ?? null}</div>
      <div
        style={{
          border: '1px solid #d9d9d9',
          borderRadius: 12,
          padding: 20,
          background: '#fff',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        }}
      >
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
          Modal 内容预览
        </div>
        {childArray[1] ?? null}
      </div>
    </div>
  );
}

function ButtonView({ props, context, children }: ViewProps<ButtonProps>) {
  const primary = props.primary === true;
  const action = props.action;

  return (
    <button
      type="button"
      {...streamFadeProps(context)}
      data-action={action?.name}
      data-action-type={action?.localDataModelUpdate ? 'local' : 'server'}
      onClick={() => triggerLocalAction(action, context)}
      style={{
        padding: '8px 18px',
        borderRadius: 8,
        border: primary ? '1px solid #1677ff' : '1px solid #d9d9d9',
        background: primary ? '#1677ff' : '#fff',
        color: primary ? '#fff' : 'rgba(0, 0, 0, 0.88)',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function OpenLinkView({ props, context }: ViewProps<OpenLinkProps>) {
  const url = asString(context, props.url);
  const text = asString(context, props.text, url);

  return (
    <a
      {...streamFadeProps(context)}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: '#1677ff',
        fontSize: 14,
        textDecoration: 'underline',
      }}
    >
      {text}
    </a>
  );
}

function CheckBoxView({ props, context }: ViewProps<CheckBoxProps>) {
  const label = asString(context, props.label);
  const checked = asBoolean(context, props.value);

  return (
    <label
      {...streamFadeProps(context)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}
    >
      <input type="checkbox" checked={checked} readOnly />
      <span>{label}</span>
    </label>
  );
}

function TextFieldView({ props, context }: ViewProps<TextFieldProps>) {
  const label = asString(context, props.label);
  const value = asString(context, props.text);
  const type = props.textFieldType ?? 'shortText';

  const fieldStyle: CSSProperties = {
    ...FIELD_STYLE,
    ...(props.validationRegexp && !new RegExp(props.validationRegexp).test(value)
      ? { borderColor: '#ff4d4f' }
      : null),
  };

  return (
    <label
      {...streamFadeProps(context)}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}
    >
      <span style={{ color: '#595959' }}>{label}</span>
      {type === 'longText' ? (
        <textarea value={value} readOnly rows={3} style={fieldStyle} />
      ) : (
        <input
          type={TEXT_FIELD_TYPE[type]}
          value={value}
          readOnly
          style={fieldStyle}
        />
      )}
    </label>
  );
}

const TEXT_FIELD_TYPE: Record<string, string> = {
  shortText: 'text',
  longText: 'text',
  number: 'number',
  date: 'date',
  obscured: 'password',
};

function DateTimeInputView({ props, context }: ViewProps<DateTimeInputProps>) {
  const raw = asString(context, props.value);
  const enableDate = props.enableDate !== false;
  const enableTime = props.enableTime === true;

  const type = enableDate
    ? enableTime
      ? 'datetime-local'
      : 'date'
    : 'time';

  return (
    <input
      {...streamFadeProps(context)}
      type={type}
      value={toInputValue(raw, type)}
      readOnly
      style={FIELD_STYLE}
    />
  );
}

function toInputValue(value: string, type: string): string {
  if (!value) return '';
  if (type === 'date') return value.slice(0, 10);
  if (type === 'time') return value.includes('T') ? value.split('T')[1].slice(0, 5) : value;
  return value.slice(0, 16);
}

function MultipleChoiceView({ props, context }: ViewProps<MultipleChoiceProps>) {
  const options = Array.isArray(props.options) ? props.options : [];
  const selections = asArray<string>(context, props.selections);
  const chips = props.variant === 'chips';

  return (
    <div
      {...streamFadeProps(context)}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}
    >
      {options.map((option, index) => {
        const label = asString(context, option.label);
        const selected = option.value !== undefined && selections.includes(option.value);

        if (chips) {
          return (
            <span
              key={option.value ?? index}
              style={{
                alignSelf: 'flex-start',
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid ${selected ? '#1677ff' : '#d9d9d9'}`,
                background: selected ? '#e6f4ff' : '#fff',
                color: selected ? '#0958d9' : 'rgba(0, 0, 0, 0.88)',
              }}
            >
              {label}
            </span>
          );
        }

        return (
          <label
            key={option.value ?? index}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <input type="checkbox" checked={selected} readOnly />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function SliderView({ props, context }: ViewProps<SliderProps>) {
  const label = asString(context, props.label);
  const value = asNumber(context, props.value, props.minValue ?? 0);
  const min = typeof props.minValue === 'number' ? props.minValue : 0;
  const max = typeof props.maxValue === 'number' ? props.maxValue : 100;

  return (
    <div
      {...streamFadeProps(context)}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#595959' }}>{label}</span>
        <span style={{ color: '#1677ff' }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        defaultValue={value}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function DividerView({ props, context }: ViewProps<DividerProps>) {
  if (props.axis === 'vertical') {
    return (
      <span
        {...streamFadeProps(context)}
        role="separator"
        aria-orientation="vertical"
        style={{
          display: 'inline-block',
          width: 1,
          minHeight: 24,
          alignSelf: 'stretch',
          background: '#e8e8e8',
        }}
      />
    );
  }

  return (
    <hr
      {...streamFadeProps(context)}
      style={{
        width: '100%',
        margin: '8px 0',
        border: 'none',
        borderTop: '1px solid #e8e8e8',
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  renderMap                                  */
/* -------------------------------------------------------------------------- */

/** A2UI 组件名到 React 渲染函数的映射，覆盖标准 Catalog 18 个组件与 OpenLink 扩展 */
export const renderMap: A2uiRenderMap = {
  Text: (props, context) =>
    <TextView props={props as TextProps} context={context} />,
  Image: (props, context) =>
    <ImageView props={props as ImageProps} context={context} />,
  Icon: (props, context) =>
    <IconView props={props as IconProps} context={context} />,
  Video: (props, context) =>
    <VideoView props={props as VideoProps} context={context} />,
  AudioPlayer: (props, context) =>
    <AudioPlayerView props={props as AudioPlayerProps} context={context} />,
  Row: (props, context) =>
    <RowView props={props as FlexProps} context={context} />,
  Column: (props, context) =>
    <ColumnView props={props as FlexProps} context={context} />,
  List: (props, context) =>
    <ListView props={props as ListProps} context={context} />,
  Card: (props, context) =>
    <CardView props={props as Record<string, never>} context={context} />,
  Tabs: (props, context) =>
    <TabsView props={props as TabsProps} context={context} />,
  Divider: (props, context) =>
    <DividerView props={props as DividerProps} context={context} />,
  Modal: (props, context) =>
    <ModalView props={props as Record<string, never>} context={context} />,
  Button: (props, context) =>
    <ButtonView props={props as ButtonProps} context={context} />,
  OpenLink: (props, context) =>
    <OpenLinkView props={props as OpenLinkProps} context={context} />,
  CheckBox: (props, context) =>
    <CheckBoxView props={props as CheckBoxProps} context={context} />,
  TextField: (props, context) =>
    <TextFieldView props={props as TextFieldProps} context={context} />,
  DateTimeInput: (props, context) =>
    <DateTimeInputView props={props as DateTimeInputProps} context={context} />,
  MultipleChoice: (props, context) =>
    <MultipleChoiceView props={props as MultipleChoiceProps} context={context} />,
  Slider: (props, context) =>
    <SliderView props={props as SliderProps} context={context} />,
};

/* -------------------------------------------------------------------------- */
/*                                  对外导出                                   */
/* -------------------------------------------------------------------------- */

export { ICON_MAP } from './icons.js';

export const Text = renderMap.Text;
export const Image = renderMap.Image;
export const Icon = renderMap.Icon;
export const Video = renderMap.Video;
export const AudioPlayer = renderMap.AudioPlayer;
export const Row = renderMap.Row;
export const Column = renderMap.Column;
export const List = renderMap.List;
export const Card = renderMap.Card;
export const Tabs = renderMap.Tabs;
export const Divider = renderMap.Divider;
export const Modal = renderMap.Modal;
export const Button = renderMap.Button;
export const OpenLink = renderMap.OpenLink;
export const CheckBox = renderMap.CheckBox;
export const TextField = renderMap.TextField;
export const DateTimeInput = renderMap.DateTimeInput;
export const MultipleChoice = renderMap.MultipleChoice;
export const Slider = renderMap.Slider;
