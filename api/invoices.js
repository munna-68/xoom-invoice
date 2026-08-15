import { getInvoice, saveInvoice } from '../lib/redis.js'

const MAX_RETRIES = 3

function normalizeInvoiceNumber(value) {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32)
  return cleaned || `INV-${String(Date.now()).slice(-6)}`
}

function isValidPayload(payload) {
  return Boolean(
    payload &&
    payload.profile &&
    typeof payload.clientName === 'string' &&
    payload.clientName.trim().length > 0 &&
    Number(payload.amount) > 0
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let payload
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  if (!isValidPayload(payload)) {
    return res.status(400).json({ error: 'Invalid invoice payload' })
  }

  const base = normalizeInvoiceNumber(payload.invoiceNumber)
  let slug = base

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const existing = await getInvoice(slug)
    if (!existing) break
    slug = `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  }

  const stored = await saveInvoice(slug, payload)
  if (!stored) {
    return res.status(503).json({ error: 'Storage unavailable. Link the Upstash Redis integration in Vercel.' })
  }

  return res.status(201).json({ slug })
}
