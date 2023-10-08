import { proxyActivities, sleep } from '@temporalio/workflow';
import { createTwilioActivites } from '../../sharable-activites/twilio/activites'

const { twilioCallUpdate } = proxyActivities<ReturnType<typeof createTwilioActivites>>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3
  }
});

type Task = {
  CallSid: string,
  From: string,
  To: string
}

/** A workflow that simply calls an activity */
export async function taskWorkflow(task: Task): Promise<string> {
  const { CallSid } = task;
  await sleep('15 second');
  // Front-End Work
  
  // Connect the Call
  const twiml = '<Response><Dial>+155555555</Dial></Response>';
  const result = await twilioCallUpdate({ CallSid, twiml });
  console.log(result);
  return "";
}