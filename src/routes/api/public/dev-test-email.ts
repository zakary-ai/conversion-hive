import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'Conversion Lab'
const SENDER_DOMAIN = 'notify.conversionlab.company'
const FROM_DOMAIN = 'notify.conversionlab.company'

function genToken() {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

export const Route = createFileRoute('/api/public/dev-test-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: 'Server not configured' }, { status: 500 })
        }
        const body = await request.json() as {
          templateName: string
          recipientEmail: string
          templateData?: Record<string, any>
          subjectPrefix?: string
        }
        const ALLOWED = new Set(['zakary@deleo.ai'])
        if (!ALLOWED.has(body.recipientEmail.toLowerCase())) {
          return Response.json({ error: 'Recipient not allowed' }, { status: 403 })
        }
        const template = TEMPLATES[body.templateName]
        if (!template) {
          return Response.json({ error: 'Template not found' }, { status: 404 })
        }
        const element = React.createElement(template.component, body.templateData ?? {})
        const html = await renderAsync(element)
        const text = await renderAsync(element, { plainText: true })
        const resolvedSubject =
          typeof template.subject === 'function' ? template.subject(body.templateData ?? {}) : template.subject
        const subject = (body.subjectPrefix ?? '') + resolvedSubject

        const supabase = createClient(supabaseUrl, serviceKey)
        const messageId = crypto.randomUUID()
        const unsubscribeToken = genToken()
        await supabase.from('email_unsubscribe_tokens').upsert(
          { token: unsubscribeToken, email: body.recipientEmail.toLowerCase() },
          { onConflict: 'email', ignoreDuplicates: true },
        )
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: body.templateName,
          recipient_email: body.recipientEmail,
          status: 'pending',
        })
        const { error } = await supabase.rpc('enqueue_email', {
          queue_name: 'transactional_emails',
          payload: {
            message_id: messageId,
            to: body.recipientEmail,
            from: `${SITE_NAME} <bookings@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text,
            purpose: 'transactional',
            label: body.templateName,
            idempotency_key: `dev-test-${messageId}`,
            unsubscribe_token: unsubscribeToken,
            queued_at: new Date().toISOString(),
          },
        })
        if (error) {
          return Response.json({ error: error.message }, { status: 500 })
        }
        return Response.json({ ok: true, messageId })
      },
    },
  },
})
