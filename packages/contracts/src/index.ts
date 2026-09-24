import { z } from 'zod';

export const dataSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(80).default('本地演示 MySQL'),
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  database: z.string().trim().min(1).max(64),
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(512),
});

export const dataSourceUpdateSchema = dataSourceInputSchema.extend({
  password: z.string().min(1).max(512).optional(),
});

export const createResourceInputSchema = z.object({
  dataSourceId: z.string().uuid(),
  tableName: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(80),
});

export type DataSourceInput = z.infer<typeof dataSourceInputSchema>;
export type DataSourceUpdate = z.infer<typeof dataSourceUpdateSchema>;
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;

export type DataSourceSummary = {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  passwordConfigured: boolean;
  passwordMasked: string;
  status: 'ready';
  lastTestedAt: string;
};

export type ApiError = { error: { code: string; message: string } };
