export class MetricsCollector {
  private httpRequestDurations: Map<string, number[]> = new Map();
  private httpRequestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private activeConnections = 0;

  recordHttpRequest(method: string, path: string, statusCode: number, duration: number): void {
    const key = `${method}:${this.sanitizePath(path)}:${Math.floor(statusCode / 100)}xx`;
    
    // Record duration
    if (!this.httpRequestDurations.has(key)) {
      this.httpRequestDurations.set(key, []);
    }
    this.httpRequestDurations.get(key)!.push(duration);
    
    // Record count
    const countKey = `http_requests_total{method="${method}",path="${this.sanitizePath(path)}",status="${statusCode}"}`;
    this.httpRequestCounts.set(countKey, (this.httpRequestCounts.get(countKey) || 0) + 1);
  }

  recordError(errorType: string): void {
    const key = `errors_total{type="${errorType}"}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
  }

  incrementActiveConnections(): void {
    this.activeConnections++;
  }

  decrementActiveConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  private sanitizePath(path: string): string {
    // Replace UUIDs and numeric IDs with placeholders
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\?.*/, ''); // Remove query parameters
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  async getMetrics(): Promise<string> {
    const metrics: string[] = [];
    
    // HTTP request counts
    for (const [key, value] of this.httpRequestCounts) {
      metrics.push(`${key} ${value}`);
    }
    
    // HTTP request durations
    for (const [key, durations] of this.httpRequestDurations) {
      const [method, path, status] = key.split(':');
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const p95 = this.calculatePercentile(durations, 95);
      const p99 = this.calculatePercentile(durations, 99);
      
      metrics.push(`http_request_duration_ms{method="${method}",path="${path}",status="${status}",quantile="0.5"} ${avg}`);
      metrics.push(`http_request_duration_ms{method="${method}",path="${path}",status="${status}",quantile="0.95"} ${p95}`);
      metrics.push(`http_request_duration_ms{method="${method}",path="${path}",status="${status}",quantile="0.99"} ${p99}`);
    }
    
    // Error counts
    for (const [key, value] of this.errorCounts) {
      metrics.push(`${key} ${value}`);
    }
    
    // Active connections
    metrics.push(`active_connections ${this.activeConnections}`);
    
    // Node.js process metrics
    const memUsage = process.memoryUsage();
    metrics.push(`process_memory_rss_bytes ${memUsage.rss}`);
    metrics.push(`process_memory_heap_used_bytes ${memUsage.heapUsed}`);
    metrics.push(`process_memory_heap_total_bytes ${memUsage.heapTotal}`);
    metrics.push(`process_memory_external_bytes ${memUsage.external}`);
    
    // Process uptime
    metrics.push(`process_uptime_seconds ${process.uptime()}`);
    
    return metrics.join('\n') + '\n';
  }

  reset(): void {
    this.httpRequestDurations.clear();
    this.httpRequestCounts.clear();
    this.errorCounts.clear();
    this.activeConnections = 0;
  }
}
