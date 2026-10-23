import React from 'react';
import { BrandLockup } from './Brand.jsx';
import {
  InboxIcon,
  LogOutIcon,
  PencilIcon,
  SendIcon,
  ShieldIcon,
  TrashIcon,
  XIcon,
} from './Icons.jsx';

const FOLDERS = [
  { id: 'inbox', label: 'Inbox', Icon: InboxIcon },
  { id: 'reports', label: 'Reports', Icon: ShieldIcon, badge: 'reportCount' },
  { id: 'sent', label: 'Sent', Icon: SendIcon },
  { id: 'trash', label: 'Trash', Icon: TrashIcon },
];

export default function Sidebar({
  open,
  onClose,
  email,
  activeFolder,
  onFolderChange,
  onCompose,
  onLogout,
  reportCount = 0,
}) {
  return (
    <>
      {open && (
        <button
          type="button"
          className="drawer-backdrop lg:hidden"
          onClick={onClose}
          aria-label="Close navigation"
        />
      )}

      <aside
        id="mailbox-sidebar"
        className={`sidebar ${open ? 'is-open' : ''}`}
        aria-label="Mailbox navigation"
      >
        <div className="flex items-center justify-between gap-3">
          <BrandLockup />
          <button
            type="button"
            onClick={onClose}
            className="icon-btn lg:hidden"
            aria-label="Close navigation"
          >
            <XIcon size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={onCompose}
          className="btn btn--brand mt-6 w-full justify-center py-3"
        >
          <PencilIcon size={16} />
          Compose
        </button>

        <nav className="mt-7 space-y-1" aria-label="Mailboxes">
          {FOLDERS.map(({ id, label, Icon, badge }) => {
            const active = activeFolder === id;
            const count = badge === 'reportCount' ? reportCount : 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onFolderChange(id)}
                className={`folder-link ${active ? 'is-active' : ''} ${id === 'reports' ? 'folder-link--reports' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={count > 0 ? `${label}, ${count} active` : undefined}
              >
                <Icon size={17} />
                <span>{label}</span>
                {count > 0 && (
                  <span className="folder-link__badge" title={`${count} active ${count === 1 ? 'report' : 'reports'}`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* One compact account panel replaces the old panel + footer stack. */}
        <div className="account-card mt-auto">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[0.76rem] font-medium text-ink" title={email}>
              {email}
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="icon-btn !h-7 !w-7"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOutIcon size={14} />
            </button>
          </div>
          <p className="micro mt-1 flex items-center gap-1.5 !text-[0.55rem]">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden="true" />
            Signed in
          </p>
        </div>
      </aside>
    </>
  );
}
