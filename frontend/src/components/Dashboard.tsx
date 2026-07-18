'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, ArrowLeftRight, RefreshCw, AlertTriangle,
  Bell, Brain, LogOut, Download, ThumbsUp, ThumbsDown,
  RotateCcw, ChevronRight, TrendingUp, Activity,
} from 'lucide-react';
import {
  transactions as txApi, ml, seed,
  Transaction, Alert, MoneyLeak, ModelStats, ModelPerformance,
  RetrainDiff, DailyStat, CategoryStat, Feedback,
} from '@/lib/api';
import { useSSE, SSEAlert } from '@/lib/useSSE';
import SpendingChart from '@/components/charts/SpendingChart';
import CategoryDonut from '@/components/charts/CategoryDonut';
import ConfidenceMeter from '@/components/ConfidenceMeter';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:      '#FAF9F6',
  surface: '#F1F0EC',
  ink:     '#1C1C1A',
  muted:   '#6B6A64',
  teal:    '#3D7368',
  clay:    '#B85C38',
  navy:    '#22304A',
  rule:    '#E4E2DC',
  mono:    "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
};

// Anomaly weight normalization (raw sum = 135 → normalize to 100%)
const ANOMALY_KEYS = new Set([
  'isolation_forest_score','global_amount_deviation','category_amount_deviation',
  'same_day_velocity','unusual_time','weekend_business','new_merchant',
]);
const SUB_KEYS = new Set([
  'interval_consistency','amount_consistency','known_billing_cycle',
  'occurrence_frequency','price_drift',
]);
function normalizeWeights(weights: Record<string,number>, keys: Set<string>): Record<string,number> {
  const relevant = Object.entries(weights).filter(([k]) => keys.has(k));
  const total = relevant.reduce((s,[,v]) => s + v, 0) || 1;
  const out: Record<string,number> = {};
  for (const [k,v] of relevant) out[k] = v / total;
  return out;
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'overview'|'transactions'|'subscriptions'|'anomalies'|'alerts'|'model';
interface Toast { id:number; type:'success'|'error'|'info'; msg:string }

export interface SignalBreakdown { signal:string; weight:number; fired:boolean; description:string }
function parseSignals(s?:string):SignalBreakdown[]{ try{return s?JSON.parse(s):[]}catch{return []} }

function getExplanation(signals:SignalBreakdown[], risk:string):string{
  const fired = signals.filter(s=>s.fired).sort((a,b)=>b.weight-a.weight);
  if(!fired.length) return risk==='high'?'Highly isolated spending pattern (Isolation Forest)':'Spending deviates from your baseline';
  const top = fired[0];
  return top.description || top.signal.replace(/_/g,' ');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v:number) => v>=1000?`$${(v/1000).toFixed(1)}k`:`$${v.toFixed(2)}`;
const fmtD = (d:string) => new Date(d+(d.includes('T')?'':'T12:00')).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});
const pct = (v:number) => `${(v*100).toFixed(0)}%`;

const NAV: {id:Tab; icon:React.ReactNode; label:string}[] = [
  {id:'overview',      icon:<LayoutDashboard size={16} strokeWidth={1.75}/>, label:'Overview'},
  {id:'transactions',  icon:<ArrowLeftRight  size={16} strokeWidth={1.75}/>, label:'Transactions'},
  {id:'subscriptions', icon:<RefreshCw       size={16} strokeWidth={1.75}/>, label:'Subscriptions'},
  {id:'anomalies',     icon:<AlertTriangle   size={16} strokeWidth={1.75}/>, label:'Anomalies'},
  {id:'alerts',        icon:<Bell            size={16} strokeWidth={1.75}/>, label:'Alerts'},
  {id:'model',         icon:<Brain           size={16} strokeWidth={1.75}/>, label:'ML Model'},
];

// ─── Small UI pieces ────────────────────────────────────────────────────────────
function Spinner({dark=false}:{dark?:boolean}){
  return <span className={`spinner${dark?' spinner-dark':''}`}/>;
}

function Toast({t, onDismiss}:{t:Toast; onDismiss:()=>void}){
  const c={success:D.teal, error:D.clay, info:D.navy}[t.type];
  return(
    <div className="toast" onClick={onDismiss} style={{cursor:'pointer',borderLeftColor:c,borderLeftWidth:3}}>
      <span style={{color:c,fontSize:16}}>{t.type==='success'?'✓':t.type==='error'?'✕':'·'}</span>
      <span style={{fontSize:13,color:D.ink}}>{t.msg}</span>
    </div>
  );
}

function Divider(){return <div style={{height:1,background:D.rule}}/>;}

function EmptyState({icon,title,sub}:{icon:React.ReactNode;title:string;sub:string}){
  return(
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{sub}</p>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard({userEmail}:{userEmail:string}){
  const [tab,setTab]             = useState<Tab>('overview');
  const [toasts,setToasts]       = useState<Toast[]>([]);
  const toastId                  = useRef(0);

  const [allTx,setAllTx]           = useState<Transaction[]>([]);
  const [daily,setDaily]           = useState<DailyStat[]>([]);
  const [cats,setCats]             = useState<CategoryStat[]>([]);
  const [alerts,setAlerts]         = useState<Alert[]>([]);
  const [leaks,setLeaks]           = useState<MoneyLeak[]>([]);
  const [modelStats,setModelStats] = useState<ModelStats|null>(null);
  const [perf,setPerf]             = useState<ModelPerformance|null>(null);
  const [retrainDiff,setRetrainDiff] = useState<RetrainDiff|null>(null);
  const [feedback,setFeedback]     = useState<Record<number,'positive'|'negative'>>({});
  const [loading,setLoading]       = useState(true);
  const [analyzing,setAnalyzing]   = useState(false);
  const [seeding,setSeeding]       = useState(false);
  const [retraining,setRetraining] = useState(false);
  const [search,setSearch]         = useState('');
  const [pendingFeedback,setPendingFeedback] = useState<Record<number,boolean>>({});

  const toast = useCallback((type:Toast['type'],msg:string)=>{
    const id=++toastId.current;
    setToasts(p=>[...p,{id,type,msg}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),5000);
  },[]);

  const fetchAll = useCallback(async()=>{
    try{
      const [txs,d,c,al,lk,ms,fb] = await Promise.all([
        txApi.list({limit:500}), txApi.daily(), txApi.categories(),
        ml.alerts(), ml.moneyLeaks(), ml.modelStats(), ml.getFeedback().catch(()=>[]),
      ]);
      setAllTx(txs); setDaily(d); setCats(c);
      setAlerts(al); setLeaks(lk); setModelStats(ms);
      const fbMap:Record<number,'positive'|'negative'> = {};
      for(const f of (fb as Feedback[])) fbMap[f.transaction_id]=f.feedback;
      setFeedback(fbMap);
    }catch(err:any){
      if(!err.message?.includes('404')&&!err.message?.includes('500'))
        toast('error','Cannot reach backend — is port 5000 running?');
    }finally{ setLoading(false); }
  },[toast]);

  useEffect(()=>{ fetchAll(); },[fetchAll]);

  const fetchPerf = async()=>{
    try{ const p = await ml.performance(); setPerf(p); }catch{}
  };

  const handleSSE = useCallback((a:SSEAlert)=>{
    toast('info',`⚡ ${a.severity?.toUpperCase()}: ${a.merchant} — ${(a.message||'').slice(0,60)}`);
    fetchAll();
  },[toast,fetchAll]);
  useSSE(handleSSE);

  const runAnalysis = async()=>{
    setAnalyzing(true);
    try{
      const r=await ml.analyze();
      toast('success',`Analysis complete — ${r.subscriptions} subscriptions, ${r.anomalies} anomalies, ${r.new_alerts} new alerts`);
      await fetchAll();
    }catch(err:any){toast('error',err.message||'Analysis failed');}
    finally{setAnalyzing(false);}
  };

  const loadDemo = async()=>{
    setSeeding(true);
    try{
      const r=await seed.load();
      toast('success',`Loaded ${r.transactions_inserted} transactions — click Run Analysis`);
      await fetchAll();
    }catch(err:any){toast('error',err.message||'Seeding failed');}
    finally{setSeeding(false);}
  };

  const runRetrain = async()=>{
    setRetraining(true);
    try{
      const r=await ml.retrain();
      setRetrainDiff(r.diff);
      toast('success','Retraining complete — see diff below');
      await fetchAll();
    }catch(err:any){toast('error',err.message||'Retraining failed');}
    finally{setRetraining(false);}
  };

  const sendFeedback = async(txId:number, fb:'positive'|'negative')=>{
    setPendingFeedback(p=>({...p,[txId]:true}));
    try{
      await ml.feedback(txId,fb);
      setFeedback(p=>({...p,[txId]:fb}));
      toast('success',`Feedback recorded — will inform future retraining`);
    }catch{ toast('error','Could not record feedback'); }
    finally{ setPendingFeedback(p=>({...p,[txId]:false})); }
  };

  const exportCSV = ()=>{
    const token = localStorage.getItem('token');
    const url = ml.exportAnomaliesUrl();
    const a = document.createElement('a');
    a.href = url; a.download='flagged-transactions.csv';
    // Attach auth via fetch+blob for authenticated download
    fetch(url,{headers:{'Authorization':`Bearer ${token}`}})
      .then(r=>r.blob()).then(b=>{
        a.href=URL.createObjectURL(b); a.click();
      }).catch(()=>toast('error','Export failed'));
  };

  const markRead    = async(id:number)=>{ try{await ml.markRead(id); setAlerts(p=>p.map(a=>a.id===id?{...a,is_read:true}:a));}catch{} };
  const markAllRead = async()=>{  try{await ml.markAllRead(); setAlerts(p=>p.map(a=>({...a,is_read:true}))); toast('success','All alerts marked read');}catch{} };
  const logout = ()=>{ localStorage.clear(); window.location.reload(); };

  const subs       = allTx.filter(t=>t.is_subscription);
  const anomalies  = allTx.filter(t=>t.is_anomaly);
  const unread     = alerts.filter(a=>!a.is_read);
  const totalSpent = daily.reduce((s,d)=>s+d.total,0);
  const filteredTx = search ? allTx.filter(t=>(t.merchant_name||t.category||'').toLowerCase().includes(search.toLowerCase())) : allTx;

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if(loading) return(
    <div style={{display:'flex',minHeight:'100vh',background:D.bg,fontFamily:"'Inter',-apple-system,sans-serif"}}>
      <div style={{width:200,background:'#fff',borderRight:`1px solid ${D.rule}`,padding:'20px 12px',display:'flex',flexDirection:'column',gap:6}}>
        {NAV.map((_,i)=><div key={i} className="skeleton" style={{height:34}}/>)}
      </div>
      <div style={{flex:1,padding:32,display:'flex',flexDirection:'column',gap:24}}>
        <div style={{display:'flex',gap:48}}>
          {[0,1,2,3].map(i=><div key={i} style={{display:'flex',flexDirection:'column',gap:6}}><div className="skeleton" style={{height:11,width:80}}/><div className="skeleton" style={{height:36,width:110}}/></div>)}
        </div>
        <div className="skeleton" style={{height:200,borderRadius:8}}/>
      </div>
    </div>
  );

  // ── Layout ──────────────────────────────────────────────────────────────────
  return(
    <div style={{display:'flex',minHeight:'100vh',background:D.bg,color:D.ink,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif"}}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside style={{width:200,background:'#fff',borderRight:`1px solid ${D.rule}`,display:'flex',flexDirection:'column',padding:'16px 10px',flexShrink:0}}>
        <div style={{padding:'4px 6px 20px',display:'flex',alignItems:'center',gap:9}}>
          <TrendingUp size={18} color={D.navy} strokeWidth={2}/>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:D.ink,letterSpacing:'-0.01em'}}>Ledgerline</div>
            <div style={{fontSize:10,color:D.muted}}>Intelligence</div>
          </div>
        </div>

        <nav style={{flex:1,display:'flex',flexDirection:'column',gap:2}}>
          {NAV.map(item=>{
            const active=tab===item.id;
            return(
              <button key={item.id} id={`nav-${item.id}`} className={`nav-item${active?' active':''}`} onClick={()=>setTab(item.id)}>
                {item.icon}
                <span>{item.label}</span>
                {item.id==='alerts'&&unread.length>0&&(
                  <span style={{marginLeft:'auto',background:D.clay,color:'#fff',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:999,minWidth:18,textAlign:'center'}}>{unread.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{borderTop:`1px solid ${D.rule}`,paddingTop:12,marginTop:12}}>
          <div style={{fontSize:11,color:D.muted,padding:'0 4px 8px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userEmail}</div>
          <button className="nav-item" onClick={logout} style={{color:D.clay}}>
            <LogOut size={15} strokeWidth={1.75}/> Logout
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'auto'}}>

        {/* Header */}
        <header style={{background:'#fff',borderBottom:`1px solid ${D.rule}`,padding:'11px 28px',display:'flex',alignItems:'center',gap:10,position:'sticky',top:0,zIndex:50}}>
          <span style={{flex:1,fontSize:16,fontWeight:700,color:D.ink}}>{NAV.find(n=>n.id===tab)?.label}</span>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:D.muted}}>
            <div className="live-dot"/><span>Live</span>
          </div>
          <button className="btn-secondary" onClick={loadDemo} disabled={seeding} id="btn-seed">
            {seeding?<Spinner dark/>:<RefreshCw size={13} strokeWidth={2}/>}
            {seeding?'Loading…':'Demo Data'}
          </button>
          <button className="btn-primary" onClick={runAnalysis} disabled={analyzing} id="btn-analyze">
            {analyzing?<Spinner/>:<Activity size={13} strokeWidth={2}/>}
            {analyzing?'Analyzing…':'Run Analysis'}
          </button>
        </header>

        {/* Page content */}
        <main style={{flex:1,padding:'28px 28px 48px',display:'flex',flexDirection:'column',gap:24}}>

          {/* ══ OVERVIEW ══════════════════════════════════════════════════════ */}
          {tab==='overview'&&(
            <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:28}}>
              {/* Bare stats — no card containers */}
              <div style={{display:'flex',gap:0}}>
                {[
                  {label:'30-Day Spend',    val:fmt(totalSpent),        sub:`${daily.length} days tracked`,       color:D.ink},
                  {label:'Subscriptions',   val:subs.length.toString(),  sub:`${new Set(subs.map(t=>t.merchant_name)).size} unique services`, color:D.teal},
                  {label:'Anomalies',       val:anomalies.length.toString(), sub:`${anomalies.filter(t=>t.risk_level==='high').length} high risk`, color:D.clay},
                  {label:'Money Leaks',     val:leaks.length.toString(), sub:leaks.length?`≈$${leaks.reduce((s,l)=>s+l.estimated_annual_cost,0).toFixed(0)}/yr wasted`:'All clear', color:D.muted},
                ].map((s,i,arr)=>(
                  <div key={s.label} style={{flex:1,paddingRight:32,marginRight:32,borderRight:i<arr.length-1?`1px solid ${D.rule}`:'none'}}>
                    <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:D.muted,marginBottom:6}}>{s.label}</div>
                    <div style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:30,fontWeight:600,color:s.color,lineHeight:1,marginBottom:4,letterSpacing:'-0.02em'}}>{s.val}</div>
                    <div style={{fontSize:12,color:D.muted}}>{s.sub}</div>
                  </div>
                ))}
              </div>

              <Divider/>

              {/* Charts row */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:24}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase',color:D.muted,marginBottom:14}}>30-Day Spending Trend</div>
                  <SpendingChart data={daily} height={180}/>
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase',color:D.muted,marginBottom:14}}>By Category</div>
                  <CategoryDonut data={cats} size={150}/>
                </div>
              </div>

              {/* Recent anomalies */}
              {anomalies.length>0&&(
                <>
                  <Divider/>
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                      <span style={{fontSize:14,fontWeight:700,color:D.ink}}>Recent Anomalies</span>
                      <button onClick={()=>setTab('anomalies')} style={{fontSize:12,color:D.navy,background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontFamily:"inherit"}}>
                        View all <ChevronRight size={13}/>
                      </button>
                    </div>
                    <div className="surface-group">
                      {anomalies.slice(0,4).map((tx,i)=>{
                        const sig=parseSignals(tx.ml_signals);
                        const exp=getExplanation(sig,tx.risk_level);
                        return(
                          <div key={tx.id}>
                            {i>0&&<Divider/>}
                            <div style={{display:'flex',gap:14,padding:'12px 16px',alignItems:'flex-start'}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:14,fontWeight:600,color:D.ink}}>{tx.merchant_name||tx.category}</div>
                                <div style={{fontSize:12,color:D.clay,marginTop:2}}>{exp}</div>
                                <div style={{fontSize:11,color:D.muted,marginTop:2}}>{fmtD(tx.date)} · {tx.category}</div>
                              </div>
                              <div style={{textAlign:'right',flexShrink:0}}>
                                <div style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:15,fontWeight:600,color:D.clay}}>{fmt(tx.amount)}</div>
                                <div style={{fontSize:11,color:D.muted,marginTop:2}}>{pct(tx.anomaly_score)} score</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
              {allTx.length===0&&<EmptyState icon={<RefreshCw size={40}/>} title="No transactions yet" sub='Click "Demo Data" to load sample data, then "Run Analysis" to detect patterns.'/>}
            </div>
          )}

          {/* ══ TRANSACTIONS ═══════════════════════════════════════════════════ */}
          {tab==='transactions'&&(
            <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search merchant or category…" style={{width:280}}/>
                <span style={{fontSize:12,color:D.muted,marginLeft:4}}>{filteredTx.length} rows</span>
                <div style={{marginLeft:'auto'}}>
                  <button className="btn-secondary" onClick={exportCSV} id="btn-export">
                    <Download size={13} strokeWidth={2}/>Export Flagged CSV
                  </button>
                </div>
              </div>
              {filteredTx.length===0
                ?<EmptyState icon={<ArrowLeftRight size={36}/>} title="No results" sub={allTx.length===0?'Load demo data first.':'Try a different search term.'}/>
                :(
                  <div className="surface-group">
                    <div style={{overflowX:'auto'}}>
                      <table>
                        <thead>
                          <tr>
                            <th>Merchant</th>
                            <th>Category</th>
                            <th className="right">Amount</th>
                            <th>Date</th>
                            <th>Subscription</th>
                            <th>Anomaly</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTx.slice(0,120).map(tx=>(
                            <tr key={tx.id}>
                              <td style={{fontWeight:500}}>{tx.merchant_name||'—'}</td>
                              <td><span className="badge badge-muted">{tx.category||'Other'}</span></td>
                              <td className="mono-cell" style={{color:tx.is_anomaly?D.clay:D.ink,fontWeight:tx.is_anomaly?600:400}}>{fmt(tx.amount)}</td>
                              <td style={{color:D.muted,fontSize:13}}>{fmtD(tx.date)}</td>
                              <td>{tx.is_subscription?<span className="badge badge-sub">↻ {pct(tx.subscription_confidence)}</span>:<span style={{color:D.muted,fontSize:12}}>—</span>}</td>
                              <td>{tx.is_anomaly?<span className="badge badge-risk">{tx.risk_level} {pct(tx.anomaly_score)}</span>:<span style={{color:D.muted,fontSize:12}}>—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* ══ SUBSCRIPTIONS ══════════════════════════════════════════════════ */}
          {tab==='subscriptions'&&(
            <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:24}}>
              {subs.length===0
                ?<EmptyState icon={<RefreshCw size={36}/>} title="No subscriptions detected" sub="Load demo data and run ML Analysis to detect recurring charges."/>
                :(
                  <>
                    {/* Bare stats */}
                    <div style={{display:'flex',gap:0}}>
                      {[
                        {label:'Unique Services', val:new Set(subs.map(t=>t.merchant_name)).size.toString(), color:D.teal},
                        {label:'Est. Monthly',    val:fmt([...new Map(subs.map(t=>[t.merchant_name,t])).values()].reduce((s,t)=>s+t.amount,0)), color:D.ink},
                        {label:'Est. Annual',     val:fmt([...new Map(subs.map(t=>[t.merchant_name,t])).values()].reduce((s,t)=>s+t.amount*12,0)), color:D.ink},
                      ].map((s,i,arr)=>(
                        <div key={s.label} style={{flex:1,paddingRight:32,marginRight:32,borderRight:i<arr.length-1?`1px solid ${D.rule}`:'none'}}>
                          <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:D.muted,marginBottom:6}}>{s.label}</div>
                          <div style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:28,fontWeight:600,color:s.color,lineHeight:1,letterSpacing:'-0.02em'}}>{s.val}</div>
                        </div>
                      ))}
                    </div>

                    <Divider/>

                    {/* Subscription list */}
                    <div className="surface-group">
                      {[...new Map(subs.map(t=>[t.merchant_name,t])).values()]
                        .sort((a,b)=>b.subscription_confidence-a.subscription_confidence)
                        .map((tx,i,arr)=>{
                          const sigs=parseSignals(tx.ml_signals).filter(s=>s.fired);
                          return(
                            <div key={tx.id}>
                              {i>0&&<Divider/>}
                              <div style={{display:'flex',alignItems:'center',gap:16,padding:'13px 18px'}}>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:14,fontWeight:600,color:D.ink}}>{tx.merchant_name||tx.category}</div>
                                  <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>
                                    {sigs.slice(0,3).map((s,i)=>(
                                      <span key={i} className="badge badge-sub" style={{fontSize:10}}>{s.signal.replace(/_/g,' ')}</span>
                                    ))}
                                  </div>
                                </div>
                                <div style={{textAlign:'right',flexShrink:0}}>
                                  <div style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:17,fontWeight:600,color:D.teal}}>{fmt(tx.amount)}</div>
                                  <div style={{fontSize:11,color:D.muted,marginTop:2}}>{tx.category} · {fmtD(tx.date)}</div>
                                </div>
                                <ConfidenceMeter value={tx.subscription_confidence} size={52} label="confidence"/>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Money leaks */}
                    {leaks.length>0&&(
                      <>
                        <div style={{fontSize:14,fontWeight:700,color:D.ink}}>
                          Money Leaks <span style={{fontSize:12,color:D.muted,fontWeight:400}}>— forgotten subscriptions</span>
                        </div>
                        <div className="surface-group">
                          {leaks.map((leak,i)=>(
                            <div key={i}>
                              {i>0&&<Divider/>}
                              <div style={{display:'flex',alignItems:'center',gap:14,padding:'13px 18px'}}>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:14,fontWeight:600,color:D.ink}}>{leak.merchant_name}</div>
                                  <div style={{fontSize:12,color:D.muted,marginTop:2}}>${leak.amount.toFixed(2)} · {leak.occurrences}× in 90d · last {fmtD(leak.last_seen)}</div>
                                </div>
                                <div style={{textAlign:'right'}}>
                                  <div style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:15,fontWeight:600,color:D.clay}}>≈${leak.estimated_annual_cost.toFixed(0)}/yr</div>
                                  <div style={{fontSize:11,color:D.muted}}>wasted annually</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
            </div>
          )}

          {/* ══ ANOMALIES ══════════════════════════════════════════════════════ */}
          {tab==='anomalies'&&(
            <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:13,color:D.muted}}>{anomalies.length} flagged transactions</span>
                {anomalies.length>0&&(
                  <button className="btn-secondary" onClick={exportCSV}>
                    <Download size={12} strokeWidth={2}/>Export CSV
                  </button>
                )}
              </div>
              {anomalies.length===0
                ?<EmptyState icon={<AlertTriangle size={36}/>} title="No anomalies detected" sub="Load demo data and run ML Analysis — the dataset includes pre-injected anomalies."/>
                :(
                  <div className="surface-group">
                    {anomalies.sort((a,b)=>b.anomaly_score-a.anomaly_score).map((tx,i)=>{
                      const sigs=parseSignals(tx.ml_signals);
                      const exp=getExplanation(sigs,tx.risk_level);
                      const firedSigs=sigs.filter(s=>s.fired);
                      const fb=feedback[tx.id];
                      const pending=pendingFeedback[tx.id];
                      return(
                        <div key={tx.id}>
                          {i>0&&<Divider/>}
                          <div style={{padding:'16px 18px 14px'}}>
                            {/* Row 1: merchant + amount */}
                            <div style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:4}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                                  <span style={{fontSize:14,fontWeight:700,color:D.ink}}>{tx.merchant_name||tx.category}</span>
                                  <span className={`badge badge-risk`} style={{fontSize:10}}>{tx.risk_level}</span>
                                  <span className="badge badge-muted" style={{fontSize:10}}>{tx.category}</span>
                                </div>
                                {/* Explanation line in clay */}
                                <div style={{fontSize:13,color:D.clay,marginTop:5,lineHeight:1.4}}>{exp}</div>
                                <div style={{fontSize:11,color:D.muted,marginTop:3}}>{fmtD(tx.date)}</div>
                              </div>
                              <div style={{textAlign:'right',flexShrink:0}}>
                                <div style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:18,fontWeight:700,color:D.clay}}>{fmt(tx.amount)}</div>
                                <div style={{fontSize:11,color:D.muted,marginTop:2}}>Score: {pct(tx.anomaly_score)}</div>
                              </div>
                            </div>

                            {/* Row 2: signal badges + feedback */}
                            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10,flexWrap:'wrap'}}>
                              {firedSigs.slice(0,4).map((s,i)=>(
                                <span key={i} className="badge badge-muted" style={{fontSize:10}}>{s.signal.replace(/_/g,' ')}</span>
                              ))}
                              <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
                                <span style={{fontSize:11,color:D.muted}}>Was this actually unusual?</span>
                                <button
                                  onClick={()=>!pending&&sendFeedback(tx.id,'negative')}
                                  disabled={!!pending}
                                  title="Yes, unusual"
                                  style={{display:'flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:6,border:`1px solid ${D.rule}`,background:fb==='negative'?D.clay:'transparent',color:fb==='negative'?'#fff':D.muted,cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:'inherit',transition:'all 0.12s'}}>
                                  <ThumbsDown size={12} strokeWidth={2}/>Yes
                                </button>
                                <button
                                  onClick={()=>!pending&&sendFeedback(tx.id,'positive')}
                                  disabled={!!pending}
                                  title="Actually normal"
                                  style={{display:'flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:6,border:`1px solid ${D.rule}`,background:fb==='positive'?D.teal:'transparent',color:fb==='positive'?'#fff':D.muted,cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:'inherit',transition:'all 0.12s'}}>
                                  <ThumbsUp size={12} strokeWidth={2}/>Normal
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}

          {/* ══ ALERTS ═════════════════════════════════════════════════════════ */}
          {tab==='alerts'&&(
            <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:14}}>
              {alerts.length>0&&(
                <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <button className="btn-ghost" onClick={markAllRead}>✓ Mark all read</button>
                </div>
              )}
              {alerts.length===0
                ?<EmptyState icon={<Bell size={36}/>} title="No alerts" sub="Anomaly alerts from the ML engine will appear here."/>
                :(
                  <div className="surface-group">
                    {alerts.map((al,i)=>{
                      const isHigh=al.severity==='high';
                      return(
                        <div key={al.id}>
                          {i>0&&<Divider/>}
                          <div style={{display:'flex',gap:12,padding:'13px 18px',alignItems:'flex-start',opacity:al.is_read?0.5:1}}>
                            <div style={{marginTop:2,flexShrink:0}}>
                              <div style={{width:7,height:7,borderRadius:'50%',background:al.is_read?D.rule:isHigh?D.clay:D.teal,marginTop:4}}/>
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:3}}>
                                <span style={{fontSize:14,fontWeight:600,color:D.ink}}>{al.merchant_name}</span>
                                <span className={`badge ${isHigh?'badge-risk':'badge-navy'}`} style={{fontSize:10}}>{al.severity}</span>
                              </div>
                              <div style={{fontSize:13,color:D.muted,lineHeight:1.45}}>{al.message}</div>
                              <div style={{fontSize:11,color:D.muted,marginTop:4}}>{fmtD(al.created_at||al.date)} · {fmt(Number(al.amount))}</div>
                            </div>
                            {!al.is_read&&(
                              <button className="btn-ghost" onClick={()=>markRead(al.id)} style={{flexShrink:0,fontSize:11}}>✓</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}

          {/* ══ ML MODEL ═══════════════════════════════════════════════════════ */}
          {tab==='model'&&(
            <div className="fade-up" style={{display:'flex',flexDirection:'column',gap:28}}>
              {!modelStats
                ?<EmptyState icon={<Brain size={36}/>} title="No model data yet" sub="Load transactions and run analysis first."/>
                :(
                  <>
                    {/* Bare stats — no box containers */}
                    <div style={{display:'flex',gap:0}}>
                      {[
                        {label:'Training Samples',  val:modelStats.training_sample_size.toLocaleString(), color:D.ink},
                        {label:'Sub. Threshold',    val:pct(modelStats.subscription_threshold), color:D.teal},
                        {label:'Anomaly Threshold', val:pct(modelStats.anomaly_threshold), color:D.clay},
                      ].map((s,i,arr)=>(
                        <div key={s.label} style={{paddingRight:32,marginRight:32,borderRight:i<arr.length-1?`1px solid ${D.rule}`:'none'}}>
                          <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:D.muted,marginBottom:6}}>{s.label}</div>
                          <div style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:28,fontWeight:600,color:s.color,lineHeight:1,letterSpacing:'-0.02em'}}>{s.val}</div>
                        </div>
                      ))}
                    </div>

                    <Divider/>

                    {/* Feature weights — two columns, no bars */}
                    {(()=>{
                      const subW  = normalizeWeights(modelStats.feature_weights, SUB_KEYS);
                      const anoW  = normalizeWeights(modelStats.feature_weights, ANOMALY_KEYS);
                      return(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:32}}>
                          {[
                            {title:'Subscription Feature Weights',  weights:subW,  note:'sums to 100%'},
                            {title:'Anomaly Signal Weights',        weights:anoW,  note:'normalized · sums to 100%'},
                          ].map(section=>(
                            <div key={section.title}>
                              <div style={{fontSize:13,fontWeight:700,color:D.ink,marginBottom:2}}>{section.title}</div>
                              <div style={{fontSize:11,color:D.muted,marginBottom:14}}>{section.note}</div>
                              <div className="surface-group">
                                {Object.entries(section.weights).sort((a,b)=>b[1]-a[1]).map(([k,v],i,arr)=>(
                                  <div key={k}>
                                    {i>0&&<Divider/>}
                                    <div style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',alignItems:'center'}}>
                                      <span style={{fontSize:13,color:D.ink}}>{k.replace(/_/g,' ')}</span>
                                      <span style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:600,color:D.navy,minWidth:40,textAlign:'right'}}>{pct(v)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    <Divider/>

                    {/* Model performance panel */}
                    <div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                        <div style={{fontSize:13,fontWeight:700,color:D.ink}}>Model Performance</div>
                        <button className="btn-ghost" onClick={fetchPerf} style={{fontSize:11}}>
                          {perf?'Refresh':'Load metrics'}
                        </button>
                      </div>
                      {!perf?(
                        <div style={{fontSize:13,color:D.muted,padding:'12px 0'}}>Click "Load metrics" to fetch evaluation results</div>
                      ):(
                        <>
                          <div style={{fontSize:11,color:D.muted,marginBottom:14,padding:'6px 10px',background:D.surface,borderRadius:6,display:'inline-block'}}>
                            ⓘ {perf.note}
                          </div>
                          <div style={{display:'flex',gap:0}}>
                            {[
                              {label:'Precision',          val:`${(perf.precision*100).toFixed(1)}%`},
                              {label:'Recall',             val:`${(perf.recall*100).toFixed(1)}%`},
                              {label:'F1 Score',           val:`${(perf.f1_score*100).toFixed(1)}%`},
                              {label:'False Positive Rate',val:`${(perf.false_positive_rate*100).toFixed(1)}%`},
                              {label:'Support (samples)',  val:perf.support.toString()},
                            ].map((m,i,arr)=>(
                              <div key={m.label} style={{paddingRight:24,marginRight:24,borderRight:i<arr.length-1?`1px solid ${D.rule}`:'none'}}>
                                <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:D.muted,marginBottom:6}}>{m.label}</div>
                                <div style={{fontFamily:D.mono,fontVariantNumeric:'tabular-nums',fontSize:22,fontWeight:600,color:D.ink,lineHeight:1}}>{m.val}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <Divider/>

                    {/* Retrain */}
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:D.ink,marginBottom:6}}>Retrain Model</div>
                      <div style={{fontSize:13,color:D.muted,marginBottom:14}}>
                        Re-runs training on current data. Shows a before/after diff of threshold changes.
                      </div>
                      <button className="btn-primary" onClick={runRetrain} disabled={retraining} id="btn-retrain">
                        {retraining?<Spinner/>:<RotateCcw size={13} strokeWidth={2}/>}
                        {retraining?'Retraining…':'Retrain Model'}
                      </button>
                      {retrainDiff&&(
                        <div style={{marginTop:16,padding:'14px 18px',background:D.surface,borderRadius:8}}>
                          <div style={{fontSize:12,fontWeight:700,color:D.ink,marginBottom:10}}>Before → After</div>
                          <div style={{display:'flex',flexDirection:'column',gap:8}}>
                            {[
                              {label:'Anomaly threshold', before:pct(retrainDiff.before.anomaly_threshold), after:pct(retrainDiff.after.anomaly_threshold)},
                              {label:'Sub. threshold',    before:pct(retrainDiff.before.subscription_threshold), after:pct(retrainDiff.after.subscription_threshold)},
                              {label:'Training samples',  before:retrainDiff.before.training_sample_size.toString(), after:retrainDiff.after.training_sample_size.toString()},
                            ].map(row=>(
                              <div key={row.label} style={{display:'flex',gap:12,alignItems:'center',fontSize:13}}>
                                <span style={{color:D.muted,width:160,flexShrink:0}}>{row.label}</span>
                                <span style={{fontFamily:D.mono,color:D.muted}}>{row.before}</span>
                                <span style={{color:D.muted}}>→</span>
                                <span style={{fontFamily:D.mono,color:row.before!==row.after?D.navy:D.ink,fontWeight:row.before!==row.after?700:400}}>{row.after}</span>
                                {row.before!==row.after&&<span style={{fontSize:10,color:D.navy,fontWeight:600}}>changed</span>}
                              </div>
                            ))}
                          </div>
                          {retrainDiff.changed.map((c,i)=>(
                            <div key={i} style={{marginTop:8,fontSize:12,color:D.teal}}>✓ {c}</div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Divider/>

                    {/* Algorithm explainer */}
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:D.ink,marginBottom:16}}>How the Models Work</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                        {[
                          {title:'Subscription Detection (MAD Clustering)', steps:[
                            'Group transactions by normalised merchant name',
                            'Compute interval MAD (Median Absolute Deviation) across occurrences',
                            'Match intervals vs known billing cycles: 7 / 30 / 90 days',
                            'Score amount consistency via relative MAD',
                            'Detect monotonic price drift as positive signal',
                            'Composite confidence = weighted sum across 5 signals',
                          ]},
                          {title:'Anomaly Detection (Isolation Forest)', steps:[
                            'Build per-category spend baselines (mean, σ) from history',
                            'Construct random hyperplane partition trees across transactions',
                            'Short isolation path → more anomalous data point',
                            'Layer 6 additional signal checks: time, velocity, weekend, new merchant',
                            'Blend IFO score (26%) + signal-layer score (74%)',
                            'Risk: Low <40%, Medium 40–65%, High >65%',
                          ]},
                        ].map(algo=>(
                          <div key={algo.title} style={{padding:'16px 18px',background:D.surface,borderRadius:8}}>
                            <div style={{fontSize:12,fontWeight:700,color:D.ink,marginBottom:12}}>{algo.title}</div>
                            <ol style={{listStyle:'none',padding:0,display:'flex',flexDirection:'column',gap:6}}>
                              {algo.steps.map((s,i)=>(
                                <li key={i} style={{display:'flex',gap:10,fontSize:12,color:D.muted}}>
                                  <span style={{color:D.navy,fontWeight:700,flexShrink:0,fontFamily:D.mono}}>{i+1}.</span>{s}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                      {modelStats.last_trained&&(
                        <div style={{marginTop:14,fontSize:12,color:D.muted}}>
                          Last trained: {new Date(modelStats.last_trained).toLocaleString()} · {modelStats.training_sample_size} transactions
                        </div>
                      )}
                    </div>
                  </>
                )}
            </div>
          )}
        </main>
      </div>

      {/* Toast container */}
      <div style={{position:'fixed',bottom:24,right:24,zIndex:9999,display:'flex',flexDirection:'column',gap:8}}>
        {toasts.map(t=><Toast key={t.id} t={t} onDismiss={()=>setToasts(p=>p.filter(x=>x.id!==t.id))}/>)}
      </div>
    </div>
  );
}
