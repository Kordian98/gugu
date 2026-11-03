export declare const E2E: {
  apiPort: number;
  webPort: number;
  pg: { host: string; port: number; user: string; password: string; database: string };
  redisDb: number;
  redisPort: number;
  mailpit: string;
  smtpPort: number;
  mailDomain: string;
};
export declare const apiUrl: string;
export declare const webUrl: string;
export declare const databaseUrl: string;
export declare const redisUrl: string;
export declare function assertIsolated(): void;
export declare function backendEnv(): Record<string, string | undefined>;
