import React, { useState, useEffect, useMemo } from 'react';
import {
    Users, BarChart2, Settings as SettingsIcon, LogOut, ShieldAlert,
    TrendingUp, Clock, Star, ClipboardList, Target, Trophy,
    Rocket, Activity, CheckSquare, Phone, MessageCircle,
    Award, AlertTriangle, Database, CheckCircle, Loader2, ShieldCheck, CalendarDays, Calendar, Network,
    ChevronDown, ChevronRight, Menu, X, FileText
} from 'lucide-react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { logout } from '../services/auth';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

import CollaboratorsHub from './CollaboratorsHub';
import WeeklyMetrics from './WeeklyMetrics';
import SectorKPIs from './SectorKPIs';
import DataManager from './DataManager';
import Settings from './Settings';
import Reports from './Reports';
import Audits from './Audits';
import Rankings from './Rankings';
import DailyQueueTracker from './DailyDemandLaunch'
import SundaySchedule from './SundaySchedule';
import DailySchedule from './DailySchedule';
import OrgChart from './OrgChart';
import MonthlyEvaluations from './MonthlyEvaluations';

// Importação da logo estendida
import logoExtended from '../assets/logo_extended.png';
const logo = logoExtended;

const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState({
        geral: true,
        operacional: true,
        escalas: true,
        gestao: true
    });

    const toggleMenu = (menuId) => {
        if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false);
            setExpandedMenus(prev => ({ ...prev, [menuId]: true }));
        } else {
            setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
        }
    };

    const navMenus = [
        {
            id: 'geral',
            title: 'Principal',
            icon: BarChart2,
            items: [
                { id: 'dashboard', label: 'Visão Geral KPIs', icon: BarChart2 },
                { id: 'hub', label: 'Hub da Equipe', icon: Users },
                { id: 'orgchart', label: 'Organograma', icon: Network },
            ]
        },
        {
            id: 'operacional',
            title: 'Lançamentos/Análise',
            icon: TrendingUp,
            items: [
                { id: 'metrics', label: 'Avaliações Semanais', icon: TrendingUp },
                { id: 'monthly_evaluations', label: 'Análise Mensal (1:1)', icon: FileText },
                { id: 'DailyQueueTracker', label: 'Demanda Diária', icon: Activity },
                { id: 'reports', label: 'Relatórios Críticos', icon: ClipboardList },
                { id: 'audits', label: 'Auditorias QA', icon: ShieldCheck },
                { id: 'rankings', label: 'Rankings da Equipe', icon: Trophy },
            ]
        },
        {
            id: 'escalas',
            title: 'Escalas',
            icon: Calendar,
            items: [
                { id: 'daily_schedule', label: 'Escala Diária', icon: CalendarDays },
                { id: 'schedule', label: 'Escala de Plantão', icon: Calendar },
            ]
        },
        {
            id: 'gestao',
            title: 'Gestão & Sistema',
            icon: SettingsIcon,
            items: [
                { id: 'sector_kpis', label: 'KPIs do Setor', icon: Target },
                { id: 'data_manager', label: 'Gestão de Dados', icon: Database },
                { id: 'settings', label: 'Configurações', icon: SettingsIcon },
            ]
        }
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return <DashboardOverview />;
            case 'hub':
                return <CollaboratorsHub />;
            case 'rankings':             // ADICIONE ESTAS DUAS LINHAS
                return <Rankings />;
            case 'orgchart':
                return <OrgChart />;
            case 'metrics':
                return <WeeklyMetrics />;
            case 'monthly_evaluations':
                return <MonthlyEvaluations />;
            case 'schedule':
                return <SundaySchedule />;
            case 'daily_schedule':
                return <DailySchedule />;
            case 'sector_kpis':
                return <SectorKPIs />;
            case 'data_manager':
                return <DataManager />;
            case 'reports':
                return <Reports />;
            case 'audits':
                return <Audits />;
            case 'settings':
                return <Settings />;
            case 'DailyQueueTracker':
                return <DailyQueueTracker />;
            default:
                return <DashboardOverview />;
        }
    };

    return (
        <div className="h-screen bg-gray-50 flex overflow-hidden">
            <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-zinc-950 text-white flex flex-col hidden md:flex shrink-0 border-r border-zinc-800 transition-all duration-300 relative z-20`}>
                <div className="p-4 flex items-center justify-between border-b border-zinc-800 shrink-0 h-20">
                    {!isSidebarCollapsed && (
                        <div className="flex items-center gap-3 overflow-hidden">
                            <img src={logo} alt="HubDesk Logo" className="h-10 w-auto shrink-0" />
                            <span className="text-lg font-bold tracking-wider truncate">HUB<span className="text-red-500">DESK</span></span>
                        </div>
                    )}
                    <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className={`p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0 ${isSidebarCollapsed ? 'mx-auto' : ''}`}>
                        <Menu className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 p-3 space-y-4 overflow-y-auto scrollbar-hide">
                    {navMenus.map(menu => (
                        <div key={menu.id} className="space-y-1">
                            {/* Header do Menu */}
                            {!isSidebarCollapsed ? (
                                <button 
                                    onClick={() => toggleMenu(menu.id)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors"
                                >
                                    <span>{menu.title}</span>
                                    {expandedMenus[menu.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                            ) : (
                                <div className="flex justify-center py-2 mb-1 border-b border-zinc-800/50">
                                    <menu.icon className="w-4 h-4 text-zinc-600" title={menu.title} />
                                </div>
                            )}

                            {/* Itens do Menu */}
                            {(expandedMenus[menu.id] || isSidebarCollapsed) && (
                                <div className="space-y-1">
                                    {menu.items.map(item => {
                                        const Icon = item.icon;
                                        const isActive = activeTab === item.id;
                                        return (
                                            <button 
                                                key={item.id}
                                                onClick={() => setActiveTab(item.id)} 
                                                title={isSidebarCollapsed ? item.label : ""}
                                                className={`w-full flex items-center rounded-lg transition-colors ${
                                                    isSidebarCollapsed ? 'justify-center p-3' : 'px-4 py-2.5 gap-3'
                                                } ${
                                                    isActive 
                                                    ? 'bg-red-600/10 text-red-500 border-l-4 border-red-600' 
                                                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border-l-4 border-transparent'
                                                }`}
                                            >
                                                <Icon className={`${isSidebarCollapsed ? 'w-6 h-6' : 'w-5 h-5'} shrink-0`} />
                                                {!isSidebarCollapsed && <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </nav>

                <div className="p-4 border-t border-zinc-800 shrink-0 bg-zinc-950/50">
                    <button onClick={logout} className={`w-full flex items-center py-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ${isSidebarCollapsed ? 'justify-center px-0' : 'px-4 gap-3'}`} title={isSidebarCollapsed ? "Sair do sistema" : ""}>
                        <LogOut className="w-5 h-5 shrink-0" />
                        {!isSidebarCollapsed && <span className="text-sm font-medium">Sair do sistema</span>}
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden bg-gray-50 relative">
                {renderContent()}
            </main>
        </div>
    );
};

const timeToDecimal = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10) + (parseInt(parts[2], 10) / 60);
};

const formatTime = (decimalMinutes) => {
    if (!decimalMinutes && decimalMinutes !== 0) return "00:00:00";
    const totalSeconds = Math.round(decimalMinutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const TrendIndicator = ({ type, val, goal }) => {
    if (val === undefined || goal === undefined || !val || !goal) return null;

    let isGood = true;
    let isUp = true;

    if (type === 'tmr' || type === 'recurrence') {
        const v = type === 'tmr' ? timeToDecimal(val) : Number(val);
        const g = type === 'tmr' ? timeToDecimal(goal) : Number(goal);
        isGood = v <= g;
        isUp = v > g;
    } else if (type === 'fcr') {
        const v = Number(val);
        const g = Number(goal);
        isGood = v >= g;
        isUp = v >= g;
    }

    const colorClass = isGood ? "fill-emerald-500" : "fill-red-500";
    const pathObj = isUp ? "M12 4l8 16H4z" : "M12 20l8-16H4z";

    return (
        <svg className={`w-4 h-4 mb-1 ${colorClass}`} viewBox="0 0 24 24">
            <path d={pathObj} />
        </svg>
    );
};

const DashboardOverview = () => {
    const [latestKpi, setLatestKpi] = useState({ tmr: '00:00:00', fcr: 0, recurrence: 0 });
    const [goals, setGoals] = useState({ tmr: '00:20:00', fcr: 80, recurrence: 20 });

    const [evalsList, setEvalsList] = useState([]);
    const [colabsFull, setColabsFull] = useState({});
    const [auditsList, setAuditsList] = useState([]);

    const [reportStats, setReportStats] = useState({ pending: 0, inProgress: 0, resolved: 0 });

    useEffect(() => {
        const unsubGoals = onSnapshot(doc(db, "system_settings", "sector_goals"), (docSnap) => {
            if (docSnap.exists()) setGoals(docSnap.data());
        });

        const unsubKpi = onSnapshot(collection(db, "sector_kpis"), (snap) => {
            const kpis = [];
            snap.forEach(d => kpis.push(d.data()));
            kpis.sort((a, b) => {
                const da = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const dbDate = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return dbDate - da;
            });
            if (kpis.length > 0) setLatestKpi(kpis[0]);
        });

        const unsubColabs = onSnapshot(collection(db, "collaborators"), (snap) => {
            const map = {};
            snap.forEach(d => map[d.id] = { id: d.id, ...d.data() });
            setColabsFull(map);
        });

        const unsubEvals = onSnapshot(collection(db, "weekly_evaluations"), (snap) => {
            const evals = [];
            snap.forEach(d => evals.push({ id: d.id, ...d.data() }));
            setEvalsList(evals);
        });

        const unsubReports = onSnapshot(collection(db, "critical_reports"), (snap) => {
            let pending = 0; let inProgress = 0; let resolved = 0;
            snap.forEach(doc => {
                const data = doc.data();
                if (data.status === 'Pendente') pending++;
                else if (data.status === 'Em Andamento') inProgress++;
                else if (data.status === 'Resolvido') resolved++;
            });
            setReportStats({ pending, inProgress, resolved });
        });

        const unsubAudits = onSnapshot(collection(db, "qa_audits"), (snap) => {
            const fetched = [];
            snap.forEach(doc => fetched.push(doc.data()));
            setAuditsList(fetched);
        });

        return () => { unsubGoals(); unsubKpi(); unsubColabs(); unsubEvals(); unsubReports(); unsubAudits(); };
    }, []);

    // --- LÓGICA DE QA IGNORANDO INATIVOS ---
    const qaStats = useMemo(() => {
        let total = 0;
        let conformes = 0;

        auditsList.forEach(audit => {
            const colabInfo = colabsFull[audit.colabId];
            if (colabInfo && colabInfo.active !== false) {
                total++;
                if (audit.status === 'Conforme') conformes++;
            }
        });

        const taxaResult = total > 0 ? ((conformes / total) * 100).toFixed(1) : 0;
        return { taxa: taxaResult, total };
    }, [auditsList, colabsFull]);

    // --- LÓGICA DA EQUIPE IGNORANDO INATIVOS ---
    const teamStats = useMemo(() => {
        const defaultStats = {
            avgVol: 0, avgTmaTel: '00:00:00', avgTmaHuggy: '00:00:00',
            maxTmaTel: { val: '00:00:00', name: '--' }, maxTmaHuggy: { val: '00:00:00', name: '--' },
            topDay: { name: '--', val: 0 }, topNight: { name: '--', val: 0 },
            avgPtsDay: 0, avgPtsNight: 0
        };

        if (evalsList.length === 0) return defaultStats;

        const accumulatedPoints = {};

        evalsList.forEach(e => {
            const colabId = e.colabId || e.collaboratorId;
            const colabInfo = colabsFull[colabId];

            if (colabInfo && colabInfo.active !== false) {
                let pts = e.pontuacao;
                if (pts === undefined) {
                    pts = (Number(e.Atendimentos_Finalizados || 0) * 1) +
                        (Number(e.Ligacoes_Atendidas || 0) * 2) +
                        (Number(e.Atendimentos_Huggy || 0) * 1) +
                        (Number(e.Ligacoes_Perdidas || 0) * -5);
                }
                accumulatedPoints[colabId] = (accumulatedPoints[colabId] || 0) + pts;
            }
        });

        let topDay = { val: -Infinity, id: '' };
        let topNight = { val: -Infinity, id: '' };

        Object.entries(accumulatedPoints).forEach(([colabId, score]) => {
            const colabInfo = colabsFull[colabId];
            if (colabInfo && colabInfo.active !== false) {
                if ((colabInfo.shift === 'Manhã' || colabInfo.shift === 'Tarde') && score > topDay.val) {
                    topDay = { val: score, id: colabId };
                } else if (colabInfo.shift === 'Noite' && score > topNight.val) {
                    topNight = { val: score, id: colabId };
                }
            }
        });

        const latestDate = evalsList.reduce((max, e) => (e.date > max ? e.date : max), '');
        const currentWeek = evalsList.filter(e => e.date === latestDate);

        let sumVol = 0, sumTmaTel = 0, sumTmaHuggy = 0;
        let sumPtsDay = 0, countDay = 0;
        let sumPtsNight = 0, countNight = 0;
        let maxTel = { val: -1, id: '' };
        let maxHuggy = { val: -1, id: '' };
        let activeCurrentWeekCount = 0;

        if (currentWeek.length > 0) {
            currentWeek.forEach(e => {
                const colabId = e.colabId || e.collaboratorId;
                const colabInfo = colabsFull[colabId];

                if (colabInfo && colabInfo.active !== false) {
                    activeCurrentWeekCount++;
                    sumVol += Number(e.Atendimentos_Finalizados) || 0;
                    const telDec = timeToDecimal(e.TMA_Telefonia);
                    const huggyDec = timeToDecimal(e.TMA_Huggy);

                    sumTmaTel += telDec;
                    sumTmaHuggy += huggyDec;

                    if (telDec > maxTel.val) maxTel = { val: telDec, id: colabId };
                    if (huggyDec > maxHuggy.val) maxHuggy = { val: huggyDec, id: colabId };

                    let currentPts = e.pontuacao;
                    if (currentPts === undefined) {
                        currentPts = (Number(e.Atendimentos_Finalizados || 0) * 1) +
                            (Number(e.Ligacoes_Atendidas || 0) * 2) +
                            (Number(e.Atendimentos_Huggy || 0) * 1) +
                            (Number(e.Ligacoes_Perdidas || 0) * -5);
                    }

                    if (colabInfo.shift === 'Manhã' || colabInfo.shift === 'Tarde') {
                        sumPtsDay += currentPts;
                        countDay++;
                    } else if (colabInfo.shift === 'Noite') {
                        sumPtsNight += currentPts;
                        countNight++;
                    }
                }
            });
        }

        const count = activeCurrentWeekCount || 1;

        return {
            avgVol: activeCurrentWeekCount > 0 ? Math.round(sumVol / count) : 0,
            avgTmaTel: formatTime(sumTmaTel / count),
            avgTmaHuggy: formatTime(sumTmaHuggy / count),
            maxTmaTel: { val: formatTime(maxTel.val), name: colabsFull[maxTel.id]?.name || '--' },
            maxTmaHuggy: { val: formatTime(maxHuggy.val), name: colabsFull[maxHuggy.id]?.name || '--' },
            topDay: { val: topDay.val !== -Infinity ? topDay.val : 0, name: colabsFull[topDay.id]?.name || '--' },
            topNight: { val: topNight.val !== -Infinity ? topNight.val : 0, name: colabsFull[topNight.id]?.name || '--' },
            avgPtsDay: countDay > 0 ? Math.round(sumPtsDay / countDay) : 0,
            avgPtsNight: countNight > 0 ? Math.round(sumPtsNight / countNight) : 0
        };
    }, [evalsList, colabsFull]);

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto">
            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Visão Geral da Gestão</h1>
                    <p className="text-sm text-gray-500">Monitoramento consolidado de toda a operação.</p>
                </div>

                <div className="flex flex-wrap gap-4 w-full xl:w-auto">
                    <div className="flex-1 sm:flex-none flex items-center gap-3 bg-amber-50 px-4 py-2.5 rounded-lg border border-amber-100 shadow-sm min-w-[140px]">
                        <div className="p-1.5 bg-amber-500 rounded-md shrink-0">
                            <Clock className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-tight line-clamp-1">Pendentes</span>
                            <span className="text-xl font-black text-amber-900 leading-tight">{reportStats.pending}</span>
                        </div>
                    </div>

                    <div className="flex-1 sm:flex-none flex items-center gap-3 bg-blue-50 px-4 py-2.5 rounded-lg border border-blue-100 shadow-sm min-w-[140px]">
                        <div className="p-1.5 bg-blue-500 rounded-md shrink-0">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight line-clamp-1">Em Andamento</span>
                            <span className="text-xl font-black text-blue-900 leading-tight">{reportStats.inProgress}</span>
                        </div>
                    </div>

                    <div className="flex-1 sm:flex-none flex items-center gap-3 bg-emerald-50 px-4 py-2.5 rounded-lg border border-emerald-100 shadow-sm min-w-[140px]">
                        <div className="p-1.5 bg-emerald-500 rounded-md shrink-0">
                            <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight line-clamp-1">Resolvidos</span>
                            <span className="text-xl font-black text-emerald-900 leading-tight">{reportStats.resolved}</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="mb-8">
                <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Rocket className="w-4 h-4 text-red-500" /> KPIs Globais do Setor
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <Clock className="w-4 h-4 text-purple-500" /> TMR (Setor)
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-extrabold text-gray-900 tracking-tight">{latestKpi.tmr}</span>
                            <TrendIndicator type="tmr" val={latestKpi.tmr} goal={goals.tmr} />
                        </div>
                        <div className="text-xs text-gray-400 mt-3 font-medium">Meta: ≤ {goals.tmr}</div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <Target className="w-4 h-4 text-rose-500" /> FCR (Setor)
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-extrabold text-gray-900 tracking-tight">{latestKpi.fcr}%</span>
                            <TrendIndicator type="fcr" val={latestKpi.fcr} goal={goals.fcr} />
                        </div>
                        <div className="text-xs text-gray-400 mt-3 font-medium">Meta: ≥ {goals.fcr}%</div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <Activity className="w-4 h-4 text-blue-500" /> Reincidência
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-extrabold text-gray-900 tracking-tight">{latestKpi.recurrence}%</span>
                            <TrendIndicator type="recurrence" val={latestKpi.recurrence} goal={goals.recurrence} />
                        </div>
                        <div className="text-xs text-gray-400 mt-3 font-medium">Meta: ≤ {goals.recurrence}%</div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute top-5 left-5 flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            <Star className="w-4 h-4 text-amber-400" /> % QA (Equipe Ativa)
                        </div>

                        <div className="mt-8 w-full" style={{ minHeight: '96px', height: '100px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={[
                                            { value: Number(qaStats.taxa) },
                                            { value: 100 - Number(qaStats.taxa) }
                                        ]}
                                        cx="50%"
                                        cy="100%"
                                        startAngle={180}
                                        endAngle={0}
                                        innerRadius={60}
                                        outerRadius={80}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        <Cell fill={Number(qaStats.taxa) >= 80 ? "#10b981" : "#ef4444"} />
                                        <Cell fill="#f3f4f6" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="absolute bottom-8 flex flex-col items-center">
                            <span className={`text-2xl font-extrabold tracking-tight ${Number(qaStats.taxa) >= 80 ? "text-emerald-600" : "text-red-600"}`}>
                                {qaStats.taxa}%
                            </span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-2 font-medium">Baseado em {qaStats.total} auditorias</div>
                    </div>
                </div>
            </div>

            <div className="mb-8">
                <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4 text-indigo-500" /> Performance Média da Equipe
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col border-l-4 border-l-emerald-500">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <CheckSquare className="w-4 h-4 text-emerald-500" /> Vol. Médio / Agente
                        </div>
                        <span className="text-4xl font-extrabold text-gray-900 tracking-tight">{teamStats.avgVol}</span>
                        <div className="text-xs text-gray-400 mt-2 font-medium">Finalizações Semanais</div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <Phone className="w-4 h-4 text-rose-500" /> TMA Médio (Voz)
                        </div>
                        <span className="text-4xl font-extrabold text-gray-900 tracking-tight">{teamStats.avgTmaTel}</span>
                        <div className="text-xs text-gray-400 mt-2 font-medium">Tempo Médio em Linha</div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <MessageCircle className="w-4 h-4 text-indigo-400" /> TMA Médio (Chat)
                        </div>
                        <span className="text-4xl font-extrabold text-gray-900 tracking-tight">{teamStats.avgTmaHuggy}</span>
                        <div className="text-xs text-gray-400 mt-2 font-medium">Tempo Médio de Chat</div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col border-l-4 border-l-blue-500 justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <Star className="w-4 h-4 text-blue-500" /> Média de Pontos (Semana)
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="border-r border-gray-200 pr-2">
                                <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Manhã/Tarde</div>
                                <div className="text-2xl font-extrabold text-gray-900 tracking-tight truncate">{teamStats.avgPtsDay}</div>
                            </div>
                            <div className="pl-2">
                                <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Noite</div>
                                <div className="text-2xl font-extrabold text-gray-900 tracking-tight truncate">{teamStats.avgPtsNight}</div>
                            </div>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-3 font-medium">Última semana lançada</div>
                    </div>
                </div>
            </div>

            <div className="mb-4">
                <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Award className="w-4 h-4 text-amber-500" /> Destaques & Pontos de Atenção
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-emerald-600 text-white p-5 rounded-xl shadow-sm flex flex-col justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-200 uppercase tracking-widest mb-3">
                            <Award className="w-4 h-4 text-amber-300" /> Top 1 Desempenho (Acumulado)
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="border-r border-emerald-500 pr-2">
                                <div className="text-[10px] text-emerald-200 font-bold uppercase mb-1">Manhã/Tarde</div>
                                <div className="text-lg font-extrabold tracking-tight truncate" title={teamStats.topDay.name}>{teamStats.topDay.name}</div>
                                <div className="text-emerald-100 text-xs font-medium"><span className="font-bold text-white">{teamStats.topDay.val}</span> pts</div>
                            </div>
                            <div className="pl-2">
                                <div className="text-[10px] text-emerald-200 font-bold uppercase mb-1">Noite</div>
                                <div className="text-lg font-extrabold tracking-tight truncate" title={teamStats.topNight.name}>{teamStats.topNight.name}</div>
                                <div className="text-emerald-100 text-xs font-medium"><span className="font-bold text-white">{teamStats.topNight.val}</span> pts</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col border-l-4 border-l-red-500">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <AlertTriangle className="w-4 h-4 text-amber-500" /> Maior TMA (Voz)
                        </div>
                        <span className="text-3xl font-extrabold text-red-600 tracking-tight mb-1">{teamStats.maxTmaTel.val}</span>
                        <div className="text-sm text-gray-500 font-medium truncate" title={teamStats.maxTmaTel.name}>{teamStats.maxTmaTel.name}</div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col border-l-4 border-l-red-500">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                            <AlertTriangle className="w-4 h-4 text-amber-500" /> Maior TMA (Chat)
                        </div>
                        <span className="text-3xl font-extrabold text-red-600 tracking-tight mb-1">{teamStats.maxTmaHuggy.val}</span>
                        <div className="text-sm text-gray-500 font-medium truncate" title={teamStats.maxTmaHuggy.name}>{teamStats.maxTmaHuggy.name}</div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default AdminDashboard;