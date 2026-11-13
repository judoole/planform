import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LockKeyhole,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import {
  activeLayer,
  defaultLayer,
  deleteLayer,
  drawingLayers,
  isEditProtected,
  moveToLayer,
  type Layer,
} from "./layers";
import { uid, type Plan } from "./model";

export default function LayerPanel({
  plan,
  selection,
  onLayerChange,
  onMove,
  onError,
}: {
  plan: Plan;
  selection: string[];
  onLayerChange: (plan: Plan) => void;
  onMove: (plan: Plan) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const layers = drawingLayers(plan);
  const active = activeLayer(plan);
  const canMove = plan.items.some(
    (item) =>
      selection.includes(item.id) &&
      item.type !== "door" &&
      item.type !== "window" &&
      !isEditProtected(plan, item),
  );
  function updateLayer(id: string, changes: Partial<Layer>) {
    onLayerChange({
      ...plan,
      layers: layers.map((layer) =>
        layer.id === id ? { ...layer, ...changes } : layer,
      ),
    });
  }
  function reorder(index: number, delta: number) {
    const next = [...layers];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onLayerChange({ ...plan, layers: next });
  }
  return (
    <div className="layer-panel panel-section">
      <p className="muted">
        Layers let you show, hide or lock parts of your drawing together. For
        example, keep furniture on its own layer so you can hide it to see the
        layout. Leave everything on Default for a simple sketch.
      </p>
      <label className="field">
        <span>Add new objects to</span>
        <select
          aria-label="Active layer"
          value={active.id}
          onChange={(event) =>
            onLayerChange({ ...plan, activeLayerId: event.target.value })
          }
        >
          {layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>
      </label>
      <form
        className="layer-add"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || layers.length >= 100) return;
          const id = uid();
          onLayerChange({
            ...plan,
            activeLayerId: id,
            layers: [
              ...layers,
              { id, name: trimmed, locked: false, visible: true },
            ],
          });
          setName("");
        }}
      >
        <input
          aria-label="New layer name"
          maxLength={200}
          placeholder="Layer name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={!name.trim() || layers.length >= 100}>
          Add layer
        </button>
      </form>
      {layers.map((layer, index) => (
        <div key={layer.id} className="layer-row">
          <input
            aria-label={`Rename ${layer.name} layer`}
            title="Rename layer"
            key={layer.name}
            defaultValue={layer.name}
            maxLength={200}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== layer.name)
                updateLayer(layer.id, { name: value });
              else event.target.value = layer.name;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <button
            aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name} layer`}
            title={layer.visible ? "Hide layer" : "Show layer"}
            onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
          >
            {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name} layer`}
            title={layer.locked ? "Unlock layer" : "Lock layer"}
            onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
          >
            {layer.locked ? (
              <LockKeyhole size={15} />
            ) : (
              <UnlockKeyhole size={15} />
            )}
          </button>
          <button
            aria-label={`Move ${layer.name} layer earlier`}
            title="Draw earlier"
            disabled={!index}
            onClick={() => reorder(index, -1)}
          >
            <ArrowUp size={15} />
          </button>
          <button
            aria-label={`Move ${layer.name} layer later`}
            title="Draw later"
            disabled={index === layers.length - 1}
            onClick={() => reorder(index, 1)}
          >
            <ArrowDown size={15} />
          </button>
          {layer.id !== defaultLayer.id && (
            <button
              aria-label={`Delete ${layer.name} layer`}
              title={`Delete layer and move its objects to ${layers.find((entry) => entry.id === defaultLayer.id)?.name}`}
              disabled={layer.locked}
              onClick={() => onLayerChange(deleteLayer(plan, layer.id))}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <button
        disabled={!canMove || active.locked || !active.visible}
        onClick={() => {
          try {
            onMove(moveToLayer(plan, selection, active.id));
          } catch (error) {
            onError((error as Error).message);
          }
        }}
      >
        Move selected to active layer
      </button>
    </div>
  );
}
