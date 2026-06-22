import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  closerName?: string
  applicantName?: string
  applicantEmail?: string
  applicantPhone?: string
  scheduledAt?: string
  scheduledLabel?: string
  meetingUrl?: string
  durationMinutes?: number
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const detail = { color: '#ffffff', fontSize: '15px', lineHeight: '24px', margin: '4px 0' }
const button = { backgroundColor: '#6366f1', color: '#ffffff', borderRadius: '10px', padding: '12px 20px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

const Email = ({ closerName, applicantName, applicantEmail, applicantPhone, scheduledLabel, scheduledAt, meetingUrl, durationMinutes }: Props) => {
  const when = scheduledLabel || scheduledAt || 'the scheduled time'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New call assigned — Zoom link inside</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading style={heading}>New call assigned{closerName ? `, ${closerName}` : ''}</Heading>
            <Text style={muted}>You've been assigned a new interview. Details below.</Text>
            {applicantName ? <Text style={detail}><strong>Lead:</strong> {applicantName}</Text> : null}
            {applicantEmail ? <Text style={detail}><strong>Email:</strong> {applicantEmail}</Text> : null}
            {applicantPhone ? <Text style={detail}><strong>Phone:</strong> {applicantPhone}</Text> : null}
            <Text style={detail}><strong>When:</strong> {when}</Text>
            {durationMinutes ? <Text style={detail}><strong>Duration:</strong> {durationMinutes} minutes</Text> : null}
            {meetingUrl ? (
              <>
                <Section style={{ marginTop: '14px' }}>
                  <Button href={meetingUrl} style={button}>Join Zoom call</Button>
                </Section>
                <Text style={{ ...muted, marginTop: '14px', wordBreak: 'break-all' }}>{meetingUrl}</Text>
              </>
            ) : (
              <Text style={muted}>Zoom link is being generated.</Text>
            )}
          </Section>
          <Text style={footer}>Good luck on the call.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'New interview assigned — Zoom link inside',
  displayName: 'Closer call — closer notification',
  previewData: {
    closerName: 'Jamie',
    applicantName: 'Alex Johnson',
    applicantEmail: 'alex@example.com',
    applicantPhone: '+1 555-123-4567',
    scheduledLabel: 'Tuesday, June 24, 2026 at 2:00 PM EDT',
    meetingUrl: 'https://zoom.us/j/123456789',
    durationMinutes: 30,
  },
} satisfies TemplateEntry
