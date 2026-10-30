import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config';
export interface StoredMemory { id: string; memory: string; metadata?: { entryId?: string; sourceTurnId?: string }; score?: number }
export interface MemoryBackend {
  search(scope: string, query: string): Promise<StoredMemory[]>;
  extract(scope: string, text: string, sourceTurnId: string): Promise<StoredMemory[]>;
  rebuild(scope: string, items: Array<{ id: string; text: string; sourceTurnId: string | null }>): Promise<StoredMemory[]>;
  purge(scope: string): Promise<void>;
  close(): void;
}
export class Mem0Gateway implements MemoryBackend {
  private children = new Set<ReturnType<typeof fork>>();
  constructor(private config: Pick<Config, 'chat' | 'memory'>) {}
  private async call(operation: string, scope: string, payload: Record<string, unknown> = {}): Promise<StoredMemory[]> {
    if (!this.config.memory || !this.config.chat) throw new Error('MEMORY_UNAVAILABLE');
    const js = join(__dirname, 'memory-worker.js'), built = existsSync(js);
    return new Promise((resolve, reject) => {
      // Isolate SDK logs, telemetry, open connections and timeouts from the API process.
      const child = fork(built ? js : join(__dirname, 'memory-worker.ts'), [], {
        execArgv: built ? [] : ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { PATH: process.env.PATH, MEM0_TELEMETRY: 'false', MEM0_NOTICES: 'false' },
      });
      this.children.add(child);
      let result: StoredMemory[] | undefined;
      let fault: unknown;
      const timeout = setTimeout(() => child.kill('SIGKILL'), ['extract', 'rebuild'].includes(operation) ? 120000 : 10000);
      child.on('message', (message: unknown) => { if (message && typeof message === 'object') { if ('items' in message && Array.isArray(message.items)) result = message.items; if ('fault' in message) fault = message.fault; } });
      child.on('error', () => { clearTimeout(timeout); this.children.delete(child); reject(new Error('MEMORY_UNAVAILABLE')); });
      child.on('exit', code => { clearTimeout(timeout); this.children.delete(child); if (code === 0 && result) resolve(result); else { console.warn(JSON.stringify({ event: 'memory_unavailable', operation, fault: fault ?? 'worker_interrupted' })); reject(new Error('MEMORY_UNAVAILABLE')); } });
      child.send({ operation, scope, ...payload, config: this.config });
    });
  }
  search(scope: string, query: string) { return this.call('search', scope, { query }); }
  extract(scope: string, text: string, sourceTurnId: string) { return this.call('extract', scope, { text, sourceTurnId }); }
  rebuild(scope: string, items: Array<{ id: string; text: string; sourceTurnId: string | null }>) { return this.call('rebuild', scope, { items }); }
  async purge(scope: string) { await this.call('purge', scope); }
  close() { for (const child of this.children) child.kill('SIGKILL'); }
}
