const fs = require('fs');
let code = fs.readFileSync('src/pages/DataManager.jsx', 'utf8');

const regex = /const ViewModal = \(\{ activeTab, item, collaboratorsMap, onClose \}\} => \{[\s\S]*?\};\n/m;
const oldRegex = /const ViewModal = \(\{ activeTab, item, collaboratorsMap, onClose \}\) => \{[\s\S]*?    \);\n\};/m;

const replacement = `const ViewModal = ({ activeTab, item, collaboratorsMap, qaProcesses, onClose }) => {
    return (
        <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
            <div className={\`bg-white rounded-xl shadow-2xl w-full \${activeTab === 'audits' ? 'max-w-2xl' : 'max-w-md'} overflow-hidden flex flex-col max-h-[90vh]\`}>
                <div className="p-4 bg-zinc-950 text-white flex justify-between items-center shrink-0">
                    <h3 className="font-bold">Detalhes do Registro</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-6 space-y-4 text-sm overflow-y-auto flex-1">
                    {Object.entries(item).map(([key, value]) => {
                        if (['id', 'createdAt', 'updatedAt', 'colabId', 'collaboratorId', 'colabName', 'read', 'evaluatorId', 'checklistResults', 'processId'].includes(key)) return null;
                        
                        let displayValue = value;
                        if (value && typeof value === 'object') {
                            if (typeof value.toDate === 'function') {
                                displayValue = value.toDate().toLocaleString('pt-BR');
                            } else if (value.seconds !== undefined) {
                                displayValue = new Date(value.seconds * 1000).toLocaleString('pt-BR');
                            } else {
                                displayValue = JSON.stringify(value);
                            }
                        }
                        
                        let displayString = displayValue?.toString() || 'Vazio';
                        if ((key === 'colabId' || key === 'collaboratorId') && collaboratorsMap && collaboratorsMap[value]) {
                            displayString = collaboratorsMap[value]; 
                        }
                        
                        return (
                            <div key={key} className="border-b border-gray-100 pb-2">
                                <span className="block text-xs font-bold text-gray-400 uppercase">{translateKey(key)}</span>
                                <span className="block text-gray-900 mt-1 whitespace-pre-wrap">{displayString}</span>
                            </div>
                        );
                    })}
                    
                    {/* EXIBIÇÃO DEDICADA DA CHECKLIST DE AUDITORIA */}
                    {activeTab === 'audits' && item.checklistResults && Object.keys(item.checklistResults).length > 0 && (
                        <div className="mt-6 border-t border-gray-200 pt-4">
                            <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-red-500" /> Checklist da Avaliação
                            </h4>
                            <div className="space-y-3">
                                {Object.entries(item.checklistResults).map(([idx, status]) => {
                                    const process = qaProcesses && item.processId ? qaProcesses[item.processId] : null;
                                    const question = process?.checklist?.[idx] || \`Item de verificação \${Number(idx) + 1}\`;
                                    let statusColor = "text-gray-600 bg-gray-100 border-gray-200";
                                    if (status === 'Passou') statusColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
                                    if (status === 'Falhou') statusColor = "text-red-700 bg-red-50 border-red-200";
                                    return (
                                        <div key={idx} className="flex justify-between items-start gap-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                            <span className="text-sm text-gray-700 font-medium leading-snug">{question}</span>
                                            <span className={\`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 border \${statusColor}\`}>
                                                {status}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t border-gray-200 shrink-0">
                    <button onClick={onClose} className="w-full py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300">Fechar</button>
                </div>
            </div>
        </div>
    );
};`;

code = code.replace(oldRegex, replacement);
// We also need to update how ViewModal is called!
code = code.replace(/<ViewModal activeTab=\{activeTab\} collaboratorsMap=\{collaboratorsMap\} item=\{viewingItem\} onClose=\{/g, '<ViewModal activeTab={activeTab} collaboratorsMap={collaboratorsMap} qaProcesses={qaProcesses} item={viewingItem} onClose={');

fs.writeFileSync('src/pages/DataManager.jsx', code);
