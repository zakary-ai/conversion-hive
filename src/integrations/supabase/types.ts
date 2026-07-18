export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          admin_notes: string | null
          booking_token: string
          created_at: string
          credit_score_range: Database["public"]["Enums"]["application_credit"]
          current_monthly_income: string
          desired_monthly_income: string
          dm_setter_id: string | null
          email: string | null
          full_name: string
          id: string
          open_to_invest:
            | Database["public"]["Enums"]["application_invest"]
            | null
          phone: string
          referred_by: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          why_remote_sales: string | null
        }
        Insert: {
          admin_notes?: string | null
          booking_token?: string
          created_at?: string
          credit_score_range: Database["public"]["Enums"]["application_credit"]
          current_monthly_income: string
          desired_monthly_income: string
          dm_setter_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          open_to_invest?:
            | Database["public"]["Enums"]["application_invest"]
            | null
          phone: string
          referred_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          why_remote_sales?: string | null
        }
        Update: {
          admin_notes?: string | null
          booking_token?: string
          created_at?: string
          credit_score_range?: Database["public"]["Enums"]["application_credit"]
          current_monthly_income?: string
          desired_monthly_income?: string
          dm_setter_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          open_to_invest?:
            | Database["public"]["Enums"]["application_invest"]
            | null
          phone?: string
          referred_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          why_remote_sales?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_dm_setter_id_fkey"
            columns: ["dm_setter_id"]
            isOneToOne: false
            referencedRelation: "dm_setters"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          assigned_closer_id: string | null
          b2b_closer_id: string | null
          commission_amount: number | null
          confirmation_token: string | null
          confirmed_at: string | null
          context: string | null
          created_at: string
          deal_amount: number | null
          email: string | null
          id: string
          lead_id: string | null
          lost_reason: string | null
          meeting_url: string | null
          name: string
          outcome: string | null
          outcome_set_at: string | null
          outcome_set_by: string | null
          phone: string | null
          scheduled_at: string
          status: string
          timezone: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_closer_id?: string | null
          b2b_closer_id?: string | null
          commission_amount?: number | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          context?: string | null
          created_at?: string
          deal_amount?: number | null
          email?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          meeting_url?: string | null
          name: string
          outcome?: string | null
          outcome_set_at?: string | null
          outcome_set_by?: string | null
          phone?: string | null
          scheduled_at: string
          status?: string
          timezone?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_closer_id?: string | null
          b2b_closer_id?: string | null
          commission_amount?: number | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          context?: string | null
          created_at?: string
          deal_amount?: number | null
          email?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          meeting_url?: string | null
          name?: string
          outcome?: string | null
          outcome_set_at?: string | null
          outcome_set_by?: string | null
          phone?: string | null
          scheduled_at?: string
          status?: string
          timezone?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_closer_id_fkey"
            columns: ["assigned_closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_b2b_closer_id_fkey"
            columns: ["b2b_closer_id"]
            isOneToOne: false
            referencedRelation: "b2b_closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          created_at: string
          day_of_week: number
          end_minute: number
          id: string
          start_minute: number
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: string
          start_minute: number
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: string
          start_minute?: number
        }
        Relationships: []
      }
      b2b_closer_availability_rules: {
        Row: {
          closer_id: string
          created_at: string
          day_of_week: number
          end_minute: number
          id: string
          start_minute: number
        }
        Insert: {
          closer_id: string
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: string
          start_minute: number
        }
        Update: {
          closer_id?: string
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: string
          start_minute?: number
        }
        Relationships: [
          {
            foreignKeyName: "b2b_closer_availability_rules_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "b2b_closers"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_closer_zoom_credentials: {
        Row: {
          closer_id: string
          updated_at: string
          zoom_account_id: string | null
          zoom_client_id: string | null
          zoom_client_secret: string | null
        }
        Insert: {
          closer_id: string
          updated_at?: string
          zoom_account_id?: string | null
          zoom_client_id?: string | null
          zoom_client_secret?: string | null
        }
        Update: {
          closer_id?: string
          updated_at?: string
          zoom_account_id?: string | null
          zoom_client_id?: string | null
          zoom_client_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_closer_zoom_credentials_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: true
            referencedRelation: "b2b_closers"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_closers: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      b2b_settings: {
        Row: {
          days_out: number
          id: number
          slot_minutes: number
          updated_at: string
        }
        Insert: {
          days_out?: number
          id?: number
          slot_minutes?: number
          updated_at?: string
        }
        Update: {
          days_out?: number
          id?: number
          slot_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      b2c_availability_rules: {
        Row: {
          created_at: string
          day_of_week: number
          end_minute: number
          id: string
          start_minute: number
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: string
          start_minute: number
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: string
          start_minute?: number
        }
        Relationships: []
      }
      b2c_settings: {
        Row: {
          days_out: number
          id: number
          slot_minutes: number
          updated_at: string
        }
        Insert: {
          days_out?: number
          id?: number
          slot_minutes?: number
          updated_at?: string
        }
        Update: {
          days_out?: number
          id?: number
          slot_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      call_logs: {
        Row: {
          counted_at: string | null
          created_at: string
          direction: string
          duration_sec: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          lead_id: string | null
          openphone_call_id: string | null
          recording_url: string | null
          started_at: string | null
          status: string | null
          summary: string | null
          to_number: string | null
          transcript: string | null
          transcript_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          counted_at?: string | null
          created_at?: string
          direction?: string
          duration_sec?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          openphone_call_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          summary?: string | null
          to_number?: string | null
          transcript?: string | null
          transcript_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          counted_at?: string | null
          created_at?: string
          direction?: string
          duration_sec?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          openphone_call_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          summary?: string | null
          to_number?: string | null
          transcript?: string | null
          transcript_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_availability_declarations: {
        Row: {
          closer_user_id: string
          created_at: string
          id: string
          line: string
          notes: string
          updated_at: string
          updated_by: string | null
          weekly: Json
        }
        Insert: {
          closer_user_id: string
          created_at?: string
          id?: string
          line: string
          notes?: string
          updated_at?: string
          updated_by?: string | null
          weekly?: Json
        }
        Update: {
          closer_user_id?: string
          created_at?: string
          id?: string
          line?: string
          notes?: string
          updated_at?: string
          updated_by?: string | null
          weekly?: Json
        }
        Relationships: []
      }
      closer_availability_rules: {
        Row: {
          closer_id: string
          created_at: string
          day_of_week: number
          end_minute: number
          id: string
          start_minute: number
          track: string
        }
        Insert: {
          closer_id: string
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: string
          start_minute: number
          track?: string
        }
        Update: {
          closer_id?: string
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: string
          start_minute?: number
          track?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_availability_rules_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_bookings: {
        Row: {
          applicant_email: string
          applicant_name: string
          applicant_phone: string | null
          application_id: string | null
          assigned_closer_id: string | null
          commission_amount: number | null
          commission_paid_at: string | null
          commission_payout_note: string | null
          commission_percent: number | null
          commission_status: string
          created_at: string
          deal_amount: number | null
          deposit_amount: number | null
          dm_setter_commission_amount: number | null
          dm_setter_commission_paid_at: string | null
          dm_setter_commission_status: string | null
          dm_setter_id: string | null
          dm_setter_manager_commission_amount: number | null
          dm_setter_manager_commission_paid_at: string | null
          dm_setter_manager_commission_status: string | null
          dm_setter_manager_id: string | null
          follow_up_amount: number | null
          follow_up_date: string | null
          google_calendar_event_id: string | null
          id: string
          notes: string | null
          outcome: string | null
          outcome_at: string | null
          outcome_notes: string | null
          previous_slot_start: string | null
          reminder_sent_at: string | null
          rescheduled_at: string | null
          slot_end: string
          slot_start: string
          status: string
          unbooked_at: string | null
          updated_at: string
          zoom_join_url: string | null
          zoom_meeting_id: string | null
        }
        Insert: {
          applicant_email: string
          applicant_name: string
          applicant_phone?: string | null
          application_id?: string | null
          assigned_closer_id?: string | null
          commission_amount?: number | null
          commission_paid_at?: string | null
          commission_payout_note?: string | null
          commission_percent?: number | null
          commission_status?: string
          created_at?: string
          deal_amount?: number | null
          deposit_amount?: number | null
          dm_setter_commission_amount?: number | null
          dm_setter_commission_paid_at?: string | null
          dm_setter_commission_status?: string | null
          dm_setter_id?: string | null
          dm_setter_manager_commission_amount?: number | null
          dm_setter_manager_commission_paid_at?: string | null
          dm_setter_manager_commission_status?: string | null
          dm_setter_manager_id?: string | null
          follow_up_amount?: number | null
          follow_up_date?: string | null
          google_calendar_event_id?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          outcome_at?: string | null
          outcome_notes?: string | null
          previous_slot_start?: string | null
          reminder_sent_at?: string | null
          rescheduled_at?: string | null
          slot_end: string
          slot_start: string
          status?: string
          unbooked_at?: string | null
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
        }
        Update: {
          applicant_email?: string
          applicant_name?: string
          applicant_phone?: string | null
          application_id?: string | null
          assigned_closer_id?: string | null
          commission_amount?: number | null
          commission_paid_at?: string | null
          commission_payout_note?: string | null
          commission_percent?: number | null
          commission_status?: string
          created_at?: string
          deal_amount?: number | null
          deposit_amount?: number | null
          dm_setter_commission_amount?: number | null
          dm_setter_commission_paid_at?: string | null
          dm_setter_commission_status?: string | null
          dm_setter_id?: string | null
          dm_setter_manager_commission_amount?: number | null
          dm_setter_manager_commission_paid_at?: string | null
          dm_setter_manager_commission_status?: string | null
          dm_setter_manager_id?: string | null
          follow_up_amount?: number | null
          follow_up_date?: string | null
          google_calendar_event_id?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          outcome_at?: string | null
          outcome_notes?: string | null
          previous_slot_start?: string | null
          reminder_sent_at?: string | null
          rescheduled_at?: string | null
          slot_end?: string
          slot_start?: string
          status?: string
          unbooked_at?: string | null
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closer_bookings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_bookings_assigned_closer_id_fkey"
            columns: ["assigned_closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_bookings_dm_setter_id_fkey"
            columns: ["dm_setter_id"]
            isOneToOne: false
            referencedRelation: "dm_setters"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_payouts: {
        Row: {
          amount: number
          closer_id: string
          created_at: string
          created_by: string | null
          id: string
          method: string
          note: string | null
          paid_at: string
        }
        Insert: {
          amount: number
          closer_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          method: string
          note?: string | null
          paid_at?: string
        }
        Update: {
          amount?: number
          closer_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_payouts_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_zoom_credentials: {
        Row: {
          closer_id: string
          updated_at: string
          zoom_account_id: string | null
          zoom_client_id: string | null
          zoom_client_secret: string | null
        }
        Insert: {
          closer_id: string
          updated_at?: string
          zoom_account_id?: string | null
          zoom_client_id?: string | null
          zoom_client_secret?: string | null
        }
        Update: {
          closer_id?: string
          updated_at?: string
          zoom_account_id?: string | null
          zoom_client_id?: string | null
          zoom_client_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closer_zoom_credentials_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: true
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
        ]
      }
      closers: {
        Row: {
          active: boolean
          b2b_active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          b2b_active?: boolean
          created_at?: string
          email: string
          full_name: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          b2b_active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      commissions: {
        Row: {
          added_by: string | null
          amount: number
          appointment_id: string | null
          approved_at: string | null
          approved_by: string | null
          commission_percent: number | null
          created_at: string
          deal_amount: number | null
          deal_name: string | null
          id: string
          note: string | null
          paid_at: string | null
          paid_by: string | null
          paid_method: string | null
          paid_note: string | null
          role: string | null
          status: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          amount: number
          appointment_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          commission_percent?: number | null
          created_at?: string
          deal_amount?: number | null
          deal_name?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_method?: string | null
          paid_note?: string | null
          role?: string | null
          status?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          amount?: number
          appointment_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          commission_percent?: number | null
          created_at?: string
          deal_amount?: number | null
          deal_name?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_method?: string | null
          paid_note?: string | null
          role?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_daily_logs: {
        Row: {
          ai_count: number
          created_at: string
          dm_setter_id: string
          id: string
          log_date: string
          manual_adjustment: number
          target: number
          total: number | null
          updated_at: string
        }
        Insert: {
          ai_count?: number
          created_at?: string
          dm_setter_id: string
          id?: string
          log_date: string
          manual_adjustment?: number
          target?: number
          total?: number | null
          updated_at?: string
        }
        Update: {
          ai_count?: number
          created_at?: string
          dm_setter_id?: string
          id?: string
          log_date?: string
          manual_adjustment?: number
          target?: number
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_daily_logs_dm_setter_id_fkey"
            columns: ["dm_setter_id"]
            isOneToOne: false
            referencedRelation: "dm_setters"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_log_uploads: {
        Row: {
          ai_count: number
          ai_raw: Json | null
          created_at: string
          dm_daily_log_id: string
          dm_setter_id: string
          id: string
          image_path: string
          platform: string
          status: string
        }
        Insert: {
          ai_count?: number
          ai_raw?: Json | null
          created_at?: string
          dm_daily_log_id: string
          dm_setter_id: string
          id?: string
          image_path: string
          platform: string
          status?: string
        }
        Update: {
          ai_count?: number
          ai_raw?: Json | null
          created_at?: string
          dm_daily_log_id?: string
          dm_setter_id?: string
          id?: string
          image_path?: string
          platform?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_log_uploads_dm_daily_log_id_fkey"
            columns: ["dm_daily_log_id"]
            isOneToOne: false
            referencedRelation: "dm_daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_log_uploads_dm_setter_id_fkey"
            columns: ["dm_setter_id"]
            isOneToOne: false
            referencedRelation: "dm_setters"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_recipients: {
        Row: {
          created_at: string
          dm_daily_log_id: string | null
          dm_setter_id: string
          id: string
          name_normalized: string
          name_original: string
          platform: string | null
        }
        Insert: {
          created_at?: string
          dm_daily_log_id?: string | null
          dm_setter_id: string
          id?: string
          name_normalized: string
          name_original: string
          platform?: string | null
        }
        Update: {
          created_at?: string
          dm_daily_log_id?: string | null
          dm_setter_id?: string
          id?: string
          name_normalized?: string
          name_original?: string
          platform?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dm_recipients_dm_daily_log_id_fkey"
            columns: ["dm_daily_log_id"]
            isOneToOne: false
            referencedRelation: "dm_daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_recipients_dm_setter_id_fkey"
            columns: ["dm_setter_id"]
            isOneToOne: false
            referencedRelation: "dm_setters"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_setters: {
        Row: {
          apply_slug: string | null
          commission_rate: number
          created_at: string
          daily_target: number
          email: string | null
          full_name: string | null
          id: string
          is_manager: boolean
          manager_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          apply_slug?: string | null
          commission_rate?: number
          created_at?: string
          daily_target?: number
          email?: string | null
          full_name?: string | null
          id?: string
          is_manager?: boolean
          manager_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          apply_slug?: string | null
          commission_rate?: number
          created_at?: string
          daily_target?: number
          email?: string | null
          full_name?: string | null
          id?: string
          is_manager?: boolean
          manager_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dm_setters_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "dm_setters"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_at: string | null
          assigned_user_id: string | null
          callback_at: string | null
          company: string | null
          contacted_at: string | null
          created_at: string
          dm_setter_id: string | null
          dm_setter_locked_at: string | null
          do_not_contact: boolean
          email: string | null
          id: string
          last_status_change_at: string
          name: string
          notes: string | null
          phone: string | null
          place_id: string | null
          retired: boolean
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
        }
        Insert: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          callback_at?: string | null
          company?: string | null
          contacted_at?: string | null
          created_at?: string
          dm_setter_id?: string | null
          dm_setter_locked_at?: string | null
          do_not_contact?: boolean
          email?: string | null
          id?: string
          last_status_change_at?: string
          name: string
          notes?: string | null
          phone?: string | null
          place_id?: string | null
          retired?: boolean
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
        }
        Update: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          callback_at?: string | null
          company?: string | null
          contacted_at?: string | null
          created_at?: string
          dm_setter_id?: string | null
          dm_setter_locked_at?: string | null
          do_not_contact?: boolean
          email?: string | null
          id?: string
          last_status_change_at?: string
          name?: string
          notes?: string | null
          phone?: string | null
          place_id?: string | null
          retired?: boolean
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
        }
        Relationships: [
          {
            foreignKeyName: "leads_dm_setter_id_fkey"
            columns: ["dm_setter_id"]
            isOneToOne: false
            referencedRelation: "dm_setters"
            referencedColumns: ["id"]
          },
        ]
      }
      module_completions: {
        Row: {
          completed_at: string
          id: string
          module_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          module_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          module_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_completions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      module_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          module_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          module_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          module_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_notes_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          order_index: number
          title: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          order_index?: number
          title: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          order_index?: number
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      openphone_number_pool: {
        Row: {
          assigned_at: string | null
          assigned_user_id: string | null
          created_at: string
          id: string
          note: string | null
          openphone_number_id: string
          phone_e164: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          openphone_number_id: string
          phone_e164: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          openphone_number_id?: string
          phone_e164?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          daily_lead_quota: number
          email: string | null
          full_name: string | null
          id: string
          must_change_password: boolean
          openphone_number_e164: string | null
          openphone_number_id: string | null
          openphone_user_id: string | null
          personal_phone_e164: string | null
          scraper_enabled: boolean
          timezone: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          daily_lead_quota?: number
          email?: string | null
          full_name?: string | null
          id?: string
          must_change_password?: boolean
          openphone_number_e164?: string | null
          openphone_number_id?: string | null
          openphone_user_id?: string | null
          personal_phone_e164?: string | null
          scraper_enabled?: boolean
          timezone?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          daily_lead_quota?: number
          email?: string | null
          full_name?: string | null
          id?: string
          must_change_password?: boolean
          openphone_number_e164?: string | null
          openphone_number_id?: string | null
          openphone_user_id?: string | null
          personal_phone_e164?: string | null
          scraper_enabled?: boolean
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          answers: Json
          completed_at: string
          id: string
          module_id: string
          score: number
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string
          id?: string
          module_id: string
          score: number
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string
          id?: string
          module_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: number
          created_at: string
          id: string
          module_id: string
          options: Json
          question_text: string
        }
        Insert: {
          correct_answer: number
          created_at?: string
          id?: string
          module_id: string
          options?: Json
          question_text: string
        }
        Update: {
          correct_answer?: number
          created_at?: string
          id?: string
          module_id?: string
          options?: Json
          question_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_runs: {
        Row: {
          details: Json | null
          id: string
          leads_added: number
          phase: string | null
          ran_at: string
          status: string
          user_id: string
        }
        Insert: {
          details?: Json | null
          id?: string
          leads_added?: number
          phase?: string | null
          ran_at?: string
          status?: string
          user_id: string
        }
        Update: {
          details?: Json | null
          id?: string
          leads_added?: number
          phase?: string | null
          ran_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      scraper_settings: {
        Row: {
          apify_actor_id: string
          apify_input: Json
          batch_size: number
          city_rotation: string[]
          city_rotation_index: number
          enabled: boolean
          field_map: Json
          id: string
          recycle_days: number
          updated_at: string
        }
        Insert: {
          apify_actor_id?: string
          apify_input?: Json
          batch_size?: number
          city_rotation?: string[]
          city_rotation_index?: number
          enabled?: boolean
          field_map?: Json
          id?: string
          recycle_days?: number
          updated_at?: string
        }
        Update: {
          apify_actor_id?: string
          apify_input?: Json
          batch_size?: number
          city_rotation?: string[]
          city_rotation_index?: number
          enabled?: boolean
          field_map?: Json
          id?: string
          recycle_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          filename: string
          id: string
          message_id: string
          size_bytes: number
          storage_path: string
          ticket_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          filename: string
          id?: string
          message_id: string
          size_bytes: number
          storage_path: string
          ticket_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          filename?: string
          id?: string
          message_id?: string
          size_bytes?: number
          storage_path?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_admin: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_admin?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          id: string
          last_message_at: string
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          id?: string
          last_message_at?: string
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          id?: string
          last_message_at?: string
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_dm_setter_id_for_user: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "client"
        | "closer"
        | "dm_setter"
        | "dm_setter_manager"
      application_credit:
        | "Below 600"
        | "600-650"
        | "650-700"
        | "700-750"
        | "750-800"
        | "800-850"
      application_invest: "Yes" | "No" | "Maybe"
      application_status:
        | "New"
        | "No Answer"
        | "Follow Up"
        | "Booked"
        | "Not Interested"
      lead_status:
        | "New"
        | "Contacted"
        | "No Answer"
        | "Interested"
        | "Booked"
        | "Not Interested"
        | "Follow Up"
        | "Call Again"
        | "Call Back"
        | "Closed"
        | "Lost"
        | "No Show"
        | "Disqualified"
      support_ticket_category: "feedback" | "suggestion" | "issue" | "other"
      support_ticket_status: "open" | "awaiting_user" | "resolved"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "client", "closer", "dm_setter", "dm_setter_manager"],
      application_credit: [
        "Below 600",
        "600-650",
        "650-700",
        "700-750",
        "750-800",
        "800-850",
      ],
      application_invest: ["Yes", "No", "Maybe"],
      application_status: [
        "New",
        "No Answer",
        "Follow Up",
        "Booked",
        "Not Interested",
      ],
      lead_status: [
        "New",
        "Contacted",
        "No Answer",
        "Interested",
        "Booked",
        "Not Interested",
        "Follow Up",
        "Call Again",
        "Call Back",
        "Closed",
        "Lost",
        "No Show",
        "Disqualified",
      ],
      support_ticket_category: ["feedback", "suggestion", "issue", "other"],
      support_ticket_status: ["open", "awaiting_user", "resolved"],
    },
  },
} as const
