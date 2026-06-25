import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CreatePollModal from './CreatePoll'

interface Poll {
  id: string;
  title: string;
  description: string;
  type: "date_only" | "date_time";
  created_at: string;
  deadline: string | null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCreate, setShowCreate] = useState(false)

  const loadPolls = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setUserEmail(session.user.email ?? "");
    const { data } = await supabase
      .from("polls")
      .select("*")
      .eq("created_by", session.user.id)
      .order("created_at", { ascending: false });
    setPolls(data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadPolls(); }, []);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    const ids = [...selected];
    await supabase.from("polls").delete().in("id", ids);
    setPolls(prev => prev.filter(p => !ids.includes(p.id)));
    setSelected(new Set());
    setConfirmDelete(false);
    setDeleting(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Navbar */}
      <nav style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 18, background: "linear-gradient(135deg, var(--primary), var(--accent))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          BeatTheMeet
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{userEmail}</span>
          <button onClick={handleSignOut} style={{ padding: "6px 14px", background: "none", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-secondary)", fontSize: 13 }}>
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        {/* Page header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)" }}>My Events</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
              {polls.length} {polls.length === 1 ? "event" : "events"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {selected.size > 0 && (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ padding: "10px 18px", background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14 }}
              >
                Delete {selected.size} selected
              </button>
            )}
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: "10px 20px", background: "linear-gradient(135deg, var(--primary), #4f46e5)", color: "white", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, boxShadow: "0 4px 12px rgba(109, 40, 217, 0.3)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New event
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>Loading...</div>
        ) : polls.length === 0 ? (
          <div style={{ textAlign: "center", padding: "5rem 2rem", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px dashed var(--border)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>No events yet</p>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Create your first event to get started</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {polls.map(poll => (
              <PollCard
                key={poll.id}
                poll={poll}
                selected={selected.has(poll.id)}
                onSelect={() => toggleSelect(poll.id)}
                onClick={() => { if (selected.size > 0) toggleSelect(poll.id); else navigate(`/poll/${poll.id}`) }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "2rem", maxWidth: 400, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Delete {selected.size} {selected.size === 1 ? "event" : "events"}?</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
              This will permanently delete the selected events and all their responses. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: "10px 18px", background: "none", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text)", fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: "10px 18px", background: "var(--accent)", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCreate && (
  <CreatePollModal
    onClose={() => setShowCreate(false)}
    onCreated={(pollId) => {
      setShowCreate(false)
      loadPolls()
      navigate(`/poll/${pollId}`)
    }}
  />
)}
    </div>
  );
}

function PollCard({ poll, selected, onSelect, onClick }: {
  poll: Poll;
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: "var(--surface)", border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "1.25rem", cursor: "pointer", boxShadow: hovered ? "var(--shadow-hover)" : selected ? "0 0 0 2px var(--primary)" : "var(--shadow)", transform: hovered ? "translateY(-2px)" : "none", transition: "box-shadow 0.2s, transform 0.2s", position: "relative" }}
    >

      {/* Icon + badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
  <div
    onClick={e => { e.stopPropagation(); onSelect(); }}
    style={{ width: 40, height: 40, borderRadius: 10, background: selected ? "var(--primary)" : "linear-gradient(135deg, var(--primary-light), var(--blue-light))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer", border: selected ? "2px solid var(--primary)" : (hovered ? `2px solid var(--border)` : "2px solid transparent"), transition: "all 0.15s" }}
  >
    {(hovered || selected) ? (
      <span style={{ color: selected ? "white" : "var(--text-secondary)", fontSize: 14, fontWeight: 700 }}>✓</span>
    ) : "📅"}
  </div>
  <span style={{ fontSize: 11, fontWeight: 500, background: poll.type === "date_time" ? "var(--primary-light)" : "var(--blue-light)", color: poll.type === "date_time" ? "var(--primary)" : "var(--blue)", padding: "3px 10px", borderRadius: 99 }}>
    {poll.type === "date_time" ? "Date + time" : "Date only"}
  </span>
</div>

      {/* Title */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>{poll.title}</h3>

      {/* Description */}
      {poll.description && (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {poll.description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {new Date(poll.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {poll.deadline && (
          <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>
            Closes {new Date(poll.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>
    </div>
  );
}