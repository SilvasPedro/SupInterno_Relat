import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Save, Loader2, Calendar, Upload, Download } from 'lucide-react';
import { collection, onSnapshot, addDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';

const WeeklyMetrics = () => {
    const { showToast } = useNotification();
    const [collaborators, setCollaborators] = useState([]);
    const [metricsData, setMetricsData] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const fileInputRef = useRef(null);

    // Estado para a data de referência (inicia com a data de hoje no formato YYYY-MM-DD para o input)
    const [referenceDate, setReferenceDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const q = query(collection(db, "collaborators"), orderBy("name"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const colabs = [];
            const initialMetrics = {};
            
            snapshot.forEach((doc) => {
                const data = doc.data();
                
                // FILTRO: Ignora colaboradores inativos ou sem turno registrado
                if (data.active === false || !data.shift || data.shift.trim() === '') {
                    return;
                }

                colabs.push({ id: doc.id, ...data });
                initialMetrics[doc.id] = {
                    Ligacoes_Atendidas: '',
                    Ligacoes_Perdidas: '',
                    TMA_Telefonia: '',
                    TME_Telefonia: '',
                    Atendimentos_Huggy: '',
                    TMA_Huggy: '',
                    Atendimentos_Finalizados: ''
                };
            });
            
            setCollaborators(colabs);
            // Só seta o initialMetrics se estiver vazio para não apagar o que o usuário já digitou se a tela recarregar
            setMetricsData(prev => Object.keys(prev).length === 0 ? initialMetrics : prev);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleInputChange = (colabId, field, value) => {
        setMetricsData(prev => ({
            ...prev,
            [colabId]: {
                ...prev[colabId],
                [field]: value
            }
        }));
    };

    // --- FUNÇÕES DE IMPORTAÇÃO E EXPORTAÇÃO CSV ---
    
    const downloadTemplate = () => {
        // Cabeçalhos que o leitor de CSV vai esperar
        const headers = ["Nome", "Ligacoes_Atendidas", "Ligacoes_Perdidas", "TMA_Telefonia", "TME_Telefonia", "Atendimentos_Huggy", "TMA_Huggy", "Atendimentos_Finalizados"];
        
        // Pré-preenche os nomes dos colaboradores ativos
        const rows = collaborators.map(c => [c.name, "0", "0", "00:00:00", "00:00:00", "0", "00:00:00", "0"]);
        
        // Monta o arquivo usando ponto e vírgula como delimitador (padrão do Excel no Brasil)
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "modelo_metricas.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            // Lê quebras de linha tanto do Windows quanto do Mac/Linux
            const lines = text.split(/\r?\n/); 
            
            if (lines.length < 2) {
                showToast("O arquivo parece estar vazio ou tem um formato inválido.", "error");
                return;
            }

            // Detecta se o arquivo usa vírgula ou ponto e vírgula
            const delimiter = lines[0].includes(';') ? ';' : ',';
            const newMetrics = { ...metricsData };
            let importedCount = 0;

            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].split(delimiter).map(item => item?.trim() || '');
                if (row.length < 2 || !row[0]) continue; // Pula linhas vazias
                
                const colabName = row[0];
                
                // Tenta achar o colaborador pelo nome (ignorando maiúsculas/minúsculas)
                const colab = collaborators.find(c => c.name.toLowerCase() === colabName.toLowerCase());
                
                if (colab) {
                    newMetrics[colab.id] = {
                        Ligacoes_Atendidas: row[1] || '',
                        Ligacoes_Perdidas: row[2] || '',
                        TMA_Telefonia: row[3] || '',
                        TME_Telefonia: row[4] || '',
                        Atendimentos_Huggy: row[5] || '',
                        TMA_Huggy: row[6] || '',
                        Atendimentos_Finalizados: row[7] || ''
                    };
                    importedCount++;
                }
            }
            
            setMetricsData(newMetrics);
            showToast(`${importedCount} registros foram pré-carregados! Revise na tabela e clique em Salvar.`, "success");
        };
        
        reader.readAsText(file);
        e.target.value = null; // Reseta o input de arquivo para permitir reenviar o mesmo arquivo se necessário
    };

    const handleSaveMetrics = async () => {
        setSaving(true);
        try {
            // Formata a data escolhida no input (YYYY-MM-DD) para o padrão do banco (DD/MM/YYYY)
            const [year, month, day] = referenceDate.split('-');
            const dateString = `${day}/${month}/${year}`;

            const savePromises = Object.entries(metricsData).map(async ([colabId, metrics]) => {
                const hasData = Object.values(metrics).some(val => val !== '');
                if (!hasData) return Promise.resolve();

                const finalizados = Number(metrics.Atendimentos_Finalizados) || 0;
                const ligAtendidas = Number(metrics.Ligacoes_Atendidas) || 0;
                const ligPerdidas = Number(metrics.Ligacoes_Perdidas) || 0;
                const huggy = Number(metrics.Atendimentos_Huggy) || 0;

                // Cálculo de pontuação
                const pontuacaoTotal = (finalizados * 1) + (ligAtendidas * 2) + (huggy * 1) + (ligPerdidas * -5);

                return addDoc(collection(db, "weekly_evaluations"), {
                    colabId: colabId,
                    date: dateString, // Salva com a data selecionada no seletor
                    Atendimentos_Finalizados: finalizados,
                    Ligacoes_Atendidas: ligAtendidas,
                    Ligacoes_Perdidas: ligPerdidas,
                    Atendimentos_Huggy: huggy,
                    TMA_Telefonia: metrics.TMA_Telefonia || "00:00:00",
                    TMA_Huggy: metrics.TMA_Huggy || "00:00:00",
                    TME_Telefonia: metrics.TME_Telefonia || "00:00:00",
                    pontuacao: pontuacaoTotal,
                    createdAt: new Date() 
                });
            });

            await Promise.all(savePromises);
            
            showToast("Avaliações salvas com sucesso!", "success");
            
            // Limpa os campos após salvar
            const resetMetrics = {};
            collaborators.forEach(c => {
                resetMetrics[c.id] = {
                    Ligacoes_Atendidas: '', Ligacoes_Perdidas: '', TMA_Telefonia: '',
                    TME_Telefonia: '', Atendimentos_Huggy: '', TMA_Huggy: '', Atendimentos_Finalizados: ''
                };
            });
            setMetricsData(resetMetrics);

        } catch (error) {
            console.error(error);
            showToast("Erro ao salvar avaliações.", "error");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
                <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto bg-gray-50">
            
            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-red-600" />
                        Lançamento de Avaliações
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Preencha as métricas semanais da equipe de atendimento.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    
                    {/* Botões de CSV Oculto Input */}
                    <input 
                        type="file" 
                        accept=".csv" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                    />
                    
                    <button 
                        onClick={downloadTemplate}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 font-medium transition-colors border border-zinc-200 shadow-sm"
                        title="Baixar modelo Excel (CSV) para preenchimento"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Baixar Modelo</span>
                    </button>

                    <button 
                        onClick={() => fileInputRef.current.click()}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 font-medium transition-colors border border-zinc-200 shadow-sm"
                        title="Importar dados de um arquivo CSV"
                    >
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">Importar CSV</span>
                    </button>

                    {/* Seletor de Data */}
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 ml-0 sm:ml-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-500 hidden sm:inline">Referência:</span>
                        <input 
                            type="date" 
                            value={referenceDate}
                            onChange={(e) => setReferenceDate(e.target.value)}
                            className="bg-transparent outline-none cursor-pointer font-bold text-gray-900"
                        />
                    </div>
                    
                    <button 
                        onClick={handleSaveMetrics}
                        disabled={saving}
                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors disabled:opacity-70 shadow-sm ml-0 sm:ml-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar Lançamentos
                    </button>
                </div>
            </header>

            {collaborators.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
                    Não há colaboradores ativos ou com turno configurado para exibir.
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap">
                            <thead className="bg-zinc-950 text-white">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold">Colaborador</th>
                                    <th className="px-4 py-3 text-center font-semibold w-24">Turno</th>
                                    <th className="px-4 py-3 text-center font-semibold w-28">Ligações<br/>Atendidas</th>
                                    <th className="px-4 py-3 text-center font-semibold w-28">Ligações<br/>Perdidas</th>
                                    <th className="px-4 py-3 text-center font-semibold w-32">TMA<br/>Telefonia</th>
                                    <th className="px-4 py-3 text-center font-semibold w-32">TME<br/>Telefonia</th>
                                    <th className="px-4 py-3 text-center font-semibold w-28">Atendimentos<br/>Huggy</th>
                                    <th className="px-4 py-3 text-center font-semibold w-32">TMA<br/>Huggy</th>
                                    <th className="px-4 py-3 text-center font-semibold w-32">Atendimentos<br/>Finalizados</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {collaborators.map((colab) => (
                                    <tr key={colab.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-900">{colab.name}</td>
                                        <td className="px-4 py-3 text-center text-gray-500">{colab.shift}</td>
                                        <td className="px-4 py-3">
                                            <input type="number" min="0" placeholder="0" className="w-full p-2 border border-gray-300 rounded text-center outline-none focus:border-red-500 transition-colors"
                                                value={metricsData[colab.id]?.Ligacoes_Atendidas || ''} onChange={(e) => handleInputChange(colab.id, 'Ligacoes_Atendidas', e.target.value)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input type="number" min="0" placeholder="0" className="w-full p-2 border border-gray-300 rounded text-center outline-none focus:border-red-500 transition-colors"
                                                value={metricsData[colab.id]?.Ligacoes_Perdidas || ''} onChange={(e) => handleInputChange(colab.id, 'Ligacoes_Perdidas', e.target.value)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input type="text" placeholder="00:00:00" className="w-full p-2 border border-gray-300 rounded text-center outline-none focus:border-red-500 transition-colors"
                                                value={metricsData[colab.id]?.TMA_Telefonia || ''} onChange={(e) => handleInputChange(colab.id, 'TMA_Telefonia', e.target.value)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input type="text" placeholder="00:00:00" className="w-full p-2 border border-gray-300 rounded text-center outline-none focus:border-red-500 transition-colors"
                                                value={metricsData[colab.id]?.TME_Telefonia || ''} onChange={(e) => handleInputChange(colab.id, 'TME_Telefonia', e.target.value)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input type="number" min="0" placeholder="0" className="w-full p-2 border border-gray-300 rounded text-center outline-none focus:border-red-500 transition-colors"
                                                value={metricsData[colab.id]?.Atendimentos_Huggy || ''} onChange={(e) => handleInputChange(colab.id, 'Atendimentos_Huggy', e.target.value)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input type="text" placeholder="00:00:00" className="w-full p-2 border border-gray-300 rounded text-center outline-none focus:border-red-500 transition-colors"
                                                value={metricsData[colab.id]?.TMA_Huggy || ''} onChange={(e) => handleInputChange(colab.id, 'TMA_Huggy', e.target.value)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input type="number" min="0" placeholder="0" className="w-full p-2 border border-gray-300 rounded text-center outline-none focus:border-red-500 transition-colors"
                                                value={metricsData[colab.id]?.Atendimentos_Finalizados || ''} onChange={(e) => handleInputChange(colab.id, 'Atendimentos_Finalizados', e.target.value)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WeeklyMetrics;