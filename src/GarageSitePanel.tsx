import { useState, type MouseEvent } from "react";
import type { GarageDetails } from "./garage";
import { SiteArtwork, sitePlanSheet } from "./garageSite";
import { dist, type Plan, type Point } from "./model";
import ReferencePicker from "./ReferencePicker";
import SheetExport from "./SheetExport";
import {
  siteDistances,
  siteFeatureNames,
  siteGarageGeometry,
  siteScale,
  type GarageSite,
  type SiteFeature,
  type SiteFeatureKind,
} from "./siteMap";

type Mode = "idle" | "calibrate" | "place" | "feature";
const rasterPoints = (points: Point[]) =>
  points.map((p) => `${p.x},${p.y}`).join(" ");

export default function GarageSitePanel({
  plan,
  onChange,
}: {
  plan: Plan;
  onChange: (details: GarageDetails) => void;
}) {
  const [choose, setChoose] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [points, setPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState("");
  const [kind, setKind] = useState<SiteFeatureKind>("boundary");
  const [name, setName] = useState("");
  const [correction, setCorrection] = useState("");
  const [error, setError] = useState("");
  const site = plan.garage?.site;
  const propertyId = plan.garage?.permit?.propertyId ?? "";
  const scale = site && siteScale(site);
  let geometry: ReturnType<typeof siteGarageGeometry> | undefined;
  let garageProblem = "";
  if (site && scale && site.placement) {
    try {
      geometry = siteGarageGeometry(plan, site);
    } catch (error) {
      garageProblem = (error as Error).message;
    }
  }
  const distances = geometry
    ? new Map(
        siteDistances(geometry.corners, site!.features, geometry.scale).map(
          (row) => [row.index, row.distanceM],
        ),
      )
    : new Map<number, number>();

  function update(site: GarageSite | undefined) {
    try {
      onChange({ ...plan.garage, site });
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  }
  function start(next: Mode) {
    setMode(next);
    setPoints([]);
    setError("");
  }
  function clickMap(event: MouseEvent<SVGSVGElement>) {
    if (!site || mode === "idle") return;
    const inverse = event.currentTarget.getScreenCTM()?.inverse();
    if (!inverse) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      inverse,
    );
    if (p.x < 0 || p.x > site.map.width || p.y < 0 || p.y > site.map.height)
      return;
    addPoint({ x: p.x, y: p.y });
  }
  function addPoint(point: Point) {
    if (!site) return;
    if (mode === "place") {
      update({
        ...site,
        placement: { center: point, rotation: site.placement?.rotation ?? 0 },
      });
      start("idle");
    } else if (mode === "calibrate") {
      setPoints((previous) =>
        previous.length >= 2 ? [point] : [...previous, point],
      );
    } else {
      setPoints((previous) =>
        previous.length < 100 ? [...previous, point] : previous,
      );
    }
  }
  function calibrate() {
    if (!site || points.length !== 2) return;
    const meters = Number(distance);
    if (
      !Number.isFinite(meters) ||
      meters <= 0 ||
      meters > 10000 ||
      dist(...(points as [Point, Point])) < 0.01
    ) {
      setError(
        "Choose two different map points and enter a positive distance in metres.",
      );
      return;
    }
    update({
      ...site,
      calibration: { a: points[0], b: points[1], distanceM: meters },
    });
    start("idle");
  }
  function addFeature() {
    if (
      !site ||
      points.length < (kind === "parking" ? 3 : 2) ||
      site.features.length >= 15
    )
      return;
    const feature: SiteFeature = {
      kind,
      name: name.trim(),
      points,
      ...(correction.trim() ? { correction: correction.trim() } : {}),
    };
    update({ ...site, features: [...site.features, feature] });
    setName("");
    setCorrection("");
    start("idle");
  }

  return (
    <>
      <h3>Site plan</h3>
      <p>
        Import a local map, calibrate its scale bar and place the building. Map
        calibration uses a separate scale from the floor plan.
      </p>
      <div className="sheet-fields">
        <button onClick={() => setChoose(true)}>
          {site ? "Replace map" : "Import map"}
        </button>
        {site && (
          <button
            onClick={() => {
              update(undefined);
              start("idle");
            }}
          >
            Remove map
          </button>
        )}
        {site && (
          <button onClick={() => start("calibrate")}>
            {scale ? "Recalibrate map" : "Calibrate map"}
          </button>
        )}
        {site && (
          <button disabled={!scale} onClick={() => start("place")}>
            {site.placement ? "Move building" : "Place building"}
          </button>
        )}
        {site && (
          <button
            disabled={site.features.length >= 15}
            onClick={() => start("feature")}
          >
            Mark map feature
          </button>
        )}
        {mode !== "idle" && (
          <button onClick={() => start("idle")}>Cancel map edit</button>
        )}
      </div>
      {choose && (
        <ReferencePicker
          onClose={() => setChoose(false)}
          onApply={(map) => {
            onChange({
              ...plan.garage,
              site: { map, northDegrees: 0, features: [] },
            });
            setChoose(false);
            start("idle");
          }}
        />
      )}
      {site && (
        <>
          <p>
            {site.map.name}
            {site.map.page ? ` · Page ${site.map.page}` : ""} ·{" "}
            {scale ? "Calibrated" : "Awaiting calibration"} · Locked map
          </p>
          {mode === "calibrate" && (
            <p>
              Select the two ends of the scale bar, then enter the known
              distance.
            </p>
          )}
          {mode === "place" && (
            <p>Click the centre of the proposed building.</p>
          )}
          {mode === "feature" && (
            <p>
              Click points along the map feature. For parking, mark at least
              three corners.
            </p>
          )}
          <svg
            className={`garage-site-map ${mode === "idle" ? "" : "marking"}`}
            aria-label="Site map"
            role="img"
            viewBox={`0 0 ${site.map.width} ${site.map.height}`}
            onClick={clickMap}
          >
            <SiteArtwork plan={plan} site={site} />
            {points.length > 0 && (
              <g
                stroke="#283c79"
                strokeWidth={Math.max(1, site.map.width / 500)}
                fill="white"
              >
                <polyline points={rasterPoints(points)} fill="none" />
                {points.map((point, index) => (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={Math.max(3, site.map.width / 200)}
                  />
                ))}
              </g>
            )}
          </svg>
          {mode !== "idle" && (
            <div className="sheet-fields">
              <label>
                Map X (pixels)
                <input
                  id="site-map-x"
                  type="number"
                  min={0}
                  max={site.map.width}
                />
              </label>
              <label>
                Map Y (pixels)
                <input
                  id="site-map-y"
                  type="number"
                  min={0}
                  max={site.map.height}
                />
              </label>
              <button
                onClick={(event) => {
                  const controls = event.currentTarget.parentElement!;
                  const x =
                    controls.querySelector<HTMLInputElement>(
                      "#site-map-x",
                    )!.valueAsNumber;
                  const y =
                    controls.querySelector<HTMLInputElement>(
                      "#site-map-y",
                    )!.valueAsNumber;
                  if (
                    !Number.isFinite(x + y) ||
                    x < 0 ||
                    y < 0 ||
                    x > site.map.width ||
                    y > site.map.height
                  ) {
                    setError("Enter a position within the map.");
                    return;
                  }
                  addPoint({ x, y });
                }}
              >
                Add map point
              </button>
            </div>
          )}
          {mode === "calibrate" && (
            <div className="sheet-fields">
              <label>
                Known distance (m)
                <input
                  type="number"
                  min={0.01}
                  max={10000}
                  step="any"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
              </label>
              <button disabled={points.length !== 2} onClick={calibrate}>
                Apply map calibration
              </button>
            </div>
          )}
          {mode === "feature" && (
            <div className="sheet-fields">
              <label>
                Feature type
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SiteFeatureKind)}
                >
                  {Object.entries(siteFeatureNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Feature label
                <input
                  maxLength={36}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Distance correction or basis
                <input
                  maxLength={60}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                />
              </label>
              <button
                disabled={points.length < (kind === "parking" ? 3 : 2)}
                onClick={addFeature}
              >
                Save feature
              </button>
            </div>
          )}
          <div className="sheet-fields">
            <AngleField
              label="North direction from map up (degrees clockwise)"
              angle={site.northDegrees}
              onAngle={(northDegrees) => update({ ...site, northDegrees })}
            />
            {site.placement && (
              <AngleField
                label="Building rotation (degrees clockwise)"
                angle={site.placement.rotation}
                onAngle={(rotation) =>
                  update({
                    ...site,
                    placement: { ...site.placement!, rotation },
                  })
                }
              />
            )}
          </div>
          {error && <p role="alert">{error}</p>}
          {garageProblem && <p role="alert">{garageProblem}</p>}
          {site.features.length > 0 && (
            <ol className="site-features">
              {site.features.map((feature, index) => (
                <li key={index}>
                  <strong>
                    {feature.name || siteFeatureNames[feature.kind]}
                  </strong>
                  {distances.has(index) &&
                    ` · ${distances.get(index)!.toFixed(2)} m`}
                  {feature.correction && ` · ${feature.correction}`}
                  <button
                    onClick={() =>
                      update({
                        ...site,
                        features: site.features.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove feature {index + 1}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p>
            Distances are horizontal measurements from the outside faces on the
            supplied map. Record any survey or roof projection corrections with
            the feature.
          </p>
          <label className="field">
            <span>Property reference (optional)</span>
            <input
              value={propertyId}
              maxLength={120}
              onChange={(event) =>
                onChange({
                  ...plan.garage,
                  permit: {
                    ...plan.garage?.permit,
                    propertyId: event.target.value,
                  },
                })
              }
            />
          </label>
          <SheetExport
            build={() => sitePlanSheet(plan, propertyId)}
            name={plan.name}
            initialScale={500}
          />
        </>
      )}
    </>
  );
}

function AngleField({
  label,
  angle,
  onAngle,
}: {
  label: string;
  angle: number;
  onAngle: (angle: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        key={angle}
        type="number"
        min={-360}
        max={360}
        step="any"
        defaultValue={angle}
        onBlur={(e) => {
          const next = e.target.valueAsNumber;
          if (
            Number.isFinite(next) &&
            next >= -360 &&
            next <= 360 &&
            next !== angle
          )
            onAngle(next);
          else e.target.value = String(angle);
        }}
      />
    </label>
  );
}
