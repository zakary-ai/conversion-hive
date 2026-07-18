import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

export const BookingDeclinedEmail = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>An update on your application</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Heading style={heading}>Thanks for applying{name ? `, ${name}` : ''}</Heading>
          <Text style={muted}>
            We appreciate you taking the time to apply and share your details with us.
          </Text>
          <Text style={muted}>
            After reviewing your application, we've decided to move in another direction at this time.
            We wish you the very best going forward.
          </Text>
        </Section>
        <Text style={footer}>— The team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingDeclinedEmail,
  subject: 'An update on your application',
  displayName: 'Booking declined',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry
