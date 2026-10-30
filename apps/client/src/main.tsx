import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { art, iconBounds, items } from './art';
import { importPet, loadCalico, type LoadedPet } from './pets/load';
import './style.css';

const PetStage = lazy(() => import('./pets/PetStage').then(module => ({ default: module.PetStage })));
type Screen = 'home' | 'bag' | 'trip' | 'collection' | 'settings';
type ArtIcon = keyof typeof iconBounds;
function Icon({ name, size = 30 }: { name: ArtIcon; size?: number }) {
  const [x, y, w, h] = iconBounds[name], scale = size / Math.max(w, h);
  return <span className="art-icon" style={{ width: size, height: size }} aria-hidden="true"><img alt="" src={art[name]}
    style={{ width: 1254 * scale, height: 1254 * scale, left: (size - w * scale) / 2 - x * scale, top: (size - h * scale) / 2 - y * scale }} /></span>;
}
function LineIcon({ name }: { name: 'back' | 'gear' | 'leaf' | 'check' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'back' ? <path d="M19 12H5m7-7-7 7 7 7" /> : name === 'check' ? <path d="m5 12 4 4L19 6" /> : name === 'leaf' ? <><path d="M12 21V10M12 15C4 15 3 10 3 5c6 0 9 3 9 8m0-3c0-5 4-7 9-7 0 6-3 9-9 9" /></> : <><path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3Z" /><circle cx="12" cy="11.5" r="3.2" /></>}
  </svg>;
}
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)'), changed = () => setReduced(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return reduced;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home'), [room, setRoom] = useState<'interior' | 'courtyard'>('interior');
  const [pet, setPet] = useState<LoadedPet | null>(null), [loadError, setLoadError] = useState('');
  const [moving, setMoving] = useState(false), [autoWalk, setAutoWalk] = useState(true);
  const [draft, setDraft] = useState<string[]>([]), [prepared, setPrepared] = useState<string[]>([]);
  const [importing, setImporting] = useState(false), [importError, setImportError] = useState('');
  const upload = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null), content = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    let active = true;
    void loadCalico().then(value => { if (active) setPet(value); else value.dispose(); }, () => { if (active) setLoadError('宠物素材未能加载，请刷新后重试。'); });
    return () => { active = false; };
  }, []);
  useEffect(() => () => pet?.dispose(), [pet]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; heading.current?.focus(); }, [screen]);
  const open = (next: Screen) => { setScreen(next); setMoving(false); };
  const selectItem = (id: string) => setDraft(value => value.includes(id) ? value.filter(item => item !== id) : value.length < 3 ? [...value, id] : value);
  const importFiles = async (files: FileList | null) => {
    if (!files?.length || importing) return;
    setImporting(true); setImportError('');
    try { const value = await importPet(files); setPet(value); open('home'); } catch (error) { setImportError((error as Error).message); }
    finally { setImporting(false); if (upload.current) upload.current.value = ''; }
  };
  const pageTitle = { bag: '行囊', trip: '旅途', collection: '收藏', settings: '设置' };

  return <div className="app-shell">
    <main ref={content} className={'content ' + (screen === 'home' ? 'home-page' : '')}>
      {screen === 'home' ? <>
        <section className={'home-scene ' + room} aria-label={room === 'interior' ? '窗边小屋' : '庭院'}>
          <img className="scene-art" src={art[room]} alt="" fetchPriority="high" />
          <div className="scene-heading">
            <p className="brand"><LineIcon name="leaf" />丸宠APP</p>
            <h1 ref={heading} tabIndex={-1}>家园</h1>
            <div className="room-switch" aria-label="切换场景">
              <button aria-pressed={room === 'interior'} onClick={() => setRoom('interior')}>小屋</button>
              <button aria-pressed={room === 'courtyard'} onClick={() => setRoom('courtyard')}>庭院</button>
            </div>
          </div>
          <button className="icon-button settings-button" aria-label="设置与更换宠物" onClick={() => open('settings')}><LineIcon name="gear" /></button>
          {pet ? <Suspense fallback={<p className="scene-loading" role="status">小猫正在醒来…</p>}><PetStage pet={pet} autoWalk={autoWalk && !reduced} reducedMotion={reduced} onMotion={setMoving} /></Suspense>
            : <p className="scene-loading" role={loadError ? 'alert' : 'status'}>{loadError || '正在打开小屋…'}</p>}
          <p id="walk-help" className="walk-help">{reduced ? '使用方向键或点击地毯，选择它的位置' : '点击地毯，陪它走走'}</p>
        </section>
        <section className="home-summary" aria-label="宠物与行囊">
          <div className="pet-title"><span className="sprig" aria-hidden="true"><LineIcon name="leaf" /></span><h2>{pet?.pack.name || '小伙伴'}</h2><span className="sprig" aria-hidden="true"><LineIcon name="leaf" /></span></div>
          <p className="pet-status"><Icon name="home" size={18} />在家<span className="status-dot" aria-hidden="true" />{moving ? '正在散步' : '自在休息'}</p>
          <p className="preparation">{prepared.length ? '行囊已备好' : '行囊未准备'}</p>
          <button className="primary-button" onClick={() => open('bag')}><Icon name="bag" size={35} />{prepared.length ? '调整行囊' : '准备行囊'}</button>
          <div className="home-options"><label className="walk-toggle"><input type="checkbox" checked={autoWalk && !reduced} disabled={reduced} onChange={event => setAutoWalk(event.target.checked)} /><span>自动散步</span></label><span className="preview-label">互动预览</span></div>
        </section>
      </> : <>
        <header className="page-heading"><button className="icon-button" aria-label="返回家园" onClick={() => open('home')}><LineIcon name="back" /></button><h1 ref={heading} tabIndex={-1}>{pageTitle[screen]}</h1></header>
        {screen === 'bag' ? <section className="bag-page page-body">
          <p className="page-intro">给下一段旅途，准备一点心意。</p>
          <h2>出门准备 <span className="quiet-count">{draft.length} / 3</span></h2>
          <div className="loadout-slots">{Array.from({ length: 3 }, (_, index) => {
            const item = items.find(item => item.id === draft[index]);
            return <button key={index} className={'loadout-slot ' + (item ? 'filled' : '')} disabled={!item} onClick={() => item && selectItem(item.id)} aria-label={item ? '移除' + item.name : '准备位' + (index + 1) + '，待选择'}>
              {item ? <><img src={item.image} alt="" /><span>{item.name}</span></> : <><LineIcon name="leaf" /><span>待选择</span></>}
            </button>;
          })}</div>
          <div className="section-heading"><h2>我的物品</h2><span>体验背包</span></div>
          <div className="inventory-grid">{items.map(item => {
            const selected = draft.includes(item.id);
            return <button key={item.id} className={'item-tile ' + (selected ? 'selected' : '')} disabled={!item.quantity || (!selected && draft.length === 3)} aria-pressed={selected} aria-label={item.name + '，拥有' + item.quantity + (selected ? '，已选择' : '')} onClick={() => selectItem(item.id)}>
              <img src={item.image} alt="" />{selected ? <span className="selected-mark"><LineIcon name="check" /></span> : null}<span>{item.name}</span><small>{item.quantity ? '×' + item.quantity : '数量不足'}</small>
            </button>;
          })}</div>
          <p className="preview-explanation">这是行囊搭配预览，不消耗物品，也不会保存至账号。</p>
          <div className="bag-footer"><p>{draft.length ? '出发时使用：' + draft.map(id => items.find(item => item.id === id)!.name + ' ×1').join('、') : '先选择要带上的物品'}</p><button className="primary-button" disabled={!draft.length} onClick={() => { setPrepared([...draft]); open('home'); }}>预览已备好</button></div>
        </section> : screen === 'settings' ? <section className="settings-page page-body">
          <h2>小伙伴</h2><p className="current-pet">{pet?.pack.name || '正在加载'}<span>{pet?.pack.species}</span></p>
          <input ref={upload} className="visually-hidden" tabIndex={-1} type="file" multiple accept=".json,.png,.webp" aria-label="选择宠物动作文件与图片" onChange={event => void importFiles(event.target.files)} />
          <button className="secondary-button" disabled={importing || !pet} onClick={() => upload.current?.click()}>{importing ? '正在打开宠物…' : '导入宠物'}</button>
          {importError ? <p className="error-message" role="alert">{importError}</p> : null}
          <details className="import-help"><summary>如何准备宠物动作</summary><p>同时选择一份动作 JSON 和配套图片。资源应包含待机、向左走、向右走的连续动作。图片只在本机读取，不会上传。</p><p>后续 AI 可以生成不同物种的动作资源包；每只宠物使用自己的动作，不要求相同身体结构。</p></details>
          <button className="text-button" disabled={importing || !pet || pet.pack.id === 'calico-window-v1'} onClick={async () => { setImporting(true); try { setPet(await loadCalico()); setImportError(''); } catch { setImportError('三花猫素材未能加载，请重试'); } finally { setImporting(false); } }}>恢复三花猫</button>
          <h2>动效</h2><label className="setting-row"><span>自动散步<small>{reduced ? '已跟随系统减少动态效果' : '停留片刻后，在地毯上走走'}</small></span><input type="checkbox" checked={autoWalk && !reduced} disabled={reduced} onChange={event => setAutoWalk(event.target.checked)} /></label>
          <p className="preview-explanation">当前可体验宠物散步、场景切换与行囊搭配。账号存档、旅行与领取将在后续接入。</p>
        </section> : <section className="empty-state page-body"><Icon name={screen === 'trip' ? 'trip' : 'collection'} size={88} /><h2>{screen === 'trip' ? '下一段旅途，从家开始' : '回忆会慢慢收满'}</h2><p>{screen === 'trip' ? '先回小屋陪它走走，搭配好旅行的行囊。' : '未来的明信片和纪念品，会收在这里。'}</p><p className="preview-explanation">互动预览暂未开放{screen === 'trip' ? '真实旅行' : '旅行收藏'}。</p><button className="secondary-button" onClick={() => open('home')}>回到家园</button></section>}
      </>}
    </main>
    {screen !== 'bag' ? <nav className="bottom-nav" aria-label="主要导航">{(['home', 'trip', 'collection'] as const).map((name, index) => <button key={name} aria-current={screen === name ? 'page' : undefined} onClick={() => open(name)}><Icon name={name} /><span>{['家园', '旅途', '收藏'][index]}</span></button>)}</nav> : null}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
