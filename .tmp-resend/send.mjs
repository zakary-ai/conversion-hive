import { createClient } from '@supabase/supabase-js'
import { sendLovableEmail } from '@lovable.dev/email-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY
const SEND_URL = process.env.LOVABLE_SEND_URL

if (!SUPABASE_URL || !SERVICE_KEY || !LOVABLE_API_KEY) throw new Error('Missing required env')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const SITE_NAME = 'Conversion Lab'
const FROM_DOMAIN = 'notify.conversionlab.company'
const SENDER_DOMAIN = 'notify.conversionlab.company'
const APP_ORIGIN = 'https://conversionlab.space'

const apptIds = {
  tce: '877ba68f-a200-4e68-95a1-851ecac30136',
  blues: 'ff35baa4-c03e-4974-b139-e47dc53389d1',
}

function token() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function label(iso, tz) {
  const effectiveTz = tz && tz.trim() ? tz : 'America/New_York'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: effectiveTz,
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(iso))
}

async function unsubscribeToken(email) {
  const normalized = email.toLowerCase()
  const { data: suppressed } = await supabase.from('suppressed_emails').select('id').eq('email', normalized).maybeSingle()
  if (suppressed) throw new Error(`${email} is suppressed`)
  const { data: existing } = await supabase.from('email_unsubscribe_tokens').select('token, used_at').eq('email', normalized).maybeSingle()
  if (existing && !existing.used_at) return existing.token
  const newToken = token()
  await supabase.from('email_unsubscribe_tokens').upsert({ token: newToken, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
  const { data: stored } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', normalized).maybeSingle()
  if (!stored?.token) throw new Error(`Could not create unsubscribe token for ${email}`)
  return stored.token
}

async function getAppointment(id) {
  const { data, error } = await supabase.from('appointments').select('id,name,email,scheduled_at,timezone,meeting_url,confirmation_token').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Missing appointment ${id}`)
  return data
}

function receivedHtml({ name, scheduledLabel, durationMinutes }) {
  return `<!doctype html><html><body style="margin:0;background:#fff;font-family:Inter,Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:0 auto;padding:32px 28px"><div style="background:#0a0a14;border-radius:16px;padding:28px;color:#fff"><h1 style="color:#fff;font-size:22px;margin:0 0 12px;font-weight:600">Thanks for booking${name ? `, ${name}` : ''} 🎉</h1><p style="color:#cbd5e1;font-size:14px;line-height:22px;margin:0 0 12px">We've received your booking. Here are your details:</p><p style="color:#fff;font-size:15px;line-height:24px;margin:4px 0"><strong>When:</strong> ${scheduledLabel}</p><p style="color:#fff;font-size:15px;line-height:24px;margin:4px 0"><strong>Duration:</strong> ${durationMinutes} minutes</p><p style="color:#cbd5e1;font-size:14px;line-height:22px;margin:16px 0 12px">You'll receive another email shortly with your Zoom link once an ads specialist has been assigned to your call.</p></div><p style="color:#64748b;font-size:12px;margin:20px 0 0;text-align:center">Talk soon.</p></div></body></html>`
}

function receivedText({ name, scheduledLabel, durationMinutes }) {
  return `Thanks for booking${name ? `, ${name}` : ''}!\n\nWe've received your booking.\n\nWhen: ${scheduledLabel}\nDuration: ${durationMinutes} minutes\n\nYou'll receive another email shortly with your Zoom link once an ads specialist has been assigned to your call.\n\nTalk soon.`
}

function confirmationHtml({ name, scheduledLabel, durationMinutes, meetingUrl, confirmUrl }) {
  const loom = 'https://www.loom.com/share/ad9a5d9b3d13417ea1f05e22dcc52799'
  return `<!doctype html><html><body style="margin:0;background:#fff;font-family:Inter,Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:0 auto;padding:32px 28px"><div style="background:#0a0a14;border-radius:16px;padding:28px;color:#fff"><h1 style="color:#fff;font-size:22px;margin:0 0 12px;font-weight:600">You're booked${name ? `, ${name}` : ''} 🎉</h1><p style="color:#cbd5e1;font-size:14px;line-height:22px;margin:0 0 12px">Thanks for booking. Your meeting is confirmed.</p><p style="color:#fff;font-size:15px;line-height:24px;margin:4px 0"><strong>When:</strong> ${scheduledLabel}</p><p style="color:#fff;font-size:15px;line-height:24px;margin:4px 0"><strong>Duration:</strong> ${durationMinutes} minutes</p><p style="color:#fff;font-size:15px;line-height:24px;margin:4px 0"><strong>Zoom link:</strong></p><p style="margin-top:14px"><a href="${meetingUrl}" style="background:#6366f1;color:#fff;border-radius:10px;padding:12px 20px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">Join Zoom call</a></p><p style="color:#cbd5e1;font-size:14px;line-height:22px;margin-top:14px;word-break:break-all">${meetingUrl}</p><p style="color:#cbd5e1;font-size:13px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.08em;font-weight:600">Watch this before our call</p><div style="margin-top:12px;background:#111827;border-radius:12px;padding:18px 20px;border:1px solid #1f2937"><p style="color:#fff;font-size:15px;line-height:24px;margin:0 0 12px">A quick intro video from our team — please watch before we hop on.</p><a href="${loom}" style="background:#fff;color:#0a0a14;border-radius:10px;padding:12px 20px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">▶ Watch on Loom</a></div><p style="color:#cbd5e1;font-size:13px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.08em;font-weight:600">Please confirm</p><p style="color:#cbd5e1;font-size:14px;line-height:22px;margin:0 0 12px">Tap the button below to confirm your booking. This helps your ads specialist know you'll be there.</p><p style="margin-top:10px"><a href="${confirmUrl}" style="background:#22c55e;color:#fff;border-radius:10px;padding:12px 20px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">Confirm my booking</a></p></div><p style="color:#64748b;font-size:12px;margin:20px 0 0;text-align:center">See you on the call.</p></div></body></html>`
}

function confirmationText({ name, scheduledLabel, durationMinutes, meetingUrl, confirmUrl }) {
  return `You're booked${name ? `, ${name}` : ''}!\n\nThanks for booking. Your meeting is confirmed.\n\nWhen: ${scheduledLabel}\nDuration: ${durationMinutes} minutes\nZoom link: ${meetingUrl}\n\nWatch this before our call: https://www.loom.com/share/ad9a5d9b3d13417ea1f05e22dcc52799\n\nPlease confirm your booking: ${confirmUrl}\n\nSee you on the call.`
}

async function sendEmail({ appointment, template, subject, html, text, idempotencyKey }) {
  const messageId = crypto.randomUUID()
  const unsub = await unsubscribeToken(appointment.email)
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: template,
    recipient_email: appointment.email,
    status: 'pending',
    metadata: { manual_resend: true, appointment_id: appointment.id },
  })
  try {
    await sendLovableEmail({
      to: appointment.email,
      from: `${SITE_NAME} <bookings@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: template,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsub,
      message_id: messageId,
    }, { apiKey: LOVABLE_API_KEY, sendUrl: SEND_URL })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: template,
      recipient_email: appointment.email,
      status: 'sent',
      metadata: { manual_resend: true, appointment_id: appointment.id },
    })
    console.log(`sent ${template} to ${appointment.email}`)
  } catch (e) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: template,
      recipient_email: appointment.email,
      status: 'failed',
      error_message: e instanceof Error ? e.message.slice(0, 1000) : String(e).slice(0, 1000),
      metadata: { manual_resend: true, appointment_id: appointment.id },
    })
    throw e
  }
}

async function ensureConfirmationToken(appointment) {
  if (appointment.confirmation_token) return appointment.confirmation_token
  const newToken = token()
  const { error } = await supabase.from('appointments').update({ confirmation_token: newToken }).eq('id', appointment.id)
  if (error) throw error
  appointment.confirmation_token = newToken
  return newToken
}

const slotMinutes = 30
const tce = await getAppointment(apptIds.tce)
const blues = await getAppointment(apptIds.blues)

for (const appointment of [blues, tce]) {
  const scheduledLabel = label(appointment.scheduled_at, appointment.timezone)
  await sendEmail({
    appointment,
    template: 'booking-received',
    subject: 'Thanks for your booking — details inside',
    html: receivedHtml({ name: appointment.name, scheduledLabel, durationMinutes: slotMinutes }),
    text: receivedText({ name: appointment.name, scheduledLabel, durationMinutes: slotMinutes }),
    idempotencyKey: `booking-received-${appointment.id}`,
  })
}

if (tce.meeting_url) {
  const scheduledLabel = label(tce.scheduled_at, tce.timezone)
  const confirmationToken = await ensureConfirmationToken(tce)
  const confirmUrl = `${APP_ORIGIN}/confirm-booking?token=${confirmationToken}`
  await sendEmail({
    appointment: tce,
    template: 'booking-confirmation',
    subject: 'Your meeting is confirmed — Zoom link inside',
    html: confirmationHtml({ name: tce.name, scheduledLabel, durationMinutes: slotMinutes, meetingUrl: tce.meeting_url, confirmUrl }),
    text: confirmationText({ name: tce.name, scheduledLabel, durationMinutes: slotMinutes, meetingUrl: tce.meeting_url, confirmUrl }),
    idempotencyKey: `booking-confirm-${tce.id}`,
  })
}
