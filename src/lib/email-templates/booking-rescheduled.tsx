import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  previousLabel?: string
  newLabel?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const detail = { color: '#ffffff', fontSize: '15px', lineHeight: '24px', margin: '4px 0' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

export const BookingRescheduledEmail = ({ name, previousLabel, newLabel }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your interview has been rescheduled</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Heading style={heading}>Your interview was rescheduled{name ? `, ${name}` : ''}</Heading>
          <Text style={muted}>
            Heads up — your interview time has been updated. Here are the new details:
          </Text>
          {previousLabel ? <Text style={detail}><strong>Previous time:</strong> {previousLabel}</Text> : null}
          <Text style={detail}><strong>New time:</strong> {newLabel || 'TBD'}</Text>
          <Text style={{ ...muted, marginTop: '16px' }}>
            You'll receive a fresh calendar invite with the call details shortly.
          </Text>
        </Section>
        <Text style={footer}>Talk soon.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingRescheduledEmail,
  subject: 'Your interview has been rescheduled',
  displayName: 'Booking rescheduled',
  previewData: {
    name: 'Alex',
    previousLabel: 'Tuesday, June 30 at 2:00 PM EDT',
    newLabel: 'Thursday, July 2 at 4:00 PM EDT',
  },
} satisfies TemplateEntry
