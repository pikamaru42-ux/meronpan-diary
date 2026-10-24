import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { AppData, CustomRatingDefinition, MelonpanRecord, RatingValue, SharedAccount } from './types'
import { DEFAULT_DEFINITIONS } from './types'
import { deleteRecord, loadData, saveData, saveDefinitions, saveRecord } from './db/database'
import { download, formatDate, id, newRecord, parseBackup, readImage, stars } from './lib/utils'
import { aiPrompt, summary } from './lib/stats'
import { deleteSharedRecord, isSharedCloudConfigured, listSharedAccounts, loadSharedData, syncSharedDefinitions, syncSharedRecord } from './lib/sharedSync'

type Page = 'list' | 'form' | 'detail' | 'stats' | 'settings'
const monthNow = () => new Date().toISOString().slice(0,7)
function Rating({ value, onChange, label }: {value: RatingValue; onChange?: (v:RatingValue)=>void; label: string}) { return <div role="group" aria-label={label} className="flex">{([1,2,3,4,5] as RatingValue[]).map(v => <button type="button" className="star" key={v} onClick={() => onChange?.(v)} aria-label={`${v}点`} aria-pressed={value===v}>{v <= value ? '★' : '☆'}</button>)}</div> }
function Photo({ record, big=false }: {record: MelonpanRecord; big?:boolean}) { return record.photo ? <img src={record.photo} alt={`${record.productName}の写真`} className={big ? 'h-64 w-full rounded-3xl object-cover' : 'h-24 w-24 shrink-0 rounded-2xl object-cover'}/> : <div className={`${big ? 'h-64' : 'h-24 w-24'} flex shrink-0 items-center justify-center rounded-2xl bg-custard text-4xl`} aria-label="写真なし">🥐</div> }
function Nav({ page, go }: {page:Page;go:(p:Page)=>void}) { const items:[Page,string,string][]=[['list','▤','記録一覧'],['form','＋','追加'],['stats','▥','集計'],['settings','⚙','設定']]; return <nav aria-label="メインメニュー" className="fixed bottom-0 left-0 right-0 z-10 mx-auto flex max-w-xl justify-around border-t border-[#e6dcc6] bg-[#fffdf7]/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">{items.map(([key,icon,label])=><button key={key} onClick={()=>go(key)} className={`flex min-h-12 min-w-16 flex-col items-center rounded-xl px-2 text-xs font-bold ${page===key?'text-[#71902e]':'text-[#8b735d]'}`}><span className="text-xl">{icon}</span>{label}</button>)}</nav> }

export default function App(){
 const [data,setData]=useState<AppData>({records:[],definitions:DEFAULT_DEFINITIONS})
 const [accounts,setAccounts]=useState<SharedAccount[]>([])
 const [activeAccount,setActiveAccount]=useState<SharedAccount|null>(null)
 const [localOnly,setLocalOnly]=useState(false)
 const [page,setPage]=useState<Page>('list')
 const [selected,setSelected]=useState<string>()
 const [editing,setEditing]=useState<MelonpanRecord>()
 const [ready,setReady]=useState(false)
 const [accountBusy,setAccountBusy]=useState(false)
 const [startupError,setStartupError]=useState('')
 const [syncError,setSyncError]=useState('')
 const cloudEnabled=isSharedCloudConfigured()

 useEffect(()=>{
  let mounted=true
  void loadData().then(async localData=>{
   if(!mounted)return
   setData(localData)
   if(!cloudEnabled){setReady(true);return}
   const availableAccounts=await listSharedAccounts()
   if(!mounted)return
   setAccounts(availableAccounts)
   let savedAccountId:string|null=null
   // Keep the selected display identity for this tab only; a new session chooses again.
   try{savedAccountId=sessionStorage.getItem('melonpan-selected-account')}catch{savedAccountId=null}
   const remembered=availableAccounts.find(account=>account.id===savedAccountId)
   if(remembered){
    const cloudData=await loadSharedData(remembered.id)
    if(!mounted)return
    const merged=mergeData(localData,cloudData,remembered.id)
    await saveData(merged)
    setData(merged)
    setActiveAccount(remembered)
   }
   setReady(true)
  }).catch((error:unknown)=>{
   if(!mounted)return
   setStartupError(error instanceof Error?error.message:'共有データを読み込めませんでした。')
   setReady(true)
  })
  return()=>{mounted=false}
 },[cloudEnabled])

 const persist=(d:AppData)=>setData(d)
 const openRecord=(record:MelonpanRecord)=>{setSelected(record.id);setPage('detail')}
 const go=(p:Page)=>{if(p==='form')setEditing(newRecord());setPage(p)}
 const selectAccount=async(account:SharedAccount)=>{
  setAccountBusy(true)
  setStartupError('')
  try{
   const cloudData=await loadSharedData(account.id)
   const merged=mergeData(await loadData(),cloudData,account.id)
   await saveData(merged)
   setData(merged)
   try{sessionStorage.setItem('melonpan-selected-account',account.id)}catch{setStartupError('このタブでは選択状態を保存できません。ページを開いている間は利用できます。')}
   setActiveAccount(account)
   setLocalOnly(false)
  }catch(error:unknown){
   setStartupError(error instanceof Error?error.message:'共有データを読み込めませんでした。')
  }finally{setAccountBusy(false)}
 }
 const syncRecord=async(record:MelonpanRecord,accountId:string):Promise<boolean>=>{
  try{await syncSharedRecord(record,accountId);setSyncError('');return true}
  catch(error:unknown){setSyncError(error instanceof Error?error.message:'クラウドへの投稿に失敗しました。');return false}
 }
 const syncDefinitions=(definitions:CustomRatingDefinition[])=>activeAccount
  ?syncSharedDefinitions(definitions,activeAccount.id).then(()=>setSyncError('')).catch((error:unknown)=>setSyncError(error instanceof Error?error.message:'評価項目の同期に失敗しました。'))
  :Promise.resolve()
 const refreshShared=async()=>{
  try{
   if(!activeAccount)return
   const remote=await loadSharedData(activeAccount.id)
   const merged=mergeData(await loadData(),remote,activeAccount.id)
   await saveData(merged)
   setData(merged)
   setSyncError('')
  }catch(error:unknown){setSyncError(error instanceof Error?error.message:'共有データを再読み込みできませんでした。')}
 }
 const changeAccount=()=>{try{sessionStorage.removeItem('melonpan-selected-account')}catch{};setActiveAccount(null);setPage('list');setStartupError('')}
 const continueLocally=()=>{setActiveAccount(null);setLocalOnly(true);setPage('list')}
 const canModifyRecord=(record:MelonpanRecord)=>activeAccount?record.accountId===activeAccount.id:!cloudEnabled||!record.accountId
 const visibleData=useMemo(()=>({
  ...data,
  records:activeAccount
   ?data.records.filter(record=>record.accountId===activeAccount.id)
   :localOnly&&cloudEnabled
    ?data.records.filter(record=>!record.accountId)
    :data.records,
 }),[data,activeAccount,localOnly,cloudEnabled])

 if(!ready)return <main className="grid min-h-screen place-items-center text-bread">焼きたてを準備中…</main>
 if(cloudEnabled&&!activeAccount&&!localOnly)return <AccountChooser accounts={accounts} busy={accountBusy} error={startupError} onSelect={selectAccount} onRetry={()=>window.location.reload()} onContinueLocally={continueLocally}/>
 return <main className="mx-auto min-h-screen max-w-xl px-4 pb-24 pt-5">
  {(activeAccount||localOnly)&&<section className="card mb-4 flex items-center justify-between gap-3 py-3"><p className="text-sm">{activeAccount?<>投稿アカウント：<strong>{activeAccount.name}</strong></>:'端末内のみで利用中'}</p>{activeAccount?<button className="btn-sub shrink-0" onClick={changeAccount}>切り替え</button>:<button className="btn-sub shrink-0" onClick={()=>setLocalOnly(false)}>共有アカウントを選ぶ</button>}</section>}
  {syncError&&<p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">クラウド同期に失敗しました。記録はこの端末に保存されています。{syncError}</p>}
  {page==='list'&&<List records={visibleData.records} accounts={accounts} onOpen={openRecord} onAdd={()=>go('form')}/>}
  {page==='form'&&<Form record={editing??newRecord()} definitions={visibleData.definitions} onCancel={()=>setPage('list')} onSave={async r=>{
   const saved={...r,accountId:activeAccount?.id??r.accountId,syncPending:Boolean(activeAccount)}
   const d=await saveRecord(saved)
   persist(d)
   if(activeAccount&&await syncRecord(saved,activeAccount.id)){
    const synced={...saved,syncPending:false}
    const latest=await saveRecord(synced)
    persist(latest)
   }
   setSelected(saved.id)
   setPage('detail')
  }}/>}
  {page==='detail'&&<><Detail record={visibleData.records.find(r=>r.id===selected)} all={visibleData.records} definitions={visibleData.definitions} canEdit={visibleData.records.some(r=>r.id===selected&&canModifyRecord(r))} onBack={()=>setPage('list')} onEdit={r=>{
   if(!canModifyRecord(r)){setSyncError('選択中アカウントの記録だけ編集できます。');return}
   setEditing(r);setPage('form')
  }} onDelete={async r=>{
   if(!canModifyRecord(r)){setSyncError('選択中アカウントの記録だけ削除できます。');return}
   if(confirm('この記録を削除します。元に戻せません。よろしいですか？')){
    if(activeAccount){
     try{await deleteSharedRecord(r.id,activeAccount.id)}
     catch(error:unknown){setSyncError(error instanceof Error?error.message:'クラウドから削除できませんでした。');return}
    }
    persist(await deleteRecord(r.id))
    setPage('list')
   }
  }} onOpen={openRecord}/><p className="mt-3 text-center text-sm text-[#826e5b]">投稿者：{accounts.find(account=>account.id===visibleData.records.find(record=>record.id===selected)?.accountId)?.name??'ローカル記録'}</p></>}
  {page==='stats'&&<Stats records={visibleData.records}/>}
  {page==='settings'&&<Settings data={data} visibleRecords={visibleData.records} setData={persist} activeAccount={activeAccount} cloudEnabled={cloudEnabled} onRefreshShared={refreshShared} onSyncRecord={syncRecord} onSyncDefinitions={syncDefinitions} onSyncError={setSyncError}/>}
  <Nav page={page} go={go}/>
 </main>
}

function mergeData(local:AppData,cloud:AppData,accountId:string):AppData{
 const cloudIds=new Set(cloud.records.map(record=>record.id))
 return {records:[...local.records.filter(record=>record.accountId!==accountId||record.syncPending&&!cloudIds.has(record.id)),...cloud.records],definitions:cloud.definitions.length?cloud.definitions:DEFAULT_DEFINITIONS}
}

function AccountChooser({accounts,busy,error,onSelect,onRetry,onContinueLocally}:{accounts:SharedAccount[];busy:boolean;error:string;onSelect:(account:SharedAccount)=>void;onRetry:()=>void;onContinueLocally:()=>void}){
 return <main className="mx-auto grid min-h-screen max-w-xl content-center gap-4 px-4 py-8">
  <header className="text-center"><p className="text-5xl">🍈</p><h1 className="mt-3 text-2xl font-black">メロンパン日記</h1><p className="mt-2 text-sm text-[#826e5b]">投稿アカウントを選んでください</p></header>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {accounts.length?accounts.map(account=><button key={account.id} className="btn-main w-full" disabled={busy} onClick={()=>void onSelect(account)}>{account.name}</button>):<section className="card text-sm"><p className="font-bold">アカウント一覧が空です。</p><p className="mt-2">アプリはSupabase Authのユーザー一覧ではなく、Table Editorの <code>public.melonpan_accounts</code> を読み込みます。そこにアカウント行を登録してください。</p><pre className="mt-3 overflow-x-auto rounded-lg bg-[#f7f2e8] p-3 text-xs">select id, name from public.melonpan_accounts;</pre><p className="mt-2">SQL Editorで上の確認SQLを実行し、行が返ることを確認してください。</p></section>}
  {busy&&<p role="status" className="text-center text-sm">共有データを読み込み中…</p>}
  {(error||!accounts.length)&&<button className="btn-sub" onClick={onRetry}>アカウント一覧を再読み込み</button>}
  <button className="btn-sub" disabled={busy} onClick={onContinueLocally}>クラウドを使わず端末内で続ける</button>
  <p className="text-center text-xs text-[#826e5b]">アカウント選択は投稿者の表示用です。</p>
 </main>
}

function List({records,accounts,onOpen,onAdd}:{records:MelonpanRecord[];accounts:SharedAccount[];onOpen:(r:MelonpanRecord)=>void;onAdd:()=>void}){
 const [q,setQ]=useState('')
 const [tag,setTag]=useState('')
 const [rating,setRating]=useState('')
 const [from,setFrom]=useState('')
 const [to,setTo]=useState('')
 const tags=useMemo(()=>Array.from(new Set(records.flatMap(r=>r.tags))).sort(),[records])
 const filtered=records.filter(r=>{
  const text=[r.shop,r.productName,r.memo,...r.tags].join(' ').toLowerCase()
  return (!q||text.includes(q.toLowerCase()))&&(!tag||r.tags.includes(tag))&&(!rating||r.overallRating===Number(rating))&&(!from||r.eatenAt>=from)&&(!to||r.eatenAt<=to)
 }).sort((a,b)=>b.eatenAt.localeCompare(a.eatenAt))
 const authorName=(record:MelonpanRecord)=>accounts.find(account=>account.id===record.accountId)?.name??'ローカル記録'
 return <>
  <header className="mb-5 flex items-center justify-between"><div><p className="text-sm text-[#8b735d]">今日の甘い思い出を。</p><h1 className="text-3xl font-black text-bread">メロンパン日記</h1></div><span className="text-4xl">🍈</span></header>
  {!records.length?<section className="card mt-12 text-center"><div className="text-6xl">🥐</div><h2 className="mt-4 text-xl font-bold">まだ記録がありません</h2><p className="mt-2 text-sm text-[#826e5b]">最初のひとつから、あなたのメロンパン地図を作りましょう。</p><button className="btn-main mt-5" onClick={onAdd}>最初のメロンパンを記録する</button></section>:<>
   <section className="card mb-4"><label className="sr-only" htmlFor="search">キーワード検索</label><input id="search" className="field mt-0" placeholder="店名・商品名・メモ・タグを検索" value={q} onChange={e=>setQ(e.target.value)}/><div className="mt-3 grid grid-cols-2 gap-2"><select className="field mt-0" aria-label="タグで絞り込み" value={tag} onChange={e=>setTag(e.target.value)}><option value="">すべてのタグ</option>{tags.map(t=><option key={t}>{t}</option>)}</select><select className="field mt-0" aria-label="評価で絞り込み" value={rating} onChange={e=>setRating(e.target.value)}><option value="">すべての評価</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n}点</option>)}</select><input className="field mt-0" aria-label="開始日" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input className="field mt-0" aria-label="終了日" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div></section>
   <p className="mb-3 text-sm font-bold text-[#76563a]">{filtered.length}件の記録</p>
   <div className="space-y-3">{filtered.map(r=><button key={r.id} className="card flex w-full gap-3 text-left" onClick={()=>onOpen(r)}><Photo record={r}/><div className="min-w-0 flex-1"><p className="truncate text-lg font-bold">{r.productName||'名前なしのメロンパン'}</p><p className="text-sm text-[#826e5b]">{r.shop||'店名なし'} · {formatDate(r.eatenAt)}</p><p className="text-xs text-[#826e5b]">投稿者：{authorName(r)}</p><p className="mt-1 text-[#d49a25]">{stars(r.overallRating)}</p><div className="mt-2 flex flex-wrap gap-1">{r.tags.map(t=><span key={t} className="rounded-full bg-[#eef3d8] px-2 py-0.5 text-xs text-[#60752b]">#{t}</span>)}</div></div></button>)}</div>
  </>}
 </>
}

function Form({record,definitions,onCancel,onSave}:{record:MelonpanRecord;definitions:CustomRatingDefinition[];onCancel:()=>void;onSave:(r:MelonpanRecord)=>Promise<void>}){const [form,setForm]=useState(record);const [tag,setTag]=useState('');const [error,setError]=useState('');const input=useRef<HTMLInputElement>(null);const set=<K extends keyof MelonpanRecord>(key:K,value:MelonpanRecord[K])=>setForm(f=>({...f,[key]:value}));const addTag=()=>{const v=tag.trim();if(v&&!form.tags.includes(v)){set('tags',[...form.tags,v]);setTag('')}};const submit=async(e:FormEvent)=>{e.preventDefault();if(!form.productName.trim()){setError('商品名を入力してください。');return}if(!form.eatenAt){setError('食べた日を入力してください。');return}await onSave({...form,productName:form.productName.trim(),shop:form.shop.trim(),memo:form.memo.trim(),updatedAt:new Date().toISOString()})};return <><header className="mb-4 flex items-center gap-3"><button className="btn-sub px-3" onClick={onCancel} aria-label="戻る">←</button><h1 className="text-2xl font-black">{record.createdAt===record.updatedAt?'メロンパンを記録':'記録を編集'}</h1></header><form onSubmit={submit} className="card"><label className="label">食べた日<input className="field" type="date" value={form.eatenAt} onChange={e=>set('eatenAt',e.target.value)}/></label><label className="label">商品名 <span className="text-red-600">*</span><input className="field" value={form.productName} maxLength={100} onChange={e=>set('productName',e.target.value)} placeholder="例：焼きたてメロンパン"/></label><label className="label">店名<input className="field" value={form.shop} maxLength={100} onChange={e=>set('shop',e.target.value)} placeholder="例：まちのベーカリー"/></label><label className="label">金額（円）<input className="field" type="number" inputMode="numeric" min="0" step="1" value={form.amount??''} onChange={e=>set('amount',e.target.value==''?undefined:Number(e.target.value))} placeholder="例：150"/></label><p className="label">写真</p><div className="mt-1 flex items-center gap-3">{form.photo?<img src={form.photo} alt="選択中の写真" className="h-20 w-20 rounded-2xl object-cover"/>:<div className="grid h-20 w-20 place-items-center rounded-2xl bg-custard text-3xl">🥐</div>}<div><input ref={input} className="hidden" type="file" accept="image/*" onChange={async e=>{const f=e.target.files?.[0];if(f){if(f.size>8*1024*1024){setError('写真は8MB以下にしてください。');return}set('photo',await readImage(f))}}}/><button type="button" className="btn-sub" onClick={()=>input.current?.click()}>写真を選ぶ</button>{form.photo&&<button type="button" className="ml-2 text-sm text-red-700" onClick={()=>set('photo',undefined)}>削除</button>}</div></div><p className="label">総合評価</p><Rating label="総合評価" value={form.overallRating} onChange={v=>set('overallRating',v)}/>{definitions.filter(d=>d.enabled).map(d=><div key={d.id}><p className="label">{d.label}</p><Rating label={d.label} value={form.customRatings[d.id]??3} onChange={v=>set('customRatings',{...form.customRatings,[d.id]:v})}/></div>)}<label className="label">メモ<textarea className="field min-h-24" value={form.memo} maxLength={1000} onChange={e=>set('memo',e.target.value)} placeholder="おいしかったポイントなど"/></label><p className="label">タグ</p><div className="mt-2 flex gap-2"><input className="field mt-0" value={tag} maxLength={30} onChange={e=>setTag(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag()}}} placeholder="例：期間限定"/><button className="btn-sub shrink-0" type="button" onClick={addTag}>追加</button></div><div className="mt-2 flex flex-wrap gap-2">{form.tags.map(t=><button type="button" key={t} className="rounded-full bg-[#eef3d8] px-3 py-1 text-sm text-[#60752b]" onClick={()=>set('tags',form.tags.filter(x=>x!==t))}>#{t} ×</button>)}</div>{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex gap-2"><button type="button" className="btn-sub flex-1" onClick={onCancel}>キャンセル</button><button className="btn-main flex-1" type="submit">保存する</button></div></form></>}

function Detail({record,all,definitions,canEdit,onBack,onEdit,onDelete,onOpen}:{record?:MelonpanRecord;all:MelonpanRecord[];definitions:CustomRatingDefinition[];canEdit:boolean;onBack:()=>void;onEdit:(r:MelonpanRecord)=>void;onDelete:(r:MelonpanRecord)=>void;onOpen:(r:MelonpanRecord)=>void}){if(!record)return <p>記録が見つかりません。</p>;const ordered=[...all].sort((a,b)=>b.eatenAt.localeCompare(a.eatenAt));const i=ordered.findIndex(r=>r.id===record.id);return <><header className="mb-4 flex items-center justify-between"><button className="btn-sub px-3" onClick={onBack} aria-label="一覧に戻る">←</button>{canEdit&&<div className="flex gap-2"><button className="btn-sub" onClick={()=>onEdit(record)}>編集</button><button className="btn-danger" onClick={()=>onDelete(record)}>削除</button></div>}</header><article className="card"><Photo record={record} big/><p className="mt-4 text-sm text-[#826e5b]">{formatDate(record.eatenAt)} · {record.shop||'店名なし'}</p>{record.amount!==undefined&&<p className="mt-1 text-sm text-[#826e5b]">価格：{record.amount.toLocaleString()}円</p>}<h1 className="text-2xl font-black">{record.productName}</h1><p className="mt-2 text-2xl text-[#d49a25]">{stars(record.overallRating)}</p><div className="mt-4 flex flex-wrap gap-2">{record.tags.map(t=><span key={t} className="rounded-full bg-[#eef3d8] px-3 py-1 text-sm text-[#60752b]">#{t}</span>)}</div>{record.memo&&<p className="mt-5 whitespace-pre-wrap border-t border-[#eee3ca] pt-4 leading-relaxed">{record.memo}</p>}<section className="mt-5 border-t border-[#eee3ca] pt-4"><h2 className="font-bold">こだわり評価</h2>{definitions.filter(d=>d.enabled).map(d=><div key={d.id} className="mt-2 flex justify-between"><span>{d.label}</span><span className="text-[#d49a25]">{stars(record.customRatings[d.id]??3)}</span></div>)}</section></article>{!canEdit&&<p className="mt-2 text-center text-xs text-[#826e5b]">この記録は選択中アカウント以外の投稿です。</p>}<div className="mt-4 flex justify-between gap-2"><button className="btn-sub flex-1 disabled:opacity-40" disabled={!ordered[i+1]} onClick={()=>ordered[i+1]&&onOpen(ordered[i+1])}>← 前の記録</button><button className="btn-sub flex-1 disabled:opacity-40" disabled={!ordered[i-1]} onClick={()=>ordered[i-1]&&onOpen(ordered[i-1])}>次の記録 →</button></div></>}

function Stats({records}:{records:MelonpanRecord[]}){const [month,setMonth]=useState(monthNow());const [allTime,setAllTime]=useState(false);const [prompt,setPrompt]=useState('');const selected=allTime?records:records.filter(r=>r.eatenAt.startsWith(month));const s=summary(selected);const months=Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i);return d.toISOString().slice(0,7)});const counts=months.map(m=>records.filter(r=>r.eatenAt.startsWith(m)).length);const max=Math.max(...counts,1);useEffect(()=>setPrompt(aiPrompt(selected,allTime?'全期間':`${month.replace('-','年')}月`)),[month,allTime,records]);return <><header className="mb-4"><p className="text-sm text-[#8b735d]">振り返ると、次の一個がもっと楽しみ。</p><h1 className="text-3xl font-black">月別集計</h1></header><section className="card"><div className="flex items-center gap-3"><label className="flex-1 text-sm font-bold">対象月<input className="field" type="month" value={month} disabled={allTime} onChange={e=>setMonth(e.target.value)}/></label><label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={allTime} onChange={e=>setAllTime(e.target.checked)}/>全期間</label></div>{!selected.length?<p className="py-8 text-center text-[#826e5b]">この期間の記録はまだありません。<br/>追加すると、おいしい傾向が見えてきます。</p>:<><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-custard p-3"><p className="text-xs">食べた個数</p><p className="text-3xl font-black">{s.count}<span className="text-sm"> 個</span></p></div><div className="rounded-2xl bg-[#eef3d8] p-3"><p className="text-xs">平均総合評価</p><p className="text-3xl font-black">{s.average.toFixed(1)}<span className="text-sm"> / 5</span></p></div></div><Rank title="よく行った店" values={s.shops}/><Rank title="よく使ったタグ" values={s.tags} tag/><section className="mt-5"><h2 className="font-bold">高評価メロンパン</h2>{s.top.map((r,i)=><div key={r.id} className="mt-2 flex justify-between rounded-xl bg-[#fffcf4] p-2 text-sm"><span>{i+1}. {r.productName} <small>({r.shop})</small></span><b className="text-[#d49a25]">★ {r.overallRating}</b></div>)}</section></>}</section><section className="card mt-4"><h2 className="font-bold">月ごとの個数推移</h2><div className="mt-4 flex h-32 items-end justify-between gap-2">{months.map((m,i)=><div key={m} className="flex h-full flex-1 flex-col justify-end text-center"><span className="text-xs">{counts[i]}</span><div className="rounded-t-md bg-melon" style={{height:`${counts[i]/max*90}%`,minHeight:counts[i]?'5px':'0'}}/><small className="mt-1 text-[10px]">{m.slice(5)}月</small></div>)}</div></section><section className="card mt-4"><h2 className="font-bold">AIに渡す要約文</h2><p className="mt-1 text-xs text-[#826e5b]">データは自動送信されません。コピーしてご自身で貼り付けた時だけAIサービスに共有されます。</p><textarea className="field min-h-56 text-sm" value={prompt} onChange={e=>setPrompt(e.target.value)}/><div className="mt-3 grid grid-cols-3 gap-2"><button className="btn-main" onClick={()=>navigator.clipboard.writeText(prompt)}>コピー</button><button className="btn-sub" onClick={async()=>{await navigator.clipboard.writeText(prompt);window.open('https://chatgpt.com/','_blank','noopener,noreferrer')}}>ChatGPTで開く</button><button className="btn-sub" onClick={async()=>{await navigator.clipboard.writeText(prompt);window.open('https://gemini.google.com/','_blank','noopener,noreferrer')}}>Geminiで開く</button></div></section></>}
function Rank({title,values,tag=false}:{title:string;values:[string,number][];tag?:boolean}){return <section className="mt-5"><h2 className="font-bold">{title}</h2>{values.slice(0,5).map(([n,c],i)=><div className="mt-2 flex justify-between text-sm" key={n}><span>{i+1}. {tag?'#':''}{n}</span><b>{c}件</b></div>)}</section>}

function Settings({data,visibleRecords,setData,activeAccount,cloudEnabled,onRefreshShared,onSyncRecord,onSyncDefinitions,onSyncError}:{data:AppData;visibleRecords:MelonpanRecord[];setData:(d:AppData)=>void;activeAccount:SharedAccount|null;cloudEnabled:boolean;onRefreshShared:()=>Promise<void>;onSyncRecord:(record:MelonpanRecord,accountId:string)=>Promise<boolean>;onSyncDefinitions:(definitions:CustomRatingDefinition[])=>Promise<void>;onSyncError:(message:string)=>void}){
 const [label,setLabel]=useState('')
 const [message,setMessage]=useState('')
 const [busy,setBusy]=useState(false)
 const input=useRef<HTMLInputElement>(null)
 const changeDefs=async(definitions:CustomRatingDefinition[])=>{
  const updated=await saveDefinitions(definitions)
  setData(updated)
  if(activeAccount)await onSyncDefinitions(definitions)
 }
 const exportJson=()=>download(`melonpan-diary-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({...data,records:visibleRecords},null,2),'application/json')
 const importJson=async(file:File)=>{
  try{
   const parsed=parseBackup(JSON.parse(await file.text()))
   if(!parsed)throw new Error()
   if(!confirm('現在の端末内データをこのバックアップで置き換えます。クラウドには自動投稿されません。よろしいですか？'))return
   await saveData(parsed)
   setData(parsed)
   alert('復元しました。未投稿記録は下の共有ボタンから投稿できます。')
  }catch{alert('有効なメロンパン日記のJSONファイルではありません。')}
 }
 const publishLocalRecords=async()=>{
  if(!activeAccount)return
  const unassigned=data.records.filter(record=>!record.accountId)
  if(!unassigned.length){setMessage('未投稿のローカル記録はありません。');return}
  if(!confirm(`${unassigned.length}件の未投稿記録を「${activeAccount.name}」の投稿として共有します。`))return
  setBusy(true)
  setMessage('')
  try{
   const assigned=unassigned.map(record=>({...record,accountId:activeAccount.id}))
   for(const record of assigned)await syncSharedRecord(record,activeAccount.id)
   await syncSharedDefinitions(data.definitions,activeAccount.id)
   const assignedIds=new Set(assigned.map(record=>record.id))
   const next={...data,records:data.records.map(record=>assignedIds.has(record.id)?{...record,accountId:activeAccount.id}:record)}
   await saveData(next)
   setData(next)
   setMessage(`${assigned.length}件を共有しました。`)
   onSyncError('')
  }catch(error:unknown){
   const detail=error instanceof Error?error.message:'共有に失敗しました。'
   setMessage(detail)
   onSyncError(detail)
  }finally{setBusy(false)}
 }
 const retryPendingRecords=async()=>{
  if(!activeAccount)return
  const pending=data.records.filter(record=>record.accountId===activeAccount.id&&record.syncPending)
  if(!pending.length){setMessage('再送信が必要な記録はありません。');return}
  setBusy(true)
  setMessage('')
  try{
   for(const record of pending){
    if(!await onSyncRecord(record,activeAccount.id))throw new Error('一部の記録を再送信できませんでした。通信状態を確認して再度お試しください。')
    const updated=await saveRecord({...record,syncPending:false})
    setData(updated)
   }
   setMessage(`${pending.length}件を再送信しました。`)
  }catch(error:unknown){
   const detail=error instanceof Error?error.message:'再送信に失敗しました。'
   setMessage(detail)
   onSyncError(detail)
  }finally{setBusy(false)}
 }
 return <>
  <header className="mb-4"><h1 className="text-3xl font-black">設定</h1></header>
  <section className="card">
   <h2 className="font-bold">任意の評価項目</h2><p className="mt-1 text-sm text-[#826e5b]">記録画面に表示する5段階評価を管理します。</p>
   <div className="mt-3 space-y-2">{[...data.definitions].sort((a,b)=>a.order-b.order).map(d=><div className="flex items-center gap-2" key={d.id}><input className="h-5 w-5" aria-label={`${d.label}を有効にする`} type="checkbox" checked={d.enabled} onChange={e=>void changeDefs(data.definitions.map(x=>x.id===d.id?{...x,enabled:e.target.checked}:x))}/><span className="flex-1">{d.label}</span><button className="text-sm text-red-700" onClick={()=>void changeDefs(data.definitions.filter(x=>x.id!==d.id))}>削除</button></div>)}</div>
   <div className="mt-3 flex gap-2"><input className="field mt-0" value={label} maxLength={30} onChange={e=>setLabel(e.target.value)} placeholder="例：香り"/><button className="btn-sub shrink-0" onClick={()=>{const value=label.trim();if(value){void changeDefs([...data.definitions,{id:id(),label:value,order:data.definitions.length,enabled:true}]);setLabel('')}}}>追加</button></div>
  </section>
<<<<<<< HEAD
  <section className="card mt-4"><h2 className="font-bold">バックアップと復元</h2><p className="mt-1 text-sm text-[#826e5b]">表示中のアカウントの記録と設定をJSONに保存します。定期的なバックアップをおすすめします。</p><div className="mt-4 grid gap-2"><button className="btn-main" onClick={exportJson}>ファイルにエクスポート</button><input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)void importJson(file)}}/><button className="btn-sub" onClick={()=>input.current?.click()}>ファイルから復元</button></div></section>
  {activeAccount&&<section className="card mt-4"><h2 className="font-bold">共有アカウント</h2><p className="mt-1 text-sm text-[#826e5b]">選択中：{activeAccount.name}。アカウントは画面上部から切り替えできます。</p><button className="btn-sub mt-3 w-full" disabled={busy} onClick={()=>void onRefreshShared()}>共有データを再読み込み</button><button className="btn-main mt-2 w-full" disabled={busy} onClick={()=>void publishLocalRecords()}>未投稿のローカル記録を共有する（{data.records.filter(record=>!record.accountId).length}件）</button><button className="btn-sub mt-2 w-full" disabled={busy} onClick={()=>void retryPendingRecords()}>失敗した投稿を再送信する（{data.records.filter(record=>record.accountId===activeAccount.id&&record.syncPending).length}件）</button>{message&&<p role="status" className="mt-3 text-sm text-[#76563a]">{message}</p>}<p className="mt-3 text-xs text-[#826e5b]"></p></section>}
=======
  <section className="card mt-4"><h2 className="font-bold">バックアップと復元</h2><p className="mt-1 text-sm text-[#826e5b]">表示中のアカウントの記録と設定をJSONに保存します。定期的なバックアップをおすすめします。</p><div className="mt-4 grid gap-2"><button className="btn-main" onClick={exportJson}>表示中アカウントをJSONにエクスポート</button><button className="btn-sub" onClick={()=>download('melonpan-diary.csv',csv(visibleRecords),'text/csv;charset=utf-8')}>表示中アカウントをCSVにエクスポート</button><input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)void importJson(file)}}/><button className="btn-sub" onClick={()=>input.current?.click()}>JSONから復元</button></div></section>
  <section className="card mt-4"><h2 className="font-bold">サンプルデータ</h2><p className="mt-1 text-sm text-[#826e5b]">操作を試すための2件の記録です。</p><div className="mt-3"><button className="btn-sub w-full" onClick={async()=>{if(confirm('サンプルデータを追加しますか？')){const added=sample().map(record=>({...record,accountId:undefined}));const next={...data,records:[...data.records,...added]};await saveData(next);setData(next)}}}>投入する</button></div></section>
  {activeAccount&&<section className="card mt-4"><h2 className="font-bold">共有アカウント</h2><p className="mt-1 text-sm text-[#826e5b]">選択中：{activeAccount.name}。アカウントを押し直すと切り替わります。</p><button className="btn-sub mt-3 w-full" disabled={busy} onClick={()=>void onRefreshShared()}>共有データを再読み込み</button><button className="btn-sub mt-2 w-full" onClick={onChangeAccount}>アカウントを切り替える</button><button className="btn-main mt-2 w-full" disabled={busy} onClick={()=>void publishLocalRecords()}>未投稿のローカル記録を共有する（{data.records.filter(record=>!record.accountId).length}件）</button><button className="btn-sub mt-2 w-full" disabled={busy} onClick={()=>void retryPendingRecords()}>失敗した投稿を再送信する（{data.records.filter(record=>record.accountId===activeAccount.id&&record.syncPending).length}件）</button>{message&&<p role="status" className="mt-3 text-sm text-[#76563a]">{message}</p>}<p className="mt-3 text-xs text-[#826e5b]"></p></section>}
>>>>>>> 207993a71a1093b99e20b3f38a487b30aaf7da07
  {!activeAccount&&<section className="card mt-4"><h2 className="font-bold">クラウド共有</h2><p className="mt-2 text-sm text-[#826e5b]">{cloudEnabled?'共有データを使うにはアカウントを選択してください。現在はこの端末だけに保存されています。':'Supabase未設定のため、現在はこの端末だけに保存されています。'}</p></section>}
 </>
}
