import { SafeError, sourceReadError } from '../host/safe-errors.mjs';
const keyOf = record => JSON.stringify([record.kind, record.externalId]);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** No host services or IO: every effect crosses a supplied port. */
export function createWorkbench({ storage, clock }) {
  const domains = new Map(), sources = new Map(), metrics = new Map(), pending = new Map(), timers = new Map(), failures = new Map();
  const changing = new Set(), changes = new Set();
  let closed = false;
  const assertOpen = () => { if (closed) throw Error('workbench closed'); };
  const saved = id => storage.list().find(row => row.id === id);
  const metadata = source => ({ id:source.id, domain:source.domain, title:source.title, kind:source.kind,
    input:source.input, accept:source.accept || '', capabilities:source.capabilities() });

  function registerDomain(domain) {
    assertOpen();
    if (!domain.id || domains.has(domain.id)) throw Error('duplicate or missing domain id');
    domains.set(domain.id, domain);
    return () => {
      if ([...sources.values()].some(s => s.domain === domain.id)) throw Error('unregister sources before domain');
      domains.delete(domain.id);
    };
  }
  function register(source, input) {
    assertOpen();
    if (!domains.has(source.domain)) throw Error('unknown domain');
    if (changing.has(source.id)) throw new SafeError('BUSY');
    if (!source.id || sources.has(source.id) || pending.has(source.id)) throw Error('duplicate or busy source id');
    const old = saved(source.id);
    if (old && (old.domain !== source.domain || old.kind !== source.kind || (old.input && old.input !== input))) throw Error('source identity changed: use a new id');
    if (source.intervalMs !== undefined && (!Number.isSafeInteger(source.intervalMs) || source.intervalMs < 1)) throw Error('invalid intervalMs');
    // Keep callable members live for providers that reconfigure their reader in place.
    source.input = input;
    sources.set(source.id, source);
    if (input === 'source' && source.intervalMs) {
      timers.set(source.id, clock.every(source.intervalMs, async () => {
        if(changing.has(source.id))return;
        try { await sync(source.id); } catch { /* perform persists failure; a timer has no caller to reject to. */ }
      }));
    }
    return () => {
      if (sources.get(source.id) !== source) return;
      timers.get(source.id)?.(); timers.delete(source.id); sources.delete(source.id);
    };
  }
  const registerSource = source => register(source, 'source');
  const registerImporter = importer => register(importer, 'importer');
  function registerMetric(metric) {
    assertOpen();
    if (!domains.has(metric.domain)) throw Error('unknown domain');
    if (metrics.has(metric.id)) throw Error('duplicate metric');
    metrics.set(metric.id, metric);
    return () => metrics.delete(metric.id);
  }
  function snapshot() {
    const rows = new Map(storage.list().map(row => [row.id,row]));
    for (const source of sources.values()) {
      if (!rows.has(source.id)) rows.set(source.id,{...metadata(source),records:[],status:'idle',lastSuccessAt:null,cursor:null});
    }
    return { domains:[...domains.values()].map(({id,title}) => ({id,title})),
      metrics:[...metrics.values()].map(({id,domain,title})=>({id,domain,title})),
      sources:[...rows.values()].map(row => structuredClone({...row,...(sources.has(row.id)?metadata(sources.get(row.id)):{}),...failures.get(row.id),
        registered:sources.has(row.id),
        status:pending.has(row.id)?'syncing':!sources.has(row.id)?'unavailable':failures.has(row.id)?'error':row.status})) };
  }
  function metric(id, options = {}) {
    const definition = metrics.get(id);
    if (!definition) throw Error('metric unavailable');
    const sources = snapshot().sources.filter(source => source.domain === definition.domain);
    return definition.compute({ records:sources.flatMap(source=>source.records), sources, now:clock.now(), options });
  }
  function normalize(records, source, kinds) {
    if (!Array.isArray(records)) throw Error('invalid source records');
    const seen = new Set();
    return records.map(record => {
      if (!kinds.includes(record.kind)) throw Error('unsupported record kind');
      if (typeof record.externalId !== 'string' || !record.externalId || !timestamp(record.observedAt)) throw Error('invalid record identity or observedAt');
      if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) throw Error('invalid record data');
      const key = keyOf(record);
      if (seen.has(key)) throw Error('duplicate record');
      seen.add(key);
      return {...record,sourceId:source.id,domain:source.domain};
    });
  }
  async function perform(source, read, range) {
    const previous = saved(source.id), kinds = domains.get(source.domain).recordKinds;
    let result, row;
    try {
      if (source.check) {
        const check = await source.check();
        if (!check.ok) throw Error('source unavailable');
      }
      result = await read(previous?.cursor ?? null);
      if (!timestamp(result.fetchedAt) || !['replace','merge'].includes(result.mode ?? 'replace')) throw Error('invalid source snapshot');
      if (result.cursor != null && typeof result.cursor !== 'string') throw Error('invalid cursor');
      const next = normalize(result.records, source, kinds);
      const records = new Map((result.mode === 'merge' ? previous?.records || [] : []).map(r=>[keyOf(r),r]));
      for (const removed of result.removed || []) {
        if (!kinds.includes(removed.kind) || typeof removed.externalId !== 'string') throw Error('invalid removal');
        records.delete(keyOf(removed));
      }
      for (const record of next) records.set(keyOf(record),record);
      row = {...metadata(source),records:[...records.values()],range,cursor:result.cursor ?? null,
        fetchedAt:result.fetchedAt,lastSuccessAt:clock.now(),lastAttemptAt:clock.now(),status:'ready',error:null,warnings:structuredClone(result.warnings ?? [])};
    } catch (error) {
      // Arbitrary network errors can contain private ICS URLs; never persist them in the public state.
      await storage.put(source.id,{...previous,...metadata(source),records:previous?.records || [],cursor:previous?.cursor ?? null,
        lastSuccessAt:previous?.lastSuccessAt || null,lastAttemptAt:clock.now(),status:'error',
        error:sourceReadError(error)??{code:'source-read-failed',message:'来源读取或数据校验失败，上次成功数据已保留'}});
      throw error;
    }
    // A storage failure must not cause a second write that could hide its outcome.
    await storage.put(source.id,row);
    return structuredClone(row);
  }
  function run(id, input, operation, range) {
    if (closed) return Promise.reject(Error('workbench closed'));
    if(changing.has(id))return Promise.reject(new SafeError('BUSY'));
    const source = sources.get(id);
    if (!source) return Promise.reject(Error('source unavailable'));
    if (source.input !== input) return Promise.reject(Error(input === 'source' ? 'not a scheduled source' : 'not an importer'));
    if (pending.has(id)) return input === 'source' ? pending.get(id) : Promise.reject(Error('import busy'));
    const promise = perform(source,cursor=>operation(source,cursor),range)
      .then(row=>{failures.delete(id);return row;})
      .catch(error=>{failures.set(id,{lastAttemptAt:clock.now(),error:sourceReadError(error)??{code:'sync-failed',message:'同步或保存失败，上次成功数据已保留'}});throw error;})
      .finally(()=>pending.delete(id));
    pending.set(id,promise); return promise;
  }
  const sync = (id, range = {}) => run(id,'source',(source,cursor)=>source.read(range,cursor),range);
  const importFile = (id, file) => run(id,'importer',source=>source.import(file),{});
  function changeSource({previousId=null,next=null,commit}) {
    assertOpen();
    const old=previousId===null?null:sources.get(previousId);
    if(previousId!==null && !old)throw new SafeError('NOT_FOUND');
    const ids=[...new Set([previousId,next?.id].filter(id=>id!=null))];
    if(ids.some(id=>pending.has(id)||changing.has(id)))throw new SafeError('BUSY');
    if(next) {
      if(!domains.has(next.domain)||typeof next.id!=='string'||!next.id||typeof next.kind!=='string'||!next.kind||typeof next.read!=='function'||typeof next.capabilities!=='function'||(next.input && next.input!=='source'))throw new SafeError('INVALID_INPUT');
      if(sources.has(next.id)&&next.id!==previousId)throw new SafeError('DUPLICATE_SOURCE');
      const current=sources.get(next.id);
      if(current&&(current.domain!==next.domain||current.kind!==next.kind||current.input!=='source'))throw new SafeError('INVALID_INPUT');
      const row=saved(next.id);
      if(row&&(row.domain!==next.domain||row.kind!==next.kind||(row.input&&row.input!=='source')))throw new SafeError('INVALID_INPUT');
      if(next.intervalMs!==undefined&&(!Number.isSafeInteger(next.intervalMs)||next.intervalMs<1))throw new SafeError('INVALID_INPUT','schedule');
      next.input='source'; next.capabilities();
    }
    for(const id of ids)changing.add(id);
    let stop,activateAt=Infinity;
    try {
      if(next?.intervalMs)stop=clock.every(next.intervalMs,async()=>{
        if(closed||changing.has(next.id)||Date.parse(clock.now())<activateAt)return;
        try {await sync(next.id);}catch { /* Sync records its public failure. */ }
      });
    }catch(error){for(const id of ids)changing.delete(id);throw error;}
    const task=(async()=>{
      try {
        try {await commit();}catch {throw new SafeError('STORAGE_FAILED');}
        if(old){timers.get(previousId)?.();timers.delete(previousId);sources.delete(previousId);}
        if(next){sources.set(next.id,next);activateAt=Date.parse(clock.now())+(next.intervalMs||0);if(stop)timers.set(next.id,stop);}
      }catch(error){stop?.();throw error;}
      finally {for(const id of ids)changing.delete(id);}
    })();
    changes.add(task);task.then(()=>changes.delete(task),()=>changes.delete(task));return task;
  }
  async function close() {
    closed=true; for (const stop of timers.values()) stop(); timers.clear();
    await Promise.allSettled([...pending.values(),...changes]);
    for(const stop of timers.values())stop();timers.clear(); sources.clear(); metrics.clear(); domains.clear();
  }
  return {registerDomain,registerSource,registerImporter,registerMetric,snapshot,metric,sync,importFile,changeSource,close};
}
