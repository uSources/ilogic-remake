import type { Block } from '../../patchNotes/markdown';

/** Panel de novedades (notas de parche). */
export interface NotesVM {
  status: 'loading' | 'online' | 'cached' | 'offline';
  /** Version que se esta jugando. */
  current: string;
  repoUrl: string;
  /** Version publicada mas nueva que la que se juega, con su descarga. */
  update: { version: string; url: string } | null;
  items: { version: string; title: string; date: string; isNew: boolean; current: boolean; prerelease: boolean }[];
  selected: number;
  blocks: Block[];
  url: string | null;
}
