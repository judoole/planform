import type { Box, Point } from "./model";
import {
  maxLatitude,
  projectLocation,
  type Location,
  type Parcel,
  type ParcelMap,
  type Property,
} from "./propertyMap";

const addressApi = "https://api.kartverket.no/adresser/v1/sok";
const municipalityApi = "https://api.kartverket.no/kommuneinfo/v1/sok";
const parcelApi = "https://api.kartverket.no/eiendom/v1";

export const mapAttribution = "© Kartverket";
export const mapAttributionUrl =
  "https://www.kartverket.no/api-og-data/vilkar-for-bruk/";

export type MapBackground = {
  label: string;
  imageUrl?: (bounds: Box, width: number, height: number) => string;
  attribution: string;
  exportable: boolean;
  unavailable?: string;
};

export type BackgroundId = "property" | "parcels" | "aerial";

export const backgrounds: Record<BackgroundId, MapBackground> = {
  property: {
    label: "Property map",
    attribution: "© Kartverket / Geovekst",
    exportable: false,
    imageUrl: ({ x, y, w, h }, width, height) =>
      url("https://wms.geonorge.no/skwms1/wms.topo", {
        SERVICE: "WMS",
        VERSION: "1.1.1",
        REQUEST: "GetMap",
        LAYERS: "topo",
        STYLES: "",
        SRS: "EPSG:3857",
        BBOX: [x, y, x + w, y + h].join(","),
        WIDTH: width,
        HEIGHT: height,
        FORMAT: "image/png",
      }),
  },
  parcels: {
    label: "Parcel boundaries",
    attribution: mapAttribution,
    exportable: true,
  },
  aerial: {
    label: "Aerial photo",
    attribution: "",
    exportable: false,
    unavailable:
      "Aerial photo requires a provider that permits access from this app.",
  },
};
export const printBackground = backgrounds.parcels;

function url(endpoint: string, params: Record<string, string | number>) {
  const result = new URL(endpoint);
  for (const [key, value] of Object.entries(params))
    result.searchParams.set(key, String(value));
  return result.href;
}

async function getJson<T>(
  endpoint: string,
  params: Record<string, string | number>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url(endpoint, params), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    credentials: "omit",
  });
  if (!response.ok) throw Error(`Kartverket returned HTTP ${response.status}.`);
  return response.json();
}

function validLocation(value: Location | undefined): value is Location {
  return (
    !!value &&
    Number.isFinite(value.lon) &&
    Number.isFinite(value.lat) &&
    Math.abs(value.lon) <= 180 &&
    Math.abs(value.lat) <= maxLatitude
  );
}

type ParcelFeature = {
  geometry?: { type: string; coordinates: unknown };
  properties?: {
    kommunenummer: string;
    matrikkelnummertekst: string;
    hovedområde?: boolean;
  };
};

async function propertyFeatures(
  path: "geokoding" | "punkt/omrader",
  params: Record<string, string | number>,
  signal: AbortSignal,
) {
  const result = await getJson<{ features: ParcelFeature[] }>(
    `${parcelApi}/${path}`,
    params,
    signal,
  );
  return result.features;
}

export async function searchProperties(
  input: string,
  signal: AbortSignal,
): Promise<Property[]> {
  const cadastral = input
    .trim()
    .match(
      /^(?:(\d{4})\s*[- ]\s*)?(\d{1,9}\s*\/\s*\d{1,9}(?:\s*\/\s*\d{1,9}){0,2})(?:\s*,?\s+(.+))?$/,
    );
  if (cadastral) {
    const [, code, parcel, municipality] = cadastral;
    if (!code && !municipality)
      throw Error("Add the municipality name after the property number.");
    const numbers = code
      ? [{ kommunenummer: code, kommunenavn: code }]
      : (
          await getJson<{
            kommuner: { kommunenummer: string; kommunenavn: string }[];
          }>(
            municipalityApi,
            {
              knavn: municipality,
              filtrer: "kommuner.kommunenavn,kommuner.kommunenummer",
            },
            signal,
          )
        ).kommuner.filter(
          ({ kommunenavn }) =>
            kommunenavn.toLowerCase() === municipality.toLowerCase(),
        );
    return (
      await Promise.all(
        numbers.map(async ({ kommunenummer, kommunenavn }) => {
          const number = `${kommunenummer}-${parcel.replace(/\s/g, "")}`;
          const features = await propertyFeatures(
            "geokoding",
            { matrikkelnummer: number, omrade: "false" },
            signal,
          );
          return features
            .flatMap((feature) => {
              if (
                feature.geometry?.type !== "Point" ||
                !Array.isArray(feature.geometry.coordinates)
              )
                return [];
              const [lon, lat] = feature.geometry.coordinates;
              const location = { lon, lat };
              return validLocation(location)
                ? [
                    {
                      number,
                      label: `${number} · ${kommunenavn === kommunenummer ? "Property" : kommunenavn}`,
                      location,
                      main: feature.properties?.["hovedområde"],
                    },
                  ]
                : [];
            })
            .sort((a, b) => Number(!!b.main) - Number(!!a.main))
            .map(({ number, label, location }, i) => ({
              number,
              label: i ? `${label} · Area ${i + 1}` : label,
              location,
            }));
        }),
      )
    ).flat();
  }

  type Address = {
    adressetekst: string;
    poststed: string;
    kommunenummer: string;
    gardsnummer: number;
    bruksnummer: number;
    festenummer: number;
    representasjonspunkt: Location;
  };
  const { adresser } = await getJson<{ adresser: Address[] }>(
    addressApi,
    { sok: input.trim(), asciiKompatibel: "false", treffPerSide: 8 },
    signal,
  );
  return adresser.flatMap((address) => {
    const {
      representasjonspunkt: location,
      kommunenummer,
      gardsnummer,
      bruksnummer,
      festenummer,
    } = address;
    return validLocation(location)
      ? [
          {
            number: `${kommunenummer}-${gardsnummer}/${bruksnummer}${festenummer ? `/${festenummer}` : ""}`,
            label: `${address.adressetekst}, ${address.poststed}`,
            location,
          },
        ]
      : [];
  });
}

function readRing(value: unknown): Point[] {
  if (!Array.isArray(value) || value.length < 4) return [];
  const points: Point[] = [];
  for (const pair of value) {
    if (!Array.isArray(pair) || !validLocation({ lon: pair[0], lat: pair[1] }))
      return [];
    points.push(projectLocation({ lon: pair[0], lat: pair[1] }));
  }
  const [first, last] = [points[0], points.at(-1)!];
  if (first.x !== last.x || first.y !== last.y) return [];
  return points;
}

function readParcels(features: ParcelFeature[], number?: string): Parcel[] {
  return features.flatMap(({ geometry, properties }) => {
    if (!geometry || !Array.isArray(geometry.coordinates)) return [];
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    const parcelNumber =
      number ??
      (properties &&
        `${properties.kommunenummer}-${properties.matrikkelnummertekst}`);
    if (!parcelNumber) return [];
    return polygons.flatMap((polygon) => {
      if (!Array.isArray(polygon) || !polygon.length) return [];
      const rings = polygon.map(readRing);
      return rings.every((ring) => ring.length)
        ? [{ number: parcelNumber, rings }]
        : [];
    });
  });
}

export async function loadParcelMap(
  number: string,
  location: Location,
  signal: AbortSignal,
): Promise<ParcelMap & { partial: boolean }> {
  const [selected, nearby] = await Promise.allSettled([
    propertyFeatures(
      "geokoding",
      { matrikkelnummer: number, omrade: "true" },
      signal,
    ),
    propertyFeatures(
      "punkt/omrader",
      {
        ost: location.lon,
        nord: location.lat,
        koordsys: 4258,
        radius: 160,
        maksTreff: 80,
      },
      signal,
    ),
  ]);
  signal.throwIfAborted();
  const surrounding =
    nearby.status === "fulfilled" ? readParcels(nearby.value) : [];
  const exact =
    selected.status === "fulfilled" ? readParcels(selected.value, number) : [];
  return {
    selected: exact.length
      ? exact
      : surrounding.filter((parcel) => parcel.number === number),
    nearby: surrounding.filter((parcel) => parcel.number !== number),
    partial: selected.status === "rejected" || nearby.status === "rejected",
  };
}
