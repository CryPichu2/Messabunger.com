// server.js
// messanung - Advanced Web Messenger
// Run:
// npm init -y
// npm install express express-session socket.io body-parser bcrypt
// node server.js

const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  secret: 'messanung-secret',
  resave: false,
  saveUninitialized: false
}));

// In-memory storage
const users = {}; // nickname -> { passwordHash }
const onlineUsers = {}; // nickname -> socket.id

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/');
  next();
}

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/chat');
  res.send(authPage());
});

app.post('/register', async (req, res) => {
  const { nickname, password } = req.body;
  if (users[nickname]) {
    return res.send('Nickname already exists');
  }
  const hash = await bcrypt.hash(password, 10);
  users[nickname] = { passwordHash: hash };
  req.session.user = nickname;
  res.redirect('/chat');
});

app.post('/login', async (req, res) => {
  const { nickname, password } = req.body;
  const user = users[nickname];
  if (!user) return res.send('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.send('Invalid credentials');

  req.session.user = nickname;
  res.redirect('/chat');
});

app.get('/chat', requireAuth, (req, res) => {
  res.send(chatPage(req.session.user));
});

app.get('/search', requireAuth, (req, res) => {
  const query = req.query.q || '';
  const result = Object.keys(users).filter(n => n.toLowerCase().includes(query.toLowerCase()));
  res.json(result);
});

io.on('connection', (socket) => {
  socket.on('join', (nickname) => {
    socket.nickname = nickname;
    onlineUsers[nickname] = socket.id;
  });

  // Global chat
  socket.on('globalMessage', (msg) => {
    io.emit('globalMessage', { user: socket.nickname, text: msg });
  });

  // Private message
  socket.on('privateMessage', ({ to, text }) => {
    const targetId = onlineUsers[to];
    if (targetId) {
      io.to(targetId).emit('privateMessage', {
        from: socket.nickname,
        text
      });
    }
  });

  socket.on('disconnect', () => {
    delete onlineUsers[socket.nickname];
  });
});

function authPage() {
  return `
  <html>
  <head>
    <title>messanung</title>
    <style>
      body {
        font-family: Arial;
        background: linear-gradient(270deg, #ff00cc, #3333ff, #00ffcc);
        background-size: 600% 600%;
        animation: gradient 10s ease infinite;
        color: white;
        text-align: center;
      }
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      input, button {
        padding: 10px;
        margin: 5px;
        border-radius: 10px;
        border: none;
      }
      button {
        cursor: pointer;
        background: white;
      }
    </style>
  </head>
  <body>
    <h1>messanung</h1>
    <h3>Register</h3>
    <form method="POST" action="/register">
      <input name="nickname" placeholder="Nickname" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Register</button>
    </form>
    <h3>Login</h3>
    <form method="POST" action="/login">
      <input name="nickname" placeholder="Nickname" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Login</button>
    </form>
  </body>
  </html>
  `;
}

function chatPage(user) {
  return `
  <html>
  <head>
    <title>messanung</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
      body {
        font-family: Arial;
        margin: 0;
        background: linear-gradient(270deg, #00c6ff, #0072ff, #ff00cc);
        background-size: 600% 600%;
        animation: gradient 12s ease infinite;
        color: white;
      }
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      #container { display: flex; height: 100vh; }
      #sidebar {
        width: 250px;
        background: rgba(0,0,0,0.4);
        padding: 15px;
        overflow-y: auto;
      }
      #chatArea { flex: 1; display: flex; flex-direction: column; }
      #messages { flex: 1; overflow-y: auto; padding: 10px; }
      #inputArea { display: flex; padding: 10px; background: rgba(0,0,0,0.3); }
      input, button, select {
        padding: 10px;
        margin: 5px;
        border-radius: 10px;
        border: none;
      }
      button { cursor: pointer; }
      .msg { margin: 5px 0; }
      .private { color: #ffdd57; }
    </style>
  </head>
  <body>
    <div id="container">
      <div id="sidebar">
        <h3>${user}</h3>
        <select id="lang">
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="ru">Русский</option>
        </select>
        <input id="search" placeholder="Search user" oninput="searchUser()" />
        <ul id="result"></ul>
      </div>
      <div id="chatArea">
        <div id="messages"></div>
        <div id="inputArea">
          <input id="msg" placeholder="Message" />
          <button onclick="sendGlobal()">Global</button>
          <button onclick="sendPrivate()">Private</button>
        </div>
      </div>
    </div>

<script>
const socket = io();
socket.emit('join', '${user}');
let selectedUser = null;

socket.on('globalMessage', data => {
  addMessage(data.user + ': ' + data.text);
});

socket.on('privateMessage', data => {
  addMessage('(Private) ' + data.from + ': ' + data.text, true);
});

function addMessage(text, isPrivate=false) {
  const div = document.createElement('div');
  div.className = 'msg';
  if (isPrivate) div.classList.add('private');
  div.textContent = text;
  document.getElementById('messages').appendChild(div);
}

function sendGlobal() {
  const input = document.getElementById('msg');
  socket.emit('globalMessage', input.value);
  input.value = '';
}

function sendPrivate() {
  if (!selectedUser) return alert('Select user');
  const input = document.getElementById('msg');
  socket.emit('privateMessage', { to: selectedUser, text: input.value });
  input.value = '';
}

function searchUser() {
  const q = document.getElementById('search').value;
  fetch('/search?q=' + q)
    .then(res => res.json())
    .then(data => {
      const ul = document.getElementById('result');
      ul.innerHTML = '';
      data.forEach(u => {
        const li = document.createElement('li');
        li.textContent = u;
        li.onclick = () => selectedUser = u;
        ul.appendChild(li);
      });
    });
}
</script>

  </body>
  </html>
  `;
}

server.listen(3000, () => console.log('messanung running on http://localhost:3000'));
