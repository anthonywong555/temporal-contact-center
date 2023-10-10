import { TemporalClient } from './client';

export function createTemporalActvites(temporalClient: TemporalClient) {
  return {
    listWorkflowExecutions: temporalClient.listWorkflowExecutions.bind(temporalClient),
    signalWithStart: temporalClient.signalWithStart.bind(temporalClient)
  }
}