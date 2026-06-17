# Architecture Overview

This document describes the architecture of the MongoDB RAG chat frontend (`rag-app-ui`).

## What It Does

A **frontend chat interface** for the `rag-app` backend. It is a static, framework-free web app (HTML + CSS + vanilla JavaScript) that talks to the FastAPI server over HTTP.

## Where It Sits in the System

```mermaid
flowchart LR
    subgraph Browser["Browser (rag-app-ui)"]
        HTML["index.html"]
        CSS["styles.css"]
        JS["app.js"]
    end

    subgraph Backend["rag-app (FastAPI :8000)"]
        API["api.py"]
        RAG["RAG Pipeline"]
    end

    subgraph Data["MongoDB Atlas"]
        KB[("knowledge_base")]
        CH[("chat_history")]
    end

    HTML --> JS
    CSS --> HTML
    JS -->|"GET /stats, /health"| API
    JS -->|"POST /query"| API
    JS -->|"DELETE /history/{id}"| API
    API --> RAG --> KB
    RAG --> CH
```

The frontend never touches MongoDB, Voyage AI, or the LLM directly — it only calls the API.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Markup | HTML5 (`index.html`) |
| Styling | CSS3 with custom properties (`styles.css`) |
| Logic | Vanilla JavaScript (`app.js`) |
| Server | Optional static file server (`serve.sh` / Python `http.server`) |
| Backend dependency | `rag-app` FastAPI on `http://localhost:8000` |

No `package.json`, no bundler, no framework — open `index.html` or serve static files.

## Project Structure

```
rag-app-ui/
├── index.html          # Static markup — welcome message baked in
├── css/
│   └── styles.css      # Design system + responsive + dark mode
├── js/
│   └── app.js          # All application logic
├── serve.sh            # python -m http.server 8085
└── README.md
```

## UI Layout

```mermaid
flowchart TB
    subgraph Page["index.html"]
        H["Header\nTitle + live stats from /stats"]
        C["Chat Container\nScrollable message bubbles"]
        O["Options Bar\nRerank | Memory | Clear"]
        I["Input Area\nAuto-resize textarea + Send"]
        S["Status Bar\n● Ready / Thinking / Error"]
    end

    H --> C --> O --> I --> S
```

| Region | Element ID | Purpose |
|--------|-----------|---------|
| Header stats | `#stats` | Shows doc count, embedding model, dimensions |
| Chat area | `#chatContainer` | User + assistant message bubbles |
| Rerank toggle | `#useRerank` | Maps to `use_rerank` in API request |
| Memory toggle | `#useMemory` | Controls whether `session_id` is sent |
| Input | `#queryInput` | Auto-growing textarea (max 120px) |
| Send button | `#sendBtn` | Disabled while loading |
| Status | `#statusBar` | Connection / loading / error state |

## Application Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant UI as app.js
    participant API as rag-app :8000

    Note over UI: DOMContentLoaded → init()

    UI->>API: GET /stats
    API-->>UI: { documents, embedding_model, embedding_dimensions }
    UI->>UI: Render header stats

    UI->>API: GET /health
    alt healthy
        API-->>UI: { status: "healthy" }
        UI->>UI: setStatus("ready")
    else unreachable
        UI->>UI: setStatus("error") + error bubble
    end

    User->>UI: Type question + Enter / Send
    UI->>UI: addMessage("user", query)
    UI->>UI: setLoading(true) + "Thinking..." bubble

    UI->>API: POST /query { query, session_id?, use_rerank }
    API-->>UI: { answer, session_id }
    UI->>UI: Remove loading bubble
    UI->>UI: addMessage("assistant", answer)
    UI->>UI: setLoading(false)
```

## Configuration & State

Defined in `js/app.js`:

```javascript
const CONFIG = {
    API_URL: 'http://localhost:8000',
    SESSION_ID: 'web-user-' + Date.now(),
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};
```

| Setting | Value | Effect |
|---------|-------|--------|
| `API_URL` | `http://localhost:8000` | Backend base URL (change for deployment) |
| `SESSION_ID` | `web-user-{timestamp}` | Unique per page load; enables multi-turn memory |
| `MAX_RETRIES` | 3 | Network retry attempts on failed fetch |
| `isLoading` | boolean | Prevents double-submit while waiting |

**Session ID behavior:** Generated once when the page loads. If "Remember Conversation" is checked, every query sends the same `session_id`, so the backend's `ChatMemory` can retrieve prior turns. Unchecking memory sends `session_id: null` — each query is stateless from the server's perspective.

## Query Flow

```mermaid
flowchart TD
    A["User submits query"] --> B{"isLoading?"}
    B -->|Yes| Z["Ignore (debounce)"]
    B -->|No| C["Read toggles:\nuseRerank, useMemory"]
    C --> D["addMessage('user', query)"]
    D --> E["Clear textarea, setLoading(true)"]
    E --> F["addLoadingMessage()"]
    F --> G["fetchWithRetry POST /query"]

    G --> H{"response.ok?"}
    H -->|Yes| I["Parse JSON → data.answer"]
    I --> J["Remove loading bubble"]
    J --> K["addMessage('assistant', answer)"]
    K --> L["setStatus('ready')"]

    H -->|No| M["Throw HTTP error"]
    G -->|Network fail| N["Retry up to 3x\n(1s delay)"]
    N --> G
    N -->|Exhausted| M
    M --> O["addErrorMessage()"]
    O --> P["setStatus('error')"]

    L --> Q["setLoading(false), focus input"]
    P --> Q
```

**API request body:**

```json
{
  "query": "What are MongoDB backup best practices?",
  "session_id": "web-user-1718654321000",
  "use_rerank": false
}
```

`session_id` is `null` when "Remember Conversation" is unchecked.

## API Endpoints Used

| Endpoint | When | UI behavior |
|----------|------|-------------|
| `GET /stats` | On init | Header shows doc count, model, dimensions |
| `GET /health` | On init | Green "Ready" or red error state |
| `POST /query` | Every send | Main RAG interaction |
| `DELETE /history/{session_id}` | Clear Chat (if memory on) | Wipes server-side conversation |

**Not used by the UI** (available on backend but unused here):

- `GET /search` — raw vector search without LLM
- `GET /history/{session_id}` — fetch history (UI doesn't reload past messages on refresh)

## Chat Rendering

```mermaid
flowchart LR
    subgraph addMessage
        R["role: user | assistant"]
        R --> A["Avatar: 👤 or 🤖"]
        R --> B["Bubble with author label"]
        R --> C["escapeHtml(content)\n+ newline → br"]
        C --> D["Append to #chatContainer"]
        D --> E["scrollToBottom()"]
    end
```

| Type | CSS class | Appearance |
|------|-----------|------------|
| User | `.message.user` | Right-aligned, green gradient bubble |
| Assistant | `.message.assistant` | Left-aligned, white/dark surface bubble |
| Loading | `.message.loading` | "Thinking..." with blink animation |
| Error | `.message.error` | Red-tinted warning bubble |

**XSS protection:** `escapeHtml()` uses `textContent` assignment before inserting into DOM — user and API text is escaped; newlines become `<br>`.

## Clear Chat Behavior

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant API

    User->>UI: Click "Clear Chat"
    UI->>User: confirm() dialog
    User->>UI: OK
    UI->>UI: Remove all messages except welcome (index 0)
    UI->>UI: Reset messageCount = 0

    alt useMemory checked
        UI->>API: DELETE /history/{SESSION_ID}
        API-->>UI: { message: "History cleared..." }
    end

    UI->>UI: setStatus("Chat cleared")
```

Clearing resets the **visible** chat and server history. The `SESSION_ID` stays the same for the page session — a full page reload generates a new `SESSION_ID`.

## UI Options → Backend Mapping

```mermaid
flowchart LR
    subgraph UI_Toggles
        R["🔄 Use Reranking"]
        M["💾 Remember Conversation"]
    end

    subgraph API_Fields
        UR["use_rerank: true/false"]
        SID["session_id: string | null"]
    end

    subgraph Backend_Effect
        RR["VectorRetriever.search_with_rerank()"]
        CM["ChatMemory store/retrieve"]
    end

    R --> UR --> RR
    M --> SID --> CM
```

| UI Toggle | Default | Backend effect |
|-----------|---------|----------------|
| Use Reranking | Off | Standard vector search vs. reranked results |
| Remember Conversation | **On** | Persists multi-turn context in `chat_history` collection |

## Styling Architecture

```mermaid
flowchart TB
    subgraph DesignSystem["CSS Variables (:root)"]
        P["--primary-color: #00684A\n(MongoDB green)"]
        S["--secondary-color: #13AA52"]
        BG["--background / --surface"]
        TXT["--text-primary / secondary"]
    end

    subgraph Features
        R["Responsive @768px\nHide Send text on mobile"]
        D["Dark mode\nprefers-color-scheme: dark"]
        A["Accessibility\nprefers-reduced-motion"]
        AN["Animations\nslideIn, pulse, blink"]
    end

    DesignSystem --> Features
```

## Keyboard & Input UX

| Action | Behavior |
|--------|----------|
| **Enter** | Send query (if not loading and input non-empty) |
| **Shift+Enter** | New line in textarea |
| **Input event** | Auto-resize textarea up to 120px |
| **On load** | Input auto-focused |
| **While loading** | Input + Send disabled |

## Error Handling & Resilience

```mermaid
flowchart TD
    subgraph InitErrors
        E1["/stats fails"] --> S1["Header: ⚠️ Could not connect"]
        E2["/health fails"] --> S2["Status: error + error bubble in chat"]
    end

    subgraph QueryErrors
        E3["HTTP 4xx/5xx"] --> Q1["Error bubble with status"]
        E4["Network failure"] --> Q2["fetchWithRetry × 3"]
        Q2 -->|Still fails| Q1
    end

    subgraph ClearErrors
        E5["DELETE /history fails"] --> C1["console.error only\n(UI still clears locally)"]
    end
```

Retries only cover **network-level** fetch failures, not HTTP error status codes.

## Deployment Model

```mermaid
flowchart TB
    subgraph LocalDev
        FE["rag-app-ui\n:8085 static server"]
        BE["rag-app api.py\n:8000"]
        FE -->|CORS allowed| BE
    end

    subgraph Production
        CDN["Netlify / Vercel / GitHub Pages\n(static hosting)"]
        API_DEP["Deployed rag-app API"]
        CDN -->|"Update CONFIG.API_URL"| API_DEP
    end
```

**CORS:** The backend allows all origins (`allow_origins=["*"]` in `api.py`), so the static frontend can be hosted anywhere and still call the API — as long as `CONFIG.API_URL` points to the right server.

**To deploy:** Change `API_URL` in `js/app.js`:

```javascript
API_URL: 'https://your-api.example.com'
```

## What the UI Deliberately Does Not Do

| Feature | Status | Why |
|---------|--------|-----|
| Show retrieved source chunks | ❌ | API returns only `answer`, not citations |
| Reload chat on page refresh | ❌ | Never calls `GET /history/{id}` |
| Vector search-only mode | ❌ | `/search` endpoint unused |
| Auth / API keys | ❌ | Open API assumed (workshop/local use) |
| Markdown rendering | ❌ | Plain text with `escapeHtml` + `<br>` |
| Streaming responses | ❌ | Waits for full `POST /query` response |

## Comparison: `rag-app` vs `rag-app-ui`

| Aspect | `rag-app` | `rag-app-ui` |
|--------|-----------|--------------|
| Role | RAG engine + API | Chat frontend |
| Language | Python | HTML/CSS/JS |
| Intelligence | Embeddings, search, LLM | None (display only) |
| Storage | MongoDB Atlas | Browser DOM only |
| Entry points | `api.py`, `query.py`, `ingest_data.py` | `index.html` |
| Conversation memory | `ChatMemory` in MongoDB | Sends `session_id` toggle |
| Dependencies | pymongo, voyageai, fastapi, etc. | Zero npm packages |

## End-to-End User Journey

```mermaid
flowchart TD
    A["1. Start rag-app API (:8000)"] --> B["2. Serve or open rag-app-ui (:8085)"]
    B --> C["3. Page loads → stats + health check"]
    C --> D{"API reachable?"}
    D -->|No| E["Error state in header + chat"]
    D -->|Yes| F["Green Ready status"]
    F --> G["4. User asks question"]
    G --> H["5. POST /query"]
    H --> I["6. Answer appears in chat"]
    I --> J{"Follow-up question?"}
    J -->|Yes, memory on| K["Same session_id\nbackend recalls context"]
    K --> G
    J -->|Clear chat| L["UI reset + DELETE history"]
    L --> G
```
