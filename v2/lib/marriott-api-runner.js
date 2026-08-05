const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 45000;
const SEARCH_ENDPOINT = 'https://www.marriott.com/mi/query/phoenixShopDatedSearchByDestinationQuery';
const SEARCH_OPERATION_NAME = 'phoenixShopDatedSearchByDestinationQuery';
const SEARCH_SIGNATURE = '19936acf228edb1a7c43b0b5e2102ef9cbe7e79c0f8fadd0d03bada15f4a6c25';
// A city search should be useful for an actual stay, not a 50-mile regional
// sweep. Ten miles keeps San Francisco searches centred on the city and makes
// large code comparisons substantially lighter.
const SEARCH_DISTANCE_METERS = 16093.4;
const PAGE_SIZE = 40;
// A code can return several property pages. Fetching every page serially was
// the largest avoidable delay in library-wide searches. Two at a time keeps
// the downstream pressure bounded while shortening each code's completion.
const PAGE_FETCH_CONCURRENCY = 2;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const SEARCH_SORT = {
  fields: [
    { field: 'DISTANCE', direction: 'ASC' },
    { field: 'CITY', direction: 'ASC' },
    { field: 'BRAND', direction: 'ASC' },
    { field: 'PROPERTY_NAME', direction: 'ASC' },
  ],
};
const SEARCH_FILTER = [
  'HOTEL_MARKETING_CAPTION',
  'RESORT_FEE_DESCRIPTION',
  'DESTINATION_FEE_DESCRIPTION',
  'TOURISM_MARKETING_FEE_DESCRIPTION',
  'SURCHARGE_ORDINANCE_COST_DESCRIPTION',
];
const SEARCH_FACETS = {
  terms: [
    { type: 'BRANDS', dimensions: [] },
    { type: 'AMENITIES', dimensions: [] },
    { type: 'PROPERTY_TYPES', dimensions: [] },
    { type: 'ACTIVITIES', dimensions: [] },
    { type: 'CITIES', dimensions: [] },
    { type: 'STATES', dimensions: [] },
    { type: 'COUNTRIES', dimensions: [] },
    { type: 'HOTEL_SERVICE_TYPES', dimensions: [] },
    { type: 'MEETINGS_EVENTS', dimensions: [] },
    { type: 'TRANSPORTATION_TYPES', dimensions: [] },
    { type: 'LEISURE_REGIONS', dimensions: [] },
  ],
  ranges: [
    { type: 'PRICE', dimensions: [], endpoints: ['0', '100', '200', 'overflow'] },
    { type: 'DISTANCE', dimensions: [], endpoints: ['0', '4830', '14520', '80470'] },
  ],
};
const SEARCH_QUERY = `query phoenixShopDatedSearchByDestinationQuery($search: SearchLowestAvailableRatesByDestinationInput!, $offset: Int, $limit: Int, $sort: SearchLowestAvailableRatesSort, $filter: [PropertyDescriptionType]) {
  search {
    lowestAvailableRates {
      searchByDestination(
        search: $search
        offset: $offset
        limit: $limit
        sort: $sort
      ) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          previousOffset
          currentOffset
          nextOffset
        }
        total
        edges {
          node {
            distance
            property {
              id
              basicInformation {
                isMax
                resort
                isAdultsOnly
                brand {
                  id
                  name
                  type
                  photos {
                    content {
                      alternateText
                      index
                      name
                      url
                    }
                    type {
                      code
                    }
                  }
                }
                name
                nameInDefaultLanguage
                descriptions(filter: $filter) {
                  text
                  type {
                    code
                    enumCode
                  }
                }
                currency
                isRecentlyRenovated
                isFullyRenovated
                hasRenovatedRooms
                ... on HotelBasicInformation {
                  newLobby
                }
                newProperty
                openingDate
                latitude
                longitude
                bookable
                hasUniquePropertyLogo
              }
              otherPropertyInformation {
                isAllInclusive
              }
              reviews {
                stars {
                  count
                }
                numberOfReviews {
                  count
                }
              }
              media {
                primaryImage {
                  edges {
                    node {
                      alternateDescription
                      title
                      imageUrls {
                        wideHorizontal
                        square
                        classicHorizontal
                      }
                    }
                  }
                }
              }
              ... on Hotel {
                seoNickname
              }
            }
            rates {
              rateModes {
                ... on SearchLowestAvailableRatesRateModesCashAndPoints {
                  cashAndPointsPerUnit {
                    amount {
                      amount
                      currency
                      decimalPoint
                    }
                    amountPlusMandatoryFees {
                      currency
                      amount
                      decimalPoint
                    }
                    fees {
                      amount
                      currency
                      decimalPoint
                    }
                    mandatoryFees {
                      currency
                      amount
                      decimalPoint
                    }
                    points
                    taxes {
                      currency
                      decimalPoint
                      amount
                      decimalPoint
                    }
                    totalAmount {
                      currency
                      amount
                      decimalPoint
                    }
                  }
                }
                ... on SearchLowestAvailableRatesRateModesCash {
                  lowestAverageRate {
                    amount {
                      amount
                      currency
                      decimalPoint
                    }
                    fees {
                      amount
                      currency
                      decimalPoint
                    }
                    taxes {
                      amount
                      currency
                      decimalPoint
                    }
                    totalAmount {
                      amount
                      currency
                      decimalPoint
                    }
                    amountPlusMandatoryFees {
                      amount
                      currency
                      decimalPoint
                    }
                    mandatoryFees {
                      amount
                      currency
                      decimalPoint
                    }
                  }
                }
                ... on SearchLowestAvailableRatesRateModesPoints {
                  pointsPerUnit {
                    points
                  }
                }
              }
              membersOnly
              lengthOfStay
              status {
                code
              }
              rateCategory {
                code
                value
              }
              sourceOfRate
            }
          }
        }
        searchCenter {
          latitude
          longitude
          name
          address
        }
        facets {
          type {
            code
            label
            count
            description
          }
          buckets {
            ... on SearchLowestAvailableRatesTermFacetBucket {
              code
              label
              description
              count
            }
            ... on SearchLowestAvailableRatesRangeFacetBucket {
              index
              start
              end
              count
            }
          }
        }
        status @contentError(options: {channel: "web"}) {
          ... on ResponseStatus {
            __typename
            code
            httpStatus
            errors {
              code
              devMessage
              message
            }
            warnings {
              code
              devMessage
              message
            }
          }
        }
        searchQueryId
        recipeId
      }
    }
  }
}`;

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function formatDateForUrl(dateStr) {
  const [year, month, day] = String(dateStr).split('-');
  return `${month}/${day}/${year}`;
}

function buildCacheKey(params) {
  const destination = `${params.city || ''}|${params.country || ''}`.toLowerCase();
  const dates = `${params.checkIn || ''}|${params.checkOut || ''}`;
  const codes = [...new Set((params.codes || []).map(normalizeCode))].sort().join(',');
  return `${destination}|${dates}|${codes}`;
}

function buildSearchUrl({ city, country, checkIn, checkOut, code }) {
  const fromDate = formatDateForUrl(checkIn);
  const toDate = formatDateForUrl(checkOut);
  const [inYear, inMonth, inDay] = checkIn.split('-').map(Number);
  const [outYear, outMonth, outDay] = checkOut.split('-').map(Number);
  const checkInDate = new Date(inYear, inMonth - 1, inDay);
  const checkOutDate = new Date(outYear, outMonth - 1, outDay);
  const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

  let url = `https://www.marriott.com/search/findHotels.mi?fromDate=${fromDate}&toDate=${toDate}&lengthOfStay=${nights}&destinationAddress.city=${encodeURIComponent(city)}`;
  if (country) {
    url += `&destinationAddress.country=${encodeURIComponent(country)}`;
  }
  if (code && code !== 'BASELINE') {
    url += `&clusterCode=corp&corporateCode=${encodeURIComponent(code)}`;
  }
  url += '&view=list&deviceType=desktop-web';
  return url;
}

function cloneValue(value) {
  return structuredClone(value);
}

function buildPayload(params, offset = 0) {
  const code = normalizeCode(params.code);
  return {
    operationName: SEARCH_OPERATION_NAME,
    variables: {
      search: {
        destination: [params.city, params.country].filter(Boolean).join(','),
        distance: SEARCH_DISTANCE_METERS,
        sooOptions: {
          weekType: 'WEEKDAY_AND_WEEKEND_STAY',
          rewardsLevel: 'ANONYMOUS',
          searchCity: params.city,
          searchCountry: params.country || '',
          deviceType: 'DESKTOP_WEB',
          searchDestinationType: 'OTHERS',
          sooModel: 'OUT_OF_SCOPE',
        },
        options: {
          startDate: params.checkIn,
          endDate: params.checkOut,
          includeMandatoryFees: true,
          numberInParty: 1,
          rateRequestTypes: code && code !== 'BASELINE' ? [{ type: 'CLUSTER', value: code }] : [],
          quantity: 1,
          customerId: '',
          // Request the detailed response so we can retain the returned
          // components, while comparing Marriott's advertised booking quote.
          includeTaxesAndFees: true,
          includeUnavailableProperties: true,
        },
        facets: cloneValue(SEARCH_FACETS),
      },
      offset,
      limit: PAGE_SIZE,
      sort: cloneValue(SEARCH_SORT),
      filter: cloneValue(SEARCH_FILTER),
    },
    query: SEARCH_QUERY,
  };
}

function buildHeaders(url) {
  return {
    'application-name': 'shop',
    'graphql-operation-name': SEARCH_OPERATION_NAME,
    'apollographql-client-version': 'v1',
    'apollographql-client-name': 'phoenix_shop',
    'graphql-require-safelisting': 'true',
    'graphql-operation-signature': SEARCH_SIGNATURE,
    accept: '*/*',
    'accept-language': 'en-US',
    'content-type': 'application/json',
    origin: 'https://www.marriott.com',
    referer: url,
    'user-agent': DEFAULT_USER_AGENT,
  };
}

function toDisplayPrice(amount) {
  if (!amount || amount.amount === undefined || amount.amount === null) {
    return null;
  }
  const decimalPoint = Number(amount.decimalPoint || 0);
  const scale = 10 ** decimalPoint;
  return Math.round((Number(amount.amount) / scale) * 100) / 100;
}

function extractRateInfo(rates, params = {}) {
  if (!Array.isArray(rates) || rates.length === 0) {
    return {
      price: 'N/A',
      currency: null,
      totalPrice: 'N/A',
      taxes: null,
      fees: null,
    };
  }

  const withAmount = rates.find((rate) => {
    const rateModes = rate?.rateModes || {};
    return Boolean(
      rateModes.lowestAverageRate?.totalAmount ||
        rateModes.cashAndPointsPerUnit?.totalAmount
    );
  }) || rates[0];

  const rateModes = withAmount?.rateModes || {};
  const details = rateModes.lowestAverageRate || rateModes.cashAndPointsPerUnit || {};
  // Marriott presents `amount` as its advertised average nightly booking quote.
  // `totalAmount` is a separate tax/fee-expanded amount, and using it here made
  // our comparison disagree with Marriott's own rate card. Keep the quoted rate
  // as the comparable price; checkout remains the source of truth for taxes.
  const quotedNightlyAmount = details.amount || details.amountPlusMandatoryFees;
  const quotedNightlyRate = toDisplayPrice(quotedNightlyAmount);
  const nights = Math.max(1, Math.round((new Date(`${params.checkOut}T12:00:00`) - new Date(`${params.checkIn}T12:00:00`)) / 86400000) || 1);
  return {
    price: quotedNightlyRate === null ? 'N/A' : quotedNightlyRate,
    currency: quotedNightlyAmount?.currency || null,
    totalPrice: quotedNightlyRate === null ? 'N/A' : Math.round(quotedNightlyRate * nights * 100) / 100,
    // Preserve returned components for diagnostics without implying they are
    // included in the displayed booking quote.
    taxes: toDisplayPrice(details.taxes),
    fees: toDisplayPrice(details.fees),
  };
}

function toAbsoluteImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `https://cache.marriott.com${url}`;
  return url;
}

function formatDistance(distanceMeters) {
  if (distanceMeters === undefined || distanceMeters === null) {
    return '';
  }
  const miles = Number(distanceMeters) / 1609.344;
  const rounded = Math.round(miles * 10) / 10;
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display} mi from destination`;
}

function extractDescription(descriptions) {
  if (!Array.isArray(descriptions)) return '';
  const marketingCaption = descriptions.find(
    (description) => description?.type?.enumCode === 'HOTEL_MARKETING_CAPTION'
  );
  return marketingCaption?.text || '';
}

function parseHotelNode(node, params) {
  const property = node?.property || {};
  const basic = property.basicInformation || {};
  const imageNode = property.media?.primaryImage?.edges?.[0]?.node;
  const imageUrl =
    imageNode?.imageUrls?.wideHorizontal ||
    imageNode?.imageUrls?.classicHorizontal ||
    imageNode?.imageUrls?.square ||
    '';
  const rateInfo = extractRateInfo(node?.rates, params);

  return {
    propertyId: property.id || '',
    name: basic.name || '',
    price: rateInfo.price,
    currency: rateInfo.currency || basic.currency || null,
    totalPrice: rateInfo.totalPrice,
    taxes: rateInfo.taxes,
    fees: rateInfo.fees,
    rating: property.reviews?.stars?.count ?? null,
    reviewCount: property.reviews?.numberOfReviews?.count ?? null,
    distanceMeters: node?.distance === null || node?.distance === undefined ? null : Number(node.distance),
    distance: formatDistance(node?.distance),
    description: extractDescription(basic.descriptions),
    imageUrl: toAbsoluteImageUrl(imageUrl),
    brandName: basic.brand?.name || '',
    latitude: basic.latitude === null || basic.latitude === undefined ? null : Number(basic.latitude),
    longitude: basic.longitude === null || basic.longitude === undefined ? null : Number(basic.longitude),
    seoNickname: property.seoNickname || '',
    locationSource: 'marriott',
    locationLabel: '',
  };
}

function normalizeRemoteError(error) {
  const message = String(error?.message || error || 'UNKNOWN_ERROR');
  const lowered = message.toLowerCase();
  const status = Number(error?.status || 0);

  if (status === 403 || status === 429) return 'ACCESS_DENIED';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (lowered.includes('access') && lowered.includes('denied')) return 'ACCESS_DENIED';
  if (lowered.includes('forbidden')) return 'ACCESS_DENIED';
  if (lowered.includes('timeout')) return 'TIMEOUT';
  if (lowered.includes('fetch failed') || lowered.includes('network')) return 'NETWORK_ERROR';
  return message;
}

function extractPayloadError(payload) {
  const errors = payload?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors[0]?.message || 'GRAPHQL_ERROR';
  }

  const status = payload?.data?.search?.lowestAvailableRates?.searchByDestination?.status;
  if (!Array.isArray(status)) {
    return null;
  }

  const failedStatus = status.find((entry) => entry?.code && entry.code !== 'SUCCESS');
  if (!failedStatus) {
    return null;
  }

  const errorMessage =
    failedStatus.errors?.find((entry) => entry?.message)?.message ||
    failedStatus.errors?.find((entry) => entry?.devMessage)?.devMessage;

  return errorMessage || failedStatus.code || 'REMOTE_ERROR';
}

async function fetchSearchPage(params, url, offset) {
  const payload = buildPayload(params, offset);
  const response = await fetch(SEARCH_ENDPOINT, {
    method: 'POST',
    headers: buildHeaders(url),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const text = await response.text();
  let payloadData = {};
  try {
    payloadData = JSON.parse(text);
  } catch (error) {
    const parseError = new Error(response.ok ? 'INVALID_RESPONSE' : `HTTP_${response.status}`);
    parseError.status = response.status;
    throw parseError;
  }

  if (!response.ok) {
    const remoteError = new Error(extractPayloadError(payloadData) || `HTTP_${response.status}`);
    remoteError.status = response.status;
    throw remoteError;
  }

  return payloadData;
}

async function fetchAllHotelsForCode(params) {
  const url = buildSearchUrl(params);
  const byName = new Map();
  const firstPayload = await fetchSearchPage(params, url, 0);
  const firstConnection = firstPayload?.data?.search?.lowestAvailableRates?.searchByDestination;
  if (!firstConnection) {
    return {
      success: false,
      error: extractPayloadError(firstPayload) || 'UNEXPECTED_RESPONSE',
      hotels: [],
      url,
    };
  }

  const addHotels = (connection) => {
    const pageHotels = Array.isArray(connection?.edges)
      ? connection.edges.map((edge) => parseHotelNode(edge?.node, params)).filter((hotel) => hotel.name)
      : [];
    for (const hotel of pageHotels) byName.set(hotel.propertyId || hotel.name, hotel);
  };

  addHotels(firstConnection);
  const total = Number(firstConnection.total || 0);
  const firstPageInfo = firstConnection.pageInfo || {};
  const firstNextOffset = Number(firstPageInfo.nextOffset);

  // Marriott exposes the total after page one, allowing the remaining offsets
  // to be fetched in controlled pairs instead of waiting page-by-page.
  if (firstPageInfo.hasNextPage && Number.isFinite(firstNextOffset)) {
    const offsets = [];
    for (let offset = firstNextOffset; offset < total && offsets.length < 9; offset += PAGE_SIZE) offsets.push(offset);
    for (let index = 0; index < offsets.length; index += PAGE_FETCH_CONCURRENCY) {
      const payloads = await Promise.all(offsets.slice(index, index + PAGE_FETCH_CONCURRENCY)
        .map((offset) => fetchSearchPage(params, url, offset)));
      for (const payload of payloads) {
        const connection = payload?.data?.search?.lowestAvailableRates?.searchByDestination;
        if (!connection) {
          return {
            success: false,
            error: extractPayloadError(payload) || 'UNEXPECTED_RESPONSE',
            hotels: [],
            url,
          };
        }
        addHotels(connection);
      }
    }
  }

  if (total === 0) {
    return {
      success: true,
      error: 'NO_RESULTS',
      hotels: [],
      url,
    };
  }

  return {
    success: true,
    error: null,
    hotels: [...byName.values()],
    url,
  };
}

class MarriottApiRunner {
  constructor({ debug = false, concurrency = DEFAULT_CONCURRENCY } = {}) {
    this.debug = Boolean(debug);
    this.concurrency = Math.max(1, Math.min(concurrency, DEFAULT_CONCURRENCY));
  }

  async runSearch(params, { onProgress } = {}) {
    const codes = Array.from(new Set((params.codes || []).map(normalizeCode).filter(Boolean)));
    if (codes.length === 0) {
      throw new Error('No codes provided');
    }

    const results = new Array(codes.length);
    let currentIndex = 0;

    const worker = async () => {
      while (true) {
        const nextIndex = currentIndex;
        currentIndex += 1;
        if (nextIndex >= codes.length) return;

        const code = codes[nextIndex];
        const result = await this.searchSingleCode({
          ...params,
          code,
        });
        results[nextIndex] = result;
        if (onProgress) {
          onProgress(result);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, codes.length) }, () => worker())
    );

    return results;
  }

  async searchSingleCode(params) {
    const code = normalizeCode(params.code);
    const url = buildSearchUrl(params);

    try {
      const response = await fetchAllHotelsForCode(params);
      return {
        code,
        success: response.success,
        error: response.error,
        hotels: response.hotels,
        url: response.url || url,
      };
    } catch (error) {
      return {
        code,
        success: false,
        error: normalizeRemoteError(error),
        hotels: [],
        url,
      };
    }
  }
}

module.exports = {
  MarriottApiRunner,
  buildCacheKey,
  buildSearchUrl,
  extractRateInfo,
  normalizeCode,
};
