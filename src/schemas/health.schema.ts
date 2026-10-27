import { z } from "zod";

export const healthQuerySchema = z.object({
  name: z.string().min(1).optional(),
});

export type HealthQuery = z.infer<typeof healthQuerySchema>;
