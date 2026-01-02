// ==========================================================================
// Chit-Chat Application - Fixed to work with server API
// ==========================================================================

// ==========================================================================
// Configuration
// ==========================================================================
// API_BASE_URL: Set this to your Azure Front Door URL in production
// Leave empty ('') for same-origin (local development or monolithic deployment)
// Example: 'https://your-chitchat.azurefd.net'
const API_BASE_URL = window.CHITCHAT_API_URL || '';

// Persist current room session so a reconnect (or reload during failover) can rejoin.
const SESSION_STORAGE_KEY = 'chitchat:session';

function saveRoomSession() {
  if (!state.roomId || !state.memberId) return;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      roomId: state.roomId,
      memberId: state.memberId,
      savedAt: Date.now(),
    }));
  } catch {}
}

function loadRoomSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.roomId || !parsed?.memberId) return;
    state.roomId = parsed.roomId;
    state.memberId = parsed.memberId;
  } catch {}
}

function clearRoomSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}
}

// ==========================================================================
// Avatars
// ==========================================================================

// High quality, stylized SVG avatars (DiceBear Adventurer-style)
const SVG_AVATARS = {
  avatar1: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#E8E1F9"/>
    <circle cx="32" cy="28" r="16" fill="#FFE0BD"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#6366F1"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M28 33 Q32 37 36 33" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="22" cy="28" rx="3" ry="2" fill="#FFB6B6" opacity="0.6"/>
    <ellipse cx="42" cy="28" rx="3" ry="2" fill="#FFB6B6" opacity="0.6"/>
    <path d="M20 14 Q32 8 44 14 Q45 20 32 18 Q19 20 20 14Z" fill="#8B5A2B"/>
  </svg>`,
  
  avatar2: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#FEE2E2"/>
    <circle cx="32" cy="28" r="16" fill="#D4A574"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#EC4899"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M28 33 Q32 37 36 33" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="22" cy="28" rx="3" ry="2" fill="#FF9999" opacity="0.6"/>
    <ellipse cx="42" cy="28" rx="3" ry="2" fill="#FF9999" opacity="0.6"/>
    <path d="M18 18 Q32 6 46 18 L44 24 Q32 20 20 24 Z" fill="#1A1A1A"/>
  </svg>`,
  
  avatar3: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#DBEAFE"/>
    <circle cx="32" cy="28" r="16" fill="#FFDBB4"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#3B82F6"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M28 33 Q32 36 36 33" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M16 16 Q20 10 32 12 Q44 10 48 16 L46 20 Q32 14 18 20 Z" fill="#FFD700"/>
    <rect x="24" y="20" width="16" height="2" rx="1" fill="#FFD700"/>
  </svg>`,
  
  avatar4: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#D1FAE5"/>
    <circle cx="32" cy="28" r="16" fill="#8B6914"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#10B981"/>
    <circle cx="26" cy="26" r="2.5" fill="#FFFFFF"/>
    <circle cx="38" cy="26" r="2.5" fill="#FFFFFF"/>
    <path d="M27 32 L32 35 L37 32" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M16 14 Q32 4 48 14 Q50 24 32 20 Q14 24 16 14Z" fill="#1A1A1A"/>
    <circle cx="46" cy="16" r="4" fill="#FFD700"/>
  </svg>`,
  
  avatar5: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#FEF3C7"/>
    <circle cx="32" cy="28" r="16" fill="#FFE0BD"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#F59E0B"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M28 34 Q32 37 36 34" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="22" cy="28" rx="3" ry="2" fill="#FFB6B6" opacity="0.6"/>
    <ellipse cx="42" cy="28" rx="3" ry="2" fill="#FFB6B6" opacity="0.6"/>
    <path d="M18 12 Q32 4 46 12 L48 22 Q32 16 16 22 Z" fill="#D97706"/>
    <circle cx="32" cy="8" r="3" fill="#FFD700"/>
  </svg>`,
  
  avatar6: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#FCE7F3"/>
    <circle cx="32" cy="28" r="16" fill="#C4A484"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#DB2777"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M29 33 Q32 35 35 33" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="22" cy="28" rx="3" ry="2" fill="#FF9999" opacity="0.5"/>
    <ellipse cx="42" cy="28" rx="3" ry="2" fill="#FF9999" opacity="0.5"/>
    <path d="M14 20 Q22 8 32 12 Q42 8 50 20 Q48 26 32 22 Q16 26 14 20Z" fill="#FF69B4"/>
    <ellipse cx="32" cy="10" rx="4" ry="2" fill="#FF1493"/>
  </svg>`,
  
  avatar7: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#E0E7FF"/>
    <circle cx="32" cy="28" r="16" fill="#FFDBB4"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#4F46E5"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M28 33 Q32 36 36 33" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <rect x="22" y="22" width="8" height="3" rx="1" fill="#4F46E5" opacity="0.3"/>
    <rect x="34" y="22" width="8" height="3" rx="1" fill="#4F46E5" opacity="0.3"/>
    <path d="M17 16 Q32 6 47 16 L46 24 Q32 18 18 24 Z" fill="#374151"/>
  </svg>`,
  
  avatar8: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#ECFDF5"/>
    <circle cx="32" cy="28" r="16" fill="#FFE0BD"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#059669"/>
    <circle cx="26" cy="25" r="3" fill="#FFFFFF" stroke="#4A4A4A" stroke-width="1"/>
    <circle cx="38" cy="25" r="3" fill="#FFFFFF" stroke="#4A4A4A" stroke-width="1"/>
    <circle cx="26" cy="25" r="1.5" fill="#4A4A4A"/>
    <circle cx="38" cy="25" r="1.5" fill="#4A4A4A"/>
    <path d="M28 34 Q32 38 36 34" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M18 10 Q32 2 46 10 L44 16 Q32 12 20 16 Z" fill="#92400E"/>
    <path d="M22 16 L22 14 M42 16 L42 14" stroke="#92400E" stroke-width="2"/>
  </svg>`,
  
  avatar9: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#FFF7ED"/>
    <circle cx="32" cy="28" r="16" fill="#D4A574"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#EA580C"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M28 32 Q32 36 36 32" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M20 15 Q32 8 44 15 Q46 22 32 19 Q18 22 20 15Z" fill="#F97316"/>
    <circle cx="20" cy="14" r="3" fill="#FBBF24"/>
    <circle cx="44" cy="14" r="3" fill="#FBBF24"/>
  </svg>`,
  
  avatar10: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#F3E8FF"/>
    <circle cx="32" cy="28" r="16" fill="#FFDBB4"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#9333EA"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M29 33 Q32 36 35 33" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="22" cy="28" rx="3" ry="2" fill="#E879F9" opacity="0.5"/>
    <ellipse cx="42" cy="28" rx="3" ry="2" fill="#E879F9" opacity="0.5"/>
    <path d="M14 18 Q24 6 32 10 Q40 6 50 18 L48 26 Q32 18 16 26 Z" fill="#7C3AED"/>
    <path d="M30 6 L32 2 L34 6" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  
  avatar11: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#FEF2F2"/>
    <circle cx="32" cy="28" r="16" fill="#FFE0BD"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#DC2626"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M28 33 Q32 37 36 33" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M20 18 Q32 10 44 18 L42 24 Q32 18 22 24 Z" fill="#991B1B"/>
    <rect x="28" y="12" width="8" height="4" rx="1" fill="#FBBF24"/>
  </svg>`,
  
  avatar12: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#F0FDF4"/>
    <circle cx="32" cy="28" r="16" fill="#C4A484"/>
    <ellipse cx="32" cy="52" rx="18" ry="12" fill="#16A34A"/>
    <circle cx="26" cy="26" r="2.5" fill="#4A4A4A"/>
    <circle cx="38" cy="26" r="2.5" fill="#4A4A4A"/>
    <path d="M28 34 Q32 37 36 34" stroke="#4A4A4A" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="22" cy="28" rx="3" ry="2" fill="#86EFAC" opacity="0.5"/>
    <ellipse cx="42" cy="28" rx="3" ry="2" fill="#86EFAC" opacity="0.5"/>
    <path d="M16 14 Q32 4 48 14 Q50 22 32 18 Q14 22 16 14Z" fill="#15803D"/>
    <ellipse cx="32" cy="8" rx="6" ry="3" fill="#22C55E"/>
  </svg>`
};

// Room avatars (non-human icons)
const ROOM_AVATARS = {
  room1: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="16" fill="#6366F1"/>
    <path d="M20 24C20 21.7909 21.7909 20 24 20H40C42.2091 20 44 21.7909 44 24V36C44 38.2091 42.2091 40 40 40H28L22 46V40H24C21.7909 40 20 38.2091 20 36V24Z" fill="white"/>
    <circle cx="27" cy="30" r="2" fill="#6366F1"/>
    <circle cx="32" cy="30" r="2" fill="#6366F1"/>
    <circle cx="37" cy="30" r="2" fill="#6366F1"/>
  </svg>`,
  room2: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="16" fill="#EC4899"/>
    <path d="M32 16L42 26H36V38H28V26H22L32 16Z" fill="white"/>
    <rect x="22" y="42" width="20" height="4" rx="2" fill="white"/>
  </svg>`,
  room3: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="16" fill="#10B981"/>
    <circle cx="32" cy="32" r="14" stroke="white" stroke-width="3" fill="none"/>
    <path d="M28 32L31 35L36 28" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  room4: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="16" fill="#F59E0B"/>
    <path d="M32 18L35 28H46L37 34L40 44L32 38L24 44L27 34L18 28H29L32 18Z" fill="white"/>
  </svg>`
};

// SVG Icons for UI elements
const ICONS = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
};

// Avatar mapping: server emoji -> SVG avatar ID
const AVATAR_MAP = {
  '🐼': 'avatar1', '🐯': 'avatar2', '🦅': 'avatar3', '🐬': 'avatar4',
  '🦊': 'avatar5', '🐺': 'avatar6', '🐻': 'avatar7', '🦁': 'avatar8',
  '🦉': 'avatar9', '🐨': 'avatar10', '🦦': 'avatar11', '🐧': 'avatar12'
};

// Reverse mapping: SVG avatar ID -> emoji for server
const EMOJI_MAP = Object.fromEntries(Object.entries(AVATAR_MAP).map(([k, v]) => [v, k]));

// Get avatar list
const AVATAR_LIST = Object.keys(SVG_AVATARS);
const ROOM_AVATAR_LIST = Object.keys(ROOM_AVATARS);

// ==========================================================================
// State Management
// ==========================================================================

const state = {
  socket: null,
  connected: false,
  displayName: '',
  avatarId: AVATAR_LIST[0],
  roomId: null,
  memberId: null,
  room: null,
  isAdmin: false,
  members: [],
  lastSeq: 0,
  typingTimeout: null,
  pendingAction: null, // 'create' | 'join' | joinCode
  pendingJoinQuery: null // passphrase or shortCode to join
};

// ==========================================================================
// DOM Elements
// ==========================================================================

const elements = {
  // Screens
  loading: document.getElementById('loading'),
  home: document.getElementById('home'),
  setup: document.getElementById('setup'),
  roomSetup: document.getElementById('room-setup'),
  joinMethod: document.getElementById('join-method'),
  waiting: document.getElementById('waiting'),
  chat: document.getElementById('chat'),

  // Home
  btnCreate: document.getElementById('btn-create'),
  btnJoin: document.getElementById('btn-join'),

  // Setup
  setupBack: document.getElementById('setup-back'),
  displayName: document.getElementById('display-name'),
  avatarGrid: document.getElementById('avatar-grid'),
  btnContinue: document.getElementById('btn-continue'),

  // Room Setup
  roomSetupBack: document.getElementById('room-setup-back'),
  roomName: document.getElementById('room-name'),
  btnCreateRoom: document.getElementById('btn-create-room'),

  // Join Method
  joinMethodBack: document.getElementById('join-method-back'),
  joinTabs: document.querySelectorAll('.tab'),
  tabCode: document.getElementById('tab-code'),
  tabLink: document.getElementById('tab-link'),
  joinCode: document.getElementById('join-code'),
  joinLink: document.getElementById('join-link'),
  codeError: document.getElementById('code-error'),
  linkError: document.getElementById('link-error'),
  btnJoinCode: document.getElementById('btn-join-code'),
  btnJoinLink: document.getElementById('btn-join-link'),

  // Waiting Room
  waitingRoomAvatar: document.getElementById('waiting-room-avatar'),
  waitingRoomName: document.getElementById('waiting-room-name'),
  roomCode: document.getElementById('room-code'),
  roomLink: document.getElementById('room-link'),
  qrCode: document.getElementById('qr-code'),
  memberCount: document.getElementById('member-count'),
  membersList: document.getElementById('members-list'),
  btnStart: document.getElementById('btn-start'),
  copyCode: document.getElementById('copy-code'),
  copyLink: document.getElementById('copy-link'),
  inviteToggle: document.querySelectorAll('.toggle-btn'),
  inviteCode: document.getElementById('invite-code'),
  inviteLink: document.getElementById('invite-link'),
  inviteQr: document.getElementById('invite-qr'),

  // Chat
  chatRoomAvatar: document.getElementById('chat-room-avatar'),
  chatRoomName: document.getElementById('chat-room-name'),
  chatMemberCount: document.getElementById('chat-member-count'),
  chatBanner: document.getElementById('chat-banner'),
  connectionStatus: document.getElementById('connection-status'),
  chatInputWrapper: document.getElementById('chat-input-wrapper'),
  chatMessages: document.getElementById('chat-messages'),
  typingIndicator: document.getElementById('typing-indicator'),
  typingText: document.getElementById('typing-text'),
  messageInput: document.getElementById('message-input'),
  btnSend: document.getElementById('btn-send'),
  btnInvite: document.getElementById('btn-invite'),
  btnMembers: document.getElementById('btn-members'),
  btnCloseRoom: document.getElementById('btn-close-room'),
  membersSidebar: document.getElementById('members-sidebar'),
  sidebarMembers: document.getElementById('sidebar-members'),
  btnCloseSidebar: document.getElementById('btn-close-sidebar'),

  // Overlays
  kickedOverlay: document.getElementById('kicked-overlay'),
  closedOverlay: document.getElementById('closed-overlay'),
  btnKickedOk: document.getElementById('btn-kicked-ok'),
  btnClosedOk: document.getElementById('btn-closed-ok'),

  // Invite Modal
  inviteModal: document.getElementById('invite-modal'),
  modalClose: document.getElementById('modal-close'),
  modalCode: document.getElementById('modal-code'),
  modalLink: document.getElementById('modal-link'),
  modalQr: document.getElementById('modal-qr'),
  modalCopyCode: document.getElementById('modal-copy-code'),
  modalCopyLink: document.getElementById('modal-copy-link'),

  // Confirm Close Modal
  confirmCloseModal: document.getElementById('confirm-close-modal'),
  confirmCloseCancel: document.getElementById('confirm-close-cancel'),
  confirmCloseOk: document.getElementById('confirm-close-ok'),

  // Alert Modal
  alertModal: document.getElementById('alert-modal'),
  alertIcon: document.getElementById('alert-icon'),
  alertTitle: document.getElementById('alert-title'),
  alertMessage: document.getElementById('alert-message'),
  alertOk: document.getElementById('alert-ok')
};

// ==========================================================================
// Socket Setup
// ==========================================================================

function initSocket() {
  // Connect to API_BASE_URL if set, otherwise same origin
  const socketUrl = API_BASE_URL || undefined;
  state.socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    withCredentials: !!API_BASE_URL // Enable credentials for cross-origin
  });

  state.socket.on('connect', () => {
    console.log('Connected to server');
    state.connected = true;
    
    // Hide reconnecting UI
    hideConnectionStatus();
    
    // If we were in a room, try to rejoin (failover scenario)
    if (state.roomId && state.memberId) {
      console.log('Reconnecting to room after failover...');
      state.socket.emit('room:rejoin', {
        roomId: state.roomId,
        memberId: state.memberId
      });
    } else if (elements.loading.classList.contains('active')) {
      handleDirectJoin();
    }
  });

  state.socket.on('disconnect', () => {
    console.log('Disconnected from server');
    state.connected = false;
    // Show reconnecting indicator if in chat or waiting room
    if (elements.chat.classList.contains('active') || elements.waiting.classList.contains('active')) {
      showConnectionStatus();
    }
  });

  // Reconnect attempt
  state.socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnection attempt ${attempt}/10...`);
    if (elements.connectionStatus) {
      elements.connectionStatus.querySelector('span').textContent = `Reconnecting... (attempt ${attempt}/10)`;
    }
  });

  // Reconnect failed
  state.socket.io.on('reconnect_failed', () => {
    console.log('Reconnection failed');
    hideConnectionStatus();
    showError('Failed to reconnect. Please refresh the page.');
  });

  // Room joined (both create and join)
  state.socket.on('room:joined', (data) => {
    console.log('room:joined event received:', data);
    if (!data.ok) {
      showError(data.error || 'Failed to join room');
      return;
    }
    
    // Check if this is a rejoin (failover scenario)
    const isRejoin = state.roomId === data.roomId && state.memberId === data.memberId;
    
    state.roomId = data.roomId;
    state.memberId = data.memberId;
    state.room = data.room;
    state.isAdmin = data.isAdmin;
    state.members = data.members || [];

    saveRoomSession();
    
    console.log('State updated:', { roomId: state.roomId, memberId: state.memberId, isAdmin: state.isAdmin, isRejoin });
    
    updateWaitingRoom();
    
    // If room is already chatting, go directly to chat
    if (data.room?.status === 'chatting') {
      showScreen('chat');
      // Show reconnect banner if rejoining
      if (isRejoin) {
        showBanner('Reconnected!', 'success');
      }
      // Load recent messages (also on rejoin to catch up)
      if (data.recent && data.recent.length > 0) {
        data.recent.forEach(msg => {
          const msgSeq = Number(msg?.seq || 0);
          if (msgSeq && state.lastSeq && msgSeq <= state.lastSeq) return;
          if (msg?.id && seenMessages.has(msg.id)) return;

          if (msg?.id) {
            seenMessages.add(msg.id);
            if (seenMessages.size > 200) {
              const arr = Array.from(seenMessages);
              arr.slice(0, 100).forEach(id => seenMessages.delete(id));
            }
          }

          addMessage(msg);
        });
      }
    } else {
      showScreen('waiting');
      if (isRejoin) {
        showBanner('Reconnected!', 'success');
      }
    }
  });

  // Member list updated
  state.socket.on('room:members', (data) => {
    state.members = data.members || [];
    renderMembers();
  });

  // New member joined
  state.socket.on('member:joined', (data) => {
    // Members list will be updated via room:members event
    if (elements.chat.classList.contains('active')) {
      addSystemMessage(`${data.member?.name || 'Someone'} joined the room`);
    }
  });

  // Room notices (join/leave/etc)
  state.socket.on('room:notice', (data) => {
    if (elements.chat.classList.contains('active') || elements.waiting.classList.contains('active')) {
      // Don't show join notices in chat, handled by member:joined
      if (data.type !== 'join') {
        addSystemMessage(data.message);
      }
    }
  });

  // Chat started
  state.socket.on('room:started', (data) => {
    if (state.room) {
      state.room.status = 'chatting';
    }
    showScreen('chat');
    addSystemMessage('Chat started! Say hello to everyone.');
  });

  // Track seen message IDs to prevent duplicates
  const seenMessages = new Set();

  // New message - using message:received (UI format)
  state.socket.on('message:received', (data) => {
    // Prevent duplicate messages
    if (data.id && seenMessages.has(data.id)) {
      return;
    }
    if (data.id) {
      seenMessages.add(data.id);
      // Keep set size manageable
      if (seenMessages.size > 200) {
        const arr = Array.from(seenMessages);
        arr.slice(0, 100).forEach(id => seenMessages.delete(id));
      }
    }
    addMessage(data);
  });

  // Also listen to message:new for compatibility (raw format from server)
  state.socket.on('message:new', (data) => {
    // Prevent duplicate messages
    if (data.id && seenMessages.has(data.id)) {
      return;
    }
    if (data.id) {
      seenMessages.add(data.id);
      if (seenMessages.size > 200) {
        const arr = Array.from(seenMessages);
        arr.slice(0, 100).forEach(id => seenMessages.delete(id));
      }
    }
    // Convert to UI format
    const msg = {
      id: data.id,
      senderId: data.fromId,
      senderName: data.from,
      avatar: data.avatar,
      content: data.text,
      timestamp: data.ts,
      seq: data.seq
    };
    addMessage(msg);
  });

  // Typing indicators
  state.socket.on('typing:update', (data) => {
    const typingUsers = data.typingUsers || [];
    const others = typingUsers.filter(u => u.id !== state.memberId);
    
    if (others.length > 0) {
      const names = others.map(u => u.name).join(', ');
      showTypingIndicator(names);
    } else {
      hideTypingIndicator();
    }
  });

  // Member kicked
  state.socket.on('member:kicked', (data) => {
    if (data.memberId === state.memberId) {
      showOverlay('kicked');
    } else {
      addSystemMessage(`${data.name || data.memberName || 'A member'} was removed from the room`);
    }
  });

  // Member promoted
  state.socket.on('member:promoted', (data) => {
    if (data.memberId === state.memberId) {
      state.isAdmin = true;
      document.getElementById('chat').classList.add('is-admin');
      document.getElementById('waiting').classList.add('is-admin');
      showBanner('You are now an admin!', 'success');
    }
    addSystemMessage(`${data.name || data.memberName || 'A member'} is now an admin`);
  });

  // Admin changed (handles both promotion and demotion across all clients)
  const handleAdminChanged = (adminId, adminName) => {
    if (!adminId) return;
    if (state.room) {
      state.room.adminId = adminId;
    }

    state.isAdmin = adminId === state.memberId;

    const chatEl = document.getElementById('chat');
    const waitingEl = document.getElementById('waiting');
    if (state.isAdmin) {
      chatEl?.classList.add('is-admin');
      waitingEl?.classList.add('is-admin');
    } else {
      chatEl?.classList.remove('is-admin');
      waitingEl?.classList.remove('is-admin');
    }

    // Ensure the member list + actions update immediately.
    renderMembers();
    updateWaitingRoom();
  };

  state.socket.on('room:admin-changed', (data) => {
    handleAdminChanged(data?.adminId, data?.adminName);
  });

  // Back-compat event name
  state.socket.on('admin:changed', (data) => {
    handleAdminChanged(data?.newAdminId, data?.newAdminName);
  });

  // Room closed
  state.socket.on('room:closed', () => {
    showOverlay('closed');
  });

  // Member left
  state.socket.on('member:left', (data) => {
    if (elements.chat.classList.contains('active')) {
      addSystemMessage(`${data.name || 'Someone'} left the room`);
    }
  });

  // Rejoin failed
  state.socket.on('room:rejoin-failed', (data) => {
    console.log('Rejoin failed:', data.reason);
    resetRoomState();
    showScreen('home');
    showError('Session expired. Please rejoin the room.');
  });

  // Error
  state.socket.on('error', (data) => {
    console.error('Socket error:', data);
    showError(data.message || 'An error occurred');
  });
}

// ==========================================================================
// Screen Management
// ==========================================================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
  }

  // Update admin class
  if (screenId === 'waiting' || screenId === 'chat') {
    if (state.isAdmin) {
      screen.classList.add('is-admin');
    } else {
      screen.classList.remove('is-admin');
    }
    
    // Update header info
    if (screenId === 'chat') {
      elements.chatRoomName.textContent = state.room?.name || 'Chat Room';
      elements.chatRoomAvatar.innerHTML = getRoomAvatarSVG(state.room?.shortCode || state.roomId);
    }
  }
}

function showOverlay(type) {
  if (type === 'kicked') {
    elements.kickedOverlay.classList.remove('hidden');
  } else if (type === 'closed') {
    elements.closedOverlay.classList.remove('hidden');
  }
}

function hideOverlays() {
  elements.kickedOverlay.classList.add('hidden');
  elements.closedOverlay.classList.add('hidden');
}

// ==========================================================================
// Avatar Grid Rendering
// ==========================================================================

function renderAvatarGrid() {
  elements.avatarGrid.innerHTML = '';
  
  AVATAR_LIST.forEach((avatarId, index) => {
    const option = document.createElement('button');
    option.className = 'avatar-option' + (index === 0 ? ' selected' : '');
    option.dataset.avatar = avatarId;
    option.innerHTML = SVG_AVATARS[avatarId];
    option.setAttribute('aria-label', `Avatar ${index + 1}`);
    
    option.addEventListener('click', () => {
      document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      state.avatarId = avatarId;
    });
    
    elements.avatarGrid.appendChild(option);
  });
}

function getAvatarSVG(avatarInput) {
  // If it's already an avatar ID
  if (SVG_AVATARS[avatarInput]) {
    return SVG_AVATARS[avatarInput];
  }
  // If it's an emoji, map to avatar ID
  if (AVATAR_MAP[avatarInput]) {
    return SVG_AVATARS[AVATAR_MAP[avatarInput]];
  }
  // Default
  return SVG_AVATARS[AVATAR_LIST[0]];
}

function getAvatarEmoji(avatarId) {
  // Convert avatar ID to emoji for server
  return EMOJI_MAP[avatarId] || '🐼';
}

function getRoomAvatarSVG(code) {
  // Generate consistent room avatar based on code
  if (!code) return ROOM_AVATARS[ROOM_AVATAR_LIST[0]];
  const index = code.charCodeAt(0) % ROOM_AVATAR_LIST.length;
  return ROOM_AVATARS[ROOM_AVATAR_LIST[index]];
}

// ==========================================================================
// API Functions
// ==========================================================================

async function createRoom(roomName) {
  try {
    console.log('Creating room:', roomName);
    const response = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roomName }),
      credentials: API_BASE_URL ? 'include' : 'same-origin'
    });
    
    const data = await response.json();
    console.log('Create room response:', data);
    if (!data.ok) {
      showError(data.error || 'Failed to create room');
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('Create room error:', err);
    showError('Failed to create room');
    return null;
  }
}

async function lookupRoom(query) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/rooms/lookup?q=${encodeURIComponent(query)}`, {
      credentials: API_BASE_URL ? 'include' : 'same-origin'
    });
    const data = await response.json();
    
    if (!data.ok) {
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('Lookup error:', err);
    return null;
  }
}

// ==========================================================================
// Waiting Room
// ==========================================================================

function updateWaitingRoom() {
  const room = state.room;
  if (!room) return;
  
  elements.waitingRoomName.textContent = room.name || 'Chat Room';
  elements.waitingRoomAvatar.innerHTML = getRoomAvatarSVG(room.shortCode);
  
  // Show passphrase as the "code"
  elements.roomCode.textContent = room.passphrase || room.shortCode || '------';
  
  // Show short link
  const link = room.shortLink || `${window.location.origin}/join/${room.shortCode}`;
  elements.roomLink.textContent = link;
  
  // Generate QR code
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`;
  elements.qrCode.src = qrUrl;
  
  renderMembers();
}

function renderMembers() {
  // Update counts (only connected members)
  const connectedMembers = state.members.filter(m => m.status !== 'reconnecting');
  const count = connectedMembers.length;
  const totalCount = state.members.length;
  
  elements.memberCount.textContent = count;
  elements.chatMemberCount.textContent = `${count} member${count !== 1 ? 's' : ''}${totalCount > count ? ` (${totalCount - count} reconnecting)` : ''}`;
  
  // Waiting room members list
  elements.membersList.innerHTML = state.members.map(member => {
    const isYou = member.id === state.memberId;
    const isAdmin = member.role === 'admin';
    const isReconnecting = member.status === 'reconnecting';
    
    return `
      <div class="member-chip ${isYou ? 'is-you' : ''} ${isReconnecting ? 'reconnecting' : ''}">
        <div class="avatar size-sm">${getAvatarSVG(member.avatar)}</div>
        <span class="name">${escapeHtml(member.name)}${isYou ? ' (you)' : ''}${isReconnecting ? ' ⟳' : ''}</span>
        ${isAdmin ? '<span class="badge">Admin</span>' : ''}
      </div>
    `;
  }).join('');
  
  // Chat sidebar members
  elements.sidebarMembers.innerHTML = state.members.map(member => {
    const isYou = member.id === state.memberId;
    const isAdmin = member.role === 'admin';
    const isReconnecting = member.status === 'reconnecting';
    const showActions = state.isAdmin && !isYou && !isAdmin && !isReconnecting;
    
    return `
      <div class="sidebar-member ${isReconnecting ? 'reconnecting' : ''}" data-id="${member.id}">
        <div class="avatar">${getAvatarSVG(member.avatar)}</div>
        <div class="sidebar-member-info">
          <div class="sidebar-member-name">${escapeHtml(member.name)}${isYou ? ' (you)' : ''}</div>
          ${isReconnecting ? `
            <div class="sidebar-member-status">
              <span class="dot"></span> Reconnecting...
            </div>
          ` : `
            <div class="sidebar-member-role">
              ${isAdmin ? ICONS.crown + ' Admin' : ICONS.user + ' Member'}
            </div>
          `}
          ${showActions ? `
            <div class="sidebar-member-actions">
              <button class="btn-promote" onclick="promoteMember('${member.id}')">Promote</button>
              <button class="btn-kick" onclick="kickMember('${member.id}')">Remove</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// Chat Messages
// ==========================================================================

function addMessage(data) {
  const seq = Number(data?.seq || 0);
  if (seq && (!state.lastSeq || seq > state.lastSeq)) {
    state.lastSeq = seq;
  }

  const isOwn = data.senderId === state.memberId;
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isOwn ? 'own' : ''}`;
  
  // Find member to check if admin
  const member = state.members.find(m => m.id === data.senderId);
  const isAdmin = member?.role === 'admin';
  
  messageDiv.innerHTML = `
    <div class="message-avatar">${getAvatarSVG(data.avatar)}</div>
    <div class="message-content">
      <div class="message-bubble">${escapeHtml(data.content)}</div>
      <div class="message-header">
        ${isAdmin ? '<span class="message-badge">Admin</span>' : ''}<span class="message-time">${formatTime(data.timestamp)}</span>
        <span class="message-name">${escapeHtml(data.senderName)}</span>
      </div>
    </div>
  `;
  
  elements.chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

function addSystemMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'system-message';
  messageDiv.textContent = text;
  
  elements.chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

function scrollToBottom() {
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function showBanner(message, type = 'info') {
  elements.chatBanner.innerHTML = `<span>${message}</span>`;
  elements.chatBanner.className = `chat-banner visible ${type}`;
  
  setTimeout(() => {
    elements.chatBanner.classList.remove('visible');
  }, 3000);
}

// Connection status UI - shown during reconnection
function showConnectionStatus() {
  if (elements.connectionStatus) {
    elements.connectionStatus.classList.add('visible');
    elements.connectionStatus.querySelector('span').textContent = 'Reconnecting to server...';
  }
  // Disable chat input
  if (elements.chatInputWrapper) {
    elements.chatInputWrapper.classList.add('disabled');
  }
}

function hideConnectionStatus() {
  if (elements.connectionStatus) {
    elements.connectionStatus.classList.remove('visible');
  }
  // Re-enable chat input
  if (elements.chatInputWrapper) {
    elements.chatInputWrapper.classList.remove('disabled');
  }
}

function showTypingIndicator(names) {
  elements.typingText.textContent = `${names} ${names.includes(',') ? 'are' : 'is'} typing`;
  elements.typingIndicator.classList.add('visible');
}

function hideTypingIndicator() {
  elements.typingIndicator.classList.remove('visible');
}

// ==========================================================================
// Socket Actions
// ==========================================================================

function joinRoom(roomId, isCreator = false) {
  if (!state.connected) {
    showError('Not connected to server');
    return;
  }
  
  console.log('Joining room:', roomId, 'as creator:', isCreator);
  
  state.socket.emit('room:join', {
    roomId: roomId,
    userName: state.displayName,
    userAvatar: getAvatarEmoji(state.avatarId),
    isCreator: isCreator
  }, (response) => {
    console.log('Join response:', response);
    if (response && !response.ok) {
      showError(response.error || 'Failed to join room');
    }
  });
}

function startRoom() {
  state.socket.emit('room:start', {}, (response) => {
    if (response && !response.ok) {
      // Show themed alert dialog for errors on waiting screen
      showAlert('Cannot Start Chat', response.error || 'Failed to start chat', 'warning');
    }
  });
}

function sendMessage(message) {
  if (!message.trim()) return;
  
  state.socket.emit('message:send', {
    text: message.trim(),
    clientMsgId: `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }, (response) => {
    if (response && !response.ok) {
      showBanner(response.error || 'Failed to send message', 'error');
    }
  });
  
  elements.messageInput.value = '';
}

function kickMember(memberId) {
  state.socket.emit('member:kick', { memberId }, (response) => {
    if (response && !response.ok) {
      showBanner(response.error || 'Failed to remove member', 'error');
    }
  });
}

function promoteMember(memberId) {
  state.socket.emit('member:promote', { memberId }, (response) => {
    if (response && !response.ok) {
      showBanner(response.error || 'Failed to promote member', 'error');
    }
  });
}

function closeRoom() {
  // Show themed confirmation dialog instead of browser confirm()
  elements.confirmCloseModal.classList.remove('hidden');
}

function confirmCloseRoom() {
  elements.confirmCloseModal.classList.add('hidden');
  state.socket.emit('room:close', {}, (response) => {
    resetRoomState();
    showScreen('home');
  });
}

function cancelCloseRoom() {
  elements.confirmCloseModal.classList.add('hidden');
}

// Alert dialog icon SVGs for different types
const alertIcons = {
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>`,
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>`
};

function showAlert(title, message, type = 'warning') {
  elements.alertTitle.textContent = title;
  elements.alertMessage.textContent = message;
  elements.alertIcon.className = `alert-dialog-icon ${type}`;
  elements.alertIcon.innerHTML = alertIcons[type] || alertIcons.warning;
  elements.alertModal.classList.remove('hidden');
}

function hideAlert() {
  elements.alertModal.classList.add('hidden');
}

function sendTypingStart() {
  state.socket.emit('typing:start');
  
  if (state.typingTimeout) {
    clearTimeout(state.typingTimeout);
  }
  
  state.typingTimeout = setTimeout(() => {
    state.socket.emit('typing:stop');
  }, 2000);
}

// ==========================================================================
// Utility Functions
// ==========================================================================

function resetRoomState() {
  state.roomId = null;
  state.memberId = null;
  state.room = null;
  state.isAdmin = false;
  state.members = [];
  elements.chatMessages.innerHTML = '';
  clearRoomSession();
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  console.log('Showing error:', message);
  
  // Try to show in the code-error element (join screen)
  const codeError = document.getElementById('code-error');
  if (codeError && document.getElementById('join-method')?.classList.contains('active')) {
    const span = codeError.querySelector('span');
    if (span) span.textContent = message;
    codeError.classList.remove('hidden');
    setTimeout(() => codeError.classList.add('hidden'), 4000);
    return;
  }
  
  // Try to show in the link-error element
  const linkError = document.getElementById('link-error');
  if (linkError && !linkError.closest('.tab-content')?.classList.contains('hidden')) {
    const span = linkError.querySelector('span');
    if (span) span.textContent = message;
    linkError.classList.remove('hidden');
    setTimeout(() => linkError.classList.add('hidden'), 4000);
    return;
  }
  
  // Fallback: show as banner if in chat
  if (elements.chat?.classList.contains('active')) {
    showBanner(message, 'error');
    return;
  }
  
  // Ultimate fallback - themed alert dialog
  showAlert('Error', message, 'error');
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    button.classList.add('copied');
    const originalHTML = button.innerHTML;
    button.innerHTML = `${ICONS.check} Copied!`;
    setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = originalHTML;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

// ==========================================================================
// Event Handlers
// ==========================================================================

function setupEventListeners() {
  // Home screen
  elements.btnCreate.addEventListener('click', () => {
    state.pendingAction = 'create';
    showScreen('setup');
  });
  
  elements.btnJoin.addEventListener('click', () => {
    state.pendingAction = 'join';
    showScreen('setup');
  });

  // Setup screen
  elements.setupBack.addEventListener('click', () => {
    showScreen('home');
  });
  
  document.querySelectorAll('.name-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.displayName.value = btn.dataset.name;
    });
  });
  
  elements.btnContinue.addEventListener('click', () => {
    const name = elements.displayName.value.trim() || 'Anonymous';
    state.displayName = name;
    
    if (state.pendingAction === 'create') {
      showScreen('room-setup');
    } else if (state.pendingAction === 'join') {
      showScreen('join-method');
    } else if (state.pendingAction === 'join-direct' && state.pendingJoinQuery) {
      // Direct join with passphrase/shortCode
      joinWithQuery(state.pendingJoinQuery);
    } else if (state.pendingJoinQuery) {
      // Fallback for direct join
      joinWithQuery(state.pendingJoinQuery);
    } else {
      // Default to join method screen
      showScreen('join-method');
    }
  });

  // Room Setup screen
  elements.roomSetupBack.addEventListener('click', () => {
    showScreen('setup');
  });
  
  elements.btnCreateRoom.addEventListener('click', async () => {
    const roomName = elements.roomName.value.trim() || 'Chat Room';
    elements.btnCreateRoom.disabled = true;
    
    const roomData = await createRoom(roomName);
    elements.btnCreateRoom.disabled = false;
    
    if (roomData) {
      // Join the created room as creator
      joinRoom(roomData.roomId, true);
    }
  });

  // Join Method screen
  elements.joinMethodBack.addEventListener('click', () => {
    showScreen('setup');
  });
  
  elements.joinTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.joinTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`tab-${tabName}`).classList.add('active');
    });
  });
  
  elements.btnJoinCode.addEventListener('click', async () => {
    const code = elements.joinCode.value.trim();
    if (!code) {
      showError('Please enter a passphrase or code');
      return;
    }
    
    elements.btnJoinCode.disabled = true;
    await joinWithQuery(code);
    elements.btnJoinCode.disabled = false;
  });
  
  elements.btnJoinLink.addEventListener('click', async () => {
    const link = elements.joinLink.value.trim();
    
    // Extract shortCode from link
    const match = link.match(/\/join\/([A-Za-z0-9_-]+)/);
    if (match) {
      elements.btnJoinLink.disabled = true;
      await joinWithQuery(match[1]);
      elements.btnJoinLink.disabled = false;
    } else {
      showError('Please enter a valid invite link');
    }
  });

  // Waiting Room
  elements.inviteToggle.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.inviteToggle.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const view = btn.dataset.view;
      elements.inviteCode.classList.toggle('hidden', view !== 'code');
      elements.inviteLink.classList.toggle('hidden', view !== 'link');
      elements.inviteQr.classList.toggle('hidden', view !== 'qr');
    });
  });
  
  elements.copyCode.addEventListener('click', () => {
    copyToClipboard(elements.roomCode.textContent, elements.copyCode);
  });
  
  elements.copyLink.addEventListener('click', () => {
    copyToClipboard(elements.roomLink.textContent, elements.copyLink);
  });
  
  elements.btnStart.addEventListener('click', startRoom);

  // Chat screen
  elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage(elements.messageInput.value);
    }
  });
  
  elements.messageInput.addEventListener('input', () => {
    if (elements.messageInput.value.trim()) {
      sendTypingStart();
    }
  });
  
  elements.btnSend.addEventListener('click', () => {
    sendMessage(elements.messageInput.value);
  });
  
  elements.btnMembers.addEventListener('click', () => {
    elements.membersSidebar.classList.toggle('hidden');
  });
  
  elements.btnCloseSidebar.addEventListener('click', () => {
    elements.membersSidebar.classList.add('hidden');
  });
  
  elements.btnCloseRoom.addEventListener('click', closeRoom);
  
  elements.btnInvite.addEventListener('click', () => {
    if (state.room) {
      elements.modalCode.textContent = state.room.passphrase || state.room.shortCode || '';
      const link = state.room.shortLink || `${window.location.origin}/join/${state.room.shortCode}`;
      elements.modalLink.textContent = link;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`;
      elements.modalQr.src = qrUrl;
    }
    elements.inviteModal.classList.remove('hidden');
  });
  
  elements.modalClose.addEventListener('click', () => {
    elements.inviteModal.classList.add('hidden');
  });
  
  elements.modalCopyCode.addEventListener('click', () => {
    copyToClipboard(elements.modalCode.textContent, elements.modalCopyCode);
  });
  
  elements.modalCopyLink.addEventListener('click', () => {
    copyToClipboard(elements.modalLink.textContent, elements.modalCopyLink);
  });
  
  elements.inviteModal.addEventListener('click', (e) => {
    if (e.target === elements.inviteModal) {
      elements.inviteModal.classList.add('hidden');
    }
  });

  // Overlays
  elements.btnKickedOk.addEventListener('click', () => {
    hideOverlays();
    resetRoomState();
    showScreen('home');
  });
  
  elements.btnClosedOk.addEventListener('click', () => {
    hideOverlays();
    resetRoomState();
    showScreen('home');
  });

  // Confirm Close Modal
  elements.confirmCloseCancel.addEventListener('click', cancelCloseRoom);
  elements.confirmCloseOk.addEventListener('click', confirmCloseRoom);
  elements.confirmCloseModal.addEventListener('click', (e) => {
    if (e.target === elements.confirmCloseModal) {
      cancelCloseRoom();
    }
  });

  // Alert Modal
  elements.alertOk.addEventListener('click', hideAlert);
  elements.alertModal.addEventListener('click', (e) => {
    if (e.target === elements.alertModal) {
      hideAlert();
    }
  });
}

// ==========================================================================
// Join Helpers
// ==========================================================================

async function joinWithQuery(query) {
  const roomData = await lookupRoom(query);
  
  if (!roomData) {
    showError('Room not found or expired');
    return;
  }
  
  if (roomData.status === 'closed') {
    showError('This room has been closed');
    return;
  }
  
  // Join the room
  joinRoom(roomData.roomId, false);
}

// ==========================================================================
// Direct Join URL Handling
// ==========================================================================

function handleDirectJoin() {
  // Check for /join/:shortCode path
  const pathMatch = window.location.pathname.match(/\/join\/([A-Za-z0-9_-]+)/);
  if (pathMatch) {
    state.pendingJoinQuery = pathMatch[1];
    state.pendingAction = 'join-direct';
    showScreen('setup');
    return;
  }
  
  // Check for ?join= or ?code= query param
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join') || params.get('code');
  
  if (joinCode) {
    state.pendingJoinQuery = joinCode;
    state.pendingAction = 'join-direct';
    showScreen('setup');
    // Clear the URL parameter
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }
  
  showScreen('home');
}

// ==========================================================================
// Initialization
// ==========================================================================

function init() {
  renderAvatarGrid();
  setupEventListeners();

  // Restore a previous room session (used for failover + reload resilience)
  loadRoomSession();

  initSocket();
  
  // Handle page visibility
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.typingTimeout) {
      clearTimeout(state.typingTimeout);
      state.socket?.emit('typing:stop');
    }
  });
  
  // Handle beforeunload
  window.addEventListener('beforeunload', () => {
    if (state.roomId) {
      state.socket?.emit('room:leave');
    }
  });
}

// Make functions available globally for onclick handlers
window.kickMember = kickMember;
window.promoteMember = promoteMember;

// Start the application
// Check if DOM already loaded (since app.js loads dynamically after socket.io)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
