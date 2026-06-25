import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

const ROLES = ['Member', 'Admin', 'Editor', 'Viewer'];

function Avatar({ user, size = 40 }) {
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#6c63ff','#22d3a5','#ff4d6d','#f59e0b','#3b82f6','#ec4899'];
  const color = colors[user.id % colors.length];
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.name} className="avatar" style={{ width: size, height: size }} />;
  }
  return (
    <div className="avatar initials-avatar" style={{ width: size, height: size, background: color }}>
      {initials}
    </div>
  );
}

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch]     = useState('');
  const [toasts, setToasts]     = useState([]);
  const [form, setForm]         = useState({ name: '', email: '', role: 'Member' });
  const [avatar, setAvatar]     = useState(null);
  const [preview, setPreview]   = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]     = useState({});
  const fileRef = useRef();

  const toast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get(`${API}/api/users`);
      setUsers(data);
    } catch {
      toast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email format';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('email', form.email.trim());
      fd.append('role', form.role);
      if (avatar) fd.append('avatar', avatar);

      const { data } = await axios.post(`${API}/api/users`, fd);
      setUsers(p => [data, ...p]);
      toast(`${data.name} added successfully`);
      resetForm();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add user';
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await axios.delete(`${API}/api/users/${id}`);
      setUsers(p => p.filter(u => u.id !== id));
      toast('User removed');
    } catch {
      toast('Failed to delete user', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB', 'error'); return; }
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setForm({ name: '', email: '', role: 'Member' });
    setAvatar(null);
    setPreview(null);
    setErrors({});
    setShowForm(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'Admin').length,
    recent: users.filter(u => {
      const d = new Date(u.created_at);
      return (Date.now() - d) < 7 * 24 * 60 * 60 * 1000;
    }).length,
  };

  return (
    <div className="app">
      <Toast toasts={toasts} />

      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon">⬡</div>
            <div>
              <h1 className="brand-name">UserVault</h1>
              <p className="brand-sub">Team Management</p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span>+</span> Add User
          </button>
        </div>
      </header>

      <main className="main">

        {/* ── Stats ── */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total Users</span>
          </div>
          <div className="stat-card">
            <span className="stat-value accent">{stats.admins}</span>
            <span className="stat-label">Admins</span>
          </div>
          <div className="stat-card">
            <span className="stat-value success">{stats.recent}</span>
            <span className="stat-label">New This Week</span>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              className="search"
              placeholder="Search by name, email or role…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <span className="count">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* ── Table ── */}
        <div className="table-card">
          {loading ? (
            <div className="empty">
              <div className="spinner" />
              <p>Loading users…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">👤</div>
              <p>{search ? 'No users match your search' : 'No users yet — add your first one!'}</p>
              {!search && (
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>Add User</button>
              )}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="table-row">
                    <td>
                      <div className="user-cell">
                        <Avatar user={u} />
                        <span className="user-name">{u.name}</span>
                      </div>
                    </td>
                    <td className="muted">{u.email}</td>
                    <td>
                      <span className={`badge badge-${u.role.toLowerCase()}`}>{u.role}</span>
                    </td>
                    <td className="muted">
                      {new Date(u.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(u.id)}
                        disabled={deleting === u.id}
                      >
                        {deleting === u.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* ── Add User Modal ── */}
      {showForm && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && resetForm()}>
          <div className="modal">
            <div className="modal-header">
              <h2>Add New User</h2>
              <button className="close-btn" onClick={resetForm}>✕</button>
            </div>

            {/* Avatar upload */}
            <div className="avatar-upload" onClick={() => fileRef.current.click()}>
              {preview
                ? <img src={preview} alt="preview" className="avatar-preview" />
                : <div className="avatar-placeholder"><span>📷</span><p>Upload photo</p></div>
              }
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />
            </div>

            <div className="form-group">
              <label>Full Name *</label>
              <input
                className={`input ${errors.name ? 'input-error' : ''}`}
                placeholder="Jane Smith"
                value={form.name}
                onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: '' })); }}
              />
              {errors.name && <span className="error-msg">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label>Email Address *</label>
              <input
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="jane@example.com"
                type="email"
                value={form.email}
                onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setErrors(p => ({ ...p, email: '' })); }}
              />
              {errors.email && <span className="error-msg">{errors.email}</span>}
            </div>

            <div className="form-group">
              <label>Role</label>
              <div className="role-grid">
                {ROLES.map(r => (
                  <button
                    key={r}
                    className={`role-btn ${form.role === r ? 'role-active' : ''}`}
                    onClick={() => setForm(p => ({ ...p, role: r }))}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Adding…' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
