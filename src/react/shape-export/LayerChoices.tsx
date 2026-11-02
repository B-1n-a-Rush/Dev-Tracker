import type { ExportActions, ExportSnapshot } from './types';

export function LayerChoices({ state, actions }: { state: ExportSnapshot; actions: ExportActions }) {
  return (
    <div id="shapeExportChoices" className="shape-choices" aria-busy={state.busy}>
      {state.layers.map(layer => (
        <label key={layer.id} className="shape-choice" htmlFor={`shape-layer-${layer.id}`}>
          <input
            id={`shape-layer-${layer.id}`}
            type="checkbox"
            data-shape-layer={layer.id}
            checked={layer.checked}
            disabled={state.busy || !layer.available}
            aria-describedby={`shape-layer-help-${layer.id}`}
            onChange={event => actions.toggleLayer(layer.id, event.currentTarget.checked)}
          />
          <span>
            <strong>{layer.title}</strong>
            <small id={`shape-layer-help-${layer.id}`}>
              {layer.help}{layer.available ? '' : ' Open or calculate this layer first.'}
            </small>
          </span>
        </label>
      ))}
    </div>
  );
}
