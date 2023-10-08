export type Task = {
  CallSid: string,
  From: string,
  To: string,
  Routing: string,
}

export type TaskWorkflowParams = {
  task: Task
}

export type AgentAction = {
  agentId: string,
  agentPhoneNumber: string,
  isAccept: boolean,
  isTimeout: boolean
}

export type AgentWorkflowParams = {
  agentId: string,
  agentPhoneNumber: string
}