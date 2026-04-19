/**
 * Generated from Supabase project "postaud-io" (umdksvftvugxlrartnhn) on 2026-04-18.
 * Regenerate with: supabase gen types typescript --project-id umdksvftvugxlrartnhn > src/db/types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_logs: {
        Row: { action: string; actor_user_id: string | null; at: string; id: number; ip: unknown; meta: Json | null; organization_id: string | null; target_id: string | null; target_type: string | null };
        Insert: { action: string; actor_user_id?: string | null; at?: string; id?: number; ip?: unknown; meta?: Json | null; organization_id?: string | null; target_id?: string | null; target_type?: string | null };
        Update: { action?: string; actor_user_id?: string | null; at?: string; id?: number; ip?: unknown; meta?: Json | null; organization_id?: string | null; target_id?: string | null; target_type?: string | null };
        Relationships: [];
      };
      call_events: {
        Row: { at: string; event_type: string; id: number; payload: Json | null; question_id: string | null; session_id: string };
        Insert: { at?: string; event_type: string; id?: number; payload?: Json | null; question_id?: string | null; session_id: string };
        Update: { at?: string; event_type?: string; id?: number; payload?: Json | null; question_id?: string | null; session_id?: string };
        Relationships: [];
      };
      contacts: {
        Row: { consent_status: Database["public"]["Enums"]["consent_status"]; created_at: string; email: string | null; first_name: string | null; id: string; last_name: string | null; organization_id: string; phone_e164: string };
        Insert: { consent_status?: Database["public"]["Enums"]["consent_status"]; created_at?: string; email?: string | null; first_name?: string | null; id?: string; last_name?: string | null; organization_id: string; phone_e164: string };
        Update: { consent_status?: Database["public"]["Enums"]["consent_status"]; created_at?: string; email?: string | null; first_name?: string | null; id?: string; last_name?: string | null; organization_id?: string; phone_e164?: string };
        Relationships: [];
      };
      extracted_answers: {
        Row: { answer_text: string | null; confidence: number | null; followup_text: string | null; id: string; question_id: string; question_prompt: string; session_id: string };
        Insert: { answer_text?: string | null; confidence?: number | null; followup_text?: string | null; id?: string; question_id: string; question_prompt: string; session_id: string };
        Update: { answer_text?: string | null; confidence?: number | null; followup_text?: string | null; id?: string; question_id?: string; question_prompt?: string; session_id?: string };
        Relationships: [];
      };
      interview_requests: {
        Row: { completed_at: string | null; contact_id: string; dial_code: string; expires_at: string; id: string; organization_id: string; phone_assigned: string | null; sender_user_id: string | null; sent_at: string | null; status: Database["public"]["Enums"]["request_status"]; template_id: string; template_snapshot: Json; token: string };
        Insert: { completed_at?: string | null; contact_id: string; dial_code: string; expires_at?: string; id?: string; organization_id: string; phone_assigned?: string | null; sender_user_id?: string | null; sent_at?: string | null; status?: Database["public"]["Enums"]["request_status"]; template_id: string; template_snapshot: Json; token: string };
        Update: { completed_at?: string | null; contact_id?: string; dial_code?: string; expires_at?: string; id?: string; organization_id?: string; phone_assigned?: string | null; sender_user_id?: string | null; sent_at?: string | null; status?: Database["public"]["Enums"]["request_status"]; template_id?: string; template_snapshot?: Json; token?: string };
        Relationships: [];
      };
      interview_sessions: {
        Row: { caller_phone: string | null; consent_captured: boolean; consent_source: string | null; duration_sec: number | null; ended_at: string | null; id: string; recording_path: string | null; recording_sid: string | null; request_id: string; started_at: string; status: Database["public"]["Enums"]["session_status"]; twilio_call_sid: string | null };
        Insert: { caller_phone?: string | null; consent_captured?: boolean; consent_source?: string | null; duration_sec?: number | null; ended_at?: string | null; id?: string; recording_path?: string | null; recording_sid?: string | null; request_id: string; started_at?: string; status?: Database["public"]["Enums"]["session_status"]; twilio_call_sid?: string | null };
        Update: { caller_phone?: string | null; consent_captured?: boolean; consent_source?: string | null; duration_sec?: number | null; ended_at?: string | null; id?: string; recording_path?: string | null; recording_sid?: string | null; request_id?: string; started_at?: string; status?: Database["public"]["Enums"]["session_status"]; twilio_call_sid?: string | null };
        Relationships: [];
      };
      interview_templates: {
        Row: { created_at: string; created_by: string | null; id: string; intro_message: string | null; is_active: boolean; name: string; organization_id: string; output_type: Database["public"]["Enums"]["output_type_enum"]; sms_body: string; version: number; webhook_url: string | null };
        Insert: { created_at?: string; created_by?: string | null; id?: string; intro_message?: string | null; is_active?: boolean; name: string; organization_id: string; output_type?: Database["public"]["Enums"]["output_type_enum"]; sms_body: string; version?: number; webhook_url?: string | null };
        Update: { created_at?: string; created_by?: string | null; id?: string; intro_message?: string | null; is_active?: boolean; name?: string; organization_id?: string; output_type?: Database["public"]["Enums"]["output_type_enum"]; sms_body?: string; version?: number; webhook_url?: string | null };
        Relationships: [];
      };
      jobs: {
        Row: { attempts: number; created_at: string; id: string; kind: string; last_error: string | null; ref_id: string | null; run_after: string; session_id: string | null; status: Database["public"]["Enums"]["job_status"] };
        Insert: { attempts?: number; created_at?: string; id?: string; kind: string; last_error?: string | null; ref_id?: string | null; run_after?: string; session_id?: string | null; status?: Database["public"]["Enums"]["job_status"] };
        Update: { attempts?: number; created_at?: string; id?: string; kind?: string; last_error?: string | null; ref_id?: string | null; run_after?: string; session_id?: string | null; status?: Database["public"]["Enums"]["job_status"] };
        Relationships: [];
      };
      memberships: {
        Row: { created_at: string; organization_id: string; role: Database["public"]["Enums"]["membership_role"]; user_id: string };
        Insert: { created_at?: string; organization_id: string; role?: Database["public"]["Enums"]["membership_role"]; user_id: string };
        Update: { created_at?: string; organization_id?: string; role?: Database["public"]["Enums"]["membership_role"]; user_id?: string };
        Relationships: [];
      };
      organizations: {
        Row: { created_at: string; credits_remaining: number; id: string; name: string; plan: Database["public"]["Enums"]["org_plan"]; stripe_customer_id: string | null };
        Insert: { created_at?: string; credits_remaining?: number; id?: string; name: string; plan?: Database["public"]["Enums"]["org_plan"]; stripe_customer_id?: string | null };
        Update: { created_at?: string; credits_remaining?: number; id?: string; name?: string; plan?: Database["public"]["Enums"]["org_plan"]; stripe_customer_id?: string | null };
        Relationships: [];
      };
      output_jobs: {
        Row: { attempts: number; created_at: string; error: string | null; id: string; output_type: Database["public"]["Enums"]["output_type_enum"]; payload: Json | null; rendered_text: string | null; session_id: string; status: Database["public"]["Enums"]["job_status"]; updated_at: string };
        Insert: { attempts?: number; created_at?: string; error?: string | null; id?: string; output_type: Database["public"]["Enums"]["output_type_enum"]; payload?: Json | null; rendered_text?: string | null; session_id: string; status?: Database["public"]["Enums"]["job_status"]; updated_at?: string };
        Update: { attempts?: number; created_at?: string; error?: string | null; id?: string; output_type?: Database["public"]["Enums"]["output_type_enum"]; payload?: Json | null; rendered_text?: string | null; session_id?: string; status?: Database["public"]["Enums"]["job_status"]; updated_at?: string };
        Relationships: [];
      };
      summaries: {
        Row: { bullets: Json | null; created_at: string; id: string; long: string | null; model: string | null; prompt_version: string | null; session_id: string; short: string | null };
        Insert: { bullets?: Json | null; created_at?: string; id?: string; long?: string | null; model?: string | null; prompt_version?: string | null; session_id: string; short?: string | null };
        Update: { bullets?: Json | null; created_at?: string; id?: string; long?: string | null; model?: string | null; prompt_version?: string | null; session_id?: string; short?: string | null };
        Relationships: [];
      };
      template_questions: {
        Row: { allow_followup: boolean; hint: string | null; id: string; max_seconds: number; position: number; prompt: string; required: boolean; template_id: string };
        Insert: { allow_followup?: boolean; hint?: string | null; id?: string; max_seconds?: number; position: number; prompt: string; required?: boolean; template_id: string };
        Update: { allow_followup?: boolean; hint?: string | null; id?: string; max_seconds?: number; position?: number; prompt?: string; required?: boolean; template_id?: string };
        Relationships: [];
      };
      transcripts: {
        Row: { cleaned_text: string | null; completed_at: string | null; id: string; model: string | null; prompt_version: string | null; raw: Json; session_id: string };
        Insert: { cleaned_text?: string | null; completed_at?: string | null; id?: string; model?: string | null; prompt_version?: string | null; raw: Json; session_id: string };
        Update: { cleaned_text?: string | null; completed_at?: string | null; id?: string; model?: string | null; prompt_version?: string | null; raw?: Json; session_id?: string };
        Relationships: [];
      };
      users: {
        Row: { created_at: string; display_name: string | null; email: string; id: string };
        Insert: { created_at?: string; display_name?: string | null; email: string; id: string };
        Update: { created_at?: string; display_name?: string | null; email?: string; id?: string };
        Relationships: [];
      };
      webhook_deliveries: {
        Row: { attempted_at: string | null; attempts: number; id: string; next_attempt_at: string | null; output_job_id: string | null; request_body: Json; response_body: string | null; response_status: number | null; session_id: string; signature: string; status: Database["public"]["Enums"]["delivery_status"]; url: string };
        Insert: { attempted_at?: string | null; attempts?: number; id?: string; next_attempt_at?: string | null; output_job_id?: string | null; request_body: Json; response_body?: string | null; response_status?: number | null; session_id: string; signature: string; status?: Database["public"]["Enums"]["delivery_status"]; url: string };
        Update: { attempted_at?: string | null; attempts?: number; id?: string; next_attempt_at?: string | null; output_job_id?: string | null; request_body?: Json; response_body?: string | null; response_status?: number | null; session_id?: string; signature?: string; status?: Database["public"]["Enums"]["delivery_status"]; url?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_org_id: { Args: Record<PropertyKey, never>; Returns: string };
    };
    Enums: {
      consent_status: "unknown" | "implied" | "verbal" | "written_and_verbal" | "revoked";
      delivery_status: "pending" | "succeeded" | "failed" | "abandoned";
      job_status: "pending" | "running" | "succeeded" | "failed";
      membership_role: "owner" | "member";
      org_plan: "free" | "starter" | "growth" | "scale";
      output_type_enum: "transcript.plain" | "summary.concise" | "qa.structured" | "blog.draft" | "crm.note" | "webhook.json";
      request_status: "draft" | "sent" | "reminded" | "completed" | "expired" | "cancelled";
      session_status: "active" | "completed" | "partial" | "failed" | "declined" | "expired";
    };
    CompositeTypes: Record<string, never>;
  };
};
