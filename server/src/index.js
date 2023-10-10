/**
 * Imports
 */
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import twilio from 'twilio';
import { Connection, WorkflowClient } from '@temporalio/client';
import fs from 'fs';

export const ROUTING_ROUND_ROBIN = 'routing-round-robin';
export const ROUTING_FREE_FOR_ALL = 'routing-free-for-all';

/**
 * Clients
 */
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send("Hello World");
});

/**
 * Twilio Endpoint.
 */
app.post('/sms', async (req, res) => {
    const {originalUrl, headers, body} = req;

    if(process.env.NODE_ENV === 'production') {
        const twilioSignature = headers['x-twilio-signature'];
        const fullURL = `${process.env.PRODUCTION_URL}${originalUrl}`;

        const requestIsValid = twilio.validateRequestWithBody(
            process.env.TWILIO_AUTH_TOKEN,
            twilioSignature,
            fullURL,
            JSON.stringify(body)
        );

        if(!requestIsValid) {
            return res.status(403).send('Forbidden');
        }
    }

    res.send("<Response><Message></Message><Response/>");
});

app.post('/voice-status', async(req, res) => {
  const { body } = req;
  const {CallStatus, CallSid} = body;

  if(CallStatus) {
    try {
      // Signal the Workflow
      console.log(CallStatus);
      const temporalClient = await getTemporalClient(); 
      const handle = temporalClient.getHandle(CallSid);
      await handle.signal('updateCallStatus', CallStatus);
    } catch(e) {
      // Silent Fail
    }
  }

  res.send({"status": "ok"});
})

app.post('/voice', async (req, res) => {
  const {originalUrl, headers, body} = req;
  const { VoiceResponse } = twilio.twiml;

  const response = new VoiceResponse();
  response.say('Thank you for calling Temporal Support.');
  response.say('Please wait while I connect you to the next available agent.');
  response.play(process.env.TWILIO_HOLD_MUSIC);

  const {CallSid, From, To} = body;

  const Routing = To === process.env.TWILIO_FREE_FOR_ALL_PHONE_NUMBER ? ROUTING_FREE_FOR_ALL : ROUTING_ROUND_ROBIN;

  const temporalClient = await getTemporalClient(); 

  await temporalClient.start('taskWorkflow', {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE,
    workflowId: CallSid,
    args: [{CallSid, From, To, Routing}]
  });

  console.log(CallSid, From, To);
  res.send(response.toString());
});

const getTemporalClient = async () => {
  // Kick Off a Temporal Workflow
  const isMTLS = process.env.TEMPORAL_MTLS === 'true';
  let connection;

  if(isMTLS) {
    connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS,
        tls: {
            clientCertPair: {
                crt: fs.readFileSync(process.env.TEMPORAL_TLS_CERT),
                key: fs.readFileSync(process.env.TEMPORAL_TLS_KEY)
            }
        }
    });
  } else {
    connection = await Connection.connect();
  }

  const temporalClient = new WorkflowClient({
    connection,
    ...(isMTLS && { namespace: process.env.TEMPORAL_NAMESPACE })
  });
  
  return temporalClient;
}

app.listen(PORT, () => console.log(`Listening on ${PORT}.\nNode Environment is on ${process.env.NODE_ENV} mode.`));