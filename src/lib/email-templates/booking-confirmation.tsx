import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  scheduledAt?: string
  scheduledLabel?: string
  meetingUrl?: string | null
  durationMinutes?: number
  confirmUrl?: string | null
  loomUrl?: string | null
  loomThumbnailUrl?: string | null
}

const DEFAULT_LOOM_URL = 'https://www.loom.com/share/ad9a5d9b3d13417ea1f05e22dcc52799'
const DEFAULT_LOOM_THUMB = 'https://cdn.loom.com/sessions/thumbnails/ad9a5d9b3d13417ea1f05e22dcc52799-with-play.gif'

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const detail = { color: '#ffffff', fontSize: '15px', lineHeight: '24px', margin: '4px 0' }
const primaryBtn = { backgroundColor: '#6366f1', color: '#ffffff', borderRadius: '10px', padding: '12px 20px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const confirmBtn = { backgroundColor: '#22c55e', color: '#ffffff', borderRadius: '10px', padding: '12px 20px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }
const loomCard = { marginTop: '12px', backgroundColor: '#111827', borderRadius: '12px', padding: '18px 20px', border: '1px solid #1f2937' }
const loomBtn = { backgroundColor: '#ffffff', color: '#0a0a14', borderRadius: '10px', padding: '12px 20px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const sectionLabel = { color: '#cbd5e1', fontSize: '13px', margin: '20px 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }

export const BookingConfirmationEmail = ({ name, scheduledLabel, scheduledAt, meetingUrl, durationMinutes, confirmUrl, loomUrl, loomThumbnailUrl }: Props) => {
  const when = scheduledLabel || scheduledAt || 'your scheduled time'
  const loom = loomUrl || DEFAULT_LOOM_URL
  const loomThumb = loomThumbnailUrl || DEFAULT_LOOM_THUMB
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your meeting is confirmed — Zoom link inside</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading style={heading}>You're booked{name ? `, ${name}` : ''} 🎉</Heading>
            <Text style={muted}>Thanks for booking. Your meeting is confirmed.</Text>
            <Text style={detail}><strong>When:</strong> {when}</Text>
            {durationMinutes ? <Text style={detail}><strong>Duration:</strong> {durationMinutes} minutes</Text> : null}
            {meetingUrl ? (
              <>
                <Text style={detail}><strong>Zoom link:</strong></Text>
                <Section style={{ marginTop: '14px' }}>
                  <Button href={meetingUrl} style={primaryBtn}>Join Zoom call</Button>
                </Section>
                <Text style={{ ...muted, marginTop: '14px', wordBreak: 'break-all' }}>{meetingUrl}</Text>
              </>
            ) : (
              <Text style={muted}>The meeting link will be sent shortly.</Text>
            )}

            <Text style={sectionLabel}>Watch this before our call</Text>
            <Section style={loomWrap}>
              <Link href={loom}>
                <Img src={loomThumb} alt="Watch the intro video on Loom" style={loomImg} width={504} />
              </Link>
            </Section>
            <Text style={{ ...muted, marginTop: '8px', fontSize: '12px' }}>
              <Link href={loom} style={{ color: '#93c5fd' }}>Watch on Loom →</Link>
            </Text>

            {confirmUrl ? (
              <>
                <Text style={sectionLabel}>Please confirm</Text>
                <Text style={muted}>
                  Tap the button below to confirm your booking. This helps your closer know you'll be there.
                </Text>
                <Section style={{ marginTop: '10px' }}>
                  <Button href={confirmUrl} style={confirmBtn}>Confirm my booking</Button>
                </Section>
              </>
            ) : null}
          </Section>
          <Text style={footer}>See you on the call.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BookingConfirmationEmail,
  subject: 'Your meeting is confirmed — Zoom link inside',
  displayName: 'Booking confirmation',
  previewData: {
    name: 'Alex',
    scheduledLabel: 'Tuesday, June 30, 2026 at 2:00 PM EDT',
    meetingUrl: 'https://zoom.us/j/123456789',
    durationMinutes: 30,
    confirmUrl: 'https://conversionlab.space/confirm-booking?token=preview',
    loomUrl: DEFAULT_LOOM_URL,
    loomThumbnailUrl: DEFAULT_LOOM_THUMB,
  },
} satisfies TemplateEntry
