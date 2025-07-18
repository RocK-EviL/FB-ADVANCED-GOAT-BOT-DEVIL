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
  prayerTimes: {
    morning: '0 5 * * *',
    afternoon: '0 12 * * *',
    evening: '0 18 * * *',
    night: '0 21 * * *'
  },
  features: {
    prayerReminders: true,
    antiLeave: true,
    welcomeMessages: true,
    autoBot: false,
    groupHanger: false,
    emojiReactions: true
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
  groups: []
};

// WebSocket server
let wss;

// HTML Control Panel (same as before)
const htmlControlPanel = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Messenger Bot Control Panel</title>
    <style>
        :root {
            --primary: #1877f2;
            --secondary: #42b72a;
            --dark: #1c1e21;
            --light: #f0f2f5;
            --danger: #e74c3c;
            --warning: #f39c12;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background-color: var(--light);
            color: var(--dark);
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            background-color: var(--primary);
            color: white;
            padding: 15px 0;
            text-align: center;
            border-radius: 8px 8px 0 0;
            margin-bottom: 20px;
        }
        
        .panel {
            display: grid;
            grid-template-columns: 300px 1fr;
            gap: 20px;
        }
        
        .sidebar {
            background-color: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .main-content {
            background-color: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .card {
            background-color: var(--light);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }
        
        h1, h2, h3 {
            margin-bottom: 15px;
        }
        
        .btn {
            display: inline-block;
            padding: 10px 15px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 600;
            text-align: center;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background-color: var(--primary);
            color: white;
        }
        
        .btn-secondary {
            background-color: var(--secondary);
            color: white;
        }
        
        .btn-danger {
            background-color: var(--danger);
            color: white;
        }
        
        .btn-warning {
            background-color: var(--warning);
            color: white;
        }
        
        .btn-block {
            display: block;
            width: 100%;
            margin-bottom: 10px;
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
        }
        
        input, select, textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 5px;
        }
        
        .status-online {
            background-color: var(--secondary);
        }
        
        .status-offline {
            background-color: var(--danger);
        }
        
        .log-container {
            height: 300px;
            overflow-y: auto;
            background-color: var(--dark);
            color: #00ff00;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            margin-bottom: 15px;
        }
        
        .log-entry {
            margin-bottom: 5px;
        }
        
        .log-error {
            color: #ff0000;
        }
        
        .log-success {
            color: #00ff00;
        }
        
        .log-warning {
            color: #ffff00;
        }
        
        .log-info {
            color: #00ffff;
        }
        
        .feature-toggle {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .switch {
            position: relative;
            display: inline-block;
            width: 60px;
            height: 34px;
        }
        
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 34px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 26px;
            width: 26px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: var(--primary);
        }
        
        input:checked + .slider:before {
            transform: translateX(26px);
        }
        
        .tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
        }
        
        .tab {
            padding: 10px 20px;
            cursor: pointer;
            border-bottom: 3px solid transparent;
        }
        
        .tab.active {
            border-bottom: 3px solid var(--primary);
            font-weight: bold;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .stat-card {
            display: flex;
            justify-content: space-between;
            padding: 15px;
            background-color: var(--light);
            border-radius: 8px;
            margin-bottom: 15px;
        }
        
        .stat-value {
            font-size: 24px;
            font-weight: bold;
        }
        
        .group-list {
            list-style: none;
        }
        
        .group-item {
            padding: 10px;
            border-bottom: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
        }
        
        .group-item:last-child {
            border-bottom: none;
        }
        
        @media (max-width: 768px) {
            .panel {
                grid-template-columns: 1fr;
            }
        }
        
        /* File input styling */
        input[type="file"] {
            padding: 3px;
        }
        
        small {
            display: block;
            margin-top: 5px;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <header>
        <h1>Messenger Bot Control Panel</h1>
    </header>
    
    <div class="container">
        <div class="panel">
            <div class="sidebar">
                <div class="card">
                    <h3>Bot Status</h3>
                    <p>
                        <span class="status-indicator status-offline" id="status-indicator"></span>
                        <span id="status-text">Offline</span>
                    </p>
                    <div class="form-group">
                        <label for="cookie-file">Cookie File</label>
                        <input type="file" id="cookie-file" accept=".txt,.json">
                        <small>Select your cookie file (txt or json)</small>
                    </div>
                    <div class="form-group">
                        <label for="prefix">Command Prefix</label>
                        <input type="text" id="prefix" value="${botConfig.prefix}" placeholder="Enter command prefix">
                    </div>
                    <div class="form-group">
                        <label for="admin-id">Admin ID</label>
                        <input type="text" id="admin-id" placeholder="Enter admin Facebook ID" value="${botConfig.adminID}">
                    </div>
                    <button class="btn btn-primary btn-block" id="start-btn">Start Bot</button>
                    <button class="btn btn-danger btn-block" id="stop-btn" disabled>Stop Bot</button>
                </div>
                
                <div class="card">
                    <h3>Quick Actions</h3>
                    <button class="btn btn-secondary btn-block" id="send-test-msg">Send Test Message</button>
                    <button class="btn btn-secondary btn-block" id="get-groups">Refresh Group List</button>
                    <button class="btn btn-warning btn-block" id="clear-logs">Clear Logs</button>
                </div>
                
                <div class="card">
                    <h3>Uptime</h3>
                    <div id="uptime-display">${botState.uptime}</div>
                </div>
            </div>
            
            <div class="main-content">
                <div class="tabs">
                    <div class="tab active" data-tab="logs">Logs</div>
                    <div class="tab" data-tab="groups">Groups</div>
                    <div class="tab" data-tab="settings">Settings</div>
                    <div class="tab" data-tab="features">Features</div>
                </div>
                
                <div class="tab-content active" id="logs-tab">
                    <div class="log-container" id="log-container"></div>
                </div>
                
                <div class="tab-content" id="groups-tab">
                    <h3>Active Groups</h3>
                    <div class="card">
                        <ul class="group-list" id="group-list">
                            ${botState.groups.length > 0 ? 
                              botState.groups.map(g => `<li class="group-item"><span>${g.name}</span><span>${g.members} members</span></li>`).join('') : 
                              '<li class="group-item">No groups loaded</li>'}
                        </ul>
                    </div>
                </div>
                
                <div class="tab-content" id="settings-tab">
                    <h3>Bot Configuration</h3>
                    <div class="card">
                        <div class="form-group">
                            <label for="prayer-reminder">Prayer Reminder Times</label>
                            <div class="form-group">
                                <label>Morning</label>
                                <input type="text" id="morning-time" value="${botConfig.prayerTimes.morning}" placeholder="Cron expression">
                            </div>
                            <div class="form-group">
                                <label>Afternoon</label>
                                <input type="text" id="afternoon-time" value="${botConfig.prayerTimes.afternoon}" placeholder="Cron expression">
                            </div>
                            <div class="form-group">
                                <label>Evening</label>
                                <input type="text" id="evening-time" value="${botConfig.prayerTimes.evening}" placeholder="Cron expression">
                            </div>
                            <div class="form-group">
                                <label>Night</label>
                                <input type="text" id="night-time" value="${botConfig.prayerTimes.night}" placeholder="Cron expression">
                            </div>
                        </div>
                        <button class="btn btn-primary" id="save-settings">Save Settings</button>
                    </div>
                </div>
                
                <div class="tab-content" id="features-tab">
                    <h3>Feature Toggles</h3>
                    <div class="card">
                        <div class="feature-toggle">
                            <span>Prayer Reminders</span>
                            <label class="switch">
                                <input type="checkbox" id="prayer-toggle" ${botConfig.features.prayerReminders ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="feature-toggle">
                            <span>Anti-Leave System</span>
                            <label class="switch">
                                <input type="checkbox" id="antileave-toggle" ${botConfig.features.antiLeave ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="feature-toggle">
                            <span>Welcome Messages</span>
                            <label class="switch">
                                <input type="checkbox" id="welcome-toggle" ${botConfig.features.welcomeMessages ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="feature-toggle">
                            <span>AutoBot Replies</span>
                            <label class="switch">
                                <input type="checkbox" id="autobot-toggle" ${botConfig.features.autoBot ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="feature-toggle">
                            <span>Group Hanger</span>
                            <label class="switch">
                                <input type="checkbox" id="hanger-toggle" ${botConfig.features.groupHanger ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="feature-toggle">
                            <span>Emoji Reactions</span>
                            <label class="switch">
                                <input type="checkbox" id="emoji-toggle" ${botConfig.features.emojiReactions ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
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
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        const uptimeDisplay = document.getElementById('uptime-display');
        const sendTestMsgBtn = document.getElementById('send-test-msg');
        const getGroupsBtn = document.getElementById('get-groups');
        const clearLogsBtn = document.getElementById('clear-logs');
        const groupList = document.getElementById('group-list');
        const saveSettingsBtn = document.getElementById('save-settings');
        const cookieFileInput = document.getElementById('cookie-file');
        
        // WebSocket handlers
        socket.onopen = () => {
            addLog('Connected to bot server', 'success');
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
                    uptimeDisplay.textContent = data.uptime;
                    break;
                case 'groups':
                    updateGroupList(data.groups);
                    break;
                case 'config':
                    updateConfig(data.config);
                    break;
            }
        };
        
        socket.onclose = () => {
            addLog('Disconnected from bot server', 'error');
            updateStatus(false);
        };
        
        // Helper functions
        function addLog(message, type = 'info') {
            const logEntry = document.createElement('div');
            logEntry.className = \`log-entry log-\${type}\`;
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
        
        function updateGroupList(groups) {
            groupList.innerHTML = '';
            
            if (groups.length === 0) {
                groupList.innerHTML = '<li class="group-item">No active groups found</li>';
                return;
            }
            
            groups.forEach(group => {
                const groupItem = document.createElement('li');
                groupItem.className = 'group-item';
                groupItem.innerHTML = \`
                    <span>\${group.name}</span>
                    <span>\${group.members} members</span>
                \`;
                groupList.appendChild(groupItem);
            });
        }
        
        function updateConfig(config) {
            document.getElementById('prefix').value = config.prefix;
            document.getElementById('admin-id').value = config.adminID;
            
            document.getElementById('morning-time').value = config.prayerTimes.morning;
            document.getElementById('afternoon-time').value = config.prayerTimes.afternoon;
            document.getElementById('evening-time').value = config.prayerTimes.evening;
            document.getElementById('night-time').value = config.prayerTimes.night;
            
            document.getElementById('prayer-toggle').checked = config.features.prayerReminders;
            document.getElementById('antileave-toggle').checked = config.features.antiLeave;
            document.getElementById('welcome-toggle').checked = config.features.welcomeMessages;
            document.getElementById('autobot-toggle').checked = config.features.autoBot;
            document.getElementById('hanger-toggle').checked = config.features.groupHanger;
            document.getElementById('emoji-toggle').checked = config.features.emojiReactions;
        }
        
        // Event listeners
        startBtn.addEventListener('click', () => {
            if (cookieFileInput.files.length === 0) {
                addLog('❌ Please select a cookie file', 'error');
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
            
            reader.onerror = () => {
                addLog('❌ Error reading cookie file', 'error');
            };
            
            reader.readAsText(file);
        });
        
        stopBtn.addEventListener('click', () => {
            socket.send(JSON.stringify({ type: 'stop' }));
        });
        
        sendTestMsgBtn.addEventListener('click', () => {
            socket.send(JSON.stringify({ type: 'testMessage' }));
        });
        
        getGroupsBtn.addEventListener('click', () => {
            socket.send(JSON.stringify({ type: 'getGroups' }));
        });
        
        clearLogsBtn.addEventListener('click', () => {
            logContainer.innerHTML = '';
            addLog('Logs cleared', 'info');
        });
        
        saveSettingsBtn.addEventListener('click', () => {
            const morningTime = document.getElementById('morning-time').value;
            const afternoonTime = document.getElementById('afternoon-time').value;
            const eveningTime = document.getElementById('evening-time').value;
            const nightTime = document.getElementById('night-time').value;
            
            socket.send(JSON.stringify({
                type: 'saveSettings',
                prayerTimes: { 
                    morningTime, 
                    afternoonTime, 
                    eveningTime, 
                    nightTime 
                }
            }));
        });
        
        // Feature toggles
        document.getElementById('prayer-toggle').addEventListener('change', (e) => {
            socket.send(JSON.stringify({
                type: 'toggleFeature',
                feature: 'prayerReminders',
                enabled: e.target.checked
            }));
        });
        
        document.getElementById('antileave-toggle').addEventListener('change', (e) => {
            socket.send(JSON.stringify({
                type: 'toggleFeature',
                feature: 'antiLeave',
                enabled: e.target.checked
            }));
        });
        
        document.getElementById('welcome-toggle').addEventListener('change', (e) => {
            socket.send(JSON.stringify({
                type: 'toggleFeature',
                feature: 'welcomeMessages',
                enabled: e.target.checked
            }));
        });
        
        document.getElementById('autobot-toggle').addEventListener('change', (e) => {
            socket.send(JSON.stringify({
                type: 'toggleFeature',
                feature: 'autoBot',
                enabled: e.target.checked
            }));
        });
        
        document.getElementById('hanger-toggle').addEventListener('change', (e) => {
            socket.send(JSON.stringify({
                type: 'toggleFeature',
                feature: 'groupHanger',
                enabled: e.target.checked
            }));
        });
        
        document.getElementById('emoji-toggle').addEventListener('change', (e) => {
            socket.send(JSON.stringify({
                type: 'toggleFeature',
                feature: 'emojiReactions',
                enabled: e.target.checked
            }));
        });
        
        // Tab switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(\`\${tab.dataset.tab}-tab\`).classList.add('active');
            });
        });
        
        // Initial log
        addLog('Control panel initialized. Ready to connect to bot.', 'info');
    </script>
</body>
</html>
`;

// Bot functionality containers
const lockedGroups = {};
const lockedNicknames = {};
const hangerThreads = new Set();
const emojiReactEnabledGroups = new Set();
let hangerInterval;

// Function to send prayer reminders with Hindu elements
function sendPrayerReminder(api, prayerName) {
  let shlokas = [];
  try {
    shlokas = fs.readFileSync('shlokas.txt', 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [sanskrit, hindi] = line.split('|');
        return { sanskrit, hindi };
      });
  } catch (err) {
    broadcast({ type: 'log', message: `Error reading shlokas: ${err.message}`, level: 'error' });
  }

  const random = shlokas.length
    ? shlokas[Math.floor(Math.random() * shlokas.length)]
    : { sanskrit: '🕉️', hindi: '' };

  const msg = `🕉️ ${prayerName} Prayer Time!
━━━━━━━━━━━━━━
📢 Leave all work! It's time for prayer.
📖 Shloka of the Day
---
"${random.sanskrit}"
"${random.hindi}"
━━━━━━━━━━━━━━
🙏 भगवान हम सभी को अच्छे कर्म करने की प्रेरणा दें।`;

  api.getThreadList(10, null, ['INBOX'], (err, threads) => {
    if (err) {
      broadcast({ type: 'log', message: `Error getting threads: ${err.message}`, level: 'error' });
      return;
    }
    if (threads?.length) {
      threads.forEach(t => {
        try {
          api.sendMessage(msg, t.threadID);
        } catch (err) {
          broadcast({ type: 'log', message: `Error sending message: ${err.message}`, level: 'error' });
        }
      });
    }
  });
}

// Improved hanger message processing with targeted hanger
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
          broadcast({ 
            type: 'log', 
            message: `Sent hanger message to ${threadID}: ${line.substring(0, 30)}${line.length > 30 ? '...' : ''}`,
            level: 'info' 
          });
          
          await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (err) {
          broadcast({ 
            type: 'log', 
            message: `Failed to send hanger message: ${err.message}`,
            level: 'error' 
          });
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
            
            broadcast({ 
              type: 'log', 
              message: `Sent targeted hanger to ${userInfo.name} in ${threadID}`,
              level: 'info' 
            });
            
            await new Promise(resolve => setTimeout(resolve, 30000));
          } catch (err) {
            broadcast({ 
              type: 'log', 
              message: `Failed to send targeted hanger: ${err.message}`,
              level: 'error' 
            });
            delete botConfig.targetedHangers[threadID];
            break;
          }
        }
      } catch (err) {
        broadcast({ 
          type: 'log', 
          message: `Error in targeted hanger: ${err.message}`,
          level: 'error' 
        });
        delete botConfig.targetedHangers[threadID];
      }
    }
  } catch (err) {
    broadcast({ 
      type: 'log', 
      message: `Hanger system error: ${err.message}`,
      level: 'error' 
    });
  }
}

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

    // Schedule prayer reminders if enabled
    if (botConfig.features.prayerReminders) {
      for (const [prayer, cron] of Object.entries(botConfig.prayerTimes)) {
        schedule.scheduleJob(cron, () => {
          if (botConfig.features.prayerReminders) {
            sendPrayerReminder(api, prayer.charAt(0).toUpperCase() + prayer.slice(1));
          }
        });
        broadcast({ type: 'log', message: `Scheduled ${prayer} reminder`, level: 'info' });
      }
    }

    // Start hanger interval
    hangerInterval = setInterval(() => processHangerMessages(), 30000);

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
            api.sendMessage(`❤️ WELCOME TO OUR GROUP ${name}! I'm Chitti Robo. 𝗗𝗘𝗩𝗘𝗟𝗢𝗣𝗘𝗗 𝗕𝗬: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`, event.threadID);

            if (/bot|test/i.test(name)) {
              api.removeUserFromGroup(newUserID, event.threadID);
              api.sendMessage(`❌ Suspicious bot removed: ${name}`, event.threadID);
            }
          });
        }
      }

      // Goodbye + Anti-leave
      if (botConfig.features.antiLeave && event.logMessageType === 'log:unsubscribe') {
        const leftUserID = event.logMessageData.leftParticipantFbId;
        if (leftUserID === api.getCurrentUserID()) return;
        
        api.getUserInfo(leftUserID, (err, info) => {
          const name = info?.[leftUserID]?.name || 'User';
          api.sendMessage(`🤣 ${name} left this group...!! अच्छा है एक चुतिया कम हुआ बेटीचोद 😒👍`, event.threadID);
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

// Abuse war system: start war on abuse, stop on sorry
const abuseLines = fs.readFileSync('abuse.txt', 'utf8').split('\n').filter(l => l.trim());
const triggerWords = ['bc', 'mc', 'bkl', 'bhenchod', 'madarchod', 'lund', 'gandu','teri ma ki chut','teri bahen ka bhosda','randi ke bacche','chutiya','bot chumtiya','aukkat less','bekar','chii','muth dunga','muth dunga muh me','maa chuda','jhatu','tere didi ki chut','jhat ka','teri man ki chut','chup re madrachod','ki ma ka bhoxda','teri ma ka bhosda'];
const isMentioningBot = event.body?.toLowerCase().includes('bot') || event.mentions?.[api.getCurrentUserID()];
const isAbusive = triggerWords.some(word => event.body?.toLowerCase().includes(word));

if (!botState.abuseTargets) botState.abuseTargets = {};

// WAR START LOGIC
if (isMentioningBot && isAbusive) {
  const abuserID = event.senderID;
  const threadID = event.threadID;

  if (!botState.abuseTargets[threadID]) botState.abuseTargets[threadID] = {};
  if (botState.abuseTargets[threadID][abuserID]) return;

  botState.abuseTargets[threadID][abuserID] = true;

  api.getUserInfo(abuserID, (err, info) => {
    if (err) return;
    const name = info?.[abuserID]?.name || 'User';
    const tag = `@${name.split(' ')[0]}`;

    const spamLoop = async () => {
      while (botState.abuseTargets[threadID]?.[abuserID]) {
        for (let line of abuseLines) {
          if (!botState.abuseTargets[threadID]?.[abuserID]) break;
          await api.sendMessage({
            body: `${tag} ${line}`,
            mentions: [{ tag, id: abuserID, fromIndex: 0 }]
          }, threadID);
          await new Promise(r => setTimeout(r, 10000));
        }
      }
    };

    spamLoop();
  });
}

// WAR STOP LOGIC
if (botState.abuseTargets?.[event.threadID]?.[event.senderID]) {
  const lower = event.body?.toLowerCase();
  if (lower.includes('sorry babu') || lower.includes('sorry bot') || lower.includes('sorry chitti')) {
    delete botState.abuseTargets[event.threadID][event.senderID];
    api.sendMessage('😏 ठीक है बेटा! अब तुझे नहीं गाली देंगे. बच गया तू... अगली बार संभल के!', event.threadID);
  }
}


// Message handling
      if (event.type === 'message') {
        const msg = event.body?.trim().toLowerCase();
        
        if (msg === 'uid') {
          api.getThreadInfo(event.threadID, (err, info) => {
            if (err || !info) return api.sendMessage('❌ Failed to fetch group info.', event.threadID);
            
            const groupName = info.threadName || 'N/A';
            const groupID = event.threadID;
            const memberCount = info.participantIDs?.length || 0;
            
            const infoText = `🏷️ *Group Info*
━━━━━━━━━━━━━━
📛 Name: ${groupName}
🆔 ID: ${groupID}
👥 Members: ${memberCount}
━━━━━━━━━━━━━━`;
            
            if (info.imageSrc) {
              const request = require('request');
              const imgStream = request(info.imageSrc);
              const msgData = {
                body: infoText,
                attachment: imgStream
              };
              api.sendMessage(msgData, event.threadID, event.messageID);
            } else {
              api.sendMessage(infoText, event.threadID, event.messageID);
            }
          });
          return;
        }

        if (msg?.startsWith(botConfig.prefix)) {
          const senderID = event.senderID;
          const args = msg.slice(botConfig.prefix.length).trim().split(' ');
          const command = args[0].toLowerCase();
          const groupName = args.slice(2).join(' ');
          const isAdmin = senderID === botConfig.adminID;

          // Public commands
          if (command === 'help') {
            const helpText = `
🛠️ 𝗕𝗢𝗧 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 𝗠𝗘𝗡𝗨
━━━━━━━━━━━━━━━━━━━━
🔒 Group Name Lock (Admin only)
• ${botConfig.prefix}groupnamelock on <name>
👥 Nickname Lock (Admin only)
• ${botConfig.prefix}nicknamelock on <nickname>
📌 Grouphanger System (Admin only)
• ${botConfig.prefix}grouphanger on/off
• ${botConfig.prefix}grouphanger target @user
• ${botConfig.prefix}grouphanger stop
🌀 AutoBot Emoji Reply
• ${botConfig.prefix}autobot on/off
👋 Welcome + Anti-Leave System
• Automatic join/leave messages + Re-adding left user
🕉️ Prayer Reminder
• Daily prayer reminder with Shloka
📶 Uptime Status
• /uptime or ${botConfig.prefix}uptime
ℹ️ User Info
• ${botConfig.prefix}info
🆔 Group Info
• Type: uid (no prefix)
━━━━━━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`;
            return api.sendMessage(helpText, event.threadID);
          }

          if (command === 'uptime' || msg === '/uptime') {
            const uptimeMs = Date.now() - botState.startTime;
            const seconds = Math.floor((uptimeMs / 1000) % 60);
            const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
            const hours = Math.floor(uptimeMs / (1000 * 60 * 60) % 24);
            const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));

            const uptimeText = `
📡 𝗕𝗼𝘁 𝗨𝗽𝘁𝗶𝗺𝗲 𝗦𝘁𝗮𝘁𝘂𝘀
━━━━━━━━━━━━━━━
🕐 Days: ${days}
⏰ Hours: ${hours}
🕒 Minutes: ${minutes}
⏱️ Seconds: ${seconds}
━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`;
            return api.sendMessage(uptimeText, event.threadID);
          }

          if (command === 'info') {
            api.getUserInfo(event.senderID, (err, ret) => {
              if (err || !ret) return api.sendMessage('❌ Failed to get user info.', event.threadID);
              const user = ret[event.senderID];
              const infoText = `
👤 𝗨𝘀𝗲𝗿 𝗜𝗻𝗳𝗼
━━━━━━━━━━━━━━━
📛 Name: ${user.name}
🆔 ID: ${event.senderID}
👫 Gender: ${user.gender || 'N/A'}
🔗 Profile: https://facebook.com/${event.senderID}
━━━━━━━━━━━━━━━
👑 𝗖𝗿𝗲𝗮𝘁𝗲𝗱 𝗕𝘆: ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏`;
              api.sendMessage(infoText, event.threadID);
            });
            return;
          }

          if (command === 'autobot') {
            if (args[1] === 'on') {
              emojiReactEnabledGroups.add(event.threadID);
              api.sendMessage('✅ AutoBot replies enabled for this group.', event.threadID);
            } else if (args[1] === 'off') {
              emojiReactEnabledGroups.delete(event.threadID);
              api.sendMessage('❌ AutoBot replies disabled for this group.', event.threadID);
            } else {
              api.sendMessage('⚠️ Use: autobot on/off', event.threadID);
            }
            return;
          }

          // Admin-only commands
          if (!isAdmin) return api.sendMessage('❌ Unauthorized. This command is admin-only.', event.threadID);
          
          if (command === 'grouphanger') {
            if (args[1] === 'on') {
              hangerThreads.add(event.threadID);
              api.sendMessage('😎 ठीक है मालिक पेल दूंगा सबको 🙂👍...!! आपकी मर्ज़ी के बिना नहीं रुकूंगा अब मेरे मालिक ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏', event.threadID);
            } 
            else if (args[1] === 'off') {
              hangerThreads.delete(event.threadID);
              api.sendMessage('😎 ठीक है मालिक आपके कहने पर रोक दिया war...!! ग्रुप वालो मौज करो सब अब्ब ', event.threadID);
            }
            else if (args[1] === 'target' && args[2] && event.mentions) {
              const targetID = Object.keys(event.mentions)[0];
              if (targetID) {
                botConfig.targetedHangers[event.threadID] = targetID;
                api.sendMessage(`🎯 ठीक है मालिक अब मे ${event.mentions[targetID]} की माँ को काफ़ी अच्छे से पेलुँगा बचकर दिखा mkl अब`, event.threadID);
              } else {
                api.sendMessage('⚠️ Please mention a user to target', event.threadID);
              }
            }
            else if (args[1] === 'stop') {
              if (botConfig.targetedHangers[event.threadID]) {
                const targetID = botConfig.targetedHangers[event.threadID];
                delete botConfig.targetedHangers[event.threadID];
                
                api.getUserInfo(targetID, (err, info) => {
                  if (err || !info) {
                    api.sendMessage('🎯 Targeted hanger stopped', event.threadID);
                    return;
                  }
                  
                  const name = info[targetID]?.name || 'User';
                  api.sendMessage(`🎯 ठीक है मालिक!! बच गया आपके कहने पर ${name} बेटीचोद वरना आज इसकी कब्र खोद देता 😎🖤👍`, event.threadID);
                });
              } else {
                api.sendMessage('No targeted hanger active', event.threadID);
              }
            }
            else {
              api.sendMessage('⚠️ Use: grouphanger on/off/target @user/stop', event.threadID);
            }
            return;
          }

          if (command === 'lockstatus') {
            const msg = `🔒 Lock Status:\nGroup: ${lockedGroups[event.threadID] || 'Not locked'}\nNicknames: ${lockedNicknames[event.threadID] || 'Not locked'}`;
            return api.sendMessage(msg, event.threadID);
          }

          if (command === 'groupnamelock' && args[1] === 'on') {
            lockedGroups[event.threadID] = groupName;
            api.setTitle(groupName, event.threadID, (err) => {
              if (err) return api.sendMessage('❌ Failed to lock group name.', event.threadID);
              api.sendMessage(`🔒 Group name locked: ${groupName}`, event.threadID);
            });
          } else if (command === 'nicknamelock' && args[1] === 'on') {
            const nickname = groupName;
            api.getThreadInfo(event.threadID, (err, info) => {
              if (err) return console.error('❌ Thread info error:', err);
              info.participantIDs.forEach((userID, i) => {
                setTimeout(() => {
                  api.changeNickname(nickname, event.threadID, userID, () => {});
                }, i * 2000);
              });
              lockedNicknames[event.threadID] = nickname;
              api.sendMessage(`✅ Nicknames locked: ${nickname}`, event.threadID);
            });
          }
        }
      }
      
      // Emoji reactions
      if (botConfig.features.emojiReactions && event.type === 'message' && event.body?.match(/[\p{Emoji}]/gu)) {
        const reactions = ['😄', '😢', '😡', '❤️', '👍', '👎', '😂', '😮', '😆', '🔥'];
        const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
        try {
          api.setMessageReaction(randomReaction, event.messageID, event.threadID, () => {});
        } catch (err) {
          broadcast({ type: 'log', message: `❌ Reaction failed: ${err.message}`, level: 'error' });
        }
        
        if (emojiReactEnabledGroups.has(event.threadID)) {
          const replies = ['🔥', '😂😂', 'Nice one!', 'Wah bhai 😄', '👀', '😆', '❤️'];
          const randomReply = replies[Math.floor(Math.random() * replies.length)];
          api.sendMessage(randomReply, event.threadID, event.messageID);
        }
      }

      // Thread name changes
      if (event.logMessageType === 'log:thread-name') {
        const locked = lockedGroups[event.threadID];
        if (locked) {
          api.setTitle(locked, event.threadID, () => {
            api.sendMessage('❌ Name change mat kar.', event.threadID);
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

      // AutoBot replies
      if (event.type === 'message' && /bot/i.test(event.body)) {
        try {
          const botLines = fs.readFileSync('bot.txt', 'utf8').split('\n').filter(l => l.trim());
          if (botLines.length > 0) {
            const randomLine = botLines[Math.floor(Math.random() * botLines.length)];
            api.sendMessage(randomLine, event.threadID, event.messageID);
          }
        } catch (err) {
          broadcast({ type: 'log', message: `Error reading bot.txt: ${err.message}`, level: 'error' });
        }
      }

      // Photo replies
      if (event.type === 'message' && event.attachments?.length > 0) {
        const hasPhoto = event.attachments.some(att => att.type === 'photo');
        if (hasPhoto) {
          const folderPath = './cid-template/';
          fs.readdir(folderPath, (err, files) => {
            if (err || files.length === 0) return;
            const images = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
            if (images.length === 0) return;

            const randomImage = images[Math.floor(Math.random() * images.length)];
            const fullPath = folderPath + randomImage;
            const msg = {
              attachment: fs.createReadStream(fullPath)
            };
            api.sendMessage(msg, event.threadID);
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
  emojiReactEnabledGroups.clear();
  botConfig.targetedHangers = {};
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
  
  ws.send(JSON.stringify({ 
    type: 'groups', 
    groups: botState.groups 
  }));
  
  ws.send(JSON.stringify({ 
    type: 'config', 
    config: botConfig 
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
          
        case 'testMessage':
          if (botState.api) {
            botState.api.getThreadList(10, null, ['INBOX'], (err, threads) => {
              if (!err && threads?.length) {
                threads.forEach(t => {
                  botState.api.sendMessage('जय श्री राम सभी को 🙏 !! im chitti robot 2.0. Developer : ✶♡⤾➝GODXDEVIL.⤹✶➺🪿🫨🩷🪽󱢏', t.threadID);
                });
                broadcast({ type: 'log', message: 'Test message sent to all groups', level: 'success' });
              }
            });
          }
          break;
          
        case 'getGroups':
          if (botState.api) {
            botState.api.getThreadList(25, null, ['INBOX'], (err, threads) => {
              if (!err && threads) {
                botState.groups = threads.map(t => ({
                  name: t.threadName || 'Unnamed Group',
                  id: t.threadID,
                  members: t.participantIDs?.length || 0
                }));
                broadcast({ type: 'groups', groups: botState.groups });
                broadcast({ type: 'log', message: 'Group list refreshed', level: 'info' });
              }
            });
          }
          break;
          
        case 'saveSettings':
          botConfig.prayerTimes = {
            morning: data.prayerTimes.morningTime,
            afternoon: data.prayerTimes.afternoonTime,
            evening: data.prayerTimes.eveningTime,
            night: data.prayerTimes.nightTime
          };
          broadcast({ type: 'log', message: 'Prayer times updated', level: 'success' });
          break;
          
        case 'toggleFeature':
          if (botConfig.features.hasOwnProperty(data.feature)) {
            botConfig.features[data.feature] = data.enabled;
            broadcast({ 
              type: 'log', 
              message: `${data.feature} ${data.enabled ? 'enabled' : 'disabled'}`, 
              level: 'info' 
            });
            
            if (data.feature === 'groupHanger' && !data.enabled) {
              hangerThreads.clear();
              botConfig.targetedHangers = {};
            }
          }
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
