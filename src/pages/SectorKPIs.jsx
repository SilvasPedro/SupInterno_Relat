import React, { useState, useEffect } from 'react';
import { Rocket, Target, TrendingUp, RefreshCw, Save, Edit3, Calendar, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { collection, onSnapshot, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';

const SectorKPIs = () => {
    const { showToast } = useNotification();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Estado do formulário de Lançamento da Semana
    const [kpiForm, setKpiForm] = useState({ date: '', tmr: '', fcr: '', recurrence: '' });

    // Estado para filtro de mês
    const getCurrentMonth = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    };
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

    // Dados reais do gráfico
    const [chartData, setChartData] = useState([]);

    // --- FUNÇÕES DE CONVERSÃO DE TEMPO ---
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

    // Formata YYYY-MM-DD para DD/MM para o eixo X do gráfico não ficar gigante
    const formatChartDate = (dateString) => {
        if (!dateString) return '';
        const parts = dateString.split('-');
        if(parts.length === 3) return `${parts[2]}/${parts[1]}`;
        return dateString;
    };

    // --- PUXANDO DADOS DO FIREBASE ---
    useEffect(() => {
        // Puxa o histórico de KPIs do setor
        const q = query(collection(db, "sector_kpis"), orderBy("date", "asc"));
        
        const unsubscribeKpis = onSnapshot(q, (snapshot) => {
            const fetchedData = [];
            snapshot.forEach((doc) => {
                const dbData = doc.data();
                fetchedData.push({
                    id: doc.id,
                    fullDate: dbData.date, // "YYYY-MM-DD"
                    date: formatChartDate(dbData.date),
                    fcr: Number(dbData.fcr) || 0,
                    reincidencia: Number(dbData.recurrence) || 0,
                    tmrDecimal: timeToDecimal(dbData.tmr) // Converte p/ número p/ o gráfico
                });
            });
            setChartData(fetchedData);
            setLoading(false);
        });

        return () => {
            unsubscribeKpis();
        };
    }, []);

    // Filtra dados do gráfico baseado no mês selecionado
    const filteredChartData = chartData.filter(item => {
        if (!selectedMonth) return true;
        return item.fullDate && item.fullDate.startsWith(selectedMonth);
    });

    // --- SALVAR NOVO LANÇAMENTO (GRÁFICO) ---
    const handleSaveKPI = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await addDoc(collection(db, "sector_kpis"), {
                date: kpiForm.date,
                tmr: kpiForm.tmr,
                fcr: Number(kpiForm.fcr),
                recurrence: Number(kpiForm.recurrence),
                createdAt: new Date()
            });
            showToast("Lançamento salvo com sucesso no banco!", "success");
            setKpiForm({ date: '', tmr: '', fcr: '', recurrence: '' }); // Limpa o formulário
        } catch (error) {
            console.error(error);
            showToast("Erro ao salvar lançamento.", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 800);
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
                <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 p-6 bg-gray-50 h-full overflow-y-auto">
            {/* CABEÇALHO */}
            <header className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Gestão de KPIs do Setor</h1>
                    <p className="text-sm text-gray-500">Lançamento, histórico e acompanhamento de metas.</p>
                </div>
                <button 
                    onClick={handleRefresh}
                    className="p-3 bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors shadow-sm"
                    title="Atualizar dados"
                >
                    <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
            </header>

            {/* GRID SUPERIOR: Formulários */}
            <div className="mb-6">
                
                {/* CARD 1: Lançar KPIs */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                    <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <Rocket className="w-5 h-5 text-red-600" />
                        Lançar KPIs da Semana
                    </h2>
                    
                    <form onSubmit={handleSaveKPI} className="space-y-4 flex-1 flex flex-col justify-between">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Semana Referência</label>
                                <input 
                                    type="date" 
                                    required
                                    value={kpiForm.date}
                                    onChange={(e) => setKpiForm({...kpiForm, date: e.target.value})}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-gray-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">TMR (HH:MM:SS)</label>
                                <input 
                                    type="text" 
                                    placeholder="00:00:00"
                                    required
                                    value={kpiForm.tmr}
                                    onChange={(e) => setKpiForm({...kpiForm, tmr: e.target.value})}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-gray-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">FCR (%)</label>
                                <input 
                                    type="number" 
                                    step="0.1"
                                    placeholder="0.0"
                                    required
                                    value={kpiForm.fcr}
                                    onChange={(e) => setKpiForm({...kpiForm, fcr: e.target.value})}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-gray-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Reincidência (%)</label>
                                <input 
                                    type="number" 
                                    step="0.1"
                                    placeholder="0.0"
                                    required
                                    value={kpiForm.recurrence}
                                    onChange={(e) => setKpiForm({...kpiForm, recurrence: e.target.value})}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-gray-700"
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={saving}
                            className="w-full md:w-auto md:self-end mt-6 py-3 px-8 bg-zinc-950 text-white rounded-lg hover:bg-black transition-colors font-bold flex items-center justify-center gap-2 disabled:opacity-70"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            SALVAR LANÇAMENTO
                        </button>
                    </form>
                </div>
            </div>

            {/* CARD 3: Gráfico de Evolução */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        Evolução Mensal dos KPIs
                    </h2>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <input 
                            type="month" 
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-transparent outline-none text-sm font-medium text-gray-700"
                        />
                    </div>
                </div>

                <div className="w-full mt-4">
                    {filteredChartData.length === 0 ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                            Nenhum lançamento registrado no banco de dados para este mês.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Gráfico FCR */}
                            <div className="h-72 bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col">
                                <h3 className="text-sm font-bold text-gray-700 mb-4 text-center">First Call Resolution (FCR)</h3>
                                <div className="flex-1 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={filteredChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorFcr" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                                            <Tooltip 
                                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                                formatter={(value) => [`${value}%`, 'FCR (%)']}
                                            />
                                            <Area type="monotone" dataKey="fcr" name="FCR (%)" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorFcr)" activeDot={{ r: 6 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Gráfico TMR */}
                            <div className="h-72 bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col">
                                <h3 className="text-sm font-bold text-gray-700 mb-4 text-center">Tempo Médio de Resposta (TMR)</h3>
                                <div className="flex-1 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={filteredChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorTmr" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                                            <Tooltip 
                                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                                formatter={(value) => [formatTime(value), 'TMR']}
                                            />
                                            <Area type="monotone" dataKey="tmrDecimal" name="TMR" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorTmr)" activeDot={{ r: 6 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Gráfico Reincidência */}
                            <div className="h-72 bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col">
                                <h3 className="text-sm font-bold text-gray-700 mb-4 text-center">Taxa de Reincidência</h3>
                                <div className="flex-1 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={filteredChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorRecorrence" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                                            <Tooltip 
                                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                                formatter={(value) => [`${value}%`, 'Reincidência (%)']}
                                            />
                                            <Area type="monotone" dataKey="reincidencia" name="Reincidência (%)" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorRecorrence)" activeDot={{ r: 6 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SectorKPIs;