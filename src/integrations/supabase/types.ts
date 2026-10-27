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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          performed_by?: string | null
        }
        Relationships: []
      }
      batches: {
        Row: {
          course_id: string
          created_at: string
          end_year: number
          id: string
          name: string
          start_year: number
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          end_year: number
          id?: string
          name: string
          start_year: number
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          end_year?: number
          id?: string
          name?: string
          start_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      exam_groups: {
        Row: {
          batch_id: string
          course_id: string
          created_at: string
          exam_id: string
          id: string
        }
        Insert: {
          batch_id: string
          course_id: string
          created_at?: string
          exam_id: string
          id?: string
        }
        Update: {
          batch_id?: string
          course_id?: string
          created_at?: string
          exam_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_groups_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_groups_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_groups_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          exam_date: string
          id: string
          name: string
          session: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_date: string
          id?: string
          name: string
          session?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_date?: string
          id?: string
          name?: string
          session?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          batch_id: string | null
          course_id: string | null
          created_at: string
          created_count: number
          file_name: string | null
          id: string
          import_type: string
          performed_by: string | null
          skipped_count: number
          total_rows: number
          updated_count: number
        }
        Insert: {
          batch_id?: string | null
          course_id?: string | null
          created_at?: string
          created_count?: number
          file_name?: string | null
          id?: string
          import_type: string
          performed_by?: string | null
          skipped_count?: number
          total_rows?: number
          updated_count?: number
        }
        Update: {
          batch_id?: string | null
          course_id?: string | null
          created_at?: string
          created_count?: number
          file_name?: string | null
          id?: string
          import_type?: string
          performed_by?: string | null
          skipped_count?: number
          total_rows?: number
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_logs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          block: string
          capacity: number | null
          created_at: string
          id: string
          is_active: boolean
          room_number: string
          row_count: number
          seats_per_row: number
          updated_at: string
        }
        Insert: {
          block?: string
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          room_number: string
          row_count?: number
          seats_per_row?: number
          updated_at?: string
        }
        Update: {
          block?: string
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          room_number?: string
          row_count?: number
          seats_per_row?: number
          updated_at?: string
        }
        Relationships: []
      }
      seat_allocations: {
        Row: {
          created_at: string
          group_label: string
          id: string
          plan_id: string
          room_id: string
          row_number: number
          seat_number: number
          student_id: string
        }
        Insert: {
          created_at?: string
          group_label?: string
          id?: string
          plan_id: string
          room_id: string
          row_number: number
          seat_number: number
          student_id: string
        }
        Update: {
          created_at?: string
          group_label?: string
          id?: string
          plan_id?: string
          room_id?: string
          row_number?: number
          seat_number?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_allocations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "seating_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_allocations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      seating_plans: {
        Row: {
          created_at: string
          exam_id: string
          generated_by: string | null
          id: string
          rooms_used: number
          strategy: string
          total_students: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          generated_by?: string | null
          id?: string
          rooms_used?: number
          strategy?: string
          total_students?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          generated_by?: string | null
          id?: string
          rooms_used?: number
          strategy?: string
          total_students?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seating_plans_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: true
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      student_subjects: {
        Row: {
          created_at: string
          id: string
          student_id: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          student_id: string
          subject_id: string
        }
        Update: {
          created_at?: string
          id?: string
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subjects_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          batch_id: string
          course_id: string
          created_at: string
          id: string
          name: string
          registration_number: string
          roll_number: string | null
          section_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          course_id: string
          created_at?: string
          id?: string
          name: string
          registration_number: string
          roll_number?: string | null
          section_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          course_id?: string
          created_at?: string
          id?: string
          name?: string
          registration_number?: string
          roll_number?: string | null
          section_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          batch_id: string | null
          code: string | null
          course_id: string | null
          created_at: string
          id: string
          name: string
          semester: number | null
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          code?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          name: string
          semester?: number | null
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          code?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          name?: string
          semester?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff"
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
      app_role: ["admin", "staff"],
    },
  },
} as const
