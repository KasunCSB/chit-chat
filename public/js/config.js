// ==========================================================================
// ChitChat Frontend Configuration
// ==========================================================================
// Auto-detects environment based on hostname
// ==========================================================================

(function() {
  const host = window.location.hostname;
  
  // Primary: Firebase frontend → backend API
  if (host === 'chit-chat-g7.web.app' || host === 'chit-chat-g7.firebaseapp.com') {
    window.CHITCHAT_API_URL = 'https://cc.kasunc.live';
  }
  // Fallback: Direct backend access (serves both FE + BE)
  // Includes: cc.kasunc.live, localhost, any direct IP access
  else {
    window.CHITCHAT_API_URL = '';  // Same origin
  }
})();
