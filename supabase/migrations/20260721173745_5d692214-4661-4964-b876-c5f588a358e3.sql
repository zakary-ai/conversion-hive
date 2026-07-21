
-- 1. Extend role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'setter';

-- 2. Outbound enums
CREATE TYPE public.ob_email_status AS ENUM ('unverified','valid','invalid','catch_all','unknown','role_based');
CREATE TYPE public.ob_lead_status AS ENUM ('new','queued','in_sequence','replied','positive','meeting_booked','discovery_scheduled','not_interested','unsubscribed','disqualified','closed');
CREATE TYPE public.ob_campaign_channel AS ENUM ('email','linkedin','call');
CREATE TYPE public.ob_campaign_status AS ENUM ('active','paused','completed');
CREATE TYPE public.ob_membership_status AS ENUM ('pending','active','paused','stopped','finished');
CREATE TYPE public.ob_conversation_category AS ENUM ('uncategorized','positive','question','objection','info_requested','out_of_office','not_interested','wrong_person','unsubscribe','meeting_booked');
CREATE TYPE public.ob_message_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.ob_activity_type AS ENUM ('email_sent','email_reply','call_attempt','call_connected','linkedin_connect_sent','linkedin_connect_accepted','linkedin_message','note','status_change');
CREATE TYPE public.ob_call_outcome AS ENUM ('no_answer','voicemail','connected','booked','bad_number','callback_scheduled');
CREATE TYPE public.ob_linkedin_task_type AS ENUM ('send_connection','review_accepted','send_first_message','follow_up','book_call');
CREATE TYPE public.ob_linkedin_task_status AS ENUM ('pending','done','skipped');
CREATE TYPE public.ob_appointment_status AS ENUM ('scheduled','attended','no_show','rescheduled','cancelled');
CREATE TYPE public.ob_suppression_reason AS ENUM ('unsubscribed','complained','bounced','customer','do_not_contact','manual');

-- 3. Companies
CREATE TABLE public.ob_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text,
  domain text UNIQUE,
  website text,
  phone text,
  address text,
  city text,
  state text,
  google_rating numeric,
  google_review_count integer,
  google_maps_url text,
  niche text,
  source text,
  selection_reason text,
  owner_setter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_companies TO authenticated;
GRANT ALL ON public.ob_companies TO service_role;
ALTER TABLE public.ob_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_companies owner rw" ON public.ob_companies FOR ALL TO authenticated
  USING (owner_setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 4. Leads
CREATE TABLE public.ob_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.ob_companies(id) ON DELETE SET NULL,
  first_name text,
  last_name text,
  title text,
  email text,
  email_status public.ob_email_status NOT NULL DEFAULT 'unverified',
  phone text,
  linkedin_url text,
  status public.ob_lead_status NOT NULL DEFAULT 'new',
  owner_setter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_score integer DEFAULT 0,
  selection_reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ob_leads_owner_idx ON public.ob_leads(owner_setter_id);
CREATE INDEX ob_leads_status_idx ON public.ob_leads(status);
CREATE INDEX ob_leads_company_idx ON public.ob_leads(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_leads TO authenticated;
GRANT ALL ON public.ob_leads TO service_role;
ALTER TABLE public.ob_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_leads owner rw" ON public.ob_leads FOR ALL TO authenticated
  USING (owner_setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ob_leads_updated_at BEFORE UPDATE ON public.ob_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Campaigns
CREATE TABLE public.ob_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel public.ob_campaign_channel NOT NULL DEFAULT 'email',
  setter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  smartlead_campaign_id text,
  status public.ob_campaign_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_campaigns TO authenticated;
GRANT ALL ON public.ob_campaigns TO service_role;
ALTER TABLE public.ob_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_campaigns owner rw" ON public.ob_campaigns FOR ALL TO authenticated
  USING (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ob_campaigns_updated_at BEFORE UPDATE ON public.ob_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Campaign memberships
CREATE TABLE public.ob_campaign_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.ob_leads(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.ob_campaigns(id) ON DELETE CASCADE,
  smartlead_lead_id text,
  status public.ob_membership_status NOT NULL DEFAULT 'pending',
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_campaign_memberships TO authenticated;
GRANT ALL ON public.ob_campaign_memberships TO service_role;
ALTER TABLE public.ob_campaign_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_campaign_memberships via lead" ON public.ob_campaign_memberships FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.ob_leads l WHERE l.id = lead_id AND l.owner_setter_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.ob_leads l WHERE l.id = lead_id AND l.owner_setter_id = auth.uid())
  );

-- 7. Conversations
CREATE TABLE public.ob_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.ob_leads(id) ON DELETE CASCADE,
  channel public.ob_campaign_channel NOT NULL DEFAULT 'email',
  smartlead_thread_identifier text,
  category public.ob_conversation_category NOT NULL DEFAULT 'uncategorized',
  needs_response boolean NOT NULL DEFAULT false,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ob_conversations_lead_idx ON public.ob_conversations(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_conversations TO authenticated;
GRANT ALL ON public.ob_conversations TO service_role;
ALTER TABLE public.ob_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_conversations via lead" ON public.ob_conversations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.ob_leads l WHERE l.id = lead_id AND l.owner_setter_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.ob_leads l WHERE l.id = lead_id AND l.owner_setter_id = auth.uid())
  );

-- 8. Messages
CREATE TABLE public.ob_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ob_conversations(id) ON DELETE CASCADE,
  direction public.ob_message_direction NOT NULL,
  from_email text,
  to_email text,
  subject text,
  body_html text,
  body_text text,
  sent_at timestamptz,
  smartlead_message_id text,
  smartlead_stats_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ob_messages_conversation_idx ON public.ob_messages(conversation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_messages TO authenticated;
GRANT ALL ON public.ob_messages TO service_role;
ALTER TABLE public.ob_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_messages via conversation" ON public.ob_messages FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.ob_conversations c
      JOIN public.ob_leads l ON l.id = c.lead_id
      WHERE c.id = conversation_id AND l.owner_setter_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.ob_conversations c
      JOIN public.ob_leads l ON l.id = c.lead_id
      WHERE c.id = conversation_id AND l.owner_setter_id = auth.uid()
    )
  );

-- 9. Outreach activities
CREATE TABLE public.ob_outreach_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.ob_leads(id) ON DELETE CASCADE,
  setter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type public.ob_activity_type NOT NULL,
  detail text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ob_outreach_lead_idx ON public.ob_outreach_activities(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_outreach_activities TO authenticated;
GRANT ALL ON public.ob_outreach_activities TO service_role;
ALTER TABLE public.ob_outreach_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_outreach owner rw" ON public.ob_outreach_activities FOR ALL TO authenticated
  USING (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 10. Call attempts
CREATE TABLE public.ob_call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.ob_leads(id) ON DELETE CASCADE,
  setter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome public.ob_call_outcome NOT NULL,
  notes text,
  callback_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ob_call_attempts_lead_idx ON public.ob_call_attempts(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_call_attempts TO authenticated;
GRANT ALL ON public.ob_call_attempts TO service_role;
ALTER TABLE public.ob_call_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_call_attempts owner rw" ON public.ob_call_attempts FOR ALL TO authenticated
  USING (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 11. LinkedIn tasks
CREATE TABLE public.ob_linkedin_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.ob_leads(id) ON DELETE CASCADE,
  setter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  task_type public.ob_linkedin_task_type NOT NULL,
  suggested_message text,
  status public.ob_linkedin_task_status NOT NULL DEFAULT 'pending',
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ob_linkedin_tasks_lead_idx ON public.ob_linkedin_tasks(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_linkedin_tasks TO authenticated;
GRANT ALL ON public.ob_linkedin_tasks TO service_role;
ALTER TABLE public.ob_linkedin_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_linkedin_tasks owner rw" ON public.ob_linkedin_tasks FOR ALL TO authenticated
  USING (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 12. Appointments
CREATE TABLE public.ob_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.ob_leads(id) ON DELETE CASCADE,
  setter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  status public.ob_appointment_status NOT NULL DEFAULT 'scheduled',
  outcome_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ob_appointments_lead_idx ON public.ob_appointments(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_appointments TO authenticated;
GRANT ALL ON public.ob_appointments TO service_role;
ALTER TABLE public.ob_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_appointments owner rw" ON public.ob_appointments FOR ALL TO authenticated
  USING (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (setter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 13. Suppression list (admin only)
CREATE TABLE public.ob_suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  domain text,
  linkedin_url text,
  reason public.ob_suppression_reason NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ob_suppression_email_idx ON public.ob_suppression_list(email);
CREATE INDEX ob_suppression_domain_idx ON public.ob_suppression_list(domain);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ob_suppression_list TO authenticated;
GRANT ALL ON public.ob_suppression_list TO service_role;
ALTER TABLE public.ob_suppression_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_suppression admin only" ON public.ob_suppression_list FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 14. Webhook events (admin only)
CREATE TABLE public.ob_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'smartlead',
  event_type text,
  external_event_id text,
  payload jsonb,
  processed boolean NOT NULL DEFAULT false,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ob_webhook_events_ext_idx
  ON public.ob_webhook_events(source, external_event_id)
  WHERE external_event_id IS NOT NULL;
GRANT SELECT ON public.ob_webhook_events TO authenticated;
GRANT ALL ON public.ob_webhook_events TO service_role;
ALTER TABLE public.ob_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ob_webhook_events admin read" ON public.ob_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 15. Timeline view
CREATE OR REPLACE VIEW public.ob_lead_timeline AS
  SELECT m.id AS ref_id, c.lead_id AS lead_id, COALESCE(m.sent_at, m.created_at) AS ts, 'message'::text AS kind,
         jsonb_build_object('direction', m.direction, 'subject', m.subject, 'from_email', m.from_email, 'to_email', m.to_email) AS meta
    FROM public.ob_messages m JOIN public.ob_conversations c ON c.id = m.conversation_id
  UNION ALL
  SELECT o.id, o.lead_id, o.occurred_at, 'activity', jsonb_build_object('type', o.type, 'detail', o.detail)
    FROM public.ob_outreach_activities o
  UNION ALL
  SELECT ca.id, ca.lead_id, ca.created_at, 'call', jsonb_build_object('outcome', ca.outcome, 'notes', ca.notes, 'callback_at', ca.callback_at)
    FROM public.ob_call_attempts ca
  UNION ALL
  SELECT lt.id, lt.lead_id, COALESCE(lt.completed_at, lt.due_date, lt.created_at), 'linkedin',
         jsonb_build_object('task_type', lt.task_type, 'status', lt.status, 'suggested_message', lt.suggested_message)
    FROM public.ob_linkedin_tasks lt
  UNION ALL
  SELECT a.id, a.lead_id, a.scheduled_at, 'appointment', jsonb_build_object('status', a.status, 'outcome_notes', a.outcome_notes)
    FROM public.ob_appointments a;

GRANT SELECT ON public.ob_lead_timeline TO authenticated;
GRANT SELECT ON public.ob_lead_timeline TO service_role;
