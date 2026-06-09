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
      admissions: {
        Row: {
          admitted_at: string
          bed_id: string | null
          created_at: string
          diagnosis: string | null
          discharge_summary: string | null
          discharged_at: string | null
          doctor_id: string | null
          hospital_id: string
          id: string
          patient_id: string
        }
        Insert: {
          admitted_at?: string
          bed_id?: string | null
          created_at?: string
          diagnosis?: string | null
          discharge_summary?: string | null
          discharged_at?: string | null
          doctor_id?: string | null
          hospital_id: string
          id?: string
          patient_id: string
        }
        Update: {
          admitted_at?: string
          bed_id?: string | null
          created_at?: string
          diagnosis?: string | null
          discharge_summary?: string | null
          discharged_at?: string | null
          doctor_id?: string | null
          hospital_id?: string
          id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admissions_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          cost_credits: number | null
          created_at: string
          feature: string
          hospital_id: string | null
          id: string
          model: string | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          cost_credits?: number | null
          created_at?: string
          feature: string
          hospital_id?: string | null
          id?: string
          model?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          cost_credits?: number | null
          created_at?: string
          feature?: string
          hospital_id?: string | null
          id?: string
          model?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          ai_triage: Json | null
          concession_amount: number
          concession_percent: number
          concession_reason: string | null
          consultation_ended_at: string | null
          consultation_fee: number | null
          consultation_started_at: string | null
          created_at: string
          doctor_id: string | null
          duration_min: number | null
          hospital_id: string
          id: string
          notes: string | null
          patient_id: string
          payment_status: string | null
          queue_no: number | null
          reason: string | null
          scheduled_at: string
          slot_end: string | null
          slot_start: string | null
          status: Database["public"]["Enums"]["appointment_status"] | null
          type: Database["public"]["Enums"]["appointment_type"] | null
          updated_at: string
        }
        Insert: {
          ai_triage?: Json | null
          concession_amount?: number
          concession_percent?: number
          concession_reason?: string | null
          consultation_ended_at?: string | null
          consultation_fee?: number | null
          consultation_started_at?: string | null
          created_at?: string
          doctor_id?: string | null
          duration_min?: number | null
          hospital_id: string
          id?: string
          notes?: string | null
          patient_id: string
          payment_status?: string | null
          queue_no?: number | null
          reason?: string | null
          scheduled_at: string
          slot_end?: string | null
          slot_start?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          type?: Database["public"]["Enums"]["appointment_type"] | null
          updated_at?: string
        }
        Update: {
          ai_triage?: Json | null
          concession_amount?: number
          concession_percent?: number
          concession_reason?: string | null
          consultation_ended_at?: string | null
          consultation_fee?: number | null
          consultation_started_at?: string | null
          created_at?: string
          doctor_id?: string | null
          duration_min?: number | null
          hospital_id?: string
          id?: string
          notes?: string | null
          patient_id?: string
          payment_status?: string | null
          queue_no?: number | null
          reason?: string | null
          scheduled_at?: string
          slot_end?: string | null
          slot_start?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          type?: Database["public"]["Enums"]["appointment_type"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          hospital_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          hospital_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          hospital_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      beds: {
        Row: {
          created_at: string
          daily_rate: number | null
          hospital_id: string
          id: string
          label: string
          status: Database["public"]["Enums"]["bed_status"]
          ward_id: string
        }
        Insert: {
          created_at?: string
          daily_rate?: number | null
          hospital_id: string
          id?: string
          label: string
          status?: Database["public"]["Enums"]["bed_status"]
          ward_id: string
        }
        Update: {
          created_at?: string
          daily_rate?: number | null
          hospital_id?: string
          id?: string
          label?: string
          status?: Database["public"]["Enums"]["bed_status"]
          ward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beds_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      blood_donors: {
        Row: {
          blood_group: string
          cnic: string | null
          created_at: string
          donated_at: string
          donor_name: string
          hospital_id: string
          id: string
          notes: string | null
          phone: string | null
          recorded_by: string | null
          units: number
        }
        Insert: {
          blood_group: string
          cnic?: string | null
          created_at?: string
          donated_at?: string
          donor_name: string
          hospital_id: string
          id?: string
          notes?: string | null
          phone?: string | null
          recorded_by?: string | null
          units?: number
        }
        Update: {
          blood_group?: string
          cnic?: string | null
          created_at?: string
          donated_at?: string
          donor_name?: string
          hospital_id?: string
          id?: string
          notes?: string | null
          phone?: string | null
          recorded_by?: string | null
          units?: number
        }
        Relationships: []
      }
      blood_inventory: {
        Row: {
          blood_group: string
          created_at: string
          critical_level: number
          hospital_id: string
          id: string
          low_level: number
          units: number
          updated_at: string
        }
        Insert: {
          blood_group: string
          created_at?: string
          critical_level?: number
          hospital_id: string
          id?: string
          low_level?: number
          units?: number
          updated_at?: string
        }
        Update: {
          blood_group?: string
          created_at?: string
          critical_level?: number
          hospital_id?: string
          id?: string
          low_level?: number
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      blood_usages: {
        Row: {
          blood_group: string
          created_at: string
          hospital_id: string
          id: string
          notes: string | null
          patient_id: string | null
          patient_mrn: string | null
          patient_name: string
          product: string
          reason: string | null
          recorded_by: string | null
          units: number
          used_at: string
        }
        Insert: {
          blood_group: string
          created_at?: string
          hospital_id: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          patient_mrn?: string | null
          patient_name: string
          product?: string
          reason?: string | null
          recorded_by?: string | null
          units?: number
          used_at?: string
        }
        Update: {
          blood_group?: string
          created_at?: string
          hospital_id?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          patient_mrn?: string | null
          patient_name?: string
          product?: string
          reason?: string | null
          recorded_by?: string | null
          units?: number
          used_at?: string
        }
        Relationships: []
      }
      collection_closures: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cash_total: number
          closure_date: string
          created_at: string
          dispute_reason: string | null
          doctor_user_id: string | null
          grand_total: number
          hospital_id: string
          id: string
          lab_total: number
          notes: string | null
          online_total: number
          opd_total: number
          pharmacy_total: number
          requested_by: string | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cash_total?: number
          closure_date: string
          created_at?: string
          dispute_reason?: string | null
          doctor_user_id?: string | null
          grand_total?: number
          hospital_id: string
          id?: string
          lab_total?: number
          notes?: string | null
          online_total?: number
          opd_total?: number
          pharmacy_total?: number
          requested_by?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cash_total?: number
          closure_date?: string
          created_at?: string
          dispute_reason?: string | null
          doctor_user_id?: string | null
          grand_total?: number
          hospital_id?: string
          id?: string
          lab_total?: number
          notes?: string | null
          online_total?: number
          opd_total?: number
          pharmacy_total?: number
          requested_by?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_closures_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      concession_requests: {
        Row: {
          amount: number
          appointment_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          doctor_id: string
          hospital_id: string
          id: string
          patient_id: string
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          appointment_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          doctor_id: string
          hospital_id: string
          id?: string
          patient_id: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          doctor_id?: string
          hospital_id?: string
          id?: string
          patient_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctor_commission_rules: {
        Row: {
          active: boolean
          created_at: string
          doctor_id: string | null
          hospital_id: string
          id: string
          percent: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          doctor_id?: string | null
          hospital_id: string
          id?: string
          percent?: number
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          doctor_id?: string | null
          hospital_id?: string
          id?: string
          percent?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctor_leaves: {
        Row: {
          created_at: string
          created_by: string | null
          doctor_user_id: string
          ends_on: string
          hospital_id: string
          id: string
          reason: string | null
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doctor_user_id: string
          ends_on: string
          hospital_id: string
          id?: string
          reason?: string | null
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doctor_user_id?: string
          ends_on?: string
          hospital_id?: string
          id?: string
          reason?: string | null
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          hospital_id: string
          id: string
          reason: string | null
          record_id: string | null
          source: string
          table_name: string
          whatsapp_command_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          hospital_id: string
          id?: string
          reason?: string | null
          record_id?: string | null
          source?: string
          table_name: string
          whatsapp_command_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          hospital_id?: string
          id?: string
          reason?: string | null
          record_id?: string | null
          source?: string
          table_name?: string
          whatsapp_command_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_audit_log_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_audit_log_whatsapp_command_id_fkey"
            columns: ["whatsapp_command_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_commands"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          appointment_id: string | null
          created_at: string
          doctor_id: string | null
          due_date: string
          hospital_id: string
          id: string
          notes: string | null
          patient_id: string
          reminder_sent_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          doctor_id?: string | null
          due_date: string
          hospital_id: string
          id?: string
          notes?: string | null
          patient_id: string
          reminder_sent_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          doctor_id?: string | null
          due_date?: string
          hospital_id?: string
          id?: string
          notes?: string | null
          patient_id?: string
          reminder_sent_at?: string | null
        }
        Relationships: []
      }
      hospital_integrations: {
        Row: {
          created_at: string
          hospital_id: string
          id: string
          last_test_at: string | null
          last_test_error: string | null
          last_test_status: string | null
          sms_enabled: boolean
          twilio_account_sid: string | null
          twilio_auth_token: string | null
          twilio_sms_from: string | null
          twilio_whatsapp_from: string | null
          updated_at: string
          whatsapp_enabled: boolean
        }
        Insert: {
          created_at?: string
          hospital_id: string
          id?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          sms_enabled?: boolean
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_sms_from?: string | null
          twilio_whatsapp_from?: string | null
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Update: {
          created_at?: string
          hospital_id?: string
          id?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          sms_enabled?: boolean
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_sms_from?: string | null
          twilio_whatsapp_from?: string | null
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      hospital_lab_services: {
        Row: {
          category: string | null
          code: string
          created_at: string
          enabled: boolean
          hospital_id: string
          id: string
          name: string
          price: number
          turnaround_min: number
          urgent_default: boolean
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          enabled?: boolean
          hospital_id: string
          id?: string
          name: string
          price?: number
          turnaround_min?: number
          urgent_default?: boolean
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          enabled?: boolean
          hospital_id?: string
          id?: string
          name?: string
          price?: number
          turnaround_min?: number
          urgent_default?: boolean
        }
        Relationships: []
      }
      hospital_subscriptions: {
        Row: {
          current_period_end: string | null
          hospital_id: string
          id: string
          plan_id: string
          started_at: string
          status: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          current_period_end?: string | null
          hospital_id: string
          id?: string
          plan_id: string
          started_at?: string
          status?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          current_period_end?: string | null
          hospital_id?: string
          id?: string
          plan_id?: string
          started_at?: string
          status?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospital_subscriptions_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          address: string | null
          ai_credits_monthly: number | null
          ai_credits_used: number | null
          brand_color: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          hospital_registration_no: string | null
          id: string
          logo_url: string | null
          name: string
          phc_registration_no: string | null
          phone: string | null
          plan: string | null
          slug: string
          status: Database["public"]["Enums"]["hospital_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          ai_credits_monthly?: number | null
          ai_credits_used?: number | null
          brand_color?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          hospital_registration_no?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phc_registration_no?: string | null
          phone?: string | null
          plan?: string | null
          slug: string
          status?: Database["public"]["Enums"]["hospital_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          ai_credits_monthly?: number | null
          ai_credits_used?: number | null
          brand_color?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          hospital_registration_no?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phc_registration_no?: string | null
          phone?: string | null
          plan?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["hospital_status"]
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          description: string
          hospital_id: string
          id: string
          invoice_id: string
          quantity: number | null
          total: number | null
          unit_price: number | null
        }
        Insert: {
          description: string
          hospital_id: string
          id?: string
          invoice_id: string
          quantity?: number | null
          total?: number | null
          unit_price?: number | null
        }
        Update: {
          description?: string
          hospital_id?: string
          id?: string
          invoice_id?: string
          quantity?: number | null
          total?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          discount: number | null
          due_date: string | null
          hospital_id: string
          id: string
          invoice_no: string
          notes: string | null
          paid: number | null
          patient_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount?: number | null
          due_date?: string | null
          hospital_id: string
          id?: string
          invoice_no: string
          notes?: string | null
          paid?: number | null
          patient_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount?: number | null
          due_date?: string | null
          hospital_id?: string
          id?: string
          invoice_no?: string
          notes?: string | null
          paid?: number | null
          patient_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          completed_at: string | null
          created_at: string
          department: string | null
          doctor_commission_percent: number
          hospital_id: string
          id: string
          notes: string | null
          ordered_by: string | null
          paid_amount: number | null
          paid_at: string | null
          patient_id: string
          payment_method: string | null
          payment_status: string
          priority: string | null
          received_by: string | null
          referring_doctor_id: string | null
          status: Database["public"]["Enums"]["lab_status"]
          tests: string[]
          total_amount: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          department?: string | null
          doctor_commission_percent?: number
          hospital_id: string
          id?: string
          notes?: string | null
          ordered_by?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          patient_id: string
          payment_method?: string | null
          payment_status?: string
          priority?: string | null
          received_by?: string | null
          referring_doctor_id?: string | null
          status?: Database["public"]["Enums"]["lab_status"]
          tests: string[]
          total_amount?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          department?: string | null
          doctor_commission_percent?: number
          hospital_id?: string
          id?: string
          notes?: string | null
          ordered_by?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          patient_id?: string
          payment_method?: string | null
          payment_status?: string
          priority?: string | null
          received_by?: string | null
          referring_doctor_id?: string | null
          status?: Database["public"]["Enums"]["lab_status"]
          tests?: string[]
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          ai_interpretation: string | null
          created_at: string
          flag: string | null
          hospital_id: string
          id: string
          lab_order_id: string
          reference_range: string | null
          test_name: string
          unit: string | null
          value: string | null
        }
        Insert: {
          ai_interpretation?: string | null
          created_at?: string
          flag?: string | null
          hospital_id: string
          id?: string
          lab_order_id: string
          reference_range?: string | null
          test_name: string
          unit?: string | null
          value?: string | null
        }
        Update: {
          ai_interpretation?: string | null
          created_at?: string
          flag?: string | null
          hospital_id?: string
          id?: string
          lab_order_id?: string
          reference_range?: string | null
          test_name?: string
          unit?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_lab_order_id_fkey"
            columns: ["lab_order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          body: string | null
          created_at: string
          delivered_at: string | null
          hospital_id: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          hospital_id: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          hospital_id?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          delivered_at: string | null
          hospital_id: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          delivered_at?: string | null
          hospital_id?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          delivered_at?: string | null
          hospital_id?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      patient_reports: {
        Row: {
          ai_error: string | null
          ai_explanation: string | null
          ai_status: string
          ai_summary: string | null
          ai_treatment: string | null
          analyzed_at: string | null
          created_at: string
          doctor_id: string | null
          hospital_id: string
          id: string
          mime_type: string | null
          notes: string | null
          original_name: string
          patient_id: string
          size_bytes: number | null
          storage_path: string
          title: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_error?: string | null
          ai_explanation?: string | null
          ai_status?: string
          ai_summary?: string | null
          ai_treatment?: string | null
          analyzed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          hospital_id: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          original_name: string
          patient_id: string
          size_bytes?: number | null
          storage_path: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_error?: string | null
          ai_explanation?: string | null
          ai_status?: string
          ai_summary?: string | null
          ai_treatment?: string | null
          analyzed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          hospital_id?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          original_name?: string
          patient_id?: string
          size_bytes?: number | null
          storage_path?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      patients: {
        Row: {
          address: string | null
          allergies: string[] | null
          assigned_doctor_id: string | null
          blood_group: string | null
          chronic_conditions: string[] | null
          cnic: string | null
          created_at: string
          default_concession_percent: number
          dob: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          father_name: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender"] | null
          hospital_id: string
          id: string
          insurance_number: string | null
          insurance_provider: string | null
          last_name: string
          mrn: string
          notes: string | null
          phone: string | null
          pmr_no: string | null
          sex: string | null
          updated_at: string
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          address?: string | null
          allergies?: string[] | null
          assigned_doctor_id?: string | null
          blood_group?: string | null
          chronic_conditions?: string[] | null
          cnic?: string | null
          created_at?: string
          default_concession_percent?: number
          dob?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          father_name?: string | null
          first_name: string
          gender?: Database["public"]["Enums"]["gender"] | null
          hospital_id: string
          id?: string
          insurance_number?: string | null
          insurance_provider?: string | null
          last_name: string
          mrn: string
          notes?: string | null
          phone?: string | null
          pmr_no?: string | null
          sex?: string | null
          updated_at?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          address?: string | null
          allergies?: string[] | null
          assigned_doctor_id?: string | null
          blood_group?: string | null
          chronic_conditions?: string[] | null
          cnic?: string | null
          created_at?: string
          default_concession_percent?: number
          dob?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          father_name?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          hospital_id?: string
          id?: string
          insurance_number?: string | null
          insurance_provider?: string | null
          last_name?: string
          mrn?: string
          notes?: string | null
          phone?: string | null
          pmr_no?: string | null
          sex?: string | null
          updated_at?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          created_at: string
          hospital_id: string
          id: string
          metadata: Json | null
          method: string
          patient_id: string
          receipt_no: string | null
          reference_no: string | null
          status: string
          txn_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          hospital_id: string
          id?: string
          metadata?: Json | null
          method?: string
          patient_id: string
          receipt_no?: string | null
          reference_no?: string | null
          status?: string
          txn_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          hospital_id?: string
          id?: string
          metadata?: Json | null
          method?: string
          patient_id?: string
          receipt_no?: string | null
          reference_no?: string | null
          status?: string
          txn_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pharmacy_categories: {
        Row: {
          created_at: string
          description: string | null
          hospital_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hospital_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hospital_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_customers: {
        Row: {
          address: string | null
          balance: number
          cnic: string | null
          created_at: string
          hospital_id: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          cnic?: string | null
          created_at?: string
          hospital_id: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          cnic?: string | null
          created_at?: string
          hospital_id?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_dispenses: {
        Row: {
          created_at: string
          dispensed_by: string | null
          doctor_commission_percent: number
          hospital_id: string
          id: string
          items: Json
          patient_id: string
          prescription_id: string | null
          referring_doctor_id: string | null
          total: number | null
        }
        Insert: {
          created_at?: string
          dispensed_by?: string | null
          doctor_commission_percent?: number
          hospital_id: string
          id?: string
          items?: Json
          patient_id: string
          prescription_id?: string | null
          referring_doctor_id?: string | null
          total?: number | null
        }
        Update: {
          created_at?: string
          dispensed_by?: string | null
          doctor_commission_percent?: number
          hospital_id?: string
          id?: string
          items?: Json
          patient_id?: string
          prescription_id?: string | null
          referring_doctor_id?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_dispenses_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_dispenses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_dispenses_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_items: {
        Row: {
          category: string | null
          created_at: string
          expiry_date: string | null
          hospital_id: string
          id: string
          manufacturer: string | null
          name: string
          reorder_level: number | null
          sku: string | null
          stock_qty: number
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          hospital_id: string
          id?: string
          manufacturer?: string | null
          name: string
          reorder_level?: number | null
          sku?: string | null
          stock_qty?: number
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          hospital_id?: string
          id?: string
          manufacturer?: string | null
          name?: string
          reorder_level?: number | null
          sku?: string | null
          stock_qty?: number
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_items_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_medicines: {
        Row: {
          active: boolean
          barcode: string | null
          batch_no: string | null
          category_id: string | null
          company: string | null
          created_at: string
          expiry_date: string | null
          generic_name: string | null
          hospital_id: string
          id: string
          min_stock_level: number
          name: string
          notes: string | null
          purchase_price: number
          sale_price: number
          stock_qty: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          batch_no?: string | null
          category_id?: string | null
          company?: string | null
          created_at?: string
          expiry_date?: string | null
          generic_name?: string | null
          hospital_id: string
          id?: string
          min_stock_level?: number
          name: string
          notes?: string | null
          purchase_price?: number
          sale_price?: number
          stock_qty?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          batch_no?: string | null
          category_id?: string | null
          company?: string | null
          created_at?: string
          expiry_date?: string | null
          generic_name?: string | null
          hospital_id?: string
          id?: string
          min_stock_level?: number
          name?: string
          notes?: string | null
          purchase_price?: number
          sale_price?: number
          stock_qty?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_purchase_items: {
        Row: {
          created_at: string
          hospital_id: string
          id: string
          line_total: number
          medicine_id: string
          purchase_id: string
          purchase_price: number
          qty: number
          received: boolean
        }
        Insert: {
          created_at?: string
          hospital_id: string
          id?: string
          line_total?: number
          medicine_id: string
          purchase_id: string
          purchase_price?: number
          qty?: number
          received?: boolean
        }
        Update: {
          created_at?: string
          hospital_id?: string
          id?: string
          line_total?: number
          medicine_id?: string
          purchase_id?: string
          purchase_price?: number
          qty?: number
          received?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          hospital_id: string
          id: string
          notes: string | null
          received_at: string | null
          reference_no: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hospital_id: string
          id?: string
          notes?: string | null
          received_at?: string | null
          reference_no?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hospital_id?: string
          id?: string
          notes?: string | null
          received_at?: string | null
          reference_no?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_sale_items: {
        Row: {
          created_at: string
          hospital_id: string
          id: string
          line_total: number
          medicine_id: string
          medicine_name_snapshot: string | null
          qty: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          hospital_id: string
          id?: string
          line_total?: number
          medicine_id: string
          medicine_name_snapshot?: string | null
          qty?: number
          sale_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          hospital_id?: string
          id?: string
          line_total?: number
          medicine_id?: string
          medicine_name_snapshot?: string | null
          qty?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_sales: {
        Row: {
          cashier_id: string | null
          created_at: string
          customer_id: string | null
          customer_name_snapshot: string | null
          discount: number
          discount_type: string
          hospital_id: string
          id: string
          invoice_no: string
          notes: string | null
          payment_method: string
          sold_at: string
          subtotal: number
          tax: number
          total: number
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name_snapshot?: string | null
          discount?: number
          discount_type?: string
          hospital_id: string
          id?: string
          invoice_no: string
          notes?: string | null
          payment_method?: string
          sold_at?: string
          subtotal?: number
          tax?: number
          total?: number
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name_snapshot?: string | null
          discount?: number
          discount_type?: string
          hospital_id?: string
          id?: string
          invoice_no?: string
          notes?: string | null
          payment_method?: string
          sold_at?: string
          subtotal?: number
          tax?: number
          total?: number
        }
        Relationships: []
      }
      pharmacy_settings: {
        Row: {
          created_at: string
          currency: string
          default_discount_percent: number
          default_discount_type: string
          default_tax_percent: number
          expiry_warning_days: number
          hospital_id: string
          id: string
          invoice_padding: number
          invoice_prefix: string
          low_stock_threshold: number
          receipt_footer: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          default_discount_percent?: number
          default_discount_type?: string
          default_tax_percent?: number
          expiry_warning_days?: number
          hospital_id: string
          id?: string
          invoice_padding?: number
          invoice_prefix?: string
          low_stock_threshold?: number
          receipt_footer?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          default_discount_percent?: number
          default_discount_type?: string
          default_tax_percent?: number
          expiry_warning_days?: number
          hospital_id?: string
          id?: string
          invoice_padding?: number
          invoice_prefix?: string
          low_stock_threshold?: number
          receipt_footer?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_suppliers: {
        Row: {
          address: string | null
          balance: number
          contact_person: string | null
          created_at: string
          email: string | null
          hospital_id: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          contact_person?: string | null
          created_at?: string
          email?: string | null
          hospital_id: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          contact_person?: string | null
          created_at?: string
          email?: string | null
          hospital_id?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          ai_assisted: boolean | null
          allergies_drug: string[] | null
          allergies_food: string[] | null
          appointment_id: string | null
          chronic_conditions: string[] | null
          diagnosis: string | null
          doctor_id: string | null
          examination: string | null
          follow_up_date: string | null
          follow_up_notes: string | null
          hospital_id: string
          id: string
          issued_at: string
          lab_tests: string[] | null
          medications: Json
          notes: string | null
          patient_id: string
          suggested_treatment: string | null
          symptoms: string[] | null
          vitals: Json | null
        }
        Insert: {
          ai_assisted?: boolean | null
          allergies_drug?: string[] | null
          allergies_food?: string[] | null
          appointment_id?: string | null
          chronic_conditions?: string[] | null
          diagnosis?: string | null
          doctor_id?: string | null
          examination?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          hospital_id: string
          id?: string
          issued_at?: string
          lab_tests?: string[] | null
          medications?: Json
          notes?: string | null
          patient_id: string
          suggested_treatment?: string | null
          symptoms?: string[] | null
          vitals?: Json | null
        }
        Update: {
          ai_assisted?: boolean | null
          allergies_drug?: string[] | null
          allergies_food?: string[] | null
          appointment_id?: string | null
          chronic_conditions?: string[] | null
          diagnosis?: string | null
          doctor_id?: string | null
          examination?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          hospital_id?: string
          id?: string
          issued_at?: string
          lab_tests?: string[] | null
          medications?: Json
          notes?: string | null
          patient_id?: string
          suggested_treatment?: string | null
          symptoms?: string[] | null
          vitals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          cnic: string | null
          consultation_fee: number | null
          created_at: string
          department: string | null
          display_name: string | null
          email: string | null
          experience_years: number | null
          hospital_id: string | null
          id: string
          is_doctor: boolean | null
          license_no: string | null
          max_patients_per_day: number | null
          phone: string | null
          photo_url: string | null
          rating: number | null
          signature_url: string | null
          slot_duration_min: number | null
          specialization: string | null
          stamp_url: string | null
          updated_at: string
          user_id: string
          working_days: string[] | null
          working_hours: Json | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cnic?: string | null
          consultation_fee?: number | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email?: string | null
          experience_years?: number | null
          hospital_id?: string | null
          id?: string
          is_doctor?: boolean | null
          license_no?: string | null
          max_patients_per_day?: number | null
          phone?: string | null
          photo_url?: string | null
          rating?: number | null
          signature_url?: string | null
          slot_duration_min?: number | null
          specialization?: string | null
          stamp_url?: string | null
          updated_at?: string
          user_id: string
          working_days?: string[] | null
          working_hours?: Json | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cnic?: string | null
          consultation_fee?: number | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email?: string | null
          experience_years?: number | null
          hospital_id?: string | null
          id?: string
          is_doctor?: boolean | null
          license_no?: string | null
          max_patients_per_day?: number | null
          phone?: string | null
          photo_url?: string | null
          rating?: number | null
          signature_url?: string | null
          slot_duration_min?: number | null
          specialization?: string | null
          stamp_url?: string | null
          updated_at?: string
          user_id?: string
          working_days?: string[] | null
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean | null
          ai_credits: number | null
          created_at: string
          features: Json | null
          id: string
          max_patients: number | null
          max_users: number | null
          name: string
          price_monthly: number
        }
        Insert: {
          active?: boolean | null
          ai_credits?: number | null
          created_at?: string
          features?: Json | null
          id?: string
          max_patients?: number | null
          max_users?: number | null
          name: string
          price_monthly: number
        }
        Update: {
          active?: boolean | null
          ai_credits?: number | null
          created_at?: string
          features?: Json | null
          id?: string
          max_patients?: number | null
          max_users?: number | null
          name?: string
          price_monthly?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          hospital_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          hospital_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          hospital_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals: {
        Row: {
          bp_diastolic: number | null
          bp_systolic: number | null
          heart_rate: number | null
          height_cm: number | null
          hospital_id: string
          id: string
          notes: string | null
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          respiratory_rate: number | null
          spo2: number | null
          temperature: number | null
          weight_kg: number | null
        }
        Insert: {
          bp_diastolic?: number | null
          bp_systolic?: number | null
          heart_rate?: number | null
          height_cm?: number | null
          hospital_id: string
          id?: string
          notes?: string | null
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          spo2?: number | null
          temperature?: number | null
          weight_kg?: number | null
        }
        Update: {
          bp_diastolic?: number | null
          bp_systolic?: number | null
          heart_rate?: number | null
          height_cm?: number | null
          hospital_id?: string
          id?: string
          notes?: string | null
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          spo2?: number | null
          temperature?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      wards: {
        Row: {
          created_at: string
          floor: string | null
          hospital_id: string
          id: string
          name: string
          ward_type: string | null
        }
        Insert: {
          created_at?: string
          floor?: string | null
          hospital_id: string
          id?: string
          name: string
          ward_type?: string | null
        }
        Update: {
          created_at?: string
          floor?: string | null
          hospital_id?: string
          id?: string
          name?: string
          ward_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wards_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_commands: {
        Row: {
          action: string
          applied_at: string | null
          approved_by: string | null
          command_raw: string
          created_at: string
          error_message: string | null
          hospital_id: string
          id: string
          payload: Json | null
          sender_phone: string
          sender_role: string | null
          sender_user_id: string | null
          status: string
          target_id: string | null
          target_table: string
          updated_at: string
        }
        Insert: {
          action: string
          applied_at?: string | null
          approved_by?: string | null
          command_raw: string
          created_at?: string
          error_message?: string | null
          hospital_id: string
          id?: string
          payload?: Json | null
          sender_phone: string
          sender_role?: string | null
          sender_user_id?: string | null
          status?: string
          target_id?: string | null
          target_table: string
          updated_at?: string
        }
        Update: {
          action?: string
          applied_at?: string | null
          approved_by?: string | null
          command_raw?: string
          created_at?: string
          error_message?: string | null
          hospital_id?: string
          id?: string
          payload?: Json | null
          sender_phone?: string
          sender_role?: string | null
          sender_user_id?: string | null
          status?: string
          target_id?: string | null
          target_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_commands_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_hospital_id: { Args: { _user_id: string }; Returns: string }
      has_hospital_role: {
        Args: {
          _hospital_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      user_belongs_to_hospital: {
        Args: { _hospital_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "hospital_admin"
        | "doctor"
        | "nurse"
        | "receptionist"
        | "lab_tech"
        | "pharmacist"
        | "accountant"
        | "patient_user"
        | "owner"
        | "ward"
        | "daycare"
        | "opd"
        | "blood_bank"
        | "radiology"
      appointment_status:
        | "scheduled"
        | "checked_in"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      appointment_type:
        | "consultation"
        | "followup"
        | "telemedicine"
        | "emergency"
        | "procedure"
      bed_status: "free" | "occupied" | "cleaning" | "maintenance"
      gender: "male" | "female" | "other" | "unknown"
      hospital_status: "active" | "suspended" | "trial" | "cancelled"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "partial"
        | "overdue"
        | "cancelled"
      lab_status:
        | "ordered"
        | "sample_collected"
        | "processing"
        | "completed"
        | "cancelled"
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
      app_role: [
        "super_admin",
        "hospital_admin",
        "doctor",
        "nurse",
        "receptionist",
        "lab_tech",
        "pharmacist",
        "accountant",
        "patient_user",
        "owner",
        "ward",
        "daycare",
        "opd",
        "blood_bank",
        "radiology",
      ],
      appointment_status: [
        "scheduled",
        "checked_in",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      appointment_type: [
        "consultation",
        "followup",
        "telemedicine",
        "emergency",
        "procedure",
      ],
      bed_status: ["free", "occupied", "cleaning", "maintenance"],
      gender: ["male", "female", "other", "unknown"],
      hospital_status: ["active", "suspended", "trial", "cancelled"],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "partial",
        "overdue",
        "cancelled",
      ],
      lab_status: [
        "ordered",
        "sample_collected",
        "processing",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
