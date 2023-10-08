import 'dotenv/config';
import fs from 'fs';

import { Worker, NativeConnection, Runtime } from '@temporalio/worker';
import { Connection, WorkflowClient } from '@temporalio/client';
import { getDataConverter } from './encryption/data-converter';
import * as activities from './sharable-activites/index';

/**
 * Twilio
 */
import { createTwilioActivites } from './sharable-activites/twilio/activites';
import { TwilioClient } from './sharable-activites/twilio/client'

/**
 * Temporal
 */
import { createTemporalActvites } from './sharable-activites/temporal/activites';
import { TemporalClient } from './sharable-activites/temporal/client';

/**
 * Run a Worker with an mTLS connection, configuration is provided via environment variables.
 * Note that serverNameOverride and serverRootCACertificate are optional.
 */
async function run({
  address,
  namespace,
  clientCertPath,
  clientKeyPath,
  serverNameOverride,
  serverRootCACertificatePath,
  taskQueue,
  isMTLS,
  isEncryption
}: Env) {
  let serverRootCACertificate: Buffer | undefined = undefined;
  if (serverRootCACertificatePath) {
    serverRootCACertificate = fs.readFileSync(serverRootCACertificatePath);
  }

  Runtime.install({
    telemetryOptions: {
      metrics: {
        prometheus: {
          bindAddress: '0.0.0.0:9555'
        }
      }
    }
  });

  const connectionOption = 
    process.env.NODE_ENV === 'production' || isMTLS
    ? 
      {
        address,
        tls: {
          serverNameOverride,
          serverRootCACertificate,
          // See docs for other TLS options
          clientCertPair: {
            crt: fs.readFileSync(clientCertPath),
            key: fs.readFileSync(clientKeyPath),
          },
        },
      }
    : {};

  const connection = await NativeConnection.connect(connectionOption);

  const workflowOption = () =>
  process.env.NODE_ENV === 'production'
    ? {
        workflowBundle: {
          codePath: require.resolve('./workflow-bundle.js'),
        },
      }
    : { workflowsPath: require.resolve('./workflows/index') };
  
  const targetNamespace = isMTLS ? namespace : 'default';

  /**
   * Twilio
   */
  const {TWILIO_ACCOUNT_SID = '', TWILIO_API_KEY = '', TWILIO_API_KEY_SECRET = '', TWILIO_DEFAULT_PHONE_NUMBER=''} = process.env;
  const twilioClient = new TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_KEY_SECRET, TWILIO_DEFAULT_PHONE_NUMBER);
  const twilioActivites = createTwilioActivites(twilioClient);

  /**
   * Temporal
   */
  const temporalConnection = await Connection.connect(connectionOption);
  const temporalWorkflowClient = new WorkflowClient({
    connection: temporalConnection,
    ...(isMTLS && { namespace: targetNamespace })
  });

  const temporalClient = new TemporalClient(temporalWorkflowClient, temporalConnection, targetNamespace);
  const temporalActivites = createTemporalActvites(temporalClient);

  const worker = await Worker.create({
    connection,
    activities: {...activities, ...twilioActivites, ...temporalActivites},
    taskQueue,
    namespace: targetNamespace,
    ...workflowOption(),
    ...(isEncryption && { dataConverter: await getDataConverter() })
  });
  console.log('Worker connection successfully established');

  await worker.run();
  await connection.close();
}

run(getEnv()).catch((err) => {
  console.error(err);
  process.exit(1);
});

// Helpers for configuring the mTLS client and worker samples
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ReferenceError(`${name} environment variable is not defined`);
  }
  return value;
}

export interface Env {
  address: string;
  namespace: string;
  clientCertPath: string;
  clientKeyPath: string;
  serverNameOverride?: string;
  serverRootCACertificatePath?: string;
  taskQueue: string;
  isMTLS: boolean;
  isEncryption?: boolean;
}

export function getEnv(): Env {
  return {
    address: requiredEnv('TEMPORAL_ADDRESS'),
    namespace: requiredEnv('TEMPORAL_NAMESPACE'),
    clientCertPath: requiredEnv('TEMPORAL_TLS_CERT'),
    clientKeyPath: requiredEnv('TEMPORAL_TLS_KEY'),
    serverNameOverride: process.env.TEMPORAL_SERVER_NAME_OVERRIDE,
    serverRootCACertificatePath: process.env.TEMPORAL_SERVER_ROOT_CA_CERT_PATH,
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'hello-world-mtls',
    isMTLS: process.env.TEMPORAL_MTLS === 'true',
    isEncryption: process.env.TEMPORAL_ENCRYPTION === 'true',
  };
}
