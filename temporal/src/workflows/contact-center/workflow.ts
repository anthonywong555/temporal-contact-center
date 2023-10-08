import { SearchAttributes, condition, proxyActivities, upsertSearchAttributes, workflowInfo, defineSignal, setHandler, sleep } from '@temporalio/workflow';
import { createTwilioActivites } from '../../sharable-activites/twilio/activites';
import { createTemporalActvites } from '../../sharable-activites/temporal/activites';
import { AgentAction, AgentWorkflowParams, Task } from './types';

const { twilioCallUpdate } = proxyActivities<ReturnType<typeof createTwilioActivites>>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3
  }
});

const { listWorkflowExecutions } = proxyActivities<ReturnType<typeof createTemporalActvites>>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3
  }
});

export const AgentActionSignal = defineSignal<[AgentAction]>('agentAction');

export const ROUTING_ROUND_ROBIN = 'routing-round-robin';
export const ROUTING_FREE_FOR_ALL = 'routing-free-for-all';

/** A workflow that simply calls an activity */
export async function taskWorkflow(task: Task): Promise<SearchAttributes> {
  // For Demo Sake
  await sleep('30 second');

  const { CallSid, Routing } = task;
  let acceptedAgent = '';
  let isAssigned = false;
  let twiml;

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
  // Ideally you want to do some data-dip.
  // For demo sake, we pass the routing in the Task.

  // Query for Active Agents
  const agentWorkflows = await listWorkflowExecutions({
    query: `ExecutionStatus = "Running" and WorkflowType='AgentWorkflow'`
  });

  console.log(agentWorkflows);

  if(!agentWorkflows.executions) {
    // There is no agent online.
    upsertSearchAttributes({
      TaskRouterState: ['Canceled']
    });

    twiml = "<Response><Say>I'm sorry. There's no agent. Please try calling back later. Have a good day.</Say></Response>";
    await twilioCallUpdate({ CallSid, twiml });
    return workflowInfo().searchAttributes;
  }

  // Create Reserve Workflow
  if(Routing === ROUTING_FREE_FOR_ALL) {
    
  } else if(Routing === ROUTING_ROUND_ROBIN) {
    
  }

  return workflowInfo().searchAttributes;

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

  //return workflowInfo().searchAttributes;
}

export async function taskReservedWorkflow(task: Task): Promise<String> {

  return '';
}

export async function agentWorkflow(agent: AgentWorkflowParams): Promise<null> {
  await sleep('120 minute');
  return null;
}