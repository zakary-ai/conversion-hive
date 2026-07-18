import { createFileRoute } from '@tanstack/react-router'

// Sweep: any booking whose slot has passed while still pending assignment
// becomes 'unbooked'. Applicants with credit "600-650" receive the decline
// email; everyone else gets the reapply link (valid 5 days from unbooked_at).
export const Route = createFileRoute('/api/public/hooks/mark-unbooked')({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { sendTransactional } = await import('@/lib/email/transactional.server')

        const nowIso = new Date().toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: due, error } = await (supabaseAdmin.from('closer_bookings') as any)
          .select('id, application_id, applicant_name, applicant_email, slot_start')
          .eq('status', 'pending_assignment')
          .lt('slot_start', nowIso)
          .limit(200)

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
          })
        }

        const rows = (due ?? []) as Array<{
          id: string
          application_id: string | null
          applicant_name: string
          applicant_email: string | null
          slot_start: string
        }>

        let flipped = 0
        let declined = 0
        let reapply = 0

        const publicBase =
          process.env.SITE_URL
          || process.env.PUBLIC_SITE_URL
          || 'https://conversionlab.space'

        for (const b of rows) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const upd = await (supabaseAdmin.from('closer_bookings') as any)
            .update({ status: 'unbooked', unbooked_at: nowIso })
            .eq('id', b.id)
            .eq('status', 'pending_assignment')
          if (upd.error) continue
          flipped += 1

          if (!b.applicant_email) continue

          let credit: string | null = null
          let bookingToken: string | null = null
          if (b.application_id) {
            const { data: app } = await supabaseAdmin
              .from('applications')
              .select('credit_score_range, booking_token')
              .eq('id', b.application_id)
              .maybeSingle()
            credit = (app?.credit_score_range as string | null) ?? null
            bookingToken = (app?.booking_token as string | null) ?? null
          }

          try {
            if (credit === '600-650') {
              await sendTransactional({
                templateName: 'booking-declined',
                recipientEmail: b.applicant_email,
                idempotencyKey: `booking-declined-${b.id}`,
                templateData: { name: b.applicant_name },
              })
              declined += 1
            } else {
              const reapplyUrl = bookingToken
                ? `${publicBase}/apply?reapply=${bookingToken}`
                : publicBase
              await sendTransactional({
                templateName: 'booking-unbooked',
                recipientEmail: b.applicant_email,
                idempotencyKey: `booking-unbooked-${b.id}`,
                templateData: { name: b.applicant_name, reapplyUrl },
              })
              reapply += 1
            }
          } catch (e) {
            console.warn('[mark-unbooked] email failed', b.id, e)
          }
        }

        return new Response(
          JSON.stringify({ ok: true, flipped, declined, reapply }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
