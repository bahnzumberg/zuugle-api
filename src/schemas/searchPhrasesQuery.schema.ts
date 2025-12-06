import { z } from "zod";

export const searchPhrasesQuerySchema = z.object({
  search: z
    .string()
    .min(1, "no search term")
    .max(128, "search term is too long (max. 128 characters)"),

  city: z.string().optional(),
  language: z.string().optional(),

  tld: z
    .string()
    .length(2)
    .transform((v) => v.toUpperCase())
    .optional(),
});
