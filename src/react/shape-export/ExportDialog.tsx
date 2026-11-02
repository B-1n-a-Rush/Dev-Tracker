import { useSyncExternalStore } from 'react';
import { LayerChoices } from './LayerChoices';
import type { ExportBridge } from './types';

export function ExportDialog({ bridge }: { bridge: ExportBridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const actions = bridge.actions;
  const selectedCount = state.layers.filter(layer => layer.checked).length;

  return (
    <div className="shape-react-window" data-react-export="true">
      <div className="shape-head">
        <div>
          <div className="eyebrow">GIS data download</div>
          <h2 id="shapeExportTitle">Export map data</h2>
          <p>Choose layers to download as standard shapefiles.</p>
          <button type="button" className="guide-inline guide-context" aria-haspopup="dialog" onClick={actions.help}>
            Help with shapefile exports
          </button>
        </div>
        <button type="button" className="land-button" id="shapeExportClose" aria-label="Close shapefile export" autoFocus onClick={actions.close}>×</button>
      </div>
      <div className="shape-body">
        <div className="shape-notice">
          The ZIP contains .shp, .shx, .dbf, .prj and .cpg files for each layer, in WGS84.
          Full attribute CSVs and a field-name guide are included. Mixed geometry is split into separate shapefiles.
        </div>
        <div className="land-actions">
          <button type="button" className="land-button" id="shapeExportAll" disabled={state.busy} onClick={actions.selectAll}>Select all available</button>
          <button type="button" className="land-button" id="shapeExportNone" disabled={state.busy} onClick={actions.clearSelection}>Clear selection</button>
          <button type="button" className="land-button" id="shapeExportRefresh" disabled={state.busy} onClick={actions.refresh}>Refresh available layers</button>
        </div>
        <LayerChoices state={state} actions={actions} />
        {state.isAdmin ? (
          <label id="shapeExportDraftLabel" className="shape-drafts" htmlFor="shapeExportDrafts">
            <input type="checkbox" id="shapeExportDrafts" disabled={state.busy} checked={state.includeDrafts} onChange={event => actions.setIncludeDrafts(event.currentTarget.checked)} />
            Include staff-draft SR2T sites (removed sites stay excluded)
          </label>
        ) : null}
        <p className="land-note">
          Published project and route exports include all records, regardless of map filters. Parcels and infrastructure use loaded source data.
          Drawn areas and walking results use the current analysis. Private staff notes, plans and signed links are excluded. Basemap imagery is not included.
        </p>
      </div>
      <div className="shape-footer">
        <p id="shapeExportMessage" role="status" aria-live="polite" data-error={state.error}>{state.message}</p>
        <button type="button" className="land-button shape-primary" id="shapeExportDownload" disabled={state.busy || selectedCount === 0} onClick={actions.download}>
          {state.busy ? 'Preparing download…' : 'Download shapefiles (.zip)'}
        </button>
      </div>
    </div>
  );
}
