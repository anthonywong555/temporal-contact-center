import { SearchAttributes, condition, proxyActivities, upsertSearchAttributes, workflowInfo, defineSignal, setHandler, sleep, startChild, getExternalWorkflowHandle, CancellationScope, CancelledFailure, defineQuery, continueAsNew } from '@temporalio/workflow';
import { createTwilioActivites } from '../../sharable-activites/twilio/activites';
import { createTemporalActvites } from '../../sharable-activites/temporal/activites';
import { AgentStatus, CallStatus, CustomerAgentWorkflowParams, Task, Agent, CallPoolWorkflowParams, Call } from './types';

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
  const {CallSid, From, TemporalTaskQueue, CallDelay} = task;
  let assignedAgent:Agent;
  let isAssign = false;
  let isCompleted = false;
  let twiml = '';

  if(CallDelay) {
    // Sleeping for demo
    await sleep(CallDelay);
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

export async function customerAgentWorkflow(payload: CustomerAgentWorkflowParams): Promise<void> {
  const { customer, agent } = payload;
  const { sid } = customer;
  const { name, number } = agent;
  let twiml = `<Response><Say>You will now speak to ${name}.</Say><Dial>${number}</Dial></Response>`;
  await twilioCallUpdate({ CallSid: sid, twiml });
}

/**
 * Queries 
 */
export const getAvailableAgentsQuery = defineQuery<Array<Agent> | undefined>('available_agents');
export const getAgentsQuery = defineQuery<Array<Agent> | undefined>('agents');
export const getCallsQuery = defineQuery<Array<Call | undefined>>('calls');

/**
 * Signals
 */
export const addAgentSignal = defineSignal<[Agent]>('addAgent');
export const removeAgentSignal = defineSignal<[Agent]>('removeAgent');
export const addPendingCallSignal = defineSignal<[Call]>('addPendingCall');
export const updateCallSignal = defineSignal<[Call]>('updateCall');

export async function callPoolWorkflow({agents, calls}: CallPoolWorkflowParams = {agents: [], calls : []}): Promise<void> {
  let shouldContinueAsNew = false;

  /**
   * Queries
   */
  setHandler(getAvailableAgentsQuery, () => {
    return agents?.filter((anAgent) => anAgent.status === AgentStatus.available);
  });

  setHandler(getAgentsQuery, () => {
    return agents;
  });
  
  setHandler(getCallsQuery, () => {
    if(!calls) {
      calls = [];
    }

    return calls;
  });

  /**
   * Signals
   */
  setHandler(addAgentSignal, async (anAgent: Agent) => {
    if(!agents) {
      agents = [];
    }

    // Set the default agent to be available.
    anAgent.status = anAgent.status ? anAgent.status : AgentStatus.available; 

    if(agents.find((existingAgent) => existingAgent.name === anAgent.name && existingAgent.number === anAgent.number)) {
      // Updating existing Agent to be Available
      agents = agents.map((existingAgent) => {
        if(existingAgent.name === anAgent.name && existingAgent.number === anAgent.number) {
          existingAgent.status = AgentStatus.available;
        }
        
        return existingAgent;
      });
    } else {
      // Add new Agent
      agents = [...agents, anAgent];
    }

    const pendingCalls = calls?.filter((aCall) => aCall.status === CallStatus.pending);
    const availableAgents = agents.filter((anAgent) => anAgent.status === AgentStatus.available);
    
    if(pendingCalls && pendingCalls.length != 0) {
      // Matching
      const targetAgent = availableAgents[Math.floor(Math.random() * availableAgents.length)];
      agents = agents?.map((anAgent) => {
        if(anAgent.name == targetAgent?.name && anAgent.number == targetAgent?.number) {
          anAgent.status = AgentStatus.busy
        }
         return anAgent;
      });

      const targetCall = pendingCalls[Math.floor(Math.random() * pendingCalls.length)];
      calls = calls?.map((aCall) => {
        if(aCall.sid == targetCall?.sid) {
          aCall.status = CallStatus.active;
          aCall.agent = targetAgent.name;
        }
        return aCall;
      });


      const callWorkflowHandle = getExternalWorkflowHandle(targetCall.sid);
      await callWorkflowHandle.signal(agentAssignSignal, targetAgent);

      shouldContinueAsNew = workflowInfo().continueAsNewSuggested;
    }
  });

  setHandler(removeAgentSignal, (anAgent: Agent) => {
    const { name } = anAgent;
    agents = agents?.filter((anAgent) => anAgent.name != name);

    shouldContinueAsNew = workflowInfo().continueAsNewSuggested;
  });

  setHandler(addPendingCallSignal, async (aCall: Call) => {
    if(!calls) {
      calls = [];
    }

    calls = [...calls, aCall];

    const pendingCalls = calls?.filter((aCall) => aCall.status === CallStatus.pending);
    const availableAgents = agents?.filter((anAgent) => anAgent.status === AgentStatus.available);

    if(availableAgents && availableAgents.length != 0) {
      // Matching
      const targetAgent = availableAgents[Math.floor(Math.random() * availableAgents.length)];
      agents = agents?.map((anAgent) => {
        if(anAgent.name == targetAgent?.name && anAgent.number == targetAgent?.number) {
          anAgent.status = AgentStatus.busy
        }
         return anAgent;
      });

      const targetCall = pendingCalls[Math.floor(Math.random() * pendingCalls.length)];
      calls = calls.map((aCall) => {
        if(aCall.sid == targetCall?.sid) {
          aCall.status = CallStatus.active;
          aCall.agent = targetAgent.name;
        }
        return aCall;
      });

      const callWorkflowHandle = getExternalWorkflowHandle(targetCall.sid);
      await callWorkflowHandle.signal(agentAssignSignal, targetAgent);

      shouldContinueAsNew = workflowInfo().continueAsNewSuggested;
    }
  });

  setHandler(updateCallSignal, (targetCall: Call) => {
    calls = calls?.map((aCall) => {
      if(aCall.sid == targetCall.sid) {
        aCall = targetCall;
      }
      return aCall;
    });

    shouldContinueAsNew = workflowInfo().continueAsNewSuggested;
  })

  await condition(() => shouldContinueAsNew, '1 Day');
  await continueAsNew<typeof callPoolWorkflow>({agents, calls});
}