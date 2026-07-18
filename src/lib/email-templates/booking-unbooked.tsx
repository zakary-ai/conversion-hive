import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  reapplyUrl?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const cta = {
  backgroundColor: '#ffffff', color: '#0a0a14', padding: '12px 20px',
  borderRadius: '10px', fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: '10px',
}
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

export const BookingUnbookedEmail = ({ name, reapplyUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reapply to book a new interview time</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Heading style={heading}>Sorry we missed you{name ? `, ${name}` : ''}</Heading>
          <Text style={muted}>
            Unfortunately all of our interviewers were booked up for your scheduled time and
            we weren't able to assign someone to your call.
          </Text>
          <Text style={muted}>
            We'd still love to talk. You can pick a new time using the link below — this link
            is valid for the next 5 days.
          </Text>
          {reapplyUrl ? (
            <Button href={reapplyUrl} style={cta}>Pick a new time</Button>
          ) : null}
        </Section>
        <Text style={footer}>Talk soon.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingUnbookedEmail,
  subject: "We couldn't cover your interview — reapply here",
  displayName: 'Booking unbooked (reapply)',
  previewData: {
    name: 'Alex',
    reapplyUrl: 'https://conversionlab.space/apply?reapply=00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry
