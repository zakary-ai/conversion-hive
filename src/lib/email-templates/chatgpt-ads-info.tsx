import React from 'react'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  setterName?: string
  bookingUrl?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const card = { backgroundColor: '#0a0a14', borderRadius: '16px', padding: '28px', color: '#ffffff' }
const heading = { color: '#ffffff', fontSize: '24px', margin: '0 0 8px', fontWeight: 600 }
const kicker = { color: '#818cf8', fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase' as const, margin: '0 0 10px', fontWeight: 600 }
const muted = { color: '#cbd5e1', fontSize: '14px', lineHeight: '23px', margin: '0 0 14px' }
const statRow = { color: '#ffffff', fontSize: '14px', lineHeight: '24px', margin: '2px 0' }
const sectionTitle = { color: '#ffffff', fontSize: '16px', fontWeight: 600, margin: '22px 0 8px' }
const bullet = { color: '#cbd5e1', fontSize: '14px', lineHeight: '22px', margin: '0 0 8px' }
const button = { backgroundColor: '#6366f1', color: '#ffffff', borderRadius: '10px', padding: '13px 22px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const divider = { borderColor: '#1e293b', margin: '22px 0' }
const bodyText = { color: '#334155', fontSize: '14px', lineHeight: '23px', margin: '0 0 12px' }
const footer = { color: '#64748b', fontSize: '12px', margin: '20px 0 0', textAlign: 'center' as const }

const Email = ({ name, setterName, bookingUrl }: Props) => {
  const link = bookingUrl || 'https://conversionlab.space'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Advertising inside ChatGPT — what it is and why the window is now</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={bodyText}>
            {name ? `Hi ${name},` : 'Hi there,'}
          </Text>
          <Text style={bodyText}>
            Here's a quick overview of what we talked about — advertising inside ChatGPT. When you're
            ready, you can grab a time for an intro call at the bottom.
          </Text>

          <Section style={card}>
            <Text style={kicker}>Open ROAS</Text>
            <Heading style={heading}>Advertising Inside ChatGPT</Heading>
            <Text style={muted}>
              The newest major ad channel just opened. Here's what it is — and why the window is now.
            </Text>

            <Text style={statRow}>~800M+ people use ChatGPT every week</Text>
            <Text style={statRow}>~20% of conversations carry shopping or buying intent</Text>
            <Text style={statRow}>7 markets: US, UK, Canada, Australia, NZ, Japan, S. Korea</Text>

            <Hr style={divider} />

            <Text style={sectionTitle}>What ChatGPT ads are</Text>
            <Text style={muted}>
              OpenAI now sells advertising placements inside ChatGPT. Ads appear as clearly labeled
              sponsored cards beneath ChatGPT's answers — they never interrupt the conversation.
              Instead of targeting demographics, the platform matches your ad to the context of the
              conversation itself: when someone asks ChatGPT about the exact problem you solve, your
              brand shows up at the moment of intent. Campaigns run through OpenAI's new self-serve
              Ads Manager, with pixel and Conversions-API measurement for purchases, leads and signups.
            </Text>

            <Text style={sectionTitle}>Why the timing matters</Text>
            <Text style={muted}>
              Every major ad platform — Google, Facebook, TikTok — had an early window where attention
              was cheap and competition was thin. ChatGPT is in that window right now. People
              increasingly research products by asking AI instead of searching, yet most brands haven't
              figured out how to show up there. Early advertisers reach high-intent audiences before
              the auction gets crowded, while building the account history and conversion data that
              compound as the platform scales.
            </Text>

            <Text style={sectionTitle}>What Open ROAS does</Text>
            <Text style={bullet}>• Campaign strategy &amp; launch — account setup, campaign structure and context targeting tuned to the conversations your buyers are actually having.</Text>
            <Text style={bullet}>• Creative built for AI answers — headlines, descriptions and imagery written for how ads render inside ChatGPT: conversational, not salesy.</Text>
            <Text style={bullet}>• Tracking &amp; attribution — pixel and Conversions-API setup plus our own attribution stack and dashboards, so every click and conversion is accounted for.</Text>
            <Text style={bullet}>• Landing-page readiness — we make sure your site is crawlable by OpenAI's bots and your pages convert the traffic the ads send.</Text>
            <Text style={bullet}>• Ongoing optimization &amp; reporting — continuous testing of bids, contexts and creative, with clear reporting on what your spend is producing.</Text>

            <Hr style={divider} />

            <Text style={sectionTitle}>See if ChatGPT ads fit your business</Text>
            <Text style={muted}>
              We'll walk you through the platform, what it looks like for your niche, and what a first
              campaign would involve. No pressure, no jargon.
            </Text>
            <Button href={link} style={button}>Book an intro call</Button>
          </Section>

          <Text style={bodyText}>
            Pick any time that works here: {link}
          </Text>
          <Text style={bodyText}>
            {setterName ? `— ${setterName}, Open ROAS` : '— The Open ROAS team'}
          </Text>
          <Text style={footer}>Open ROAS · Performance marketing for the OpenAI ads ecosystem</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Advertising inside ChatGPT — the overview I promised',
  displayName: 'ChatGPT ads info + booking link',
  previewData: {
    name: 'Jordan',
    setterName: 'Korin',
    bookingUrl: 'https://conversionlab.space/book/korin-h-8fd2',
  },
} satisfies TemplateEntry
