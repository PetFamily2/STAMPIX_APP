import { paginationOptsValidator } from 'convex/server';
import { type Infer, v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalQuery, query } from './_generated/server';
import { normalizeGooglePlacesLimiterError } from './googlePlacesRateLimits';
import {
  getCurrentUserOrNull,
  isBusinessPermanentDeletionInProgress,
  requireCurrentUser,
} from './guards';
import {
  normalizeDiscoveryQuery,
  parseDiscoveryPlaces,
  validateDiscoveryLocation,
  withinDiscoveryRadius,
} from './lib/discoveryWeb';

const partnerValidator = v.object({
  businessId: v.id('businesses'),
  name: v.string(),
  address: v.string(),
  description: v.string(),
  placeId: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
});
const placeValidator = v.object({
  placeId: v.string(),
  name: v.string(),
  address: v.string(),
  lat: v.number(),
  lng: v.number(),
  attributions: v.array(v.object({ provider: v.string(), uri: v.string() })),
});
const searchResultValidator = v.object({
  places: v.array(placeValidator),
  partners: v.array(partnerValidator),
  nextPageToken: v.union(v.string(), v.null()),
});
const locationValidator = v.object({
  lat: v.number(),
  lng: v.number(),
  radius: v.number(),
});

export const activeViewer = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await getCurrentUserOrNull(ctx))?.isActive === true,
});

export const partners = query({
  args: {
    term: v.string(),
    paginationOpts: paginationOptsValidator,
    location: v.optional(locationValidator),
  },
  returns: v.object({
    page: v.array(partnerValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const viewer = await requireCurrentUser(ctx);
    if (!viewer.isActive) {
      throw new Error('NOT_AUTHENTICATED');
    }
    const term = normalizeDiscoveryQuery(args.term);
    const location = validateDiscoveryLocation(args.location);
    const opts = {
      ...args.paginationOpts,
      numItems: Math.min(30, Math.max(1, args.paginationOpts.numItems)),
    };
    const page = term
      ? await ctx.db
          .query('businesses')
          .withSearchIndex('search_public_name', (q) =>
            q.search('name', term).eq('isActive', true)
          )
          .paginate(opts)
      : await ctx.db
          .query('businesses')
          .withIndex('by_isActive', (q) => q.eq('isActive', true))
          .order('desc')
          .paginate(opts);
    return {
      page: page.page
        .filter(
          (business) =>
            !isBusinessPermanentDeletionInProgress(business) &&
            (!location ||
              (business.location &&
                withinDiscoveryRadius(business.location, location)))
        )
        .map((business) => ({
          businessId: business._id,
          name: business.name,
          address:
            business.formattedAddress ??
            [business.city, business.street, business.streetNumber]
              .filter(Boolean)
              .join(' '),
          description: business.shortDescription ?? '',
          placeId: business.placeId ?? null,
          logoUrl: business.logoUrl ?? null,
        })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const partnersByPlaceIds = internalQuery({
  args: { placeIds: v.array(v.string()) },
  returns: v.array(partnerValidator),
  handler: async (ctx, args) => {
    if (args.placeIds.length > 20) {
      throw new Error('DISCOVERY_BATCH_TOO_LARGE');
    }
    const rows = await Promise.all(
      args.placeIds.map((placeId) =>
        ctx.db
          .query('businesses')
          .withIndex('by_placeId', (q) => q.eq('placeId', placeId))
          .take(5)
      )
    );
    return rows
      .flat()
      .filter(
        (business) =>
          business.isActive && !isBusinessPermanentDeletionInProgress(business)
      )
      .map((business) => ({
        businessId: business._id,
        name: business.name,
        address: business.formattedAddress ?? '',
        description: business.shortDescription ?? '',
        placeId: business.placeId ?? null,
        logoUrl: business.logoUrl ?? null,
      }));
  },
});

export const searchPlaces = action({
  args: {
    term: v.string(),
    pageToken: v.optional(v.string()),
    location: v.optional(locationValidator),
  },
  returns: searchResultValidator,
  handler: async (ctx, args): Promise<Infer<typeof searchResultValidator>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (
      !identity ||
      !(await ctx.runQuery(internal.discoveryWeb.activeViewer, {}))
    ) {
      throw new Error('NOT_AUTHENTICATED');
    }
    const term = normalizeDiscoveryQuery(args.term);
    const location = validateDiscoveryLocation(args.location);
    if (term.length < 2 || (args.pageToken?.length ?? 0) > 2048) {
      throw new Error('DISCOVERY_QUERY_INVALID');
    }
    const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!key) {
      throw new Error('PLACES_CONFIGURATION_MISSING');
    }
    try {
      await ctx.runMutation(internal.googlePlacesRateLimits.consume, {
        operation: 'discoverySearch',
        userKey: identity.subject.split('|')[0],
      });
    } catch (error) {
      throw normalizeGooglePlacesLimiterError(error);
    }
    let response: Response;
    try {
      response = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents,places.businessStatus,places.attributions,nextPageToken',
          },
          body: JSON.stringify({
            textQuery: location ? term : `${term} ישראל`,
            languageCode: 'he',
            regionCode: 'IL',
            pageSize: 20,
            ...(location
              ? {
                  locationBias: {
                    circle: {
                      center: {
                        latitude: location.lat,
                        longitude: location.lng,
                      },
                      radius: location.radius,
                    },
                  },
                }
              : {}),
            ...(args.pageToken ? { pageToken: args.pageToken } : {}),
          }),
        }
      );
    } catch {
      throw new Error('PLACES_SERVICE_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new Error('PLACES_SERVICE_UNAVAILABLE');
    }
    let parsed: ReturnType<typeof parseDiscoveryPlaces>;
    try {
      parsed = parseDiscoveryPlaces(await response.json());
    } catch {
      throw new Error('PLACES_SERVICE_UNAVAILABLE');
    }
    if (location) {
      parsed.places = parsed.places.filter((place) =>
        withinDiscoveryRadius(place, location)
      );
    }
    const partners = await ctx.runQuery(
      internal.discoveryWeb.partnersByPlaceIds,
      { placeIds: parsed.places.map((place) => place.placeId) }
    );
    return { ...parsed, partners };
  },
});
