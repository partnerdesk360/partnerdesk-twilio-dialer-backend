require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false })); // <-- Critical for Twilio webhooks!

// In-memory logs for demo (replace with DB for production)
let logs = [];

// Test endpoint
app.get('/', (req, res) => {
  res.send('Dialer backend is running!');
});

// Outbound call endpoint
app.post('/call', async (req, res) => {
  const { phone, agent } = req.body;
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

  try {
    const call = await client.calls.create({
      to: phone,
      from: process.env.TWILIO_NUMBER,
      twiml: `<Response><Say>Hello from your Bitrix dialer! This is a test call for ${agent}.</Say></Response>`
    });

    logs.push({
      type: 'call',
      to: phone,
      agent,
      sid: call.sid,
      time: new Date().toISOString()
    });

    res.json({ status: 'success', sid: call.sid });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Outbound SMS endpoint
app.post('/sms/send', async (req, res) => {
  const { phone, message, agent } = req.body;
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

  try {
    const sms = await client.messages.create({
      to: phone,
      from: process.env.TWILIO_NUMBER,
      body: message
    });

    logs.push({
      type: 'sms',
      to: phone,
      agent,
      message,
      sid: sms.sid,
      time: new Date().toISOString()
    });

    res.json({ status: 'success', sid: sms.sid });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Inbound SMS webhook endpoint
app.post('/sms/receive', (req, res) => {
  const { From, Body, To } = req.body;

  logs.push({
    type: 'inbound_sms',
    from: From,
    to: To,
    message: Body,
    time: new Date().toISOString()
  });

  res.type('text/xml');
  res.send(`
    <Response>
      <Message>Thank you for your message! We'll get back to you soon.</Message>
    </Response>
  `);
});

// Sequential inbound voice call webhook endpoint
app.post('/voice/incoming', (req, res) => {
  const numbers = process.env.FORWARD_TO_NUMBER.split(',');
  const twiml = new twilio.twiml.VoiceResponse();

  // Dial first number, set action to /voice/next to handle fallback
  twiml.dial({ action: '/voice/next', timeout: 20 }, numbers[0]);

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/voice/next', (req, res) => {
  const numbers = process.env.FORWARD_TO_NUMBER.split(',');
  const callStatus = req.body.DialCallStatus;
  const twiml = new twilio.twiml.VoiceResponse();

  // If call wasn't answered and second number exists, dial second number
  if (callStatus !== 'completed' && numbers[1]) {
    twiml.dial(numbers[1]);
  } else {
    twiml.say('Sorry, no one is available to take your call.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Call recording completed webhook endpoint
app.post('/recording/completed', (req, res) => {
  const { CallSid, RecordingUrl } = req.body;

  logs.push({
    type: 'call_recording',
    callSid: CallSid,
    recordingUrl: RecordingUrl,
    time: new Date().toISOString()
  });

  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
