use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

pub struct MetricsCollector {
    jobs_created: AtomicU64,
    jobs_completed: AtomicU64,
    jobs_failed: AtomicU64,
    total_processing_time: AtomicU64,
    total_bytes_processed: AtomicU64,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            jobs_created: AtomicU64::new(0),
            jobs_completed: AtomicU64::new(0),
            jobs_failed: AtomicU64::new(0),
            total_processing_time: AtomicU64::new(0),
            total_bytes_processed: AtomicU64::new(0),
        }
    }

    pub async fn increment_jobs_created(&self) {
        self.jobs_created.fetch_add(1, Ordering::Relaxed);
    }

    pub async fn increment_jobs_completed(&self) {
        self.jobs_completed.fetch_add(1, Ordering::Relaxed);
    }

    pub async fn increment_jobs_failed(&self) {
        self.jobs_failed.fetch_add(1, Ordering::Relaxed);
    }

    pub async fn add_processing_time(&self, seconds: u64) {
        self.total_processing_time.fetch_add(seconds, Ordering::Relaxed);
    }

    pub async fn add_bytes_processed(&self, bytes: u64) {
        self.total_bytes_processed.fetch_add(bytes, Ordering::Relaxed);
    }

    pub async fn get_prometheus_metrics(&self) -> String {
        let jobs_created = self.jobs_created.load(Ordering::Relaxed);
        let jobs_completed = self.jobs_completed.load(Ordering::Relaxed);
        let jobs_failed = self.jobs_failed.load(Ordering::Relaxed);
        let processing_time = self.total_processing_time.load(Ordering::Relaxed);
        let bytes_processed = self.total_bytes_processed.load(Ordering::Relaxed);

        format!(
            r#"# HELP noah_compression_jobs_created_total Total number of compression jobs created
# TYPE noah_compression_jobs_created_total counter
noah_compression_jobs_created_total {}

# HELP noah_compression_jobs_completed_total Total number of compression jobs completed
# TYPE noah_compression_jobs_completed_total counter
noah_compression_jobs_completed_total {}

# HELP noah_compression_jobs_failed_total Total number of compression jobs failed
# TYPE noah_compression_jobs_failed_total counter
noah_compression_jobs_failed_total {}

# HELP noah_compression_processing_time_seconds_total Total processing time in seconds
# TYPE noah_compression_processing_time_seconds_total counter
noah_compression_processing_time_seconds_total {}

# HELP noah_compression_bytes_processed_total Total bytes processed
# TYPE noah_compression_bytes_processed_total counter
noah_compression_bytes_processed_total {}

# HELP noah_compression_jobs_pending Current number of pending jobs
# TYPE noah_compression_jobs_pending gauge
noah_compression_jobs_pending {}
"#,
            jobs_created,
            jobs_completed,
            jobs_failed,
            processing_time,
            bytes_processed,
            jobs_created.saturating_sub(jobs_completed).saturating_sub(jobs_failed)
        )
    }
}
