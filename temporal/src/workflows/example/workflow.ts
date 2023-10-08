import { proxyActivities } from '@temporalio/workflow';
// Only import the activity types
import type * as activities from '../../sharable-activites/index';

const { greet } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

type Task = {
  CallSid: string,
  From: string,
  To: string
}

/** A workflow that simply calls an activity */
export async function taskWorkflow(task: Task): Promise<string> {
  console.log(task);
  return await greet('Hello World');
}