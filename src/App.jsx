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
    setBody('');
    setReplyingTo(email);
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
      let finalHtml = `<div style="font-family: sans-serif; color: #111;"><p>${body.replace(/\n/g, '<br/>')}</p>`;
      if (replyingTo) {
        finalHtml += `
          <br><br>
          <div style="border-left: 3px solid #3b82f6; padding-left: 14px; margin-top: 16px; color: #4b5563; font-size: 13px;">
            <p style="margin: 0 0 8px 0; font-weight: 600;">On ${new Date(replyingTo.created_at).toLocaleString()}, ${replyingTo.from_address} wrote:</p>
            <div style="margin: 0;">${replyingTo.html_body || replyingTo.text_body}</div>
          </div>
        `;
      }
      finalHtml += `</div>`;

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
  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-100 font-sans p-4">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-blue-400">Agora Mail</h1>
            <p className="text-sm text-gray-400 mt-1">Sign in to access your @agora.in.net webmail portal</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@agora.in.net"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition mt-2"
            >
              {loggingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Webmail Dashboard when authenticated
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col p-4">
        <h1 className="text-xl font-bold text-blue-400 mb-6 tracking-tight">Agora Mail</h1>
        <button 
          onClick={() => {
            setTo('');
            setSubject('');
            setBody('');
            setReplyingTo(null);
            setAttachments([]);
            setIsComposeOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-xl mb-4 transition shadow-lg shadow-blue-600/20"
        >
          + Compose
        </button>
        
        {/* Search Bar */}
        <div className="mb-4">
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emails..." 
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <nav className="space-y-1.5 flex-1">
          <button 
            onClick={() => { setActiveFolder('inbox'); setSelectedEmail(null); }}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition text-sm ${activeFolder === 'inbox' ? 'bg-gray-800 text-blue-400 shadow-sm' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
          >
            📥 Inbox
          </button>
          <button 
            onClick={() => { setActiveFolder('sent'); setSelectedEmail(null); }}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition text-sm ${activeFolder === 'sent' ? 'bg-gray-800 text-blue-400 shadow-sm' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
          >
            📤 Sent
          </button>
          <button 
            onClick={() => { setActiveFolder('trash'); setSelectedEmail(null); }}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition text-sm ${activeFolder === 'trash' ? 'bg-gray-800 text-blue-400 shadow-sm' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
          >
            🗑️ Trash
          </button>
        </nav>

        {/* User Footer & Logout */}
        <div className="pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
          <span className="truncate max-w-[130px] font-medium" title={session.user?.email}>
            {session.user?.email}
          </span>
          <button
            onClick={handleLogout}
            className="text-red-400 hover:text-red-300 font-medium transition px-2 py-1 rounded hover:bg-red-500/10"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Email List */}
      <div className="w-96 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-4 border-b border-gray-800 font-semibold capitalize text-xs text-gray-400 tracking-wider">
          {activeFolder} ({filteredEmails.length})
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-800/60">
          {filteredEmails.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              {searchQuery ? 'No matching emails found.' : 'No emails found.'}
            </div>
          ) : (
            filteredEmails.map((email) => (
              <div 
                key={email.id} 
                onClick={() => handleSelectEmail(email)}
                className={`p-4 cursor-pointer transition flex items-start space-x-3 ${selectedEmail?.id === email.id ? 'bg-gray-800/90' : 'hover:bg-gray-800/40'}`}
              >
                <div className="pt-1.5">
                  {!email.is_read && activeFolder === 'inbox' && (
                    <span className="block w-2.5 h-2.5 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50"></span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400 truncate mb-1 font-medium">
                    {activeFolder === 'inbox' ? email.from_address : `To: ${email.to_address}`}
                  </div>
                  <div className={`text-sm truncate ${!email.is_read && activeFolder === 'inbox' ? 'font-bold text-white' : 'font-medium text-gray-200'}`}>
                    {email.subject || '(No Subject)'}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-1">{email.text_body?.substring(0, 60)}...</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Email Reader / Viewer */}
      <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
        {selectedEmail ? (
          <div className="p-10 overflow-y-auto flex-1 max-w-4xl">
            <h2 className="text-2xl font-bold mb-6 text-gray-100 tracking-tight">{selectedEmail.subject || '(No Subject)'}</h2>
            
            <div className="text-sm text-gray-400 mb-8 pb-6 border-b border-gray-800 flex justify-between items-start bg-gray-900/40 p-4 rounded-xl border border-gray-800/60">
              <div>
                <p className="mb-1"><span className="text-gray-500 font-medium">From:</span> <span className="text-gray-200 font-semibold">{selectedEmail.from_address}</span></p>
                <p><span className="text-gray-500 font-medium">To:</span> <span className="text-gray-300">{selectedEmail.to_address}</span></p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs text-gray-500">
                  {new Date(selectedEmail.created_at).toLocaleString()}
                </span>
                
                {/* Reply Button */}
                <button 
                  onClick={() => handleReply(selectedEmail)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition shadow-md shadow-blue-600/20"
                >
                  ↩️ Reply
                </button>

                {activeFolder === 'trash' ? (
                  <>
                    <button 
                      onClick={() => handleRestoreEmail(selectedEmail.id)}
                      className="bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                    >
                      ♻️ Restore
                    </button>
                    <button 
                      onClick={() => handlePermanentDelete(selectedEmail.id)}
                      className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                    >
                      🔥 Delete Forever
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => handleMoveToTrash(selectedEmail.id)}
                    className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition"
                  >
                    🗑️ Trash
                  </button>
                )}
              </div>
            </div>

            <div className="prose prose-invert max-w-none text-gray-200 leading-relaxed text-sm bg-gray-900/20 p-6 rounded-2xl border border-gray-800/40 min-h-[220px]">
              {selectedEmail.html_body ? (
                <div dangerouslySetInnerHTML={{ __html: selectedEmail.html_body }} />
              ) : (
                <p className="whitespace-pre-wrap">{selectedEmail.text_body}</p>
              )}
            </div>

            {/* Attachments Section */}
            {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-800">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Attachments ({selectedEmail.attachments.length})</h4>
                <div className="flex flex-wrap gap-3">
                  {selectedEmail.attachments.map((att, index) => (
                    <span 
                      key={index}
                      className="bg-gray-900 border border-gray-800 px-4 py-2.5 rounded-xl text-xs text-blue-400 flex items-center space-x-2 font-medium shadow-sm"
                    >
                      <span>📎 {att.filename}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm font-medium">
            Select an email from the list to read
          </div>
        )}
      </div>

      {/* Spacious Compose Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-3xl rounded-2xl p-8 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800">
              <h3 className="font-bold text-lg text-gray-100">{replyingTo ? 'Reply to Message' : 'New Message'}</h3>
              <button onClick={() => setIsComposeOpen(false)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition">✕</button>
            </div>

            <form onSubmit={handleSendEmail} className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">From</label>
                  <input type="text" disabled value="mail@agora.in.net" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-gray-400 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">To</label>
                  <input 
                    type="email" 
                    required 
                    value={to} 
                    onChange={(e) => setTo(e.target.value)} 
                    placeholder="recipient@example.com" 
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Subject</label>
                <input 
                  type="text" 
                  value={subject} 
                  onChange={(e) => setSubject(e.target.value)} 
                  placeholder="Subject line" 
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition" 
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Message</label>
                
                {replyingTo && (
                  <div className="mb-3 p-3.5 bg-gray-950 border-l-4 border-blue-500 rounded-r-xl text-xs text-gray-400">
                    <span className="font-semibold text-gray-200">Replying to {replyingTo.from_address}:</span>
                    <p className="italic truncate mt-1 text-gray-400">"{replyingTo.text_body}"</p>
                  </div>
                )}

                <textarea 
                  rows="10" 
                  value={body} 
                  onChange={(e) => setBody(e.target.value)} 
                  placeholder={replyingTo ? "Type your reply here..." : "Write your message here..."} 
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-3 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition resize-y" 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Attachments (Max 25 MB per file)</label>
                <input 
                  type="file" 
                  multiple
                  onChange={handleFileChange}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-gray-400 file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 transition cursor-pointer" 
                />
                {attachments.length > 0 && (
                  <div className="mt-2 text-xs font-medium text-blue-400">
                    📎 {attachments.length} file(s) attached ready to send
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setIsComposeOpen(false)} className="px-5 py-2.5 text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition">Cancel</button>
                <button type="submit" disabled={sending} className="px-6 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition shadow-lg shadow-blue-600/20">
                  {sending ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
