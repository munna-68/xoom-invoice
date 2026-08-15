import { deleteInvoiceRecord, getInvoice } from '../lib/redis.js'

const SLUG_PATTERN = /^[A-Z0-9-]{4,40}$/

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toUpperCase()

  if (!SLUG_PATTERN.test(slug)) {
    return res.status(404).json({ error: 'Invoice not found' })
  }

  if (req.method === 'DELETE') {
    await deleteInvoiceRecord(slug)
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const invoice = await getInvoice(slug)
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' })
  }

  return res.status(200).json(invoice)
}
