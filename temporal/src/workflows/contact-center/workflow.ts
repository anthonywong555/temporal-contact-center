import { SearchAttributes, condition, proxyActivities, upsertSearchAttributes, workflowInfo, defineSignal, setHandler } from '@temporalio/workflow';
import { createTwilioActivites } from '../../sharable-activites/twilio/activites'
import { AgentAction, Task } from './types';

const { twilioCallUpdate } = proxyActivities<ReturnType<typeof createTwilioActivites>>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3
  }
});

export const AgentActionSignal = defineSignal<[AgentAction]>('agentAction');

/** A workflow that simply calls an activity */
export async function taskWorkflow(task: Task): Promise<SearchAttributes> {
  const { CallSid } = task;
  let acceptedAgent = '';
  let isAssigned = false;

  // Signal Handler
  setHandler(AgentActionSignal, ({ agentId, isAccept, isTimeout }: AgentAction) => {
    if(!isAssigned && isAccept) {
      // An Agent Accepted this Task.
      isAssigned = true;
      acceptedAgent = agentId;

      upsertSearchAttributes({
        TaskRouterAgent: [agentId],
        TaskRouterState: ['Assigned']
      });
    }
  });

  // Retrieve Call Routing Rules

  // Create Reserve Workflow

  // Set the Task State.
  upsertSearchAttributes({
    TaskRouterState: ['Reserved']
  });
  
  if(await condition(() => isAssigned, '5 minute')) {
    // Connect the Call
    const twiml = '<Response><Dial>+155555555</Dial></Response>';
    const result = await twilioCallUpdate({ CallSid, twiml });
    console.log(result);
  } else {
    // Time has elapsed!
    upsertSearchAttributes({
      TaskRouterState: ['Canceled']
    });
  }

  return workflowInfo().searchAttributes;
}

export async function taskReservedWorkflow(task: Task): Promise<String> {
  
  return '';
}