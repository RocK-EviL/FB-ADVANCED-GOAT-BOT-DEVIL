const fs = require('fs');
const path = require('path');
const express = require('express');
const wiegine = require('ws3-fca');
const schedule = require('node-schedule');
const WebSocket = require('ws');

// Initialize Express app
const app = express();
const PORT = 3000;

// Bot configuration
let botConfig = {
  prefix: '!',
  adminID: '',
  features: {
    antiLeave: true,
    welcomeMessages: true,
    autoBot: false,
    groupHanger: false,
    autoInsult: true // New feature for auto insults
  },
  targetedHangers: {} // Stores threadID -> targetID mappings
};

// Bot state
let botState = {
  running: false,
  startTime: null,
  api: null,
  uptime: '00:00:00',
  logs: [],
  groups: [],
  autoInsultMode: {} // threadID -> boolean for auto insult mode
};

// WebSocket server
let wss;

// HTML Control Panel (simplified version)
const htmlControlPanel = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Messenger Bot Control Panel</title>
    <style>
        /* Simplified CSS styles */
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .btn {
            padding: 10px 15px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            margin: 5px 0;
            width: 100%;
        }
        .btn-primary {
            background-color: #1877f2;
            color: white;
        }
        .btn-danger {
            background-color: #e74c3c;
            color: white;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 5px;
        }
        .status-online {
            background-color: #42b72a;
        }
        .status-offline {
            background-color: #e74c3c;
        }
        .log-container {
            height: 300px;
            overflow-y: auto;
            background-color: #1c1e21;
            color: #00ff00;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h2>Bot Status</h2>
            <p>
                <span class="status-indicator status-offline" id="status-indicator"></span>
                <span id="status-text">Offline</span>
            </p>
            <div class="form-group">
                <label for="cookie-file">Cookie File</label>
                <input type="file" id="cookie-file" accept=".txt,.json">
            </div>
            <div class="form-group">
                <label for="prefix">Command Prefix</label>
                <input type="text" id="prefix" value="${botConfig.prefix}">
            </div>
            <div class="form-group">
                <label for="admin-id">Admin ID</label>
                <input type="text" id="admin-id" value="${botConfig.adminID}">
            </div>
            <button class="btn btn-primary" id="start-btn">Start Bot</button>
            <button class="btn btn-danger" id="stop-btn" disabled>Stop Bot</button>
        </div>
        
        <div class="card">
            <h2>Logs</h2>
            <div class="log-container" id="log-container"></div>
        </div>
    </div>

    <script>
        const socket = new WebSocket('ws://' + window.location.host);
        
        // DOM Elements
        const logContainer = document.getElementById('log-container');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        const cookieFileInput = document.getElementById('cookie-file');
        
        // WebSocket handlers
        socket.onopen = () => {
            addLog('Connected to bot server', 'info');
        };
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch(data.type) {
                case 'log':
                    addLog(data.message, data.level);
                    break;
                case 'status':
                    updateStatus(data.running);
                    break;
                case 'uptime':
                    document.getElementById('uptime-display').textContent = data.uptime;
                    break;
            }
        };
        
        // Helper functions
        function addLog(message, type = 'info') {
            const logEntry = document.createElement('div');
            logEntry.textContent = \`[\${new Date().toLocaleTimeString()}] \${message}\`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        function updateStatus(running) {
            statusIndicator.className = \`status-indicator status-\${running ? 'online' : 'offline'}\`;
            statusText.textContent = running ? 'Online' : 'Offline';
            startBtn.disabled = running;
            stopBtn.disabled = !running;
        }
        
        // Event listeners
        startBtn.addEventListener('click', () => {
            if (cookieFileInput.files.length === 0) {
                addLog('Please select a cookie file', 'error');
                return;
            }
            
            const file = cookieFileInput.files[0];
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
    </script>
</body>
</html>
`;

// Bot functionality containers
const lockedGroups = {};
const lockedNicknames = {};
const hangerThreads = new Set();
let hangerInterval;

// Load insult messages
const insults = fs.readFileSync('hindi1.txt', 'utf8').split('\n').filter(line => line.trim());

// Start bot function
function startBot(cookieContent, prefix, adminID) {
  botState.running = true;
  botState.startTime = Date.now();
  
  try {
    fs.writeFileSync('selected_cookie.txt', cookieContent);
    broadcast({ type: 'log', message: '✅ Cookie file saved', level: 'success' });
  } catch (err) {
    broadcast({ type: 'log', message: `❌ Failed to save cookie: ${err.message}`, level: 'error' });
    botState.running = false;
    return;
  }

  wiegine.login(cookieContent, {}, (err, api) => {
    if (err || !api) {
      broadcast({ type: 'log', message: `❌ Login failed: ${err?.message || err}`, level: 'error' });
      botState.running = false;
      return;
    }

    botState.api = api;
    broadcast({ type: 'log', message: '✅ Bot logged in and running...', level: 'success' });
    
    api.setOptions({ listenEvents: true });

    // Start hanger interval if enabled
    if (botConfig.features.groupHanger) {
      hangerInterval = setInterval(() => processHangerMessages(), 30000);
    }

    // Event listener
    api.listenMqtt((err, event) => {
      if (err) {
        broadcast({ type: 'log', message: `❌ Listen error: ${err}`, level: 'error' });
        return;
      }

      // Welcome message
      if (botConfig.features.welcomeMessages && event.logMessageType === 'log:subscribe') {
        const newUserID = event.logMessageData?.addedParticipants?.[0]?.userFbId;
        if (newUserID) {
          api.getUserInfo(newUserID, (err, info) => {
            if (err) return;
            const name = info?.[newUserID]?.name || 'User';
            api.sendMessage(`❤️ WELCOME TO OUR GROUP ${name}!`, event.threadID);
          });
        }
      }

      // Goodbye + Anti-leave
      if (botConfig.features.antiLeave && event.logMessageType === 'log:unsubscribe') {
        const leftUserID = event.logMessageData.leftParticipantFbId;
        if (leftUserID === api.getCurrentUserID()) return;
        
        api.getUserInfo(leftUserID, (err, info) => {
          const name = info?.[leftUserID]?.name || 'User';
          api.sendMessage(`🤣 ${name} left this group...!!`, event.threadID);
        });

        api.addUserToGroup(leftUserID, event.threadID, (err) => {
          if (err) {
            api.sendMessage('⚠️ User left but could not be re-added.', event.threadID);
          } else {
            api.sendMessage('🔁 User re-added automatically by Anti-Leave System.', event.threadID);
          }
        });
      }

      // Message handling
      if (event.type === 'message') {
        const msg = event.body?.trim().toLowerCase();
        const senderID = event.senderID;
        const threadID = event.threadID;
        
        // Check if bot is mentioned and handle insults
        if (botConfig.features.autoInsult && (msg.includes('bot') || msg.includes(api.getCurrentUserID()))) {
          const randomInsult = insults[Math.floor(Math.random() * insults.length)];
          const mentionTag = `@${event.senderName.replace(/\s+/g, '')}`;
          
          api.sendMessage({
            body: `${mentionTag} ${randomInsult}\n\nWar mode on! Say "sorry devil papa" to stop.`,
            mentions: [{
              tag: mentionTag,
              id: senderID,
              fromIndex: 0
            }]
          }, threadID);
          
          // Enable auto insult mode for this thread
          botState.autoInsultMode[threadID] = true;
          return;
        }
        
        // Auto insult mode - respond to any message from user who insulted
        if (botState.autoInsultMode[threadID] && senderID !== api.getCurrentUserID()) {
          if (msg.toLowerCase().includes('sorry devil papa')) {
            api.sendMessage('Okay, I forgive you this time.', threadID);
            delete botState.autoInsultMode[threadID];
          } else {
            const randomInsult = insults[Math.floor(Math.random() * insults.length)];
            const mentionTag = `@${event.senderName.replace(/\s+/g, '')}`;
            
            api.sendMessage({
              body: `${mentionTag} ${randomInsult}`,
              mentions: [{
                tag: mentionTag,
                id: senderID,
                fromIndex: 0
              }]
            }, threadID);
          }
          return;
        }

        if (msg?.startsWith(botConfig.prefix)) {
          const args = msg.slice(botConfig.prefix.length).trim().split(' ');
          const command = args[0].toLowerCase();
          const isAdmin = senderID === botConfig.adminID;

          // Public commands
          if (command === 'help') {
            const helpText = `
🛠️ BOT COMMANDS MENU
━━━━━━━━━━━━━━━━━━━━
🔒 Group Name Lock (Admin only)
• ${botConfig.prefix}groupnamelock on <name>
👥 Nickname Lock (Admin only)
• ${botConfig.prefix}nicknamelock on <nickname>
📌 Grouphanger System (Admin only)
• ${botConfig.prefix}grouphanger on/off
• ${botConfig.prefix}grouphanger target @user
• ${botConfig.prefix}grouphanger stop
🌀 Auto Insult Mode
• Mention bot to activate
👋 Welcome + Anti-Leave System
• Automatic join/leave messages
📶 Uptime Status
• ${botConfig.prefix}uptime
ℹ️ User Info
• ${botConfig.prefix}info
━━━━━━━━━━━━━━━━━━━━`;
            return api.sendMessage(helpText, threadID);
          }

          if (command === 'uptime') {
            const uptimeMs = Date.now() - botState.startTime;
            const seconds = Math.floor((uptimeMs / 1000) % 60);
            const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
            const hours = Math.floor(uptimeMs / (1000 * 60 * 60) % 24);
            const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));

            const uptimeText = `
📡 Bot Uptime Status
━━━━━━━━━━━━━━━
🕐 Days: ${days}
⏰ Hours: ${hours}
🕒 Minutes: ${minutes}
⏱️ Seconds: ${seconds}
━━━━━━━━━━━━━━━`;
            return api.sendMessage(uptimeText, threadID);
          }

          if (command === 'info') {
            api.getUserInfo(senderID, (err, ret) => {
              if (err || !ret) return api.sendMessage('❌ Failed to get user info.', threadID);
              const user = ret[senderID];
              const infoText = `
👤 User Info
━━━━━━━━━━━━━━━
📛 Name: ${user.name}
🆔 ID: ${senderID}
👫 Gender: ${user.gender || 'N/A'}
🔗 Profile: https://facebook.com/${senderID}
━━━━━━━━━━━━━━━`;
              api.sendMessage(infoText, threadID);
            });
            return;
          }

          // Admin-only commands
          if (!isAdmin) return api.sendMessage('❌ Unauthorized. This command is admin-only.', threadID);
          
          if (command === 'grouphanger') {
            if (args[1] === 'on') {
              hangerThreads.add(threadID);
              api.sendMessage('Group hanger enabled for this group.', threadID);
            } 
            else if (args[1] === 'off') {
              hangerThreads.delete(threadID);
              api.sendMessage('Group hanger disabled for this group.', threadID);
            }
            else if (args[1] === 'target' && args[2] && event.mentions) {
              const targetID = Object.keys(event.mentions)[0];
              if (targetID) {
                botConfig.targetedHangers[threadID] = targetID;
                api.sendMessage(`Targeted hanger enabled for ${event.mentions[targetID]}`, threadID);
              } else {
                api.sendMessage('⚠️ Please mention a user to target', threadID);
              }
            }
            else if (args[1] === 'stop') {
              if (botConfig.targetedHangers[threadID]) {
                delete botConfig.targetedHangers[threadID];
                api.sendMessage('Targeted hanger stopped', threadID);
              } else {
                api.sendMessage('No targeted hanger active', threadID);
              }
            }
            else {
              api.sendMessage('⚠️ Use: grouphanger on/off/target @user/stop', threadID);
            }
            return;
          }

          if (command === 'autoloader') {
            if (args[1] === 'on') {
              botState.autoInsultMode[threadID] = true;
              api.sendMessage('Auto insult mode enabled for this group.', threadID);
            } else if (args[1] === 'off') {
              delete botState.autoInsultMode[threadID];
              api.sendMessage('Auto insult mode disabled for this group.', threadID);
            } else {
              api.sendMessage('⚠️ Use: autoloader on/off', threadID);
            }
            return;
          }

          if (command === 'groupnamelock' && args[1] === 'on') {
            const groupName = args.slice(2).join(' ');
            lockedGroups[threadID] = groupName;
            api.setTitle(groupName, threadID, (err) => {
              if (err) return api.sendMessage('❌ Failed to lock group name.', threadID);
              api.sendMessage(`🔒 Group name locked: ${groupName}`, threadID);
            });
          } else if (command === 'nicknamelock' && args[1] === 'on') {
            const nickname = args.slice(2).join(' ');
            api.getThreadInfo(threadID, (err, info) => {
              if (err) return console.error('❌ Thread info error:', err);
              info.participantIDs.forEach((userID, i) => {
                setTimeout(() => {
                  api.changeNickname(nickname, threadID, userID, () => {});
                }, i * 2000);
              });
              lockedNicknames[threadID] = nickname;
              api.sendMessage(`✅ Nicknames locked: ${nickname}`, threadID);
            });
          }
        }
      }
      
      // Thread name changes
      if (event.logMessageType === 'log:thread-name') {
        const locked = lockedGroups[event.threadID];
        if (locked) {
          api.setTitle(locked, event.threadID, () => {
            api.sendMessage('❌ Name change not allowed.', event.threadID);
          });
        }
      }

      // Nickname changes
      if (event.logMessageType === 'log:thread-nickname') {
        const locked = lockedNicknames[event.threadID];
        if (locked) {
          const userID = event.logMessageData.participant_id;
          api.changeNickname(locked, event.threadID, userID, () => {
            api.sendMessage('❌ Nickname reverted.', event.threadID);
          });
        }
      }
    });

    // Update groups list periodically
    setInterval(() => {
      api.getThreadList(25, null, ['INBOX'], (err, threads) => {
        if (!err && threads) {
          botState.groups = threads.map(t => ({
            name: t.threadName || 'Unnamed Group',
            id: t.threadID,
            members: t.participantIDs?.length || 0
          }));
          broadcast({ type: 'groups', groups: botState.groups });
        }
      });
    }, 30000);
  });
}

// Process hanger messages
async function processHangerMessages() {
  if (!botState.api || !botConfig.features.groupHanger || 
      (hangerThreads.size === 0 && Object.keys(botConfig.targetedHangers).length === 0)) return;

  try {
    const hangerContent = fs.readFileSync('hanger.txt', 'utf8').trim();
    if (!hangerContent) {
      broadcast({ type: 'log', message: 'hanger.txt is empty', level: 'warning' });
      return;
    }

    const lines = hangerContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) return;

    // Process regular hanger threads
    for (const threadID of hangerThreads) {
      for (const line of lines) {
        if (!botState.running || !hangerThreads.has(threadID)) break;
        
        try {
          await botState.api.sendMessage(line, threadID);
          await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (err) {
          hangerThreads.delete(threadID);
          break;
        }
      }
    }

    // Process targeted hanger threads
    for (const threadID in botConfig.targetedHangers) {
      const targetID = botConfig.targetedHangers[threadID];
      
      try {
        // Get user info for the mention
        const userInfo = await new Promise(resolve => {
          botState.api.getUserInfo(targetID, (err, ret) => {
            if (err) return resolve(null);
            resolve(ret[targetID]);
          });
        });

        if (!userInfo) {
          delete botConfig.targetedHangers[threadID];
          continue;
        }

        for (const line of lines) {
          if (!botState.running || !botConfig.targetedHangers[threadID]) break;
          
          // Create mention tag
          const mentionTag = `@${userInfo.name.replace(/\s+/g, '')}`;
          const message = `${mentionTag} ${line}`;
          
          try {
            await botState.api.sendMessage({
              body: message,
              mentions: [{
                tag: mentionTag,
                id: targetID,
                fromIndex: 0
              }]
            }, threadID);
            
            await new Promise(resolve => setTimeout(resolve, 30000));
          } catch (err) {
            delete botConfig.targetedHangers[threadID];
            break;
          }
        }
      } catch (err) {
        delete botConfig.targetedHangers[threadID];
      }
    }
  } catch (err) {
    broadcast({ type: 'log', message: `Hanger system error: ${err.message}`, level: 'error' });
  }
}

// Stop bot function
function stopBot() {
  if (botState.api) {
    botState.api.logout();
    botState.api = null;
  }
  if (hangerInterval) {
    clearInterval(hangerInterval);
    hangerInterval = null;
  }
  botState.running = false;
  hangerThreads.clear();
  botConfig.targetedHangers = {};
  botState.autoInsultMode = {};
  broadcast({ type: 'status', running: false });
  broadcast({ type: 'log', message: 'Bot stopped', level: 'info' });
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

// Update uptime periodically
setInterval(() => {
  if (botState.running && botState.startTime) {
    const uptimeMs = Date.now() - botState.startTime;
    const seconds = Math.floor((uptimeMs / 1000) % 60);
    const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60) % 24);
    const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    
    botState.uptime = `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    broadcast({ type: 'uptime', uptime: botState.uptime });
  }
}, 1000);

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
  // Send initial state
  ws.send(JSON.stringify({ 
    type: 'status', 
    running: botState.running 
  }));
  
  ws.send(JSON.stringify({ 
    type: 'uptime', 
    uptime: botState.uptime 
  }));
  
  // Send recent logs
  botState.logs.forEach(log => {
    ws.send(JSON.stringify(log));
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch(data.type) {
        case 'start':
          botConfig.prefix = data.prefix;
          botConfig.adminID = data.adminId;
          
          try {
            if (!data.cookieContent) throw new Error('No cookie content provided');
            startBot(data.cookieContent, botConfig.prefix, botConfig.adminID);
            broadcast({ type: 'status', running: true });
          } catch (err) {
            broadcast({ type: 'log', message: `❌ Error with cookie: ${err.message}`, level: 'error' });
          }
          break;
          
        case 'stop':
          stopBot();
          break;
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  });
});

// Error handling
process.on('uncaughtException', (err) => {
  broadcast({ type: 'log', message: `🚨 Uncaught Exception: ${err.message}`, level: 'error' });
});

process.on('unhandledRejection', (reason) => {
  broadcast({ type: 'log', message: `🚨 Unhandled Rejection: ${reason}`, level: 'error' });
});
