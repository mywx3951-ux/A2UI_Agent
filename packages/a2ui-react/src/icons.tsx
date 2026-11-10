// @a2ui/react：标准 Catalog 中 Icon 组件支持的内联 SVG 图标

import type { ReactNode } from 'react';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const STAR =
  'M12 3.2l2.7 5.4 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.5l6-.9z';

/**
 * 图标名到 SVG 子元素的映射。
 * 名称来自 standard_catalog_definition.json 中 Icon.name 的枚举。
 */
export const ICON_MAP: Record<string, ReactNode> = {
  accountCircle: (
    <>
      <circle cx="12" cy="12" r="9" {...STROKE} />
      <circle cx="12" cy="10" r="2.8" fill="currentColor" />
      <path d="M6.5 18.6a5.8 5.8 0 0 1 11 0" {...STROKE} />
    </>
  ),
  add: <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor" />,
  arrowBack: (
    <path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="currentColor" />
  ),
  arrowForward: (
    <path d="M4 11h12.2l-5.6-5.6L12 4l8 8-8 8-1.4-1.4 5.6-5.6H4z" fill="currentColor" />
  ),
  attachFile: (
    <path
      d="M16.5 6.5l-7 7a2 2 0 0 0 2.8 2.8l7.8-7.8a4 4 0 0 0-5.6-5.6L6.3 10.7a6 6 0 0 0 8.5 8.5l6.2-6.2"
      {...STROKE}
    />
  ),
  calendarToday: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" {...STROKE} />
      <path d="M3 9h18M8 3v4M16 3v4" {...STROKE} />
      <circle cx="12" cy="15" r="1.8" fill="currentColor" />
    </>
  ),
  call: (
    <path
      d="M6.6 3h3l1.6 4-2 1.4a12 12 0 0 0 6.4 6.4L17 12.8l4 1.6v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z"
      fill="currentColor"
    />
  ),
  camera: (
    <>
      <path d="M4 7h3l1.6-2h6.8L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" {...STROKE} />
      <circle cx="12" cy="13" r="3.4" {...STROKE} />
    </>
  ),
  check: <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor" />,
  close: (
    <path
      d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"
      fill="currentColor"
    />
  ),
  delete: (
    <>
      <path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7z" {...STROKE} />
      <path d="M4 7h16M9 7V4h6v3" {...STROKE} />
    </>
  ),
  download: (
    <>
      <path d="M11 3h2v9h4l-5 5-5-5h4z" fill="currentColor" />
      <path d="M4 20h16" {...STROKE} />
    </>
  ),
  edit: (
    <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" {...STROKE} />
  ),
  event: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" {...STROKE} />
      <path d="M3 9h18M8 3v4M16 3v4" {...STROKE} />
      <path d="M9 13h6M9 17h4" {...STROKE} />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" {...STROKE} />
      <path d="M12 7v6" {...STROKE} />
      <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
    </>
  ),
  favorite: (
    <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" fill="currentColor" />
  ),
  favoriteOff: (
    <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" {...STROKE} />
  ),
  folder: (
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" {...STROKE} />
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" {...STROKE} />
      <path d="M9.5 9.2a2.6 2.6 0 1 1 3.7 2.3c-.7.4-1.2.9-1.2 1.8" {...STROKE} />
      <circle cx="12" cy="16.6" r="1.1" fill="currentColor" />
    </>
  ),
  home: (
    <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z" {...STROKE} />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" {...STROKE} />
      <path d="M12 11v6" {...STROKE} />
      <circle cx="12" cy="7.8" r="1.2" fill="currentColor" />
    </>
  ),
  locationOn: (
    <>
      <path d="M12 22s7-6.3 7-12A7 7 0 0 0 5 10c0 5.7 7 12 7 12z" {...STROKE} />
      <circle cx="12" cy="10" r="2.5" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" {...STROKE} />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" {...STROKE} />
    </>
  ),
  lockOpen: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" {...STROKE} />
      <path d="M8 10V7a4 4 0 0 1 7.4-2" {...STROKE} />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" {...STROKE} />
      <path d="M3 7.5l9 6 9-6" {...STROKE} />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" {...STROKE} />,
  moreVert: (
    <>
      <circle cx="12" cy="5.5" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1.7" fill="currentColor" />
    </>
  ),
  moreHoriz: (
    <>
      <circle cx="5.5" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.7" fill="currentColor" />
    </>
  ),
  notifications: (
    <>
      <path d="M6 16v-5a6 6 0 1 1 12 0v5l2 3H4l2-3z" {...STROKE} />
      <path d="M10 20a2 2 0 0 0 4 0" {...STROKE} />
    </>
  ),
  notificationsOff: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 9.3-5" {...STROKE} />
      <path d="M18 11v5l2 3H8" {...STROKE} />
      <path d="M4 4l16 16" {...STROKE} />
    </>
  ),
  payment: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" {...STROKE} />
      <path d="M3 10h18" {...STROKE} />
      <path d="M6 14h4" {...STROKE} />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.2" fill="currentColor" />
      <path d="M5 20a7 7 0 0 1 14 0z" fill="currentColor" />
    </>
  ),
  phone: (
    <path
      d="M6.6 3h3l1.6 4-2 1.4a12 12 0 0 0 6.4 6.4L17 12.8l4 1.6v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z"
      fill="currentColor"
    />
  ),
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" {...STROKE} />
      <circle cx="8.5" cy="10" r="1.8" fill="currentColor" />
      <path d="M4 17l4.5-4.5 3 3L15 12l5 5" {...STROKE} />
    </>
  ),
  print: (
    <>
      <path d="M7 9V4h10v5" {...STROKE} />
      <rect x="4" y="9" width="16" height="7" rx="1.5" {...STROKE} />
      <path d="M7 14h10v6H7z" {...STROKE} />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" {...STROKE} />
      <path d="M20 4v5h-5" {...STROKE} />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" {...STROKE} />
      <path d="M16 16l4.5 4.5" {...STROKE} />
    </>
  ),
  send: (
    <path d="M3 11.5 21 3l-8.5 18-2-7-7.5-2.5z" fill="currentColor" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" {...STROKE} />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"
        {...STROKE}
      />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.4" {...STROKE} />
      <circle cx="18" cy="6" r="2.4" {...STROKE} />
      <circle cx="18" cy="18" r="2.4" {...STROKE} />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" {...STROKE} />
    </>
  ),
  shoppingCart: (
    <>
      <path d="M3 4h2.5l2.2 10.5h9.6L19.5 7H6.2" {...STROKE} />
      <circle cx="9" cy="19" r="1.6" fill="currentColor" />
      <circle cx="17" cy="19" r="1.6" fill="currentColor" />
    </>
  ),
  star: <path d={STAR} fill="currentColor" />,
  starHalf: (
    <>
      <path d={STAR} {...STROKE} />
      <path d="M12 3.2v13.9l-5.4 2.8 1-6L3.3 9.5l6-.9z" fill="currentColor" />
    </>
  ),
  starOff: (
    <>
      <path d={STAR} {...STROKE} />
      <path d="M4 4l16 16" {...STROKE} />
    </>
  ),
  upload: (
    <>
      <path d="M11 17h2V8h4l-5-5-5 5h4z" fill="currentColor" />
      <path d="M4 20h16" {...STROKE} />
    </>
  ),
  visibility: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" {...STROKE} />
      <circle cx="12" cy="12" r="2.8" fill="currentColor" />
    </>
  ),
  visibilityOff: (
    <>
      <path d="M2 12s3.5-6 10-6c2 0 3.8.7 5.2 1.6M22 12s-3.5 6-10 6c-2 0-3.8-.7-5.2-1.6" {...STROKE} />
      <path d="M4 4l16 16" {...STROKE} />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l9.5 17H2.5L12 3z" {...STROKE} />
      <path d="M12 9v5" {...STROKE} />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
    </>
  ),
};
