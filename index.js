const express = require('express');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');
const axios = require('axios');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// User settings store (On/Off features memory)
const userSettings = {};

app.get('/pair', async (req, res) => {
    let num = req.query.number;
    if (!num) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    num = num.replace(/[^0-9]/g, '');
    const sessionDir = `./sessions/${num}`;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04']
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(num);
            const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
            res.json({ code: formattedCode });
        } else {
            res.json({ message: 'Device already paired!' });
        }

        sock.ev.on('creds.update', saveCreds);

        // Connection Event: Send Photo + Welcome Message when connected
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`Connected: ${num}`);
                
                // Initialize settings for this user
                userSettings[num] = {
                    autoStatusView: true,
                    autoStatusLike: true,
                    antiDelete: true
                };

                // මෙන්න මෙතනට ඔයාගේ Direct Image URL එක දාන්න!
                const myImageUrl = 'https://i.ibb.co/YOUR_IMAGE_LINK_HERE.jpg'; 

                try {
                    await sock.sendMessage(sock.user.id, {
                        image: { url: myImageUrl },
                        caption: `✅ *BOT CONNECTED SUCCESSFULLY!*\n\n` +
                                 `🤖 *Bot Name:* Lasindu Mini Bot\n` +
                                 `⚡ *Status:* Online & Active 24/7\n` +
                                 `Type \`.menu\` to see interactive features.\n\n` +
                                 `> *Powered by Lasindu 66*`
                    });
                } catch (e) {
                    // Fallback to text if image URL fails
                    await sock.sendMessage(sock.user.id, {
                        text: `✅ *BOT CONNECTED SUCCESSFULLY!*\n\nType \`.menu\` to view features.\n\n> *Powered by Lasindu 66*`
                    });
                }
            }
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
            }
        });

        // Status Auto-View and Auto-Like / Commands handler
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;

            const remoteJid = msg.key.remoteJid;

            // 1. Auto Status View & Like Handler
            if (remoteJid === 'status@broadcast') {
                if (userSettings[num]?.autoStatusView) {
                    await sock.readMessages([msg.key]);
                    if (userSettings[num]?.autoStatusLike) {
                        await sock.sendMessage(remoteJid, { react: { text: '💚', key: msg.key } });
                    }
                }
                return;
            }

            if (msg.key.fromMe) return;

            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            const lowerText = text.toLowerCase();

            // 2. Interactive Menu
            if (lowerText === '.menu') {
                const status = userSettings[num] || { autoStatusView: true, autoStatusLike: true, antiDelete: true };
                await sock.sendMessage(remoteJid, {
                    text: `📜 *DEV LASINDU 66 // INTERACTIVE MENU*\n\n` +
                          `Select option to toggle ON/OFF by replying with number:\n\n` +
                          `1️⃣ Auto Status View: *${status.autoStatusView ? '🟢 ON' : '🔴 OFF'}*\n` +
                          `2️⃣ Auto Status Like: *${status.autoStatusLike ? '🟢 ON' : '🔴 OFF'}*\n` +
                          `3️⃣ Anti-Delete: *${status.antiDelete ? '🟢 ON' : '🔴 OFF'}*\n\n` +
                          `📌 *Other Commands:*\n` +
                          `- \`.sticker\` (Reply to image)\n` +
                          `- \`.tiktok <url>\`\n` +
                          `- \`.youtube <url>\`\n\n` +
                          `> *Powered by Lasindu 66*`
                });
            }

            // Toggle handlers via numbers (1, 2, 3)
            else if (text === '1') {
                if (!userSettings[num]) userSettings[num] = {};
                userSettings[num].autoStatusView = !userSettings[num].autoStatusView;
                await sock.sendMessage(remoteJid, { text: `✅ Auto Status View is now: *${userSettings[num].autoStatusView ? 'ON' : 'OFF'}*\n\n> *Powered by Lasindu 66*` });
            }
            else if (text === '2') {
                if (!userSettings[num]) userSettings[num] = {};
                userSettings[num].autoStatusLike = !userSettings[num].autoStatusLike;
                await sock.sendMessage(remoteJid, { text: `✅ Auto Status Like is now: *${userSettings[num].autoStatusLike ? 'ON' : 'OFF'}*\n\n> *Powered by Lasindu 66*` });
            }
            else if (text === '3') {
                if (!userSettings[num]) userSettings[num] = {};
                userSettings[num].antiDelete = !userSettings[num].antiDelete;
                await sock.sendMessage(remoteJid, { text: `✅ Anti-Delete is now: *${userSettings[num].antiDelete ? 'ON' : 'OFF'}*\n\n> *Powered by Lasindu 66*` });
            }

            // 3. Sticker Command (.sticker)
            else if (lowerText === '.sticker' || lowerText === '.s') {
                const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsg && quotedMsg.imageMessage) {
                    await sock.sendMessage(remoteJid, { text: '⏳ Creating sticker...\n\n> *Powered by Lasindu 66*'});
                    // Sticker generation logic here or via image stream
                } else {
                    await sock.sendMessage(remoteJid, { text: '⚠️ Please reply to an image with `.sticker`\n\n> *Powered by Lasindu 66*'});
                }
            }

            // 4. TikTok / YouTube Downloader detector
            else if (lowerText.startsWith('.tiktok') || lowerText.startsWith('.tt')) {
                const url = text.split(' ')[1];
                if (!url) {
                    await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a TikTok link! (e.g., `.tiktok <url>`)\n\n> *Powered by Lasindu 66*'});
                    return;
                }
                await sock.sendMessage(remoteJid, { text: '📥 Downloading TikTok video without watermark...\n\n> *Powered by Lasindu 66*'});
                // Download integration endpoint here
            }
            else if (lowerText.startsWith('.youtube') || lowerText.startsWith('.yt') || lowerText.startsWith('.song')) {
                const url = text.split(' ')[1];
                if (!url) {
                    await sock.sendMessage(remoteJid, { text: '⚠️ Please provide a YouTube link or search term!\n\n> *Powered by Lasindu 66*'});
                    return;
                }
                await sock.sendMessage(remoteJid, { text: '📥 Processing media from YouTube...\n\n> *Powered by Lasindu 66*'});
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed' });
        }
    }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));