import type { DashboardData, Metrics } from "./types";

export type InferenceResult = {
  model_id: string;
  asset_id: string;
  frame_id: string;
  status: string;
  label: string | null;
  reason: string | null;
  processed_at: string;
  inference_ms: number;
  scores: Record<string, number>;
  scores_are_calibrated: boolean;
  detections: { label: string; score: number; box_xyxy: number[] }[];
  requires_review: boolean;
  quality_status: string;
  value: number | null;
  temperature_c: number | null;
  hazard_severity: string | null;
};

export type SavedDetection = {
  id: string;
  asset_id: string;
  mission_id: string | null;
  model_id: string;
  processed_at: string;
  status: string;
  label: string | null;
  review_status: "pending" | "confirmed" | "dismissed";
  notes: string;
  result: InferenceResult;
};

export type ModelSummary = {
  total_detections: number;
  review_status_counts: Record<string, number>;
  models: {
    model_id: string;
    total_detections: number;
    review_status_counts: Record<string, number>;
    model: {
      endpoint: string;
      scope: string;
      quality_status: string;
      modality: string;
    } | null;
  }[];
};

export type SummaryData = DashboardData & {
  metrics: Metrics & {
    failures_by_location: {
      location_id: string;
      location_name: string;
      failed_actions: number;
    }[];
  };
  assets: {
    asset_id: string;
    asset_name: string;
    asset_type: string;
    location_id: string;
    criticality: string;
  }[];
  locations: { location_id: string; location_name: string }[];
  readings: {
    reading_id: string;
    measurement_type: string;
    unit: string;
    timestamp: string;
  }[];
  detections: SavedDetection[];
  model_summary: ModelSummary;
  record_counts: {
    replays: number;
    replay_events: number;
    import_reports: number;
    lidar_scans: number;
  };
};
