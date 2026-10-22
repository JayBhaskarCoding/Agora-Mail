import React, { useCallback, useEffect, useMemo, useState } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import EmailList from './components/EmailList.jsx';
import MailReader from './components/MailReader.jsx';
import ComposeModal from './components/ComposeModal.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import Toasts, { useToasts } from './components/Toasts.jsx';
import { BrandLockup } from './components/Brand.jsx';
import Ambient from './components/Ambient.jsx';
import { MenuIcon, PencilIcon } from './components/Icons.jsx';
import { extractEmailAddress } from './lib/format.js';
import { buildMessageBody, buildMessageText } from './lib/mailTemplate.js';
import { generateAutoTeaser } from './lib/teaser.js';
import { groupIntoThreads, replySubject, threadKeyFor } from './lib/threads.js';
import {
  messageIdsForThreads,
  pruneKeys,
  toggleAllKeys,
  toggleKey,
} from './lib/selection.js';

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
  /* A conversation is identified by its normalised subject, not by a message
     id: polling replaces the rows underneath without losing the reader. */
  const [selectedThreadKey, setSelectedThreadKey] = useState(null);
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Conversations ticked in the list, by thread key. A conversation is the
     unit the list shows, so it is also the unit a bulk action takes. */
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  /* One confirmation dialog serves every destructive action: it holds the
     question and the function to run once the question is answered. */
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);

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
      setSelectedThreadKey(null);
      setSearchQuery('');
      setIsSidebarOpen(false);
      setIsComposeOpen(false);
      setConfirmRequest(null);
      setSelectedKeys(new Set());
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
      setSelectedThreadKey(null);
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

      /* A conversation is both sides of the dialogue. Loading Inbox or Sent
         therefore loads both pools in one query — `folder=in.(inbox,sent)` —
         so a thread opened from either list carries the sent replies and the
         incoming answers together. Trash is its own pool. */
      const scope =
        activeFolder === 'inbox' || activeFolder === 'sent'
          ? 'in.(inbox,sent)'
          : `eq.${activeFolder}`;

      try {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/emails?folder=${encodeURIComponent(scope)}&order=created_at.desc`,
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

  const handleSelectThread = (thread) => {
    if (!thread) return;
    setSelectedThreadKey(thread.key);

    /* Opening a conversation reads it, as Gmail does: every unread message in
       the thread is marked — including any a search is currently hiding. */
    const unread = emails.filter(
      (email) => !email.is_read && email.folder === 'inbox' && threadKeyFor(email.subject) === thread.key,
    );
    if (unread.length === 0) return;

    const ids = new Set(unread.map((email) => email.id));
    setEmails((current) =>
      current.map((item) => (ids.has(item.id) ? { ...item, is_read: true } : item)),
    );

    unread.forEach((email) => {
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
    });
  };

  const changeFolder = (folder) => {
    setIsSidebarOpen(false);
    setConfirmRequest(null);
    setSelectedKeys(new Set());

    if (folder === activeFolder) {
      setSelectedThreadKey(null);
      return;
    }

    /* Inbox and Sent share one pool, so switching between them keeps the rows
       on screen while the list re-filters. Trash has its own pool. */
    const shared =
      (folder === 'inbox' || folder === 'sent') &&
      (activeFolder === 'inbox' || activeFolder === 'sent');

    setActiveFolder(folder);
    setSelectedThreadKey(null);
    setSearchQuery('');
    if (!shared) setEmails([]);
  };

  /* ---- Moving messages ---------------------------------------------- */

  /* When the last message of the open conversation leaves, close it. */
  const closeThreadIfEmpty = (removedEmail) => {
    if (!selectedThreadKey) return;
    const stillThere = emails.some(
      (item) => item.id !== removedEmail.id && threadKeyFor(item.subject) === selectedThreadKey,
    );
    if (!stillThere) setSelectedThreadKey(null);
  };

  /** Drop rows from the loaded pool without waiting for the next read. */
  const forgetEmails = (ids) => {
    const removed = new Set(ids);
    setEmails((current) => current.filter((email) => !removed.has(email.id)));
  };

  /**
   * PATCH one folder onto a batch of message ids — the shape every move uses,
   * whether it came from one message, a whole thread or a selection.
   *
   * @returns {Promise<'ok' | 'expired'>} `expired` means a 401 came back and
   *   the caller should end the session.
   */
  const setFolderForMessages = useCallback(
    async (ids, folder) => {
      if (ids.length === 0) return 'ok';

      const responses = await Promise.all(
        ids.map((id) =>
          fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${session?.access_token}`,
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ folder }),
          }),
        ),
      );

      if (responses.some((response) => response.status === 401)) return 'expired';

      const failed = responses.filter((response) => !response.ok).length;
      if (failed > 0) throw new Error(`Move failed for ${failed} of ${ids.length} messages`);
      return 'ok';
    },
    [session?.access_token],
  );

  /**
   * DELETE a batch of messages for good. PostgREST takes the whole batch in
   * one `id=in.(…)` filter; ids that are not URL-safe fall back to one call
   * each rather than being interpolated into the filter.
   *
   * @returns {Promise<'ok' | 'expired'>}
   */
  const deleteMessages = useCallback(
    async (ids) => {
      if (ids.length === 0) return 'ok';

      const headers = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token}`,
      };
      const safe = ids.every((id) => /^[A-Za-z0-9_-]+$/.test(String(id)));

      if (safe) {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/emails?id=in.(${ids.join(',')})`,
          { method: 'DELETE', headers },
        );
        if (response.status === 401) return 'expired';
        if (!response.ok) throw new Error(`Delete failed (${response.status})`);
        return 'ok';
      }

      const responses = await Promise.all(
        ids.map((id) =>
          fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers,
          }),
        ),
      );
      if (responses.some((response) => response.status === 401)) return 'expired';
      if (responses.some((response) => !response.ok)) throw new Error('Delete failed');
      return 'ok';
    },
    [session?.access_token],
  );

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

      /* The conversation stays open; it simply loses that message. */
      closeThreadIfEmpty(email);
      setEmails((current) => current.filter((item) => item.id !== email.id));
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

  /**
   * Move a whole conversation to Trash.
   *
   * A conversation is a subject, not a row, and Inbox/Sent are loaded as one
   * pool — so every message of the thread is patched, not only the one the
   * reader happens to show. Each PATCH uses the same `id=eq.…` shape that
   * already moves a single message; the ids are requested in parallel.
   */
  const moveThreadToTrash = async (thread) => {
    if (!thread || busy) return;

    const ids = messageIdsForThreads([thread]);
    if (ids.length === 0) return;

    setBusy(true);

    try {
      if ((await setFolderForMessages(ids, 'trash')) === 'expired') {
        handleLogout({ expired: true });
        return;
      }

      /* The conversation leaves the pool entirely, so the reader closes first
         and the refreshed list decides what is left to show. */
      setSelectedThreadKey(null);
      forgetEmails(ids);
      pushToast(
        ids.length === 1 ? 'Message moved to trash.' : 'Conversation moved to trash.',
        'success',
      );
      fetchEmails({ silent: true });
    } catch (error) {
      console.error('Unable to move conversation:', error);
      pushToast('Couldn’t move that conversation to trash.', 'error');
      /* A partial move is possible; re-read the pool so the list tells the
         truth about what the server holds. */
      fetchEmails({ silent: true });
    } finally {
      setBusy(false);
    }
  };

  const deleteForever = async (email) => {
    if (!email || busy) return;

    setBusy(true);

    try {
      if ((await deleteMessages([email.id])) === 'expired') {
        handleLogout({ expired: true });
        return;
      }

      closeThreadIfEmpty(email);
      forgetEmails([email.id]);
      pushToast('Message deleted permanently.', 'success');
    } catch (error) {
      console.error('Unable to delete message:', error);
      pushToast('Couldn’t delete that message. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Permanently remove every message in Trash.
   *
   * RLS scopes `emails` to the signed-in account, so `folder=eq.trash` sent
   * with the session token can only reach this user's trash — the same
   * scoping every other mailbox query relies on. The dialog asks first; this
   * function only runs once the question is answered.
   */
  const emptyTrash = async () => {
    if (emptyingTrash) return;

    setEmptyingTrash(true);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/emails?folder=eq.trash`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          Prefer: 'return=minimal',
        },
      });

      if (response.status === 401) {
        handleLogout({ expired: true });
        return;
      }

      if (!response.ok) throw new Error(`Empty trash failed (${response.status})`);

      setSelectedThreadKey(null);
      setSelectedKeys(new Set());
      setEmails([]);
      pushToast('Trash emptied.', 'success');
      fetchEmails({ silent: true });
    } catch (error) {
      console.error('Unable to empty trash:', error);
      pushToast('Couldn’t empty Trash. Try again.', 'error');
    } finally {
      setEmptyingTrash(false);
    }
  };

  const requestEmptyTrash = () => {
    if (activeFolder !== 'trash' || busy || emptyingTrash) return;
    setConfirmRequest({
      title: 'Permanently delete all messages in Trash?',
      description:
        'Every conversation in Trash will be removed from this mailbox. This cannot be undone.',
      confirmLabel: 'Empty Trash',
      run: emptyTrash,
    });
  };

  /* ---- Composing ----------------------------------------------------- */

  const openCompose = ({ replyTo = null } = {}) => {
    setReplyingTo(replyTo);
    /* In Sent the message is ours, so the reply goes to its recipient. */
    setTo(
      replyTo
        ? extractEmailAddress(replyTo.folder === 'sent' ? replyTo.to_address : replyTo.from_address)
        : '',
    );
    setSubject(replyTo ? replySubject(replyTo.subject) : '');
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

  /**
   * Post one message to the sender worker. Shared by the composer and the
   * thread's inline reply so both go through the same envelope, text part and
   * auto-teaser rules.
   *
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  const sendMessage = useCallback(
    async ({ to: recipientInput, subject: subjectLine, body: messageBody, replyingTo: replyTarget, attachments: files = [] }) => {
      const recipient = extractEmailAddress(recipientInput);

      /* The worker owns the envelope (card, brand row, footer, preheader);
         this is just the message it wraps.

         Quoted history is deliberately *not* appended here. Each client
         threads the conversation for itself, and embedding the original
         underneath the reply is what produced nested quote banners in the
         first place — Agora shows the thread as stacked cards instead. */
      const finalHtml = buildMessageBody({ body: messageBody });
      const finalText = buildMessageText({ body: messageBody });
      /* The teaser is written here, not by the sender: it has to differ from
         the words the body opens with, or the inbox line stutters. */
      const autoPreview = generateAutoTeaser(
        messageBody,
        subjectLine,
        Boolean(replyTarget),
        files.length,
      );

      try {
        const response = await fetch(MAIL_SENDER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipient,
            subject: subjectLine,
            /* The worker renders this as the hidden preheader, so Gmail and the
               Sent row show a summary rather than the body's first line. */
            previewText: autoPreview,
            html: finalHtml,
            /* A clean text part keeps wrappers out of notification previews.
               Workers that build their own text part simply ignore it. */
            text: finalText,
            customFrom: SENDER_ADDRESS,
            attachments: files.map(({ filename, content }) => ({ filename, content })),
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          return {
            ok: false,
            error: data.error || 'The mail server rejected that message.',
          };
        }

        return { ok: true };
      } catch (error) {
        console.error('Unable to send message:', error);
        return {
          ok: false,
          error: 'We couldn’t reach the mail sender. Check your connection and try again.',
        };
      }
    },
    [],
  );

  const handleSendEmail = async (event) => {
    event.preventDefault();
    if (sending) return;

    if (!to.trim()) {
      setSendError('Add a recipient before sending.');
      return;
    }

    setSending(true);
    setSendError('');

    const result = await sendMessage({
      to,
      subject,
      body,
      replyingTo,
      attachments,
    });

    setSending(false);

    if (!result.ok) {
      setSendError(result.error);
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
    setSelectedThreadKey(null);

    if (activeFolder === 'sent') {
      fetchEmails();
    } else {
      setEmails([]);
      setActiveFolder('sent');
    }
  };

  /** Reply from the bottom of a conversation, without leaving it. */
  const handleInlineReply = async (email, messageBody) => {
    if (!email) return { ok: false, error: 'There is no message to reply to.' };

    const result = await sendMessage({
      to: email.folder === 'sent' ? email.to_address : email.from_address,
      subject: replySubject(email.subject),
      body: messageBody,
      replyingTo: email,
    });

    if (result.ok) {
      pushToast('Reply sent.', 'success');
      /* Refresh so the reply joins the conversation on screen. */
      fetchEmails({ silent: true });
    } else {
      pushToast(result.error || 'The reply could not be sent.', 'error');
    }

    return result;
  };

  /* ---- Derived ------------------------------------------------------- */

  /* Every conversation in the pool — both sides of the dialogue. */
  const threads = useMemo(() => groupIntoThreads(emails), [emails]);

  /* The list shows the conversations that have a message in the open folder;
     the reader still gets the whole thread. */
  const visibleThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return threads.filter((thread) => {
      if (!thread.folders?.[activeFolder]) return false;
      if (!query) return true;

      return thread.emails.some((email) =>
        [email.from_address, email.to_address, email.subject, email.text_body].some((field) =>
          String(field || '').toLowerCase().includes(query),
        ),
      );
    });
  }, [threads, activeFolder, searchQuery]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.key === selectedThreadKey) || null,
    [threads, selectedThreadKey],
  );

  /* A selection is a set of thread keys; everything below turns it into the
     conversations and message ids the bulk actions operate on. */
  const selectedThreads = useMemo(
    () => threads.filter((thread) => selectedKeys.has(thread.key)),
    [threads, selectedKeys],
  );

  const selectedMessageIds = useMemo(
    () => messageIdsForThreads(selectedThreads),
    [selectedThreads],
  );

  /* A thread that leaves the pool — moved, deleted, or read away by the poll —
     must not stay ticked in a list that no longer shows it. */
  useEffect(() => {
    setSelectedKeys((current) =>
      pruneKeys(current, threads.map((thread) => thread.key)),
    );
  }, [threads]);

  /* ---- Selecting and bulk actions ------------------------------------ */

  const clearSelection = useCallback(() => {
    setSelectedKeys((current) => (current.size === 0 ? current : new Set()));
  }, []);

  const toggleThreadSelection = useCallback((key) => {
    setSelectedKeys((current) => toggleKey(current, key));
  }, []);

  /* The header control hands over the conversations the list is showing, so
     "select all" follows a search instead of ignoring it. */
  const selectAllThreads = useCallback((keys) => {
    setSelectedKeys((current) => toggleAllKeys(current, keys));
  }, []);

  const changeSearch = (value) => {
    setSearchQuery(value);
    /* A selection under a filter would act on rows the search is hiding. */
    setSelectedKeys(new Set());
  };

  /** Close the reader if the conversation on screen is one of these. */
  const closeReaderFor = (keys) => {
    setSelectedThreadKey((current) => (keys.includes(current) ? null : current));
  };

  const trashSelected = async () => {
    if (busy || selectedMessageIds.length === 0) return;

    const count = selectedThreads.length;
    const keys = selectedThreads.map((thread) => thread.key);
    const ids = selectedMessageIds;

    setBusy(true);
    try {
      if ((await setFolderForMessages(ids, 'trash')) === 'expired') {
        handleLogout({ expired: true });
        return;
      }

      forgetEmails(ids);
      closeReaderFor(keys);
      clearSelection();
      pushToast(
        `Moved ${count} ${count === 1 ? 'conversation' : 'conversations'} to trash.`,
        'success',
      );
      fetchEmails({ silent: true });
    } catch (error) {
      console.error('Unable to move the selection:', error);
      pushToast('Couldn’t move those conversations to trash.', 'error');
      fetchEmails({ silent: true });
    } finally {
      setBusy(false);
    }
  };

  const restoreSelected = async () => {
    if (busy || selectedMessageIds.length === 0) return;

    const count = selectedThreads.length;
    const keys = selectedThreads.map((thread) => thread.key);
    const ids = selectedMessageIds;

    setBusy(true);
    try {
      if ((await setFolderForMessages(ids, 'inbox')) === 'expired') {
        handleLogout({ expired: true });
        return;
      }

      forgetEmails(ids);
      closeReaderFor(keys);
      clearSelection();
      pushToast(
        `Restored ${count} ${count === 1 ? 'conversation' : 'conversations'} to Inbox.`,
        'success',
      );
      fetchEmails({ silent: true });
    } catch (error) {
      console.error('Unable to restore the selection:', error);
      pushToast('Couldn’t restore those conversations.', 'error');
      fetchEmails({ silent: true });
    } finally {
      setBusy(false);
    }
  };

  /* Deletion is the one bulk action with no way back, so it asks first. */
  const deleteSelected = async () => {
    if (busy || selectedMessageIds.length === 0) return;

    const count = selectedThreads.length;
    const keys = selectedThreads.map((thread) => thread.key);
    const ids = selectedMessageIds;

    setBusy(true);
    try {
      if ((await deleteMessages(ids)) === 'expired') {
        handleLogout({ expired: true });
        return;
      }

      forgetEmails(ids);
      closeReaderFor(keys);
      clearSelection();
      pushToast(
        `Deleted ${count} ${count === 1 ? 'conversation' : 'conversations'} permanently.`,
        'success',
      );
      fetchEmails({ silent: true });
    } catch (error) {
      console.error('Unable to delete the selection:', error);
      pushToast('Couldn’t delete those conversations.', 'error');
      fetchEmails({ silent: true });
    } finally {
      setBusy(false);
    }
  };

  const requestDeleteSelected = () => {
    if (busy || selectedThreads.length === 0) return;

    const conversations = selectedThreads.length;
    const messages = selectedMessageIds.length;

    setConfirmRequest({
      title:
        conversations === 1
          ? 'Permanently delete this conversation?'
          : `Permanently delete ${conversations} conversations?`,
      description: `This removes ${messages} ${
        messages === 1 ? 'message' : 'messages'
      } from Agora Mail for good. It cannot be undone.`,
      confirmLabel: 'Delete forever',
      run: deleteSelected,
    });
  };

  /** Answer the open question, then close it whatever the outcome. */
  const runConfirmedAction = async () => {
    if (!confirmRequest || confirmBusy) return;

    const action = confirmRequest.run;
    setConfirmBusy(true);
    try {
      await action();
    } finally {
      setConfirmBusy(false);
      setConfirmRequest(null);
    }
  };

  /* Everything in Trash, independent of the search filter: Empty Trash acts
     on the folder, so a search must not make it look emptier than it is. */
  const trashCount = useMemo(
    () => threads.filter((thread) => thread.folders?.trash).length,
    [threads],
  );

  /* Our own mailboxes, so the reader can tell a sent message from a received
     one even when the row's folder is not the whole story. */
  const selfAddresses = useMemo(
    () => [SENDER_ADDRESS, session?.user?.email].filter(Boolean),
    [session?.user?.email],
  );

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
                selectedThread ? 'hidden md:flex' : 'flex'
              }`}
              aria-label={`${folderLabel} messages`}
            >
              <EmailList
                folder={activeFolder}
                label={folderLabel}
                threads={visibleThreads}
                selfAddresses={selfAddresses}
                loading={loading}
                selectedId={selectedThreadKey}
                searchQuery={searchQuery}
                onSearchChange={changeSearch}
                onSelect={handleSelectThread}
                onRefresh={() => fetchEmails()}
                onClearSearch={() => changeSearch('')}
                busy={busy}
                emptying={emptyingTrash}
                trashCount={trashCount}
                onEmptyTrash={requestEmptyTrash}
                selectedKeys={selectedKeys}
                selectedCount={selectedThreads.length}
                onToggleSelect={toggleThreadSelection}
                onToggleSelectAll={selectAllThreads}
                onClearSelection={clearSelection}
                onTrashSelected={trashSelected}
                onRestoreSelected={restoreSelected}
                onDeleteSelected={requestDeleteSelected}
              />
            </section>

            <section
              className={`min-h-0 min-w-0 flex-1 ${selectedThread ? 'flex' : 'hidden md:flex'}`}
              aria-label="Conversation"
            >
              <MailReader
                /* Remount per conversation: expansion, view mode and the
                   inline reply belong to one thread, not to the previous one. */
                key={selectedThread?.key || 'no-conversation'}
                thread={selectedThread}
                selfAddresses={selfAddresses}
                folder={activeFolder}
                label={folderLabel}
                busy={busy}
                onReply={(email) => openCompose({ replyTo: email })}
                onSendReply={handleInlineReply}
                onTrash={(email) => updateEmailFolder(email, 'trash')}
                onTrashThread={moveThreadToTrash}
                onRestore={(email) => updateEmailFolder(email, 'inbox')}
                onDeleteForever={deleteForever}
                onBack={() => setSelectedThreadKey(null)}
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

        {confirmRequest && (
          <ConfirmDialog
            title={confirmRequest.title}
            description={confirmRequest.description}
            confirmLabel={confirmRequest.confirmLabel}
            busy={confirmBusy}
            onConfirm={runConfirmedAction}
            onCancel={() => {
              if (!confirmBusy) setConfirmRequest(null);
            }}
          />
        )}

        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    </>
  );
}
