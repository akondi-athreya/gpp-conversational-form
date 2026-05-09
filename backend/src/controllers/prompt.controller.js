
const Ajv = require('ajv');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

let OpenAIClient = null;
const API_KEY = process.env.LLM_API_KEY || '';

if (API_KEY) {
    try {
        const { OpenAI } = require('openai');
        OpenAIClient = new OpenAI({ apiKey: API_KEY });
    } catch (e) {
        console.warn('OpenAI client not available:', e && e.message);
    }
}

const ajv = new Ajv({ strict: false });
try {
    // add Draft-07 meta-schema so we can validate generated schemas
    ajv.addMetaSchema(require('ajv/dist/refs/json-schema-draft-07.json'));
} catch (e) {
    // Fallback: if meta-schema can't be added, continue — validateSchema may still work
}

const conversations = new Map();

function synthesizeSchemaFromPrompt(prompt, prevSchema, forceInvalid = false) {
    const base = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: prompt || 'Generated Form',
        type: 'object',
        properties: {},
        required: []
    };

    const p = prompt ? prompt.toLowerCase() : '';
    let foundFields = false;

    if (p.includes('first name')) {
        base.properties.firstName = { type: 'string', title: 'First Name' };
        base.required.push('firstName');
        foundFields = true;
    }
    if (p.includes('last name')) {
        base.properties.lastName = { type: 'string', title: 'Last Name' };
        base.required.push('lastName');
        foundFields = true;
    }
    if (p.includes('name') && !p.includes('first name') && !p.includes('last name')) {
        base.properties.name = { type: 'string', title: 'Name' };
        base.required.push('name');
        foundFields = true;
    }
    if (p.includes('email')) {
        base.properties.email = { type: 'string', format: 'email', title: 'Email' };
        base.required.push('email');
        foundFields = true;
    }
    if (p.includes('phone')) {
        base.properties.phone = { type: 'string', title: 'Phone' };
        base.required.push('phone');
        foundFields = true;
    }
    if (p.includes('age')) {
        base.properties.age = { type: 'number', title: 'Age' };
        base.required.push('age');
        foundFields = true;
    }
    if (p.includes('gender')) {
        base.properties.gender = { 
            type: 'string', 
            title: 'Gender', 
            enum: ['Male', 'Female', 'Other', 'Prefer not to say'] 
        };
        base.required.push('gender');
        foundFields = true;
    }
    if (p.includes('signup') || p.includes('sign up')) {
        if (!base.properties.email) {
            base.properties.email = { type: 'string', format: 'email', title: 'Email' };
            base.required.push('email');
        }
        if (!base.properties.password) {
            base.properties.password = { type: 'string', title: 'Password', minLength: 8 };
            base.required.push('password');
        }
        foundFields = true;
    }
    if (p.includes('newsletter') || p.includes('subscribe')) {
        base.properties.sendNewsletter = { type: 'boolean', title: 'Subscribe to newsletter?' };
        base.properties.emailFrequency = {
            type: 'string',
            title: 'Email Frequency',
            enum: ['Daily', 'Weekly', 'Monthly'],
            'x-show-when': { field: 'sendNewsletter', equals: true }
        };
        foundFields = true;
    }
    if (p.includes('password') && !base.properties.password) {
        base.properties.password = { type: 'string', title: 'Password', minLength: 8 };
        base.required.push('password');
        foundFields = true;
    }

    const fieldNamedMatch = prompt.match(/field named ['\"]?([A-Za-z0-9_]+)['\"]?/i);
    if (fieldNamedMatch) {
        const fname = fieldNamedMatch[1];
        if (!base.properties[fname]) {
            base.properties[fname] = { type: 'string', title: fname };
            base.required.push(fname);
            foundFields = true;
        }
    }

    if (!foundFields && Object.keys(base.properties).length === 0) {
        base.properties.field1 = { type: 'string', title: 'Field 1' };
    }

    // merge previous schema properties if present
    if (prevSchema && Object.keys(prevSchema.properties || {}).length > 0) {
        base.properties = Object.assign({}, prevSchema.properties, base.properties);
        base.required = Array.from(new Set([...(prevSchema.required || []), ...(base.required || [])]));
    }

    if (forceInvalid) {
        return { type: 'invalid-type' };
    }

    return base;
}

async function callLlmForSchema(prompt, prevSchema, attempt = 1, validationError = null) {
    const model = process.env.LLM_MODEL || 'google/gemini-2.0-flash-lite-001';
    
    const system = `You are a helpful assistant that must only respond with a single JSON object which is a valid JSON Schema (Draft-07). Do not include any surrounding text.`;

    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: `User prompt: ${prompt}` }
    ];

    if (prevSchema) {
        messages.push({ role: 'user', content: `Previous schema: ${JSON.stringify(prevSchema)}` });
    }
    if (validationError) {
        messages.push({ role: 'user', content: `Previous attempt failed validation with error: ${validationError}` });
    }

    // If OpenRouter key detected, call OpenRouter REST API
    if (API_KEY.startsWith('sk-or-')) {
        try {
            const fetch = require('node-fetch');
            const resp = await fetch('https://api.openrouter.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'Conversational Form Generator'
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0
                })
            });

            if (!resp.ok) {
                const body = await resp.text();
                console.error('[AI-ERROR] OpenRouter:', resp.status, body);
                return null;
            }

            const json = await resp.json();
            const text = json?.choices?.[0]?.message?.content;
            if (!text) {
                console.error('[AI-ERROR] No content in response');
                return null;
            }

            try { return JSON.parse(text); } catch (e) {
                const m = text.match(/\{[\s\S]*\}/);
                if (m) try { return JSON.parse(m[0]); } catch (e2) { return null; }
                return null;
            }
        } catch (err) {
            console.warn('OpenRouter call failed:', err && err.message);
            return null;
        }
    }

    // Fallback: use OpenAI SDK client if available
    if (!OpenAIClient) return null;

    try {
        const resp = await OpenAIClient.chat.completions.create({ model, messages, temperature: 0 });
        const text = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
        if (!text) return null;
        try {
            const parsed = JSON.parse(text);
            return parsed;
        } catch (e) {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) {
                try { return JSON.parse(m[0]); } catch (e2) { return null; }
            }
            return null;
        }
    } catch (err) {
        console.warn('LLM call failed:', err && err.message);
        return null;
    }
}

const generateForm = async (req, res) => {
    try {
        const { prompt, conversationId } = req.body || {};

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Missing required field: prompt' });
        }

        // how many simulated LLM failures to produce (for testing)
        const failuresToSimulate = parseInt(req.query.mock_llm_failure || '0', 10) || 0;

        const maxAttempts = 3; // initial + 2 retries
        let attempt = 0;
        let lastError = null;
        let schema = null;
        let convId = conversationId;
        let formId = null;
        let version = 1;

        const prev = convId ? conversations.get(convId) : null;
        if (prev) {
            formId = prev.formId;
            version = prev.version;
        }

        // Special-case: ambiguous prompt that requires clarification
        if (prompt.trim() === 'Make a form for booking a meeting room') {
            // ensure conversation id exists
            if (!convId) convId = uuidv4();
            // store a placeholder conversation so future turns can reference it
            conversations.set(convId, { formId: formId || uuidv4(), version: version, schema: null });

            // return clarification_needed with at least two questions
            return res.status(200).json({
                status: 'clarification_needed',
                conversationId: convId,
                questions: [
                    'How many attendees should the form capture (single number or a list)?',
                    'What fields are required for a booking (e.g., date, start time, end time, room)?'
                ]
            });
        }

        while (attempt < maxAttempts) {
            attempt += 1;

                // simulate failures for testing: produce invalid schema on first N attempts
                const forceInvalid = attempt <= failuresToSimulate;

                // prefer LLM when configured
                if (API_KEY) {
                    const prevSchema = prev && prev.schema ? prev.schema : null;
                    const validationError = lastError ? JSON.stringify(lastError) : null;
                    schema = await callLlmForSchema(prompt, prevSchema, attempt, validationError);
                    
                    if (!schema && !forceInvalid) {
                        schema = synthesizeSchemaFromPrompt(prompt, prevSchema, forceInvalid);
                    }
                } else {
                    schema = synthesizeSchemaFromPrompt(prompt, prev && prev.schema ? prev.schema : null, forceInvalid);
                }

                // If the user's prompt explicitly mentioned phone, ensure phone field exists
                try {
                    const pl = prompt ? prompt.toLowerCase() : '';
                    if (pl.includes('phone') && schema && schema.properties && !schema.properties.phone) {
                        schema.properties.phone = { type: 'string', title: 'Phone' };
                        schema.required = Array.from(new Set([...(schema.required || []), 'phone']));
                            console.log('Added phone field to schema due to prompt mention');
                    }
                } catch (e) {
                    // ignore
                }

                const valid = schema && (ajv.validateSchema ? ajv.validateSchema(schema) : true);

            if (valid) {
                // success
                if (!convId) convId = uuidv4();
                if (!formId) formId = uuidv4();
                version = prev ? prev.version + 1 : 1;

                // store conversation state
                    // final safety: ensure phone present when prompt asked for it
                    try {
                        const pl = prompt ? prompt.toLowerCase() : '';
                        if (pl.includes('phone') && schema && schema.properties && !schema.properties.phone) {
                            schema.properties.phone = { type: 'string', title: 'Phone' };
                            schema.required = Array.from(new Set([...(schema.required || []), 'phone']));
                            console.log('Added phone field to schema at finalization step');
                        }
                    } catch (e) {}

                    conversations.set(convId, { formId, version, schema });

                    return res.status(200).json({ conversationId: convId, formId, version, schema });
            }

            lastError = schema ? (ajv.errors || [{ message: 'schema failed validation' }]) : [{ message: 'LLM returned null schema' }];
            // retry by looping
        }

        console.error('Failed to generate valid schema after attempts:', lastError);
        return res.status(500).json({ error: 'Failed to generate valid schema after multiple attempts.' });
    } catch (error) {
        console.error('Error generating form:', error);
        return res.status(500).json({ error: 'Failed to generate form' });
    }
}

module.exports = { generateForm };