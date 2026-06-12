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
      applications: {
        Row: {
          admin_notes: string | null
          created_at: string
          credit_score_range: Database["public"]["Enums"]["application_credit"]
          current_monthly_income: string
          desired_monthly_income: string
          full_name: string
          id: string
          open_to_invest: Database["public"]["Enums"]["application_invest"]
          phone: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          why_remote_sales: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          credit_score_range: Database["public"]["Enums"]["application_credit"]
          current_monthly_income: string
          desired_monthly_income: string
          full_name: string
          id?: string
          open_to_invest: Database["public"]["Enums"]["application_invest"]
          phone: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          why_remote_sales: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          credit_score_range?: Database["public"]["Enums"]["application_credit"]
          current_monthly_income?: string
          desired_monthly_income?: string
          full_name?: string
          id?: string
          open_to_invest?: Database["public"]["Enums"]["application_invest"]
          phone?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          why_remote_sales?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          commission_amount: number | null
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
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commission_amount?: number | null
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
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commission_amount?: number | null
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
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
      booking_settings: {
        Row: {
          id: number
          slot_minutes: number
          updated_at: string
        }
        Insert: {
          id?: number
          slot_minutes?: number
          updated_at?: string
        }
        Update: {
          id?: number
          slot_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      call_logs: {
        Row: {
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
          to_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
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
          to_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
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
          to_number?: string | null
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
      commissions: {
        Row: {
          added_by: string | null
          amount: number
          appointment_id: string | null
          created_at: string
          id: string
          note: string | null
          paid_at: string | null
          paid_by: string | null
          paid_method: string | null
          user_id: string
        }
        Insert: {
          added_by?: string | null
          amount: number
          appointment_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_method?: string | null
          user_id: string
        }
        Update: {
          added_by?: string | null
          amount?: number
          appointment_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_method?: string | null
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
      leads: {
        Row: {
          assigned_user_id: string | null
          callback_at: string | null
          company: string | null
          contacted_at: string | null
          created_at: string
          do_not_contact: boolean
          email: string | null
          id: string
          last_status_change_at: string
          name: string
          notes: string | null
          phone: string | null
          retired: boolean
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
        }
        Insert: {
          assigned_user_id?: string | null
          callback_at?: string | null
          company?: string | null
          contacted_at?: string | null
          created_at?: string
          do_not_contact?: boolean
          email?: string | null
          id?: string
          last_status_change_at?: string
          name: string
          notes?: string | null
          phone?: string | null
          retired?: boolean
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
        }
        Update: {
          assigned_user_id?: string | null
          callback_at?: string | null
          company?: string | null
          contacted_at?: string | null
          created_at?: string
          do_not_contact?: boolean
          email?: string | null
          id?: string
          last_status_change_at?: string
          name?: string
          notes?: string | null
          phone?: string | null
          retired?: boolean
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
        }
        Relationships: []
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client"
      application_credit:
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
      app_role: ["admin", "client"],
      application_credit: [
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
      ],
    },
  },
} as const
