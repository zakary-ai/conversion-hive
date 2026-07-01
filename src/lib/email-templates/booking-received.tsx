import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  scheduledLabel?: string
  scheduledAt?: string
  durationMinutes?: number
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const detail = { color: '#ffffff', fontSize: '15px', lineHeight: '24px', margin: '4px 0' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

export const BookingReceivedEmail = ({ name, scheduledLabel, scheduledAt, durationMinutes }: Props) => {
  const when = scheduledLabel || scheduledAt || 'your scheduled time'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Thanks for your booking — details inside</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading style={heading}>Thanks for booking{name ? `, ${name}` : ''} 🎉</Heading>
            <Text style={muted}>
              We've received your booking. Here are your details:
            </Text>
            <Text style={detail}><strong>When:</strong> {when}</Text>
            {durationMinutes ? <Text style={detail}><strong>Duration:</strong> {durationMinutes} minutes</Text> : null}
            <Text style={{ ...muted, marginTop: '16px' }}>
              You'll receive another email shortly with your Zoom link once an ads specialist has been assigned to your call.
            </Text>
          </Section>
          <Text style={footer}>Talk soon.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BookingReceivedEmail,
  subject: 'Thanks for your booking — details inside',
  displayName: 'Booking received',
  previewData: {
    name: 'Alex',
    scheduledLabel: 'Tuesday, June 30, 2026 at 2:00 PM EDT',
    durationMinutes: 30,
  },
} satisfies TemplateEntry
