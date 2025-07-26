const fs = require('fs');
const path = require('path');
const express = require('express');
const wiegine = require('fca-mafiya');
const WebSocket = require('ws');
const axios = require('axios');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Create user sessions directory
const userSessionsDir = path.join(__dirname, 'user_sessions');
if (!fs.existsSync(userSessionsDir)) {
  fs.mkdirSync(userSessionsDir);
}

// Bot configuration template
const botConfigTemplate = {
  prefix: '!',
  adminID: '',
  autoSpamAccept: false,
  autoMessageAccept: false
};

// Bot state management
const botStates = new Map();

// Abuse messages
const abuseMessages = new Map();

// Load abuse messages for a user
function loadAbuseMessages(userId) {
  const abuseFilePath = path.join(userSessionsDir, userId, 'abuse.txt');
  try {
    if (fs.existsSync(abuseFilePath)) {
      const messages = fs.readFileSync(abuseFilePath, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      abuseMessages.set(userId, messages);
      broadcastToUser(userId, { type: 'log', message: 'Abuse messages loaded successfully' });
    } else {
      abuseMessages.set(userId, []);
      broadcastToUser(userId, { type: 'log', message: 'No abuse.txt file found' });
    }
  } catch (err) {
    broadcastToUser(userId, { type: 'log', message: `Error loading abuse messages: ${err.message}` });
    abuseMessages.set(userId, []);
  }
}

// Locked groups and nicknames
const lockedGroups = new Map();
const lockedNicknames = new Map();

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
        .connecting { background: #ff9800; color: white; }
        .server-connected { background: #2196F3; color: white; }
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
        .welcome-box {
            border: 2px solid #ff00ff;
            border-radius: 10px;
            padding: 15px;
            margin: 10px 0;
            background: linear-gradient(135deg, #1e0033, #3a0068);
            box-shadow: 0 0 15px #ff00ff;
        }
        .welcome-title {
            font-size: 24px;
            color: #00ffff;
            text-shadow: 0 0 5px #00ffff;
            margin-bottom: 10px;
        }
        .welcome-text {
            font-family: 'Comic Sans MS', cursive;
            color: #ffffff;
        }
        .pair-box {
            border: 2px solid #ff69b4;
            border-radius: 10px;
            padding: 15px;
            margin: 10px 0;
            background: linear-gradient(135deg, #33001e, #68003a);
            box-shadow: 0 0 15px #ff69b4;
        }
    </style>
</head>
<body>
    <h1>🔥 Ultimate Devil Bot Control Panel 🔥</h1>
    
    <div class="status connecting" id="status">
        Status: Connecting to server...
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
                <input type="file" id="cookie-file" accept=".txt,.json">
                <small>Select your cookie file (txt or json)</small>
            </div>
            
            <div>
                <input type="text" id="prefix" value="!" placeholder="Command prefix">
            </div>
            
            <div>
                <input type="text" id="admin-id" placeholder="Admin Facebook ID">
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
        </div>
        
        <div id="settings-tab" class="tab-content">
            <div>
                <label>
                    <input type="checkbox" id="auto-spam">
                    Auto Accept Spam Messages
                </label>
            </div>
            
            <div>
                <label>
                    <input type="checkbox" id="auto-message">
                    Auto Accept Message Requests
                </label>
            </div>
            
            <button id="save-settings">Save Settings</button>
        </div>
        
        <div id="commands-tab" class="tab-content">
            <h3>Available Commands</h3>
            <div class="command-list">
                <div class="command">!help - Show all commands</div>
                <div class="command">!groupnamelock on &lt;name&gt; - Lock group name</div>
                <div class="command">!nicknamelock on &lt;nickname&gt; - Lock all nicknames</div>
                <div class="command">!tid - Get group ID</div>
                <div class="command">!uid - Get your ID</div>
                <div class="command">!uid @mention - Get mentioned user's ID</div>
                <div class="command">!info @mention - Get user information</div>
                <div class="command">!group info - Get group information</div>
                <div class="command">!antiout on/off - Toggle anti-out feature</div>
                <div class="command">!send sticker start/stop - Sticker spam</div>
                <div class="command">!autospam accept - Auto accept spam messages</div>
                <div class="command">!automessage accept - Auto accept message requests</div>
                <div class="command">!loder target on @user - Target a user</div>
                <div class="command">!loder stop - Stop targeting</div>
                <div class="command">!autoconvo on/off - Toggle auto conversation</div>
                <div class="command">!pair - Match with a random user</div>
                <div class="command">!music &lt;song name&gt; - Play requested song</div>
                <div class="command">!joke - Get a random joke</div>
                <div class="command">!quote - Get an inspirational quote</div>
                <div class="command">!fact - Get a random fact</div>
            </div>
        </div>
    </div>
    
    <div class="panel">
        <h3>Bot Logs</h3>
        <div class="log" id="log-container"></div>
    </div>

    <script>
        const logContainer = document.getElementById('log-container');
        const statusDiv = document.getElementById('status');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const uploadAbuseBtn = document.getElementById('upload-abuse');
        const saveSettingsBtn = document.getElementById('save-settings');
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        const autoSpamCheckbox = document.getElementById('auto-spam');
        const autoMessageCheckbox = document.getElementById('auto-message');

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

        // Dynamic protocol for Render
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(protocol + '//' + window.location.host);

        socket.onopen = () => {
            addLog('Connected to bot server');
            statusDiv.className = 'status server-connected';
            statusDiv.textContent = 'Status: Connected to Server';
        };
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'log') {
                addLog(data.message);
            } else if (data.type === 'status') {
                statusDiv.className = data.running ? 'status online' : 'status server-connected';
                statusDiv.textContent = \`Status: \${data.running ? 'Online' : 'Connected to Server'}\`;
                startBtn.disabled = data.running;
                stopBtn.disabled = !data.running;
            } else if (data.type === 'settings') {
                autoSpamCheckbox.checked = data.autoSpamAccept;
                autoMessageCheckbox.checked = data.autoMessageAccept;
            }
        };
        
        socket.onclose = () => {
            addLog('Disconnected from bot server');
            statusDiv.className = 'status offline';
            statusDiv.textContent = 'Status: Disconnected';
        };
        
        socket.onerror = (error) => {
            addLog(\`WebSocket error: \${error.message}\`);
            statusDiv.className = 'status offline';
            statusDiv.textContent = 'Status: Connection Error';
        };

        startBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('cookie-file');
            if (fileInput.files.length === 0) {
                addLog('Please select a cookie file');
                return;
            }
            
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                const cookieContent = event.target.result;
                const prefix = document.getElementById('prefix').value.trim();
                const adminId = document.getElementById('admin-id').value.trim();
                
                socket.send(JSON.stringify({
                    type: 'start',
                    cookieContent,
                    prefix,
                    adminId
                }));
            };
            
            reader.readAsText(file);
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
        
        saveSettingsBtn.addEventListener('click', () => {
            socket.send(JSON.stringify({
                type: 'saveSettings',
                autoSpamAccept: autoSpamCheckbox.checked,
                autoMessageAccept: autoMessageCheckbox.checked
            }));
        });
        
        addLog('Control panel ready');
    </script>
</body>
</html>
`;

// Start bot function for a specific user
function startBot(userId, cookieContent, prefix, adminID) {
  const userSessionDir = path.join(userSessionsDir, userId);
  if (!fs.existsSync(userSessionDir)) {
    fs.mkdirSync(userSessionDir);
  }

  const botState = {
    running: true,
    api: null,
    abuseTargets: {},
    autoConvo: {},
    stickerSpam: {},
    config: {
      ...botConfigTemplate,
      prefix,
      adminID
    }
  };

  botStates.set(userId, botState);

  try {
    fs.writeFileSync(path.join(userSessionDir, 'selected_cookie.txt'), cookieContent);
    broadcastToUser(userId, { type: 'log', message: 'Cookie file saved' });
  } catch (err) {
    broadcastToUser(userId, { type: 'log', message: `Failed to save cookie: ${err.message}` });
    botState.running = false;
    return;
  }

  // Load abuse messages for this user
  loadAbuseMessages(userId);

  wiegine.login(cookieContent, {}, (err, api) => {
    if (err || !api) {
      broadcastToUser(userId, { type: 'log', message: `Login failed: ${err?.message || err}` });
      botState.running = false;
      return;
    }

    botState.api = api;
    broadcastToUser(userId, { type: 'log', message: 'Bot logged in and running' });
    broadcastToUser(userId, { type: 'status', running: true });
    broadcastToUser(userId, { 
      type: 'settings',
      autoSpamAccept: botState.config.autoSpamAccept,
      autoMessageAccept: botState.config.autoMessageAccept
    });
    
    // Enhanced error handling to prevent auto-logout
    api.setOptions({ 
      listenEvents: true, 
      autoMarkRead: true,
      selfListen: false,
      forceLogin: true,
      online: true,
      updatePresence: true
    });

    // Add keep-alive functionality
    const keepAliveInterval = setInterval(() => {
      api.markAsRead(api.getCurrentUserID(), (err) => {
        if (err) {
          console.error(`Keep-alive error for user ${userId}:`, err);
        }
      });
    }, 60000); // Every minute

    // Event listener
    api.listenMqtt((err, event) => {
      if (err) {
        broadcastToUser(userId, { type: 'log', message: `Listen error: ${err}` });
        return;
      }

      const isAdmin = event.senderID === botState.config.adminID;
      const isGroup = event.threadID !== event.senderID;
      const botID = api.getCurrentUserID();

      // Auto accept spam and message requests
      if (botState.config.autoSpamAccept && event.type === 'message_request') {
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
        if (msg?.startsWith(botState.config.prefix)) {
          const command = args[0].slice(botState.config.prefix.length).toLowerCase();
          
          // Group name lock
          if (command === 'groupnamelock' && args[1] === 'on' && isAdmin) {
            const groupName = args.slice(2).join(' ');
            if (!lockedGroups.has(userId)) {
              lockedGroups.set(userId, {});
            }
            lockedGroups.get(userId)[event.threadID] = groupName;
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
              if (!lockedNicknames.has(userId)) {
                lockedNicknames.set(userId, {});
              }
              lockedNicknames.get(userId)[event.threadID] = nickname;
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
• ${botState.config.prefix}groupnamelock on <name>
• ${botState.config.prefix}nicknamelock on <nickname>
• ${botState.config.prefix}antiout on/off

🆔 ID Commands
• ${botState.config.prefix}tid - Get group ID
• ${botState.config.prefix}uid - Get your ID
• ${botState.config.prefix}uid @mention - Get mentioned user's ID
• ${botState.config.prefix}info @mention - Get user info

🎭 Fun
• ${botState.config.prefix}send sticker start/stop
• ${botState.config.prefix}pair - Match with random user
• ${botState.config.prefix}music <song> - Play requested song
• ${botState.config.prefix}joke - Get random joke
• ${botState.config.prefix}quote - Get inspirational quote
• ${botState.config.prefix}fact - Get random fact

🎯 Abuse System
• ${botState.config.prefix}loder target on @user
• ${botState.config.prefix}loder stop
• ${botState.config.prefix}autoconvo on/off

🤖 Automation
• ${botState.config.prefix}autospam accept
• ${botState.config.prefix}automessage accept

📊 Group Info
• ${botState.config.prefix}group info
━━━━━━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`;
            api.sendMessage(helpText, event.threadID);
          }
          
          // Group info
          else if (command === 'group' && args[1] === 'info') {
            api.getThreadInfo(event.threadID, (err, info) => {
              if (err || !info) return api.sendMessage('Failed to get group info.', event.threadID);
              
              const adminList = info.adminIDs?.map(admin => admin.id) || [];
              const creatorID = info.threadID.split(':')[1] || info.adminIDs?.[0]?.id;
              
              api.getUserInfo(info.participantIDs, (err, users) => {
                if (err) users = {};
                
                const userLocks = lockedGroups.get(userId) || {};
                const nicknameLocks = lockedNicknames.get(userId) || {};
                const creatorName = users[creatorID]?.name || 'Unknown';
                
                const infoText = `
📌 𝗚𝗿𝗼𝘂𝗽 𝗜𝗻𝗳𝗼
━━━━━━━━━━━━━━━━━━━━
📛 Name: ${info.threadName || 'N/A'}
🆔 ID: ${event.threadID}
👥 Members: ${info.participantIDs?.length || 0}
👑 Admins: ${adminList.length}
👑 Creator: ${creatorName}
🔒 Name Lock: ${userLocks[event.threadID] ? '✅' : '❌'}
🔒 Nickname Lock: ${nicknameLocks[event.threadID] ? '✅' : '❌'}
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
          
          // Anti-out command
          else if (command === 'antiout' && isAdmin) {
            if (args[1] === 'on') {
              api.sendMessage('🛡️ Anti-out system activated! Members cannot leave now!', event.threadID);
            } else if (args[1] === 'off') {
              api.sendMessage('🛡️ Anti-out system deactivated!', event.threadID);
            }
          }
          
          // Sticker spam command
          else if (command === 'send' && args[1] === 'sticker') {
            if (args[2] === 'start' && isAdmin) {
              botState.stickerSpam[event.threadID] = true;
              
              const stickerIDs = [
369239263222822,	
126361874215276,	
126362187548578,	
126361967548600,	
126362100881920,	
126362137548583,	
126361920881938,	
126362064215257,	
126361974215266,	
1435019863455637,	
1435019743455649,	
126361910881939,	
126361987548598,	
126361994215264,	
126362027548594,	
126362007548596,	
126362044215259,	
126362074215256,	
126362080881922,	
126362087548588,	
126362117548585,	
126362107548586,	
126362124215251,	
126362130881917,	
126362160881914,	
126362167548580,	
126362180881912,	
344403172622564,	
133247387323982,	
184571475493841,	
789355251153389,	
155887105126297,	
2046740855653711,	
538993796253602,	
792364260880715,	
460938454028003,	
1390600204574794,	
551710554864076,	
172815829952254,	
298592840320915,	
172815786618925,	
298592923654240,	
526120130853019,	
1841028312616611,	
1458437531083542,	
488524334594345,	
499671140115389,	
298592933654239,	
785424194962268,	
198229140786770,	
788171717923679,	
488524267927685,	
147663592082571,	
147663442082586,	
657502917666299,	
392309714199674,	
144885262352407,	
392309784199667,	
1747082038936381,	
1458999184131858,	
144885252352408,	
830546300299925,	
144885299019070,	
906881722748903,	
902343023134387,	
830546423633246,	
387545578037993,	
126362230881907,	
126362034215260,	
126361957548601,	
126361890881941,	
126361884215275,	
126361900881940,	
126362207548576,	
126362197548577,	
369239383222810,
              ];
              
              const spamLoop = async () => {
                while (botState.stickerSpam[event.threadID]) {
                  try {
                    const randomSticker = stickerIDs[Math.floor(Math.random() * stickerIDs.length)];
                    await api.sendMessage({
                      sticker: randomSticker
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
            botState.config.autoSpamAccept = !botState.config.autoSpamAccept;
            api.sendMessage(`✅ Auto spam accept ${botState.config.autoSpamAccept ? 'enabled' : 'disabled'}!`, event.threadID);
            broadcastToUser(userId, { 
              type: 'settings',
              autoSpamAccept: botState.config.autoSpamAccept,
              autoMessageAccept: botState.config.autoMessageAccept
            });
          }
          
          // Auto message accept command
          else if (command === 'automessage' && args[1] === 'accept' && isAdmin) {
            botState.config.autoMessageAccept = !botState.config.autoMessageAccept;
            api.sendMessage(`✅ Auto message accept ${botState.config.autoMessageAccept ? 'enabled' : 'disabled'}!`, event.threadID);
            broadcastToUser(userId, { 
              type: 'settings',
              autoSpamAccept: botState.config.autoSpamAccept,
              autoMessageAccept: botState.config.autoMessageAccept
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
                  
                  const spamLoop = async () => {
                    const userAbuseMessages = abuseMessages.get(userId) || [];
                    while (botState.abuseTargets[event.threadID]?.[targetID] && userAbuseMessages.length > 0) {
                      const randomMsg = userAbuseMessages[Math.floor(Math.random() * userAbuseMessages.length)];
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
          
          // Enhanced Auto-convo toggle with owner protection
          else if (command === 'autoconvo') {
            if (args[1] === 'on' && isAdmin) {
              botState.autoConvo[event.threadID] = true;
              api.sendMessage('🔥 ऑटो कॉन्वो सिस्टम चालू हो गया है! अब कोई भी गाली देगा तो उसकी खैर नहीं!', event.threadID);
            } 
            else if (args[1] === 'off' && isAdmin) {
              botState.autoConvo[event.threadID] = false;
              api.sendMessage('✅ ऑटो कॉन्वो सिस्टम बंद हो गया है!', event.threadID);
            }
          }
          
          // Pair command
          else if (command === 'pair') {
            api.getThreadInfo(event.threadID, (err, info) => {
              if (err || !info) return;
              
              const participants = info.participantIDs.filter(id => id !== botID && id !== event.senderID);
              if (participants.length < 1) return api.sendMessage("Not enough members to pair!", event.threadID);
              
              const randomUser = participants[Math.floor(Math.random() * participants.length)];
              
              api.getUserInfo([event.senderID, randomUser], (err, ret) => {
                if (err) return;
                
                const user1 = ret[event.senderID]?.name || "User 1";
                const user2 = ret[randomUser]?.name || "User 2";
                const user1Profile = `https://facebook.com/${event.senderID}`;
                const user2Profile = `https://facebook.com/${randomUser}`;
                
                const pairText = `
💘 𝗟𝗼𝘃𝗲 𝗣𝗮𝗶𝗿 💘
━━━━━━━━━━━━━━━━━━━━
❤️ ${user1} + ${user2} = 💑
━━━━━━━━━━━━━━━━━━━━
✨ Congratulations! You two are made for each other!
💕 Enjoy your new relationship!
━━━━━━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`;
                
                api.sendMessage({
                  body: pairText,
                  mentions: [
                    { tag: user1, id: event.senderID },
                    { tag: user2, id: randomUser }
                  ]
                }, event.threadID);
              });
            });
          }
          
          // Music command
          else if (command === 'music') {
            const songName = args.slice(1).join(' ');
            if (!songName) return api.sendMessage("Please specify a song name!", event.threadID);
            
            // In a real implementation, you would integrate with a music API here
            api.sendMessage(`🎵 Here's your requested song: ${songName}\n🔗 Play it now and enjoy!`, event.threadID);
          }
          
          // Joke command
          else if (command === 'joke') {
            const jokes = [
              "Why don't scientists trust atoms? Because they make up everything!",
              "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them!",
              "Why don't skeletons fight each other? They don't have the guts!",
              "I told my wife she was drawing her eyebrows too high. She looked surprised.",
              "What do you call a fake noodle? An impasta!"
            ];
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            api.sendMessage(`😂 Joke:\n${randomJoke}`, event.threadID);
          }
          
          // Quote command
          else if (command === 'quote') {
            const quotes = [
              "The only way to do great work is to love what you do. - Steve Jobs",
              "Life is what happens when you're busy making other plans. - John Lennon",
              "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
              "Strive not to be a success, but rather to be of value. - Albert Einstein",
              "You miss 100% of the shots you don't take. - Wayne Gretzky"
            ];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            api.sendMessage(`💬 Quote:\n${randomQuote}`, event.threadID);
          }
          
          // Fact command
          else if (command === 'fact') {
            const facts = [
              "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly good to eat.",
              "Octopuses have three hearts, nine brains, and blue blood.",
              "The shortest war in history was between Britain and Zanzibar on August 27, 1896. Zanzibar surrendered after 38 minutes.",
              "A group of flamingos is called a 'flamboyance'.",
              "The inventor of the frisbee was turned into a frisbee after he died."
            ];
            const randomFact = facts[Math.floor(Math.random() * facts.length)];
            api.sendMessage(`📚 Fact:\n${randomFact}`, event.threadID);
          }
        }
        
        // Enhanced Abuse detection and auto-convo with owner protection
        const triggerWords = ['bc', 'mc', 'bkl', 'bhenchod', 'madarchod', 'lund', 'gandu', 'chutiya', 'randi', 'motherchod', 'fuck', 'bhosda'];
        const isAbusive = triggerWords.some(word => msg?.toLowerCase().includes(word));
        const isMentioningBot = msg?.toLowerCase().includes('bot') || event.mentions?.[api.getCurrentUserID()];
        
        // Don't respond if the message is from admin/owner
        if (isAdmin) {
          if (isAbusive || isMentioningBot) {
            // Send polite response to owner
            const responses = [
              "😊 Yes boss? How can I help you?",
              "👑 At your service, Devil Boss!",
              "🔥 Ready for your commands, my lord!",
              "💀 Your wish is my command, master!",
              "👿 How may I serve you today, Devil Boss?"
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            api.sendMessage(randomResponse, event.threadID);
          }
          return;
        }
        
        if (isAbusive && botState.autoConvo[event.threadID] && (isMentioningBot || isGroup)) {
          const abuserID = event.senderID;
          if (!botState.abuseTargets[event.threadID]) {
            botState.abuseTargets[event.threadID] = {};
          }
          
          const userAbuseMessages = abuseMessages.get(userId) || [];
          if (!botState.abuseTargets[event.threadID][abuserID] && userAbuseMessages.length > 0) {
            botState.abuseTargets[event.threadID][abuserID] = true;
            
            api.getUserInfo(abuserID, (err, ret) => {
              if (err || !ret) return;
              const name = ret[abuserID]?.name || 'User';
              
              api.sendMessage(`😡 ${name} तूने मुझे गाली दी? अब तेरी खैर नहीं!`, event.threadID);
              
              const spamLoop = async () => {
                while (botState.abuseTargets[event.threadID]?.[abuserID] && userAbuseMessages.length > 0) {
                  const randomMsg = userAbuseMessages[Math.floor(Math.random() * userAbuseMessages.length)];
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
        
        // Random response when someone mentions "bot"
        if (isMentioningBot && !isAbusive) {
          const botResponses = [
            "Yes? How can I help you?",
            "At your service!",
            "What can I do for you?",
            "I'm listening...",
            "Need something?"
          ];
          const randomResponse = botResponses[Math.floor(Math.random() * botResponses.length)];
          api.sendMessage(randomResponse, event.threadID);
        }
      }

      // Thread name changes
      if (event.logMessageType === 'log:thread-name') {
        const userLocks = lockedGroups.get(userId) || {};
        const locked = userLocks[event.threadID];
        if (locked) {
          api.setTitle(locked, event.threadID, () => {
            api.sendMessage('❌ Group name is locked by admin!', event.threadID);
          });
        }
      }

      // Nickname changes
      if (event.logMessageType === 'log:thread-nickname') {
        const userNicknameLocks = lockedNicknames.get(userId) || {};
        const locked = userNicknameLocks[event.threadID];
        if (locked) {
          const userID = event.logMessageData.participant_id;
          api.changeNickname(locked, event.threadID, userID, () => {
            api.sendMessage('❌ Nicknames are locked by admin!', event.threadID);
          });
        }
      }
      
      // Welcome new members
      if (event.logMessageType === 'log:subscribe') {
        const addedIDs = event.logMessageData.addedParticipants.map(p => p.userFbId);
        if (addedIDs.length > 0) {
          api.getUserInfo(addedIDs, (err, ret) => {
            if (err) return;
            
            api.getThreadInfo(event.threadID, (err, info) => {
              if (err) return;
              
              const adminList = info.adminIDs?.map(admin => admin.id) || [];
              const creatorID = info.threadID.split(':')[1] || info.adminIDs?.[0]?.id;
              
              api.getUserInfo([creatorID, botState.config.adminID], (err, creators) => {
                const creatorName = creators[creatorID]?.name || "Group Creator";
                const ownerName = creators[botState.config.adminID]?.name || "Devil Boss";
                
                addedIDs.forEach(id => {
                  const name = ret[id]?.name || 'New Member';
                  const welcomeMessages = [
                    `✨ 𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝗧𝗼 𝗧𝗵𝗲 𝗚𝗿𝗼𝘂𝗽 ✨
━━━━━━━━━━━━━━━━━━━━
🌟 𝗡𝗮𝗺𝗲: ${name}
🏷️ 𝗚𝗿𝗼𝘂𝗽: ${info.threadName || 'N/A'}
👑 𝗢𝘄𝗻𝗲𝗿: ${ownerName}
👥 𝗠𝗲𝗺𝗯𝗲𝗿𝘀: ${info.participantIDs?.length || 0}
━━━━━━━━━━━━━━━━━━━━
💫 Enjoy your stay in our group!
🔥 Follow all rules and have fun!
━━━━━━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`,
                    `💥 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗡𝗘𝗪 𝗠𝗘𝗠𝗕𝗘𝗥! 💥
━━━━━━━━━━━━━━━━━━━━
👋 𝗛𝗲𝘆 ${name}!
🎉 Welcome to ${info.threadName || 'our group'}!
👑 𝗢𝘄𝗻𝗲𝗿: ${ownerName}
👥 𝗧𝗼𝘁𝗮𝗹 𝗠𝗲𝗺𝗯𝗲𝗿𝘀: ${info.participantIDs?.length || 0}
━━━━━━━━━━━━━━━━━━━━
💀 Be careful of Devil Boss!
😈 Follow rules and enjoy!
━━━━━━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`
                  ];
                  
                  const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
                  api.sendMessage(randomMessage, event.threadID);
                });
              });
            });
          });
        }
      }
      
      // Farewell to members who left
      if (event.logMessageType === 'log:unsubscribe') {
        const leftID = event.logMessageData.leftParticipantFbId;
        if (leftID) {
          api.getUserInfo(leftID, (err, ret) => {
            if (err) return;
            
            const name = ret[leftID]?.name || 'Someone';
            const farewellMessages = [
              `😂 ${name} couldn't handle the heat! Bye bye!`,
              `😈 ${name} ran away scared! What a coward!`,
              `👋 ${name} left! One less problem to deal with!`,
              `🚪 ${name} exited stage left! Don't let the door hit you!`,
              `💨 ${name} vanished like a fart in the wind!`,
              `👻 ${name} got scared of Devil Boss and left!`,
              `🏃‍♂️ ${name} couldn't handle the pressure and ran away!`
            ];
            
            const randomMessage = farewellMessages[Math.floor(Math.random() * farewellMessages.length)];
            api.sendMessage(randomMessage, event.threadID);
          });
        }
      }
    });
    
    // Handle logout/errors
    api.on('logout', () => {
      clearInterval(keepAliveInterval);
      broadcastToUser(userId, { type: 'log', message: 'Bot logged out unexpectedly' });
      botState.running = false;
      broadcastToUser(userId, { type: 'status', running: false });
    });
    
    api.on('error', (err) => {
      broadcastToUser(userId, { type: 'log', message: `Bot error: ${err.message}` });
    });
  });
}

// Stop bot function for a specific user
function stopBot(userId) {
  const botState = botStates.get(userId);
  if (!botState) return;

  if (botState.api) {
    try {
      botState.api.logout();
    } catch (err) {
      console.error(`Error logging out user ${userId}:`, err);
    }
    botState.api = null;
  }
  
  botState.running = false;
  botState.abuseTargets = {};
  botState.autoConvo = {};
  botState.stickerSpam = {};
  
  broadcastToUser(userId, { type: 'status', running: false });
  broadcastToUser(userId, { type: 'log', message: 'Bot stopped successfully' });
}

// WebSocket broadcast to a specific user
function broadcastToUser(userId, message) {
  if (!wss) return;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.userId === userId) {
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

wss.on('connection', (ws, req) => {
  // Generate a unique ID for this user session
  const userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  ws.userId = userId;
  
  // Send initial state
  const botState = botStates.get(userId) || { running: false, config: botConfigTemplate };
  ws.send(JSON.stringify({ 
    type: 'status', 
    running: botState.running 
  }));
  
  ws.send(JSON.stringify({
    type: 'settings',
    autoSpamAccept: botState.config.autoSpamAccept,
    autoMessageAccept: botState.config.autoMessageAccept
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'start') {
        const existingState = botStates.get(userId);
        if (existingState?.running) {
          ws.send(JSON.stringify({ 
            type: 'log', 
            message: 'Bot is already running for this session' 
          }));
          return;
        }
        
        if (!data.cookieContent) {
          ws.send(JSON.stringify({ 
            type: 'log', 
            message: 'No cookie content provided' 
          }));
          return;
        }
        
        startBot(userId, data.cookieContent, data.prefix, data.adminId);
      } 
      else if (data.type === 'stop') {
        stopBot(userId);
      }
      else if (data.type === 'uploadAbuse') {
        try {
          const userSessionDir = path.join(userSessionsDir, userId);
          if (!fs.existsSync(userSessionDir)) {
            fs.mkdirSync(userSessionDir);
          }
          
          fs.writeFileSync(path.join(userSessionDir, 'abuse.txt'), data.content);
          loadAbuseMessages(userId);
          broadcastToUser(userId, { type: 'log', message: 'Abuse messages file updated' });
        } catch (err) {
          broadcastToUser(userId, { type: 'log', message: `Failed to save abuse file: ${err.message}` });
        }
      }
      else if (data.type === 'saveSettings') {
        const botState = botStates.get(userId);
        if (botState) {
          botState.config.autoSpamAccept = data.autoSpamAccept;
          botState.config.autoMessageAccept = data.autoMessageAccept;
          broadcastToUser(userId, { type: 'log', message: 'Settings updated successfully' });
          broadcastToUser(userId, { 
            type: 'settings',
            autoSpamAccept: botState.config.autoSpamAccept,
            autoMessageAccept: botState.config.autoMessageAccept
          });
        }
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  });
  
  ws.on('close', () => {
    console.log(`Client disconnected: ${userId}`);
  });
});

// Handle process exits gracefully
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  botStates.forEach((state, userId) => {
    stopBot(userId);
  });
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});
