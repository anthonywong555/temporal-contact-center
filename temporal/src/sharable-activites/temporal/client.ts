import { Connection, WorkflowClient, WorkflowHandle, } from '@temporalio/client';

export class TemporalClient {
  client: WorkflowClient;
  connnection: Connection;
  namespace: string;

  constructor(aClient: WorkflowClient, aConnnection: Connection, aNamespace: string) {
    this.client = aClient;
    this.connnection = aConnnection;
    this.namespace = aNamespace;
  }

  async listWorkflowExecutions(request: any): Promise<any> {
    if(!request.namespace) {
      request.namespace = this.namespace;
    }
    return await this.connnection.workflowService.listWorkflowExecutions(request);
  }

  async signalWithStart(workflow: string, params: any): Promise<WorkflowHandle> {
    return this.client.signalWithStart(`${workflow}`, params);
  }
}