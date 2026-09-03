import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "../../stores/chat.store";

const WIDTH_KEY = "gk.sidebar.width";
const COLLAPSED_KEY = "gk.sidebar.collapsed";
const MIN_W = 240;
const MAX_W = 360;
const DEFAULT_W = 280;

function clampWidth(v: number): number {
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(v)));
}

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (!raw) return DEFAULT_W;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return DEFAULT_W;
    return clampWidth(n);
  } catch {
    return DEFAULT_W;
  }
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  return d.toLocaleDateString();
}

export interface SidebarProps {
  width: number;
  onWidthChange: (w: number) => void;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  drawerOpen: boolean;
  onDrawerOpenChange: (v: boolean) => void;
  isMobile: boolean;
}

export function Sidebar({
  width,
  onWidthChange,
  collapsed,
  onCollapsedChange,
  drawerOpen,
  onDrawerOpenChange,
  isMobile,
}: SidebarProps) {
  const threads = useChatStore((s) => s.listThreads(true));
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const createThread = useChatStore((s) => s.createThread);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const renameThread = useChatStore((s) => s.renameThread);
  const deleteThread = useChatStore((s) => s.deleteThread);
  const pinThread = useChatStore((s) => s.pinThread);
  const archiveThread = useChatStore((s) => s.archiveThread);
  const maybeAutoTitle = useChatStore((s) => s.maybeAutoTitle);

  const [searchInput, setSearchInput] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  // Persist width/collapsed handled by parent, but also ensure sidebar itself persists on direct changes if needed
  const handleNewChat = useCallback(() => {
    const id = createThread();
    // close drawer on mobile after new chat
    if (isMobile) onDrawerOpenChange(false);
    // ensure auto title will run when first message arrives
    void maybeAutoTitle;
    return id;
  }, [createThread, isMobile, onDrawerOpenChange]);

  // Filter threads — showArchived false hides archived, true shows all
  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return threads.filter((t) => {
      if (!showArchived && t.archived) return false;
      if (!q) return true;
      const titleMatch = t.title.toLowerCase().includes(q);
      const contentMatch = t.messages.some((m) => m.content.toLowerCase().includes(q));
      return titleMatch || contentMatch;
    });
  }, [threads, searchInput, showArchived]);

  const displayThreads = filtered;

  // Split pinned / others for display
  const pinned = displayThreads.filter((t) => t.pinned);
  const unpinned = displayThreads.filter((t) => !t.pinned);

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditingValue(currentTitle);
  };

  const commitRename = () => {
    if (editingId) {
      const v = editingValue.trim();
      if (v) renameThread(editingId, v);
      setEditingId(null);
    }
  };

  const cancelRename = () => setEditingId(null);

  // Drag handle
  const dragRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = width;
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - startX;
        const next = clampWidth(startW + delta);
        onWidthChange(next);
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        try {
          localStorage.setItem(WIDTH_KEY, String(clampWidth(width)));
        } catch {
          // ignore
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, onWidthChange],
  );

  // Persist width on change
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(clampWidth(width)));
    } catch {
      // ignore
    }
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  // Keyboard: Ctrl+N handled by parent, but also handle here for completeness
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNewChat]);

  // Collapsed desktop: render thin rail with hamburger to expand
  if (!isMobile && collapsed) {
    return (
      <div
        className="sidebar sidebar-collapsed"
        style={{
          width: 0,
          minWidth: 0,
          borderRight: "0.5px solid var(--dsw-alias-border-l2)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "8px 0",
          background: "var(--dsw-alias-bg-layer-1)",
          overflow: "hidden",
        }}
        aria-label="sidebar collapsed"
      >
        <button
          className="icon-btn"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          onClick={() => onCollapsedChange(false)}
          style={{ width: 32, height: 32 }}
        >
          ☰
        </button>
        <button
          className="icon-btn"
          title="New Chat (Ctrl+N)"
          aria-label="New Chat"
          onClick={handleNewChat}
          style={{ marginTop: 8, width: 32, height: 32 }}
        >
          ＋
        </button>
      </div>
    );
  }

  // Mobile drawer overlay
  if (isMobile) {
    return (
      <>
        {/* Drawer backdrop */}
        {drawerOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => onDrawerOpenChange(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.32)",
              backdropFilter: "blur(2px)",
              zIndex: 30,
            }}
            aria-hidden="true"
          />
        )}
        <aside
          className="sidebar sidebar-drawer"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            width: clampWidth(width),
            maxWidth: "85vw",
            background: "var(--dsw-alias-bg-layer-1)",
            borderRight: "1px solid var(--dsw-alias-border-l2)",
            display: "flex",
            flexDirection: "column",
            zIndex: 31,
            transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 180ms ease",
            boxShadow: drawerOpen ? "0 8px 32px rgba(0,0,0,0.2)" : "none",
            overflow: "hidden",
          }}
          aria-label="Threads"
          aria-hidden={!drawerOpen}
        >
          <SidebarInner
            threads={displayThreads}
            pinned={pinned}
            unpinned={unpinned}
            activeThreadId={activeThreadId}
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            editingId={editingId}
            editingValue={editingValue}
            setEditingValue={setEditingValue}
            editRef={editRef}
            startRename={startRename}
            commitRename={commitRename}
            cancelRename={cancelRename}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
            setActiveThread={setActiveThread}
            pinThread={pinThread}
            archiveThread={archiveThread}
            deleteThread={deleteThread}
            handleNewChat={handleNewChat}
            onDrawerOpenChange={onDrawerOpenChange}
            maybeAutoTitle={maybeAutoTitle}
            filteredCount={displayThreads.length}
            totalCount={threads.length}
          />
        </aside>
      </>
    );
  }

  // Desktop expanded
  return (
    <aside
      className="sidebar"
      style={{
        width: clampWidth(width),
        minWidth: clampWidth(width),
        maxWidth: clampWidth(width),
        display: "flex",
        flexDirection: "column",
        background: "var(--dsw-alias-bg-layer-1)",
        borderRight: "0.5px solid var(--dsw-alias-border-l2)",
        overflow: "hidden",
        position: "relative",
      }}
      aria-label="Threads"
    >
      <SidebarInner
        threads={displayThreads}
        pinned={pinned}
        unpinned={unpinned}
        activeThreadId={activeThreadId}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
        editingId={editingId}
        editingValue={editingValue}
        setEditingValue={setEditingValue}
        editRef={editRef}
        startRename={startRename}
        commitRename={commitRename}
        cancelRename={cancelRename}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        setActiveThread={setActiveThread}
        pinThread={pinThread}
        archiveThread={archiveThread}
        deleteThread={deleteThread}
        handleNewChat={handleNewChat}
        onCollapsedChange={onCollapsedChange}
        maybeAutoTitle={maybeAutoTitle}
        filteredCount={displayThreads.length}
        totalCount={threads.length}
      />
      {/* Drag handle */}
      <div
        ref={dragRef}
        onMouseDown={onDragStart}
        className="sidebar-drag-handle"
        title="Drag to resize (240–360px)"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 6,
          bottom: 0,
          cursor: "col-resize",
          background: "transparent",
          zIndex: 2,
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
    </aside>
  );
}

function SidebarInner(props: {
  threads: ReturnType<typeof useChatStore.getState>["threads"] extends Record<string, infer T> ? T[] : never;
  pinned: any[];
  unpinned: any[];
  activeThreadId: string | null;
  searchInput: string;
  setSearchInput: (v: string) => void;
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  editingId: string | null;
  editingValue: string;
  setEditingValue: (v: string) => void;
  editRef: React.RefObject<HTMLInputElement>;
  startRename: (id: string, title: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (v: string | null) => void;
  setActiveThread: (id: string | null) => void;
  pinThread: (id: string, v: boolean) => void;
  archiveThread: (id: string, v: boolean) => void;
  deleteThread: (id: string) => void;
  handleNewChat: () => void;
  onCollapsedChange?: (v: boolean) => void;
  onDrawerOpenChange?: (v: boolean) => void;
  maybeAutoTitle: (id: string) => void;
  filteredCount: number;
  totalCount: number;
}) {
  const {
    pinned,
    unpinned,
    activeThreadId,
    searchInput,
    setSearchInput,
    showArchived,
    setShowArchived,
    editingId,
    editingValue,
    setEditingValue,
    editRef,
    startRename,
    commitRename,
    cancelRename,
    confirmDeleteId,
    setConfirmDeleteId,
    setActiveThread,
    pinThread,
    archiveThread,
    deleteThread,
    handleNewChat,
    onCollapsedChange,
    onDrawerOpenChange,
    filteredCount,
    totalCount,
  } = props;

  const hasThreads = pinned.length + unpinned.length > 0;

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 12px 10px 12px",
          borderBottom: "0.5px solid var(--dsw-alias-border-l2)",
          background: "var(--dsw-alias-bg-layer-1)",
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: 13, flex: 1, letterSpacing: "-0.02em" }}>Chats</strong>
        {onDrawerOpenChange && (
          <button className="icon-btn" title="Close" aria-label="Close sidebar" onClick={() => onDrawerOpenChange(false)} style={{ width: 28, height: 28, fontSize: 12 }}>
            ✕
          </button>
        )}
        {onCollapsedChange && (
          <button className="icon-btn" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={() => onCollapsedChange(true)} style={{ width: 28, height: 28, fontSize: 12 }}>
            ◀
          </button>
        )}
      </div>

      {/* New Chat */}
      <div style={{ padding: "10px 12px", flexShrink: 0 }}>
        <button
          className="btn secondary"
          onClick={handleNewChat}
          title="New Chat (Ctrl+N)"
          aria-label="New Chat"
          style={{ width: "100%", justifyContent: "center", height: 36, fontSize: 13 }}
        >
          ＋ New Chat <span className="muted" style={{ fontSize: 10, marginLeft: 6, opacity: 0.8 }}>Ctrl+N</span>
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 8px 12px", flexShrink: 0 }}>
        <input
          placeholder="Search chats…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search threads"
          style={{
            width: "100%",
            height: 32,
            borderRadius: 8,
            border: "0.5px solid var(--dsw-alias-border-l2)",
            background: "var(--dsw-alias-bg-layer-1)",
            padding: "0 10px",
            fontSize: 13,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, justifyContent: "space-between" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--dsw-alias-label-tertiary)", cursor: "pointer" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived
          </label>
          <span className="muted" style={{ fontSize: 10 }}>
            {filteredCount}/{totalCount}
          </span>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        {!hasThreads && (
          <div className="muted" style={{ fontSize: 12, textAlign: "center", padding: "24px 12px", color: "var(--dsw-alias-label-tertiary)" }}>
            {searchInput ? "No matches" : showArchived ? "No archived chats" : "No chats yet — start one with ＋ New Chat"}
          </div>
        )}

        {pinned.length > 0 && (
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--dsw-alias-state-business-primary)", margin: "4px 4px 6px 4px", fontWeight: 600 }}>Pinned</div>
            {pinned.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={activeThreadId === t.id}
                editing={editingId === t.id}
                editingValue={editingValue}
                setEditingValue={setEditingValue}
                editRef={editRef}
                startRename={startRename}
                commitRename={commitRename}
                cancelRename={cancelRename}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                setActiveThread={setActiveThread}
                pinThread={pinThread}
                archiveThread={archiveThread}
                deleteThread={deleteThread}
                onDrawerOpenChange={onDrawerOpenChange}
              />
            ))}
          </div>
        )}

        {unpinned.length > 0 && (
          <div>
            {pinned.length > 0 && <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--dsw-alias-label-secondary)", margin: "4px 4px 6px 4px" }}>Recent</div>}
            {unpinned.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={activeThreadId === t.id}
                editing={editingId === t.id}
                editingValue={editingValue}
                setEditingValue={setEditingValue}
                editRef={editRef}
                startRename={startRename}
                commitRename={commitRename}
                cancelRename={cancelRename}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                setActiveThread={setActiveThread}
                pinThread={pinThread}
                archiveThread={archiveThread}
                deleteThread={deleteThread}
                onDrawerOpenChange={onDrawerOpenChange}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ThreadRow(props: {
  thread: { id: string; title: string; messages: any[]; updatedAt: number; pinned: boolean; archived: boolean };
  active: boolean;
  editing: boolean;
  editingValue: string;
  setEditingValue: (v: string) => void;
  editRef: React.RefObject<HTMLInputElement>;
  startRename: (id: string, title: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (v: string | null) => void;
  setActiveThread: (id: string | null) => void;
  pinThread: (id: string, v: boolean) => void;
  archiveThread: (id: string, v: boolean) => void;
  deleteThread: (id: string) => void;
  onDrawerOpenChange?: (v: boolean) => void;
}) {
  const {
    thread,
    active,
    editing,
    editingValue,
    setEditingValue,
    editRef,
    startRename,
    commitRename,
    cancelRename,
    confirmDeleteId,
    setConfirmDeleteId,
    setActiveThread,
    pinThread,
    archiveThread,
    deleteThread,
    onDrawerOpenChange,
  } = props;

  const preview = thread.messages.length ? thread.messages[thread.messages.length - 1]?.content?.slice(0, 60) ?? "" : "";
  const isConfirming = confirmDeleteId === thread.id;

  return (
    <div
      onClick={() => {
        if (editing) return;
        setActiveThread(thread.id);
        if (onDrawerOpenChange) onDrawerOpenChange(false);
      }}
      onDoubleClick={() => startRename(thread.id, thread.title)}
      title={thread.title + (preview ? `\n${preview}` : "")}
      aria-selected={active}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") setActiveThread(thread.id);
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 8px",
        borderRadius: 8,
        cursor: "pointer",
        background: active ? "var(--dsw-alias-bg-layer-3)" : "transparent",
        border: `0.5px solid ${active ? "var(--dsw-alias-state-business-primary)" : "transparent"}`,
        opacity: thread.archived ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {thread.pinned && <span style={{ fontSize: 10, color: "var(--dsw-alias-state-business-primary)" }}>★</span>}
        {thread.archived && <span style={{ fontSize: 9, color: "var(--dsw-alias-label-tertiary)", border: "0.5px solid var(--dsw-alias-border-l2)", borderRadius: 4, padding: "0 4px" }}>archived</span>}
        {editing ? (
          <input
            ref={editRef}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, minWidth: 0, height: 24, border: "0.5px solid var(--dsw-alias-state-business-primary)", borderRadius: 6, padding: "0 6px", fontSize: 12 }}
            aria-label="Rename thread"
          />
        ) : (
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
            }}
          >
            {thread.title}
          </span>
        )}
        <span style={{ fontSize: 10, color: "var(--dsw-alias-label-tertiary)", flexShrink: 0 }}>{formatTime(thread.updatedAt)}</span>
      </div>

      {!editing && preview && <div style={{ fontSize: 11, color: "var(--dsw-alias-label-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
        <button
          className="btn ghost"
          onClick={() => pinThread(thread.id, !thread.pinned)}
          title={thread.pinned ? "Unpin" : "Pin"}
          aria-label={thread.pinned ? "Unpin" : "Pin"}
          style={{ height: 22, padding: "0 6px", fontSize: 11, minWidth: 26 }}
        >
          {thread.pinned ? "★" : "☆"}
        </button>
        <button
          className="btn ghost"
          onClick={() => archiveThread(thread.id, !thread.archived)}
          title={thread.archived ? "Unarchive" : "Archive"}
          aria-label={thread.archived ? "Unarchive" : "Archive"}
          style={{ height: 22, padding: "0 6px", fontSize: 11 }}
        >
          {thread.archived ? "↺" : "⧉"}
        </button>
        {!isConfirming ? (
          <button
            className="btn ghost"
            onClick={() => setConfirmDeleteId(thread.id)}
            title="Delete"
            aria-label="Delete"
            style={{ height: 22, padding: "0 6px", fontSize: 11, color: "var(--dsw-alias-state-error-primary)" }}
          >
            🗑
          </button>
        ) : (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <button
              className="btn danger"
              onClick={() => {
                deleteThread(thread.id);
                setConfirmDeleteId(null);
              }}
              style={{ height: 22, padding: "0 8px", fontSize: 11 }}
            >
              Confirm
            </button>
            <button className="btn ghost" onClick={() => setConfirmDeleteId(null)} style={{ height: 22, padding: "0 6px", fontSize: 11 }}>
              Cancel
            </button>
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 10 }}>
          {thread.messages.length} msgs
        </span>
      </div>
    </div>
  );
}

// Helper exports for width persistence (used by App.tsx)
export function getPersistedWidth(): number {
  return loadWidth();
}
export function getPersistedCollapsed(): boolean {
  return loadCollapsed();
}
