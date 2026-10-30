import type { StoredMemory } from './memory-gateway';
type Entry = { id: string; text: string; sourceTurnId: string | null };
export async function rebuildMemoryEntries(entries: Entry[], backend: {
  all(): Promise<StoredMemory[]>;
  remove(id: string): Promise<unknown>;
  add(entry: Entry): Promise<unknown>;
}) {
  // Preserve completed entries when a bounded worker stops; the next worker resumes the same epoch.
  const existing = await backend.all(), desired = new Map(entries.map(entry => [entry.id, entry]));
  const kept = new Set<string>();
  for (const item of existing) {
    const id = item.metadata?.entryId, entry = id ? desired.get(id) : undefined;
    if (entry && !kept.has(entry.id) && item.memory === entry.text) kept.add(entry.id);
    else await backend.remove(item.id);
  }
  for (const entry of entries) if (!kept.has(entry.id)) await backend.add(entry);
}
