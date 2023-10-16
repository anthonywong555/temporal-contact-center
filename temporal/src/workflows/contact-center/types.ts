export type Task = {
  CallSid: string,
  From: string,
  To: string,
  Routing: string,
  TemporalTaskQueue?: string,
  isCallDelay?: boolean
}

export type TaskWorkflowParams = {
  task: Task
}

export type TaskReservedWorkflowParams = {
  CallSid: string,
  agentId: string
}

export type AgentAction = {
  agentId: string,
  agentPhoneNumber: string,
  isAccept: boolean,
  isTimeout?: boolean
}

export type AgentWorkflowParams = {
  agentId: string,
  agentPhoneNumber: string
}

export enum AgentStatus {
  busy = 'busy',
  available = 'available'
}

export interface Agent {
  name: string,
  number?: string,
  status: AgentStatus // busy | available
}

export enum CallStatus {
  pending = 'pending',
  active = 'active',
  completed = 'completed'
}

export interface Call {
  status: string, // pending | active | completed
  sid: string,
  caller: string,
  agent: string
}

export interface CallPoolWorkflowParams {
  agents?: Array<Agent>
  calls?: Array<Call>
}

export interface CustomerAgentWorkflowParams {
  customer: Call,
  agent: Agent
}