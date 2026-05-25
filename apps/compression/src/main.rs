use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tracing::{info, warn, error};
use uuid::Uuid;

mod compression;
mod neural;
mod metrics;
mod storage;

use compression::CompressionEngine;
use metrics::MetricsCollector;

#[derive(Clone)]
pub struct AppState {
    compression_engine: Arc<CompressionEngine>,
    metrics: Arc<MetricsCollector>,
    redis: Arc<redis::Client>,
}

#[derive(Serialize, Deserialize)]
pub struct CompressionJob {
    pub id: Uuid,
    pub input_path: String,
    pub output_path: String,
    pub preset: CompressionPreset,
    pub status: JobStatus,
    pub progress: f32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub error_message: Option<String>,
    pub metrics: Option<CompressionMetrics>,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum CompressionPreset {
    UltraHigh,    // Neural compression, highest quality
    High,         // H.265 with optimal settings
    Medium,       // H.264 balanced
    Preview,      // Fast preview generation
    Thumbnail,    // Thumbnail generation
}

#[derive(Serialize, Deserialize, Clone)]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

#[derive(Serialize, Deserialize)]
pub struct CompressionMetrics {
    pub original_size_bytes: u64,
    pub compressed_size_bytes: u64,
    pub compression_ratio: f32,
    pub processing_time_seconds: f32,
    pub quality_score: f32, // VMAF score
    pub bitrate_kbps: u32,
    pub width: u32,
    pub height: u32,
    pub fps: f32,
}

#[derive(Deserialize)]
pub struct CreateJobRequest {
    pub input_path: String,
    pub output_path: String,
    pub preset: CompressionPreset,
    pub callback_url: Option<String>,
}

#[derive(Deserialize)]
pub struct JobQuery {
    pub status: Option<JobStatus>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting Noah Compression Service...");

    // Initialize Redis connection
    let redis_client = redis::Client::open("redis://127.0.0.1:6379")?;
    
    // Initialize compression engine
    let compression_engine = Arc::new(CompressionEngine::new().await?);
    
    // Initialize metrics collector
    let metrics = Arc::new(MetricsCollector::new());

    let state = AppState {
        compression_engine,
        metrics,
        redis: Arc::new(redis_client),
    };

    // Build router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/metrics", get(metrics_handler))
        .route("/jobs", post(create_job))
        .route("/jobs", get(list_jobs))
        .route("/jobs/:id", get(get_job))
        .route("/jobs/:id/cancel", post(cancel_job))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Start server
    let listener = TcpListener::bind("0.0.0.0:8080").await?;
    info!("Noah Compression Service listening on http://0.0.0.0:8080");
    
    axum::serve(listener, app).await?;
    
    Ok(())
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "noah-compression",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now(),
    }))
}

async fn metrics_handler(State(state): State<AppState>) -> String {
    state.metrics.get_prometheus_metrics().await
}

async fn create_job(
    State(state): State<AppState>,
    Json(request): Json<CreateJobRequest>,
) -> Result<Json<CompressionJob>, StatusCode> {
    let job_id = Uuid::new_v4();
    
    let job = CompressionJob {
        id: job_id,
        input_path: request.input_path.clone(),
        output_path: request.output_path.clone(),
        preset: request.preset.clone(),
        status: JobStatus::Pending,
        progress: 0.0,
        created_at: chrono::Utc::now(),
        completed_at: None,
        error_message: None,
        metrics: None,
    };

    // Store job in Redis
    let job_json = serde_json::to_string(&job).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut conn = state.redis.get_connection().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    redis::cmd("SET")
        .arg(format!("job:{}", job_id))
        .arg(&job_json)
        .execute(&mut conn);

    // Queue job for processing
    let _result = state.compression_engine.queue_job(job.clone()).await;

    info!("Created compression job: {}", job_id);
    state.metrics.increment_jobs_created().await;

    Ok(Json(job))
}

async fn get_job(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<CompressionJob>, StatusCode> {
    let mut conn = state.redis.get_connection().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let job_json: String = redis::cmd("GET")
        .arg(format!("job:{}", job_id))
        .query(&mut conn)
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let job: CompressionJob = serde_json::from_str(&job_json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(job))
}

async fn list_jobs(
    State(state): State<AppState>,
    Query(params): Query<JobQuery>,
) -> Result<Json<Vec<CompressionJob>>, StatusCode> {
    let mut conn = state.redis.get_connection().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // Get all job keys
    let keys: Vec<String> = redis::cmd("KEYS")
        .arg("job:*")
        .query(&mut conn)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut jobs = Vec::new();
    
    for key in keys {
        if let Ok(job_json) = redis::cmd("GET").arg(&key).query::<String>(&mut conn) {
            if let Ok(job) = serde_json::from_str::<CompressionJob>(&job_json) {
                // Filter by status if specified
                if let Some(ref filter_status) = params.status {
                    if std::mem::discriminant(&job.status) != std::mem::discriminant(filter_status) {
                        continue;
                    }
                }
                jobs.push(job);
            }
        }
    }

    // Sort by creation time (newest first)
    jobs.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // Apply pagination
    let offset = params.offset.unwrap_or(0);
    let limit = params.limit.unwrap_or(50);
    let paginated_jobs: Vec<CompressionJob> = jobs
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();

    Ok(Json(paginated_jobs))
}

async fn cancel_job(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<CompressionJob>, StatusCode> {
    // Implementation for job cancellation
    warn!("Job cancellation requested for: {}", job_id);
    
    // For now, return a placeholder response
    Err(StatusCode::NOT_IMPLEMENTED)
}
