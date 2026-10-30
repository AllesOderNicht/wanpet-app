import type {AuthResponse, PlayerSnapshot, RewardLine, CatLifeView, CatLifeRequest, PetProfileView, PetProfileRequest, PetCareRequest} from '../../../../packages/contracts/src/index';
import * as wire from './wire';
export type Pending = {accountId: string; operation: 'initialize' | 'start' | 'claim'; path: string; body: Record<string, unknown>; key: string};
export type SessionState = {
  account: AuthResponse['account'] | null; snapshot: PlayerSnapshot | null; pending: Pending | 'invalid' | null;
  busy: boolean; online: boolean; error: string | null; rewards: RewardLine[]; life?: CatLifeView | null;
  restoring: boolean; restorePending: boolean;
  chatPending?: boolean; lastClaimTripId?: string; petPending?: boolean; petBusy?: boolean; petError?: string | null; profile?: PetProfileView | null;
};
export interface Journal {read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void>; remove(key: string): Promise<void>}
type Result = {status: number; body?: unknown; code?: string};
export class Session {
  state: SessionState = {account: null, snapshot: null, pending: null, busy: false, online: false, error: null, rewards: [], restoring: true, restorePending: false};
  private token = '';
  private generation = 0;
  private refreshing = false;
  private acceptedAt = 0;
  private listeners = new Set<() => void>();
  private lifeQueue: Promise<void> = Promise.resolve();
  private lifeQueued = 0;
  private chatWriting = false;
  private credentialQueue: Promise<void> = Promise.resolve();
  private restoration: Promise<void> | null = null;
  constructor(private options: {baseURL: string; development: boolean; journal: Journal; credentials: Journal; key: () => string; now: () => number; fetch: typeof fetch}) {
    if (!wire.endpointAllowed(options.baseURL, options.development)) throw new Error('INVALID_ENDPOINT');
  }
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  getSnapshot = () => this.state;
  clearError() {this.set({error: null});}
  private set(value: Partial<SessionState>) {this.state = {...this.state, ...value}; this.listeners.forEach(fn => fn());}
  private journalKey() {return JSON.stringify([this.options.baseURL, this.state.account?.id]);}
  private async request(path: string, method = 'GET', body?: unknown, key?: string, authenticated = true): Promise<Result> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const headers: Record<string,string> = {Accept: 'application/json'};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (authenticated && this.token) headers.Authorization = `Bearer ${this.token}`;
      if (key) headers['Idempotency-Key'] = key;
      // The native transport adapter must enforce this redirect policy; RN fetch alone does not guarantee it.
      const init: RequestInit & {redirect: 'error'} = {method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, redirect: 'error'};
      const response = await this.options.fetch(this.options.baseURL + path, init);
      if (response.status === 204) return {status: 204, body: {}};
      const raw = await response.text();
      if (raw.length > 2 * 1024 * 1024) return {status: response.status, code: 'INVALID_RESPONSE'};
      let parsed: unknown;
      try {parsed = JSON.parse(raw);} catch {return {status: response.status, code: 'INVALID_RESPONSE'};}
      if (!wire.record(parsed)) return {status: response.status, code: 'INVALID_RESPONSE'};
      return response.ok ? {status: response.status, body: parsed} : {status: response.status, code: typeof parsed.code === 'string' ? parsed.code : 'SERVER_ERROR'};
    } catch {return {status: 0, code: 'NETWORK'};} finally {clearTimeout(timeout);}
  }
  private ownedSnapshot(value: unknown): value is PlayerSnapshot {
    return wire.snapshot(value) && value.player.accountId === this.state.account?.id
      && (!this.state.snapshot || (value.player.id === this.state.snapshot.player.id && value.pet.id === this.state.snapshot.pet.id));
  }
  private accept(value: unknown) {
    if (!this.ownedSnapshot(value)) return false;
    if (!wire.accepts(this.state.snapshot, value)) return false;
    this.acceptedAt = this.options.now(); this.set({snapshot: value}); return true;
  }
  secondsRemaining() {
    const s = this.state.snapshot;
    return s?.activeTrip ? Math.max(0, Math.ceil((Date.parse(s.activeTrip.returnAt) - Date.parse(s.serverNow) - Math.max(0, this.options.now() - this.acceptedAt)) / 1000)) : 0;
  }
  private async readPending(): Promise<Pending | 'invalid' | null> {
    try {
      const raw = await this.options.journal.read(this.journalKey()); if (raw === null) return null;
      const v: unknown = JSON.parse(raw);
      if (!wire.record(v) || v.accountId !== this.state.account?.id || !wire.record(v.body) || typeof v.key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(v.key)) return 'invalid';
      const pathValid = v.operation === 'initialize' ? v.path === '/me/initialize' : v.operation === 'start' ? v.path === '/me/trips' : v.operation === 'claim' && typeof v.path === 'string' && /^\/me\/trips\/[a-f0-9-]{36}\/claim$/.test(v.path);
      return pathValid ? v as Pending : 'invalid';
    } catch {return 'invalid';}
  }
  private credentialKey() {return 'session-v1:' + this.options.baseURL;}
  private credentialTask(action: () => Promise<void>) {
    const task = this.credentialQueue.then(action);
    this.credentialQueue = task.catch(() => {});
    return task;
  }
  restore(): Promise<void> {
    if (this.restoration) return this.restoration;
    this.restoration = this.restoreStored().finally(() => {this.restoration = null;});
    return this.restoration;
  }
  private async restoreStored() {
    if (this.state.account) return;
    const epoch = ++this.generation;
    this.set({restoring: true, restorePending: false, error: null});
    try {
      await this.credentialQueue;
      const raw = await this.options.credentials.read(this.credentialKey());
      if (epoch !== this.generation) return;
      if (raw === null) {this.set({restoring: false}); return;}
      const stored: unknown = JSON.parse(raw);
      if (!wire.auth(stored)) throw new Error('CREDENTIAL_STORAGE');
      this.token = stored.accessToken;
      const result = await this.request('/auth/session');
      if (epoch !== this.generation) return;
      if (result.status === 401) {await this.expire('UNAUTHENTICATED'); return;}
      if (result.code || !wire.session(result.body) || result.body.account.id !== stored.account.id) {
        this.set({restoring: false, restorePending: true, error: result.code ?? 'INVALID_RESPONSE'}); return;
      }
      await this.openAccount(result.body.account, epoch);
    } catch {
      if (epoch === this.generation) this.set({restoring: false, restorePending: true, error: 'CREDENTIAL_STORAGE'});
    }
  }
  async authenticate(email: string, password: string, registration = false, username?: string) {
    if (this.state.busy) return false;
    const epoch = ++this.generation; this.set({busy: true, restoring: false, restorePending: false, error: null});
    const body = registration ? {email, username, password} : {email, password};
    const result = await this.request(registration ? '/auth/register' : '/auth/login', 'POST', body, undefined, false);
    if (epoch !== this.generation) return false;
    if (result.code || !wire.auth(result.body)) {this.set({busy: false, error: result.code ?? 'INVALID_RESPONSE'}); return false;}
    this.token = result.body.accessToken;
    const auth = result.body;
    try {
      await this.credentialTask(async () => {if (epoch === this.generation) await this.options.credentials.write(this.credentialKey(), JSON.stringify(auth));});
    } catch {
      if (epoch !== this.generation) return false;
      await this.request('/auth/logout', 'POST', {});
      await this.expire(); this.set({error: 'CREDENTIAL_STORAGE'}); return false;
    }
    if (epoch !== this.generation) return false;
    await this.openAccount(auth.account, epoch);
    return true;
  }
  private async openAccount(account: AuthResponse['account'], epoch: number) {
    this.set({account, snapshot: null, pending: null, online: true, restoring: false, restorePending: false, rewards: [], lastClaimTripId: undefined, life: null, chatPending: false, petPending: false, petBusy: false, petError: null, profile: null});
    const pending = await this.readPending();
    if (epoch !== this.generation) return false;
    this.set({busy: false, pending, error: pending === 'invalid' ? 'STORAGE' : null});
    await this.refresh(true);
    if (epoch !== this.generation) return;
    try {const raw=await this.options.journal.read(this.journalKey()+':pet-command');if(epoch===this.generation)this.set({petPending:raw!==null});}
    catch {if(epoch===this.generation)this.set({petPending:true,petError:'STORAGE'});}
  }
  async refresh(initialize = false) {
    if (!this.token || this.refreshing) return;
    this.refreshing = true; const epoch = this.generation;
    const result = await this.request('/me/snapshot');
    if (epoch !== this.generation) return;
    this.refreshing = false;
    if (result.code === 'PLAYER_NOT_INITIALIZED' && initialize) {
      if (!this.state.pending) await this.mutate('initialize', '/me/initialize', {});
      else if (this.state.pending !== 'invalid' && this.state.pending.operation === 'initialize') await this.retryPending();
      return;
    }
    if (result.code || !this.ownedSnapshot(result.body)) {
      if (result.status === 401) {await this.expire('UNAUTHENTICATED'); return;}
      this.set({online: false, error: result.code ?? 'INVALID_RESPONSE'});
    } else {
      this.accept(result.body);
      // A successful read resolves a read outage, but not an unknown write outcome.
      const recovered = this.state.error === 'NETWORK' && !this.state.pending;
      this.set({online: true, ...(recovered ? {error: null} : {})});
    }
  }
  private async mutate(operation: Pending['operation'], path: string, body: Record<string, unknown>) {
    if (!this.token || !this.state.account || this.state.busy || this.state.pending) return;
    const epoch = this.generation;
    this.set({busy: true, error: null});
    let pending: Pending;
    try {
      const key = this.options.key();
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new Error('STORAGE');
      pending = {accountId: this.state.account!.id, operation, path, body, key};
      await this.options.journal.write(this.journalKey(), JSON.stringify(pending));
    }
    catch {if (epoch === this.generation) this.set({busy: false, error: 'STORAGE'}); return;}
    if (epoch !== this.generation) return;
    this.set({pending, busy: false}); await this.retryPending();
  }
  async startTrip(ids: string[]) {
    const s = this.state.snapshot;
    if (!s || !this.state.online || s.activeTrip) return;
    await this.mutate('start', '/me/trips', {loadoutItemIds: [...ids].sort(), expectedRevision: s.revision});
  }
  async claimTrip() {
    const s = this.state.snapshot;
    if (!s?.activeTrip || !this.state.online) return;
    await this.mutate('claim', `/me/trips/${s.activeTrip.id}/claim`, {});
  }
  async retryPending() {
    const pending = this.state.pending;
    if (!pending || pending === 'invalid' || !this.token || this.state.busy) return;
    const epoch = this.generation; this.set({busy: true, error: null});
    const result = await this.request(pending.path, 'POST', pending.body, pending.key);
    if (epoch !== this.generation) return;
    let candidate: unknown; let rewards: RewardLine[] | undefined;
    if (!result.code) {
      const b = result.body;
      candidate = pending.operation === 'initialize' ? b : wire.record(b) ? b.snapshot : undefined;
      let valid = this.ownedSnapshot(candidate);
      if (pending.operation === 'start') valid = valid && wire.record(b) && wire.trip(b.trip);
      if (pending.operation === 'claim') {
        valid = valid && wire.record(b) && b.tripId === pending.path.split('/')[3] && typeof b.ledgerEntryId === 'string' && wire.lines(b.rewards);
        if (valid && wire.record(b)) rewards = b.rewards as RewardLine[];
      }
      if (!valid) result.code = 'INVALID_RESPONSE';
    }
    const definiteRejection = result.status >= 400 && result.status < 500 && result.status !== 401 && result.status !== 429 && result.code !== 'INVALID_RESPONSE';
    if (!result.code || definiteRejection) {
      try {await this.options.journal.remove(this.journalKey());}
      catch {this.set({busy: false, error: 'STORAGE'}); return;}
      if (epoch !== this.generation) return;
      if (!result.code) this.accept(candidate);
      this.set({pending: null, ...(rewards ? {rewards, lastClaimTripId: pending.path.split('/')[3]} : {})});
    }
    this.set({busy: false, error: result.code ?? null});
    if (result.status === 401) await this.expire();
    else await this.refresh();
  }
  async logout() {
    if (this.state.busy) return;
    this.set({busy: true}); const epoch = this.generation; await this.request('/auth/logout','POST',{});
    if (epoch !== this.generation) return;
    this.set({busy: false});
    await this.expire();
  }
  advanceLife(input: Omit<CatLifeRequest,'expectedRevision'>): Promise<void> {
    if(!this.token||!this.state.snapshot||this.lifeQueued>=8)return Promise.resolve();
    const epoch=this.generation;this.lifeQueued++;
    const task=this.lifeQueue.then(async()=>{
      if(epoch!==this.generation)return;
      const journalKey=this.journalKey()+':cat-life';
      const accountId=this.state.account!.id;
      const send=async(pending:{accountId:string;key:string;body:CatLifeRequest})=>{
        const result=await this.request('/me/pet/life','POST',pending.body,pending.key);
        if(epoch!==this.generation)return false;
        if(result.status===401){await this.expire();return false;}
        const valid=!result.code&&wire.catLife(result.body)&&result.body.petId===this.state.snapshot?.pet.id;
        if(valid)this.acceptChatLife(result.body);
        const rejected=result.status>=400&&result.status<500&&result.status!==429&&result.code!=='INVALID_RESPONSE';
        if(valid||rejected)await this.options.journal.remove(journalKey);
        return valid;
      };
      try {
        const raw=await this.options.journal.read(journalKey);
        if(epoch!==this.generation)return;
        if(raw){const pending:unknown=JSON.parse(raw);if(!wire.record(pending)||pending.accountId!==accountId||typeof pending.key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(pending.key)||!wire.catRequest(pending.body))return;
          if(!await send(pending as {accountId:string;key:string;body:CatLifeRequest})||epoch!==this.generation)return;
        }
        const key=this.options.key();if(!/^[A-Za-z0-9_-]{16,128}$/.test(key))return;
        const pending={accountId,key,body:{...input,protocolVersion:2 as const,expectedRevision:this.state.life?.revision??0}};
        await this.options.journal.write(journalKey,JSON.stringify(pending));
        if(epoch===this.generation)await send(pending);
      } catch { /* Keep the receipt for the next life event; local cat behavior continues. */ }
    }).finally(()=>{this.lifeQueued--;});
    this.lifeQueue=task.catch(()=>{});return task;
  }
  async changePassword(currentPassword: string, newPassword: string) {
    if (this.state.busy) return;
    this.set({busy: true}); const epoch = this.generation;
    const r = await this.request('/auth/password', 'PUT', {currentPassword, newPassword});
    if (epoch !== this.generation) return;
    this.set({busy: false});
    if (!r.code || r.status === 401) await this.expire(); else this.set({error: r.code});
  }
  async chatRead(path:string):Promise<unknown> {
    const epoch=this.generation;if(!this.token)throw new Error('UNAUTHENTICATED');
    const result=await this.request(path);if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
    if(result.status===401)await this.expire();if(result.code)throw new Error(result.code);return result.body;
  }
  acceptChatLife(value:unknown) {
    if(wire.catLife(value)&&value.petId===this.state.snapshot?.pet.id&&(!this.state.life||value.revision>=this.state.life.revision)) {
      const profile=value.profile;
      this.set({life:value,...(profile&&(!this.state.profile||profile.revision>=this.state.profile.revision)?{profile}:{})});
    }
  }
  async refreshPet() {
    const epoch=this.generation;if(!this.token)return;
    const result=await this.request('/me/pet/life');if(epoch!==this.generation)return;
    if(result.status===401){await this.expire();return;}
    if(!result.code)this.acceptChatLife(result.body);
  }
  care(operation:PetCareRequest['operation'],source:PetCareRequest['source']='basic'):Promise<void> {
    return this.petCommand({path:'/me/pet/care',body:()=>({operation,source,expectedRevision:this.state.life?.revision??0})});
  }
  saveProfile(input:PetProfileRequest):Promise<void> {
    return this.petCommand({path:'/me/pet/profile',body:()=>({...input,temperament:{...input.temperament}})});
  }
  retryPetCommand():Promise<void> {return this.petCommand();}
  private petCommand(fresh?:{path:'/me/pet/care'|'/me/pet/profile';body:()=>PetCareRequest|PetProfileRequest}):Promise<void> {
    if(!this.token||!this.state.account)return Promise.reject(new Error('UNAUTHENTICATED'));
    if(this.state.petBusy)return Promise.reject(new Error('PET_BUSY'));
    const epoch=this.generation,scope=this.journalKey()+':pet-command',accountId=this.state.account.id;
    this.set({petBusy:true,petError:null});
    const task=this.lifeQueue.then(async()=>{
      if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
      let raw=await this.options.journal.read(scope);
      if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
      if(raw&&fresh){this.set({petPending:true});throw new Error('PET_PENDING');}
      if(!raw){
        if(!fresh){this.set({petPending:false});return;}
        const body=fresh.body();
        if(!(fresh.path==='/me/pet/care'?wire.petCareRequest(body):wire.petProfileRequest(body)))throw new Error('INVALID_INPUT');
        const key=this.options.key();if(!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new Error('STORAGE');
        raw=JSON.stringify({accountId,path:fresh.path,body,key});await this.options.journal.write(scope,raw);
      }
      if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
      this.set({petPending:true});
      const pending:unknown=JSON.parse(raw);
      if(!wire.record(pending)||pending.accountId!==accountId||typeof pending.key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(pending.key)||
        !(pending.path==='/me/pet/care'?wire.petCareRequest(pending.body):pending.path==='/me/pet/profile'&&wire.petProfileRequest(pending.body)))throw new Error('STORAGE');
      const result=await this.request(pending.path as string,'POST',pending.body,pending.key);
      if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
      const body=result.body;
      const valid=!result.code&&(pending.path==='/me/pet/profile'
        ?wire.petProfile(body)&&body.petId===this.state.snapshot?.pet.id
        :wire.record(body)&&wire.catLife(body.life)&&body.life.petId===this.state.snapshot?.pet.id&&this.ownedSnapshot(body.snapshot));
      const rejected=result.status>=400&&result.status<500&&result.status!==401&&result.status!==429&&result.code!=='INVALID_RESPONSE';
      if(valid||rejected){
        await this.options.journal.remove(scope);if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');this.set({petPending:false});
      }
      if(result.status===401)await this.expire();
      if(!valid){if(rejected){await this.refreshPet();await this.refresh();}throw new Error(result.code??'INVALID_RESPONSE');}
      if(pending.path==='/me/pet/profile') {
        const profile=body as PetProfileView;
        if(!this.state.profile||profile.revision>=this.state.profile.revision)this.set({profile});
        await this.refreshPet();await this.refresh();
      }else if(wire.record(body)){this.acceptChatLife(body.life);this.accept(body.snapshot);}
    }).catch(error=>{if(epoch===this.generation)this.set({petError:error instanceof Error?error.message:'STORAGE'});throw error;})
      .finally(()=>{if(epoch===this.generation)this.set({petBusy:false});});
    this.lifeQueue=task.catch(()=>{});return task;
  }
  private chatPath(path:unknown):path is string {return typeof path==='string'&&/^\/me\/pet\/(chat(?:\/[a-f0-9-]{36}\/(?:stop|retry|delete))?|images\/[a-f0-9-]{36}\/(?:confirm|retry|cancel)|memories\/(?:clear|[a-f0-9-]{36}\/(?:update|delete)))$/.test(path);}
  imageSource(id:string,preview=true){
    if(!/^[a-f0-9-]{36}$/.test(id)||!this.token)throw new Error('UNAUTHENTICATED');
    return {uri:this.options.baseURL+`/me/media/${id}/content?preview=${preview?'1':'0'}`,headers:{Authorization:`Bearer ${this.token}`},cache:'reload' as const};
  }
  async imageUpload(data:string,key:string):Promise<unknown>{return this.imageWrite('/me/media',{data},key);}
  async discardImage(id:string,key:string):Promise<unknown>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_INPUT');return this.imageWrite(`/me/media/${id}/delete`,{},key);}
  private async imageWrite(path:string,body:Record<string,unknown>,key:string):Promise<unknown>{
    if(!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new Error('INVALID_INPUT');
    const epoch=this.generation;if(!this.token)throw new Error('UNAUTHENTICATED');
    const result=await this.request(path,'POST',body,key);if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
    if(result.status===401)await this.expire();if(result.code)throw new Error(result.code);return result.body;
  }
  async checkChatPending() {
    const epoch=this.generation;const raw=await this.options.journal.read(this.journalKey()+':chat');
    if(epoch===this.generation)this.set({chatPending:raw!==null});
  }
  async chatWrite(path:string,body:Record<string,unknown>):Promise<unknown> {
    if(!this.chatPath(path))throw new Error('INVALID_INPUT');return this.performChatWrite({path,body});
  }
  async retryChatWrite():Promise<unknown> {return this.performChatWrite();}
  private async performChatWrite(fresh?:{path:string;body:Record<string,unknown>}):Promise<unknown> {
    if(!this.token||!this.state.account)throw new Error('UNAUTHENTICATED');
    if(this.chatWriting)throw new Error('CHAT_BUSY');this.chatWriting=true;
    const epoch=this.generation,scope=this.journalKey()+':chat',accountId=this.state.account.id;
    try {
      let raw=await this.options.journal.read(scope);if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
      if(raw&&fresh){this.set({chatPending:true});throw new Error('CHAT_PENDING');}
      if(!raw){
        if(!fresh){this.set({chatPending:false});return {};}
        const key=this.options.key();if(!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new Error('STORAGE');
        raw=JSON.stringify({...fresh,key,accountId});await this.options.journal.write(scope,raw);
      }
      if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');this.set({chatPending:true});
      const pending:unknown=JSON.parse(raw);
      if(!wire.record(pending)||pending.accountId!==accountId||!this.chatPath(pending.path)||!wire.record(pending.body)||typeof pending.key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(pending.key))throw new Error('STORAGE');
      const result=await this.request(pending.path,'POST',pending.body,pending.key);if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
      const valid=!result.code&&wire.record(result.body)&&(pending.path.startsWith('/me/pet/memories/')?result.body.changed===true:typeof result.body.id==='string'&&/^[a-f0-9-]{36}$/.test(result.body.id)&&(pending.path==='/me/pet/chat'||pending.path.split('/')[4]===result.body.id));
      const rejected=result.status>=400&&result.status<500&&result.status!==401&&result.status!==429&&result.code!=='INVALID_RESPONSE';
      if(valid||rejected){await this.options.journal.remove(scope);if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');this.set({chatPending:false});}
      if(result.status===401)await this.expire();if(!valid)throw new Error(result.code??'INVALID_RESPONSE');return result.body;
    } finally {this.chatWriting=false;}
  }
  async speechWrite(path:string,body:Record<string,unknown>,key:string):Promise<unknown> {
    if(!/^\/me\/pet\/speech(?:\/[a-f0-9-]{36}\/cancel)?$/.test(path)||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new Error('INVALID_INPUT');
    const epoch=this.generation;if(!this.token)throw new Error('UNAUTHENTICATED');
    const result=await this.request(path,'POST',body,key);if(epoch!==this.generation)throw new Error('ACCOUNT_CHANGED');
    if(result.status===401)await this.expire();if(result.code)throw new Error(result.code);return result.body;
  }
  private async expire(error: string | null = null) {
    const epoch = ++this.generation; this.token = ''; this.refreshing = false;
    this.set({account: null, snapshot: null, pending: null, busy: false, online: false, error, restoring: false, restorePending: false, rewards: [], lastClaimTripId: undefined, life: null, chatPending:false, petPending:false, petBusy:false, petError:null, profile:null});
    try {await this.credentialTask(() => this.options.credentials.remove(this.credentialKey()));}
    catch {if (epoch === this.generation) this.set({error: 'CREDENTIAL_STORAGE', restorePending: true});}
  }
}
