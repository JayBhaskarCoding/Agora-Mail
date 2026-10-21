import React from 'react';
import { Avatar, BrandLockup } from './Brand.jsx';
import { InboxIcon, LogOutIcon, PencilIcon, SendIcon, TrashIcon, XIcon } from './Icons.jsx';

const FOLDERS = [
  { id: 'inbox', label: 'Inbox', Icon: InboxIcon },
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
          <button type="button" onClick={onClose} className="icon-btn lg:hidden" aria-label="Close navigation">
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

        <p className="micro mt-8">Mailboxes</p>
        <nav className="mt-2 space-y-1" aria-label="Mailboxes">
          {FOLDERS.map(({ id, label, Icon }) => {
            const active = activeFolder === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onFolderChange(id)}
                className={`folder-link ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-8">
          <div className="account-card">
            <div className="flex items-center gap-2.5">
              <Avatar name={email} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="micro">Signed in</p>
                <p className="truncate text-xs text-ink" title={email}>
                  {email}
                </p>
              </div>
            </div>

            <div className="my-2.5 h-px bg-line/[0.08]" aria-hidden="true" />

            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition hover:bg-danger/10 hover:text-danger"
            >
              <LogOutIcon size={14} />
              Sign out
            </button>
          </div>

          <p className="micro mt-4 text-center">Agora Mail · Web</p>
        </div>
      </aside>
    </>
  );
}
