import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

type TransactionType = 'income' | 'expense'
type Category =
  | 'salary'
  | 'housing'
  | 'food'
  | 'transport'
  | 'shopping'
  | 'leisure'
  | 'health'
  | 'education'
  | 'other'

type Transaction = {
  id: string
  title: string
  amount: string
  type: TransactionType
  category: Category
  date: string
  notes: string | null
  created_at: string
  updated_at: string
}

type Summary = {
  income: string
  expenses: string
  balance: string
  transaction_count: number
  category_totals: Partial<Record<Category, string>>
}

type Filters = {
  type: '' | TransactionType
  category: '' | Category
  month: string
  search: string
}

type FormState = {
  title: string
  amount: string
  type: TransactionType
  category: Category
  date: string
  notes: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

const categories: Array<{ value: Category; label: string }> = [
  { value: 'salary', label: 'Gehalt' },
  { value: 'housing', label: 'Wohnen' },
  { value: 'food', label: 'Lebensmittel' },
  { value: 'transport', label: 'Transport' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'leisure', label: 'Freizeit' },
  { value: 'health', label: 'Gesundheit' },
  { value: 'education', label: 'Bildung' },
  { value: 'other', label: 'Sonstiges' },
]

const categoryLabels = Object.fromEntries(
  categories.map((category) => [category.value, category.label]),
) as Record<Category, string>

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function today(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentMonth(): string {
  return today().slice(0, 7)
}

function emptyForm(): FormState {
  return {
    title: '',
    amount: '',
    type: 'expense',
    category: 'food',
    date: today(),
    notes: '',
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) message = body.detail
    } catch {
      // The status code is enough when the API returned no JSON body.
    }
    throw new Error(message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function formatCurrency(value: string | number): string {
  const parsed = typeof value === 'number' ? value : Number(value)
  return currencyFormatter.format(Number.isFinite(parsed) ? parsed : 0)
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint: string
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  return (
    <article className={`summary-card summary-card--${tone}`}>
      <p className="summary-card__label">{label}</p>
      <strong className="summary-card__value">{value}</strong>
      <span className="summary-card__hint">{hint}</span>
    </article>
  )
}

function TransactionForm({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial?: Transaction
  onCancel: () => void
  onSave: (payload: FormState) => Promise<void>
  saving: boolean
}) {
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? {
          title: initial.title,
          amount: initial.amount,
          type: initial.type,
          category: initial.category,
          date: initial.date,
          notes: initial.notes ?? '',
        }
      : emptyForm(),
  )
  const [formError, setFormError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Bitte einen Betrag größer als 0 eingeben.')
      return
    }

    try {
      await onSave({ ...form, amount: amount.toFixed(2) })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="transaction-form-title">
        <div className="modal__header">
          <div>
            <p className="eyebrow">Transaktion</p>
            <h2 id="transaction-form-title">{initial ? 'Transaktion bearbeiten' : 'Neue Transaktion'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Dialog schließen">
            ×
          </button>
        </div>

        <form className="transaction-form" onSubmit={submit}>
          <label>
            Titel
            <input
              required
              minLength={2}
              maxLength={100}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="z. B. Wocheneinkauf"
            />
          </label>

          <div className="form-grid">
            <label>
              Betrag
              <div className="amount-input">
                <span>€</span>
                <input
                  required
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder="0,00"
                />
              </div>
            </label>

            <label>
              Datum
              <input
                required
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </label>
          </div>

          <div className="form-grid">
            <label>
              Typ
              <select
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value as TransactionType })
                }
              >
                <option value="expense">Ausgabe</option>
                <option value="income">Einnahme</option>
              </select>
            </label>

            <label>
              Kategorie
              <select
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value as Category })}
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Notiz <span className="optional">optional</span>
            <textarea
              maxLength={300}
              rows={3}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Zusätzliche Information"
            />
          </label>

          {formError && <p className="form-error" role="alert">{formError}</p>}

          <div className="modal__actions">
            <button className="button button--ghost" type="button" onClick={onCancel} disabled={saving}>
              Abbrechen
            </button>
            <button className="button button--primary" type="submit" disabled={saving}>
              {saving ? 'Speichern …' : initial ? 'Änderungen speichern' : 'Transaktion hinzufügen'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<Summary>({
    income: '0.00',
    expenses: '0.00',
    balance: '0.00',
    transaction_count: 0,
    category_totals: {},
  })
  const [filters, setFilters] = useState<Filters>({ type: '', category: '', month: currentMonth(), search: '' })
  const [draftSearch, setDraftSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | undefined>()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    const query = new URLSearchParams()
    if (filters.type) query.set('type', filters.type)
    if (filters.category) query.set('category', filters.category)
    if (filters.month) query.set('month', filters.month)
    if (filters.search) query.set('search', filters.search)

    const summaryQuery = filters.month ? `?month=${encodeURIComponent(filters.month)}` : ''

    try {
      const [transactionData, summaryData] = await Promise.all([
        apiRequest<Transaction[]>(`/transactions${query.size ? `?${query}` : ''}`),
        apiRequest<Summary>(`/summary${summaryQuery}`),
      ])
      setTransactions(transactionData)
      setSummary(summaryData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Daten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const maxCategoryTotal = useMemo(
    () => Math.max(...Object.values(summary.category_totals).map((value) => Number(value)), 1),
    [summary.category_totals],
  )

  async function saveTransaction(form: FormState) {
    setSaving(true)
    try {
      const payload = JSON.stringify({ ...form, notes: form.notes.trim() || null })
      if (editing) {
        await apiRequest(`/transactions/${editing.id}`, { method: 'PUT', body: payload })
      } else {
        await apiRequest('/transactions', { method: 'POST', body: payload })
      }
      setShowForm(false)
      setEditing(undefined)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function deleteTransaction(transaction: Transaction) {
    if (!window.confirm(`„${transaction.title}“ wirklich löschen?`)) return
    try {
      await apiRequest(`/transactions/${transaction.id}`, { method: 'DELETE' })
      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Löschen fehlgeschlagen.')
    }
  }

  function resetFilters() {
    setDraftSearch('')
    setFilters({ type: '', category: '', month: '', search: '' })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">€</div>
          <div>
            <strong>Expense Tracker</strong>
            <span>Personal Finance Dashboard</span>
          </div>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setEditing(undefined)
            setShowForm(true)
          }}
        >
          <span aria-hidden="true">＋</span> Neue Transaktion
        </button>
      </header>

      <main className="content">
        <section className="hero">
          <div>
            <p className="eyebrow">Finanzübersicht</p>
            <h1>Behalte deine Ausgaben im Blick.</h1>
            <p>Verwalte Einnahmen und Ausgaben, filtere Transaktionen und erkenne deine größten Kostenblöcke.</p>
          </div>
          <div className="hero__month">
            <label htmlFor="dashboard-month">Zeitraum</label>
            <input
              id="dashboard-month"
              type="month"
              value={filters.month}
              onChange={(event) => setFilters({ ...filters, month: event.target.value })}
            />
          </div>
        </section>

        {error && (
          <div className="alert" role="alert">
            <strong>Verbindung fehlgeschlagen.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void loadData()}>Erneut versuchen</button>
          </div>
        )}

        <section className="summary-grid" aria-label="Finanzkennzahlen">
          <SummaryCard label="Saldo" value={formatCurrency(summary.balance)} hint="Einnahmen minus Ausgaben" />
          <SummaryCard label="Einnahmen" value={formatCurrency(summary.income)} hint="Im gewählten Zeitraum" tone="positive" />
          <SummaryCard label="Ausgaben" value={formatCurrency(summary.expenses)} hint="Im gewählten Zeitraum" tone="negative" />
          <SummaryCard label="Transaktionen" value={String(summary.transaction_count)} hint="Im gewählten Zeitraum" />
        </section>

        <div className="dashboard-grid">
          <section className="panel panel--transactions">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Verlauf</p>
                <h2>Transaktionen</h2>
              </div>
              <span className="result-count">{transactions.length} Treffer</span>
            </div>

            <form
              className="filters"
              onSubmit={(event) => {
                event.preventDefault()
                setFilters({ ...filters, search: draftSearch.trim() })
              }}
            >
              <input
                aria-label="Transaktionen durchsuchen"
                type="search"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="Titel oder Notiz suchen …"
              />
              <select
                aria-label="Nach Typ filtern"
                value={filters.type}
                onChange={(event) => setFilters({ ...filters, type: event.target.value as Filters['type'] })}
              >
                <option value="">Alle Typen</option>
                <option value="income">Einnahmen</option>
                <option value="expense">Ausgaben</option>
              </select>
              <select
                aria-label="Nach Kategorie filtern"
                value={filters.category}
                onChange={(event) => setFilters({ ...filters, category: event.target.value as Filters['category'] })}
              >
                <option value="">Alle Kategorien</option>
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
              <button className="button button--soft" type="submit">Suchen</button>
              <button className="button button--ghost" type="button" onClick={resetFilters}>Zurücksetzen</button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Transaktion</th>
                    <th>Kategorie</th>
                    <th>Datum</th>
                    <th className="numeric">Betrag</th>
                    <th><span className="sr-only">Aktionen</span></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="empty-state">Daten werden geladen …</td></tr>
                  ) : transactions.length === 0 ? (
                    <tr><td colSpan={5} className="empty-state">Keine passenden Transaktionen gefunden.</td></tr>
                  ) : (
                    transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>
                          <div className="transaction-title">
                            <span className={`type-dot type-dot--${transaction.type}`} aria-hidden="true" />
                            <div>
                              <strong>{transaction.title}</strong>
                              {transaction.notes && <span>{transaction.notes}</span>}
                            </div>
                          </div>
                        </td>
                        <td><span className="category-badge">{categoryLabels[transaction.category]}</span></td>
                        <td>{dateFormatter.format(new Date(`${transaction.date}T00:00:00`))}</td>
                        <td className={`numeric amount amount--${transaction.type}`}>
                          {transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount)}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(transaction)
                                setShowForm(true)
                              }}
                              aria-label={`${transaction.title} bearbeiten`}
                            >
                              Bearbeiten
                            </button>
                            <button
                              type="button"
                              className="danger-link"
                              onClick={() => void deleteTransaction(transaction)}
                              aria-label={`${transaction.title} löschen`}
                            >
                              Löschen
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="panel category-panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Analyse</p>
                <h2>Ausgaben nach Kategorie</h2>
              </div>
            </div>

            <div className="category-list">
              {Object.entries(summary.category_totals).length === 0 ? (
                <p className="empty-state">Für diesen Zeitraum liegen keine Ausgaben vor.</p>
              ) : (
                Object.entries(summary.category_totals).map(([category, total]) => {
                  const value = Number(total)
                  const width = Math.max((value / maxCategoryTotal) * 100, 3)
                  return (
                    <div className="category-row" key={category}>
                      <div className="category-row__meta">
                        <span>{categoryLabels[category as Category]}</span>
                        <strong>{formatCurrency(String(total))}</strong>
                      </div>
                      <div className="progress" aria-hidden="true">
                        <span style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </aside>
        </div>
      </main>

      {showForm && (
        <TransactionForm
          initial={editing}
          saving={saving}
          onCancel={() => {
            setShowForm(false)
            setEditing(undefined)
          }}
          onSave={saveTransaction}
        />
      )}
    </div>
  )
}
