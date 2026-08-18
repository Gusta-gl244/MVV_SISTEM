export type UserRole = 'tecnico' | 'supervisor' | 'superadm' | null;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

// ─── BANCO DE USUÁRIOS ────────────────────────────────────────────────────────
export interface SystemUser {
  id: string;               // Identificador único
  name: string;             // Nome completo
  email: string;            // E-mail (login)
  // Sem campo de senha aqui de propósito: a senha nunca existe em texto
  // puro no frontend, só como hash no servidor. Criar/alterar senha usa um
  // campo `password` avulso (não faz parte deste tipo), enviado só na hora
  // da troca e nunca guardado localmente depois.
  role: 'tecnico' | 'supervisor' | 'superadm'; // Tipo de acesso
  status: 'active' | 'inactive';               // Situação
  lastLogin: string;        // Último acesso
  avatar?: string;          // URL da foto de perfil
  phone?: string;           // Telefone
  createdAt?: string;       // Data de criação
}

// ─── BANCO DE ESTRUTURAS ──────────────────────────────────────────────────────
export type StructureType =
  | 'Suspensão'
  | 'Ancoragem'
  | 'Transposição'
  | 'Terminal'
  | 'Ângulo'
  | 'Estaiada';

export type StructureStatus =
  | 'pendente'
  | 'em-andamento'
  | 'concluido'
  | 'anomalia'
  | 'atrasado';

export interface Structure {
  id: string;                    // Identificador único
  name: string;                  // Nome da estrutura (ex: Torre 001)
  type: StructureType;           // Tipo de estrutura
  classe?: string;               // Classe da estrutura (ex: MT2, AT3)
  // Coordenadas UTM (zona 23S, datum WGS84)
  coordX: number;                // Coordenada X (Easting)
  coordY: number;                // Coordenada Y (Northing)
  /** @deprecated use coordX */
  lng?: number;
  /** @deprecated use coordY */
  lat?: number;
  // Dimensões e métricas
  alturaUtil?: number;           // Altura útil (m)
  vanFrente?: number;            // Vão à frente (m)
  cotaCentro?: number;           // Cota centro (m)
  progressiva: number;           // Progressiva (m)
  deflexao?: number;             // Deflexão (graus)
  // Metadados da linha
  lt: string;                    // Linha de transmissão
  voltage: string;               // Tensão (ex: 230kV)
  // Cadeias
  cadeiaCondutor?: string;       // Tipo da cadeia de condutor
  qtdCadeias?: number;           // Quantidade de cadeias
  cadeiaParaRaios?: string;      // Tipo da cadeia para raios
  qtdCadeiasPR?: number;         // Quantidade de cadeias para raios
  // Status e controle
  status: StructureStatus;
  estruturaCritica?: boolean;    // Estrutura crítica?
  observation?: string;          // Observação
  notes?: string;                // Notas internas (legado)
  createdBy: string;             // FK → SystemUser.id
  createdAt: string;             // ISO timestamp
}

// ─── BANCO DE COMPONENTES (Regras de Validação) ───────────────────────────────
export interface ComponentRule {
  id: string;                    // Identificador único (slug)
  name: string;                  // Nome do componente (ex: Isoladores)
  icon: string;                  // Emoji/ícone visual
  description: string;           // Descrição do que será inspecionado
  anomalies: string[];           // Lista de anomalias possíveis para este componente
}

// ─── BANCO DE INSPEÇÕES ───────────────────────────────────────────────────────
export type InspectionStatus =
  | 'aberto'
  | 'em-andamento'
  | 'pausado'
  | 'concluido'
  | 'cancelado';

export interface PauseHistoryEntry {
  pausedAt: string;              // ISO - quando pausou
  resumedAt?: string;            // ISO - quando retomou
  motivo?: string;               // Motivo da pausa
  userId: string;                // FK → SystemUser.id
  userName: string;              // Denormalizado
}

export interface InspectionPhoto {
  id: string;                    // Identificador único
  inspectionId: string;          // FK → InspectionRecord.id
  componentId?: string;          // FK → ComponentRule.id (null = foto geral)
  componentName?: string;        // Denormalizado
  anomalyId?: string;            // FK → AnomalyEntry.id
  dataBase64: string;            // Imagem em base64
  timestamp: string;             // ISO - quando foi tirada
  caption?: string;              // Legenda
  // Organização: inspections/{inspectionId}/components/{componentId}/{id}.jpg
  storagePath?: string;          // Caminho organizacional
}

export interface InspectionRecord {
  id: string;                    // Identificador único
  orderId: string;               // FK → ServiceOrder.id
  estruturaId: string;           // FK → Structure.id
  estruturaNome: string;         // Denormalizado
  supervisorId: string;          // FK → SystemUser.id (quem criou a OS)
  supervisorNome: string;        // Denormalizado
  tecnicoId: string;             // FK → SystemUser.id (quem inspecionou)
  tecnicoNome: string;           // Denormalizado
  dataHoraAbertura: string;      // ISO - início da inspeção
  dataHoraFim?: string;          // ISO - fim da inspeção
  status: InspectionStatus;
  components: ComponentInspection[]; // Componentes inspecionados
  historicoPausas: PauseHistoryEntry[];
  observacoesGerais?: string;
  photos: InspectionPhoto[];     // Fotos organizadas por inspeção/componente
}

// ─── BANCO DE EXECUÇÕES ───────────────────────────────────────────────────────
export type ExecutionStatus =
  | 'pendente'
  | 'em-andamento'
  | 'pausado'
  | 'concluido'
  | 'cancelado';

export interface ExecutionRecord {
  id: string;                    // Identificador único
  orderId: string;               // FK → ServiceOrder.id
  inspectionId?: string;         // FK → InspectionRecord.id (inspeção que gerou esta execução)
  estruturaId: string;           // FK → Structure.id
  estruturaNome: string;         // Denormalizado
  supervisorId: string;          // FK → SystemUser.id
  supervisorNome: string;        // Denormalizado
  tecnicoId: string;             // FK → SystemUser.id
  tecnicoNome: string;           // Denormalizado
  // Detalhes da execução (puxados do banco de inspeção / OS)
  componente: string;            // Componente que precisa de execução
  anomalia: string;              // Anomalia identificada
  descricao?: string;            // Descrição do serviço
  detalhes?: string;             // Detalhes técnicos
  prazoRegras?: string;          // Regras de prazo
  notasSupervisor?: string;      // Notas do supervisor
  // Timing da execução
  dataHoraAbertura: string;      // ISO - abertura da OS de execução
  dataHoraExecucaoInicio?: string; // ISO - início da execução em campo
  dataHoraExecucaoFim?: string;    // ISO - fim da execução em campo
  dataHoraFim?: string;            // ISO - conclusão total
  status: ExecutionStatus;
  historicoPausas: PauseHistoryEntry[];
  photos: InspectionPhoto[];     // Fotos da execução
  observacoesGerais?: string;
}

// ─── ORDENS DE SERVIÇO ────────────────────────────────────────────────────────
export type OrderType = 'inspecao' | 'execucao';
export type OrderStatus =
  | 'pendente'
  | 'em-andamento'
  | 'pausado'
  | 'concluido'
  | 'cancelado';
export type Priority = 'alta' | 'media' | 'baixa';
export type InspectionType =
  | 'Patrulhamento'
  | 'Minuciosa'
  | 'Termográfica'
  | 'Lavagem'
  | 'Limpeza'
  | 'Outras';

export const INSPECTION_TYPES: InspectionType[] = [
  'Patrulhamento', 'Minuciosa', 'Termográfica', 'Lavagem', 'Limpeza', 'Outras',
];

export interface ServiceOrder {
  id: string;
  type: OrderType;
  om: string;                    // Ordem de Manutenção — obrigatório, acompanha todo o ciclo de vida
  inspectionType?: InspectionType; // MI (detalhada) ou PA (patrulhamento) — apenas para type='inspecao'
  structureId: string;           // FK → Structure.id
  technicianId: string;          // FK → SystemUser.id
  supervisorId: string;          // FK → SystemUser.id
  priority: Priority;
  deadline: string;
  scheduledDate: string;
  status: OrderStatus;
  createdAt: string;
  startedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  completedAt?: string;
  // Vinculação com bancos específicos
  inspectionRecordId?: string;   // FK → InspectionRecord.id (se tipo=inspecao)
  executionRecordId?: string;    // FK → ExecutionRecord.id (se tipo=execucao)
  // Execution-specific (legado compatibilidade)
  component?: string;
  anomaly?: string;
  description?: string;
  details?: string;
  deadlineRules?: string;
  supervisorNotes?: string;
  // Inspection result (legado - migrar para InspectionRecord)
  inspectionData?: InspectionData;
  // Evidence
  photos?: string[];
  // Activity log
  activityLog?: ActivityLogEntry[];
}

// ─── DADOS DE INSPEÇÃO (legado / embedded) ────────────────────────────────────
export interface InspectionData {
  components: ComponentInspection[];
  currentComponentIndex: number;
  generalNotes?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ComponentInspection {
  componentId: string;           // FK → ComponentRule.id
  componentName: string;         // Denormalizado
  status: 'pendente' | 'ok' | 'anomalia' | 'nao-aplicavel';
  anomalies: AnomalyEntry[];     // Anomalias registradas
  notes?: string;
  photos?: string[];             // Referências de fotos (base64 ou id)
}

export type AnomalyPhase = 'A' | 'B' | 'C' | 'N' | 'Geral';

export interface AnomalyEntry {
  id: string;
  anomalyName: string;           // Nome da anomalia (FK → ComponentRule.anomalies[])
  severity: string;              // FK → SeverityOption.id
  phase: AnomalyPhase | AnomalyPhase[];  // Pode ser single ou múltiplas fases
  isEmenda: boolean;
  safetyRisk: string;            // FK → SeverityOption.id
  operationalRisk: string;       // FK → SeverityOption.id
  requiresShutdown: boolean;
  isRecurrent: boolean;
  observation: string;
  photo?: string;
}

export interface ActivityLogEntry {
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
}

export interface SeverityOption {
  id: string;
  label: string;
  color: string;
  description: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  module: string;
  message: string;
  userId?: string;
  userName?: string;
}

// ─── ESTADO GLOBAL DO SISTEMA ─────────────────────────────────────────────────
export interface AppData {
  // Bancos de dados primários
  users: SystemUser[];               // Banco de Usuários
  structures: Structure[];           // Banco de Estruturas
  checklistComponents?: ComponentRule[]; // Banco de Componentes (regras de validação)
  inspectionRecords?: InspectionRecord[]; // Banco de Inspeções
  executionRecords?: ExecutionRecord[];   // Banco de Execuções
  // Ordens de Serviço (camada de gestão)
  serviceOrders: ServiceOrder[];
  // Auxiliares
  severities?: SeverityOption[];
  activityLog: ActivityLogEntry[];
  systemLogs?: SystemLog[];
  logsLastReset?: string;
}
