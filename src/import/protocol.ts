// Messages between the importer UI and its workers.

/** Cache Storage bucket the service worker serves ./assets/ from. */
export const ASSET_CACHE = 'sg3-assets-v1';

interface Base {
  /** absolute URL of the assets root, ending with "/" */
  base: string;
}

export type Job = Base &
  (
    | { kind: 'unpack'; exe: File }
    | { kind: 'plan'; sango: File; music: File | null }
    | { kind: 'data'; sango: File }
    | { kind: 'shapes'; sango: File; dirs: { dir: string; files: string[] }[] }
    | { kind: 'music'; music: File; track: string }
  );

export type WorkerMsg =
  | { type: 'progress'; phase: 'scan' | 'unpack'; done: number; total: number }
  | { type: 'done'; result: unknown }
  | { type: 'error'; message: string };
