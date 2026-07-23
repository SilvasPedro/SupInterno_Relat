import React, { useState, useEffect } from 'react';
import { 
    Calendar, Save, Loader2, Users, GripVertical, X, Phone, MessageCircle, LifeBuoy
} from 'lucide-react';
import { collection, onSnapshot, query, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';

// Dias da semana fixos
const daysOfWeek = [
    { id: 'segunda', label: 'Segunda-feira' },
    { id: 'terca', label: 'Terça-feira' },
    { id: 'quarta', label: 'Quarta-feira' },
    { id: 'quinta', label: 'Quinta-feira' },
    { id: 'sexta', label: 'Sexta-feira' },
    { id: 'sabado', label: 'Sábado' }
];

const roles = [
    { key: 'telefonia', label: 'Telefonia', icon: <Phone className="w-3.5 h-3.5" />, color: 'blue' },
    { key: 'huggy', label: 'Huggy', icon: <MessageCircle className="w-3.5 h-3.5" />, color: 'purple' },
    { key: 'apoio', label: 'Apoio', icon: <LifeBuoy className="w-3.5 h-3.5" />, color: 'emerald' }
];

const DailySchedule = ({ readOnly = false }) => {
    const { showToast } = useNotification();
    
    const [collaborators, setCollaborators] = useState([]);
    const [schedule, setSchedule] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Estado do Drag and Drop
    const [draggedItem, setDraggedItem] = useState(null);

    // ID Fixo para a escala padrão
    const documentId = "fixed_schedule";

    // 1. Busca os colaboradores (para montar a barra lateral)
    useEffect(() => {
        if (!readOnly) {
            const qColabs = query(collection(db, "collaborators"));
            const unsubColabs = onSnapshot(qColabs, (snap) => {
                const colabs = [];
                snap.forEach(d => {
                    if (d.data().active !== false) colabs.push({ id: d.id, ...d.data() });
                });
                colabs.sort((a, b) => a.name.localeCompare(b.name));
                setCollaborators(colabs);
            });
            return () => unsubColabs();
        }
    }, [readOnly]);

    // 2. Busca a escala fixa
    useEffect(() => {
        const fetchSchedule = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, "daily_schedules", documentId);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    setSchedule(docSnap.data().assignments || {});
                } else {
                    setSchedule({});
                }
            } catch {
                showToast("Erro ao carregar a escala.", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchSchedule();
    }, [documentId, showToast]);

    // --- SALVAR NO FIREBASE ---
    const handleSave = async () => {
        if (readOnly) return;
        setSaving(true);
        try {
            await setDoc(doc(db, "daily_schedules", documentId), {
                type: "fixed",
                assignments: schedule,
                updatedAt: new Date()
            });
            showToast("Escala diária salva com sucesso!", "success");
        } catch {
            showToast("Erro ao salvar escala.", "error");
        } finally {
            setSaving(false);
        }
    };

    // --- LÓGICA DE DRAG AND DROP ---
    // sourceDay e sourceRole indicam de onde o colaborador está vindo (null se vier da barra lateral)
    const handleDragStart = (e, colab, sourceDay, sourceRole) => {
        if (readOnly) return;
        setDraggedItem({ colab, sourceDay, sourceRole });
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

    const handleDrop = (e, targetDay, targetRole) => {
        if (readOnly) return;
        e.preventDefault();
        if (!draggedItem) return;

        const { colab, sourceDay, sourceRole } = draggedItem;

        // Se soltou exatamente no mesmo lugar de onde saiu, ignora
        if (sourceDay === targetDay && sourceRole === targetRole) return;

        setSchedule((prev) => {
            const newSchedule = JSON.parse(JSON.stringify(prev));

            // Remove o colaborador de onde ele estava
            if (sourceDay !== null && sourceRole !== null) {
                if (newSchedule[sourceDay] && newSchedule[sourceDay][sourceRole]) {
                    newSchedule[sourceDay][sourceRole] = newSchedule[sourceDay][sourceRole].filter(c => c.id !== colab.id);
                }
            }

            // Se o alvo for a barra lateral (remover da escala), o alvo será null
            if (targetDay === null) return newSchedule;

            // Garante que a estrutura do dia e função exista
            if (!newSchedule[targetDay]) newSchedule[targetDay] = { telefonia: [], huggy: [], apoio: [] };
            if (!newSchedule[targetDay][targetRole]) newSchedule[targetDay][targetRole] = [];

            // Evita duplicidade no mesmo dia (remove de outras funções no mesmo dia)
            newSchedule[targetDay].telefonia = newSchedule[targetDay].telefonia?.filter(c => c.id !== colab.id) || [];
            newSchedule[targetDay].huggy = newSchedule[targetDay].huggy?.filter(c => c.id !== colab.id) || [];
            newSchedule[targetDay].apoio = newSchedule[targetDay].apoio?.filter(c => c.id !== colab.id) || [];

            // Adiciona no novo local
            newSchedule[targetDay][targetRole].push(colab);

            return newSchedule;
        });
    };

    const removeColab = (dayId, role, colabId) => {
        if (readOnly) return;
        setSchedule(prev => {
            const newSchedule = JSON.parse(JSON.stringify(prev));
            if (newSchedule[dayId] && newSchedule[dayId][role]) {
                newSchedule[dayId][role] = newSchedule[dayId][role].filter(c => c.id !== colabId);
            }
            return newSchedule;
        });
    };

    if (loading && collaborators.length === 0) {
        return <div className="flex-1 flex items-center justify-center bg-gray-50 h-full"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>;
    }

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto bg-gray-50 flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-red-600" />
                        Escala Diária (Padrão)
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {readOnly ? "Consulte a distribuição de canais de atendimento padrão da equipe." : "Arraste os colaboradores para definir a escala padrão de Voz, Chat ou Apoio."}
                    </p>
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto">
                    {!readOnly && (
                        <button 
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors disabled:opacity-70 shadow-sm shrink-0"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Salvar Escala Padrão
                        </button>
                    )}
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                {/* LADO ESQUERDO: Colaboradores Disponíveis */}
                {!readOnly && (
                    <div 
                        className="w-full lg:w-72 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden shrink-0"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, null, null)} // Soltar aqui remove
                    >
                        <div className="p-4 border-b border-gray-100 bg-zinc-950 text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-red-500" />
                            <h3 className="font-bold">Equipe Ativa</h3>
                        </div>
                        
                        <div className="p-3 overflow-y-auto flex-1 space-y-2 bg-gray-50">
                            <p className="text-[11px] text-gray-500 mb-3 text-center leading-tight">
                                Arraste os cards para as funções nos dias da semana.
                            </p>
                            {collaborators.map(colab => (
                                <div 
                                    key={colab.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, colab, null, null)}
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

                {/* LADO DIREITO: Kanban Diário (Fixo) */}
                <div className={`flex-1 flex overflow-x-auto gap-4 pb-4 ${readOnly ? 'justify-start' : ''}`}>
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>
                    ) : (
                        daysOfWeek.map((day) => {
                            const dayData = schedule[day.id] || { telefonia: [], huggy: [], apoio: [] };

                            return (
                                <div key={day.id} className="w-72 bg-gray-100 rounded-xl border border-gray-200 shadow-inner flex flex-col shrink-0 overflow-hidden">
                                    <div className="p-3 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
                                        <h3 className="font-black text-gray-900">{day.label}</h3>
                                    </div>
                                    
                                    <div className="flex-1 overflow-y-auto p-2 space-y-3">
                                        {/* Zonas de Drop (Telefonia, Huggy, Apoio) */}
                                        {roles.map(role => {
                                            const assigned = dayData[role.key] || [];
                                            const bgColors = {
                                                blue: 'bg-blue-50 border-blue-200',
                                                purple: 'bg-purple-50 border-purple-200',
                                                emerald: 'bg-emerald-50 border-emerald-200'
                                            };
                                            const textColors = {
                                                blue: 'text-blue-800',
                                                purple: 'text-purple-800',
                                                emerald: 'text-emerald-800'
                                            };

                                            return (
                                                <div 
                                                    key={role.key}
                                                    onDragOver={!readOnly ? handleDragOver : undefined}
                                                    onDrop={!readOnly ? (e) => handleDrop(e, day.id, role.key) : undefined}
                                                    className={`rounded-xl border p-2 flex flex-col ${bgColors[role.color]}`}
                                                >
                                                    <div className={`flex items-center justify-between mb-2 px-1 ${textColors[role.color]}`}>
                                                        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider">
                                                            {role.icon} {role.label}
                                                        </span>
                                                        <span className="text-[10px] font-bold bg-white/60 px-1.5 py-0.5 rounded">
                                                            {assigned.length}
                                                        </span>
                                                    </div>

                                                    <div className="space-y-1.5 min-h-[40px]">
                                                        {assigned.length === 0 ? (
                                                            <div className="h-10 flex items-center justify-center border border-dashed border-black/10 rounded-lg text-black/30 text-[10px] font-medium">
                                                                {readOnly ? '-' : 'Arraste aqui'}
                                                            </div>
                                                        ) : (
                                                            assigned.map((colab) => (
                                                                <div 
                                                                    key={`${day.id}-${role.key}-${colab.id}`}
                                                                    draggable={!readOnly}
                                                                    onDragStart={!readOnly ? (e) => handleDragStart(e, colab, day.id, role.key) : undefined}
                                                                    onDragEnd={!readOnly ? handleDragEnd : undefined}
                                                                    className={`bg-white border border-black/10 p-2 rounded-lg shadow-sm flex justify-between items-center transition-all group ${!readOnly ? 'cursor-grab hover:shadow-md' : 'cursor-default'}`}
                                                                >
                                                                    <div className="overflow-hidden pr-1">
                                                                        <p className="font-bold text-[11px] text-gray-800 truncate" title={colab.name}>{colab.name}</p>
                                                                        <p className="text-[9px] text-gray-400 uppercase leading-none mt-0.5">{colab.shift}</p>
                                                                    </div>
                                                                    {!readOnly && (
                                                                        <button 
                                                                            onClick={() => removeColab(day.id, role.key, colab.id)}
                                                                            className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default DailySchedule;