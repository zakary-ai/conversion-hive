import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'conversion-hive'
const SENDER_DOMAIN = 'notify.conversionlab.company'
const FROM_DOMAIN = 'notify.conversionlab.company'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sendTransactional(input: {
  templateName: string
  recipientEmail: string
  idempotencyKey: string
  templateData?: Record<string, unknown>
}): Promise<{ ok: boolean; reason?: string }> {
  const template = TEMPLATES[input.templateName]
  if (!template) return { ok: false, reason: 'template_not_found' }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const recipient = (template.to || input.recipientEmail || '').trim()
  if (!recipient) return { ok: false, reason: 'no_recipient' }

  const normalized = recipient.toLowerCase()
  const messageId = crypto.randomUUID()

  // Suppression check
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails').select('id').eq('email', normalized).maybeSingle()
  if (suppressed) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId, template_name: input.templateName,
      recipient_email: recipient, status: 'suppressed',
    })
    return { ok: false, reason: 'email_suppressed' }
  }

  // Unsubscribe token
  let unsubscribeToken: string
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens').select('token, used_at').eq('email', normalized).maybeSingle()
  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token as string
  } else {
    unsubscribeToken = generateToken()
    await supabaseAdmin.from('email_unsubscribe_tokens')
      .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens').select('token').eq('email', normalized).maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token as string
  }

  const data = (input.templateData ?? {}) as Record<string, unknown>
  const element = React.createElement(template.component, data)
  const html = await renderAsync(element)
  const text = await renderAsync(element, { plainText: true })
  const subject = typeof template.subject === 'function' ? template.subject(data) : template.subject

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId, template_name: input.templateName,
    recipient_email: recipient, status: 'pending',
  })

  const { error } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: input.templateName,
      idempotency_key: input.idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (error) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId, template_name: input.templateName,
      recipient_email: recipient, status: 'failed',
      error_message: `Failed to enqueue: ${error.message}`,
    })
    return { ok: false, reason: 'enqueue_failed' }
  }
  return { ok: true }
}
