import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ExportDialog } from './ExportDialog';
import type { ExportBridge } from './types';

class ExportBoundary extends Component<{ children: ReactNode; close(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Export controls could not render.', error, info.componentStack); }
  render() {
    if (this.state.failed) return (
      <div className="shape-loading">
        <h2 id="shapeExportTitle">Export map data</h2>
        <p role="alert">The export controls could not open. Your tracker data has not changed.</p>
        <button type="button" className="land-button" onClick={() => this.setState({ failed: false })}>Retry export controls</button>
        <button type="button" className="land-button" onClick={this.props.close}>Close shapefile export</button>
      </div>
    );
    return this.props.children;
  }
}

export function mount(container: HTMLElement, bridge: ExportBridge) {
  const root = createRoot(container);
  root.render(<ExportBoundary close={bridge.actions.close}><ExportDialog bridge={bridge} /></ExportBoundary>);
  return { unmount: () => root.unmount() };
}

export {fields,photos,improvements,dispose} from '../editors/Fields';
export {workspace} from '../sr2t/Workspace';
export {project} from '../projects/ProjectProfile';
export {bus} from '../bus/Workspace';

export {infrastructureReview} from '../infrastructure/Review';
