import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  managerName?: string
  scheduledLabel?: string
  meetingUrl?: string | null
  durationMinutes?: number
  forManager?: boolean
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const detail = { color: '#ffffff', fontSize: '15px', lineHeight: '24px', margin: '4px 0' }
const primaryBtn = { backgroundColor: '#6366f1', color: '#ffffff', borderRadius: '10px', padding: '12px 20px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

export const OneOnOneCallReminderEmail = ({ name, managerName, scheduledLabel, meetingUrl, durationMinutes, forManager }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your call starts in 15 minutes</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Heading style={heading}>Starting in 15 minutes</Heading>
          <Text style={muted}>
            {forManager
              ? `Your 1-on-1 call${name ? ` with ${name}` : ''} starts in about 15 minutes.`
              : `Your 1-on-1 call${managerName ? ` with ${managerName}` : ''} starts in about 15 minutes.`}
          </Text>
          <Text style={detail}><strong>When:</strong> {scheduledLabel || 'in 15 minutes'}</Text>
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
        <Text style={footer}>See you on the call.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OneOnOneCallReminderEmail,
  subject: 'Your call starts in 15 minutes',
  displayName: '1-on-1 call reminder',
  previewData: {
    name: 'Alex',
    managerName: 'Bailie Merichko',
    scheduledLabel: 'Tuesday, June 30, 2026 at 2:00 PM EDT',
    meetingUrl: 'https://zoom.us/j/123456789',
    durationMinutes: 30,
  },
} satisfies TemplateEntry
