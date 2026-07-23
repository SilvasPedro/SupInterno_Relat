import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { 
    Save, Calendar, MessageSquare, Ticket, Clock, 
    Activity, AlertCircle, Plus, FileText, Edit2, Trash2, X, Filter
} from 'lucide-react';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar
} from 'recharts';

export default function DailyDemandLaunch() {
    // Modal & Form States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [startTickets, setStartTickets] = useState('');
    const [startChats, setStartChats] = useState('');
    const [endTickets, setEndTickets] = useState('');
    const [endChats, setEndChats] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    // Data States
    const [historicalData, setHistoricalData] = useState([]);
    
    
    // Filter State (Inicia no mês atual: YYYY-MM)
    const [filterPeriod, setFilterPeriod] = useState(new Date().toISOString().slice(0, 7));

    useEffect(() => {
        fetchHistoricalData();
    }, []);

    // Popula o form ao editar ou se já houver dado na data
    useEffect(() => {
        if (isModalOpen) {
            const todayData = historicalData.find(d => d.date === date);
            if (todayData) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setStartTickets(todayData.startTickets ?? '');
                setStartChats(todayData.startChats ?? '');
                setEndTickets(todayData.endTickets ?? '');
                setEndChats(todayData.endChats ?? '');
            } else {
                setStartTickets('');
                setStartChats('');
                setEndTickets('');
                setEndChats('');
            }
        }
    }, [date, historicalData, isModalOpen]);

    async function fetchHistoricalData() {
        try {
            const q = query(collection(db, 'dailyDemand'), orderBy('date', 'asc'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHistoricalData(data);
        } catch (error) {
            console.error('Erro ao buscar dados históricos:', error);
        }
        }

    const handleSave = async (e) => {
        e.preventDefault();
        
        if (startTickets === '' && startChats === '' && endTickets === '' && endChats === '') {
            setMessage('Erro: Preencha pelo menos um dos campos para salvar.');
            return;
        }

        setIsSaving(true);
        setMessage('');

        try {
            const docRef = doc(db, 'dailyDemand', date);
            const payload = {
                date,
                startTickets: startTickets !== '' ? Number(startTickets) : null,
                startChats: startChats !== '' ? Number(startChats) : null,
                endTickets: endTickets !== '' ? Number(endTickets) : null,
                endChats: endChats !== '' ? Number(endChats) : null,
                updatedAt: new Date().toISOString(),
            };

            await setDoc(docRef, payload, { merge: true });
            setMessage('Salvo com sucesso!');
            fetchHistoricalData(); 
            
            setTimeout(() => {
                setMessage('');
                setIsModalOpen(false);
            }, 1500);
        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            setMessage('Erro ao salvar. Verifique sua conexão.');
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if(window.confirm('Tem certeza que deseja excluir este registro?')) {
            try {
                await deleteDoc(doc(db, 'dailyDemand', id));
                fetchHistoricalData();
            } catch (error) {
                console.error("Erro ao deletar", error);
            }
        }
    };

    const openEdit = (dataRecord) => {
        setDate(dataRecord.date);
        setIsModalOpen(true);
    };

    // --- Aplicação do Filtro ---
    const filteredData = historicalData.filter(d => {
        if (!filterPeriod) return true; 
        return d.date.startsWith(filterPeriod);
    });

    // --- Metric Calculations & Chart Data Formatting ---
    const getMetricsAndChartData = () => {
        if (filteredData.length === 0) return { metrics: { avgStartTickets: 0, avgStartChats: 0, avgEndTickets: 0, avgEndChats: 0 }, chartData: [] };

        let totalStartTickets = 0, totalStartChats = 0;
        let totalEndTickets = 0, totalEndChats = 0;
        let startCount = 0, endCount = 0;

        const ascData = [...filteredData].sort((a, b) => new Date(a.date) - new Date(b.date));

        const chartData = ascData.map(d => {
            if (d.startTickets !== null && d.startTickets !== undefined) {
                totalStartTickets += d.startTickets;
                totalStartChats += d.startChats || 0;
                startCount++;
            }
            if (d.endTickets !== null && d.endTickets !== undefined) {
                totalEndTickets += d.endTickets;
                totalEndChats += d.endChats || 0;
                endCount++;
            }

            // Formata a data para DD/MM
            const formattedDate = d.date.split('-').reverse().slice(0, 2).join('/');

            return {
                ...d,
                formattedDate
            };
        });

        const metrics = {
            avgStartTickets: startCount > 0 ? Math.round(totalStartTickets / startCount) : 0,
            avgStartChats: startCount > 0 ? Math.round(totalStartChats / startCount) : 0,
            avgEndTickets: endCount > 0 ? Math.round(totalEndTickets / endCount) : 0,
            avgEndChats: endCount > 0 ? Math.round(totalEndChats / endCount) : 0
        };

        return { metrics, chartData };
    };

    const { metrics, chartData } = getMetricsAndChartData();
    const sortedTableData = [...filteredData].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Paleta de Cores Atualizada
    const COLORS = {
        chamadosInicio: '#10b981', // Verde claro
        chamadosFim: '#047857',    // Verde escuro
        chatsInicio: '#8b5cf6',    // Roxo claro
        chatsFim: '#5b21b6'        // Roxo escuro
    };

    // A classe `h-full overflow-y-auto` na div abaixo garante que a página sempre será rolável
    return (
        <div className="h-full overflow-y-auto w-full">
            <div className="p-6 max-w-7xl mx-auto space-y-6 pb-12">
                
                {/* Cabeçalho */}
                <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                            <Activity className="w-6 h-6 text-red-600" />
                            Demanda e Fila Diária
                        </h1>
                        <p className="text-zinc-500 text-sm mt-1">
                            Acompanhamento padronizado do volume de chamados e chats.
                        </p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 w-full sm:w-auto focus-within:ring-2 focus-within:ring-red-500/20 transition-all">
                            <Filter className="w-4 h-4 text-zinc-500" />
                            <input 
                                type="month"
                                value={filterPeriod}
                                onChange={(e) => setFilterPeriod(e.target.value)}
                                className="bg-transparent text-sm text-zinc-700 font-medium outline-none cursor-pointer w-full"
                            />
                            {filterPeriod && (
                                <button 
                                    onClick={() => setFilterPeriod('')} 
                                    className="text-zinc-400 hover:text-red-500 transition-colors ml-1" 
                                    title="Mostrar todo o histórico"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        <button 
                            onClick={() => { setDate(new Date().toISOString().split('T')[0]); setIsModalOpen(true); }}
                            className="bg-[#E60000] hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm w-full sm:w-auto whitespace-nowrap"
                        >
                            <Plus className="w-5 h-5" /> Novo Registro
                        </button>
                    </div>
                </div>

                {/* Grid de KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-[#111111] rounded-xl shadow-sm border border-black p-5 flex flex-col justify-center">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Ticket className="w-3.5 h-3.5" style={{color: COLORS.chamadosInicio}}/> MÉDIA INÍCIO (CHAMADOS)
                        </div>
                        <div className="text-3xl font-black text-white">{metrics.avgStartTickets}</div>
                    </div>

                    <div className="bg-[#111111] rounded-xl shadow-sm border border-black p-5 flex flex-col justify-center">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5" style={{color: COLORS.chatsInicio}}/> MÉDIA INÍCIO (CHATS)
                        </div>
                        <div className="text-3xl font-black text-white">{metrics.avgStartChats}</div>
                    </div>

                    <div className="bg-[#111111] rounded-xl shadow-sm border border-black p-5 flex flex-col justify-center">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Ticket className="w-3.5 h-3.5" style={{color: COLORS.chamadosFim}}/> MÉDIA FIM (CHAMADOS)
                        </div>
                        <div className="text-3xl font-black text-white">{metrics.avgEndTickets}</div>
                    </div>

                    <div className="bg-[#111111] rounded-xl shadow-sm border border-black p-5 flex flex-col justify-center">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5" style={{color: COLORS.chatsFim}}/> MÉDIA FIM (CHATS)
                        </div>
                        <div className="text-3xl font-black text-white">{metrics.avgEndChats}</div>
                    </div>
                </div>

                {/* Gráficos em Linha (Início x Fim) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Linha: Evolução do INÍCIO do Dia (Chamados e Chats) */}
                    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6">
                        <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-500" /> Evolução de Fila (Início do Dia)
                        </h3>
                        <div className="h-64 w-full">
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="formattedDate" tick={{fontSize: 11, fill: '#71717a'}} axisLine={false} tickLine={false} />
                                        <YAxis tick={{fontSize: 11, fill: '#71717a'}} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{borderRadius: '8px', border: '1px solid #e4e4e7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                        <Legend wrapperStyle={{fontSize: '11px', paddingTop: '10px'}} iconType="circle" />
                                        <Line type="monotone" dataKey="startTickets" name="Chamados" stroke={COLORS.chamadosInicio} strokeWidth={3} dot={{r: 3}} activeDot={{r: 6}} connectNulls />
                                        <Line type="monotone" dataKey="startChats" name="Chats" stroke={COLORS.chatsInicio} strokeWidth={3} dot={{r: 3}} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-zinc-400 text-sm">Sem dados no período</div>
                            )}
                        </div>
                    </div>

                    {/* Linha: Evolução do FIM do Dia (Chamados e Chats) */}
                    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6">
                        <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-700" /> Evolução de Fila (Fim do Dia)
                        </h3>
                        <div className="h-64 w-full">
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="formattedDate" tick={{fontSize: 11, fill: '#71717a'}} axisLine={false} tickLine={false} />
                                        <YAxis tick={{fontSize: 11, fill: '#71717a'}} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{borderRadius: '8px', border: '1px solid #e4e4e7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                        <Legend wrapperStyle={{fontSize: '11px', paddingTop: '10px'}} iconType="circle" />
                                        <Line type="monotone" dataKey="endTickets" name="Chamados" stroke={COLORS.chamadosFim} strokeWidth={3} dot={{r: 3}} activeDot={{r: 6}} connectNulls />
                                        <Line type="monotone" dataKey="endChats" name="Chats" stroke={COLORS.chatsFim} strokeWidth={3} dot={{r: 3}} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-zinc-400 text-sm">Sem dados no período</div>
                            )}
                        </div>
                    </div>

 {/* Gráfico de Barras Empilhadas (Início e Fim lado a lado) */}
<div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 lg:col-span-2">
    <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center gap-2">
        <Activity className="w-4 h-4 text-zinc-400" /> Comparativo: Início vs Fim do Expediente
    </h3>
    <div className="h-64 w-full">
        {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="formattedDate" tick={{fontSize: 11, fill: '#71717a'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 11, fill: '#71717a'}} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#f4f4f5'}} contentStyle={{borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '12px'}} />
                    <Legend wrapperStyle={{fontSize: '11px', paddingTop: '10px'}} iconType="circle" />
                    
                    {/* Barras do Início (stackId="inicio") */}
                    <Bar dataKey="startTickets" name="Chamados (Início)" stackId="inicio" fill={COLORS.chamadosInicio} barSize={20} />
                    <Bar dataKey="startChats" name="Chats (Início)" stackId="inicio" fill={COLORS.chatsInicio} radius={[2, 2, 0, 0]} />
                    
                    {/* Barras do Fim (stackId="fim") */}
                    <Bar dataKey="endTickets" name="Chamados (Fim)" stackId="fim" fill={COLORS.chamadosFim} barSize={20} />
                    <Bar dataKey="endChats" name="Chats (Fim)" stackId="fim" fill={COLORS.chatsFim} radius={[2, 2, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        ) : (
            <div className="h-full flex items-center justify-center text-zinc-400 text-sm">Sem dados no período</div>
        )}
    </div>
</div>
                </div>

                {/* Tabela de Registros */}
                <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-zinc-200 flex justify-between items-center bg-white z-10 relative">
                        <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-zinc-500" /> Registros Lançados {filterPeriod ? '(Filtrado)' : '(Todos)'}
                        </h2>
                    </div>
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-left border-collapse relative">
                            <thead className="sticky top-0 z-20">
                                <tr className="bg-[#111111] text-white text-[11px] uppercase tracking-wider font-semibold">
                                    <th className="p-3">Data</th>
                                    <th className="p-3">Chamados (Início)</th>
                                    <th className="p-3">Chats (Início)</th>
                                    <th className="p-3">Chamados (Fim)</th>
                                    <th className="p-3">Chats (Fim)</th>
                                    <th className="p-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm text-zinc-700 divide-y divide-zinc-100">
                                {sortedTableData.length > 0 ? sortedTableData.map((row) => (
                                    <tr key={row.id} className="hover:bg-zinc-50 transition-colors">
                                        <td className="p-3 font-medium">
                                            {row.date.split('-').reverse().join('/')}
                                        </td>
                                        <td className="p-3">{row.startTickets !== null && row.startTickets !== undefined ? row.startTickets : '-'}</td>
                                        <td className="p-3">{row.startChats !== null && row.startChats !== undefined ? row.startChats : '-'}</td>
                                        <td className="p-3">{row.endTickets !== null && row.endTickets !== undefined ? row.endTickets : '-'}</td>
                                        <td className="p-3">{row.endChats !== null && row.endChats !== undefined ? row.endChats : '-'}</td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-end gap-3">
                                                <button onClick={() => openEdit(row)} className="text-amber-500 hover:text-amber-600 transition-colors">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(row.id)} className="text-red-500 hover:text-red-600 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" className="p-6 text-center text-zinc-500 text-sm bg-white">
                                            Nenhum registro encontrado para este período.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modal de Lançamento */}
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-5 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                                <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-red-600" />
                                    Registro Diário
                                </h2>
                                <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <div className="p-6">
                                {message && (
                                    <div className={`p-3 rounded-lg text-sm mb-5 flex items-center gap-2 font-medium ${message.includes('Erro') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                        <AlertCircle className="w-4 h-4" /> {message}
                                    </div>
                                )}

                                <form onSubmit={handleSave} className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Data Referência</label>
                                        <div className="relative">
                                            <Calendar className="w-5 h-5 absolute left-3 top-2.5 text-zinc-400" />
                                            <input 
                                                type="date" 
                                                value={date}
                                                onChange={(e) => setDate(e.target.value)}
                                                className="w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-zinc-700 font-medium transition-all"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 space-y-4">
                                        <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-zinc-400" /> Início do Expediente
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-zinc-500 mb-1 font-medium">Chamados Pendentes</label>
                                                <input type="number" min="0" value={startTickets} onChange={e => setStartTickets(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md outline-none focus:border-zinc-400 text-sm" placeholder="Opcional" />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-zinc-500 mb-1 font-medium">Chats na Fila</label>
                                                <input type="number" min="0" value={startChats} onChange={e => setStartChats(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md outline-none focus:border-zinc-400 text-sm" placeholder="Opcional" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 space-y-4">
                                        <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-zinc-400" /> Fim do Expediente
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-zinc-500 mb-1 font-medium">Chamados Pendentes</label>
                                                <input type="number" min="0" value={endTickets} onChange={e => setEndTickets(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md outline-none focus:border-zinc-400 text-sm" placeholder="Opcional" />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-zinc-500 mb-1 font-medium">Chats na Fila</label>
                                                <input type="number" min="0" value={endChats} onChange={e => setEndChats(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md outline-none focus:border-zinc-400 text-sm" placeholder="Opcional" />
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={isSaving}
                                        className="w-full bg-[#E60000] hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm mt-2"
                                    >
                                        {isSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
                                        {isSaving ? 'Salvando...' : 'Salvar Registro'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}