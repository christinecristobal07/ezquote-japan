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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_survey_links: {
        Row: {
          bad_url: string | null
          great_url: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          bad_url?: string | null
          great_url?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          bad_url?: string | null
          great_url?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_survey_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          changed_at: string
          changed_by: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_sites: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      category_markups: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          markup_type: Database["public"]["Enums"]["markup_type"]
          pax_category: Database["public"]["Enums"]["pax_category"]
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          markup_type: Database["public"]["Enums"]["markup_type"]
          pax_category: Database["public"]["Enums"]["pax_category"]
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          markup_type?: Database["public"]["Enums"]["markup_type"]
          pax_category?: Database["public"]["Enums"]["pax_category"]
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_markups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_markups_pax_category_fkey"
            columns: ["pax_category"]
            isOneToOne: false
            referencedRelation: "pax_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          body: string
          condition_service_id: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string
          ends_on: string | null
          id: string
          is_active: boolean
          sort_order: number
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          body: string
          condition_service_id?: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          condition_service_id?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_condition_service_id_fkey"
            columns: ["condition_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          effective_from: string
          id: string
          php_per_unit: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          effective_from?: string
          id?: string
          php_per_unit: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_from?: string
          id?: string
          php_per_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          city_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          room_types: string | null
          sort_order: number
          star_rating: number
          updated_at: string
          walk_to_station: string | null
        }
        Insert: {
          city_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          room_types?: string | null
          sort_order?: number
          star_rating: number
          updated_at?: string
          walk_to_station?: string | null
        }
        Update: {
          city_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          room_types?: string | null
          sort_order?: number
          star_rating?: number
          updated_at?: string
          walk_to_station?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotels_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pax_categories: {
        Row: {
          code: Database["public"]["Enums"]["pax_category"]
          has_bed: boolean
          hotel_divisor: number
          hotel_multiplier: number
          label: string
          output_label: string
          sort_order: number
        }
        Insert: {
          code: Database["public"]["Enums"]["pax_category"]
          has_bed: boolean
          hotel_divisor: number
          hotel_multiplier: number
          label: string
          output_label: string
          sort_order: number
        }
        Update: {
          code?: Database["public"]["Enums"]["pax_category"]
          has_bed?: boolean
          hotel_divisor?: number
          hotel_multiplier?: number
          label?: string
          output_label?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          data_issues: Database["public"]["Enums"]["data_issue"][]
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          supervisor_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data_issues?: Database["public"]["Enums"]["data_issue"][]
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          supervisor_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data_issues?: Database["public"]["Enums"]["data_issue"][]
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          supervisor_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          kind: Database["public"]["Enums"]["adjustment_kind"]
          pax_category: Database["public"]["Enums"]["pax_category"]
          quotation_id: string
          reason: string
          reverses_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          kind: Database["public"]["Enums"]["adjustment_kind"]
          pax_category: Database["public"]["Enums"]["pax_category"]
          quotation_id: string
          reason: string
          reverses_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          kind?: Database["public"]["Enums"]["adjustment_kind"]
          pax_category?: Database["public"]["Enums"]["pax_category"]
          quotation_id?: string
          reason?: string
          reverses_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_adjustments_pax_category_fkey"
            columns: ["pax_category"]
            isOneToOne: false
            referencedRelation: "pax_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "quotation_adjustments_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_adjustments_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "quotation_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_hotels: {
        Row: {
          custom_name: string | null
          hotel_id: string | null
          id: string
          quotation_id: string
          sort_order: number
        }
        Insert: {
          custom_name?: string | null
          hotel_id?: string | null
          id?: string
          quotation_id: string
          sort_order?: number
        }
        Update: {
          custom_name?: string | null
          hotel_id?: string | null
          id?: string
          quotation_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_hotels_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_hotels_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_outputs: {
        Row: {
          computed_rates: Json
          generated_at: string
          generated_by: string | null
          id: string
          output_text: string
          quotation_id: string
        }
        Insert: {
          computed_rates: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          output_text: string
          quotation_id: string
        }
        Update: {
          computed_rates?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          output_text?: string
          quotation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_outputs_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_outputs_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_service_addons: {
        Row: {
          addon_id: string
          quotation_service_id: string
        }
        Insert: {
          addon_id: string
          quotation_service_id: string
        }
        Update: {
          addon_id?: string
          quotation_service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_service_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "service_rate_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_service_addons_quotation_service_id_fkey"
            columns: ["quotation_service_id"]
            isOneToOne: false
            referencedRelation: "quotation_services"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_services: {
        Row: {
          created_at: string
          day_number: number | null
          id: string
          quotation_id: string
          service_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          day_number?: number | null
          id?: string
          quotation_id: string
          service_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          day_number?: number | null
          id?: string
          quotation_id?: string
          service_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_services_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          agent_id: string
          airfare_php: number
          booking_status: Database["public"]["Enums"]["booking_status"]
          client_name: string | null
          created_at: string
          duration_days: number
          duration_mode: Database["public"]["Enums"]["duration_mode"]
          hotel_category: number | null
          id: string
          output_categories: Database["public"]["Enums"]["pax_category"][]
          package_markup_type: Database["public"]["Enums"]["markup_type"] | null
          package_markup_value: number | null
          package_title: string | null
          pax_adults: number
          pax_children: number
          pax_total: number | null
          rates_as_of: string
          reference_no: string
          season_label: string | null
          snapshot: Json
          status: Database["public"]["Enums"]["quotation_status"]
          travel_date: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          airfare_php?: number
          booking_status?: Database["public"]["Enums"]["booking_status"]
          client_name?: string | null
          created_at?: string
          duration_days?: number
          duration_mode?: Database["public"]["Enums"]["duration_mode"]
          hotel_category?: number | null
          id?: string
          output_categories?: Database["public"]["Enums"]["pax_category"][]
          package_markup_type?:
            | Database["public"]["Enums"]["markup_type"]
            | null
          package_markup_value?: number | null
          package_title?: string | null
          pax_adults?: number
          pax_children?: number
          pax_total?: number | null
          rates_as_of?: string
          reference_no: string
          season_label?: string | null
          snapshot?: Json
          status?: Database["public"]["Enums"]["quotation_status"]
          travel_date?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          airfare_php?: number
          booking_status?: Database["public"]["Enums"]["booking_status"]
          client_name?: string | null
          created_at?: string
          duration_days?: number
          duration_mode?: Database["public"]["Enums"]["duration_mode"]
          hotel_category?: number | null
          id?: string
          output_categories?: Database["public"]["Enums"]["pax_category"][]
          package_markup_type?:
            | Database["public"]["Enums"]["markup_type"]
            | null
          package_markup_value?: number | null
          package_title?: string | null
          pax_adults?: number
          pax_children?: number
          pax_total?: number | null
          rates_as_of?: string
          reference_no?: string
          season_label?: string | null
          snapshot?: Json
          status?: Database["public"]["Enums"]["quotation_status"]
          travel_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_markups: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          markup_type: Database["public"]["Enums"]["markup_type"]
          service_type: Database["public"]["Enums"]["service_type"]
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          markup_type: Database["public"]["Enums"]["markup_type"]
          service_type: Database["public"]["Enums"]["service_type"]
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          markup_type?: Database["public"]["Enums"]["markup_type"]
          service_type?: Database["public"]["Enums"]["service_type"]
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_markups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_rate_addons: {
        Row: {
          amount: number
          default_selected: boolean
          id: string
          name: string
          rate_version_id: string
          sort_order: number
        }
        Insert: {
          amount: number
          default_selected?: boolean
          id?: string
          name: string
          rate_version_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          default_selected?: boolean
          id?: string
          name?: string
          rate_version_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_rate_addons_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "service_rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      service_rate_tiers: {
        Row: {
          amount: number
          id: string
          max_pax: number
          min_pax: number
          pax_type: string
          rate_version_id: string
        }
        Insert: {
          amount: number
          id?: string
          max_pax: number
          min_pax: number
          pax_type?: string
          rate_version_id: string
        }
        Update: {
          amount?: number
          id?: string
          max_pax?: number
          min_pax?: number
          pax_type?: string
          rate_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_rate_tiers_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "service_rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      service_rate_versions: {
        Row: {
          child_max_age: number | null
          child_min_age: number | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          effective_from: string
          id: string
          notes: string | null
          pricing_basis: Database["public"]["Enums"]["pricing_basis"]
          published_at: string | null
          published_by: string | null
          service_id: string
          status: Database["public"]["Enums"]["rate_status"]
          valid_until: string | null
        }
        Insert: {
          child_max_age?: number | null
          child_min_age?: number | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_from?: string
          id?: string
          notes?: string | null
          pricing_basis?: Database["public"]["Enums"]["pricing_basis"]
          published_at?: string | null
          published_by?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["rate_status"]
          valid_until?: string | null
        }
        Update: {
          child_max_age?: number | null
          child_min_age?: number | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_from?: string
          id?: string
          notes?: string | null
          pricing_basis?: Database["public"]["Enums"]["pricing_basis"]
          published_at?: string | null
          published_by?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["rate_status"]
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_rate_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_rate_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_rate_versions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          adds_night: boolean
          city_id: string | null
          code: string
          consumes_day: boolean
          created_at: string
          description: string | null
          id: string
          inclusion_text: string | null
          is_active: boolean
          itinerary_text: string | null
          itinerary_title: string | null
          name: string
          operator_id: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          sort_order: number
          transfer_direction:
            | Database["public"]["Enums"]["transfer_direction"]
            | null
          updated_at: string
        }
        Insert: {
          adds_night?: boolean
          city_id?: string | null
          code: string
          consumes_day?: boolean
          created_at?: string
          description?: string | null
          id?: string
          inclusion_text?: string | null
          is_active?: boolean
          itinerary_text?: string | null
          itinerary_title?: string | null
          name: string
          operator_id?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          sort_order?: number
          transfer_direction?:
            | Database["public"]["Enums"]["transfer_direction"]
            | null
          updated_at?: string
        }
        Update: {
          adds_night?: boolean
          city_id?: string | null
          code?: string
          consumes_day?: boolean
          created_at?: string
          description?: string | null
          id?: string
          inclusion_text?: string | null
          is_active?: boolean
          itinerary_text?: string | null
          itinerary_title?: string | null
          name?: string
          operator_id?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          sort_order?: number
          transfer_direction?:
            | Database["public"]["Enums"]["transfer_direction"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_rate_draft: {
        Args: { p_from_version_id?: string; p_service_id: string }
        Returns: string
      }
      reorder_content: {
        Args: {
          p_ids: string[]
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: undefined
      }
      save_rate_draft: {
        Args: {
          p_addons?: Json
          p_fields?: Json
          p_tiers?: Json
          p_version_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      adjustment_kind:
        | "hotel"
        | "operator_charge"
        | "rate_difference"
        | "special_arrangement"
        | "extra_transfer"
        | "child_adjustment"
        | "surcharge"
        | "other"
      app_role:
        | "super_admin"
        | "product_development"
        | "admin"
        | "sales_supervisor"
        | "sales_agent"
      booking_status: "not_booked" | "booked" | "confirmed"
      content_type:
        | "inclusion"
        | "exclusion"
        | "note"
        | "requirement"
        | "remark"
        | "announcement"
        | "availability_reminder"
        | "booking_disclaimer"
        | "personal_transactions"
      currency_code: "JPY" | "USD" | "PHP"
      data_issue:
        | "needs_email"
        | "invalid_bad_link"
        | "invalid_great_link"
        | "placeholder_link"
      duration_mode: "agent_selected" | "derived"
      markup_type: "fixed" | "percent"
      pax_category: "quad" | "triple" | "twin" | "solo" | "child" | "sneak_in"
      pricing_basis: "per_pax" | "private_total"
      quotation_status: "draft" | "sent" | "archived"
      rate_status: "draft" | "published" | "inactive"
      service_type: "tour" | "transfer"
      transfer_direction: "one_way" | "round_trip"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      adjustment_kind: [
        "hotel",
        "operator_charge",
        "rate_difference",
        "special_arrangement",
        "extra_transfer",
        "child_adjustment",
        "surcharge",
        "other",
      ],
      app_role: [
        "super_admin",
        "product_development",
        "admin",
        "sales_supervisor",
        "sales_agent",
      ],
      booking_status: ["not_booked", "booked", "confirmed"],
      content_type: [
        "inclusion",
        "exclusion",
        "note",
        "requirement",
        "remark",
        "announcement",
        "availability_reminder",
        "booking_disclaimer",
        "personal_transactions",
      ],
      currency_code: ["JPY", "USD", "PHP"],
      data_issue: [
        "needs_email",
        "invalid_bad_link",
        "invalid_great_link",
        "placeholder_link",
      ],
      duration_mode: ["agent_selected", "derived"],
      markup_type: ["fixed", "percent"],
      pax_category: ["quad", "triple", "twin", "solo", "child", "sneak_in"],
      pricing_basis: ["per_pax", "private_total"],
      quotation_status: ["draft", "sent", "archived"],
      rate_status: ["draft", "published", "inactive"],
      service_type: ["tour", "transfer"],
      transfer_direction: ["one_way", "round_trip"],
    },
  },
} as const
