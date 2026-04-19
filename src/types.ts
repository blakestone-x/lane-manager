export type LaneStatus = 'idle' | 'running' | 'waiting' | 'paused' | 'error' | 'killed';

export interface LaneMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  isStreaming?: boolean;
}

export interface LaneTokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface LaneConfig {
  id: string;
  name: string;
  cwd: string;
  systemPrompt: string;
  model: string;
  template?: string;
  maxTokens?: number;
}

export interface LaneState extends LaneConfig {
  status: LaneStatus;
  messages: LaneMessage[];
  tokens: LaneTokenUsage;
  createdAt: number;
  lastActivity: number;
  errorMessage?: string;
  pendingInput?: string;
}

export interface PersistedLane {
  config: LaneConfig;
  messages: LaneMessage[];
  tokens: LaneTokenUsage;
  createdAt: number;
  lastActivity: number;
}

export interface GlobalConfig {
  apiKey?: string;
  defaultModel: string;
  configDir: string;
  lanesDir: string;
}

export type LaneEvent =
  | { type: 'message'; laneId: string; message: LaneMessage }
  | { type: 'status'; laneId: string; status: LaneStatus; error?: string }
  | { type: 'stream'; laneId: string; delta: string }
  | { type: 'tokens'; laneId: string; tokens: LaneTokenUsage }
  | { type: 'tool_use'; laneId: string; toolName: string; input: any }
  | { type: 'tool_result'; laneId: string; toolName: string; output: string };

export interface ICSRepoTemplate {
  name: string;
  displayName: string;
  cwd: string;
  systemPrompt: string;
  description: string;
}
