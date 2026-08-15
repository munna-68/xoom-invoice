import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

const redis = url && token ? new Redis({ url, token }) : null

export function invoiceKey(slug) {
  return `invoice:${slug}`
}

export async function getInvoice(slug) {
  if (!redis) return null
  try {
    const raw = await redis.get(invoiceKey(slug))
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

export async function saveInvoice(slug, payload) {
  if (!redis) return false
  try {
    await redis.set(invoiceKey(slug), JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export async function deleteInvoiceRecord(slug) {
  if (!redis) return false
  try {
    await redis.del(invoiceKey(slug))
    return true
  } catch {
    return false
  }
}
