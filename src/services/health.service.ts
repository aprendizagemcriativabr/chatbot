type HealthResponse = {
  status: "ok";
  message: string;
  timestamp: string;
};

export class HealthService {
  getStatus(name?: string): HealthResponse {
    const message = name ? `API online, ${name}.` : "API online.";

    return {
      status: "ok",
      message,
      timestamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
