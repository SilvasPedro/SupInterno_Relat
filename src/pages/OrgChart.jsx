import React, { useState, useEffect, useMemo } from 'react';
import { 
    Network, Save, Loader2, Users, GripVertical, X, 
    Crown, LifeBuoy, Headset, GraduationCap
} from 'lucide-react';
import { collection, onSnapshot, query, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';

const OrgChart = ({ readOnly = false }) => {
    const { showToast } = useNotification();
    
    const [allCollaborators, setAllCollaborators] = useState([]);
    
    // Nova estrutura padrão de chaves do organograma
    const defaultStructure = {
        lider_supervisor: [],
        assistente_apoio: [],
        operacional_efetivado: [],
        novatos_experiencia: []
    };

    const [chart, setChart] = useState(defaultStructure);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Estado do Drag and Drop
    const [draggedItem, setDraggedItem] = useState(null);

    const documentId = "department_structure";

    // 1. Busca todos os colaboradores ativos
    useEffect(() => {
        const qColabs = query(collection(db, "collaborators"));
        const unsubColabs = onSnapshot(qColabs, (snap) => {
            const colabs = [];
            snap.forEach(d => {
                if (d.data().active !== false) colabs.push({ id: d.id, ...d.data() });
            });
            colabs.sort((a, b) => a.name.localeCompare(b.name));
            setAllCollaborators(colabs);
        });
        return () => unsubColabs();
    }, []);

    // 2. Busca a estrutura do organograma salva
    useEffect(() => {
        const fetchChart = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, "system_settings", documentId);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists() && docSnap.data().structure) {
                    // Mescla a estrutura salva com a estrutura padrão para garantir que todas as chaves existam
                    setChart({ ...defaultStructure, ...docSnap.data().structure });
                } else {
                    setChart(defaultStructure);
                }
            } catch {
                showToast("Erro ao carregar o organograma.", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchChart();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showToast]);

    // 3. Calcula quem ainda não foi alocado na estrutura
    const unassignedCollaborators = useMemo(() => {
        const assignedIds = new Set([
            ...(chart.lider_supervisor || []).map(c => c.id),
            ...(chart.assistente_apoio || []).map(c => c.id),
            ...(chart.operacional_efetivado || []).map(c => c.id),
            ...(chart.novatos_experiencia || []).map(c => c.id)
        ]);
        return allCollaborators.filter(c => !assignedIds.has(c.id));
    }, [allCollaborators, chart]);

    // --- SALVAR NO FIREBASE ---
    const handleSave = async () => {
        if (readOnly) return;
        setSaving(true);
        try {
            await setDoc(doc(db, "system_settings", documentId), {
                structure: chart,
                updatedAt: new Date()
            });
            showToast("Organograma salvo com sucesso!", "success");
        } catch {
            showToast("Erro ao salvar organograma.", "error");
        } finally {
            setSaving(false);
        }
    };

    // --- LÓGICA DE DRAG AND DROP ---
    const handleDragStart = (e, colab, sourceLevel) => {
        if (readOnly) return;
        setDraggedItem({ colab, sourceLevel });
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => { e.target.style.opacity = '0.5'; }, 0);
    };

    const handleDragEnd = (e) => {
        if (readOnly) return;
        e.target.style.opacity = '1';
        setDraggedItem(null);
    };

    const handleDragOver = (e) => {
        if (readOnly) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e, targetLevel) => {
        if (readOnly) return;
        e.preventDefault();
        if (!draggedItem) return;

        const { colab, sourceLevel } = draggedItem;

        // Se não mudou de lugar, ignora
        if (sourceLevel === targetLevel) return;

        setChart((prev) => {
            const newChart = JSON.parse(JSON.stringify(prev));

            // Remove da origem (se veio de algum nível)
            if (sourceLevel !== null) {
                newChart[sourceLevel] = newChart[sourceLevel].filter(c => c.id !== colab.id);
            }

            // Adiciona no destino (se não foi jogado de volta para a barra lateral)
            if (targetLevel !== null) {
                if (!newChart[targetLevel]) newChart[targetLevel] = [];
                newChart[targetLevel].push(colab);
            }

            return newChart;
        });
    };

    const removeColab = (level, colabId) => {
        if (readOnly) return;
        setChart(prev => {
            const newChart = JSON.parse(JSON.stringify(prev));
            newChart[level] = newChart[level].filter(c => c.id !== colabId);
            return newChart;
        });
    };

    if (loading && allCollaborators.length === 0) {
        return <div className="flex-1 flex items-center justify-center bg-gray-50 h-full"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>;
    }

    // Novas Camadas (Tiers) do Organograma
    const tiers = [
        { key: 'lider_supervisor', label: 'Líder / Supervisor', icon: <Crown className="w-5 h-5" />, color: 'yellow', border: 'border-yellow-200', bg: 'bg-yellow-50', text: 'text-yellow-800' },
        { key: 'assistente_apoio', label: 'Assistente / Apoio', icon: <LifeBuoy className="w-5 h-5" />, color: 'emerald', border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-800' },
        { key: 'operacional_efetivado', label: 'Operacional Efetivado', icon: <Headset className="w-5 h-5" />, color: 'blue', border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-800' },
        { key: 'novatos_experiencia', label: 'Novatos / Experiência', icon: <GraduationCap className="w-5 h-5" />, color: 'purple', border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-800' }
    ];

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto bg-gray-50 flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Network className="w-6 h-6 text-red-600" />
                        Organograma do Departamento
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {readOnly ? "Estrutura hierárquica e distribuição de papéis da equipe." : "Arraste os colaboradores para definir a hierarquia do setor."}
                    </p>
                </div>
                
                {!readOnly && (
                    <button 
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors disabled:opacity-70 shadow-sm shrink-0"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Salvar Estrutura
                    </button>
                )}
            </header>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                {/* LADO ESQUERDO: Colaboradores Não Alocados */}
                {!readOnly && (
                    <div 
                        className="w-full lg:w-72 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden shrink-0"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, null)} // Soltar aqui remove do organograma
                    >
                        <div className="p-4 border-b border-gray-100 bg-zinc-950 text-white flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-red-500" />
                                <h3 className="font-bold">Não Alocados</h3>
                            </div>
                            <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full">{unassignedCollaborators.length}</span>
                        </div>
                        
                        <div className="p-3 overflow-y-auto flex-1 space-y-2 bg-gray-50">
                            <p className="text-[11px] text-gray-500 mb-3 text-center leading-tight">
                                Arraste os cards para o nível hierárquico ao lado.
                            </p>
                            {unassignedCollaborators.map(colab => (
                                <div 
                                    key={colab.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, colab, null)}
                                    onDragEnd={handleDragEnd}
                                    className="bg-white border border-gray-200 p-2.5 rounded-lg shadow-sm flex items-center gap-3 cursor-grab hover:border-red-300 hover:shadow-md transition-all group"
                                >
                                    <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-red-400 shrink-0" />
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-[13px] text-gray-800 truncate" title={colab.name}>{colab.name}</p>
                                        <p className="text-[9px] text-gray-500 uppercase">{colab.shift || 'Sem turno'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* LADO DIREITO: A Árvore do Organograma */}
                <div className={`flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-y-auto p-8 flex flex-col items-center relative ${readOnly ? 'w-full' : ''}`}>
                    
                    {loading ? (
                        <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>
                    ) : (
                        tiers.map((tier, index) => {
                            const assigned = chart[tier.key] || [];
                            
                            return (
                                <React.Fragment key={tier.key}>
                                    {/* Linha conectora vertical superior (exceto no primeiro nível) */}
                                    {index !== 0 && (
                                        <div className="w-0.5 h-8 bg-gray-300"></div>
                                    )}

                                    {/* Bloco do Nível Hierárquico */}
                                    <div 
                                        className={`w-full max-w-4xl rounded-2xl border-2 p-4 flex flex-col items-center transition-colors ${tier.border} ${tier.bg}`}
                                        onDragOver={!readOnly ? handleDragOver : undefined}
                                        onDrop={!readOnly ? (e) => handleDrop(e, tier.key) : undefined}
                                    >
                                        <div className={`flex items-center gap-2 mb-4 ${tier.text}`}>
                                            {tier.icon}
                                            <h3 className="font-black uppercase tracking-widest text-sm">{tier.label}</h3>
                                            <span className="ml-2 bg-white/60 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm">{assigned.length}</span>
                                        </div>

                                        <div className="flex flex-wrap justify-center gap-3 w-full min-h-[60px]">
                                            {assigned.length === 0 ? (
                                                <div className="w-full flex items-center justify-center border-2 border-dashed border-black/10 rounded-xl text-black/30 text-xs font-medium py-4">
                                                    {readOnly ? 'Nenhum colaborador nesta função' : 'Arraste colaboradores aqui'}
                                                </div>
                                            ) : (
                                                assigned.map((colab) => (
                                                    <div 
                                                        key={`${tier.key}-${colab.id}`}
                                                        draggable={!readOnly}
                                                        onDragStart={!readOnly ? (e) => handleDragStart(e, colab, tier.key) : undefined}
                                                        onDragEnd={!readOnly ? handleDragEnd : undefined}
                                                        className={`bg-white border border-gray-200 w-48 p-3 rounded-xl shadow-sm flex justify-between items-center transition-all group ${!readOnly ? 'cursor-grab hover:shadow-md hover:border-red-300' : 'cursor-default'}`}
                                                    >
                                                        <div className="overflow-hidden pr-2 text-center w-full">
                                                            <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 mx-auto flex items-center justify-center mb-2">
                                                                <User className="w-4 h-4 text-gray-500" />
                                                            </div>
                                                            <p className="font-bold text-sm text-gray-800 truncate" title={colab.name}>{colab.name}</p>
                                                            <p className="text-[10px] text-gray-400 uppercase font-medium mt-0.5">{colab.shift}</p>
                                                        </div>
                                                        {!readOnly && (
                                                            <button 
                                                                onClick={() => removeColab(tier.key, colab.id)}
                                                                className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                                title="Remover função"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

// Componente simples de icone de usuario inserido inline
const User = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
);

export default OrgChart;