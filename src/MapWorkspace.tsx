import { useLanguage, useTranslation } from "./i18n";
import { Minus, Plus, RotateCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  backgrounds,
  mapAttribution,
  mapAttributionUrl,
  searchProperties,
  type BackgroundId,
} from "./mapProvider";
import {
  MapMeasurements,
  mapPoints,
  NorthArrow,
  ParcelArtwork,
} from "./PropertyMapArtwork";
import {
  boundaryMeasurements,
  groundScale,
  mapFootprint,
  mapLocation,
  placedFootprint,
  projectLocation,
  type MapPlacement,
  type Property,
  type PropertyMap,
} from "./propertyMap";
import { add, rotate, type Box, type Plan, type Point } from "./model";
import type { useParcelMap } from "./useParcelMap";
import "./mapWorkspace.css";

type Camera = { center: Point; resolution: number };
type Drag = {
  id: number;
  kind: "pan" | "move" | "rotate";
  start: Point;
  camera: Camera;
  placement?: MapPlacement;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const bearing = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360;
const pointDifference = (a: Point, b: Point) => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

function propertyCamera(map: PropertyMap): Camera {
  const location = map.placement?.center ?? map.property.location;
  return {
    center: projectLocation(location),
    resolution: 0.18 / groundScale(location).x,
  };
}

function useMapImage(
  camera: Camera | undefined,
  size: { width: number; height: number },
  background: BackgroundId,
) {
  const [image, setImage] = useState<{
    url: string;
    bounds: Box;
    background: BackgroundId;
  }>();
  const [error, setError] = useState(false);
  const { width, height } = size;
  useEffect(() => {
    const source = backgrounds[background];
    if (!camera || !width || !height || !source.imageUrl) return;
    let current = true;
    const bitmap = new Image();
    const { center, resolution } = camera;
    const w = width * resolution;
    const h = height * resolution;
    const bounds = { x: center.x - w / 2, y: center.y - h / 2, w, h };
    const pixels = Math.min(
      window.devicePixelRatio,
      1.5,
      1800 / Math.max(width, height),
    );
    const url = source.imageUrl(
      bounds,
      Math.max(1, Math.round(width * pixels)),
      Math.max(1, Math.round(height * pixels)),
    );
    const timer = window.setTimeout(() => {
      setError(false);
      bitmap.onload = () => current && setImage({ url, bounds, background });
      bitmap.onerror = () => current && setError(true);
      bitmap.src = url;
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
      bitmap.onload = bitmap.onerror = null;
    };
  }, [camera, width, height, background]);
  return { image: image?.background === background ? image : undefined, error };
}

export default function MapWorkspace({
  plan,
  active,
  background,
  onBackground,
  parcels,
  onChange,
  onImportedMap,
}: {
  plan: Plan;
  active: boolean;
  background: BackgroundId;
  onBackground: (background: BackgroundId) => void;
  parcels: ReturnType<typeof useParcelMap>;
  onChange: (map: PropertyMap) => void;
  onImportedMap: () => void;
}) {
  const t = useTranslation();
  const language = useLanguage();
  const map = plan.propertyMap;
  const location = map?.placement?.center;
  const [cameraOverride, setCamera] = useState<{
    property: Property;
    camera: Camera;
  }>();
  const initialCamera = useMemo(
    () => map && propertyCamera(map),
    [map?.property, location],
  );
  const camera =
    cameraOverride && cameraOverride.property === map?.property
      ? cameraOverride.camera
      : initialCamera;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Property[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const searchRequest = useRef<AbortController>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<MapPlacement>();
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null);
  const footprint = useMemo(() => mapFootprint(plan), [plan]);
  const placement = draft ?? map?.placement;
  const corners =
    footprint && placement ? placedFootprint(footprint, placement) : undefined;
  const measurements =
    corners && placement
      ? boundaryMeasurements(
          corners,
          parcels.data.selected,
          placement.center,
          language,
        )
      : undefined;

  useEffect(() => () => searchRequest.current?.abort(), []);
  useEffect(() => {
    if (!active || !svg.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ width, height });
    });
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [active, !!map]);
  const { image, error: imageError } = useMapImage(
    active ? camera : undefined,
    size,
    background,
  );

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setSearchMessage("");
    setResults([]);
    try {
      const found = await searchProperties(term, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      if (!found.length)
        setSearchMessage(
          "No property found. Check the address or property number and municipality.",
        );
    } catch (error) {
      if (!controller.signal.aborted)
        setSearchMessage(
          error instanceof TypeError || (error as Error).name === "TimeoutError"
            ? "Could not reach Kartverket. Try again in a moment."
            : (error as Error).message,
        );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  function selectProperty(property: Property) {
    const sameProperty = map?.property.number === property.number;
    const next = {
      property,
      placement: sameProperty ? map.placement : undefined,
    };
    setCamera({ property, camera: propertyCamera(next) });
    setResults([]);
    onChange(next);
  }

  function changeCamera(next: Camera) {
    if (map) setCamera({ property: map.property, camera: next });
  }

  function setPlacement(next: MapPlacement) {
    if (!map) return;
    if (camera) changeCamera(camera);
    onChange({ ...map, placement: next });
  }

  function zoom(factor: number, anchor?: Point) {
    if (!camera) return;
    const resolution = clamp(camera.resolution * factor, 0.025, 650);
    const offset = anchor && {
      x: anchor.x - size.width / 2,
      y: size.height / 2 - anchor.y,
    };
    changeCamera({
      resolution,
      center: offset
        ? add(camera.center, {
            x: offset.x * (camera.resolution - resolution),
            y: offset.y * (camera.resolution - resolution),
          })
        : camera.center,
    });
  }

  function cursor(event: { clientX: number; clientY: number }): Point {
    const bounds = svg.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function toView(point: Point, view = camera): Point {
    if (!view) return { x: 0, y: 0 };
    return {
      x: size.width / 2 + (point.x - view.center.x) / view.resolution,
      y: size.height / 2 - (point.y - view.center.y) / view.resolution,
    };
  }

  function beginDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !camera || drag.current) return;
    const target = (event.target as SVGElement).dataset;
    const kind = target.mapRotate
      ? "rotate"
      : target.mapFootprint
        ? "move"
        : "pan";
    drag.current = {
      id: event.pointerId,
      kind,
      start: cursor(event),
      camera,
      placement,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragPlacement(
    action: Drag,
    current: Point,
  ): MapPlacement | undefined {
    const { placement, camera, start, kind } = action;
    if (!placement || kind === "pan") return;
    const center = projectLocation(placement.center);
    if (kind === "move") {
      const delta = pointDifference(current, start);
      return {
        ...placement,
        center: mapLocation(
          add(center, {
            x: delta.x * camera.resolution,
            y: -delta.y * camera.resolution,
          }),
        ),
      };
    }
    const scale = groundScale(placement.center);
    const screenCenter = toView(center, camera);
    const angle = (p: Point) =>
      Math.atan2(
        (p.y - screenCenter.y) * scale.y,
        (p.x - screenCenter.x) * scale.x,
      );
    return {
      ...placement,
      rotation: bearing(
        placement.rotation + ((angle(current) - angle(start)) * 180) / Math.PI,
      ),
    };
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const action = drag.current;
    if (!action || event.pointerId !== action.id) return;
    const point = cursor(event);
    if (action.kind === "pan") {
      const delta = pointDifference(point, action.start);
      const { center, resolution } = action.camera;
      changeCamera({
        resolution,
        center: projectLocation(
          mapLocation(
            add(center, { x: -delta.x * resolution, y: delta.y * resolution }),
          ),
        ),
      });
    } else setDraft(dragPlacement(action, point));
  }

  function endDrag(event: PointerEvent<SVGSVGElement>) {
    const action = drag.current;
    if (!action || event.pointerId !== action.id) return;
    drag.current = null;
    setDraft(undefined);
    if (event.type !== "pointerup") return;
    const point = cursor(event);
    if (Math.hypot(point.x - action.start.x, point.y - action.start.y) < 2)
      return;
    const next = dragPlacement(action, point);
    if (next) setPlacement(next);
  }

  const source = backgrounds[background];
  const plain = !image || imageError;
  const imageOrigin =
    image && toView({ x: image.bounds.x, y: image.bounds.y + image.bounds.h });
  const center = placement && toView(projectLocation(placement.center));
  const rotationHandle = (() => {
    if (!center || !camera || !placement || !footprint) return;
    const scale = groundScale(placement.center);
    const north = rotate({ x: 0, y: -1 }, placement.rotation);
    const dx = north.x / (camera.resolution * scale.x);
    const dy = north.y / (camera.resolution * scale.y);
    const pixelsPerMeter = Math.hypot(dx, dy);
    const edge = {
      x: center.x + (dx * footprint.height) / 2,
      y: center.y + (dy * footprint.height) / 2,
    };
    return {
      edge,
      knob: {
        x: edge.x + (dx * 23) / pixelsPerMeter,
        y: edge.y + (dy * 23) / pixelsPerMeter,
      },
    };
  })();
  const metersPerPixel =
    camera && camera.resolution * groundScale(mapLocation(camera.center)).x;
  const scaleMeters =
    metersPerPixel &&
    ([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
      .reverse()
      .find((meters) => meters / metersPerPixel < 110) ??
      1);

  return (
    <section className="map-workspace" aria-label={t("Map workspace")}>
      <div className="map-controls">
        <form className="map-search" onSubmit={search}>
          <label htmlFor="property-search">{t("Find a property")}</label>
          <div className="map-search-input">
            <input
              id="property-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Address or gnr/bnr and municipality")}
              maxLength={200}
              required
            />
            <button
              aria-label={t("Search properties")}
              title={t("Search properties")}
              disabled={searching}
            >
              <Search size={17} />
            </button>
          </div>
          {searching && <p role="status">{t("Searching Kartverket…")}</p>}
          {searchMessage && <p role="status">{t(searchMessage)}</p>}
          {!!results.length && (
            <ul className="map-results" aria-label={t("Search results")}>
              {results.map((result, i) => (
                <li key={`${result.number}:${i}`}>
                  <button type="button" onClick={() => selectProperty(result)}>
                    {result.label}
                    {!result.label.includes(result.number) && (
                      <small>{result.number}</small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        {map && (
          <div className="map-property">
            <strong>{map.property.label}</strong>
            {!map.property.label.includes(map.property.number) && (
              <span>{map.property.number}</span>
            )}
          </div>
        )}
        <label className="map-background">
          {t("Background")}
          <select
            value={background}
            onChange={(e) => onBackground(e.target.value as BackgroundId)}
          >
            {Object.entries(backgrounds).map(([id, option]) => (
              <option key={id} value={id} disabled={!!option.unavailable}>
                {t(option.label)}
                {option.unavailable ? ` (${t("unavailable")})` : ""}
              </option>
            ))}
          </select>
        </label>
        {backgrounds.aerial.unavailable && (
          <p className="map-aerial-note">{t(backgrounds.aerial.unavailable)}</p>
        )}
        {plan.garage?.site && (
          <button type="button" onClick={onImportedMap}>
            {t("Open imported map")}
          </button>
        )}
      </div>
      {camera && map ? (
        <div className="map-viewport">
          <svg
            ref={svg}
            className="map-surface"
            aria-label={t("Property map canvas")}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onWheel={(event) =>
              zoom(event.deltaY < 0 ? 0.8 : 1.25, cursor(event))
            }
          >
            {!plain && imageOrigin && (
              <image
                href={image.url}
                x={imageOrigin.x}
                y={imageOrigin.y}
                width={image.bounds.w / camera.resolution}
                height={image.bounds.h / camera.resolution}
                preserveAspectRatio="none"
                pointerEvents="none"
              />
            )}
            <ParcelArtwork
              parcels={parcels.data}
              toView={toView}
              plain={plain}
            />
            {corners && (
              <polygon
                className="map-footprint"
                data-map-footprint="true"
                points={mapPoints(corners, toView)}
                fill="#b9e2cb"
                stroke="#18583f"
                strokeWidth={2.2}
              />
            )}
            <MapMeasurements
              language={language}
              distances={measurements?.distances}
              toView={toView}
              bounds={{ x: 0, y: 0, w: size.width, h: size.height }}
            />
            {rotationHandle && (
              <g stroke="#18583f" strokeWidth={2}>
                <line
                  x1={rotationHandle.edge.x}
                  y1={rotationHandle.edge.y}
                  x2={rotationHandle.knob.x}
                  y2={rotationHandle.knob.y}
                  pointerEvents="none"
                />
                <circle
                  className="map-rotation-handle"
                  data-map-rotate="true"
                  aria-label={t("Rotate building handle")}
                  cx={rotationHandle.knob.x}
                  cy={rotationHandle.knob.y}
                  r={9}
                  fill="white"
                />
              </g>
            )}
            <NorthArrow x={size.width - 35} y={32} />
          </svg>
          <div className="map-place-controls">
            {!footprint ? (
              <p>
                {plan.calibration.calibrated
                  ? t(
                      "Draw a closed outline with straight walls and no inward corners to place the building.",
                    )
                  : t(
                      "Set a known floor plan dimension to place this imported drawing at real size.",
                    )}
              </p>
            ) : !placement ? (
              <button
                className="primary"
                type="button"
                onClick={() =>
                  setPlacement({
                    center: mapLocation(camera.center),
                    rotation: 0,
                  })
                }
              >
                {t("Place building")}
              </button>
            ) : (
              <>
                <div className="map-building-details">
                  <strong>
                    {footprint.width.toFixed(2)} × {footprint.height.toFixed(2)}{" "}
                    m
                  </strong>
                  <label>
                    <RotateCw size={14} aria-hidden="true" />
                    <input
                      type="number"
                      aria-label={t("Building rotation")}
                      key={map.placement?.rotation}
                      defaultValue={map.placement?.rotation}
                      onBlur={(event) => {
                        const value = event.currentTarget.valueAsNumber;
                        const next = Number.isFinite(value)
                          ? bearing(value)
                          : placement.rotation;
                        event.currentTarget.value = String(next);
                        if (next !== placement.rotation)
                          setPlacement({ ...placement, rotation: next });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                    °
                  </label>
                </div>
                <p>
                  {t(
                    "Drag the building to move it. Drag the white handle to rotate.",
                  )}
                </p>
              </>
            )}
            {parcels.loading ? (
              <p role="status">{t("Loading parcel boundaries…")}</p>
            ) : (
              <>
                {measurements ? (
                  <p className="map-measurement">{measurements.summary}</p>
                ) : (
                  !parcels.data.selected.length && (
                    <p>{t("Selected parcel boundary unavailable.")}</p>
                  )
                )}
                {parcels.data.partial && !!parcels.data.selected.length && (
                  <p>{t("Some parcel data could not be loaded.")}</p>
                )}
              </>
            )}
            {measurements && <p>{t("Mapped boundaries are approximate.")}</p>}
            {imageError && source.imageUrl && (
              <p>
                {parcels.data.selected.length || parcels.data.nearby.length
                  ? t("Background unavailable. Showing parcel boundaries.")
                  : t("Map background unavailable.")}
              </p>
            )}
          </div>
          <div className="map-zoom">
            <button
              type="button"
              aria-label={t("Zoom map in")}
              onClick={() => zoom(0.67)}
            >
              <Plus size={17} />
            </button>
            <button
              type="button"
              aria-label={t("Zoom map out")}
              onClick={() => zoom(1.5)}
            >
              <Minus size={17} />
            </button>
            <button
              type="button"
              onClick={() => changeCamera(propertyCamera(map))}
            >
              {t("Recenter")}
            </button>
          </div>
          <div className="map-map-footer">
            {metersPerPixel && scaleMeters && (
              <span
                className="map-scale"
                style={{ width: scaleMeters / metersPerPixel }}
              >
                {scaleMeters} m
              </span>
            )}
            <a href={mapAttributionUrl} target="_blank" rel="noreferrer">
              {plain ? mapAttribution : source.attribution}
            </a>
          </div>
        </div>
      ) : (
        <div className="map-empty">
          <Search size={28} aria-hidden="true" />
          <strong>{t("Find the place you’re designing for")}</strong>
          <p>
            {t(
              "Search a Norwegian street address, or enter a property number such as 315/204 Levanger.",
            )}
          </p>
        </div>
      )}
    </section>
  );
}
