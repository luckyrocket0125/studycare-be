interface Metrics {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<number, number>;
  };
  responseTime: {
    average: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  activeConnections: number;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

class MetricsCollector {
  private startTime: number = Date.now();
  private requests: number = 0;
  private requestsByMethod: Record<string, number> = {};
  private requestsByStatus: Record<number, number> = {};
  private responseTimes: number[] = [];
  private errors: number = 0;
  private errorsByType: Record<string, number> = {};
  private activeConnections: number = 0;

  recordRequest(method: string, statusCode: number, duration: number): void {
    this.requests++;
    this.requestsByMethod[method] = (this.requestsByMethod[method] || 0) + 1;
    this.requestsByStatus[statusCode] = (this.requestsByStatus[statusCode] || 0) + 1;
    this.responseTimes.push(duration);
    
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
  }

  recordError(errorType: string): void {
    this.errors++;
    this.errorsByType[errorType] = (this.errorsByType[errorType] || 0) + 1;
  }

  incrementConnections(): void {
    this.activeConnections++;
  }

  decrementConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  getMetrics(): Metrics {
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);

    const memoryUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    const usedMemory = memoryUsage.heapUsed;

    return {
      requests: {
        total: this.requests,
        byMethod: { ...this.requestsByMethod },
        byStatus: { ...this.requestsByStatus },
      },
      responseTime: {
        average: sortedTimes.length > 0
          ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length
          : 0,
        min: sortedTimes.length > 0 ? sortedTimes[0] : 0,
        max: sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0,
        p95: sortedTimes.length > 0 ? sortedTimes[p95Index] : 0,
        p99: sortedTimes.length > 0 ? sortedTimes[p99Index] : 0,
      },
      errors: {
        total: this.errors,
        byType: { ...this.errorsByType },
      },
      activeConnections: this.activeConnections,
      uptime: Date.now() - this.startTime,
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: (usedMemory / totalMemory) * 100,
      },
    };
  }

  reset(): void {
    this.requests = 0;
    this.requestsByMethod = {};
    this.requestsByStatus = {};
    this.responseTimes = [];
    this.errors = 0;
    this.errorsByType = {};
    this.startTime = Date.now();
  }
}

export const metrics = new MetricsCollector();

export const metricsMiddleware = (req: any, res: any, next: any) => {
  const start = Date.now();
  metrics.incrementConnections();

  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.recordRequest(req.method, res.statusCode, duration);
    metrics.decrementConnections();
  });

  next();
};

