const express = require('express');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
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

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(`Connected: ${num}`);
                userSettings[num] = { autoStatusView: true, autoStatusLike: true };

                // මෙන්න ඔයාගේ ਫොටෝ එකේ Direct URL එක
                const myImageUrl = 'https://i.ibb.co/kswPsCyk/image.jpg'; // (ඔයාගේ ලින්ක් එක මෙතන තියෙනවා)

                try {
                    await sock.sendMessage(sock.user.id, {
                        image: { url: myImageUrl },
                        caption: `✅ *BOT CONNECTED SUCCESSFULLY!*\n\n` +
                                 `🤖 *Bot Name:* Lasindu Mini Bot\n` +
                                 `⚡ *Status:* Online & Active 24/7\n` +
                                 `Type \`.menu\` to see features.\n\n` +
                                 `> *Powered by Lasindu 66*`
                    });
                } catch (e) {
                    await sock.sendMessage(sock.user.id, {
                        text: `✅ *BOT CONNECTED SUCCESSFULLY!*\n\n> *Powered by Lasindu 66*`
                    });
                }
            }
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                // If logged out or conflict, clean up session so it never gets stuck
                if (statusCode === 401 || statusCode === 440) {
                    try {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    } catch (err) {}
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const remoteJid = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            if (text.toLowerCase() === '.menu') {
                await sock.sendMessage(remoteJid, {
                    text: `📜 *DEV LASINDU 66 // MENU*\n\n` +
                          `📌 \`.alive\` - Bot status\n` +
                          `⚡ \`.ping\` - Speed test\n\n` +
                          `> *Powered by Lasindu 66*`
                });
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
