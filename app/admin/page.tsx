"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Shield, Users, Bot, Flag, Activity, Database, RefreshCw, Ban, EyeOff, Eye, ScrollText, AlertTriangle, Search, BarChart3, WalletCards, TrendingUp, Zap, Globe2, Gauge } from "lucide-react";

type Stats = {
  users: { total: number; active: number; new24h: number; blocked: number };
  bots: { total: number; public: number; private: number };
  activeSessions: number;
  health: { status: string; activeCapacityLeases: number; waitingCapacityLeases: number; providerErrors24h: { type: string; count: number }[] };
  reports: { recent24h: number; byStatus: Record<string, number> };
  ai: {
    last24h: { provider: string; requests: number; tokens: number; estimatedCostUsd: number }[];
    last7d: { requests: number; tokens: number; estimatedCostUsd: number };
    qualityEvents24h: number; totalTokensAllTime: number; totalTokensToday: number;
    totalCostAllTimeUsd: number; totalCostTodayUsd: number;
    limits: { freeDailyTokens: number; premiumDailyTokens: number; globalDailyTokens: number; globalDailyUsd: number };
    pricing: { inputUsdPerMillion: number; outputUsdPerMillion: number; freeDailyCostRangeUsd: { min: number; max: number } };
  };
};
type AdminUser = { id: string; name: string; username: string; createdAt: number; plan: string; blockedAt: number | null; blockedReason: string; dailyTokensLimit: number; dailyTokensUsed: number; dailyCostUsd: number };
type AdminBot = { id: string; name: string; visibility: string; createdAt: number; ownerId: string; ownerName: string; ownerUsername: string };
type CapacitySettings = { capacity:number; source:"postgres"|"environment"; updatedAt:number|null; updatedBy:string|null };
type Audit = { id: string; action: string; targetType: string | null; targetId: string | null; createdAt: number; adminUsername: string; details: Record<string, unknown> };
type AdminAnalytics = {
  generatedAt: number; windowDays: number;
  daily: { day:string; requests:number; promptTokens:number; completionTokens:number; tokens:number; cost:number; regenerations:number; osintRefreshes:number; osintCacheHits:number }[];
  plans: { plan:string; requests:number; tokens:number; cost:number; users:number }[];
  models: { model:string; provider:string; requests:number; tokens:number; cost:number; avgLatencyMs:number }[];
  topUsers: { id:string; name:string; username:string; plan:string; requests:number; tokens:number; cost:number; regenerations:number; osintRefreshes:number }[];
  activeUsers30d:number; activeUsers24h:number; avgTokensPerRequest:number; avgCostPerActiveUser:number; avgPremiumCostPerUser:number; p95LatencyMs:number; osintHitRate:number;
  finance: { geminiFlash:{inputPerMillion:number;outputPerMillion:number}; geminiFlashLite:{inputPerMillion:number;outputPerMillion:number}; tavilyCreditPrice:number; supabaseBase:number; upstashPer100k:number; targetMargin:number; observedPremiumPriceFloor:number };
  recommendations: {severity:'info'|'warn'|'good';title:string;body:string}[];
};

async function api(path: string, options?: RequestInit) {
  const res = await fetch(path, { ...options, credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
  return data;
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [aiPaused, setAiPaused] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bots, setBots] = useState<AdminBot[]>([]);
  type AdminReport = { id: string; target_type?: string; target_id?: string; reason?: string; details?: string; status?: string; priority?: string; created_at?: number; updated_at?: number; resolution_note?: string; reporter_username?: string };
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [capacitySettings, setCapacitySettings] = useState<CapacitySettings | null>(null);
  const [capacityInput, setCapacityInput] = useState("5");
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [financeUsers, setFinanceUsers] = useState(100);
  const [financePremiumShare, setFinancePremiumShare] = useState(10);
  const [financePrice, setFinancePrice] = useState(9.99);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async function load(nextTab = tab) {
    setBusy(true); setMessage("");
    try {
      if (nextTab === "overview") { const data = await api("/api/admin"); setStats(data.stats); setAiPaused(!!data.runtime?.aiPaused); }
      if (nextTab === "users") setUsers((await api(`/api/admin?view=users&_=${Date.now()}`)).users);
      if (nextTab === "bots") setBots((await api("/api/admin?view=bots")).bots);
      if (nextTab === "reports") setReports((await api("/api/admin?view=reports")).reports);
      if (nextTab === "audit") setAudit((await api("/api/admin?view=audit")).audit);
      if (nextTab === "analytics" || nextTab === "finance") setAnalytics((await api(`/api/admin?view=analytics&_=${Date.now()}`)).analytics);
      if (nextTab === "capacity") { const data = await api(`/api/admin/capacity?_=${Date.now()}`); setCapacitySettings(data.settings); setCapacityInput(String(data.settings.capacity)); }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erro."); }
    finally { setBusy(false); }
  }, [tab]);
  useEffect(() => { void load(); }, [load]);

  async function reportAction(id: string, status: "reviewing" | "resolved" | "dismissed") {
    setBusy(true); setMessage("");
    try {
      await api("/api/reports", { method: "PATCH", body: JSON.stringify({ id, status, resolutionNote: status === "resolved" ? "Resolvida pelo painel administrativo." : "" }) });
      setMessage("Denúncia atualizada."); await load("reports");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erro."); }
    finally { setBusy(false); }
  }
  async function action(action: string, targetId?: string, reason?: string) {
    setBusy(true); setMessage("");
    try {
      const data = await api("/api/admin", { method: "PATCH", body: JSON.stringify({ action, targetId, reason }) });
      if (action === "pause_ai" || action === "resume_ai") {
        setAiPaused(Boolean(data.aiPaused));
        setMessage(data.aiPaused ? "IA pausada. Novas gerações estão bloqueadas." : "IA retomada. Novas gerações estão liberadas.");
      } else if (action === "backup") {
        setMessage(data.backupCreated ? "Backup criado com sucesso." : "Backup concluído.");
      } else {
        if ((action === "unblock_user" || action === "block_user") && data.user?.id) {
          setUsers(prev => prev.map(u => String(u.id) === String(data.user.id)
            ? { ...u, blockedAt: data.user.blockedAt ?? null, blockedReason: data.user.blockedReason ?? "" }
            : u
          ));
        }
        setMessage(action === "unblock_user" ? "Usuário desbloqueado com sucesso." : action === "block_user" ? "Usuário bloqueado com sucesso." : "Ação concluída.");
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erro."); }
    finally { setBusy(false); }
  }

  async function saveCapacity() {
    setBusy(true); setMessage("");
    try {
      const value = Number(capacityInput);
      const data = await api("/api/admin/capacity", { method:"PATCH", body:JSON.stringify({ capacity:value }) });
      setCapacitySettings(data.settings);
      setCapacityInput(String(data.settings.capacity));
      setMessage(`Capacidade beta alterada para ${data.settings.capacity} usuários simultâneos.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erro."); }
    finally { setBusy(false); }
  }

  const tabs = [
    ["overview", "Visão geral", Activity], ["capacity", "Capacidade", Gauge], ["analytics", "Analytics", BarChart3], ["finance", "Financeiro", WalletCards], ["users", "Usuários", Users], ["bots", "Personagens", Bot], ["reports", "Denúncias", Flag], ["audit", "Histórico", ScrollText],
  ] as const;
  const pendingReports = stats?.reports.byStatus.pending || 0;
  const reviewingReports = stats?.reports.byStatus.reviewing || 0;
  const filteredUsers = useMemo(() => { const q=query.trim().toLowerCase(); return q ? users.filter(u => `${u.name} ${u.username} ${u.plan}`.toLowerCase().includes(q)) : users; }, [users, query]);
  const filteredBots = useMemo(() => { const q=query.trim().toLowerCase(); return q ? bots.filter(b => `${b.name} ${b.ownerName} ${b.ownerUsername}`.toLowerCase().includes(q)) : bots; }, [bots, query]);
  const filteredReports = useMemo(() => { const q=query.trim().toLowerCase(); return q ? reports.filter(r => `${r.reason} ${r.priority} ${r.reporter_username} ${r.target_id}`.toLowerCase().includes(q)) : reports; }, [reports, query]);

  return <main className="admin-shell">
    <div className="admin-wrap">
      <header className="admin-header">
        <div><div className="admin-title"><Shield size={25}/><h1>PersonaChat Admin</h1></div><p>Controle do produto, moderação e saúde do beta.</p></div>
        <div className="admin-header-actions"><button onClick={() => void load()} disabled={busy} className="admin-btn"><RefreshCw size={16}/> Atualizar</button><button onClick={() => void action("backup")} disabled={busy} className="admin-btn"><Database size={16}/> Backup</button><button onClick={() => void action(aiPaused ? "resume_ai" : "pause_ai")} disabled={busy} className={aiPaused ? "admin-btn" : "admin-btn"}><AlertTriangle size={16}/>{aiPaused ? "Retomar IA" : "Pausar IA"}</button></div>
      </header>

      {stats && (pendingReports > 0 || reviewingReports > 0) && <button className="admin-alert" onClick={() => { setTab("reports"); setQuery(""); }}><AlertTriangle size={18}/><span><strong>{pendingReports} denúncia(s) pendente(s)</strong>{reviewingReports ? ` · ${reviewingReports} em revisão` : ""}</span><span className="admin-alert-link">Ver agora →</span></button>}

      <nav className="admin-tabs">{tabs.map(([key,label,Icon]) => <button key={key} onClick={() => { setTab(key); setQuery(""); }} className={tab===key ? "active" : ""}><Icon size={16}/>{label}{key === "reports" && pendingReports > 0 && <span className="admin-count">{pendingReports}</span>}</button>)}</nav>
      {tab !== "overview" && tab !== "analytics" && tab !== "finance" && <div className="admin-toolbar"><div className="admin-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar nesta seção..."/></div><span>{tab === "users" ? `${filteredUsers.length} usuários` : tab === "bots" ? `${filteredBots.length} personagens` : tab === "reports" ? `${filteredReports.length} denúncias` : `${audit.length} registros`}</span></div>}
      {message && <div className="admin-message" role="status">{message}</div>}

      {tab === "overview" && stats && <section className="admin-grid">
        <Card title="Usuários ativos"><strong>{stats.users.active}</strong><small>{stats.users.blocked} bloqueados não ocupam vagas · +{stats.users.new24h} em 24h</small></Card>
        <Card title="Personagens disponíveis"><strong>{stats.bots.total}</strong><small>{stats.bots.public} públicos · {stats.bots.private} privados</small></Card>
        <Card title="Sessões ativas"><strong>{stats.activeSessions}</strong><small>usuários não bloqueados</small></Card>
        <Card title="Denúncias pendentes"><strong>{pendingReports}</strong><small>{stats.reports.recent24h} novas nas últimas 24h</small></Card>
        <Card title="Tokens usados hoje"><strong>{stats.ai.totalTokensToday.toLocaleString("pt-BR")}</strong><small>de {stats.ai.limits.globalDailyTokens.toLocaleString("pt-BR")} globais</small></Card>
        <Card title="Tokens usados no total"><strong>{stats.ai.totalTokensAllTime.toLocaleString("pt-BR")}</strong><small>desde o início do registro</small></Card>
        <Card title="Limite diário por usuário"><strong>{stats.ai.limits.freeDailyTokens.toLocaleString("pt-BR")}</strong><small>free · premium: {stats.ai.limits.premiumDailyTokens.toLocaleString("pt-BR")}</small></Card>
        <Card title="Custo de IA hoje"><strong>US$ {stats.ai.totalCostTodayUsd.toFixed(4)}</strong><small>teto global: {stats.ai.limits.globalDailyUsd > 0 ? `US$ ${stats.ai.limits.globalDailyUsd.toFixed(2)}` : "não configurado"}</small></Card>
        <Card title="Custo de IA — 7d"><strong>US$ {stats.ai.last7d.estimatedCostUsd.toFixed(4)}</strong><small>{stats.ai.last7d.requests} gerações · {stats.ai.last7d.tokens.toLocaleString("pt-BR")} tokens</small></Card>
        <Card title="Custo de IA — total"><strong>US$ {stats.ai.totalCostAllTimeUsd.toFixed(4)}</strong><small>registrado no banco</small></Card>
        <Card title="Custo possível por usuário/dia"><strong>US$ {stats.ai.pricing.freeDailyCostRangeUsd.min.toFixed(2)}–{stats.ai.pricing.freeDailyCostRangeUsd.max.toFixed(2)}</strong><small>faixa teórica usando 100% do limite free</small></Card>
        <Card title="Preço configurado"><strong>US$ {stats.ai.pricing.inputUsdPerMillion.toFixed(2)} / {stats.ai.pricing.outputUsdPerMillion.toFixed(2)}</strong><small>entrada / saída por milhão de tokens</small></Card>
        <Card title="Qualidade"><strong>{stats.ai.qualityEvents24h}</strong><small>eventos nas últimas 24h</small></Card>
        <Card title="Beta"><strong>{Math.max(0, 5 - stats.users.active)}</strong><small>vagas livres · bloqueados não contam</small></Card>
        <Card title="Saúde do beta"><strong className={`health-${stats.health.status}`}>{stats.health.status === "healthy" ? "Saudável" : "Atenção"}</strong><small>{stats.health.activeCapacityLeases} ativos · {stats.health.waitingCapacityLeases} na fila · {stats.health.providerErrors24h.reduce((n,x)=>n+x.count,0)} erros de provider/24h</small></Card>
      </section>}
      {tab === "overview" && stats && <div className="admin-cost-note">Os custos são estimativas baseadas nos preços configurados e no uso registrado. A faixa por usuário mostra o custo teórico se ele consumir todo o limite diário; o custo real depende da proporção entre tokens de entrada e saída.</div>}

      {tab === "capacity" && <section className="admin-capacity-panel">
        <div className="admin-capacity-copy">
          <div className="admin-capacity-kicker">BETA · ACESSO SIMULTÂNEO</div>
          <h2>Controlar vagas do beta</h2>
          <p>Usuários Free entram na fila quando o limite é atingido. O valor é persistido no Postgres, então todas as instâncias da Vercel compartilham a mesma capacidade.</p>
          <div className="admin-capacity-current"><strong>{capacitySettings?.capacity ?? "—"}</strong><span>usuários simultâneos</span></div>
          {capacitySettings?.source === "postgres" && capacitySettings.updatedAt && <small>Última alteração: {new Date(capacitySettings.updatedAt).toLocaleString("pt-BR")}</small>}
        </div>
        <div className="admin-capacity-form">
          <label htmlFor="beta-capacity">Novo limite</label>
          <input id="beta-capacity" type="number" min={1} max={10000} value={capacityInput} onChange={e=>setCapacityInput(e.target.value)} disabled={busy}/>
          <button className="admin-btn" onClick={()=>void saveCapacity()} disabled={busy}>Aplicar limite</button>
          <span>Recomendação inicial: 5. Aumente gradualmente após observar tokens, latência e custo.</span>
        </div>
      </section>}
      {tab === "analytics" && analytics && <AnalyticsPanel data={analytics} />}

      {tab === "finance" && analytics && <FinancePanel data={analytics} users={financeUsers} setUsers={setFinanceUsers} premiumShare={financePremiumShare} setPremiumShare={setFinancePremiumShare} price={financePrice} setPrice={setFinancePrice} />}

      {tab === "users" && <section className="admin-list">{filteredUsers.map(u => <div key={u.id} className="admin-row"><div className="admin-user-main"><strong>{u.name}</strong><div className="admin-muted">@{u.username} · {u.plan} · {new Date(Number(u.createdAt ?? 0)).toLocaleDateString("pt-BR")}</div><div className="admin-usage-line"><span><b>{Number(u.dailyTokensUsed).toLocaleString("pt-BR")}</b> / {Number(u.dailyTokensLimit).toLocaleString("pt-BR")} tokens hoje</span><span>US$ {Number(u.dailyCostUsd).toFixed(4)} hoje</span></div></div><button onClick={() => void action(u.blockedAt ? "unblock_user" : "block_user", u.id, u.blockedAt ? undefined : "Ação administrativa no teste fechado")} className="admin-btn">{u.blockedAt ? <><Eye size={15}/> Desbloquear</> : <><Ban size={15}/> Bloquear</>}</button></div>)}{!filteredUsers.length&&<Empty text="Nenhum usuário encontrado."/>}</section>}

      {tab === "bots" && <section className="admin-list">{filteredBots.map(b => <div key={b.id} className="admin-row"><div><strong>{b.name}</strong><div className="admin-muted">por @{b.ownerUsername} · {b.visibility} · {new Date(Number(b.createdAt ?? 0)).toLocaleDateString("pt-BR")}</div></div><button onClick={() => void action(b.visibility === "public" ? "unpublish_bot" : "publish_bot", b.id)} className="admin-btn">{b.visibility === "public" ? <><EyeOff size={15}/> Despublicar</> : <><Eye size={15}/> Publicar</>}</button></div>)}{!filteredBots.length&&<Empty text="Nenhum personagem encontrado."/>}</section>}

      {tab === "reports" && <section className="admin-list">{filteredReports.map(r => <div key={r.id} className="admin-row report-row"><div className="report-main"><strong>{r.reason} · {r.priority}</strong><div className="admin-muted">{r.target_type}:{r.target_id} · por @{r.reporter_username} · {new Date(Number(r.created_at ?? 0)).toLocaleString("pt-BR")}</div>{r.details && <p>{r.details}</p>}</div><div className="report-actions"><span className="admin-badge">{r.status}</span>{r.status === "pending" && <button onClick={() => void reportAction(r.id, "reviewing")} className="admin-btn">Revisar</button>}{(r.status === "pending" || r.status === "reviewing") && <><button onClick={() => void reportAction(r.id, "resolved")} className="admin-btn">Resolver</button><button onClick={() => void reportAction(r.id, "dismissed")} className="admin-btn">Dispensar</button></>}</div></div>)}{!filteredReports.length&&<Empty text="Nenhuma denúncia encontrada."/>}</section>}

      {tab === "audit" && <section className="admin-list">{audit.map(a => <div key={a.id} className="admin-row"><div><strong>{a.action}</strong><div className="admin-muted">{a.targetType || "sistema"}{a.targetId ? `:${a.targetId}` : ""} · por @{a.adminUsername} · {new Date(Number(a.createdAt ?? 0)).toLocaleString("pt-BR")}</div></div></div>)}{!audit.length&&<Empty text="Nenhuma ação administrativa registrada."/>}</section>}
    </div>
  </main>;
}

function AnalyticsPanel({data}:{data:AdminAnalytics}) {
  const maxCost=Math.max(0,...data.daily.map(d=>d.cost));
  const maxTokens=Math.max(1,...data.daily.map(d=>d.tokens));
  const maxReq=Math.max(1,...data.daily.map(d=>d.requests));
  return <section className="admin-analytics">
    <div className="admin-kpi-grid">
      <Card title="Usuários ativos (24h)"><strong>{data.activeUsers24h}</strong><small>{data.activeUsers30d} ativos nos últimos 30 dias</small></Card>
      <Card title="Tokens / geração"><strong>{Math.round(data.avgTokensPerRequest).toLocaleString('pt-BR')}</strong><small>média dos últimos 30 dias</small></Card>
      <Card title="Custo / usuário ativo"><strong>US$ {data.avgCostPerActiveUser.toFixed(3)}</strong><small>custo variável observado · 30d</small></Card>
      <Card title="P95 geração"><strong>{(data.p95LatencyMs/1000).toFixed(1)}s</strong><small>tempo registrado · 30d</small></Card>
      <Card title="Cache OSINT"><strong>{(data.osintHitRate*100).toFixed(0)}%</strong><small>eficiência observada</small></Card>
      <Card title="Custo Premium observado"><strong>US$ {data.avgPremiumCostPerUser.toFixed(2)}</strong><small>média variável por usuário Premium</small></Card>
    </div>
    <div className="admin-chart-grid">
      <ChartCard title="Tokens por dia"><div className="admin-bar-chart">{data.daily.map(d=><div key={d.day} className="admin-bar-col" title={`${d.day}: ${d.tokens.toLocaleString('pt-BR')} tokens`}><div className="admin-bar" style={{height:`${Math.max(4,(d.tokens/maxTokens)*100)}%`}}/><span>{d.day.slice(5)}</span></div>)}</div></ChartCard>
      <ChartCard title="Custo de IA por dia"><div className="admin-bar-chart">{data.daily.map(d=><div key={d.day} className="admin-bar-col" title={`${d.day}: US$ ${d.cost.toFixed(4)}`}><div className="admin-bar admin-bar-cost" style={{height:`${Math.max(4,(d.cost/Math.max(maxCost,0.0001))*100)}%`}}/><span>{d.day.slice(5)}</span></div>)}</div></ChartCard>
      <ChartCard title="Gerações por dia"><div className="admin-bar-chart">{data.daily.map(d=><div key={d.day} className="admin-bar-col" title={`${d.day}: ${d.requests} gerações`}><div className="admin-bar admin-bar-requests" style={{height:`${Math.max(4,(d.requests/maxReq)*100)}%`}}/><span>{d.day.slice(5)}</span></div>)}</div></ChartCard>
    </div>
    <div className="admin-two-col">
      <Panel title="Por plano">{data.plans.map(p=><div className="admin-metric-row" key={p.plan}><div><strong>{p.plan}</strong><small>{p.users} usuários · {p.requests} gerações</small></div><span>{p.tokens.toLocaleString('pt-BR')} tokens · US$ {p.cost.toFixed(2)}</span></div>)}</Panel>
      <Panel title="Por modelo / provider">{data.models.map(m=><div className="admin-metric-row" key={`${m.provider}-${m.model}`}><div><strong>{m.model}</strong><small>{m.provider} · {m.requests} gerações · {Math.round(m.avgLatencyMs)}ms médios</small></div><span>US$ {m.cost.toFixed(2)}</span></div>)}</Panel>
    </div>
    <Panel title="Usuários para acompanhar de perto">{data.topUsers.length ? data.topUsers.map(u=><div className="admin-metric-row" key={u.id}><div><strong>@{u.username || u.name}</strong><small>{u.plan} · {u.requests} gerações · {u.regenerations} regenerações · {u.osintRefreshes} pesquisas</small></div><span>{u.tokens.toLocaleString('pt-BR')} tokens · <b>US$ {u.cost.toFixed(2)}</b></span></div>) : <Empty text="Ainda não há eventos suficientes."/>}</Panel>
    <Panel title="Recomendações operacionais"><div className="admin-recommendations">{data.recommendations.length ? data.recommendations.map((r,i)=><div className={`admin-recommendation ${r.severity}`} key={`${r.title}-${i}`}><span className="admin-reco-icon">{r.severity==='warn'?<AlertTriangle size={16}/>:r.severity==='good'?<TrendingUp size={16}/>:<Zap size={16}/>}</span><div><strong>{r.title}</strong><p>{r.body}</p></div></div>) : <Empty text="Sem recomendações com os dados atuais."/>}</div></Panel>
  </section>;
}

function FinancePanel({data,users,setUsers,premiumShare,setPremiumShare,price,setPrice}:{data:AdminAnalytics;users:number;setUsers:(n:number)=>void;premiumShare:number;setPremiumShare:(n:number)=>void;price:number;setPrice:(n:number)=>void}) {
  const premiumUsers=Math.round(users*premiumShare/100);
  const monthlyVariable=premiumUsers*data.avgPremiumCostPerUser;
  const revenue=premiumUsers*price;
  const gross=revenue-monthlyVariable-data.finance.supabaseBase;
  const margin=revenue>0?gross/revenue:0;
  const breakEven=Math.max(0.99,data.finance.observedPremiumPriceFloor || (data.avgPremiumCostPerUser/(1-data.finance.targetMargin || 0.7)));
  return <section className="admin-finance">
    <div className="admin-finance-banner"><div><span className="admin-eyebrow">FINANCE</span><h2>Economia do PersonaChat</h2><p>Use os dados observados para planejar preço, margem e capacidade. Custos abaixo são variáveis + infraestrutura fixa informada.</p></div><Globe2 size={30}/></div>
    <div className="admin-finance-grid">
      <Card title="Gemini 3.5 Flash"><strong>US$ {data.finance.geminiFlash.inputPerMillion.toFixed(2)} / {data.finance.geminiFlash.outputPerMillion.toFixed(2)}</strong><small>entrada / saída por 1M tokens</small></Card>
      <Card title="Gemini 3.5 Flash-Lite"><strong>US$ {data.finance.geminiFlashLite.inputPerMillion.toFixed(2)} / {data.finance.geminiFlashLite.outputPerMillion.toFixed(2)}</strong><small>alternativa de menor custo</small></Card>
      <Card title="Tavily"><strong>US$ {data.finance.tavilyCreditPrice.toFixed(3)}</strong><small>por crédito</small></Card>
      <Card title="Supabase Pro"><strong>US$ {data.finance.supabaseBase.toFixed(0)}</strong><small>base mensal considerada</small></Card>
      <Card title="Upstash"><strong>US$ {data.finance.upstashPer100k.toFixed(2)}</strong><small>por 100 mil comandos</small></Card>
      <Card title="Piso observado Premium"><strong>US$ {breakEven.toFixed(2)}</strong><small>para a margem alvo configurada</small></Card>
    </div>
    <div className="admin-finance-planner">
      <Panel title="Simulador mensal"><div className="admin-planner-grid">
        <label>Usuários totais<input type="number" min={1} value={users} onChange={e=>setUsers(Math.max(1,Number(e.target.value)||1))}/></label>
        <label>% Premium<input type="number" min={0} max={100} value={premiumShare} onChange={e=>setPremiumShare(Math.min(100,Math.max(0,Number(e.target.value)||0)))}/></label>
        <label>Preço Premium<input type="number" min={0.99} step={0.5} value={price} onChange={e=>setPrice(Math.max(0.99,Number(e.target.value)||0.99))}/></label>
      </div><div className="admin-finance-result"><div><small>Premiums</small><strong>{premiumUsers}</strong></div><div><small>Receita/mês</small><strong>US$ {revenue.toFixed(2)}</strong></div><div><small>Custo variável</small><strong>US$ {monthlyVariable.toFixed(2)}</strong></div><div><small>Resultado bruto*</small><strong className={gross>=0?'positive':'negative'}>US$ {gross.toFixed(2)}</strong></div><div><small>Margem bruta*</small><strong className={margin>=0.7?'positive':margin>=0.5?'':'negative'}>{(margin*100).toFixed(1)}%</strong></div></div><p className="admin-footnote">* Inclui apenas custo variável Premium observado + base Supabase configurada. Não inclui salários, impostos, Stripe, suporte ou outros serviços.</p></Panel>
    </div>
    <Panel title="Recomendações financeiras"><div className="admin-recommendations"><div className="admin-recommendation info"><span className="admin-reco-icon"><WalletCards size={16}/></span><div><strong>Use custo observado, não limite máximo</strong><p>O limite de tokens do plano representa capacidade, não consumo típico. Para orçamento, acompanhe custo por usuário ativo e por usuário Premium.</p></div></div><div className="admin-recommendation info"><span className="admin-reco-icon"><Zap size={16}/></span><div><strong>Teste Flash-Lite no tráfego simples</strong><p>O preço de referência atual é muito menor que o Flash, então vale medir qualidade e latência em tarefas simples antes de trocar o modelo padrão.</p></div></div><div className="admin-recommendation good"><span className="admin-reco-icon"><TrendingUp size={16}/></span><div><strong>Defina um teto de custo por usuário</strong><p>Use o painel para observar os usuários de maior consumo e ajustar limites antes de o crescimento transformar poucos usuários muito ativos em custo desproporcional.</p></div></div></div></Panel>
    <p className="admin-source-note">Referências de preço usadas como padrão do painel: Google Gemini API, Tavily, Supabase e Upstash. Os valores configurados no ambiente têm prioridade sobre esses padrões.</p>
  </section>;
}

function ChartCard({title,children}:{title:string;children:ReactNode}) { return <Panel title={title}><div className="admin-chart-wrap">{children}</div></Panel>; }
function Panel({title,children}:{title:string;children:ReactNode}) { return <div className="admin-panel"><div className="admin-panel-title">{title}</div>{children}</div>; }

function Card({title,children}:{title:string;children:ReactNode}) { return <div className="admin-card"><div className="admin-card-title">{title}</div>{children}</div>; }
function Empty({text}:{text:string}) { return <div className="admin-empty">{text}</div>; }
