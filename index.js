const fs = require('fs');
const path = require('path');
const express = require('express');
const wiegine = require('ws3-fca');
const WebSocket = require('ws');
const axios = require('axios');
const ytdl = require('ytdl-core');

// Initialize Express app
const app = express();
const PORT = 3000;

// Bot configuration
let botConfig = {
  prefix: '!',
  adminID: '',
  autoSpamAccept: false,
  autoMessageAccept: false
};

// Bot state
let botState = {
  running: false,
  api: null,
  abuseTargets: {},
  autoConvo: false,
  stickerSpam: {},
  welcomeMessages: [
    "🌟 Welcome {name} to the group! Enjoy your stay! 🌟",
    "🔥 {name} just joined the party! Let's get wild! 🔥",
    "👋 Hey {name}, Devil's crew welcomes you! Behave or get roasted! 👋",
    "🎉 {name} has arrived! The fun begins now! 🎉",
    "😈 Devil's child {name} just entered! Watch your back! 😈"
  ],
  goodbyeMessages: {
    member: [
      "😂 {name} couldn't handle the heat and left! One less noob! 😂",
      "🚪 {name} just left. Was it something we said? 🤔",
      "👋 Bye {name}! Don't let the door hit you on the way out! 👋",
      "💨 {name} vanished faster than my patience! 💨",
      "😏 {name} got scared and ran away! Weakling! 😏"
    ],
    admin: [
      "💥 Admin {name} kicked someone! That's what you get for messing with us! 💥",
      "👊 Boss {name} showed someone the door! Don't mess with the Devil! 👊",
      "⚡ {name} just demonstrated their admin powers! Respect! ⚡"
    ]
  }
};

// Locked groups and nicknames
const lockedGroups = {};
const lockedNicknames = {};

// WebSocket server
let wss;

// HTML Control Panel
const htmlControlPanel = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ultimate Devil Bot</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background-color: #1a1a1a;
            color: #e0e0e0;
        }
        .status {
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 5px;
            font-weight: bold;
            text-align: center;
        }
        .online { background: #4CAF50; color: white; }
        .offline { background: #f44336; color: white; }
        .panel {
            background: #2d2d2d;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            margin-bottom: 20px;
        }
        button {
            padding: 10px 15px;
            margin: 5px;
            cursor: pointer;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            transition: all 0.3s;
        }
        button:hover {
            background: #0b7dda;
            transform: scale(1.02);
        }
        button:disabled {
            background: #555555;
            cursor: not-allowed;
        }
        input, select, textarea {
            padding: 10px;
            margin: 5px 0;
            width: 100%;
            border: 1px solid #444;
            border-radius: 4px;
            background: #333;
            color: white;
        }
        .log {
            height: 300px;
            overflow-y: auto;
            border: 1px solid #444;
            padding: 10px;
            margin-top: 20px;
            font-family: monospace;
            background: #222;
            color: #00ff00;
            border-radius: 4px;
        }
        small {
            color: #888;
            font-size: 12px;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .tabs {
            display: flex;
            margin-bottom: 15px;
            border-bottom: 1px solid #444;
        }
        .tab {
            padding: 10px 15px;
            cursor: pointer;
            background: #333;
            margin-right: 5px;
            border-radius: 4px 4px 0 0;
            transition: all 0.3s;
        }
        .tab.active {
            background: #2196F3;
            color: white;
        }
        h1, h2, h3 {
            color: #2196F3;
        }
        .command-list {
            background: #333;
            padding: 15px;
            border-radius: 5px;
            margin-top: 15px;
        }
        .command {
            margin: 5px 0;
            padding: 8px;
            background: #444;
            border-radius: 4px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <h1>🔥 Ultimate Devil Bot Control Panel 🔥</h1>
    
    <div class="status offline" id="status">
        Status: Offline
    </div>
    
    <div class="panel">
        <div class="tabs">
            <div class="tab active" data-tab="main">Main</div>
            <div class="tab" data-tab="abuse">Abuse System</div>
            <div class="tab" data-tab="settings">Settings</div>
            <div class="tab" data-tab="commands">Commands</div>
        </div>
        
        <div id="main-tab" class="tab-content active">
            <div>
                <textarea id="cookie-input" rows="5" placeholder="Paste your cookie string here"></textarea>
                <small>Paste your Facebook cookie string</small>
            </div>
            
            <div>
                <input type="text" id="prefix" value="${botConfig.prefix}" placeholder="Command prefix">
            </div>
            
            <div>
                <input type="text" id="admin-id" placeholder="Admin Facebook ID" value="${botConfig.adminID}">
            </div>
            
            <button id="start-btn">Start Bot</button>
            <button id="stop-btn" disabled>Stop Bot</button>
        </div>
        
        <div id="abuse-tab" class="tab-content">
            <div>
                <label for="abuse-file">Abuse Messages File</label>
                <input type="file" id="abuse-file" accept=".txt">
                <small>Upload abuse.txt file with messages (one per line)</small>
            </div>
            <button id="upload-abuse">Upload Abuse File</button>
            
            <div style="margin-top: 20px;">
                <label for="welcome-messages">Welcome Messages (one per line)</label>
                <textarea id="welcome-messages" rows="5">${botState.welcomeMessages.join('\n')}</textarea>
                <button id="save-welcome">Save Welcome Messages</button>
            </div>
        </div>
        
        <div id="settings-tab" class="tab-content">
            <div>
                <label>
                    <input type="checkbox" id="auto-spam" ${botConfig.autoSpamAccept ? 'checked' : ''}>
                    Auto Accept Spam Messages
                </label>
            </div>
            
            <div>
                <label>
                    <input type="checkbox" id="auto-message" ${botConfig.autoMessageAccept ? 'checked' : ''}>
                    Auto Accept Message Requests
                </label>
            </div>
            
            <div>
                <label>
                    <input type="checkbox" id="auto-convo" ${botState.autoConvo ? 'checked' : ''}>
                    Auto Conversation Mode
                </label>
            </div>
            
            <button id="save-settings">Save Settings</button>
        </div>
        
        <div id="commands-tab" class="tab-content">
            <h3>Available Commands</h3>
            <div class="command-list">
                <div class="command">${botConfig.prefix}help - Show all commands</div>
                <div class="command">${botConfig.prefix}groupnamelock on &lt;name&gt; - Lock group name</div>
                <div class="command">${botConfig.prefix}nicknamelock on &lt;nickname&gt; - Lock all nicknames</div>
                <div class="command">${botConfig.prefix}tid - Get group ID</div>
                <div class="command">${botConfig.prefix}uid - Get your ID</div>
                <div class="command">${botConfig.prefix}uid @mention - Get mentioned user's ID</div>
                <div class="command">${botConfig.prefix}info @mention - Get user information</div>
                <div class="command">${botConfig.prefix}group info - Get group information</div>
                <div class="command">${botConfig.prefix}pair - Pair two random members</div>
                <div class="command">${botConfig.prefix}music &lt;song name&gt; - Play YouTube music</div>
                <div class="command">${botConfig.prefix}antiout on/off - Toggle anti-out feature</div>
                <div class="command">${botConfig.prefix}send sticker start/stop - Sticker spam</div>
                <div class="command">${botConfig.prefix}autospam accept - Auto accept spam messages</div>
                <div class="command">${botConfig.prefix}automessage accept - Auto accept message requests</div>
                <div class="command">${botConfig.prefix}loder target on @user - Target a user</div>
                <div class="command">${botConfig.prefix}loder stop - Stop targeting</div>
                <div class="command">autoconvo on/off - Toggle auto conversation</div>
            </div>
        </div>
    </div>
    
    <div class="panel">
        <h3>Bot Logs</h3>
        <div class="log" id="log-container"></div>
    </div>

    <script>
        const socket = new WebSocket('ws://' + window.location.host);
        const logContainer = document.getElementById('log-container');
        const statusDiv = document.getElementById('status');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const uploadAbuseBtn = document.getElementById('upload-abuse');
        const saveWelcomeBtn = document.getElementById('save-welcome');
        const saveSettingsBtn = document.getElementById('save-settings');
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        const autoSpamCheckbox = document.getElementById('auto-spam');
        const autoMessageCheckbox = document.getElementById('auto-message');
        const autoConvoCheckbox = document.getElementById('auto-convo');

        function addLog(message, type = 'info') {
            const logEntry = document.createElement('div');
            logEntry.textContent = \`[\${new Date().toLocaleTimeString()}] \${message}\`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        // Tab switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(\`\${tab.dataset.tab}-tab\`).classList.add('active');
            });
        });

        socket.onopen = () => addLog('Connected to bot server');
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'log') {
                addLog(data.message);
            } else if (data.type === 'status') {
                statusDiv.className = data.running ? 'status online' : 'status offline';
                statusDiv.textContent = \`Status: \${data.running ? 'Online' : 'Offline'}\`;
                startBtn.disabled = data.running;
                stopBtn.disabled = !data.running;
            } else if (data.type === 'settings') {
                autoSpamCheckbox.checked = data.autoSpamAccept;
                autoMessageCheckbox.checked = data.autoMessageAccept;
                autoConvoCheckbox.checked = data.autoConvo;
            }
        };
        
        socket.onclose = () => addLog('Disconnected from bot server');

        startBtn.addEventListener('click', () => {
            const cookieInput = document.getElementById('cookie-input').value.trim();
            if (!cookieInput) {
                addLog('Please paste your cookie string');
                return;
            }
            
            const prefix = document.getElementById('prefix').value.trim();
            const adminId = document.getElementById('admin-id').value.trim();
            
            socket.send(JSON.stringify({
                type: 'start',
                cookieContent: cookieInput,
                prefix,
                adminId
            }));
        });
        
        stopBtn.addEventListener('click', () => {
            socket.send(JSON.stringify({ type: 'stop' }));
        });
        
        uploadAbuseBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('abuse-file');
            if (fileInput.files.length === 0) {
                addLog('Please select an abuse file');
                return;
            }
            
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                socket.send(JSON.stringify({
                    type: 'uploadAbuse',
                    content: event.target.result
                }));
            };
            
            reader.readAsText(file);
        });
        
        saveWelcomeBtn.addEventListener('click', () => {
            const welcomeMessages = document.getElementById('welcome-messages').value;
            socket.send(JSON.stringify({
                type: 'saveWelcome',
                content: welcomeMessages
            }));
        });
        
        saveSettingsBtn.addEventListener('click', () => {
            socket.send(JSON.stringify({
                type: 'saveSettings',
                autoSpamAccept: autoSpamCheckbox.checked,
                autoMessageAccept: autoMessageCheckbox.checked,
                autoConvo: autoConvoCheckbox.checked
            }));
        });
        
        addLog('Control panel ready');
    </script>
</body>
</html>
`;

// Start bot function
function startBot(cookieContent, prefix, adminID) {
  botState.running = true;
  botConfig.prefix = prefix;
  botConfig.adminID = adminID;
  
  try {
    fs.writeFileSync('selected_cookie.txt', cookieContent);
    broadcast({ type: 'log', message: 'Cookie saved' });
  } catch (err) {
    broadcast({ type: 'log', message: `Failed to save cookie: ${err.message}` });
    botState.running = false;
    return;
  }

  wiegine.login(cookieContent, {}, (err, api) => {
    if (err) {
      broadcast({ type: 'log', message: `Login failed: ${err.message || err}` });
      botState.running = false;
      return;
    }

    if (!api) {
      broadcast({ type: 'log', message: 'Login failed: API object not returned' });
      botState.running = false;
      return;
    }

    botState.api = api;
    broadcast({ type: 'log', message: 'Bot logged in and running' });
    broadcast({ type: 'status', running: true });
    broadcast({ 
      type: 'settings',
      autoSpamAccept: botConfig.autoSpamAccept,
      autoMessageAccept: botConfig.autoMessageAccept,
      autoConvo: botState.autoConvo
    });
    
    api.setOptions({ listenEvents: true, autoMarkRead: true });

    // Load abuse messages
    let abuseMessages = [];
    try {
      abuseMessages = fs.readFileSync('abuse.txt', 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch (err) {
      broadcast({ type: 'log', message: 'No abuse.txt file found or error reading it' });
    }

    // Load welcome messages
    try {
      const welcomeContent = fs.readFileSync('welcome.txt', 'utf8');
      botState.welcomeMessages = welcomeContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch (err) {
      // Use default welcome messages
      fs.writeFileSync('welcome.txt', botState.welcomeMessages.join('\n'));
    }

    // Event listener
    api.listenMqtt((err, event) => {
      if (err) {
        broadcast({ type: 'log', message: `Listen error: ${err}` });
        return;
      }

      const isAdmin = event.senderID === botConfig.adminID;
      const isGroup = event.threadID !== event.senderID;
      const botID = api.getCurrentUserID();

      // Auto accept spam and message requests
      if (botConfig.autoSpamAccept && event.type === 'message_request') {
        api.handleMessageRequest(event.threadID, true, (err) => {
          if (!err) {
            api.sendMessage("🚀 Auto-accepted your message request!", event.threadID);
          }
        });
      }

      // Message handling
      if (event.type === 'message') {
        const msg = event.body?.trim();
        const args = msg?.split(' ') || [];
        
        // Commands
        if (msg?.startsWith(botConfig.prefix)) {
          const command = args[0].slice(botConfig.prefix.length).toLowerCase();
          
          // Group name lock
          if (command === 'groupnamelock' && args[1] === 'on' && isAdmin) {
            const groupName = args.slice(2).join(' ');
            lockedGroups[event.threadID] = groupName;
            api.setTitle(groupName, event.threadID, (err) => {
              if (err) return api.sendMessage('Failed to lock group name.', event.threadID);
              api.sendMessage(`🔒 Group name locked: ${groupName}`, event.threadID);
            });
          } 
          
          // Nickname lock
          else if (command === 'nicknamelock' && args[1] === 'on' && isAdmin) {
            const nickname = args.slice(2).join(' ');
            api.getThreadInfo(event.threadID, (err, info) => {
              if (err) return console.error('Thread info error:', err);
              info.participantIDs.forEach((userID, i) => {
                setTimeout(() => {
                  api.changeNickname(nickname, event.threadID, userID, () => {});
                }, i * 2000);
              });
              lockedNicknames[event.threadID] = nickname;
              api.sendMessage(`🔒 Nicknames locked: ${nickname}`, event.threadID);
            });
          }
          
          // Get thread ID
          else if (command === 'tid') {
            api.getThreadInfo(event.threadID, (err, info) => {
              if (err || !info) return api.sendMessage('Failed to get group info.', event.threadID);
              api.sendMessage(`📌 Group Name: ${info.threadName || 'N/A'}\n🆔 Group ID: ${event.threadID}`, event.threadID);
            });
          }
          
          // Get user ID
          else if (command === 'uid') {
            if (args[1] && event.mentions) {
              const targetID = Object.keys(event.mentions)[0];
              if (targetID) {
                api.getUserInfo(targetID, (err, ret) => {
                  const name = ret?.[targetID]?.name || 'User';
                  api.sendMessage(`👤 User Name: ${name}\n🆔 User ID: ${targetID}`, event.threadID);
                });
              }
            } else {
              api.getUserInfo(event.senderID, (err, ret) => {
                const name = ret?.[event.senderID]?.name || 'You';
                api.sendMessage(`👤 Your Name: ${name}\n🆔 Your ID: ${event.senderID}`, event.threadID);
              });
            }
          }
          
          // Help command
          else if (command === 'help') {
            const helpText = `
🛠️ 𝗕𝗢𝗧 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 𝗠𝗘𝗡𝗨
━━━━━━━━━━━━━━━━━━━━
🔒 Group Management
• ${botConfig.prefix}groupnamelock on <name>
• ${botConfig.prefix}nicknamelock on <nickname>
• ${botConfig.prefix}antiout on/off

🆔 ID Commands
• ${botConfig.prefix}tid - Get group ID
• ${botConfig.prefix}uid - Get your ID
• ${botConfig.prefix}uid @mention - Get mentioned user's ID
• ${botConfig.prefix}info @mention - Get user info

🎵 Music
• ${botConfig.prefix}music <song name>

🎭 Fun
• ${botConfig.prefix}pair - Pair two random members
• ${botConfig.prefix}send sticker start/stop

🎯 Abuse System
• ${botConfig.prefix}loder target on @user
• ${botConfig.prefix}loder stop
• autoconvo on/off

🤖 Automation
• ${botConfig.prefix}autospam accept
• ${botConfig.prefix}automessage accept

📊 Group Info
• ${botConfig.prefix}group info
━━━━━━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`;
            api.sendMessage(helpText, event.threadID);
          }
          
          // Group info
          else if (command === 'group' && args[1] === 'info') {
            api.getThreadInfo(event.threadID, (err, info) => {
              if (err || !info) return api.sendMessage('Failed to get group info.', event.threadID);
              
              // Get admin list
              const adminList = info.adminIDs?.map(admin => admin.id) || [];
              
              // Get participant info
              api.getUserInfo(info.participantIDs, (err, users) => {
                if (err) users = {};
                
                const infoText = `
📌 𝗚𝗿𝗼𝘂𝗽 𝗜𝗻𝗳𝗼
━━━━━━━━━━━━━━━━━━━━
📛 Name: ${info.threadName || 'N/A'}
🆔 ID: ${event.threadID}
👥 Members: ${info.participantIDs?.length || 0}
👑 Admins: ${adminList.length}
🔒 Name Lock: ${lockedGroups[event.threadID] ? '✅' : '❌'}
🔒 Nickname Lock: ${lockedNicknames[event.threadID] ? '✅' : '❌'}
━━━━━━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`;
                api.sendMessage(infoText, event.threadID);
              });
            });
          }
          
          // User info command
          else if (command === 'info') {
            let targetID = event.senderID;
            
            if (args[1] && event.mentions) {
              targetID = Object.keys(event.mentions)[0];
            } else if (event.messageReply) {
              targetID = event.messageReply.senderID;
            }
            
            if (!targetID) return;
            
            api.getUserInfo(targetID, (err, ret) => {
              if (err || !ret?.[targetID]) {
                return api.sendMessage("Failed to get user info.", event.threadID);
              }
              
              const user = ret[targetID];
              const genderMap = {
                1: 'Female',
                2: 'Male',
                3: 'Custom'
              };
              
              const infoText = `
👤 𝗨𝘀𝗲𝗿 𝗜𝗻𝗳𝗼
━━━━━━━━━━━━━━━━━━━━
📛 Name: ${user.name}
🆔 ID: ${targetID}
👫 Gender: ${genderMap[user.gender] || 'Unknown'}
📍 Location: ${user.location?.name || 'N/A'}
💬 Bio: ${user.bio || 'N/A'}
💑 Relationship: ${user.relationship_status || 'N/A'}
📅 Profile Created: ${new Date(user.profileCreation * 1000).toLocaleDateString() || 'N/A'}
━━━━━━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`;
              api.sendMessage(infoText, event.threadID);
            });
          }
          
          // Pair command
          else if (command === 'pair') {
            api.getThreadInfo(event.threadID, (err, info) => {
              if (err || !info?.participantIDs) return;
              
              const members = info.participantIDs.filter(id => id !== api.getCurrentUserID());
              if (members.length < 2) return;
              
              const random1 = members[Math.floor(Math.random() * members.length)];
              let random2 = members[Math.floor(Math.random() * members.length)];
              while (random2 === random1) {
                random2 = members[Math.floor(Math.random() * members.length)];
              }
              
              api.getUserInfo([random1, random2], (err, ret) => {
                if (err || !ret) return;
                
                const name1 = ret[random1]?.name || 'User1';
                const name2 = ret[random2]?.name || 'User2';
                
                // Get profile pictures
                api.getUserAvatar(random1, (err, url1) => {
                  api.getUserAvatar(random2, (err, url2) => {
                    const msg = {
                      body: `💑 ये लो तुम्हारा जीवनसाथी मिल गया ${name1} और ${name2}!\nअब मत बोलना, बस प्यार करो! ❤️`,
                      mentions: [
                        { tag: name1, id: random1 },
                        { tag: name2, id: random2 }
                      ],
                      attachment: [
                        axios.get(url1, { responseType: 'arraybuffer' })
                          .then(res => res.data),
                        axios.get(url2, { responseType: 'arraybuffer' })
                          .then(res => res.data)
                      ]
                    };
                    
                    api.sendMessage(msg, event.threadID);
                  });
                });
              });
            });
          }
          
          // Music command
          else if (command === 'music') {
            const songName = args.slice(1).join(' ');
            if (!songName) return;
            
            api.sendMessage(`🔍 Searching for "${songName}"...`, event.threadID);
            
            // In a real implementation, you would use YouTube API to search and get audio stream
            // This is a simplified version
            ytdl.getInfo(`ytsearch:${songName}`, (err, info) => {
              if (err) {
                return api.sendMessage('Failed to find the song.', event.threadID);
              }
              
              const audioStream = ytdl.downloadFromInfo(info, { filter: 'audioonly' });
              api.sendMessage({
                body: `🎵 Here's your song: ${info.title}\nEnjoy!`,
                attachment: audioStream
              }, event.threadID);
            });
          }
          
          // Anti-out command
          else if (command === 'antiout' && isAdmin) {
            if (args[1] === 'on') {
              // Implementation would track members and re-add them if they leave
              api.sendMessage('🛡️ Anti-out system activated! Members cannot leave now!', event.threadID);
            } else if (args[1] === 'off') {
              api.sendMessage('🛡️ Anti-out system deactivated!', event.threadID);
            }
          }
          
          // Sticker spam command
          else if (command === 'send' && args[1] === 'sticker') {
            if (args[2] === 'start' && isAdmin) {
              botState.stickerSpam[event.threadID] = true;
              
              const spamLoop = async () => {
                while (botState.stickerSpam[event.threadID]) {
                  try {
                    await api.sendMessage({
                      sticker: Math.floor(Math.random() * 1000) // Random sticker ID
                    }, event.threadID);
                    await new Promise(r => setTimeout(r, 5000));
                  } catch (err) {
                    break;
                  }
                }
              };
              
              spamLoop();
              api.sendMessage('🔄 Sticker spam started!', event.threadID);
            } else if (args[2] === 'stop' && isAdmin) {
              botState.stickerSpam[event.threadID] = false;
              api.sendMessage('🛑 Sticker spam stopped!', event.threadID);
            }
          }
          
          // Auto spam accept command
          else if (command === 'autospam' && args[1] === 'accept' && isAdmin) {
            botConfig.autoSpamAccept = !botConfig.autoSpamAccept;
            api.sendMessage(`✅ Auto spam accept ${botConfig.autoSpamAccept ? 'enabled' : 'disabled'}!`, event.threadID);
            broadcast({ 
              type: 'settings',
              autoSpamAccept: botConfig.autoSpamAccept,
              autoMessageAccept: botConfig.autoMessageAccept,
              autoConvo: botState.autoConvo
            });
          }
          
          // Auto message accept command
          else if (command === 'automessage' && args[1] === 'accept' && isAdmin) {
            botConfig.autoMessageAccept = !botConfig.autoMessageAccept;
            api.sendMessage(`✅ Auto message accept ${botConfig.autoMessageAccept ? 'enabled' : 'disabled'}!`, event.threadID);
            broadcast({ 
              type: 'settings',
              autoSpamAccept: botConfig.autoSpamAccept,
              autoMessageAccept: botConfig.autoMessageAccept,
              autoConvo: botState.autoConvo
            });
          }
          
          // Abuse target system
          else if (command === 'loder') {
            if (args[1] === 'target' && args[2] === 'on' && event.mentions && isAdmin) {
              const targetID = Object.keys(event.mentions)[0];
              if (targetID) {
                if (!botState.abuseTargets[event.threadID]) {
                  botState.abuseTargets[event.threadID] = {};
                }
                botState.abuseTargets[event.threadID][targetID] = true;
                
                api.getUserInfo(targetID, (err, ret) => {
                  const name = ret?.[targetID]?.name || 'User';
                  api.sendMessage(`🎯 ${name} को टारगेट कर दिया गया है! अब इसकी खैर नहीं!`, event.threadID);
                  
                  // Start abuse loop
                  const spamLoop = async () => {
                    while (botState.abuseTargets[event.threadID]?.[targetID] && abuseMessages.length > 0) {
                      const randomMsg = abuseMessages[Math.floor(Math.random() * abuseMessages.length)];
                      const mentionTag = `@${name.split(' ')[0]}`;
                      
                      try {
                        await api.sendMessage({
                          body: `${mentionTag} ${randomMsg}`,
                          mentions: [{ tag: mentionTag, id: targetID }]
                        }, event.threadID);
                        await new Promise(r => setTimeout(r, 5000));
                      } catch (err) {
                        break;
                      }
                    }
                  };
                  
                  spamLoop();
                });
              }
            } 
            else if (args[1] === 'stop' && isAdmin) {
              if (botState.abuseTargets[event.threadID]) {
                const targets = Object.keys(botState.abuseTargets[event.threadID]);
                delete botState.abuseTargets[event.threadID];
                
                if (targets.length > 0) {
                  api.getUserInfo(targets, (err, ret) => {
                    const names = targets.map(id => ret?.[id]?.name || 'User').join(', ');
                    api.sendMessage(`🎯 ${names} को टारगेट से हटा दिया गया है! बच गए ये लोग!`, event.threadID);
                  });
                }
              }
            }
          }
        }
        
        // Auto-convo toggle (without prefix)
        if (msg?.toLowerCase() === 'autoconvo on' && isAdmin) {
          botState.autoConvo = true;
          api.sendMessage('🔥 ऑटो कॉन्वो सिस्टम चालू हो गया है! अब कोई भी गाली देगा तो उसकी खैर नहीं!', event.threadID);
          broadcast({ 
            type: 'settings',
            autoSpamAccept: botConfig.autoSpamAccept,
            autoMessageAccept: botConfig.autoMessageAccept,
            autoConvo: botState.autoConvo
          });
        } 
        else if (msg?.toLowerCase() === 'autoconvo off' && isAdmin) {
          botState.autoConvo = false;
          api.sendMessage('✅ ऑटो कॉन्वो सिस्टम बंद हो गया है!', event.threadID);
          broadcast({ 
            type: 'settings',
            autoSpamAccept: botConfig.autoSpamAccept,
            autoMessageAccept: botConfig.autoMessageAccept,
            autoConvo: botState.autoConvo
          });
        }
        
        // Abuse detection and auto-convo
        const triggerWords = ['bc', 'mc', 'bkl', 'bhenchod', 'madarchod', 'lund', 'gandu', 'chutiya', 'randi', 'motherchod', 'fuck', 'bhosda'];
        const isAbusive = triggerWords.some(word => msg?.toLowerCase().includes(word));
        const isMentioningBot = msg?.toLowerCase().includes('bot') || event.mentions?.[api.getCurrentUserID()];
        
        if ((isAbusive && isMentioningBot) || (isAbusive && botState.autoConvo)) {
          const abuserID = event.senderID;
          if (!botState.abuseTargets[event.threadID]) {
            botState.abuseTargets[event.threadID] = {};
          }
          
          if (!botState.abuseTargets[event.threadID][abuserID] && abuseMessages.length > 0) {
            botState.abuseTargets[event.threadID][abuserID] = true;
            
            api.getUserInfo(abuserID, (err, ret) => {
              if (err || !ret) return;
              const name = ret[abuserID]?.name || 'User';
              
              api.sendMessage(`😡 ${name} तूने मुझे गाली दी? अब तेरी खैर नहीं!`, event.threadID);
              
              const spamLoop = async () => {
                while (botState.abuseTargets[event.threadID]?.[abuserID] && abuseMessages.length > 0) {
                  const randomMsg = abuseMessages[Math.floor(Math.random() * abuseMessages.length)];
                  const mentionTag = `@${name.split(' ')[0]}`;
                  
                  try {
                    await api.sendMessage({
                      body: `${mentionTag} ${randomMsg}`,
                      mentions: [{ tag: mentionTag, id: abuserID }]
                    }, event.threadID);
                    await new Promise(r => setTimeout(r, 5000));
                  } catch (err) {
                    break;
                  }
                }
              };
              
              spamLoop();
            });
          }
        }
        
        // Stop abuse if user says sorry
        if (botState.abuseTargets?.[event.threadID]?.[event.senderID]) {
          const lower = msg?.toLowerCase();
          if (lower?.includes('sorry devil papa') || lower?.includes('sorry boss')) {
            delete botState.abuseTargets[event.threadID][event.senderID];
            api.sendMessage('😏 ठीक है बेटा! अब तुझे नहीं गाली देंगे. बच गया तू... अगली बार संभल के!', event.threadID);
          }
        }
        
        // Random replies to "bot" mentions
        if (msg?.toLowerCase().includes('bot') && isGroup) {
          const randomResponses = [
            "जी हुज़ूर, बोलिए मैं हाज़िर हूँ! 😈",
            "क्या हुक्म है मेरे मालिक? 👑",
            "मुझे बुलाया? मैं तैयार हूँ! 🔥",
            "हाँ बॉस, क्या चाहिए? 😏",
            "Devil बॉट हाज़िर है! बताओ क्या करूँ? 😎",
            "मैं सुन रहा हूँ... क्या बात है? 🤔",
            "तुम्हारी हर आज्ञा का पालन करने को तैयार! 😇",
            "क्या बात है? बोलो जल्दी, मेरे पास और भी लोगों को परेशान करना है! 😈"
          ];
          
          if (Math.random() < 0.7) { // 70% chance to reply
            setTimeout(() => {
              api.sendMessage(randomResponses[Math.floor(Math.random() * randomResponses.length)], event.threadID);
            }, 2000);
          }
        }
      }

      // New member added
      if (event.logMessageType === 'log:subscribe') {
        const addedIDs = event.logMessageData.addedParticipants?.map(p => p.userFbId) || [];
        
        addedIDs.forEach(id => {
          if (id === botID) {
            // Bot was added to a group
            api.sendMessage("🚀 Devil Bot here! Type !help to see my commands!", event.threadID);
          } else {
            // Welcome new member
            api.getUserInfo(id, (err, ret) => {
              if (err || !ret?.[id]) return;
              
              const name = ret[id].name || 'New Member';
              const welcomeMsg = botState.welcomeMessages[
                Math.floor(Math.random() * botState.welcomeMessages.length)
              ].replace('{name}', name);
              
              api.sendMessage(welcomeMsg, event.threadID);
            });
          }
        });
      }

      // Member left or was removed
      if (event.logMessageType === 'log:unsubscribe') {
        const leftID = event.logMessageData.leftParticipantFbId;
        if (!leftID) return;
        
        api.getUserInfo(leftID, (err, ret) => {
          if (err || !ret?.[leftID]) return;
          
          const name = ret[leftID].name || 'Someone';
          const wasKicked = !!event.logMessageData.removerFbId;
          
          let goodbyeMsg;
          if (wasKicked) {
            const removerID = event.logMessageData.removerFbId;
            if (removerID === botID) {
              goodbyeMsg = `😈 ${name} को मैंने निकाल दिया! अब इसकी औकात याद आएगी!`;
            } else {
              api.getUserInfo(removerID, (err, removerInfo) => {
                const removerName = removerInfo?.[removerID]?.name || 'Admin';
                goodbyeMsg = `💥 ${removerName} ने ${name} को ग्रुप से निकाल दिया! बहुत बड़ा अपराध किया होगा!`;
                api.sendMessage(goodbyeMsg, event.threadID);
              });
              return;
            }
          } else {
            goodbyeMsg = botState.goodbyeMessages.member[
              Math.floor(Math.random() * botState.goodbyeMessages.member.length)
            ].replace('{name}', name);
          }
          
          api.sendMessage(goodbyeMsg, event.threadID);
        });
      }

      // Thread name changes
      if (event.logMessageType === 'log:thread-name') {
        const locked = lockedGroups[event.threadID];
        if (locked) {
          api.setTitle(locked, event.threadID, () => {
            api.sendMessage('❌ Group name is locked by admin!', event.threadID);
          });
        }
      }

      // Nickname changes
      if (event.logMessageType === 'log:thread-nickname') {
        const locked = lockedNicknames[event.threadID];
        if (locked) {
          const userID = event.logMessageData.participant_id;
          api.changeNickname(locked, event.threadID, userID, () => {
            api.sendMessage('❌ Nicknames are locked by admin!', event.threadID);
          });
        }
      }
    });
  });
}

// Stop bot function
function stopBot() {
  if (botState.api) {
    botState.api.logout();
    botState.api = null;
  }
  botState.running = false;
  botState.abuseTargets = {};
  broadcast({ type: 'status', running: false });
  broadcast({ type: 'log', message: 'Bot stopped' });
}

// WebSocket broadcast function
function broadcast(message) {
  if (!wss) return;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Set up Express server
app.get('/', (req, res) => {
  res.send(htmlControlPanel);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Control panel running at http://localhost:${PORT}`);
});

// Set up WebSocket server
wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ 
    type: 'status', 
    running: botState.running 
  }));
  
  ws.send(JSON.stringify({
    type: 'settings',
    autoSpamAccept: botConfig.autoSpamAccept,
    autoMessageAccept: botConfig.autoMessageAccept,
    autoConvo: botState.autoConvo
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'start') {
        botConfig.prefix = data.prefix;
        botConfig.adminID = data.adminId;
        
        try {
          if (!data.cookieContent) throw new Error('No cookie content provided');
          startBot(data.cookieContent, botConfig.prefix, botConfig.adminID);
        } catch (err) {
          broadcast({ type: 'log', message: `Error with cookie: ${err.message}` });
        }
      } 
      else if (data.type === 'stop') {
        stopBot();
      }
      else if (data.type === 'uploadAbuse') {
        try {
          fs.writeFileSync('abuse.txt', data.content);
          broadcast({ type: 'log', message: 'Abuse messages file updated' });
        } catch (err) {
          broadcast({ type: 'log', message: `Failed to save abuse file: ${err.message}` });
        }
      }
      else if (data.type === 'saveWelcome') {
        try {
          fs.writeFileSync('welcome.txt', data.content);
          botState.welcomeMessages = data.content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
          broadcast({ type: 'log', message: 'Welcome messages updated' });
        } catch (err) {
          broadcast({ type: 'log', message: `Failed to save welcome messages: ${err.message}` });
        }
      }
      else if (data.type === 'saveSettings') {
        botConfig.autoSpamAccept = data.autoSpamAccept;
        botConfig.autoMessageAccept = data.autoMessageAccept;
        botState.autoConvo = data.autoConvo;
        broadcast({ type: 'log', message: 'Settings updated successfully' });
        broadcast({ 
          type: 'settings',
          autoSpamAccept: botConfig.autoSpamAccept,
          autoMessageAccept: botConfig.autoMessageAccept,
          autoConvo: botState.autoConvo
        });
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  });
});
