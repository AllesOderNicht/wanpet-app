import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { SpeechJobView } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { GameService, Identity } from './service';
import { Config } from './config';
import { ApiError } from './errors';
import { object } from './security';

export function speechAudio(input: unknown): Buffer {
  const body = object(input, ['audio']);
  if (typeof body.audio !== 'string' || body.audio.length > 2600000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) throw new ApiError(400, 'INVALID_AUDIO', 'Use a WAV recording of at most 60 seconds');
  const audio = Buffer.from(body.audio, 'base64');
  if (audio.toString('base64') !== body.audio || audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new ApiError(400, 'INVALID_AUDIO', 'Invalid WAV file');
  let format = false, samples = 0;
  for (let pos = 12; pos + 8 <= audio.length;) {
    const name = audio.toString('ascii', pos, pos + 4), size = audio.readUInt32LE(pos + 4), start = pos + 8;
    if (size > audio.length - start) throw new ApiError(400, 'INVALID_AUDIO', 'Truncated WAV file');
    if (name === 'fmt ') format = size >= 16 && audio.readUInt16LE(start) === 1 && audio.readUInt16LE(start + 2) === 1 && audio.readUInt32LE(start + 4) === 16000 && audio.readUInt16LE(start + 14) === 16;
    if (name === 'data') samples += size;
    pos = start + size + size % 2;
  }
  if (!format || samples < 3200 || samples > 1920000 || samples % 2) throw new ApiError(400, 'INVALID_AUDIO', 'Use mono 16 kHz PCM16 audio, 0.1–60 seconds');
  return audio;
}
export type Transcriber = (audio: Buffer, signal: AbortSignal) => Promise<string>;
export function cloudTranscriber(config: NonNullable<Config['speech']>): Transcriber {
  return async (audio, signal) => {
    const response = await fetch(config.baseUrl + '/chat/completions', { method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,' + audio.toString('base64') } }] }], stream: false }) });
    if (!response.ok) throw new Error('ASR_FAILED');
    const reader = response.body?.getReader(); if (!reader) throw new Error('ASR_FAILED');
    let raw = ''; const decoder = new TextDecoder();
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; raw += decoder.decode(chunk.value, { stream: true }); if (raw.length > 32000) throw new Error('ASR_FAILED'); } }
    finally { await reader.cancel(); }
    const text: unknown = JSON.parse(raw).choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('ASR_EMPTY_OR_TOO_LONG');
    return text.trim();
  };
}
export class SpeechService implements OnModuleInit, OnModuleDestroy {
  private tasks = new Map<string, { abort: AbortController; audio: Buffer }>();
  private timer?: ReturnType<typeof setInterval>;
  constructor(private game: GameService, public transcribe?: Transcriber) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.game.db.speechJob.updateMany({ where: { status: { in: ['queued', 'running'] }, createdAt: { lt: new Date(Date.now() - 60000) } }, data: { status: 'failed', error: 'ASR_INTERRUPTED' } }).catch(() => {});
      void this.game.db.speechJob.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 900000) } }, data: { text: '' } }).catch(() => {});
    }, 15000); this.timer.unref();
  }
  onModuleDestroy() { clearInterval(this.timer); for (const task of this.tasks.values()) { task.abort.abort(); task.audio.fill(0); } this.tasks.clear(); }
  async submit(identity: Identity, key: string, input: unknown) {
    if (!this.transcribe) throw new ApiError(503, 'ASR_NOT_CONFIGURED', 'Speech input is not configured');
    const audio = speechAudio(input);
    let retained = false;
    try {
    const result = await this.game.mutate(identity, key, 'speech.submit', input, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('wanpet:speech-capacity'))`;
      if (await tx.speechJob.count({ where: { status: { in: ['queued', 'running'] } } }) >= 4 || await tx.speechJob.count({ where: { accountId: identity.accountId, status: { in: ['queued', 'running'] } } }) >= 1) throw new ApiError(429, 'ASR_BUSY', 'A recording is already being recognized');
      const job = await tx.speechJob.create({ data: { accountId: identity.accountId } });
      return { status: 202, body: { id: job.id } };
    });
    if (!this.tasks.has(result.body.id)) {
      const claim = await this.game.db.speechJob.updateMany({ where: { id: result.body.id, status: 'queued' }, data: { status: 'running' } });
      if (claim.count) {
        const abort = new AbortController(); this.tasks.set(result.body.id, { abort, audio }); retained = true;
        void this.run(result.body.id, audio, abort);
      }
    }
    return result;
    } finally { if (!retained) audio.fill(0); }
  }
  private async run(id: string, audio: Buffer, abort: AbortController) {
    const timer = setTimeout(() => abort.abort(), 45000);
    try {
      const text = await this.transcribe!(audio, abort.signal);
      await this.game.db.speechJob.updateMany({ where: { id, status: 'running' }, data: { status: 'completed', text } });
    } catch { await this.game.db.speechJob.updateMany({ where: { id, status: 'running' }, data: { status: 'failed', error: abort.signal.aborted ? 'ASR_TIMEOUT' : 'ASR_FAILED' } }).catch(() => {}); }
    finally { clearTimeout(timer); audio.fill(0); this.tasks.delete(id); }
  }
  async get(identity: Identity, id: string): Promise<SpeechJobView> {
    const job = await this.game.db.speechJob.findFirst({ where: { id, accountId: identity.accountId } });
    if (!job) throw new ApiError(404, 'ASR_NOT_FOUND', 'Recording task was not found');
    return { id, status: job.status as SpeechJobView['status'], text: job.text, error: job.error };
  }
  async cancel(identity: Identity, key: string, id: string) {
    const result = await this.game.mutate(identity, key, 'speech.cancel', { id }, async tx => {
      const job = await tx.speechJob.findFirst({ where: { id, accountId: identity.accountId } });
      if (!job) throw new ApiError(404, 'ASR_NOT_FOUND', 'Recording task was not found');
      await tx.speechJob.update({ where: { id }, data: { status: 'cancelled', text: '' } });
      return { status: 200, body: { id } };
    });
    this.tasks.get(id)?.abort.abort(); return result;
  }
}
