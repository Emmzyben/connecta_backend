const express = require('express');
const cors = require('cors');
const http = require('http');
const { initIO } = require("./socket");
const authRoutes = require('./auth');
const userRoutes = require('./users');
const chatRoutes = require('./chat');
const favoritesRoutes = require('./favorites');
const homeRoutes = require('./home');
const likesRoutes = require('./likes');
const matchesRoutes = require('./matches');
const notificationsRoutes = require('./notifications');
const subscriptionRoutes = require('./subscription');

const app = express();
const server = http.createServer(app);
const io = initIO(server);

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/likes', likesRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/subscription', subscriptionRoutes);

app.get('/', (req, res) => {
  res.send('Connecta Backend is running');
});

// ✅ Socket.io events
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // join conversation room
  socket.on('joinConversation', (conversationId) => {
    socket.join(conversationId);
    console.log(`User joined room ${conversationId}`);
  });

  // send message
  socket.on('sendMessage', ({ conversationId, message }) => {
    io.to(conversationId).emit('receiveMessage', message);
  });

  // typing
  socket.on('typing', ({ conversationId, userId, isTyping }) => {
    socket.to(conversationId).emit('typingStatus', { userId, isTyping });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
