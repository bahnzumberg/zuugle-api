import { z } from "zod";

export const citiesQuerySchema = z.object({
  domain: z.string(),
});
