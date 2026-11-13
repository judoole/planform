import { useEffect, useState } from "react";
import { loadParcelMap } from "./mapProvider";
import { groundScale, projectLocation, type PropertyMap } from "./propertyMap";
import { dist } from "./model";

const empty = { selected: [], nearby: [], partial: false };

export function useParcelMap(map?: PropertyMap) {
  const property = map?.property;
  const center = map?.placement?.center;
  const origin = property?.location;
  // Keep the same neighborhood during small placement edits.
  const far =
    center &&
    origin &&
    dist(projectLocation(center), projectLocation(origin)) *
      groundScale(origin).x >
      75;
  const lat = far ? Number(center.lat.toFixed(3)) : origin?.lat;
  const lon = far ? Number(center.lon.toFixed(3)) : origin?.lon;
  const number = property?.number;
  const key = number && `${number}:${lat}:${lon}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    data: Awaited<ReturnType<typeof loadParcelMap>>;
  }>();
  useEffect(() => {
    if (!number || !key || lat === undefined || lon === undefined) return;
    const abort = new AbortController();
    void loadParcelMap(number, { lat, lon }, abort.signal).then(
      (data) => setLoaded({ key, data }),
      () => {
        if (!abort.signal.aborted)
          setLoaded({ key, data: { ...empty, partial: true } });
      },
    );
    return () => abort.abort();
  }, [key, lat, lon, number]);
  return {
    data: key && loaded?.key === key ? loaded.data : empty,
    loading: !!key && loaded?.key !== key,
  };
}
