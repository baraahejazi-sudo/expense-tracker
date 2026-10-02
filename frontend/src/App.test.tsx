import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const transaction = {
  id: 'txn_test',
  title: 'Wocheneinkauf',
  amount: '42.50',
  type: 'expense',
  category: 'food',
  date: '2026-10-02',
  notes: 'Supermarkt',
  created_at: '2026-10-02T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
}

function mockInitialRequests() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/summary')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              income: '3200.00',
              expenses: '42.50',
              balance: '3157.50',
              transaction_count: 1,
              category_totals: { food: '42.50' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify([transaction]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Expense Tracker', () => {
  it('renders API summary and transactions', async () => {
    mockInitialRequests()
    render(<App />)

    expect(await screen.findByText('Wocheneinkauf')).toBeInTheDocument()
    expect(screen.getByText(/3\.157,50/)).toBeInTheDocument()
    expect(screen.getByText('Supermarkt')).toBeInTheDocument()
  })

  it('opens the transaction form', async () => {
    mockInitialRequests()
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('Wocheneinkauf')
    await user.click(screen.getByRole('button', { name: /neue transaktion/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Neue Transaktion' })).toBeInTheDocument()
  })

  it('submits a new transaction', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ ...transaction, id: 'txn_created' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      if (url.includes('/summary')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              income: '0.00',
              expenses: '42.50',
              balance: '-42.50',
              transaction_count: 1,
              category_totals: { food: '42.50' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify([transaction]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Wocheneinkauf')
    await user.click(screen.getByRole('button', { name: /neue transaktion/i }))

    await user.type(screen.getByLabelText('Titel'), 'Kaffee')
    await user.type(screen.getByLabelText(/Betrag/), '4.90')
    await user.click(screen.getByRole('button', { name: 'Transaktion hinzufügen' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/transactions'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
