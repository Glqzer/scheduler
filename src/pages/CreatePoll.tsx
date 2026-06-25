import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CalendarPicker from "../components/CalendarPicker";
import { supabase } from "../lib/supabase";
import { COMMON_TIMEZONES, getLocalTimezone, getLocalTimezoneLabel } from "../lib/timezones";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  const period = h < 12 ? "AM" : "PM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const value = `${String(h).padStart(2, "0")}:${m}`;
  const label = `${displayH}:${m} ${period}`;
  return { value, label };
});

type PollType = "date_only" | "date_time";
interface TimeRange { start: string; end: string; }

function TimeSelect({ value, onChange, filterAfter, filterBefore }: {
  value: string; onChange: (v: string) => void; filterAfter?: string; filterBefore?: string;
}) {
  const filtered = TIME_OPTIONS.filter(opt => {
    if (filterAfter && opt.value <= filterAfter) return false;
    if (filterBefore && opt.value >= filterBefore) return false;
    return true;
  });
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", cursor: "pointer", fontSize: 13, flex: 1 }}>
      <option value="">-- Select --</option>
      {filtered.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  );
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const localTz = getLocalTimezone();
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", cursor: "pointer", fontSize: 13, width: "100%" }}>
      <option value={localTz}>Local — {getLocalTimezoneLabel()}</option>
      {COMMON_TIMEZONES.filter(t => t.value !== localTz).map(tz => (
        <option key={tz.value} value={tz.value}>{tz.label}</option>
      ))}
    </select>
  );
}

interface CreatePollModalProps {
  onClose: () => void;
  onCreated: (pollId: string) => void;
}

export default function CreatePollModal({ onClose, onCreated }: CreatePollModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<PollType>("date_only");
  const [selectedDays, setSelectedDays] = useState<Date[]>([]);
  const [timeRanges, setTimeRanges] = useState<Record<string, TimeRange>>({});
  const [timezone, setTimezone] = useState(getLocalTimezone());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const dateKey = (d: Date) => d.toISOString().split("T")[0];

  const handleTimeChange = (date: Date, field: "start" | "end", value: string) => {
    setTimeRanges(prev => ({ ...prev, [dateKey(date)]: { ...prev[dateKey(date)], [field]: value } }));
  };

  const handleSubmit = async () => {
    if (!title.trim()) return setError("Please add a title.");
    if (selectedDays.length === 0) return setError("Please select at least one date.");
    if (!userId) return setError("You must be signed in to create a poll.");
    setError("");
    setLoading(true);

    const { data: poll, error: pollError } = await supabase
      .from("polls")
      .insert({ title, description, type, created_by: userId, timezone })
      .select()
      .single();

    if (pollError || !poll) { setError("Something went wrong. Please try again."); setLoading(false); return; }

    const options: { poll_id: string; date: string; slot_time: string | null; start_time: null; end_time: null }[] =
      type === "date_time"
        ? selectedDays.flatMap(date => {
            const range = timeRanges[dateKey(date)];
            if (!range?.start || !range?.end) return [];
            const slots: { poll_id: string; date: string; slot_time: string | null; start_time: null; end_time: null }[] = [];
            const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
            for (let t = toMins(range.start); t < toMins(range.end); t += 30) {
              const h = String(Math.floor(t / 60)).padStart(2, "0");
              const m = String(t % 60).padStart(2, "0");
              slots.push({ poll_id: poll.id, date: dateKey(date), slot_time: `${h}:${m}:00`, start_time: null, end_time: null });
            }
            return slots;
          })
        : selectedDays.map(date => ({ poll_id: poll.id, date: dateKey(date), slot_time: null as string | null, start_time: null as null, end_time: null as null }));

    const { error: optionsError } = await supabase.from("poll_options").insert(options);
    if (optionsError) { setError("Something went wrong saving the dates."); setLoading(false); return; }

    onCreated(poll.id);
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}
    >
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 1.5rem 0" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>New event</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem 1.5rem", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Title */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 6 }}>Title</label>
            <input
              type="text"
              placeholder="e.g. Team lunch"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 14 }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 6 }}>Description <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>(optional)</span></label>
            <textarea
              placeholder="Any extra details..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 14, resize: "vertical" }}
            />
          </div>

          {/* Type toggle */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 8 }}>Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["date_only", "date_time"] as PollType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
                    border: type === t ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: type === t ? "var(--primary-light)" : "var(--bg)",
                    color: type === t ? "var(--primary)" : "var(--text-secondary)",
                    transition: "all 0.15s",
                  }}
                >
                  {t === "date_only" ? "Dates only" : "Dates + times"}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 8 }}>Select dates</label>
            <CalendarPicker selected={selectedDays} onChange={days => setSelectedDays(days || [])} />
          </div>

          {/* Timezone */}
          {type === "date_time" && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 6 }}>Time zone</label>
              <TimezoneSelect value={timezone} onChange={setTimezone} />
            </div>
          )}

          {/* Time ranges */}
          {type === "date_time" && selectedDays.length > 0 && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 8 }}>Time ranges</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...selectedDays].sort((a, b) => a.getTime() - b.getTime()).map((date, i, arr) => {
                  const key = dateKey(date);
                  const prevKey = i > 0 ? dateKey(arr[i - 1]) : null;
                  const prevRange = prevKey ? timeRanges[prevKey] : null;
                  const canCopyAbove = !!(prevRange?.start && prevRange?.end);
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 8, padding: "8px 12px", border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)", minWidth: 52 }}>
                        {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <TimeSelect value={timeRanges[key]?.start || ""} onChange={v => handleTimeChange(date, "start", v)} filterBefore={timeRanges[key]?.end} />
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>to</span>
                      <TimeSelect value={timeRanges[key]?.end || ""} onChange={v => handleTimeChange(date, "end", v)} filterAfter={timeRanges[key]?.start} />
                      {canCopyAbove && (
                        <button
                          type="button"
                          onClick={() => setTimeRanges(prev => ({ ...prev, [key]: { start: prevRange!.start, end: prevRange!.end } }))}
                          style={{ fontSize: 11, color: "var(--primary)", background: "var(--primary-light)", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          Copy above
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p style={{ color: "var(--accent)", fontSize: 13 }}>{error}</p>}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button
              onClick={onClose}
              style={{ padding: "10px 20px", background: "none", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text)", fontSize: 14 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ padding: "10px 24px", background: "linear-gradient(135deg, var(--primary), #4f46e5)", color: "white", border: "none", borderRadius: 8, cursor: loading ? "default" : "pointer", fontWeight: 600, fontSize: 14, boxShadow: "0 4px 12px rgba(109,40,217,0.3)", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Creating..." : "Create event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}