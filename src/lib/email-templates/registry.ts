import type { ComponentType } from 'react'
import { template as closerCallProspect } from './closer-call-prospect'
import { template as closerCallProspectReminder } from './closer-call-prospect-reminder'
import { template as closerCallCloser } from './closer-call-closer'
import { template as closerInvite } from './closer-invite'
import { template as setterInvite } from './setter-invite'
import { template as adminInvite } from './admin-invite'
import { template as bookingConfirmation } from './booking-confirmation'
import { template as bookingReceived } from './booking-received'
import { template as bookingRescheduled } from './booking-rescheduled'
import { template as bookingUnbooked } from './booking-unbooked'
import { template as bookingDeclined } from './booking-declined'



export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'closer-call-prospect': closerCallProspect,
  'closer-call-prospect-reminder': closerCallProspectReminder,
  'closer-call-closer': closerCallCloser,
  'closer-invite': closerInvite,
  'setter-invite': setterInvite,
  'admin-invite': adminInvite,
  'booking-confirmation': bookingConfirmation,
  'booking-received': bookingReceived,
  'booking-rescheduled': bookingRescheduled,
  'booking-unbooked': bookingUnbooked,
  'booking-declined': bookingDeclined,
}
