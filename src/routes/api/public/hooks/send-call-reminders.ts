import { createFileRoute } from '@tanstack/react-router'

// Cron-triggered: send a 15-minute reminder email to leads with an upcoming
// assigned interview. Idempotent via reminder_sent_at column.
export const Route = createFileRoute('/api/public/hooks/send-call-reminders')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { sendTransactional } = await import('@/lib/email/transactional.server')

          // Window: bookings starting in 13–17 minutes from now and not yet reminded.
          const now = Date.now()
          const windowStart = new Date(now + 13 * 60_000).toISOString()
          const windowEnd = new Date(now + 17 * 60_000).toISOString()

          const { data: rows, error } = await supabaseAdmin
            .from('closer_bookings')
            .select('id, applicant_name, applicant_email, slot_start, zoom_join_url, status, reminder_sent_at, slot_end, closers:assigned_closer_id ( full_name )')
            .eq('status', 'assigned')
            .is('reminder_sent_at', null)
            .gte('slot_start', windowStart)
            .lte('slot_start', windowEnd)

          if (error) {
            console.error('[reminders] query failed', error)
            return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
          }

          let sent = 0
          for (const b of rows ?? []) {
            const email = b.applicant_email as string | null
            if (!email) continue
            const startISO = b.slot_start as string
            let scheduledLabel = startISO
            try {
              scheduledLabel = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
              }).format(new Date(startISO))
            } catch { /* ignore */ }

            const durationMinutes = Math.max(
              1,
              Math.round((new Date(b.slot_end as string).getTime() - new Date(startISO).getTime()) / 60_000)
            )

            const result = await sendTransactional({
              templateName: 'closer-call-prospect-reminder',
              recipientEmail: email,
              idempotencyKey: `closer-booking-reminder-${b.id}`,
              templateData: {
                name: b.applicant_name,
                scheduledAt: startISO,
                scheduledLabel,
                meetingUrl: b.zoom_join_url,
                durationMinutes,
                closerName: (b as any).closers?.full_name ?? undefined,
              },
            })

            if (result.ok) {
              await supabaseAdmin
                .from('closer_bookings')
                .update({ reminder_sent_at: new Date().toISOString() })
                .eq('id', b.id as string)
              sent++
            } else {
              console.warn('[reminders] send failed', b.id, result.reason)
            }
          }

          return new Response(JSON.stringify({ ok: true, checked: rows?.length ?? 0, sent }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e) {
          console.error('[reminders] unexpected error', e)
          return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 })
        }
      },
    },
  },
})
