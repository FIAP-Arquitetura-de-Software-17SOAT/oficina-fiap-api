export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type BrunoAuth = {
  bearerTokenVar: string;
};

export type BrunoScript = string[];

export type SmokeStep = {
  sequence: number;
  slug: string;
  name: string;
  method: HttpMethod;
  url: string;
  tags?: string[];
  auth?: BrunoAuth;
  headers?: Record<string, string>;
  body?: unknown;
  preRequest?: BrunoScript;
  tests?: BrunoScript;
};

export type SmokeCollection = {
  name: string;
  folder: string;
  environmentName: string;
  steps: SmokeStep[];
};
