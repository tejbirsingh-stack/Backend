export class MetricsCollector {
  constructor() {
    this.metrics = {
      httpRequests: 0,
      errors: {},
      responseTime: {
        sum: 0,
        count: 0,
      },
    };
  }

  recordHttpRequest(method, url, statusCode, responseTime) {
    this.metrics.httpRequests++;
    this.metrics.responseTime.sum += responseTime;
    this.metrics.responseTime.count++;
  }

  recordError(errorType) {
    if (!this.metrics.errors[errorType]) {
      this.metrics.errors[errorType] = 0;
    }
    this.metrics.errors[errorType]++;
  }

  async getMetrics() {
    const avgResponseTime =
      this.metrics.responseTime.count > 0
        ? this.metrics.responseTime.sum / this.metrics.responseTime.count
        : 0;

    let metricsText = `# HELP noah_http_requests_total Total number of HTTP requests\n`;
    metricsText += `# TYPE noah_http_requests_total counter\n`;
    metricsText += `noah_http_requests_total ${this.metrics.httpRequests}\n`;

    metricsText += `# HELP noah_response_time_ms Average response time in milliseconds\n`;
    metricsText += `# TYPE noah_response_time_ms gauge\n`;
    metricsText += `noah_response_time_ms ${avgResponseTime.toFixed(2)}\n`;

    metricsText += `# HELP noah_errors_total Total number of errors by type\n`;
    metricsText += `# TYPE noah_errors_total counter\n`;

    Object.entries(this.metrics.errors).forEach(([errorType, count]) => {
      metricsText += `noah_errors_total{type="${errorType}"} ${count}\n`;
    });

    return metricsText;
  }
}
