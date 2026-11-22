// First Sarvam chat call: copy fields out of a Marathi 7/12 line.
// Run: node --env-file=.env scripts/sarvam-first-call.mjs
import { SarvamAIClient } from 'sarvamai';

const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });

const res = await client.chat.completions({
  model: 'sarvam-105b',
  reasoning_effort: null, // reasoning off: fast, and no tokens spent thinking
  temperature: 0,
  max_tokens: 300,
  messages: [
    { role: 'system', content: 'You copy text exactly. Output only JSON.' },
    {
      role: 'user',
      content:
        'From this 7/12 extract line, return {"village":..,"survey_no":..,"area":..} copying values exactly as written:\n' +
        'गाव : अजनी, तालुका : नागपूर (शहर), भूमापन क्रमांक : ११२/२, क्षेत्र : ०.०१६७ हे.आर',
    },
  ],
});

console.log('model:', res.model);
console.log('answer:', res.choices[0].message.content);
console.log('tokens:', JSON.stringify(res.usage));
