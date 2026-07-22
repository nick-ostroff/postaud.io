export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// =========================================================
// Enum unions
// =========================================================
export type OrgPlan = "free" | "starter" | "growth" | "scale"
export type OrgStatus = "active" | "suspended"
export type MemberRole = "admin" | "interviewer" | "viewer"
export type SeriesStatus = "active" | "paused" | "archived"
export type SubjectKind = "member" | "self" | "person" | "organization"
export type SeriesTone = "warm" | "neutral" | "playful"
export type SeriesDepth = "single" | "light" | "balanced" | "deep"
export type ConversationMode = "deep" | "flow" | "quickfire"
export type QueuedQuestionSource = "flow" | "member"
export type QueuedQuestionStatus = "pending" | "asked" | "removed"
export type InterviewStatus = "in_progress" | "completed" | "processed" | "abandoned"
export type MessageRole = "interviewer" | "subject"
export type FactStatus = "active" | "needs_review" | "superseded" | "retell_queued"
export type EntityKind = "person" | "place" | "org" | "event" | "date"

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          plan: OrgPlan
          status: OrgStatus
          credits_remaining: number
          stripe_customer_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          plan?: OrgPlan
          status?: OrgStatus
          credits_remaining?: number
          stripe_customer_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          plan?: OrgPlan
          status?: OrgStatus
          credits_remaining?: number
          stripe_customer_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          email: string
          display_name: string | null
          avatar_path: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          avatar_path?: string | null
          created_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          user_id: string
          organization_id: string
          role: MemberRole
          created_at: string
          accepted_at: string | null
        }
        Insert: {
          user_id: string
          organization_id: string
          role?: MemberRole
          created_at?: string
          accepted_at?: string | null
        }
        Update: {
          user_id?: string
          organization_id?: string
          role?: MemberRole
          created_at?: string
          accepted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          id: number
          organization_id: string | null
          actor_user_id: string | null
          actor_email: string | null
          action: string
          target_type: string | null
          target_id: string | null
          ip: unknown
          at: string
          meta: Json | null
        }
        Insert: {
          id?: number
          organization_id?: string | null
          actor_user_id?: string | null
          actor_email?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          ip?: unknown
          at?: string
          meta?: Json | null
        }
        Update: {
          id?: number
          organization_id?: string | null
          actor_user_id?: string | null
          actor_email?: string | null
          action?: string
          target_type?: string | null
          target_id?: string | null
          ip?: unknown
          at?: string
          meta?: Json | null
        }
        Relationships: []
      }
      series: {
        Row: {
          id: string
          organization_id: string
          title: string
          subject_kind: SubjectKind
          subject_user_id: string | null
          subject_name: string
          subject_relationship: string | null
          goal: string
          opening_prompt: string | null
          dont_bring_up: Json
          tone: SeriesTone
          total_minutes: number | null
          voice: string
          interviewer_name: string
          depth: SeriesDepth
          conversation_mode: ConversationMode
          quickfire_queue_only: boolean
          planned_sessions: number | null
          photo_path: string | null
          status: SeriesStatus
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          title: string
          subject_kind?: SubjectKind
          subject_user_id?: string | null
          subject_name: string
          subject_relationship?: string | null
          goal: string
          opening_prompt?: string | null
          dont_bring_up?: Json
          tone?: SeriesTone
          total_minutes?: number | null
          voice?: string
          interviewer_name?: string
          depth?: SeriesDepth
          conversation_mode?: ConversationMode
          quickfire_queue_only?: boolean
          planned_sessions?: number | null
          photo_path?: string | null
          status?: SeriesStatus
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          title?: string
          subject_kind?: SubjectKind
          subject_user_id?: string | null
          subject_name?: string
          subject_relationship?: string | null
          goal?: string
          opening_prompt?: string | null
          dont_bring_up?: Json
          tone?: SeriesTone
          total_minutes?: number | null
          voice?: string
          interviewer_name?: string
          depth?: SeriesDepth
          conversation_mode?: ConversationMode
          quickfire_queue_only?: boolean
          planned_sessions?: number | null
          photo_path?: string | null
          status?: SeriesStatus
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      series_access: {
        Row: {
          series_id: string
          user_id: string
          can_view: boolean
          can_interview: boolean
        }
        Insert: {
          series_id: string
          user_id: string
          can_view?: boolean
          can_interview?: boolean
        }
        Update: {
          series_id?: string
          user_id?: string
          can_view?: boolean
          can_interview?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "series_access_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          id: string
          series_id: string
          organization_id: string
          status: InterviewStatus
          conducted_by: string | null
          hand_the_mic: boolean
          mode: ConversationMode | null
          started_at: string
          ended_at: string | null
          duration_sec: number | null
          audio_path: string | null
          credit_charged: boolean
          process_error: string | null
          process_attempts: number
        }
        Insert: {
          id?: string
          series_id: string
          organization_id: string
          status?: InterviewStatus
          conducted_by?: string | null
          hand_the_mic?: boolean
          mode?: ConversationMode | null
          started_at?: string
          ended_at?: string | null
          duration_sec?: number | null
          audio_path?: string | null
          credit_charged?: boolean
          process_error?: string | null
          process_attempts?: number
        }
        Update: {
          id?: string
          series_id?: string
          organization_id?: string
          status?: InterviewStatus
          conducted_by?: string | null
          hand_the_mic?: boolean
          mode?: ConversationMode | null
          started_at?: string
          ended_at?: string | null
          duration_sec?: number | null
          audio_path?: string | null
          credit_charged?: boolean
          process_error?: string | null
          process_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "interviews_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_conducted_by_fkey"
            columns: ["conducted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_messages: {
        Row: {
          id: string
          interview_id: string
          role: MessageRole
          text: string
          t_offset_sec: number | null
          seq: number
          created_at: string
        }
        Insert: {
          id?: string
          interview_id: string
          role: MessageRole
          text: string
          t_offset_sec?: number | null
          seq: number
          created_at?: string
        }
        Update: {
          id?: string
          interview_id?: string
          role?: MessageRole
          text?: string
          t_offset_sec?: number | null
          seq?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          id: string
          series_id: string
          name: string
          description: string | null
          coverage_score: number
          must_cover: boolean
          suggested: boolean
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          series_id: string
          name: string
          description?: string | null
          coverage_score?: number
          must_cover?: boolean
          suggested?: boolean
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          series_id?: string
          name?: string
          description?: string | null
          coverage_score?: number
          must_cover?: boolean
          suggested?: boolean
          position?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      queued_questions: {
        Row: {
          id: string
          series_id: string
          text: string
          source: QueuedQuestionSource
          created_by: string | null
          source_interview_id: string | null
          position: number
          status: QueuedQuestionStatus
          asked_in_interview_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          series_id: string
          text: string
          source: QueuedQuestionSource
          created_by?: string | null
          source_interview_id?: string | null
          position?: number
          status?: QueuedQuestionStatus
          asked_in_interview_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          series_id?: string
          text?: string
          source?: QueuedQuestionSource
          created_by?: string | null
          source_interview_id?: string | null
          position?: number
          status?: QueuedQuestionStatus
          asked_in_interview_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      facts: {
        Row: {
          id: string
          series_id: string
          topic_id: string | null
          source_interview_id: string | null
          source_message_id: string | null
          audio_offset_sec: number | null
          statement: string
          confidence: number
          status: FactStatus
          superseded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          series_id: string
          topic_id?: string | null
          source_interview_id?: string | null
          source_message_id?: string | null
          audio_offset_sec?: number | null
          statement: string
          confidence?: number
          status?: FactStatus
          superseded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          series_id?: string
          topic_id?: string | null
          source_interview_id?: string | null
          source_message_id?: string | null
          audio_offset_sec?: number | null
          statement?: string
          confidence?: number
          status?: FactStatus
          superseded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facts_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_source_interview_id_fkey"
            columns: ["source_interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "interview_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "facts"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          id: string
          series_id: string
          kind: EntityKind
          name: string
          detail: string | null
        }
        Insert: {
          id?: string
          series_id: string
          kind: EntityKind
          name: string
          detail?: string | null
        }
        Update: {
          id?: string
          series_id?: string
          kind?: EntityKind
          name?: string
          detail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_entities: {
        Row: {
          fact_id: string
          entity_id: string
        }
        Insert: {
          fact_id: string
          entity_id: string
        }
        Update: {
          fact_id?: string
          entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_entities_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_summaries: {
        Row: {
          interview_id: string
          short: string
          long: string | null
          bullets: Json
          model: string | null
          created_at: string
        }
        Insert: {
          interview_id: string
          short: string
          long?: string | null
          bullets?: Json
          model?: string | null
          created_at?: string
        }
        Update: {
          interview_id?: string
          short?: string
          long?: string | null
          bullets?: Json
          model?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_summaries_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: true
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_usage: {
        Row: {
          id: string
          interview_id: string
          organization_id: string
          provider: string
          phase: string
          model: string
          input_tokens: number
          output_tokens: number
          total_tokens: number
          audio_input_tokens: number | null
          text_input_tokens: number | null
          cached_input_tokens: number | null
          audio_output_tokens: number | null
          text_output_tokens: number | null
          cache_read_input_tokens: number | null
          cache_creation_input_tokens: number | null
          raw: Json
          created_at: string
        }
        Insert: {
          id?: string
          interview_id: string
          organization_id: string
          provider: string
          phase: string
          model: string
          input_tokens?: number
          output_tokens?: number
          total_tokens?: number
          audio_input_tokens?: number | null
          text_input_tokens?: number | null
          cached_input_tokens?: number | null
          audio_output_tokens?: number | null
          text_output_tokens?: number | null
          cache_read_input_tokens?: number | null
          cache_creation_input_tokens?: number | null
          raw?: Json
          created_at?: string
        }
        Update: {
          id?: string
          interview_id?: string
          organization_id?: string
          provider?: string
          phase?: string
          model?: string
          input_tokens?: number
          output_tokens?: number
          total_tokens?: number
          audio_input_tokens?: number | null
          text_input_tokens?: number | null
          cached_input_tokens?: number | null
          audio_output_tokens?: number | null
          text_output_tokens?: number | null
          cache_read_input_tokens?: number | null
          cache_creation_input_tokens?: number | null
          raw?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_usage_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          id: string
          email: string
          source: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          source?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          source?: string | null
          created_at?: string
        }
        Relationships: []
      }
      api_tokens: {
        Row: {
          id: string
          user_id: string
          token_hash: string
          name: string
          last_used_at: string | null
          created_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          token_hash: string
          name: string
          last_used_at?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          token_hash?: string
          name?: string
          last_used_at?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      series_vault_links: {
        Row: {
          series_id: string
          user_id: string
          label: string
          linked_at: string
          push_requested_at: string | null
          last_acked_at: string | null
        }
        Insert: {
          series_id: string
          user_id: string
          label: string
          linked_at?: string
          push_requested_at?: string | null
          last_acked_at?: string | null
        }
        Update: {
          series_id?: string
          user_id?: string
          label?: string
          linked_at?: string
          push_requested_at?: string | null
          last_acked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "series_vault_links_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_vault_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: never; Returns: string }
      is_org_admin: { Args: never; Returns: boolean }
      can_view_series: { Args: { s_id: string }; Returns: boolean }
      can_interview_series: { Args: { s_id: string }; Returns: boolean }
    }
    Enums: {
      org_plan: "free" | "starter" | "growth" | "scale"
      org_status: "active" | "suspended"
      member_role: "admin" | "interviewer" | "viewer"
      series_status: "active" | "paused" | "archived"
      subject_kind: "member" | "self" | "person" | "organization"
      series_tone: "warm" | "neutral" | "playful"
      series_depth: "single" | "light" | "balanced" | "deep"
      conversation_mode: "deep" | "flow" | "quickfire"
      interview_status: "in_progress" | "completed" | "processed" | "abandoned"
      message_role: "interviewer" | "subject"
      fact_status: "active" | "needs_review" | "superseded" | "retell_queued"
      entity_kind: "person" | "place" | "org" | "event" | "date"
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
      org_plan: ["free", "starter", "growth", "scale"],
      org_status: ["active", "suspended"],
      member_role: ["admin", "interviewer", "viewer"],
      series_status: ["active", "paused", "archived"],
      subject_kind: ["member", "self", "person", "organization"],
      series_tone: ["warm", "neutral", "playful"],
      series_depth: ["single", "light", "balanced", "deep"],
      conversation_mode: ["deep", "flow", "quickfire"],
      interview_status: ["in_progress", "completed", "processed", "abandoned"],
      message_role: ["interviewer", "subject"],
      fact_status: ["active", "needs_review", "superseded", "retell_queued"],
      entity_kind: ["person", "place", "org", "event", "date"],
    },
  },
} as const

// =========================================================
// Convenience row-type aliases (brief-specified export names)
// =========================================================
export type Organization = Tables<"organizations">
export type UserRow = Tables<"users">
export type Membership = Tables<"memberships">
export type Series = Tables<"series">
export type SeriesAccess = Tables<"series_access">
export type Interview = Tables<"interviews">
export type InterviewMessage = Tables<"interview_messages">
export type Topic = Tables<"topics">
export type QueuedQuestion = Tables<"queued_questions">
export type Fact = Tables<"facts">
export type Entity = Tables<"entities">
export type FactEntity = Tables<"fact_entities">
export type InterviewSummary = Tables<"interview_summaries">
export type InterviewUsage = Tables<"interview_usage">
