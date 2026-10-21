import React, { useState, useEffect } from 'react';

const SUPABASE_URL = 'https://sepvcatdqrnzjuvxabzh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcHZjYXRkcXJuemp1dnhhYnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDEzMzIsImV4cCI6MjEwNjE3NzMzMn0.wY2PlB5M66AOG-xM3j0d6fD5OSNBUZYzEcbNNIlHBHE';

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
  const [sending, setSending] = useState(false);

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

  // 6. Handle Reply action
  const handleReply = (email) => {
    setTo(email.from_address);
    setSubject(email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`);
    setBody(`\n\n--- Original Message ---\nFrom: ${email.from_address}\nDate: ${new Date(email.created_at).toLocaleString()}\n\n${email.text_body || ''}`);
    setIsComposeOpen(true);
  };

  // 7. Send email via Resend worker
  const handleSendEmail = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('https://agora-mail-sender.jayvardhanbhaskar123.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
          customFrom: 'mail@agora.in.net'
        })
      });

      if (res.ok) {
        alert('Email sent successfully!');
        setIsComposeOpen(false);
        setTo('');
        setSubject('');
        setBody('');
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

  // 8. Filter emails based on search query
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
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col p-4">
        <h1 className="text-xl font-bold text-blue-400 mb-6">Agora Mail</h1>
        <button 
          onClick={() => {
            setTo('');
            setSubject('');
            setBody('');
            setIsComposeOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg mb-4 transition"
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
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <nav className="space-y-1 flex-1">
          <button 
            onClick={() => { setActiveFolder('inbox'); setSelectedEmail(null); }}
            className={`w-full text-left px-3 py-2 rounded-lg transition ${activeFolder === 'inbox' ? 'bg-gray-800 text-blue-400' : 'hover:bg-gray-900'}`}
          >
            📥 Inbox
          </button>
          <button 
            onClick={() => { setActiveFolder('sent'); setSelectedEmail(null); }}
            className={`w-full text-left px-3 py-2 rounded-lg transition ${activeFolder === 'sent' ? 'bg-gray-800 text-blue-400' : 'hover:bg-gray-900'}`}
          >
            📤 Sent
          </button>
          <button 
            onClick={() => { setActiveFolder('trash'); setSelectedEmail(null); }}
            className={`w-full text-left px-3 py-2 rounded-lg transition ${activeFolder === 'trash' ? 'bg-gray-800 text-blue-400' : 'hover:bg-gray-900'}`}
          >
            🗑️ Trash
          </button>
        </nav>

        {/* User Footer & Logout */}
        <div className="pt-4 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
          <span className="truncate max-w-[140px]" title={session.user?.email}>
            {session.user?.email}
          </span>
          <button
            onClick={handleLogout}
            className="text-red-400 hover:text-red-300 font-medium transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Email List */}
      <div className="w-96 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-4 border-b border-gray-800 font-semibold capitalize text-gray-400">
          {activeFolder} ({filteredEmails.length})
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-800">
          {filteredEmails.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              {searchQuery ? 'No matching emails found.' : 'No emails found.'}
            </div>
          ) : (
            filteredEmails.map((email) => (
              <div 
                key={email.id} 
                onClick={() => handleSelectEmail(email)}
                className={`p-4 cursor-pointer hover:bg-gray-800 transition flex items-start space-x-3 ${selectedEmail?.id === email.id ? 'bg-gray-800' : ''}`}
              >
                <div className="pt-1.5">
                  {!email.is_read && activeFolder === 'inbox' && (
                    <span className="block w-2.5 h-2.5 bg-blue-500 rounded-full"></span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400 truncate mb-1">
                    {activeFolder === 'inbox' ? email.from_address : `To: ${email.to_address}`}
                  </div>
                  <div className={`text-sm truncate ${!email.is_read && activeFolder === 'inbox' ? 'font-bold text-white' : 'font-medium text-gray-200'}`}>
                    {email.subject || '(No Subject)'}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-1">{email.text_body?.substring(0, 50)}...</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Email Reader / Viewer */}
      <div className="flex-1 flex flex-col bg-gray-950">
        {selectedEmail ? (
          <div className="p-8 overflow-y-auto flex-1">
            <h2 className="text-xl font-bold mb-4">{selectedEmail.subject || '(No Subject)'}</h2>
            <div className="text-sm text-gray-400 mb-6 pb-4 border-b border-gray-800 flex justify-between items-start">
              <div>
                <p><span className="text-gray-500">From:</span> {selectedEmail.from_address}</p>
                <p><span className="text-gray-500">To:</span> {selectedEmail.to_address}</p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs text-gray-500">
                  {new Date(selectedEmail.created_at).toLocaleString()}
                </span>
                
                {/* Reply Button */}
                <button 
                  onClick={() => handleReply(selectedEmail)}
                  className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-3 py-1 rounded text-xs transition"
                >
                  ↩️ Reply
                </button>

                {activeFolder === 'trash' ? (
                  <>
                    <button 
                      onClick={() => handleRestoreEmail(selectedEmail.id)}
                      className="bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white px-3 py-1 rounded text-xs transition"
                    >
                      ♻️ Restore
                    </button>
                    <button 
                      onClick={() => handlePermanentDelete(selectedEmail.id)}
                      className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1 rounded text-xs transition"
                    >
                      🔥 Delete Forever
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => handleMoveToTrash(selectedEmail.id)}
                    className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1 rounded text-xs transition"
                  >
                    🗑️ Trash
                  </button>
                )}
              </div>
            </div>
            <div className="prose prose-invert max-w-none text-gray-300">
              {selectedEmail.html_body ? (
                <div dangerouslySetInnerHTML={{ __html: selectedEmail.html_body }} />
              ) : (
                <p className="whitespace-pre-wrap">{selectedEmail.text_body}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            Select an email to read
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-lg rounded-xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">New Message</h3>
              <button onClick={() => setIsComposeOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">From</label>
                <input type="text" disabled value="mail@agora.in.net" className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-gray-400 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">To</label>
                <input 
                  type="email" 
                  required 
                  value={to} 
                  onChange={(e) => setTo(e.target.value)} 
                  placeholder="recipient@example.com" 
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Subject</label>
                <input 
                  type="text" 
                  value={subject} 
                  onChange={(e) => setSubject(e.target.value)} 
                  placeholder="Subject line" 
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Message</label>
                <textarea 
                  rows="6" 
                  value={body} 
                  onChange={(e) => setBody(e.target.value)} 
                  placeholder="Write your message here..." 
                  className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setIsComposeOpen(false)} className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg">Cancel</button>
                <button type="submit" disabled={sending} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg font-medium">
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
