import { z } from "zod";

const citySchema = z
  .string()
  .transform((v) => (v === "no-city" ? undefined : v))
  .optional();

const boundsSchema = z
  .object({
    _southWest: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    _northEast: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  })
  .optional()
  .transform((bounds) =>
    bounds
      ? {
          north: bounds._northEast.lat,
          south: bounds._southWest.lat,
          west: bounds._southWest.lng,
          east: bounds._northEast.lng,
        }
      : undefined,
  );

export type Bounds = z.infer<typeof boundsSchema>;

const filterSchema = z
  .object({
    singleDayTour: z.boolean(),
    multipleDayTour: z.boolean(),
    summerSeason: z.boolean(),
    winterSeason: z.boolean(),
    traverse: z.boolean(),
    minAscent: z.number(),
    maxAscent: z.number(),
    minDescent: z.number(),
    maxDescent: z.number(),
    minTransportDuration: z.number(),
    maxTransportDuration: z.number(),
    minDistance: z.number(),
    maxDistance: z.number(),
    ranges: z.array(z.string()),
    types: z.array(z.string()),
    languages: z.array(z.string()),
    difficulties: z.array(z.number()),
    providers: z.array(z.string()),
  })
  .partial();

export type ToursFilter = z.infer<typeof filterSchema>;

const poiSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  radius: z.number().optional(),
});

export type LatLngPOI = z.infer<typeof poiSchema>;

export const providerQuerySchema = z.object({
  provider: z.string(),
});

export const totalQuerySchema = z.object({
  city: z.string().optional(),
});

export const tourDetailsParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  city: citySchema,
});

export const tourDetailsQuerySchema = z.object({
  city: citySchema,
  domain: z.string(),
});

export const connectionsExtendedParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  city: citySchema,
});

export const connectionsExtendedQuerySchema = z.object({
  city: citySchema,
  domain: z.string(),
});

export const toursQuerySchema = z.object({
  showRanges: z.boolean().optional(),
  page: z.coerce.number().int().default(1),
  map: z.boolean().optional(),
  bounds: boundsSchema.optional(),
  search: z.string().optional(),
  currLanguage: z.string().default("de"),
  city: z.string().optional(),
  range: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  type: z.string().optional(),
  domain: z.string(),
  provider: z.string().optional(),
  filter: filterSchema.optional(),
  poi: poiSchema.optional(),
});

export const filterQuerySchema = z.object({
  search: z.string().optional(),
  city: citySchema,
  domain: z.string(),
  currLanguage: z.string().default("de"),
});
