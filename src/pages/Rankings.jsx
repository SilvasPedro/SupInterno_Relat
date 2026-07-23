import React, { useState, useEffect, useMemo } from 'react';
import { 
    Trophy, Medal, Star, CheckSquare, Phone, MessageSquare, 
    Calendar, Loader2, Filter, Award, Users
} from 'lucide-react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../services/firebase';

// --- FUNÇÕES DE CONVERSÃO DE TEMPO ---
const timeToSeconds = (timeStr) => {
    if (!timeStr || timeStr === '00:00:00') return Infinity; 
    const parts = timeStr.split(':');
    if (parts.length !== 3) return Infinity;
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
};

const secondsToTime = (totalSeconds) => {
    if (totalSeconds === Infinity || isNaN(totalSeconds) || totalSeconds === 0) return "00:00:00";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const parseDateObj = (dateStr) => {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    return 0;
};

const getMonthYear = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
    return null;
};

const Rankings = () => {
    const [activeTab, setActiveTab] = useState('pontuacao');
    
    // Filtros Novos
    const [periodFilter, setPeriodFilter] = useState('all'); // 'all', 'month_MM/YYYY', 'week_DD/MM/YYYY'
    const [shiftFilter, setShiftFilter] = useState('all'); // 'all', 'day' (Manhã/Tarde), 'night' (Noite)
    
    const [evaluations, setEvaluations] = useState([]);
    const [collaboratorsMap, setCollaboratorsMap] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Busca Colaboradores (para pegar nomes, status e turnos)
        const unsubColabs = onSnapshot(collection(db, "collaborators"), (snap) => {
            const map = {};
            snap.forEach(d => {
                const data = d.data();
                if (data.active !== false) { // Oculta inativos
                    map[d.id] = data;
                }
            });
            setCollaboratorsMap(map);
        });

        // Busca todas as avaliações
        const unsubEvals = onSnapshot(query(collection(db, "weekly_evaluations")), (snap) => {
            const fetched = [];
            snap.forEach(d => fetched.push({ id: d.id, ...d.data() }));
            setEvaluations(fetched);
            setLoading(false);
        });

        return () => { unsubColabs(); unsubEvals(); };
    }, []);

    // Extrai as opções de filtros (Semanas e Meses) com base nos lançamentos
    const filterOptions = useMemo(() => {
        const months = new Set();
        const weeks = new Set();
        
        evaluations.forEach(e => { 
            if (e.date) {
                weeks.add(e.date);
                const my = getMonthYear(e.date);
                if (my) months.add(my);
            } 
        });

        const sortedWeeks = Array.from(weeks).sort((a, b) => parseDateObj(b) - parseDateObj(a));
        const sortedMonths = Array.from(months).sort((a, b) => {
            const [m1, y1] = a.split('/');
            const [m2, y2] = b.split('/');
            return new Date(y2, m2 - 1, 1).getTime() - new Date(y1, m1 - 1, 1).getTime();
        });

        return { weeks: sortedWeeks, months: sortedMonths };
    }, [evaluations]);

    // Calcula e ordena o ranking agregando dados se necessário
    const rankingData = useMemo(() => {
        // Filtra as avaliações pelo período escolhido
        const filteredEvals = evaluations.filter(e => {
            if (periodFilter === 'all') return true;
            if (periodFilter.startsWith('month_')) {
                return getMonthYear(e.date) === periodFilter.replace('month_', '');
            }
            if (periodFilter.startsWith('week_')) {
                return e.date === periodFilter.replace('week_', '');
            }
            return true;
        });
        
        // Agrupador de resultados por colaborador
        const colabStats = {};

        filteredEvals.forEach(e => {
            const colabId = e.colabId || e.collaboratorId;
            const colabInfo = collaboratorsMap[colabId];
            
            // Ignora se não existir ou for inativo
            if (!colabInfo) return;

            // Filtro de Turno (Manhã/Tarde vs Noite)
            if (shiftFilter === 'day' && colabInfo.shift === 'Noite') return;
            if (shiftFilter === 'night' && colabInfo.shift !== 'Noite') return;

            // Inicializa o colaborador no agregador se não existir
            if (!colabStats[colabId]) {
                colabStats[colabId] = {
                    id: colabId,
                    name: colabInfo.name,
                    shift: colabInfo.shift,
                    pontuacao: 0,
                    finalizacoes: 0,
                    tmaTelSecTotal: 0,
                    tmaTelCount: 0,
                    tmaHuggySecTotal: 0,
                    tmaHuggyCount: 0
                };
            }

            // Soma a Pontuação
            let pts = e.pontuacao;
            if (pts === undefined) {
                pts = (Number(e.Atendimentos_Finalizados || 0) * 1) + 
                      (Number(e.Ligacoes_Atendidas || 0) * 2) + 
                      (Number(e.Atendimentos_Huggy || 0) * 1) + 
                      (Number(e.Ligacoes_Perdidas || 0) * -5);
            }
            colabStats[colabId].pontuacao += pts;
            
            // Soma Finalizações
            colabStats[colabId].finalizacoes += Number(e.Atendimentos_Finalizados) || 0;

            // Soma Segundos do TMA Telefonia para Média
            const telSec = timeToSeconds(e.TMA_Telefonia);
            if (telSec !== Infinity && telSec > 0) {
                colabStats[colabId].tmaTelSecTotal += telSec;
                colabStats[colabId].tmaTelCount += 1;
            }

            // Soma Segundos do TMA Huggy para Média
            const huggySec = timeToSeconds(e.TMA_Huggy);
            if (huggySec !== Infinity && huggySec > 0) {
                colabStats[colabId].tmaHuggySecTotal += huggySec;
                colabStats[colabId].tmaHuggyCount += 1;
            }
        });

        // Consolida as médias e prepara array final
        let data = Object.values(colabStats).map(c => {
            const avgTelSec = c.tmaTelCount > 0 ? Math.round(c.tmaTelSecTotal / c.tmaTelCount) : Infinity;
            const avgHuggySec = c.tmaHuggyCount > 0 ? Math.round(c.tmaHuggySecTotal / c.tmaHuggyCount) : Infinity;

            return {
                ...c,
                tmaTelSec: avgTelSec,
                tmaTel: secondsToTime(avgTelSec),
                tmaHuggySec: avgHuggySec,
                tmaHuggy: secondsToTime(avgHuggySec)
            };
        });

        // Aplica a ordenação dependendo da aba
        if (activeTab === 'pontuacao') data.sort((a, b) => b.pontuacao - a.pontuacao);
        else if (activeTab === 'finalizacoes') data.sort((a, b) => b.finalizacoes - a.finalizacoes);
        else if (activeTab === 'tma_tel') data.sort((a, b) => a.tmaTelSec - b.tmaTelSec);
        else if (activeTab === 'tma_huggy') data.sort((a, b) => a.tmaHuggySec - b.tmaHuggySec);

        return data;
    }, [evaluations, collaboratorsMap, periodFilter, shiftFilter, activeTab]);

    const getMedalIcon = (index) => {
        if (index === 0) return <Medal className="w-5 h-5 text-yellow-500 drop-shadow-sm" />; // Ouro
        if (index === 1) return <Medal className="w-5 h-5 text-gray-400 drop-shadow-sm" />;   // Prata
        if (index === 2) return <Medal className="w-5 h-5 text-amber-700 drop-shadow-sm" />;  // Bronze
        return <span className="text-gray-400 font-bold w-5 text-center block">{index + 1}º</span>;
    };

    if (loading) {
        return <div className="flex-1 flex justify-center items-center h-full"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>;
    }

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto bg-gray-50 flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Trophy className="w-6 h-6 text-yellow-500" /> Rankings da Equipe
                    </h1>
                    <p className="text-sm text-gray-500">Acompanhe os destaques por período e turno.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    {/* Filtro de Turno */}
                    <div className="relative w-full sm:w-auto">
                        <Users className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                        <select 
                            value={shiftFilter} 
                            onChange={(e) => setShiftFilter(e.target.value)}
                            className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 outline-none cursor-pointer appearance-none focus:border-red-500"
                        >
                            <option value="all">Todos os Turnos</option>
                            <option value="day">Apenas Manhã e Tarde</option>
                            <option value="night">Apenas Noite</option>
                        </select>
                    </div>

                    {/* Filtro de Período (Semana, Mês ou Geral) */}
                    <div className="relative w-full sm:w-auto">
                        <Calendar className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                        <select 
                            value={periodFilter} 
                            onChange={(e) => setPeriodFilter(e.target.value)}
                            className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 outline-none cursor-pointer appearance-none focus:border-red-500"
                        >
                            <option value="all">Total Agregado (Todo o período)</option>
                            
                            {filterOptions.months.length > 0 && (
                                <optgroup label="Agrupado por Mês">
                                    {filterOptions.months.map(m => <option key={`month_${m}`} value={`month_${m}`}>Mês: {m}</option>)}
                                </optgroup>
                            )}

                            {filterOptions.weeks.length > 0 && (
                                <optgroup label="Semanas Específicas">
                                    {filterOptions.weeks.map(d => <option key={`week_${d}`} value={`week_${d}`}>Semana: {d}</option>)}
                                </optgroup>
                            )}
                        </select>
                    </div>
                </div>
            </header>

            {/* ABAS DE NAVEGAÇÃO DO RANKING */}
            <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm mb-6 shrink-0 flex flex-wrap gap-2">
                <button onClick={() => setActiveTab('pontuacao')} className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'pontuacao' ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-sm' : 'text-gray-500 hover:bg-gray-50 border border-transparent'}`}>
                    <Star className={`w-4 h-4 ${activeTab === 'pontuacao' ? 'text-amber-500' : ''}`}/> Pontuação
                </button>
                <button onClick={() => setActiveTab('finalizacoes')} className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'finalizacoes' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm' : 'text-gray-500 hover:bg-gray-50 border border-transparent'}`}>
                    <CheckSquare className={`w-4 h-4 ${activeTab === 'finalizacoes' ? 'text-emerald-500' : ''}`}/> Finalizações
                </button>
                <button onClick={() => setActiveTab('tma_tel')} className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'tma_tel' ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm' : 'text-gray-500 hover:bg-gray-50 border border-transparent'}`}>
                    <Phone className={`w-4 h-4 ${activeTab === 'tma_tel' ? 'text-blue-500' : ''}`}/> TMA Telefonia
                </button>
                <button onClick={() => setActiveTab('tma_huggy')} className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'tma_huggy' ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm' : 'text-gray-500 hover:bg-gray-50 border border-transparent'}`}>
                    <MessageSquare className={`w-4 h-4 ${activeTab === 'tma_huggy' ? 'text-purple-500' : ''}`}/> TMA Huggy
                </button>
            </div>

            {/* TABELA DE RANKING */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden max-w-5xl mx-auto w-full">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-gray-500" />
                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                            Tabela de Classificação
                        </h3>
                    </div>
                    {periodFilter !== 'all' && !periodFilter.startsWith('week_') && (
                        <span className="text-xs text-gray-400 font-medium italic">Valores agregados / médias</span>
                    )}
                </div>
                
                <div className="overflow-y-auto flex-1 p-2">
                    {rankingData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-gray-400 py-16">
                            <Trophy className="w-12 h-12 mb-3 opacity-20" />
                            <p className="text-sm font-medium">Nenhum dado lançado para este filtro e período.</p>
                        </div>
                    ) : (
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-gray-400 text-[10px] uppercase tracking-widest text-left border-b border-gray-100">
                                    <th className="pb-3 pl-6 w-16">Pos</th>
                                    <th className="pb-3">Colaborador</th>
                                    <th className="pb-3 text-center">Turno</th>
                                    <th className="pb-3 text-right pr-6">
                                        {activeTab === 'pontuacao' && 'Pontos (Soma)'}
                                        {activeTab === 'finalizacoes' && 'Vol. Finalizado (Soma)'}
                                        {activeTab === 'tma_tel' && 'TMA Voz (Média)'}
                                        {activeTab === 'tma_huggy' && 'TMA Chat (Média)'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rankingData.map((colab, index) => {
                                    let displayValue = '';
                                    let valueClass = 'bg-gray-100 text-gray-700';

                                    if (activeTab === 'pontuacao') {
                                        displayValue = `${colab.pontuacao} pts`;
                                        if (index === 0) valueClass = 'bg-yellow-100 text-yellow-800';
                                        else if (index === 1) valueClass = 'bg-gray-200 text-gray-800';
                                        else if (index === 2) valueClass = 'bg-amber-100 text-amber-800';
                                    } else if (activeTab === 'finalizacoes') {
                                        displayValue = colab.finalizacoes;
                                        if (index < 3) valueClass = 'bg-emerald-100 text-emerald-800';
                                    } else if (activeTab === 'tma_tel') {
                                        displayValue = colab.tmaTelSec === Infinity ? 'Sem linha' : colab.tmaTel;
                                        if (index < 3 && colab.tmaTelSec !== Infinity) valueClass = 'bg-blue-100 text-blue-800';
                                    } else if (activeTab === 'tma_huggy') {
                                        displayValue = colab.tmaHuggySec === Infinity ? 'Sem chat' : colab.tmaHuggy;
                                        if (index < 3 && colab.tmaHuggySec !== Infinity) valueClass = 'bg-purple-100 text-purple-800';
                                    }

                                    return (
                                        <tr key={colab.id} className={`border-b border-gray-50 transition-colors ${index < 3 ? 'bg-amber-50/10 hover:bg-amber-50/30' : 'hover:bg-gray-50'}`}>
                                            <td className="py-4 pl-6 flex items-center justify-start h-full">
                                                {getMedalIcon(index)}
                                            </td>
                                            <td className="py-4">
                                                <span className={`font-bold ${index < 3 ? 'text-gray-900' : 'text-gray-700'}`}>{colab.name}</span>
                                            </td>
                                            <td className="py-4 text-center">
                                                <span className="text-[10px] uppercase font-bold text-gray-400 border border-gray-200 px-2 py-0.5 rounded">
                                                    {colab.shift || '--'}
                                                </span>
                                            </td>
                                            <td className="py-4 text-right pr-6">
                                                <span className={`font-bold px-3 py-1.5 rounded-lg inline-block min-w-[90px] text-center shadow-sm ${valueClass}`}>
                                                    {displayValue}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Rankings;