import { SearchAttributes, condition, proxyActivities, upsertSearchAttributes, workflowInfo, defineSignal, setHandler, sleep, getExternalWorkflowHandle } from '@temporalio/workflow';
import { createTwilioActivites } from '../../sharable-activites/twilio/activites';
import { createTemporalActvites } from '../../sharable-activites/temporal/activites';
import { CallStatus, Task, Agent } from './types';
import { addPendingCallSignal, addAgentSignal, updateCallSignal } from './callPoolWorkflow';

const { twilioCallUpdate } = proxyActivities<ReturnType<typeof createTwilioActivites>>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 1
  }
});

const { signalWithStart } = proxyActivities<ReturnType<typeof createTemporalActvites>>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3
  }
});

const CALL_POOL_WORKFLOW_ID = 'call-pool';

export const agentAssignSignal = defineSignal<[Agent]>('agentAssign');
export const updateCallStatusSignal = defineSignal<[string]>('updateCallStatus');
//export const ROUTING_ROUND_ROBIN = 'routing-round-robin';
//export const ROUTING_FREE_FOR_ALL = 'routing-free-for-all';

export async function taskWorkflow(task: Task): Promise<SearchAttributes> {
  const { workflowId } = workflowInfo();
  const {CallSid, From, TemporalTaskQueue, isCallDelay} = task;
  let assignedAgent:Agent;
  let isAssign = false;
  let isCompleted = false;
  let twiml = '';

  if(isCallDelay) {
    // Sleeping for demo
    await sleep('10 sec');
  }

  upsertSearchAttributes({
    Call_Status: ['pending']
  });

  // Let the Call Pool Know that there's an available Call.
  await signalWithStart('callPoolWorkflow', {
    workflowId: CALL_POOL_WORKFLOW_ID,
    // Pass the Taskqueue 
    taskQueue: TemporalTaskQueue,
    signal: addPendingCallSignal,
    signalArgs: [{status: CallStatus.pending, sid: workflowId, caller: From}]
  });

  setHandler(agentAssignSignal, async (anAgent: Agent) => {
    isAssign = true;
    assignedAgent = anAgent;

    const { name, number } = anAgent;

    upsertSearchAttributes({
      Agent: [name],
      Call_Status: ['active']
    });

    let twiml = `<Response><Say>You will now speak to ${name}.</Say><Dial>${number}</Dial></Response>`;
    await twilioCallUpdate({ CallSid, twiml });
  });

  setHandler(updateCallStatusSignal, async (callstatus: string) => {
    if(callstatus === 'completed') {
      
      // Agent is now free.
      const callPoolHandle = getExternalWorkflowHandle(CALL_POOL_WORKFLOW_ID);
      const agentName = assignedAgent ? assignedAgent.name  : '';

      if(assignedAgent) {
        await callPoolHandle.signal(addAgentSignal, assignedAgent);
      }

      await callPoolHandle.signal(updateCallSignal, {
        sid: workflowId, 
        agent: agentName,
        status: CallStatus.completed,
        caller: From
      });

      isCompleted = true;
    }
  })

  if(await condition(() => isCompleted, '5 min')) {
    upsertSearchAttributes({
      Call_Status: ['completed']
    });
  } else {
    // Update the customer that there are no available agents.
    twiml = `<Response><Say>Sorry. It looks like all other agents are busy. Please try again later.</Say></Response>`;
    try {
      await twilioCallUpdate({ CallSid, twiml });
    } catch(e) {
      console.log(`Soft Error: ${e}`);
    }
  }

  return workflowInfo().searchAttributes;
}