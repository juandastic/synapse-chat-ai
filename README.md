# Synapse AI Chat

A multi-thread, persona-based conversational interface with deep memory. Each conversation is linked to a persona (AI personality) and maintains persistent context through a knowledge graph.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, React Router DOM
- **Styling:** TailwindCSS, Shadcn/UI components
- **Backend:** Convex (realtime database + serverless functions)
- **Auth:** Clerk
- **LLM:** Synapse Cortex API (OpenRouter-compatible, uses Gemini 2.5 Flash)
- **Knowledge Graph:** Synapse Cortex (persistent user knowledge compilation via Neo4j)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Convex account (free tier available)
- Clerk account (free tier available)
- Synapse Cortex API access (or compatible OpenRouter API)

### Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Initialize Convex:**

   ```bash
   npx convex dev
   ```

   This will prompt you to create a new Convex project and will generate the `_generated` folder.

3. **Configure environment variables:**

   Create a `.env.local` file based on `.env.local.example`:

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in your values:

   - `VITE_CONVEX_URL` - Your Convex deployment URL (shown after `npx convex dev`)
   - `VITE_CLERK_PUBLISHABLE_KEY` - From Clerk dashboard

4. **Configure Clerk in Convex:**

   In the Convex dashboard, go to Settings > Environment Variables and add:

   - `CLERK_JWT_ISSUER_DOMAIN` - Your Clerk JWT issuer domain (e.g., `https://your-app.clerk.accounts.dev`)
   - `SYNAPSE_CORTEX_API_SECRET` - Your Synapse Cortex API secret key

5. **Start development:**

   ```bash
   # Terminal 1: Convex dev server
   npx convex dev

   # Terminal 2: Vite dev server
   npm run dev
   ```

6. Open [http://localhost:5173](http://localhost:5173)

## Core Concepts

- **Persona:** A configuration template defining AI personality (system prompt + identity + icon + language).
- **Thread:** A conversation channel immutably linked to a specific persona.
- **Session:** An atomic execution unit within a thread that snapshots both the system prompt and user knowledge for consistency.

## Architecture

### Database Schema (ER Diagram)

```mermaid
erDiagram
    users {
        string tokenIdentifier
        string name
        string customInstructions
    }
    personas {
        id userId
        string name
        string description
        string language
        string systemPrompt
        string icon
        boolean isDefault
    }
    threads {
        id userId
        id personaId
        string title
        number lastMessageAt
    }
    sessions {
        id userId
        id threadId
        string status
        string cachedUserKnowledge
        string cachedSystemPrompt
        number startedAt
        number endedAt
        number lastMessageAt
    }
    messages {
        id threadId
        id sessionId
        string role
        string content
        string type
        number completedAt
        object metadata
    }

    users ||--o{ personas : owns
    users ||--o{ threads : owns
    personas ||--o{ threads : "used by"
    threads ||--o{ sessions : contains
    threads ||--o{ messages : contains
    sessions ||--o{ messages : "groups"
```

### System Architecture

```mermaid
graph TD
    subgraph frontend [Frontend - React + Vite]
        AppLayout[AppLayout]
        Sidebar[Sidebar]
        PersonaSelector[PersonaSelector]
        ChatView[ChatView]
        PersonaSettings[PersonaSettings]

        AppLayout --> Sidebar
        AppLayout --> PersonaSelector
        AppLayout --> ChatView
    end

    subgraph backend [Convex Backend]
        PersonasAPI[personas.ts]
        ThreadsAPI[threads.ts]
        SessionsAPI[sessions.ts]
        MessagesAPI[messages.ts]
        ChatAPI[chat.ts]
        CortexAPI[cortex.ts]
    end

    subgraph external [External Services]
        CortexService["Synapse Cortex API"]
    end

    subgraph db [Database Tables]
        UsersTable[users]
        PersonasTable[personas]
        ThreadsTable[threads]
        SessionsTable[sessions]
        MessagesTable[messages]
    end

    Sidebar -->|"list threads"| ThreadsAPI
    PersonaSelector -->|"create persona/thread"| PersonasAPI
    PersonaSelector -->|"create thread"| ThreadsAPI
    ChatView -->|"list messages"| MessagesAPI
    ChatView -->|"send message"| MessagesAPI
    PersonaSettings -->|"CRUD"| PersonasAPI

    MessagesAPI -->|"get/create session"| SessionsAPI
    MessagesAPI -->|"schedule"| ChatAPI
    ChatAPI -->|"read session snapshot"| SessionsAPI
    ChatAPI -->|"stream completion"| CortexService
    SessionsAPI -->|"schedule hydrate"| CortexAPI
    SessionsAPI -->|"schedule ingest"| CortexAPI
    CortexAPI -->|"POST /hydrate"| CortexService
    CortexAPI -->|"POST /ingest"| CortexService

    PersonasAPI --> PersonasTable
    ThreadsAPI --> ThreadsTable
    SessionsAPI --> SessionsTable
    MessagesAPI --> MessagesTable
    CortexAPI --> SessionsTable
```

### Message Sending Flow

```mermaid
sequenceDiagram
    participant UI as ChatInput
    participant Msg as messages.send
    participant Sess as sessions
    participant Cortex as cortex.ts
    participant API as Synapse Cortex API
    participant Chat as chat.generateResponse

    UI->>Msg: send(threadId, content)
    Msg->>Sess: getOrCreateActiveSession(threadId)

    alt No active session
        Sess->>Sess: Fetch persona.systemPrompt
        Sess->>Sess: Fetch user.customInstructions
        Sess->>Sess: Build cachedSystemPrompt
        Sess->>Sess: Inherit knowledge from prev session OR undefined
        Sess->>Sess: Create session
        Sess-->>Cortex: schedule hydrate(userId, sessionId)
        Note right of Cortex: Async background job
        Cortex->>API: POST /hydrate {userId}
        API-->>Cortex: userKnowledgeCompilation
        Cortex->>Sess: patch session.cachedUserKnowledge
    end

    Msg->>Msg: Insert user message
    Msg->>Msg: Insert placeholder assistant msg
    Msg->>Sess: touchSession (reset 3h timer)
    Msg->>Msg: Update thread.lastMessageAt
    Msg-->>Chat: schedule generateResponse

    Chat->>Chat: Read session.cachedSystemPrompt
    Chat->>Chat: Read session.cachedUserKnowledge
    Chat->>Chat: Read recent messages by threadId
    Chat->>API: Stream completion
    Chat->>Msg: Update content (throttled 100ms)
    Chat->>Msg: Save metadata
```

### Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: First message in thread
    Created --> Active: Session created with snapshot
    Active --> Active: Messages sent (touch resets 3h timer)
    Active --> Closed: 3h inactivity (autoClose)
    Active --> Closed: Stale detection on next message
    Closed --> Ingesting: Schedule cortex.ingestAndCreateDraft
    Ingesting --> DraftCreated: New session with updated knowledge
    DraftCreated --> Active: Next message uses draft session

    note right of Created
        Snapshot assembly:
        1. cachedSystemPrompt = persona + user instructions
        2. cachedUserKnowledge = inherited OR undefined
        3. Schedule cortex.hydrate (background)
    end note

    note right of Ingesting
        Cortex processes conversation
        Returns updated knowledge compilation
        Creates draft session for next interaction
    end note
```

## Features

### Core Features

- **Multi-Thread Conversations**: Create multiple conversation threads, each with a dedicated persona
- **Persona System**: Choose from templates (Therapist, Coach, Friend) or create custom personas with their own system prompts
- **Deep Memory System**: User knowledge compiled and injected into AI context via Synapse Cortex knowledge graph
- **Real-time Streaming**: AI responses stream in real-time with smooth UI updates (throttled to 100ms intervals)
- **Session Snapshotting**: Sessions freeze both the system prompt and user knowledge for consistency during a conversation
- **Smart Auto-scroll**: Auto-scrolls to bottom on new messages, with scroll-to-bottom button when scrolled up
- **Responsive Design**: Sidebar collapses to hamburger menu on mobile

### Advanced Features

- **Knowledge Hydration**: On session creation, background call to Cortex `/hydrate` fetches latest knowledge (cheap Cypher query, no AI)
- **Knowledge Graph Ingestion**: Closed sessions are automatically ingested into Synapse Cortex to build persistent user knowledge
- **Draft Session Creation**: After ingestion, a draft session is pre-loaded with compiled user knowledge
- **Cross-Session Context**: AI sees full thread history across sessions for better continuity
- **Race Condition Handling**: Handles concurrent session creation during knowledge graph processing
- **Graceful Degradation**: Falls back to previous session knowledge if Cortex ingest fails; sessions work without knowledge

### UI Features

- **Inline Persona Selection**: Full-width card grid for choosing personas (no modal)
- **Persona Settings**: CRUD interface for managing custom personas
- **Session Dividers**: Visual dividers between different sessions in the message list
- **Content Visibility Optimization**: `content-visibility: auto` on message items for rendering performance
- **Thread Sidebar**: Threads sorted by last activity with persona icons and relative timestamps

## Project Structure

```
synapse-ai-chat/
├── convex/                   # Convex backend
│   ├── _generated/           # Auto-generated types
│   ├── schema.ts             # Database schema (5 tables)
│   ├── users.ts              # User management + customInstructions
│   ├── personas.ts           # Persona CRUD + templates
│   ├── threads.ts            # Thread CRUD + cascade delete
│   ├── sessions.ts           # Session management (3h auto-close, dual snapshot)
│   ├── messages.ts           # Message mutations/queries (threadId-scoped)
│   ├── chat.ts               # AI response generation (reads session snapshot)
│   ├── cortex.ts             # Cortex integration (hydrate + ingest)
│   └── auth.config.ts        # Clerk auth config
├── src/
│   ├── components/
│   │   ├── chat/             # Chat components
│   │   │   ├── ChatView.tsx        # Thread chat view (route: /t/:threadId)
│   │   │   ├── ChatInput.tsx       # Message input with threadId
│   │   │   ├── MessageList.tsx     # Messages with content-visibility
│   │   │   ├── MessageItem.tsx     # Individual message rendering
│   │   │   ├── PersonaSelector.tsx # Inline persona selection (route: /)
│   │   │   └── SessionDivider.tsx  # Visual session separator
│   │   ├── layout/
│   │   │   └── AppLayout.tsx       # Sidebar + outlet shell
│   │   ├── settings/
│   │   │   ├── PersonaSettings.tsx # Persona CRUD interface
│   │   │   └── PersonaForm.tsx     # Reusable persona form
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx         # Thread list + navigation
│   │   │   └── ThreadItem.tsx      # Memoized thread list item
│   │   └── ui/               # Reusable UI components (shadcn)
│   ├── contexts/
│   │   └── ChatContext.tsx    # Chat state (threadId-scoped messages)
│   ├── lib/
│   │   └── utils.ts          # Utility functions
│   ├── App.tsx               # Routes (/, /t/:threadId, /settings/personas)
│   ├── main.tsx              # Entry point (BrowserRouter + providers)
│   └── index.css             # Global styles + Tailwind
├── public/
└── package.json
```

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `VITE_CONVEX_URL` | `.env.local` | Convex deployment URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | `.env.local` | Clerk publishable key |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex dashboard | Clerk JWT issuer domain |
| `SYNAPSE_CORTEX_API_SECRET` | Convex dashboard | Synapse Cortex API secret key |

## Key Implementation Decisions

1. **Routing:** `react-router-dom` with paths `/`, `/t/:threadId`, and `/settings/personas`. Sidebar persists via `AppLayout` with `<Outlet />`.
2. **Auto-close timer: 3 hours** for faster knowledge graph updates.
3. **`cachedUserKnowledge` is optional** -- `undefined` for the first session before any ingestion, handles race conditions gracefully.
4. **Knowledge hydration via `/hydrate` endpoint:** Scheduled as background action on session creation. Cheap Cypher query, no AI processing.
5. **Inline persona selection (no modal):** Content area shows `PersonaSelector` card grid. Selecting one creates the thread and navigates directly.
6. **Context window queries by threadId:** `getRecent` fetches messages across all sessions in the thread for full conversational continuity.
7. **Thread deletion cascade:** Deletes all sessions + messages for the thread in a single mutation.
8. **React best practices:** `content-visibility: auto` for message lists, `useTransition` for form submissions, `React.memo` for thread items, functional setState, passive scroll listeners.

## License

MIT
