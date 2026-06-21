import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  closerName?: string
  email?: string
  password?: string
  loginUrl?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '22px', margin: '0 0 12px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const detail = { color: '#ffffff', fontSize: '15px', lineHeight: '24px', margin: '4px 0' }
const button = { backgroundColor: '#6366f1', color: '#ffffff', borderRadius: '10px', padding: '12px 20px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

const Email = ({ closerName, email, password, loginUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to Conversion Lab as a closer</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Heading style={heading}>Welcome{closerName ? `, ${closerName}` : ''}</Heading>
          <Text style={muted}>You've been added as a closer on Conversion Lab. Use the credentials below to log in. You'll be prompted to set a new password on your first login.</Text>
          {email ? <Text style={detail}><strong>Email:</strong> {email}</Text> : null}
          {password ? <Text style={detail}><strong>Temporary password:</strong> {password}</Text> : null}
          {loginUrl ? (
            <Section style={{ marginTop: '14px' }}>
              <Button href={loginUrl} style={button}>Log in</Button>
            </Section>
          ) : null}
        </Section>
        <Text style={footer}>If you weren't expecting this, you can ignore this email.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'You've been invited to Conversion Lab',
  displayName: 'Closer invite',
  previewData: {
    closerName: 'Jamie',
    email: 'jamie@example.com',
    password: 'ConversionLab1095!',
    loginUrl: 'https://conversionlab.space/auth',
  },
} satisfies TemplateEntry
