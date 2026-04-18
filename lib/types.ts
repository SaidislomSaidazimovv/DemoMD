// Shared types for the Tasdiq demo.
// Mirrors the Core Platform Spec table shapes so the mock DB looks real.

// All roles declared in `schema.sql` `users.role` check constraint.
// NOT every role has an assignment path in the current app:
//   - Active (code assigns them): admin, inspector, bank_officer, supervisor,
//     hr_admin, manager, responder.
//   - Reserved (schema-only, no assignment path yet): owner, member, viewer.
//     Kept in the type union so `schema.sql` and TypeScript don't drift. A
//     future feature (org ownership transfer, public-viewer role) will wire
//     them — when that lands, update this comment.
export type UserRole =
  // Core roles
  | "owner"
  | "admin"
  | "member"
  | "viewer"
  // Tasdiq-specific
  | "inspector"
  | "bank_officer"
  | "supervisor"
  // Butterfly-specific
  | "hr_admin"
  | "manager"
  | "responder";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  product: "tasdiq" | "butterfly";
  settings: Record<string, unknown>;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  accepted_at: string | null; // null = invited but not yet activated
}

export interface AuthUser {
  id: string;
  email: string;
  password: string; // plaintext — demo only
  full_name: string;
  role: UserRole;
  org_id: string;
}

export interface Session {
  access_token: string;
  expires_at: number;
  user: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    org_id: string;
  };
}

export type WorkflowState =
  // Tasdiq — tranche_verification
  | "DRAFT"
  | "EVIDENCE_REQUESTED"
  | "CAPTURED"
  | "AUTO_VERIFIED"
  | "FLAGGED"
  | "APPROVED"
  | "REJECTED"
  | "EXPORTED"
  | "BANK_ACCEPTED"
  | "BANK_REJECTED"
  // Butterfly — protocol_deployment
  | "SETUP"
  | "TRAINING_SCHEDULED"
  | "TRAINING_ACTIVE"
  | "DEPLOYED"
  | "ACTIVE"
  | "REPORTING"
  // Butterfly — training_completion
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CERTIFIED";

export interface Workflow {
  id: string;
  org_id: string;
  type: "tranche_verification";
  reference_id: string;
  reference_label: string;
  current_state: WorkflowState;
  meta: WorkflowMeta;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface WorkflowMeta {
  developer_name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  geofence_radius_meters: number;
  milestone_description: string;
  total_tranches: number;
  current_tranche: number;
  loan_amount: number;
  loan_currency: string;
  expected_completion: string;
  challenge_code: string;
  challenge_issued_at: string;
}

export interface WorkflowTransition {
  id: string;
  type: string;
  from_state: WorkflowState;
  to_state: WorkflowState;
  required_role: UserRole[];
}

export interface LedgerEvent {
  id: string;
  org_id: string;
  workflow_id: string | null;
  event_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  prev_hash: string | null;
  hash: string;
  created_at: string;
}

export interface Media {
  id: string;
  org_id: string;
  workflow_id: string;
  storage_path: string;
  file_type: "photo" | "video";
  sha256: string;
  phash: string;
  meta: MediaMeta;
  uploaded_by: string;
  created_at: string;
}

export interface MediaMeta {
  capture_session_id: string;
  gps: { lat: number; lng: number; accuracy: number };
  inside_geofence: boolean;
  motion_samples_count: number;
  motion_variance: number;
  lighting_variance: number;
  sensor_camera_correlation: number;
  data_url?: string; // base64 thumbnail — for synthetic demo captures
  thumbnail_emoji?: string;
  device_info: {
    user_agent: string;
    platform: string;
    screen: { width: number; height: number };
  };
  fraud_result: FraudResult;
  source: "real" | "fraud" | "seed";
  // Optional extensions written by the real capture pipeline:
  gyro_samples_count?: number;
  gyro_variance?: number;
  video_storage_path?: string;
  video_mime_type?: string;
  video_bytes?: number;
  // Optical-flow proxy (Point 2): N dHashes sampled during the 15s recording,
  // and the mean Hamming distance between consecutive pairs. Higher distance
  // = more scene change = less likely a static screen replay.
  frame_dhashes?: string[];
  frame_change_avg?: number;
  // AI Narrator (AI_INTEGRATION_SPEC.md): Claude-authored plain-English
  // explanation of why a capture was flagged. Written by /api/ai/narrate-flag.
  ai_narration?: string;
  ai_narration_model?: string;
  ai_narration_at?: string;
  // AI Progress Classifier (Layer 6): lightweight semantic verdict on whether
  // the photo matches the claimed milestone. Written by /api/media/upload.
  ai_progress?: {
    verdict: "YES" | "NO" | "UNCLEAR";
    visible: string;
    reasoning: string;
    score: number;
    passed: boolean;
  };
}

export interface FraudCheck {
  name: "geofence" | "motion" | "screen_replay" | "duplicate" | "challenge";
  label: string;
  passed: boolean;
  score: number;
  weight: number;
  details: string;
}

export interface FraudResult {
  checks: FraudCheck[];
  aggregate_score: number;
  verdict: "VERIFIED" | "FLAGGED";
}

export interface ExportPack {
  id: string;
  org_id: string;
  workflow_id: string;
  pack_type: "tranche_pack";
  storage_path: string;
  manifest_hash: string;
  generated_by: string;
  created_at: string;
}
