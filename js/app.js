/**
 * MongoDB RAG Chat Application
 * Frontend JavaScript
 */

// Configuration
const CONFIG = {
    API_URL: 'http://localhost:8000',
    SESSION_ID: 'web-user-' + Date.now(),
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};

// State
let isLoading = false;
let messageCount = 0;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    init();
});

/**
 * Initialize the application
 */
async function init() {
    console.log('Initializing MongoDB RAG Chat...');
    
    // Setup event listeners
    setupEventListeners();
    
    // Load stats
    await loadStats();
    
    // Check API health
    await checkHealth();
    
    // Auto-resize textarea
    setupTextareaResize();
    
    console.log('Application initialized successfully');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    const input = document.getElementById('queryInput');
    const sendBtn = document.getElementById('sendBtn');
    
    // Enter to send (Shift+Enter for new line)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isLoading && input.value.trim()) {
                sendQuery();
            }
        }
    });
    
    // Focus input on load
    input.focus();
}

/**
 * Setup auto-resize for textarea
 */
function setupTextareaResize() {
    const textarea = document.getElementById('queryInput');
    
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
}

/**
 * Load system statistics
 */
async function loadStats() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/stats`);
        const stats = await response.json();
        
        document.getElementById('stats').innerHTML = `
            <span class="stat">📊 Documents: ${stats.documents}</span>
            <span class="stat">🧠 Model: ${stats.embedding_model}</span>
            <span class="stat">📐 Dimensions: ${stats.embedding_dimensions}</span>
        `;
    } catch (error) {
        console.error('Failed to load stats:', error);
        document.getElementById('stats').innerHTML = `
            <span class="stat">⚠️ Could not connect to API</span>
        `;
    }
}

/**
 * Check API health
 */
async function checkHealth() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/health`);
        const health = await response.json();
        
        if (health.status === 'healthy') {
            setStatus('ready', 'Ready');
        } else {
            setStatus('error', 'API is not healthy');
        }
    } catch (error) {
        console.error('Health check failed:', error);
        setStatus('error', 'Cannot connect to API');
        addErrorMessage('⚠️ Cannot connect to API server. Make sure it\'s running at ' + CONFIG.API_URL);
    }
}

/**
 * Send query to the API
 */
async function sendQuery() {
    if (isLoading) return;
    
    const input = document.getElementById('queryInput');
    const query = input.value.trim();
    
    if (!query) {
        input.focus();
        return;
    }
    
    const useRerank = document.getElementById('useRerank').checked;
    const useMemory = document.getElementById('useMemory').checked;
    
    // Add user message to chat
    addMessage('user', query);
    
    // Clear input and reset height
    input.value = '';
    input.style.height = 'auto';
    
    // Set loading state
    setLoading(true);
    setStatus('loading', 'Thinking...');
    
    // Add loading message
    const loadingMsg = addLoadingMessage();
    
    try {
        const response = await fetchWithRetry(`${CONFIG.API_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                session_id: useMemory ? CONFIG.SESSION_ID : null,
                use_rerank: useRerank
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Remove loading message
        loadingMsg.remove();
        
        // Add assistant response
        addMessage('assistant', data.answer);
        
        setStatus('ready', 'Ready');
        
    } catch (error) {
        console.error('Error sending query:', error);
        
        // Remove loading message
        loadingMsg.remove();
        
        // Add error message
        addErrorMessage(`❌ Failed to get answer: ${error.message}`);
        
        setStatus('error', 'Error occurred');
    } finally {
        setLoading(false);
        input.focus();
    }
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, options, retries = CONFIG.MAX_RETRIES) {
    try {
        return await fetch(url, options);
    } catch (error) {
        if (retries > 0) {
            console.log(`Retrying... (${CONFIG.MAX_RETRIES - retries + 1}/${CONFIG.MAX_RETRIES})`);
            await sleep(CONFIG.RETRY_DELAY);
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
}

/**
 * Add message to chat
 */
function addMessage(role, content) {
    const chatContainer = document.getElementById('chatContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.id = `message-${++messageCount}`;
    
    const avatar = role === 'user' ? '👤' : '🤖';
    const author = role === 'user' ? 'You' : 'Assistant';
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-bubble">
            <div class="message-header">
                <span class="message-author">${author}</span>
            </div>
            <div class="message-text">${escapeHtml(content)}</div>
        </div>
    `;
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
    
    return messageDiv;
}

/**
 * Add loading message
 */
function addLoadingMessage() {
    const chatContainer = document.getElementById('chatContainer');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant loading';
    loadingDiv.id = 'loading-message';
    
    loadingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-bubble">
            <div class="message-header">
                <span class="message-author">Assistant</span>
            </div>
            <div class="message-text">Thinking...</div>
        </div>
    `;
    
    chatContainer.appendChild(loadingDiv);
    scrollToBottom();
    
    return loadingDiv;
}

/**
 * Add error message
 */
function addErrorMessage(message) {
    const chatContainer = document.getElementById('chatContainer');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error';
    
    errorDiv.innerHTML = `
        <div class="message-avatar">⚠️</div>
        <div class="message-bubble">
            <div class="message-text">${escapeHtml(message)}</div>
        </div>
    `;
    
    chatContainer.appendChild(errorDiv);
    scrollToBottom();
}

/**
 * Clear chat
 */
function clearChat() {
    if (!confirm('Are you sure you want to clear the chat?')) {
        return;
    }
    
    const chatContainer = document.getElementById('chatContainer');
    
    // Keep only the welcome message (first message)
    const messages = chatContainer.querySelectorAll('.message');
    for (let i = 1; i < messages.length; i++) {
        messages[i].remove();
    }
    
    messageCount = 0;
    
    // Clear conversation history on server if memory is enabled
    const useMemory = document.getElementById('useMemory').checked;
    if (useMemory) {
        clearServerHistory();
    }
    
    setStatus('ready', 'Chat cleared');
    
    // Focus input
    document.getElementById('queryInput').focus();
}

/**
 * Clear server-side conversation history
 */
async function clearServerHistory() {
    try {
        await fetch(`${CONFIG.API_URL}/history/${CONFIG.SESSION_ID}`, {
            method: 'DELETE'
        });
        console.log('Server history cleared');
    } catch (error) {
        console.error('Failed to clear server history:', error);
    }
}

/**
 * Set loading state
 */
function setLoading(loading) {
    isLoading = loading;
    const sendBtn = document.getElementById('sendBtn');
    const input = document.getElementById('queryInput');
    
    sendBtn.disabled = loading;
    input.disabled = loading;
    
    if (loading) {
        sendBtn.innerHTML = `
            <span class="btn-text">Sending...</span>
            <span class="btn-icon">⏳</span>
        `;
    } else {
        sendBtn.innerHTML = `
            <span class="btn-text">Send</span>
            <span class="btn-icon">📤</span>
        `;
    }
}

/**
 * Set status
 */
function setStatus(type, message) {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    
    indicator.className = `status-indicator ${type}`;
    text.textContent = message;
}

/**
 * Scroll to bottom of chat
 */
function scrollToBottom() {
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format timestamp
 */
function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Expose functions to global scope for inline onclick handlers
window.sendQuery = sendQuery;
window.clearChat = clearChat;

