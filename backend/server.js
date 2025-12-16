/**
 * INTUMESSENGER BACKEND
 * Run command: node backend/server.js
 */

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Safe Ethers Import
let ethers;
try {
  const ethersLib = require('ethers');
  ethers = ethersLib.ethers || ethersLib;
} catch (e) {
  console.error("CRITICAL: 'ethers' package is missing. Please run 'npm install ethers'");
  process.exit(1);
}

const verifyMessage = (msg, sig) => {
  try {
    if (ethers.verifyMessage) return ethers.verifyMessage(msg, sig);
    if (ethers.utils && ethers.utils.verifyMessage) return ethers.utils.verifyMessage(msg, sig);
    throw new Error("Ethers version incompatible");
  } catch (e) {
    console.error("Error verifying message:", e);
    return null;
  }
};

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- IN-MEMORY DATABASE ---
const DB = { users: {}, conversations: [], messages: [], nonces: {} };

const upsertUser = (address) => {
  if (!DB.users[address]) {
    DB.users[address] = {
      id: address,
      walletAddress: address,
      name: `User ${address.substring(0,6)}`,
      avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${address}`,
      trustScore: Math.floor(Math.random() * 100),
      reputationAtoms: ['Newbie'],
      communities: []
    };
  }
  return DB.users[address];
};

// --- API ROUTES ---

// Health Check
app.get('/health', (req, res) => res.send('OK'));

// Auth: Get Nonce
app.get('/api/auth/nonce', (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "Address required" });
  
  const nonce = Math.floor(Math.random() * 1000000).toString();
  DB.nonces[address] = nonce;
  console.log(`Generated nonce for ${address}: ${nonce}`);
  res.json({ nonce });
});

// Auth: Verify Signature
app.post('/api/auth/verify', (req, res) => {
  const { address, signature, message } = req.body;
  
  if (!address || !signature || !message) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const recoveredAddr = verifyMessage(message, signature);
    if (!recoveredAddr || recoveredAddr.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const user = upsertUser(address);
    res.json({ token: "mock-jwt-" + address, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Data Routes
app.get('/api/users/:id', (req, res) => {
  const user = DB.users[req.params.id];
  user ? res.json(user) : res.status(404).json({error: 'User not found'});
});

app.get('/api/users', (req, res) => res.json(Object.values(DB.users)));

app.get('/api/conversations', (req, res) => {
  const token = req.headers.authorization;
  if(!token) return res.status(401).json({error: "Unauthorized"});
  const userId = token.replace('Bearer mock-jwt-', '');
  res.json(DB.conversations.filter(c => c.participants.includes(userId)));
});

app.post('/api/conversations', (req, res) => {
  const token = req.headers.authorization;
  if(!token) return res.status(401).json({error: "Unauthorized"});
  const userId = token.replace('Bearer mock-jwt-', '');
  const { recipientId } = req.body;

  let convo = DB.conversations.find(c => c.participants.includes(userId) && c.participants.includes(recipientId));
  if (!convo) {
    convo = {
      id: `c_${Date.now()}`,
      participants: [userId, recipientId],
      unreadCount: 0,
      isGroup: false,
      isRequest: false,
      lastMessage: null
    };
    DB.conversations.push(convo);
  }
  res.json(convo);
});

app.get('/api/conversations/:id/messages', (req, res) => {
  const convo = DB.conversations.find(c => c.id === req.params.id);
  if(!convo) return res.json([]);
  
  const token = req.headers.authorization; 
  const userId = token ? token.replace('Bearer mock-jwt-', '') : null;
  if (!userId || !convo.participants.includes(userId)) return res.status(403).json({error: "Unauthorized"});

  res.json(DB.messages.filter(m => convo.participants.includes(m.senderId) && convo.participants.includes(m.receiverId)));
});

// IMPORTANT: Return 404 JSON for unknown API routes to prevent HTML fallthrough
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.originalUrl}` });
});

// --- STATIC FILES ---
// Resolve absolute path to dist folder
const distPath = path.resolve(__dirname, '../dist');
console.log(`Serving static files from: ${distPath}`);

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Catch-all for SPA: Serve index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn("WARNING: dist folder not found. Running in API-only mode or path is incorrect.");
  app.get('/', (req, res) => res.send('Backend is running, but frontend build (dist) was not found.'));
}

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  if(userId) socket.join(userId);

  socket.on('send_message', (data) => {
    const { toUserId, content, type } = data;
    const msg = {
      id: Date.now().toString(),
      senderId: userId,
      receiverId: toUserId,
      content,
      timestamp: Date.now(),
      read: false,
      type
    };
    DB.messages.push(msg);
    
    // Update conversation
    let convo = DB.conversations.find(c => c.participants.includes(userId) && c.participants.includes(toUserId));
    if (!convo) {
      convo = { id: `c_${Date.now()}`, participants: [userId, toUserId], unreadCount: 0, isGroup: false, isRequest: false, lastMessage: msg };
      DB.conversations.push(convo);
    } else {
      convo.lastMessage = msg;
    }

    io.to(toUserId).emit('new_message', msg);
    io.to(userId).emit('new_message', msg);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});