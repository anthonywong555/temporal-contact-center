/**
 * Imports
 */
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import twilio from 'twilio';

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

app.post('/voice', async (req, res) => {
  const {originalUrl, headers, body} = req;
  const { VoiceResponse } = twilio.twiml;

  const response = new VoiceResponse();
  response.say('Thank you for calling Temporal Support.');
  response.pause({
    length: 2
  });
  response.say('Please wait while I connect you to the next available agent.');

  const {CallSid, From, To} = body;

  // Kick Off a Temporal Workflow

  console.log(CallSid, From, To);
  res.send(response.toString());
});

app.listen(PORT, () => console.log(`Listening on ${PORT}.\nNode Environment is on ${process.env.NODE_ENV} mode.`));