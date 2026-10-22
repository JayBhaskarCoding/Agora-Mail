import React, { useCallback, useEffect, useMemo, useState } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import EmailList from './components/EmailList.jsx';
import MailReader from './components/MailReader.jsx';
import ComposeModal from './components/ComposeModal.jsx';
import Toasts, { useToasts } from './components/Toasts.jsx';
import { BrandLockup } from './components/Brand.jsx';
import Ambient from './components/Ambient.jsx';
import { MenuIcon, PencilIcon } from './components/Icons.jsx';
import { cleanSubject, extractEmailAddress } from './lib/format.js';
import { buildMessageBody, buildMessageText } from './lib/mailTemplate.js';
import { generateAutoTeaser } from './lib/teaser.js';

/* ============================================================
   Agora Mail — webmail for @agora.in.net
   Supabase Auth + PostgREST for the mailbox, a Resend worker
   for outbound mail. The interface follows the Agora design
   system documented in src/index.css.
   ============================================================ */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MAIL_SENDER_URL =
  import.meta.env.VITE_MAIL_SENDER_URL ||
  'https://agora-mail-sender.jayvardhanbhaskar123.workers.dev';

const SESSION_KEY = 'agora_mail_session';
const SENDER_ADDRESS = 'mail@agora.in.net';
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const POLL_INTERVAL_MS = 10000;

const FOLDER_LABELS = { inbox: 'Inbox', sent: 'Sent', trash: 'Trash' };

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token ? parsed : null;
  } catch {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable — treat as signed out */
    }
    return null;
  }
}

export default function AgoraMail() {
  const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  /* ---- Auth ---------------------------------------------------------- */
  const [session, setSession] = useState(readStoredSession);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  /* ---- Mailbox ------------------------------------------------------- */
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  /* ---- Shell --------------------------------------------------------- */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  /* ---- Composer ------------------------------------------------------ */
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const folderLabel = FOLDER_LABELS[activeFolder] || 'Inbox';

  /* ---- Session ------------------------------------------------------- */

  const handleLogout = useCallback(
    (options = {}) => {
      try {
        window.localStorage.removeItem(SESSION_KEY);
      } catch {
        /* nothing else to clear */
      }

      setSession(null);
      setEmails([]);
      setSelectedEmail(null);
      setSearchQuery('');
      setIsSidebarOpen(false);
      setIsComposeOpen(false);
      setReplyingTo(null);

      if (options.expired) {
        pushToast('Your session expired. Please sign in again.', 'error');
      }
    },
    [pushToast],
  );

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!configured) {
      setAuthError('This deployment isn’t connected to Supabase yet.');
      return;
    }

    setLoggingIn(true);
    setAuthError('');

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const description = data.error_description || data.msg || data.error || '';
        setAuthError(
          /invalid/i.test(description)
            ? 'That email and password don’t match. Try again.'
            : 'We couldn’t sign you in. Check your connection and try again.',
        );
        return;
      }

      try {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      } catch {
        /* a private window may refuse storage; the session still lives in memory */
      }

      setSession(data);
      setLoginEmail('');
      setLoginPassword('');
      setActiveFolder('inbox');
      setSearchQuery('');
      setEmails([]);
      setSelectedEmail(null);
    } catch (error) {
      console.error('Sign-in failed:', error);
      setAuthError('We couldn’t reach the mail server. Check your connection and try again.');
    } finally {
      setLoggingIn(false);
    }
  };

  /* ---- Loading mail -------------------------------------------------- */

  const fetchEmails = useCallback(
    async ({ silent = false } = {}) => {
      const token = session?.access_token;
      if (!token) return;

      if (!silent) setLoading(true);

      try {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/emails?folder=eq.${encodeURIComponent(activeFolder)}&order=created_at.desc`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.status === 401) {
          handleLogout({ expired: true });
          return;
        }

        if (!response.ok) throw new Error(`Mailbox request failed (${response.status})`);

        const data = await response.json();
        if (!Array.isArray(data)) return;

        setEmails(data);
        setSelectedEmail((current) => {
          if (!current) return current;
          return data.find((item) => item.id === current.id) || current;
        });
      } catch (error) {
        console.error('Unable to load mailbox:', error);
        if (!silent) {
          pushToast('Couldn’t load this mailbox. Check your connection and try again.', 'error');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [session?.access_token, activeFolder, handleLogout, pushToast],
  );

  useEffect(() => {
    if (!session?.access_token) return undefined;

    fetchEmails();
    const interval = window.setInterval(() => fetchEmails({ silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [session?.access_token, activeFolder, fetchEmails]);

  /* ---- Reading ------------------------------------------------------- */

  const handleSelectEmail = (email) => {
    setSelectedEmail(email);

    if (email.is_read || email.folder !== 'inbox') return;

    const readEmail = { ...email, is_read: true };
    setSelectedEmail(readEmail);
    setEmails((current) =>
      current.map((item) => (item.id === email.id ? { ...item, is_read: true } : item)),
    );

    fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${email.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ is_read: true }),
    })
      .then((response) => {
        if (response.status === 401) handleLogout({ expired: true });
      })
      .catch((error) => console.error('Unable to mark the message as read:', error));
  };

  const changeFolder = (folder) => {
    setIsSidebarOpen(false);

    if (folder === activeFolder) {
      setSelectedEmail(null);
      return;
    }

    setActiveFolder(folder);
    setSelectedEmail(null);
    setSearchQuery('');
    setEmails([]);
  };

  /* ---- Moving messages ---------------------------------------------- */

  const updateEmailFolder = async (email, folder) => {
    if (!email || busy) return;

    setBusy(true);
    const movingToTrash = folder === 'trash';

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${email.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ folder }),
      });

      if (response.status === 401) {
        handleLogout({ expired: true });
        return;
      }

      if (!response.ok) throw new Error(`Move failed (${response.status})`);

      setEmails((current) => current.filter((item) => item.id !== email.id));
      setSelectedEmail(null);
      pushToast(movingToTrash ? 'Message moved to trash.' : 'Message restored to inbox.', 'success');
    } catch (error) {
      console.error('Unable to move message:', error);
      pushToast(
        movingToTrash ? 'Couldn’t move that message to trash.' : 'Couldn’t restore that message.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteForever = async (email) => {
    if (!email || busy) return;

    setBusy(true);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${email.id}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.status === 401) {
        handleLogout({ expired: true });
        return;
      }

      if (!response.ok) throw new Error(`Delete failed (${response.status})`);

      setEmails((current) => current.filter((item) => item.id !== email.id));
      setSelectedEmail(null);
      pushToast('Message deleted permanently.', 'success');
    } catch (error) {
      console.error('Unable to delete message:', error);
      pushToast('Couldn’t delete that message. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /* ---- Composing ----------------------------------------------------- */

  const openCompose = ({ replyTo = null } = {}) => {
    setReplyingTo(replyTo);
    setTo(replyTo ? extractEmailAddress(replyTo.from_address) : '');
    /* Subjects are stored entity-encoded; decode before editing or sending. */
    const decodedSubject = cleanSubject(replyTo?.subject || '');
    setSubject(replyTo ? (/^re:/i.test(decodedSubject) ? decodedSubject : `Re: ${decodedSubject}`) : '');
    setBody('');
    setAttachments([]);
    setSendError('');
    setIsSidebarOpen(false);
    setIsComposeOpen(true);
  };

  const closeCompose = () => {
    if (sending) return;
    setIsComposeOpen(false);
    setReplyingTo(null);
    setSendError('');
  };

  const addFiles = (files, limit = MAX_ATTACHMENTS) => {
    const incoming = Array.from(files || []);
    if (incoming.length === 0) return;

    const oversized = incoming.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (oversized) {
      pushToast(`“${oversized.name}” is larger than 25 MB. Attach a smaller file.`, 'error');
      return;
    }

    const room = limit - attachments.length;
    if (room <= 0) {
      pushToast(`You can attach up to ${limit} files.`, 'error');
      return;
    }

    const accepted = incoming.slice(0, room);
    if (accepted.length < incoming.length) {
      pushToast(`Only ${limit} attachments can be added to one message.`, 'error');
    }

    Promise.all(
      accepted.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                filename: file.name,
                size: file.size,
                content: String(reader.result).split(',')[1],
              });
            reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
            reader.readAsDataURL(file);
          }),
      ),
    )
      .then((encoded) => setAttachments((current) => [...current, ...encoded]))
      .catch(() => pushToast('One of those files couldn’t be read. Try again.', 'error'));
  };

  const removeAttachment = (index) => {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSendEmail = async (event) => {
    event.preventDefault();
    if (sending) return;

    if (!to.trim()) {
      setSendError('Add a recipient before sending.');
      return;
    }

    setSending(true);
    setSendError('');

    try {
      const recipient = extractEmailAddress(to);
      /* The worker owns the envelope (card, brand row, footer, preheader);
         this is just the message it wraps. */
      const finalHtml = buildMessageBody({ body, replyingTo });
      const finalText = buildMessageText({ body, replyingTo });
      /* The teaser is written here, not by the sender: it has to differ from
         the words the body opens with, or the inbox line stutters. */
      const autoPreview = generateAutoTeaser(body, subject, Boolean(replyingTo), attachments.length);

      const response = await fetch(MAIL_SENDER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject,
          /* The worker renders this as the hidden preheader, so Gmail and the
             Sent row show a summary rather than the body's first line. */
          previewText: autoPreview,
          html: finalHtml,
          /* A clean text part keeps wrappers out of notification previews.
             Workers that build their own text part simply ignore it. */
          text: finalText,
          customFrom: SENDER_ADDRESS,
          attachments: attachments.map(({ filename, content }) => ({ filename, content })),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.error || 'The mail server rejected that message.';
        setSendError(message);
        pushToast('The message could not be sent.', 'error');
        return;
      }

      pushToast('Message sent.', 'success');
      setIsComposeOpen(false);
      setReplyingTo(null);
      setTo('');
      setSubject('');
      setBody('');
      setAttachments([]);

      setSelectedEmail(null);
      if (activeFolder === 'sent') {
        fetchEmails();
      } else {
        setEmails([]);
        setActiveFolder('sent');
      }
    } catch (error) {
      console.error('Unable to send message:', error);
      setSendError('We couldn’t reach the mail sender. Check your connection and try again.');
      pushToast('The message was not sent — network error.', 'error');
    } finally {
      setSending(false);
    }
  };

  /* ---- Derived ------------------------------------------------------- */

  const filteredEmails = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return emails;

    return emails.filter((email) =>
      [email.from_address, email.to_address, email.subject, email.text_body].some((field) =>
        String(field || '').toLowerCase().includes(query),
      ),
    );
  }, [emails, searchQuery]);

  /* ---- Views --------------------------------------------------------- */

  if (!session) {
    return (
      <>
        <Ambient />
        <LoginScreen
          email={loginEmail}
          password={loginPassword}
          onEmailChange={setLoginEmail}
          onPasswordChange={setLoginPassword}
          onSubmit={handleLogin}
          error={authError}
          submitting={loggingIn}
          configured={configured}
        />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <Ambient />

      <div className="app-shell flex flex-col overflow-hidden lg:flex-row">
        <a className="skip-link" href="#mailbox">
          Skip to mailbox
        </a>

        <Sidebar
          open={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          email={session.user?.email || ''}
          activeFolder={activeFolder}
          onFolderChange={changeFolder}
          onCompose={() => openCompose()}
          onLogout={() => handleLogout()}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="app-bar flex items-center gap-2 px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="icon-btn"
              aria-label="Open navigation"
              aria-expanded={isSidebarOpen}
              aria-controls="mailbox-sidebar"
            >
              <MenuIcon size={19} />
            </button>

            <div className="mx-auto">
              <BrandLockup compact />
            </div>

            <button
              type="button"
              onClick={() => openCompose()}
              className="icon-btn"
              aria-label="Compose message"
            >
              <PencilIcon size={18} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <section
              id="mailbox"
              tabIndex={-1}
              className={`list-pane min-h-0 w-full flex-col border-r border-line/10 md:w-[21rem] md:flex-none xl:w-[23rem] ${
                selectedEmail ? 'hidden md:flex' : 'flex'
              }`}
              aria-label={`${folderLabel} messages`}
            >
              <EmailList
                folder={activeFolder}
                label={folderLabel}
                emails={filteredEmails}
                loading={loading}
                selectedId={selectedEmail?.id}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSelect={handleSelectEmail}
                onRefresh={() => fetchEmails()}
                onClearSearch={() => setSearchQuery('')}
              />
            </section>

            <section
              className={`min-h-0 min-w-0 flex-1 ${selectedEmail ? 'flex' : 'hidden md:flex'}`}
              aria-label="Message"
            >
              <MailReader
                email={selectedEmail}
                folder={activeFolder}
                label={folderLabel}
                busy={busy}
                onReply={(email) => openCompose({ replyTo: email })}
                onTrash={(email) => updateEmailFolder(email, 'trash')}
                onRestore={(email) => updateEmailFolder(email, 'inbox')}
                onDeleteForever={deleteForever}
                onBack={() => setSelectedEmail(null)}
                onCompose={() => openCompose()}
              />
            </section>
          </div>
        </div>

        {isComposeOpen && (
          <ComposeModal
            replyingTo={replyingTo}
            fromAddress={SENDER_ADDRESS}
            to={to}
            onToChange={setTo}
            subject={subject}
            onSubjectChange={setSubject}
            body={body}
            onBodyChange={setBody}
            attachments={attachments}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            sending={sending}
            error={sendError}
            onSend={handleSendEmail}
            onClose={closeCompose}
          />
        )}

        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    </>
  );
}
