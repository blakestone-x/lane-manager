export type LaneStatus = 'idle' | 'starting' | 'running' | 'paused' | 'error' | 'killed';

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
  costUsd: number;
}

export interface LaneConfig {
  id: string;
  name: string;
  cwd: string;
  systemPrompt?: string;
  model?: string;
  template?: string;
  sessionId: string;
  bypassPermissions: boolean;
}

export interface LaneState extends LaneConfig {
  status: LaneStatus;
  messages: LaneMessage[];
  tokens: LaneTokenUsage;
  createdAt: number;
  lastActivity: number;
  errorMessage?: string;
}

export interface PersistedLane {
  config: LaneConfig;
  messages: LaneMessage[];
  tokens: LaneTokenUsage;
  createdAt: number;
  lastActivity: number;
  /** True once Claude Code has written the session to disk (first completed turn). */
  sessionEstablished?: boolean;
}

export interface GlobalConfig {
  defaultModel?: string;
  claudeExecutable?: string;
  configDir: string;
  lanesDir: string;
}

export type LaneEvent =
  | { type: 'message'; laneId: string; message: LaneMessage }
  | { type: 'status'; laneId: string; status: LaneStatus; error?: string }
  | { type: 'tokens'; laneId: string; tokens: LaneTokenUsage }
  | { type: 'tool_use'; laneId: string; toolName: string; input: unknown }
  | { type: 'tool_result'; laneId: string; toolName: string; output: string };

export interface LaneTemplate {
  name: string;
  cwd: string;
  systemPrompt?: string;
  description?: string;
}
