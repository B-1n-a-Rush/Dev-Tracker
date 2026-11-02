export interface ExportLayer {
  readonly id: string;
  readonly title: string;
  readonly help: string;
  readonly available: boolean;
  readonly checked: boolean;
}

export interface ExportSnapshot {
  readonly layers: readonly ExportLayer[];
  readonly isAdmin: boolean;
  readonly includeDrafts: boolean;
  readonly busy: boolean;
  readonly message: string;
  readonly error: boolean;
}

export interface ExportActions {
  toggleLayer(id: string, checked: boolean): void;
  selectAll(): void;
  clearSelection(): void;
  refresh(): void;
  setIncludeDrafts(checked: boolean): void;
  download(): void;
  close(): void;
  help(): void;
}

export interface ExportBridge {
  getSnapshot(): ExportSnapshot;
  subscribe(listener: () => void): () => void;
  readonly actions: ExportActions;
}
