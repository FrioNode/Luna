const { get } =require('../../colors/setup');
const { GroqAI } = require('../../colors/groq');
const models = ['llama-3.1-8b-instant', 'groq/compound-mini','qwen/qwen3-32b']; 


module.exports = {
    x: {
        type: 'utility',
        desc: 'Use Luna AI to answer questions or have a conversation',
        usage: 'ai <your question>',
        run: async (Luna, message, fulltext) => {
            const sender = message.key.remoteJid;
            const query = fulltext.split(' ').slice(1).join(' ').trim();
            
            if (!query) {
                return await Luna.sendMessage(sender, {
                    text: '❓ Please provide a question or prompt for the AI. Example: `ai What is the capital of France?`'
                }, { quoted: message });
            } 

            try {
                const GROQ_API_KEY = await get('GROQ');
                const aiProcessor = new GroqAI(GROQ_API_KEY);
                const response = await aiProcessor.processQuery(query, {
                    model_choice: models[1],
                    system_prompt: "You are Luna. Create engaging WhatsApp conversations."
                });
                
                const aiText = response?.[0]?.content?.parts?.[0]?.text;
                if (!aiText) {
                    throw new Error("No response from AI");
                }
                
                const reply = aiText.replace(/^["']|["']$/g, '').trim();
                await Luna.sendMessage(sender, {
                    text: `> 🤖 *Luna Response:*\n\n${reply}`
                }, { quoted: message });
                
            } catch (error) {
                console.error('AI Processing Error:', error.message);
                await Luna.sendMessage(sender, {
                    text: `⚠️ *Luna AI Error:*\n\n${error.message}\n\n💡 Get free key: console.groq.com/keys`
                }, { quoted: message });
            }
        },
    },
    sms: {
    type: 'utility',
    desc: 'Send an SMS via SMSMode API',
    usage: 'sms <phone_number> <message>',
    run: async (Luna, message, fulltext) => {
        const sender = message.key.remoteJid;
        const args = fulltext.split(' ').slice(1);
        const to = args.shift(); // first argument = phone number
        const text = args.join(' ').trim();

        if (!to || !text) {
            return await Luna.sendMessage(sender, {
                text: '❌ Usage: sms <phone_number> <message>\nExample: `sms 33600000001 Hello world`'
            }, { quoted: message });
        }

        try {
            const SMSMODE = await get('SMSMODE'); // your key stored safely
            const response = await fetch('https://rest.smsmode.com/sms/v1/messages', {
                method: 'POST',
                headers: {
                    'X-Api-Key': SMSMODE,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    recipient: { to },
                    body: { text }
                })
            });

            const data = await response.json();
            console.log('SMSMode Response:', data);
            if (response.ok) {
                await Luna.sendMessage(sender, {
                    text: `✅ SMS sent to ${to}!\nMessage ID: ${data?.messageId || 'N/A'}`
                }, { quoted: message });
            } else {
                throw new Error(data?.error?.message || 'Unknown SMSMode error');
            }

        } catch (error) {
            console.error('SMS Sending Error:', error.message);
            await Luna.sendMessage(sender, {
                text: `⚠️ Failed to send SMS:\n${error.message}`
            }, { quoted: message });
        }
    }
}

};
