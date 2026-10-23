import React from 'react';

/* ============================================================
   Line icons — 24px grid, 1.75 stroke. The Agora site and app
   both use stroke icons rather than filled glyphs or emoji.
   ============================================================ */

function Icon({ size = 18, strokeWidth = 1.75, className = '', children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function InboxIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 13h4.5l1.8 2.8h5.4L16.5 13H21" />
      <path d="M5.6 4.5h12.8L21 12.4V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5.6Z" />
    </Icon>
  );
}

export function SendIcon(props) {
  return (
    <Icon {...props}>
      <path d="m21.5 2.5-7 19-3.8-8.7L2 9Z" />
      <path d="M21.5 2.5 10.7 12.8" />
    </Icon>
  );
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h17" />
      <path d="M8.5 6V4.2A1.2 1.2 0 0 1 9.7 3h4.6a1.2 1.2 0 0 1 1.2 1.2V6" />
      <path d="m5.5 6 .9 13.2A1.9 1.9 0 0 0 8.3 21h7.4a1.9 1.9 0 0 0 1.9-1.8L18.5 6" />
      <path d="M10 10.5v6M14 10.5v6" />
    </Icon>
  );
}

export function SearchIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="10.8" cy="10.8" r="7.3" />
      <path d="m20.5 20.5-4.1-4.1" />
    </Icon>
  );
}

export function PencilIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 20h9" />
      <path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      <path d="m14.5 5.5 4 4" />
    </Icon>
  );
}

export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function XIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function MenuIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function ArrowLeftIcon(props) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </Icon>
  );
}

export function ReplyIcon(props) {
  return (
    <Icon {...props}>
      <path d="m9 17-5-5 5-5" />
      <path d="M4 12h10.5A5.5 5.5 0 0 1 20 17.5V19" />
    </Icon>
  );
}

/** Stacked layers: the mark for a conversation that holds several messages. */
export function ThreadIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
      <path d="m3 17 9 4.5 9-4.5" />
    </Icon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function RefreshIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 3.5V9h-5.5" />
    </Icon>
  );
}

export function PaperclipIcon(props) {
  return (
    <Icon {...props}>
      <path d="m20.9 11.4-8.8 8.8a6 6 0 0 1-8.5-8.5l8.3-8.3a4 4 0 1 1 5.7 5.7l-8.4 8.3a2 2 0 0 1-2.8-2.8l8.1-8" />
    </Icon>
  );
}

export function EyeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-3 3.5" />
      <path d="M6.2 7.4A16.7 16.7 0 0 0 2.5 12S6 18.1 12 18.1a10 10 0 0 0 4-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Icon>
  );
}

export function LockIcon(props) {
  return (
    <Icon {...props}>
      <rect x="4" y="10" width="16" height="10.5" rx="2.2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

export function ShieldIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6Z" />
      <path d="M12 9v3.6" />
      <path d="M12 16.2h.01" />
    </Icon>
  );
}

export function CopyIcon(props) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a2.5 2.5 0 0 0-2.5 2.5V12A2.5 2.5 0 0 0 6 14.5" />
    </Icon>
  );
}

export function ForwardIcon(props) {
  return (
    <Icon {...props}>
      <path d="m14 5 6 6-6 6" />
      <path d="M20 11h-7.5A5.5 5.5 0 0 0 7 16.5V19" />
    </Icon>
  );
}

export function CheckCheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="m3 12.5 3.6 3.6L13 9.7" />
      <path d="m11.4 15.1 1 1L20.5 8" />
    </Icon>
  );
}

export function CheckIcon(props) {
  return (
    <Icon {...props} strokeWidth={2.4}>
      <path d="m5 12.6 4.4 4.4L19 6.6" />
    </Icon>
  );
}

export function CheckCircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.4 12.2 2.5 2.5 4.7-5.2" />
    </Icon>
  );
}

export function AlertCircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.2" />
      <path d="M12 16.4h.01" />
    </Icon>
  );
}

export function RestoreIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.6 9.6 0 0 0-6.7 2.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

export function LogOutIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  );
}

export function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.4" />
      <path d="m3.5 6.5 8.5 6.4 8.5-6.4" />
    </Icon>
  );
}

export function FileIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2.5V8h5.5" />
    </Icon>
  );
}

export function Spinner({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
