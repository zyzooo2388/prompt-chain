export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          is_superadmin: boolean | null;
          is_matrix_admin: boolean | null;
        };
        Insert: {
          id: string;
          is_superadmin?: boolean | null;
          is_matrix_admin?: boolean | null;
        };
        Update: {
          id?: string;
          is_superadmin?: boolean | null;
          is_matrix_admin?: boolean | null;
        };
      };
      humor_flavors: {
        Row: {
          id: number;
          created_datetime_utc: string;
          description: string;
          slug: string | null;
          created_by_user_id: string | null;
          modified_by_user_id: string | null;
          modified_datetime_utc: string | null;
        };
        Insert: {
          id?: number;
          created_datetime_utc?: string;
          description?: string;
          slug?: string | null;
          created_by_user_id?: string | null;
          modified_by_user_id?: string | null;
          modified_datetime_utc?: string | null;
        };
        Update: {
          id?: number;
          created_datetime_utc?: string;
          description?: string;
          slug?: string | null;
          created_by_user_id?: string | null;
          modified_by_user_id?: string | null;
          modified_datetime_utc?: string | null;
        };
      };
      humor_flavor_steps: {
        Row: {
          id: number;
          created_datetime_utc: string;
          humor_flavor_id: number;
          llm_temperature: number | null;
          order_by: number;
          llm_input_type_id: number | null;
          llm_output_type_id: number | null;
          llm_model_id: number | null;
          humor_flavor_step_type_id: number | null;
          llm_system_prompt: string | null;
          llm_user_prompt: string | null;
          description: string | null;
          created_by_user_id: string | null;
          modified_by_user_id: string | null;
          modified_datetime_utc: string | null;
        };
        Insert: {
          id?: number;
          created_datetime_utc?: string;
          humor_flavor_id: number;
          llm_temperature?: number | null;
          order_by: number;
          llm_input_type_id?: number | null;
          llm_output_type_id?: number | null;
          llm_model_id?: number | null;
          humor_flavor_step_type_id?: number | null;
          llm_system_prompt?: string | null;
          llm_user_prompt?: string | null;
          description?: string | null;
          created_by_user_id?: string | null;
          modified_by_user_id?: string | null;
          modified_datetime_utc?: string | null;
        };
        Update: {
          id?: number;
          created_datetime_utc?: string;
          humor_flavor_id?: number;
          llm_temperature?: number | null;
          order_by?: number;
          llm_input_type_id?: number | null;
          llm_output_type_id?: number | null;
          llm_model_id?: number | null;
          humor_flavor_step_type_id?: number | null;
          llm_system_prompt?: string | null;
          llm_user_prompt?: string | null;
          description?: string | null;
          created_by_user_id?: string | null;
          modified_by_user_id?: string | null;
          modified_datetime_utc?: string | null;
        };
      };
    };
  };
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type HumorFlavorRow = Database["public"]["Tables"]["humor_flavors"]["Row"];
export type HumorFlavorInsert = Database["public"]["Tables"]["humor_flavors"]["Insert"];
export type HumorFlavorUpdate = Database["public"]["Tables"]["humor_flavors"]["Update"];
export type HumorFlavorStepRow = Database["public"]["Tables"]["humor_flavor_steps"]["Row"];
export type HumorFlavorStepInsert = Database["public"]["Tables"]["humor_flavor_steps"]["Insert"];
export type HumorFlavorStepUpdate = Database["public"]["Tables"]["humor_flavor_steps"]["Update"];
