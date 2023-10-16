import { condition, workflowInfo, defineSignal, setHandler, getExternalWorkflowHandle, defineQuery, continueAsNew } from '@temporalio/workflow';
import { AgentStatus, CallStatus, Agent, CallPoolWorkflowParams, Call } from './types';
import { agentAssignSignal } from './taskWorkflow';

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