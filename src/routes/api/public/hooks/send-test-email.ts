import { createFileRoute } from '@tanstack/react-router'

// Temporary internal helper: sends one example app email. Guarded by a shared secret.
export const Route = createFileRoute('/api/public/hooks/send-test-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          secret?: string
          to?: string
          template?: string
          data?: Record<string, unknown>
        }
        if (!body.secret || body.secret !== process.env['BACKFILL_ADMIN_SECRET']) {
          return new Response('Unauthorized', { status: 401 })
        }
        const { sendTransactional } = await import('@/lib/email/transactional.server')
        const res = await sendTransactional({
          templateName: body.template || 'booking-rescheduled',
          recipientEmail: body.to || '',
          idempotencyKey: `example-${Date.now()}`,
          templateData: body.data ?? {},
        })
        return Response.json(res)
      },
    },
  },
})
