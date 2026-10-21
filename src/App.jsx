import React, { useState, useEffect } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function WebmailDashboard() {
  // Auth state
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('agora_mail_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Mail state
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Compose form state
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  // Handle Login via Supabase Auth REST API
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setAuthError('');

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error_description || data.msg || 'Invalid login credentials');
      } else {
        localStorage.setItem('agora_mail_session', JSON.stringify(data));
        setSession(data);
        setLoginEmail('');
        setLoginPassword('');
      }
    } catch (err) {
      setAuthError('Network error occurred while signing in.');
    } finally {
      setLoggingIn(false);
    }
  };

  // Handle Sign Out
  const handleLogout = () => {
    localStorage.removeItem('agora_mail_session');
    setSession(null);
    setEmails([]);
    setSelectedEmail(null);
  };

  // 1. Fetch emails from Supabase using the user's access token
  const fetchEmails = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/emails?folder=eq.${activeFolder}&order=created_at.desc`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }

      const data = await res.json();
      if (Array.isArray(data)) setEmails(data);
    } catch (err) {
      console.error('Error fetching emails:', err);
    }
  };

  useEffect(() => {
    if (session) {
      fetchEmails();
      const interval = setInterval(fetchEmails, 10000);
      return () => clearInterval(interval);
    }
  }, [activeFolder, session]);

  // 2. Select email and mark as read
  const handleSelectEmail = async (email) => {
    setSelectedEmail(email);
    
    if (!email.is_read && email.folder === 'inbox') {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${email.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ is_read: true })
        });

        setEmails(emails.map(item => item.id === email.id ? { ...item, is_read: true } : item));
      } catch (err) {
        console.error('Failed to update read status:', err);
      }
    }
  };

  // 3. Move email to Trash folder
  const handleMoveToTrash = async (emailId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${emailId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ folder: 'trash' })
      });

      if (res.ok) {
        setEmails(emails.filter(item => item.id !== emailId));
        setSelectedEmail(null);
      } else {
        alert('Failed to move email to trash.');
      }
    } catch (err) {
      console.error('Error moving email to trash:', err);
    }
  };

  // 4. Permanently delete email from Supabase
  const handlePermanentDelete = async (emailId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${emailId}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (res.ok) {
        setEmails(emails.filter(item => item.id !== emailId));
        setSelectedEmail(null);
      } else {
        alert('Failed to permanently delete email.');
      }
    } catch (err) {
      console.error('Error deleting email permanently:', err);
    }
  };

  // 5. Restore email back to Inbox
  const handleRestoreEmail = async (emailId) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/emails?id=eq.${emailId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ folder: 'inbox' })
      });

      if (res.ok) {
        setEmails(emails.filter(item => item.id !== emailId));
        setSelectedEmail(null);
      } else {
        alert('Failed to restore email.');
      }
    } catch (err) {
      console.error('Error restoring email:', err);
    }
  };

  // 6. Handle Reply action cleanly
  const handleReply = (email) => {
    setTo(email.from_address);
    setSubject(email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`);
    setBody(''); // Leave message body clean for typing
    setReplyingTo(email); // Save reference to original email
    setAttachments([]);
    setIsComposeOpen(true);
  };

  // 7. Handle File Selection with 25 MB limit check
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

    const oversizedFiles = files.filter(file => file.size > MAX_SIZE);
    if (oversizedFiles.length > 0) {
      alert(`Cannot attach "${oversizedFiles[0].name}". Files larger than 25 MB cannot be sent.`);
      e.target.value = '';
      return;
    }

    Promise.all(
      files.map(file => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64Content = reader.result.split(',')[1];
            resolve({
              filename: file.name,
              content: base64Content
            });
          };
          reader.onerror = error => reject(error);
          reader.readAsDataURL(file);
        });
      })
    ).then(encodedFiles => {
      setAttachments(encodedFiles);
    });
  };

  // 8. Send email via Resend worker
  const handleSendEmail = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      let finalHtml = `<p>${body.replace(/\n/g, '<br/>')}</p>`;
      if (replyingTo) {
        finalHtml += `
          <br><br>
          <div style="border-left: 2px solid #3b82f6; padding-left: 12px; margin-left: 4px; color: #6b7280; font-size: 13px;">
            <p>On ${new Date(replyingTo.created_at).toLocaleString()}, ${replyingTo.from_address} wrote:</p>
            <blockquote>${replyingTo.html_body || replyingTo.text_body}</blockquote>
          </div>
        `;
      }

      const res = await fetch('https://agora-mail-sender.jayvardhanbhaskar123.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html: finalHtml,
          customFrom: 'mail@agora.in.net',
          attachments
        })
      });

      if (res.ok) {
        alert('Email sent successfully!');
        setIsComposeOpen(false);
        setTo('');
        setSubject('');
        setBody('');
        setReplyingTo(null);
        setAttachments([]);
        setActiveFolder('sent');
        fetchEmails();
      } else {
        const errData = await res.json();
        alert(`Failed to send: ${errData.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  // 9. Filter emails based on search query
  const filteredEmails = emails.filter(email => {
    const query = searchQuery.toLowerCase();
    const from = email.from_address?.toLowerCase() || '';
    const to = email.to_address?.toLowerCase() || '';
    const subject = email.subject?.toLowerCase() || '';
    const bodyText = email.text_body?.toLowerCase() || '';

    return from.includes(query) || to.includes(query) || subject.includes(query) || bodyText.includes(query);
  });

  // Render Login Portal if not authenticated
  if (!
