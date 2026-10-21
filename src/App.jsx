import React, { useState, useEffect } from 'react';

// Replace with your Supabase Public Anon Key and URL
const SUPABASE_URL = 'https://sepvcatdqrnzjuvxabzh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcHZjYXRkcXJuemp1dnhhYnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDEzMzIsImV4cCI6MjEwNjE3NzMzMn0.wY2PlB5M66AOG-xM3j0d6fD5OSNBUZYzEcbNNIlHBHE';

export default function WebmailDashboard() {
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

  // 1. Fetch emails from Supabase
  const fetchEmails = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/emails?folder=eq.${activeFolder}&order=created_at.desc`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      const data = await res.json();
      if (Array.isArray(data)) setEmails(data);
    } catch (err) {
      console.error('Error fetching emails:', err);
    }
  };

  useEffect(() => {
    fetchEmails();
    const interval = setInterval(fetchEmails, 10000); // Poll every 10s for new mail
    return () => clearInterval(interval);
  }, [activeFolder]);

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
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
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
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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

  // 6. Send email via Resend worker
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

  // 7. Filter emails based on search query
  const filteredEmails = emails.filter(email => {
    const query = searchQuery.toLowerCase();
    const from = email.from_address?.toLowerCase() || '';
    const to = email.to_address?.toLowerCase() || '';
    const subject = email.subject?.toLowerCase() || '';
    const body = email.text_body?.toLowerCase() || '';

    return from.includes(query) || to.includes(query) || subject.includes(query) || body.includes(query);
  });

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col p-4">
        <h1 className="text-lg font-bold text-blue-400 mb-6">agora.in.net Mail</h1>
        <button 
          onClick={() => setIsComposeOpen(true)}
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

        <nav className="space-y-1">
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
                {/* Unread Indicator Dot */}
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
