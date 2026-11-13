import { useState } from "react";
import {
  joinWalls,
  splitWall,
  wallOffsetAtPoint,
  type EditProtection,
  type WallEnd,
} from "./junctions";
import { dist, uid, type Plan, type Wall } from "./model";
import { validateProject } from "./validation";

export default function WallJunctionControls({
  plan,
  wall,
  onCommit,
  onError,
  protectedItem = (item) => Boolean(item.locked),
}: {
  plan: Plan;
  wall: Wall;
  onCommit: (plan: Plan) => void;
  onError: (message: string) => void;
  protectedItem?: EditProtection;
}) {
  const [splitOffset, setSplitOffset] = useState("");
  const [sourceEnd, setSourceEnd] = useState<WallEnd>("b");
  const [targetId, setTargetId] = useState("");
  const [joinOffset, setJoinOffset] = useState("");
  const units = plan.calibration.calibrated ? "cm" : "units";
  const targets = plan.items.filter(
    (item): item is Wall =>
      item.type === "wall" && item.id !== wall.id && !protectedItem(item),
  );
  const target = targets.find((item) => item.id === targetId);
  const measuredLength = dist(wall.a, wall.b);
  const projected = target ? wallOffsetAtPoint(wall[sourceEnd], target) : 0;

  function apply(change: () => Plan) {
    try {
      onCommit(validateProject(change()));
    } catch (error) {
      onError((error as Error).message);
    }
  }

  return (
    <section className="panel-section" aria-label="Wall junctions">
      <h3>Wall junctions</h3>
      <label className="field">
        <span>Split from start ({units})</span>
        <input
          type="number"
          step="any"
          min={0}
          max={measuredLength}
          placeholder={String(measuredLength / 2)}
          value={splitOffset}
          onChange={(event) => setSplitOffset(event.target.value)}
        />
      </label>
      <button
        onClick={() =>
          apply(() =>
            splitWall(
              plan,
              wall.id,
              splitOffset === "" ? measuredLength / 2 : Number(splitOffset),
              uid(),
              uid(),
              protectedItem,
            ),
          )
        }
      >
        Split wall
      </button>
      {targets.length > 0 && (
        <>
          <label className="field">
            <span>Join this endpoint</span>
            <select
              value={sourceEnd}
              onChange={(event) => setSourceEnd(event.target.value as WallEnd)}
            >
              <option value="a">Start</option>
              <option value="b">End</option>
            </select>
          </label>
          <label className="field">
            <span>Target wall</span>
            <select
              value={target?.id ?? ""}
              onChange={(event) => {
                setTargetId(event.target.value);
                setJoinOffset("");
              }}
            >
              <option value="">Choose a wall</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>
          </label>
          {target && (
            <label className="field">
              <span>Join from target start ({units})</span>
              <input
                type="number"
                min={0}
                max={dist(target.a, target.b)}
                step="any"
                placeholder={String(projected)}
                value={joinOffset}
                onChange={(event) => setJoinOffset(event.target.value)}
              />
            </label>
          )}
          <button
            disabled={!target}
            onClick={() =>
              target &&
              apply(() =>
                joinWalls(
                  plan,
                  wall.id,
                  sourceEnd,
                  target.id,
                  joinOffset === "" ? projected : Number(joinOffset),
                  uid(),
                  uid(),
                  protectedItem,
                ),
              )
            }
          >
            Join walls
          </button>
        </>
      )}
    </section>
  );
}
