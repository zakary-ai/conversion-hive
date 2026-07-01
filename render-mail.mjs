import { render } from '@react-email/components'
import React from 'react'
import { BookingReceivedEmail } from '/dev-server/src/lib/email-templates/booking-received.tsx'
import { BookingConfirmationEmail } from '/dev-server/src/lib/email-templates/booking-confirmation.tsx'

const scheduledLabel = 'Tuesday, July 7, 2026 at 2:00 PM EDT'

const receivedProps = { name: 'Zakary', scheduledLabel, durationMinutes: 30 }
const confirmProps = {
  name: 'Zakary',
  scheduledLabel,
  meetingUrl: 'https://zoom.us/j/9999999999',
  durationMinutes: 30,
  confirmUrl: 'https://conversionlab.space/confirm-booking?token=TEST-TOKEN-DEMO',
  loomUrl: 'https://www.loom.com/share/ad9a5d9b3d13417ea1f05e22dcc52799',
}

const out = {
  received: {
    html: await render(React.createElement(BookingReceivedEmail, receivedProps)),
    text: await render(React.createElement(BookingReceivedEmail, receivedProps), { plainText: true }),
  },
  confirmation: {
    html: await render(React.createElement(BookingConfirmationEmail, confirmProps)),
    text: await render(React.createElement(BookingConfirmationEmail, confirmProps), { plainText: true }),
  },
}
import fs from 'fs'
fs.writeFileSync('/tmp/mail/out.json', JSON.stringify(out))
console.log('ok', Object.keys(out))
