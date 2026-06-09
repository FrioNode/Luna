const { Exp } = require('./schema');
const { RedisClient } = require("./redis");
const { get } = require('./setup');

const WARNING_LIMIT = 6;
const TEMPBAN_LIMIT = 9;
const KICK_LIMIT = 12;
const TEMPBAN_TIME = 60 * 5; // 5 minutes

let redis;

// Initialize Redis inside an async function
async function initRedis() {
    const redisurl = process.env.REDIS || await get('REDIS');
    redis = new RedisClient(redisurl);
}

// Call this before using trackUsage
async function trackUsage(Luna, message) {
    if (!redis) await initRedis(); // ensure redis is initialized

    const jid = message.key?.participant || message.key?.remoteJid;
    const sender = message.key?.remoteJid;
    if (!jid) return { shouldProceed: false };

    const keyCount = `msgcount:${jid}`;
    const keyStrike = `strikes:${jid}`;
    const keyBan = `tempban:${jid}`;

    const isBanned = await redis.ttl(keyBan);
    if (isBanned > 0) {
        await Luna.sendMessage(sender, {
            text: `⛔ You are temporarily banned. Try again in ${isBanned} seconds.`
        }, { quoted: message });
        return { shouldProceed: false, action: "still_banned", timeLeft: isBanned };
    }

    let count = await redis.incr(keyCount);
    if (count === 1) await redis.expire(keyCount, 60);

    if (count > KICK_LIMIT) {
        const strikes = await redis.incr(keyStrike);
        if (strikes >= 3) {
            await Exp.findOneAndUpdate({ jid }, { isBanned: true }, { upsert: true });
            await Luna.updateBlockStatus(jid, "block");
            await Luna.sendMessage(sender, {
                text: "🚫 You have been permanently banned."
            }, { quoted: message });
            return { shouldProceed: false, action: "perm_ban" };
        }
        await redis.set(keyBan, "1", { EX: 60 * 30 });
        if (sender.endsWith("@g.us")) await Luna.groupParticipantsUpdate(sender, [jid], 'remove');
        await Luna.sendMessage(sender, {
            text: "⏳ You have been temporarily banned for 30 minutes."
        }, { quoted: message });
        return { shouldProceed: false, action: "30min_ban" };
    }

    if (count > TEMPBAN_LIMIT) {
        await redis.set(keyBan, "1", { EX: TEMPBAN_TIME });
        await redis.incr(keyStrike);
        await Luna.sendMessage(sender, {
            text: `⏳ You are temporarily banned for ${TEMPBAN_TIME / 60} minutes.`
        }, { quoted: message });
        return { shouldProceed: false, action: "temp_ban" };
    }

    if (count > WARNING_LIMIT) {
        await Luna.sendMessage(sender, {
            text: "⚠️ Warning: You are sending messages too fast!"
        }, { quoted: message });
        return { shouldProceed: true, action: "warning" };
    }

    await Exp.findOneAndUpdate(
        { jid },
        { $inc: { points: 1, messageCount: 1 } },
        { upsert: true }
    );

    return { shouldProceed: true };
}

module.exports = { trackUsage, initRedis };
