import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  managerName?: string
  name?: string
  email?: string
  phone?: string | null
  scheduledLabel?: string
  meetingUrl?: string | null
  durationMinutes?: number
  timezone?: string | null
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const detail = { color: '#ffffff', fontSize: '15px', lineHeight: '24px', margin: '4px 0' }
const primaryBtn = { backgroundColor: '#6366f1', color: '#ffffff', borderRadius: '10px', padding: '12px 20px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

export const OneOnOneCallManagerEmail = ({ managerName, name, email, phone, scheduledLabel, meetingUrl, durationMinutes, timezone }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New interview booked${name ? ` with ${name}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Heading style={heading}>New interview booked{managerName ? `, ${managerName}` : ''}</Heading>
          <Text style={muted}>Someone just booked a 1-on-1 call on your calendar.</Text>
          <Text style={detail}><strong>Name:</strong> {name || 'Not provided'}</Text>
          <Text style={detail}><strong>Email:</strong> {email || 'Not provided'}</Text>
          {phone ? <Text style={detail}><strong>Phone:</strong> {phone}</Text> : null}
          <Text style={detail}><strong>When:</strong> {scheduledLabel || 'See your calendar'}</Text>
          {timezone ? <Text style={detail}><strong>Their timezone:</strong> {timezone}</Text> : null}
          {durationMinutes ? <Text style={detail}><strong>Duration:</strong> {durationMinutes} minutes</Text> : null}
          {meetingUrl ? (
            <>
              <Section style={{ marginTop: '16px' }}>
                <Button href={meetingUrl} style={primaryBtn}>Join the call</Button>
              </Section>
              <Text style={{ ...muted, marginTop: '14px', wordBreak: 'break-all' }}>{meetingUrl}</Text>
            </>
          ) : null}
        </Section>
        <Text style={footer}>Conversion Lab</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OneOnOneCallManagerEmail,
  subject: (data: Record<string, any>) => `New interview booked${data?.name ? `: ${data.name}` : ''}`,
  displayName: '1-on-1 call booked (manager)',
  previewData: {
    managerName: 'Bailie Merichko',
    name: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '+1 555 010 1234',
    scheduledLabel: 'Tuesday, June 30, 2026 at 2:00 PM EDT',
    meetingUrl: 'https://zoom.us/j/123456789',
    durationMinutes: 30,
    timezone: 'America/Chicago',
  },
} satisfies TemplateEntry
