import { SearchAttributes, condition, proxyActivities, upsertSearchAttributes, workflowInfo, defineSignal, setHandler, sleep, startChild, getExternalWorkflowHandle, CancellationScope,
  CancelledFailure, defineQuery } from '@temporalio/workflow';
import { createTwilioActivites } from '../../sharable-activites/twilio/activites';
import { createTemporalActvites } from '../../sharable-activites/temporal/activites';
import { AgentAction, AgentWorkflowParams, Task, TaskReservedWorkflowParams } from './types';

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
  const { workflowId } = workflowInfo();

  // For Demo Sake
  await sleep('30 second');

  const { CallSid, Routing } = task;
  let acceptedAgent = '';
  let gotAgentAction = false;
  let isAssigned = false;
  let twiml;
  let targetAgentPhoneNumber ;

  // Signal Handler
  setHandler(AgentActionSignal, ({ agentId, isAccept, isTimeout, agentPhoneNumber }: AgentAction) => {
    gotAgentAction = true;

    if(!isAssigned && isAccept) {
      // An Agent Accepted this Task.
      isAssigned = true;
      acceptedAgent = agentId;
      targetAgentPhoneNumber = agentPhoneNumber;

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
    query: `ExecutionStatus = "Running" and WorkflowType='agentWorkflow'`
  });

  if(!agentWorkflows.executions) {
    // There is no agent online.
    upsertSearchAttributes({
      TaskRouterState: ['Canceled']
    });

    twiml = "<Response><Say>I'm sorry. There's no agent. Please try calling back later. Have a good day.</Say></Response>";
    await twilioCallUpdate({ CallSid, twiml });
    return workflowInfo().searchAttributes;
  }

  // Set the Task State.
  upsertSearchAttributes({
    TaskRouterState: ['Reserved']
  });

  let reservesWorkflows: any[] = [];

  // Create Reserve Workflow
  if(Routing === ROUTING_FREE_FOR_ALL) {
    // Create Child Workflows for all the active agents
    reservesWorkflows = agentWorkflows.executions.map(async (anExecution) => {
      const agentId = anExecution.execution.workflowId;
      return await startChild(taskReservedWorkflow, {
        args: [{
          CallSid: workflowId,
          agentId: agentId
        }],
        workflowId: `${workflowId}-${agentId}-reserve`,
        searchAttributes: {
          'TaskRouterAgent': [agentId]
        }
      });
    });

    await Promise.all(reservesWorkflows);
    await condition(() => isAssigned, '5 minute');
  } else if(Routing === ROUTING_ROUND_ROBIN) {
    // Create a Child Workflow for an agent
    const {executions} = agentWorkflows;
    for(const anAgentWorkflow of executions) {
      console.log(`anAgentWorkflow`, anAgentWorkflow);
      const agentId = anAgentWorkflow.execution.workflowId;
      const agentReservedWorkflow = await startChild(taskReservedWorkflow, {
        args: [{
          CallSid: workflowId,
          agentId: agentId
        }],
        workflowId: `${workflowId}-${agentId}-reserve`,
        searchAttributes: {
          'TaskRouterAgent': [agentId]
        }
      });

      await condition(() => gotAgentAction, '5 minute');

      if(isAssigned) {
        // Agent pick up the task.
        reservesWorkflows = [...reservesWorkflows, agentReservedWorkflow];
        break;
      } else {
        gotAgentAction = false;
        // Terminal the child workflow.
        const handle = getExternalWorkflowHandle(agentReservedWorkflow.workflowId);
        try {
          await handle.cancel();
        } catch(e) {
          console.log(`ERROR MESSAGE:`);
          console.log(e);
        }
      }
    }
  }
  
  if(isAssigned) {
    // Terminate reserve workflows
    await Promise.all(reservesWorkflows.map(async (aReservedWorkflow) => {
      const { workflowId } = await aReservedWorkflow;
      const handle = getExternalWorkflowHandle(workflowId);
      try {
        return await handle.cancel();
      } catch(e) {
        console.log(`ERROR MESSAGE:`);
        console.log(e);
      }
    }));

    // Connect the Call
    twiml = `<Response><Say>You will now speak to ${acceptedAgent}.</Say><Dial>${targetAgentPhoneNumber}</Dial></Response>`;
    const result = await twilioCallUpdate({ CallSid, twiml });
  } else {
    twiml = `<Response><Say>Sorry. It looks like all other agents are busy. Please try again later.</Say></Response>`;
    await twilioCallUpdate({ CallSid, twiml });
    // Time has elapsed!
    upsertSearchAttributes({
      TaskRouterState: ['Canceled']
    });
  }

  return workflowInfo().searchAttributes;
}

export const getCallSidQuery = defineQuery<string>('getCallSid');

export async function taskReservedWorkflow(task: TaskReservedWorkflowParams): Promise<void> {
  // Timers and Activities are automatically cancelled when their containing scope is cancelled.
  try {
    await CancellationScope.cancellable(async () => {
      const { CallSid, agentId } = task;

      setHandler(getCallSidQuery, () => CallSid);
      await sleep('120 minute');
    });
  } catch (e) {
    if (e instanceof CancelledFailure) {
      console.log('Timer cancelled 👍');
    } else {
      throw e; // <-- Fail the workflow
    }
  }
}

export async function agentWorkflow(agent: AgentWorkflowParams): Promise<null> {
  await sleep('120 minute');
  return null;
}