import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const STORAGE_KEYS = {
  profiles: 'xoom-ledger-profiles',
  invoices: 'xoom-ledger-invoices',
  session: 'xoom-ledger-session',
  theme: 'xoom-ledger-theme',
}

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'xoom-admin'

function readJson(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function formatDate(value, options = {}) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(date)
}

function formatCompactDate(value) {
  return formatDate(value, { month: 'short', day: 'numeric', year: undefined })
}

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function decodePublicInvoice(token) {
  try {
    const padded = token.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (token.length % 4)) % 4)
    const binary = window.atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed?.profile || !parsed?.clientName || !parsed?.amount) return null
    return parsed
  } catch {
    return null
  }
}

function publicUrl(token) {
  return `${window.location.origin}/invoice/${token}`
}

async function copyText(text) {
  if (!text) return false
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('Clipboard timed out')), 900)),
      ])
      return true
    } catch {
      // Fall through to the selection-based fallback when browser permissions stall.
    }
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()
  const copied = document.execCommand('copy')
  textArea.remove()
  return copied
}

function Icon({ name, size = 18, stroke = 1.7 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  const paths = {
    arrowUpRight: <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
    bank: <><path d="m3 9 9-5 9 5" /><path d="M5 10v7" /><path d="M9 10v7" /><path d="M15 10v7" /><path d="M19 10v7" /><path d="M3 20h18" /><path d="M3 17h18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></>,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    clipboard: <><rect x="6" y="5" width="12" height="15" rx="2" /><path d="M9 5V4h6v1" /><path d="M9 10h6M9 14h4" /></>,
    copy: <><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    external: <><path d="M14 5h5v5" /><path d="m19 5-8 8" /><path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l1-1a5 5 0 0 0-7-7l-.6.6" /><path d="M14 11a5 5 0 0 0-7.5-.5l-1 1a5 5 0 0 0 7 7l.6-.6" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" /></>,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-5" /></>,
    moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    trash: <><path d="M4 7h16M10 11v5M14 11v5" /><path d="m6 7 1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  }

  return <svg {...common}>{paths[name] || paths.file}</svg>
}

function StatusPill({ status }) {
  return <span className={`status-pill ${status}`}>{status === 'paid' ? 'Paid' : 'Unpaid'}</span>
}

function Logo({ compact = false }) {
  return (
    <div className={`brand-lockup ${compact ? 'compact' : ''}`}>
      <span className="brand-glyph">x</span>
      {!compact && <span className="brand-wordmark">xoom <b>/ ledger</b></span>}
    </div>
  )
}

function Login({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()
    if (password !== ADMIN_PASSWORD) {
      setError('That passcode does not match.')
      return
    }
    writeJson(STORAGE_KEYS.session, true)
    onSuccess()
  }

  return (
    <main className="login-page">
      <div className="login-ambient" aria-hidden="true" />
      <section className="login-panel" aria-labelledby="login-title">
        <Logo />
        <div className="login-intro">
          <p className="eyebrow">Private workspace</p>
          <h1 id="login-title">Your invoices,<br /><em>quietly handled.</em></h1>
          <p>Keep receiving profiles close, then send clients one clear link with exactly what they need.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <input className="visually-hidden" type="text" name="username" autoComplete="username" tabIndex="-1" aria-hidden="true" value="admin" readOnly />
          <label className="field-label" htmlFor="password">Admin passcode</label>
          <div className={`input-wrap ${error ? 'has-error' : ''}`}>
            <Icon name="lock" size={17} />
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
              placeholder="Enter your passcode"
              autoComplete="current-password"
              autoFocus
            />
          </div>
          {error && <p className="field-error">{error}</p>}
          <button className="button primary full-width" type="submit">
            Open workspace <Icon name="arrowUpRight" size={16} />
          </button>
        </form>
        <p className="login-footnote">Protected for one person. Public invoice links never ask clients to log in.</p>
      </section>
      <div className="login-side-note">Xoom transfer ledger <span>01</span></div>
    </main>
  )
}

function Sidebar({ section, setSection, theme, setTheme, onLogout, invoiceCount, profileCount }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Logo />
        <span className="workspace-chip">Private workspace</span>
      </div>
      <nav className="main-nav" aria-label="Main navigation">
        <p className="nav-label">Workspace</p>
        <button className={`nav-item ${section === 'invoices' ? 'active' : ''}`} onClick={() => setSection('invoices')}>
          <Icon name="receipt" size={17} />
          <span>Invoices</span>
          <b>{invoiceCount}</b>
        </button>
        <button className={`nav-item ${section === 'profiles' ? 'active' : ''}`} onClick={() => setSection('profiles')}>
          <Icon name="bank" size={17} />
          <span>Receiving profiles</span>
          <b>{profileCount}</b>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-rule" />
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <span className="theme-toggle-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></span>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          <span className="theme-key">{theme === 'dark' ? 'L' : 'D'}</span>
        </button>
        <button className="nav-item logout" onClick={onLogout}>
          <Icon name="logout" size={17} />
          <span>Sign out</span>
        </button>
        <div className="sidebar-footer">
          <span className="avatar">A</span>
          <div><strong>Admin</strong><small>Single account</small></div>
          <Icon name="more" size={17} />
        </div>
      </div>
    </aside>
  )
}

function MobileHeader({ section, setSection, theme, setTheme, onLogout }) {
  return (
    <header className="mobile-header">
      <Logo compact />
      <div className="mobile-header-actions">
        <button className="icon-button" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
        </button>
        <button className="icon-button" aria-label="Sign out" onClick={onLogout}>
          <Icon name="logout" size={17} />
        </button>
      </div>
      <div className="mobile-nav">
        <button className={section === 'invoices' ? 'active' : ''} onClick={() => setSection('invoices')}>Invoices</button>
        <button className={section === 'profiles' ? 'active' : ''} onClick={() => setSection('profiles')}>Profiles</button>
      </div>
    </header>
  )
}

function EmptyState({ type, onAction }) {
  const isInvoices = type === 'invoices'
  return (
    <div className="empty-state">
      <div className="empty-mark"><Icon name={isInvoices ? 'receipt' : 'bank'} size={22} /></div>
      <p className="eyebrow">Nothing here yet</p>
      <h2>{isInvoices ? 'Your first invoice is waiting.' : 'Add a receiving profile.'}</h2>
      <p>{isInvoices ? 'Create a payment request and get a private link you can send in seconds.' : 'Save your Bangladesh bank-deposit details once, then reuse them on every invoice.'}</p>
      <button className="button secondary" onClick={onAction}><Icon name="plus" size={16} /> {isInvoices ? 'Create invoice' : 'Add profile'}</button>
    </div>
  )
}

function InvoicesView({ invoices, profiles, onCompose, onCopy, onTogglePaid, onDelete, onOpen }) {
  const paidCount = invoices.filter((invoice) => invoice.status === 'paid').length
  const outstanding = invoices.filter((invoice) => invoice.status !== 'paid').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)

  return (
    <section className="view-section">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Workspace / invoices</p>
          <h1>Invoices</h1>
          <p className="view-description">A simple paper trail for work sent and money due.</p>
        </div>
        <button className="button primary" onClick={onCompose}><Icon name="plus" size={16} /> New invoice</button>
      </div>

      <div className="metric-strip">
        <div className="metric-cell"><span>All invoices</span><strong>{invoices.length}</strong></div>
        <div className="metric-cell"><span>Paid</span><strong>{paidCount}</strong></div>
        <div className="metric-cell"><span>Outstanding</span><strong>{formatCurrency(outstanding)}</strong></div>
      </div>

      {invoices.length === 0 ? (
        <EmptyState type="invoices" onAction={onCompose} />
      ) : (
        <div className="invoice-list-wrap">
          <div className="list-toolbar">
            <span>{invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}</span>
            <span className="list-toolbar-note"><span className="live-dot" /> Saved locally</span>
          </div>
          <div className="invoice-list" role="list">
            {invoices.map((invoice, index) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                profile={profiles.find((profile) => profile.id === invoice.profileId)}
                index={index}
                onCopy={onCopy}
                onTogglePaid={onTogglePaid}
                onDelete={onDelete}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function InvoiceRow({ invoice, profile, index, onCopy, onTogglePaid, onDelete, onOpen }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const token = invoice.publicToken
  return (
    <article className="invoice-row" role="listitem" style={{ '--row-index': index }}>
      <div className="invoice-main">
        <span className="invoice-number">{invoice.invoiceNumber}</span>
        <strong>{invoice.clientName}</strong>
        <span>{invoice.description || 'No description'}</span>
      </div>
      <div className="invoice-date">
        <span>Due</span>
        <strong>{formatCompactDate(invoice.dueDate)}</strong>
      </div>
      <div className="invoice-amount">
        <span>Amount</span>
        <strong>{formatCurrency(invoice.amount)}</strong>
      </div>
      <div className="invoice-status">
        <StatusPill status={invoice.status} />
      </div>
      <div className="invoice-row-actions">
        <button className="row-link-button" onClick={() => onCopy(publicUrl(token))}><Icon name="link" size={15} /> Copy link</button>
        <button className="icon-button subtle" aria-label={`More options for ${invoice.invoiceNumber}`} onClick={() => setMenuOpen((open) => !open)}><Icon name="more" size={17} /></button>
        {menuOpen && (
          <div className="row-menu">
            <button onClick={() => onOpen(token)}><Icon name="external" size={15} /> Open public link</button>
            <button onClick={() => onTogglePaid(invoice.id)}><Icon name={invoice.status === 'paid' ? 'x' : 'check'} size={15} /> Mark as {invoice.status === 'paid' ? 'unpaid' : 'paid'}</button>
            <button className="danger-text" onClick={() => onDelete(invoice.id)}><Icon name="trash" size={15} /> Delete invoice</button>
          </div>
        )}
      </div>
      {profile && <span className="invoice-profile-note"><Icon name="bank" size={13} /> {profile.bankName}</span>}
    </article>
  )
}

const PROFILE_FIELDS = [
  { key: 'firstName', label: 'First Name', placeholder: 'A R', autocomplete: 'given-name' },
  { key: 'lastName', label: 'Last Name', placeholder: 'Mahmud', autocomplete: 'family-name' },
  { key: 'district', label: 'District', placeholder: 'Natore' },
  { key: 'division', label: 'Division', placeholder: 'Rajshahi' },
  { key: 'postalCode', label: 'Postal Code', placeholder: '6400', inputMode: 'numeric' },
  { key: 'phone', label: 'Phone', placeholder: '+880 17 0000 0000', type: 'tel', autocomplete: 'tel' },
  { key: 'email', label: 'Email', placeholder: 'Optional', type: 'email', autocomplete: 'email', optional: true },
  { key: 'bankName', label: 'Bank Name', placeholder: 'Dutch-Bangla Bank' },
  { key: 'accountNumber', label: 'Account Number', placeholder: '1234567890', inputMode: 'numeric' },
]

function ProfilesView({ profiles, invoices, onEdit, onAdd, onDelete }) {
  return (
    <section className="view-section">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Workspace / profiles</p>
          <h1>Receiving profiles</h1>
          <p className="view-description">The Bangladesh bank-deposit details that travel with an invoice.</p>
        </div>
        <button className="button primary" onClick={onAdd}><Icon name="plus" size={16} /> Add profile</button>
      </div>

      <div className="profile-note"><Icon name="lock" size={15} /><span>Only you can edit these details. New invoices keep a snapshot, so changing a profile will not change a link already sent.</span></div>

      {profiles.length === 0 ? (
        <EmptyState type="profiles" onAction={onAdd} />
      ) : (
        <div className="profile-list" role="list">
          {profiles.map((profile, index) => (
            <ProfileRow key={profile.id} profile={profile} index={index} invoices={invoices} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  )
}

function ProfileRow({ profile, index, invoices, onEdit, onDelete }) {
  const invoiceUses = invoices.filter((invoice) => invoice.profileId === profile.id).length
  const fullName = `${profile.firstName} ${profile.lastName}`.trim()
  return (
    <article className="profile-row" role="listitem" style={{ '--row-index': index }}>
      <div className="profile-avatar"><span>{(profile.firstName || 'R').slice(0, 1)}{(profile.lastName || 'P').slice(0, 1)}</span></div>
      <div className="profile-identity"><strong>{fullName || 'Unnamed profile'}</strong><span>{profile.bankName || 'Bank not added'} · {profile.accountNumber || 'No account number'}</span></div>
      <div className="profile-location"><span>{profile.district || '—'}</span><small>{profile.division || '—'} {profile.postalCode || ''}</small></div>
      <div className="profile-used"><span>{invoiceUses}</span><small>{invoiceUses === 1 ? 'invoice' : 'invoices'}</small></div>
      <div className="profile-actions"><button className="button ghost" onClick={() => onEdit(profile)}>Edit</button><button className="icon-button subtle" aria-label={`Delete ${fullName}`} onClick={() => onDelete(profile)}><Icon name="trash" size={16} /></button></div>
    </article>
  )
}

function ProfileForm({ profile, onCancel, onSave }) {
  const [form, setForm] = useState(() => profile || {})
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(profile || {})
    setError('')
  }, [profile])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function submit(event) {
    event.preventDefault()
    const required = PROFILE_FIELDS.filter((field) => !field.optional)
    const missing = required.find((field) => !String(form[field.key] || '').trim())
    if (missing) {
      setError(`${missing.label} is required.`)
      return
    }
    onSave({
      ...form,
      id: profile?.id || createId(),
      createdAt: profile?.createdAt || new Date().toISOString(),
    })
  }

  return (
    <form className="editor-panel" onSubmit={submit}>
      <div className="editor-heading">
        <div><p className="eyebrow">{profile ? 'Edit profile' : 'New profile'}</p><h2>{profile ? 'Update details' : 'Add receiving details'}</h2></div>
        <button type="button" className="icon-button subtle" aria-label="Close profile form" onClick={onCancel}><Icon name="x" size={18} /></button>
      </div>
      <p className="editor-intro">Use the exact details registered for your Xoom Bangladesh bank deposit.</p>
      <div className="form-grid">
        {PROFILE_FIELDS.map((field) => (
          <div className={`field ${field.key === 'email' ? 'span-2-mobile' : ''}`} key={field.key}>
            <label className="field-label" htmlFor={`profile-${field.key}`}>{field.label}{field.optional && <span className="optional">Optional</span>}</label>
            <input
              id={`profile-${field.key}`}
              type={field.type || 'text'}
              inputMode={field.inputMode}
              autoComplete={field.autocomplete}
              value={form[field.key] || ''}
              onChange={(event) => update(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>
      {error && <p className="form-error"><Icon name="x" size={14} /> {error}</p>}
      <div className="editor-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancel</button><button className="button primary" type="submit">Save profile <Icon name="check" size={16} /></button></div>
    </form>
  )
}

function InvoiceForm({ profiles, onCancel, onSave }) {
  const [form, setForm] = useState({ clientName: '', amount: '', description: '', dueDate: addDays(14), profileId: profiles[0]?.id || '', status: 'unpaid' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!form.profileId && profiles[0]) setForm((current) => ({ ...current, profileId: profiles[0].id }))
  }, [profiles, form.profileId])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function submit(event) {
    event.preventDefault()
    if (!form.clientName.trim()) return setError('Client name is required.')
    if (!form.amount || Number(form.amount) <= 0) return setError('Enter an amount greater than zero.')
    if (!form.dueDate) return setError('Choose a due date.')
    if (!form.profileId) return setError('Add a receiving profile before creating an invoice.')
    onSave({ ...form, clientName: form.clientName.trim(), amount: Number(form.amount) })
  }

  return (
    <form className="editor-panel invoice-editor" onSubmit={submit}>
      <div className="editor-heading">
        <div><p className="eyebrow">New invoice</p><h2>Request a payment</h2></div>
        <button type="button" className="icon-button subtle" aria-label="Close invoice form" onClick={onCancel}><Icon name="x" size={18} /></button>
      </div>
      <p className="editor-intro">The public page will include a unique link and a clean list of your Xoom receiving details.</p>
      <div className="form-grid invoice-form-grid">
        <div className="field span-2">
          <label className="field-label" htmlFor="invoice-client">Client name</label>
          <input id="invoice-client" type="text" value={form.clientName} onChange={(event) => update('clientName', event.target.value)} placeholder="Tracy Vaughn" autoFocus />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="invoice-amount">Amount <span className="optional">USD</span></label>
          <div className="money-input"><span>$</span><input id="invoice-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => update('amount', event.target.value)} placeholder="0.00" /></div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="invoice-due">Due date</label>
          <input id="invoice-due" type="date" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} />
        </div>
        <div className="field span-2">
          <label className="field-label" htmlFor="invoice-description">Description <span className="optional">Optional</span></label>
          <textarea id="invoice-description" rows="3" value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Website maintenance, August 2026" />
        </div>
        <div className="field span-2">
          <label className="field-label" htmlFor="invoice-profile">Receiving profile</label>
          {profiles.length ? (
            <div className="select-wrap"><select id="invoice-profile" value={form.profileId} onChange={(event) => update('profileId', event.target.value)}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.firstName} {profile.lastName} · {profile.bankName}</option>)}</select><Icon name="chevronDown" size={16} /></div>
          ) : <div className="inline-warning"><Icon name="bank" size={15} /> No profiles yet. Save one from the Profiles tab first.</div>}
        </div>
        <div className="field span-2">
          <label className="field-label">Status</label>
          <div className="status-choice">
            <button type="button" className={form.status === 'unpaid' ? 'selected' : ''} onClick={() => update('status', 'unpaid')}><span className="choice-dot unpaid-dot" /> Unpaid</button>
            <button type="button" className={form.status === 'paid' ? 'selected' : ''} onClick={() => update('status', 'paid')}><span className="choice-dot paid-dot" /> Paid</button>
          </div>
        </div>
      </div>
      {error && <p className="form-error"><Icon name="x" size={14} /> {error}</p>}
      <div className="editor-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancel</button><button className="button primary" type="submit">Create invoice <Icon name="arrowUpRight" size={16} /></button></div>
    </form>
  )
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3200)
    return () => window.clearTimeout(timer)
  }, [message, onClose])

  return <div className="toast"><span className="toast-check"><Icon name="check" size={14} /></span><span>{message}</span><button onClick={onClose} aria-label="Dismiss notification"><Icon name="x" size={15} /></button></div>
}

function AdminApp({ onLogout }) {
  const [section, setSection] = useState('invoices')
  const [theme, setTheme] = useState(() => window.localStorage.getItem(STORAGE_KEYS.theme) || 'light')
  const [profiles, setProfiles] = useState(() => readJson(STORAGE_KEYS.profiles, []))
  const [invoices, setInvoices] = useState(() => readJson(STORAGE_KEYS.invoices, []))
  const [editor, setEditor] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(STORAGE_KEYS.theme, theme)
  }, [theme])

  useEffect(() => writeJson(STORAGE_KEYS.profiles, profiles), [profiles])
  useEffect(() => writeJson(STORAGE_KEYS.invoices, invoices), [invoices])

  const showToast = (message) => setToast(message)

  function logout() {
    window.localStorage.removeItem(STORAGE_KEYS.session)
    onLogout()
  }

  function saveProfile(profile) {
    setProfiles((current) => {
      const exists = current.some((item) => item.id === profile.id)
      return exists ? current.map((item) => item.id === profile.id ? profile : item) : [profile, ...current]
    })
    setEditor(null)
    showToast(profile.createdAt && profiles.some((item) => item.id === profile.id) ? 'Receiving profile updated.' : 'Receiving profile saved.')
  }

  function deleteProfile(profile) {
    const used = invoices.some((invoice) => invoice.profileId === profile.id)
    const message = used ? 'This profile is attached to existing invoices. Delete it anyway?' : 'Delete this receiving profile?'
    if (!window.confirm(message)) return
    setProfiles((current) => current.filter((item) => item.id !== profile.id))
    showToast('Receiving profile deleted.')
  }

  async function saveInvoice(input) {
    const profile = profiles.find((item) => item.id === input.profileId)
    if (!profile) return
    const invoiceNumber = `INV-${String(Date.now()).slice(-6)}`
    const invoice = {
      ...input,
      id: createId(),
      invoiceNumber,
      publicToken: '',
      createdAt: new Date().toISOString(),
    }
    const snapshot = {
      v: 1,
      nonce: createId(),
      invoiceNumber,
      clientName: invoice.clientName,
      amount: invoice.amount,
      description: invoice.description,
      dueDate: invoice.dueDate,
      status: invoice.status,
      createdAt: invoice.createdAt,
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        district: profile.district,
        division: profile.division,
        postalCode: profile.postalCode,
        phone: profile.phone,
        email: profile.email,
        bankName: profile.bankName,
        accountNumber: profile.accountNumber,
      },
    }
    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.slug) {
        throw new Error(result?.error || 'The public link could not be created.')
      }
      invoice.publicToken = result.slug
    } catch (error) {
      showToast(error?.message || 'The public link could not be created. Check the storage setup and try again.')
      return
    }
    setInvoices((current) => [invoice, ...current])
    setEditor(null)
    setSection('invoices')
    showToast(`${invoiceNumber} created. Public link ready.`)
  }

  function togglePaid(id) {
    setInvoices((current) => current.map((invoice) => invoice.id === id ? { ...invoice, status: invoice.status === 'paid' ? 'unpaid' : 'paid' } : invoice))
    showToast('Invoice status updated.')
  }

  function deleteInvoice(id) {
    if (!window.confirm('Delete this invoice? The public link will stop working.')) return
    const target = invoices.find((invoice) => invoice.id === id)
    if (target?.publicToken && /^[A-Z0-9-]{4,40}$/i.test(target.publicToken)) {
      fetch(`/api/invoice/${encodeURIComponent(target.publicToken)}`, { method: 'DELETE' }).catch(() => {})
    }
    setInvoices((current) => current.filter((invoice) => invoice.id !== id))
    showToast('Invoice deleted.')
  }

  async function copy(value, message) {
    try {
      const copied = await copyText(value)
      showToast(copied ? message : 'Copy was not available.')
    } catch {
      showToast('Copy was not available.')
    }
  }

  function openPublic(token) {
    window.open(publicUrl(token), '_blank', 'noopener,noreferrer')
  }

  const editorContent = editor?.type === 'profile' ? (
    <ProfileForm profile={editor.profile} onCancel={() => setEditor(null)} onSave={saveProfile} />
  ) : editor?.type === 'invoice' ? (
    <InvoiceForm profiles={profiles} onCancel={() => setEditor(null)} onSave={saveInvoice} />
  ) : null

  return (
    <div className="admin-app">
      <Sidebar section={section} setSection={(value) => { setSection(value); setEditor(null) }} theme={theme} setTheme={setTheme} onLogout={logout} invoiceCount={invoices.length} profileCount={profiles.length} />
      <div className="admin-main">
        <MobileHeader section={section} setSection={(value) => { setSection(value); setEditor(null) }} theme={theme} setTheme={setTheme} onLogout={logout} />
        <main className="admin-content">
          {editorContent || (section === 'invoices' ? (
            <InvoicesView invoices={invoices} profiles={profiles} onCompose={() => setEditor({ type: 'invoice' })} onCopy={(url) => copy(url, 'Public invoice link copied.')} onTogglePaid={togglePaid} onDelete={deleteInvoice} onOpen={openPublic} />
          ) : (
            <ProfilesView profiles={profiles} invoices={invoices} onAdd={() => setEditor({ type: 'profile' })} onEdit={(profile) => setEditor({ type: 'profile', profile })} onDelete={deleteProfile} />
          ))}
        </main>
        <footer className="admin-footer"><span>Built for clear Xoom transfers</span><span>v1.0 · Local workspace</span></footer>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}

function PublicField({ label, value, copied, onCopy }) {
  if (!value) return null
  return (
    <div className="public-field">
      <div><span className="public-field-label">{label}</span><strong>{value}</strong></div>
      <button type="button" className={`copy-button ${copied ? 'copied' : ''}`} onClick={onCopy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
        <Icon name={copied ? 'check' : 'copy'} size={16} />
      </button>
    </div>
  )
}

function PublicInvoice({ invoice }) {
  const [copied, setCopied] = useState('')
  const [copyError, setCopyError] = useState(false)
  const profile = invoice.profile
  const bankFields = [
    ['Bank name', profile.bankName],
    ['Account number', profile.accountNumber],
  ]
  const contactFields = [
    ['First name', profile.firstName],
    ['Last name', profile.lastName],
    ['District', profile.district],
    ['Division', profile.division],
    ['Postal code', profile.postalCode],
    ['Phone', profile.phone],
    ['Email', profile.email],
  ]

  async function copyField(label, value) {
    try {
      const didCopy = await copyText(value)
      if (!didCopy) throw new Error('Copy unavailable')
      setCopyError(false)
      setCopied(label)
      window.setTimeout(() => setCopied((current) => current === label ? '' : current), 1800)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <main className="public-page">
      <header className="public-header">
        <div className="public-brand"><span className="public-brand-mark">x</span><span><strong>xoom <b>/ ledger</b></strong><small>Payment request</small></span></div>
        <span className="public-header-note">Secure transfer details <span className="header-rule" /></span>
      </header>
      <div className="public-layout">
        <section className="public-document">
          <div className="public-document-heading">
            <div><p className="eyebrow">{invoice.invoiceNumber || 'INVOICE'}</p><h1>Payment<br /><em>request</em></h1></div>
            <StatusPill status={invoice.status || 'unpaid'} />
          </div>
          <div className="public-amount"><span>Total due</span><strong>{formatCurrency(invoice.amount)}</strong><small>USD</small></div>
          <div className="public-meta-grid">
            <div><span className="meta-label">Billed to</span><strong>{invoice.clientName}</strong></div>
            <div><span className="meta-label">Issued</span><strong>{formatDate(invoice.createdAt?.slice(0, 10))}</strong></div>
            <div><span className="meta-label">Due date</span><strong>{formatDate(invoice.dueDate)}</strong></div>
          </div>
          <div className="public-summary">
            <div className="section-kicker"><span>01</span><h2>Summary</h2></div>
            <div className="summary-line"><span>{invoice.description || 'Development services'}</span><strong>{formatCurrency(invoice.amount)}</strong></div>
            <div className="summary-total"><span>Total</span><strong>{formatCurrency(invoice.amount)}</strong></div>
          </div>
          <p className="public-disclaimer">This payment request is prepared for a Xoom transfer. Please check the details carefully before sending.</p>
        </section>

        <aside className="payment-panel">
          <div className="payment-panel-heading"><div><p className="eyebrow">How to pay</p><h2>Pay via Xoom</h2></div><span className="xoom-dot">x</span></div>
          <p className="xoom-instruction">Send via Xoom <span>-&gt;</span> Bank Deposit <span>-&gt;</span> <strong>{profile.bankName}</strong></p>
          <div className="xoom-flow-note"><span className="flow-step">1</span><span>In Xoom, choose <strong>Bank Deposit</strong>. Enter the account number first, then use the contact details below.</span></div>
          <div className="detail-rule" />
          <div className="detail-heading"><div><span className="section-kicker-number">02</span><h3>Receiving details</h3></div><span className="detail-hint">Copy one field at a time</span></div>
          <div className="public-field-group">
            <div className="field-group-heading"><span>Bank details</span><small>Account info</small></div>
            {bankFields.map(([label, value]) => <PublicField key={label} label={label} value={value} copied={copied === label} onCopy={() => copyField(label, value)} />)}
          </div>
          <div className="public-field-group contact-group">
            <div className="field-group-heading"><span>Contact&apos;s details</span><small>Must match the bank account</small></div>
            {contactFields.map(([label, value]) => <PublicField key={label} label={label} value={value} copied={copied === label} onCopy={() => copyField(label, value)} />)}
          </div>
          {copyError && <p className="copy-error">Could not copy automatically. Press and hold a field to copy it.</p>}
          <div className="payment-footer"><span><Icon name="lock" size={13} /> Shared privately by your developer</span><span>{invoice.invoiceNumber}</span></div>
        </aside>
      </div>
      <footer className="public-footer"><span>xoom / ledger</span><span>Clear details. Fewer mistakes.</span></footer>
    </main>
  )
}

function PublicNotFound() {
  return <main className="public-page not-found-page"><div className="not-found-card"><Logo /><p className="eyebrow">Link unavailable</p><h1>This invoice<br /><em>isn't here.</em></h1><p>The link may be incomplete or no longer valid. Ask the sender for a fresh payment request.</p></div></main>
}

function PublicLoading() {
  return (
    <main className="public-page not-found-page">
      <div className="not-found-card loading-state" aria-busy="true">
        <Logo />
        <p className="eyebrow">Payment request</p>
        <h1>Opening<br /><em>invoice</em></h1>
        <p><span className="loading-dots"><i /><i /><i /></span></p>
      </div>
    </main>
  )
}

function PublicInvoicePage({ slug }) {
  const [state, setState] = useState('loading')
  const [invoice, setInvoice] = useState(null)

  useEffect(() => {
    let active = true
    fetch(`/api/invoice/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable')
        return response.json()
      })
      .then((data) => {
        if (!active) return
        if (!data?.profile || !data?.clientName || !data?.amount) throw new Error('invalid')
        setInvoice(data)
        setState('ready')
      })
      .catch(() => {
        if (active) setState('missing')
      })
    return () => {
      active = false
    }
  }, [slug])

  if (state === 'loading') return <PublicLoading />
  if (state === 'missing' || !invoice) return <PublicNotFound />
  return <PublicInvoice invoice={invoice} />
}

function App() {
  const [authenticated, setAuthenticated] = useState(() => readJson(STORAGE_KEYS.session, false) === true)
  return authenticated ? <AdminApp onLogout={() => setAuthenticated(false)} /> : <Login onSuccess={() => setAuthenticated(true)} />
}

const path = window.location.pathname
const rawToken = path.startsWith('/invoice/') ? path.slice('/invoice/'.length).split('/')[0] : ''
const isSlug = /^[A-Z0-9-]{4,40}$/i.test(rawToken)
const publicInvoice = rawToken && !isSlug ? decodePublicInvoice(rawToken) : null

createRoot(document.getElementById('root')).render(
  rawToken
    ? isSlug
      ? <PublicInvoicePage slug={rawToken.toUpperCase()} />
      : publicInvoice
        ? <PublicInvoice invoice={publicInvoice} />
        : <PublicNotFound />
    : <App />
)
