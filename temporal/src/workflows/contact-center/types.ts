export type Task = {
  CallSid: string,
  From: string,
  To: string
}

export type TaskWorkflowParams = {
  task: Task
}

export type AgentAction = {
  agentId: string,
  isAccept: boolean,
  isTimeout: boolean
}