import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  COMMON_TIMEZONES,
  getLocalTimezone,
  getLocalTimezoneLabel,
  formatSlotInTz,
} from "../lib/timezones";
import { useIsMobile } from "../lib/useIsMobile";

interface Poll {
  id: string;
  title: string;
  description: string;
  type: "date_only" | "date_time";
  timezone: string;
}

interface PollOption {
  id: string;
  poll_id: string;
  date: string;
  slot_time: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface Respondent {
  id: string;
  name: string;
  email: string;
}

type Step = "calendar_import" | "identity" | "grid";

export default function Poll() {
  const { id } = useParams<{ id: string }>();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [step, setStep] = useState<Step>("calendar_import");
  const [respondent, setRespondent] = useState<Respondent | null>(null);
  const [myAvailability, setMyAvailability] = useState<Set<string>>(new Set());
  const [allAvailability, setAllAvailability] = useState<
    Record<string, number>
  >({});
  const [totalRespondents, setTotalRespondents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [datePage, setDatePage] = useState(0);
  const PAGE_SIZE = 7;
  const allDates = [...new Set(options.map((o) => o.date))].sort();
  const totalPages = Math.ceil(allDates.length / PAGE_SIZE);
  const visibleDates = allDates.slice(
    datePage * PAGE_SIZE,
    (datePage + 1) * PAGE_SIZE,
  );
  const visibleOptions = options.filter((o) => visibleDates.includes(o.date));
  const [displayTz, setDisplayTz] = useState(getLocalTimezone());
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: pollData } = await supabase
        .from("polls")
        .select("*")
        .eq("id", id)
        .single();
      if (!pollData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPoll(pollData);
      const { data: optionsData } = await supabase
        .from("poll_options")
        .select("*")
        .eq("poll_id", id)
        .order("date");
      setOptions(optionsData ?? []);
      setLoading(false);
    };
    load();
  }, [id]);

  const loadAllAvailability = async () => {
    if (!id) return;
    const { data: respondents } = await supabase
      .from("respondents")
      .select("id")
      .eq("poll_id", id);
    const respondentIds = (respondents ?? []).map((r) => r.id);
    setTotalRespondents(respondentIds.length);
    if (respondentIds.length === 0) {
      setAllAvailability({});
      return;
    }
    const { data: avail } = await supabase
      .from("availability")
      .select("option_id")
      .in("respondent_id", respondentIds);
    const counts: Record<string, number> = {};
    for (const row of avail ?? []) {
      counts[row.option_id] = (counts[row.option_id] ?? 0) + 1;
    }
    setAllAvailability(counts);
  };

  useEffect(() => {
    loadAllAvailability();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`poll-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability" },
        () => {
          loadAllAvailability();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const loadMyAvailability = async (respondentId: string) => {
    const { data } = await supabase
      .from("availability")
      .select("option_id")
      .eq("respondent_id", respondentId);
    setMyAvailability(new Set((data ?? []).map((r) => r.option_id)));
  };

  const toggleCell = async (optionId: string) => {
    if (!respondent) return;
    const isAvailable = myAvailability.has(optionId);
    setMyAvailability((prev) => {
      const next = new Set(prev);
      if (isAvailable) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
    if (isAvailable) {
      await supabase
        .from("availability")
        .delete()
        .eq("respondent_id", respondent.id)
        .eq("option_id", optionId);
    } else {
      await supabase
        .from("availability")
        .upsert(
          { respondent_id: respondent.id, option_id: optionId },
          { onConflict: "respondent_id,option_id", ignoreDuplicates: true },
        );
    }
    await loadAllAvailability();
  };

  const deleteResponse = async () => {
    if (!respondent) return;
    await supabase
      .from("availability")
      .delete()
      .eq("respondent_id", respondent.id);
    await supabase.from("respondents").delete().eq("id", respondent.id);
    setRespondent(null);
    setMyAvailability(new Set());
    setStep("calendar_import");
    loadAllAvailability();
  };

  if (loading)
    return (
      <div
        style={{
          padding: "4rem",
          textAlign: "center",
          color: "var(--text-secondary)",
        }}
      >
        Loading...
      </div>
    );
  if (notFound || !poll)
    return (
      <div
        style={{
          padding: "4rem",
          textAlign: "center",
          color: "var(--text-secondary)",
        }}
      >
        Poll not found.
      </div>
    );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <nav
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          padding: "0 2rem",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 18,
            background:
              "linear-gradient(135deg, var(--primary), var(--accent))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          BeatTheMeet
        </span>
        <BackToDashboardButton />
      </nav>

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "2rem 1.5rem 1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "flex-start",
            flexDirection: isMobile ? "column" : "row",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)" }}>
              {poll.title}
            </h1>
            {poll.description && (
              <p style={{ color: "var(--text-secondary)", marginTop: 6 }}>
                {poll.description}
              </p>
            )}
            {respondent && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Filling as{" "}
                  <strong style={{ color: "var(--text)" }}>
                    {respondent.name}
                  </strong>{" "}
                  ({respondent.email})
                </span>
                <button
                  onClick={deleteResponse}
                  style={{
                    fontSize: 12,
                    color: "var(--accent)",
                    background: "var(--accent-light)",
                    border: "none",
                    borderRadius: 6,
                    padding: "3px 10px",
                    cursor: "pointer",
                  }}
                >
                  Delete my response
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <CopyLinkButton />
            <a
              href={`mailto:?subject=Fill out my availability poll&body=Hey! Please fill out this scheduling poll: ${window.location.href}`}
              style={{
                padding: "8px 16px",
                background: "var(--primary-light)",
                color: "var(--primary)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ✉️ Invite others
            </a>
          </div>
        </div>
      </div>

      {poll.type === "date_time" && (
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 1.5rem",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              Viewing in:
            </span>
            <select
              value={displayTz}
              onChange={(e) => setDisplayTz(e.target.value)}
              style={{
                padding: "6px 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <option value={getLocalTimezone()}>
                Local — {getLocalTimezoneLabel()}
              </option>
              {COMMON_TIMEZONES.filter(
                (t) => t.value !== getLocalTimezone(),
              ).map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            {poll.timezone && poll.timezone !== displayTz && (
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Poll created in{" "}
                {COMMON_TIMEZONES.find((t) => t.value === poll.timezone)
                  ?.label ?? poll.timezone}
              </span>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 1.5rem 3rem",
          filter: step !== "grid" ? "blur(4px)" : "none",
          pointerEvents: step !== "grid" ? "none" : "auto",
          transition: "filter 0.3s",
        }}
      >
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setDatePage((p) => Math.max(0, p - 1))}
              disabled={datePage === 0}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                color: datePage === 0 ? "var(--border)" : "var(--text)",
                cursor: datePage === 0 ? "default" : "pointer",
                fontSize: 13,
              }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {visibleDates[0] ? formatDate(visibleDates[0]) : ""} –{" "}
              {visibleDates[visibleDates.length - 1]
                ? formatDate(visibleDates[visibleDates.length - 1])
                : ""}
            </span>
            <button
              onClick={() =>
                setDatePage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={datePage === totalPages - 1}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                color:
                  datePage === totalPages - 1 ? "var(--border)" : "var(--text)",
                cursor: datePage === totalPages - 1 ? "default" : "pointer",
                fontSize: 13,
              }}
            >
              Next →
            </button>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Page {datePage + 1} of {totalPages}
            </span>
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 24,
          }}
        >
          <AvailabilityGrid
            poll={poll}
            options={visibleOptions}
            myAvailability={myAvailability}
            onToggle={toggleCell}
            displayTz={displayTz}
          />
          <HeatmapGrid
            poll={poll}
            options={visibleOptions}
            allAvailability={allAvailability}
            totalRespondents={totalRespondents}
            displayTz={displayTz}
          />
        </div>
      </div>

      {step === "calendar_import" && (
        <Popup>
          <CalendarImportStep onDone={() => setStep("identity")} />
        </Popup>
      )}
      {step === "identity" && (
        <Popup>
          <IdentityStep
            pollId={poll.id}
            onDone={(r, tz) => {
              setRespondent(r);
              setDisplayTz(tz);
              loadMyAvailability(r.id);
              setStep("grid");
            }}
          />
        </Popup>
      )}
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        padding: "8px 16px",
        background: copied ? "var(--primary-light)" : "var(--surface)",
        color: copied ? "var(--primary)" : "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.2s",
      }}
    >
      {copied ? "✓ Copied!" : "🔗 Copy link"}
    </button>
  );
}

function Popup({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "2rem",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CalendarImportStep({ onDone }: { onDone: () => void }) {
  return (
    <div>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 8,
          color: "var(--text)",
        }}
      >
        Import your calendar
      </h2>
      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: 14,
          marginBottom: 24,
        }}
      >
        Sync your calendar to auto-fill your availability, or skip to fill in
        manually.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button
          onClick={onDone}
          style={{
            padding: "12px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            cursor: "pointer",
            background: "var(--surface)",
            color: "var(--text)",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span>🗓</span> Import from Google Calendar
        </button>
        <button
          onClick={onDone}
          style={{
            padding: "12px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            cursor: "pointer",
            background: "var(--surface)",
            color: "var(--text)",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span>📅</span> Import from Outlook
        </button>
        <button
          onClick={onDone}
          style={{
            padding: "12px",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            background: "none",
            color: "var(--text-secondary)",
            fontSize: 13,
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function BackToDashboardButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setShow(true);
    });
  }, []);
  if (!show) return null;
  return (
    <a
      href="/dashboard"
      style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      ← Dashboard
    </a>
  );
}

function IdentityStep({
  pollId,
  onDone,
}: {
  pollId: string;
  onDone: (r: Respondent, tz: string) => void;
}) {
  const [timezone, setTimezone] = useState(getLocalTimezone());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setEmail(data.user.email);
        setEmailLocked(true);
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim())
      return setError("Please enter your name and email.");
    setLoading(true);
    setError("");
    const { data: existing } = await supabase
      .from("respondents")
      .select("*")
      .eq("poll_id", pollId)
      .eq("name", name.trim())
      .eq("email", email.trim())
      .maybeSingle();
    if (existing) {
      onDone(existing, timezone);
      return;
    }
    const { data: newRespondent, error: insertError } = await supabase
      .from("respondents")
      .insert({ poll_id: pollId, name: name.trim(), email: email.trim() })
      .select()
      .single();
    if (insertError || !newRespondent) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
      return;
    }
    onDone(newRespondent, timezone);
  };

  if (loading)
    return <p style={{ color: "var(--text-secondary)" }}>Loading...</p>;

  return (
    <div>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 8,
          color: "var(--text)",
        }}
      >
        Who are you?
      </h2>
      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: 14,
          marginBottom: 24,
        }}
      >
        Use the same name and email to edit your response later.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: "10px 14px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg)",
            color: "var(--text)",
          }}
        />
        <input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={emailLocked}
          style={{
            padding: "10px 14px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: emailLocked ? "var(--border)" : "var(--bg)",
            color: "var(--text)",
            opacity: emailLocked ? 0.7 : 1,
            cursor: emailLocked ? "not-allowed" : "text",
          }}
        />
        {emailLocked && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginTop: -6,
            }}
          >
            Email pulled from your account
          </p>
        )}
        {error && (
          <p style={{ color: "var(--accent)", fontSize: 13 }}>{error}</p>
        )}
        <div>
          <label
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Your time zone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            style={{
              padding: "10px 14px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg)",
              color: "var(--text)",
              width: "100%",
              fontSize: 13,
            }}
          >
            <option value={getLocalTimezone()}>
              Local — {getLocalTimezoneLabel()}
            </option>
            {COMMON_TIMEZONES.filter((t) => t.value !== getLocalTimezone()).map(
              (tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ),
            )}
          </select>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: "12px",
            background: "linear-gradient(135deg, var(--primary), #4f46e5)",
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Loading..." : "Continue"}
        </button>
      </div>
    </div>
  );
}

function AvailabilityGrid({
  poll,
  options,
  myAvailability,
  onToggle,
  displayTz,
}: {
  poll: Poll;
  options: PollOption[];
  myAvailability: Set<string>;
  onToggle: (optionId: string) => void;
  displayTz: string;
}) {
  const isMobile = useIsMobile();
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(false);
  const [dragStartCell, setDragStartCell] = useState<{
    date: string;
    mins: number;
  } | null>(null);
  const [dragCurrentCell, setDragCurrentCell] = useState<{
    date: string;
    mins: number;
  } | null>(null);
  const [preDragAvailability, setPreDragAvailability] = useState<Set<string>>(
    new Set(),
  );
  const [hoveredOption, setHoveredOption] = useState<PollOption | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Mobile two-tap range selection
  const [tapStart, setTapStart] = useState<{
    date: string;
    mins: number;
    id: string;
  } | null>(null);

  const handleMouseDown = (optionId: string, opt: PollOption) => {
    if (isMobile) return;
    const willBeAvailable = !myAvailability.has(optionId);
    setDragValue(willBeAvailable);
    setIsDragging(true);
    const cell = opt.slot_time
      ? { date: opt.date, mins: parseMins(opt.slot_time) }
      : null;
    setDragStartCell(cell);
    setDragCurrentCell(cell);
    setPreDragAvailability(new Set(myAvailability));
    onToggle(optionId);
  };

  const handleMouseEnter = (
    optionId: string,
    opt: PollOption,
    e: React.MouseEvent,
  ) => {
    if (isMobile) return;
    setHoveredOption(opt);
    setTooltipPos({ x: e.clientX, y: e.clientY });
    if (!isDragging || !dragStartCell || !opt.slot_time) return;

    const currentCell = { date: opt.date, mins: parseMins(opt.slot_time) };
    setDragCurrentCell(currentCell);

    const minDate = [dragStartCell.date, currentCell.date].sort()[0];
    const maxDate = [dragStartCell.date, currentCell.date].sort()[1];
    const minMins = Math.min(dragStartCell.mins, currentCell.mins);
    const maxMins = Math.max(dragStartCell.mins, currentCell.mins);

    const next = new Set(preDragAvailability);
    for (const option of options) {
      if (!option.slot_time) continue;
      const oMins = parseMins(option.slot_time);
      const inRect =
        option.date >= minDate &&
        option.date <= maxDate &&
        oMins >= minMins &&
        oMins <= maxMins;
      if (inRect) {
        if (dragValue) next.add(option.id);
        else next.delete(option.id);
      }
    }

    const added = [...next].filter((id) => !myAvailability.has(id));
    const removed = [...myAvailability].filter((id) => !next.has(id));
    for (const id of added) onToggle(id);
    for (const id of removed) onToggle(id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (hoveredOption) setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  // Mobile tap handler
  const handleMobileTap = (optionId: string, opt: PollOption) => {
    if (poll.type === "date_only") {
      onToggle(optionId);
      return;
    }

    if (!opt.slot_time) return;
    const cell = {
      date: opt.date,
      mins: parseMins(opt.slot_time),
      id: optionId,
    };

    if (!tapStart) {
      // First tap — set start
      setTapStart(cell);
      return;
    }

    // Second tap — fill range
    const minDate = [tapStart.date, cell.date].sort()[0];
    const maxDate = [tapStart.date, cell.date].sort()[1];
    const minMins = Math.min(tapStart.mins, cell.mins);
    const maxMins = Math.max(tapStart.mins, cell.mins);

    const willBeAvailable = !myAvailability.has(tapStart.id);

    for (const option of options) {
      if (!option.slot_time) continue;
      const oMins = parseMins(option.slot_time);
      const inRect =
        option.date >= minDate &&
        option.date <= maxDate &&
        oMins >= minMins &&
        oMins <= maxMins;
      if (inRect) {
        const isAvailable = myAvailability.has(option.id);
        if (willBeAvailable && !isAvailable) onToggle(option.id);
        if (!willBeAvailable && isAvailable) onToggle(option.id);
      }
    }

    setTapStart(null);
  };

  useEffect(() => {
    const up = () => {
      setIsDragging(false);
      setDragStartCell(null);
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const dates = [...new Set(options.map((o) => o.date))].sort();

  const getSlotLabel = (slotTime: string) => {
    const parts = slotTime.split(":").map(Number);
    const h = parts[0];
    const m = parts[1];
    const period = h < 12 ? "AM" : "PM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:${String(m).padStart(2, "0")} ${period}`;
  };

  const cellHeight = isMobile ? 28 : 20;
  const cellHeightLarge = isMobile ? 48 : 40;

  if (poll.type === "date_only") {
    return (
      <div>
        <GridHeader title="Your availability" legend={<AvailableLegend />} />
        {isMobile && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 10,
            }}
          >
            Tap a date to mark yourself as available. Tap again to remove.
          </p>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {options.map((opt) => (
                  <th
                    key={opt.id}
                    style={{
                      padding: "4px 8px",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 400,
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        marginBottom: 2,
                      }}
                    >
                      {formatDayOfWeek(opt.date)}
                    </div>
                    <div>{formatDate(opt.date)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {options.map((opt) => (
                  <td key={opt.id} style={{ padding: 4, textAlign: "center" }}>
                    <div
                      onMouseDown={() => handleMouseDown(opt.id, opt)}
                      onMouseEnter={(e) => handleMouseEnter(opt.id, opt, e)}
                      onMouseLeave={() => setHoveredOption(null)}
                      onClick={() => isMobile && handleMobileTap(opt.id, opt)}
                      style={{
                        width: "100%",
                        height: cellHeightLarge,
                        borderRadius: 6,
                        cursor: "pointer",
                        background: myAvailability.has(opt.id)
                          ? "#22c55e"
                          : "var(--border)",
                        transition: "background 0.1s",
                        userSelect: "none",
                      }}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const slotsByHour: Record<
    string,
    { mins: number; optsByDate: Record<string, PollOption> }[]
  > = {};
  for (const opt of options) {
    if (!opt.slot_time) continue;
    const parts = opt.slot_time.split(":").map(Number);
    const h = parts[0];
    const m = parts[1];
    const mins = h * 60 + m;
    const convertedLabel = formatSlotInTz(
      opt.date,
      opt.slot_time,
      poll.timezone,
      displayTz,
    );
    const [timePart, period] = convertedLabel.split(" ");
    const displayH = timePart.split(":")[0];
    const hourKey = `${displayH} ${period}`;
    if (!slotsByHour[hourKey]) slotsByHour[hourKey] = [];
    let slot = slotsByHour[hourKey].find((s) => s.mins === mins);
    if (!slot) {
      slot = { mins, optsByDate: {} };
      slotsByHour[hourKey].push(slot);
    }
    slot.optsByDate[opt.date] = opt;
  }

  const hours = Object.keys(slotsByHour);

  return (
    <div style={{ position: "relative" }} onMouseMove={handleMouseMove}>
      <GridHeader title="Your availability" legend={<AvailableLegend />} />

      {/* Mobile instructions */}
      {isMobile && (
        <div
          style={{
            background: "var(--primary-light)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 12,
            fontSize: 13,
            color: "var(--primary)",
          }}
        >
          {tapStart
            ? "📍 Now tap the end of your available range"
            : "👆 Tap where your availability starts, then tap where it ends"}
        </div>
      )}

      {/* Desktop tooltip */}
      {!isMobile && hoveredOption?.slot_time && (
        <div
          style={{
            position: "fixed",
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 30,
            background: "#1f2937",
            color: "white",
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: "none",
            zIndex: 100,
          }}
        >
          {formatDate(hoveredOption.date)}{" "}
          {formatSlotInTz(
            hoveredOption.date,
            hoveredOption.slot_time,
            poll.timezone,
            displayTz,
          )}{" "}
          –{" "}
          {formatSlotInTz(
            hoveredOption.date,
            addMinsToSlot(hoveredOption.slot_time, 30),
            poll.timezone,
            displayTz,
          )}
        </div>
      )}

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: isMobile ? 50 : 70 }} />
              {dates.map((d) => (
                <th
                  key={d}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 400,
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      marginBottom: 2,
                    }}
                  >
                    {formatDayOfWeek(d)}
                  </div>
                  <div>{formatDate(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => {
              const slots = slotsByHour[hour].sort((a, b) => a.mins - b.mins);
              return slots.map((slot, i) => (
                <tr
                  key={`${hour}-${slot.mins}`}
                  style={{
                    borderTop: i === 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <td
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      paddingRight: 8,
                      whiteSpace: "nowrap",
                      verticalAlign: "middle",
                      paddingTop: i === 0 ? 4 : 0,
                    }}
                  >
                    {i === 0 ? hour : ""}
                  </td>
                  {dates.map((d) => {
                    const opt = slot.optsByDate[d];
                    const isTapStart =
                      tapStart && opt && tapStart.id === opt.id;
                    return (
                      <td key={d} style={{ padding: 2, textAlign: "center" }}>
                        {opt ? (
                          <div
                            onMouseDown={() => handleMouseDown(opt.id, opt)}
                            onMouseEnter={(e) =>
                              handleMouseEnter(opt.id, opt, e)
                            }
                            onMouseLeave={() => setHoveredOption(null)}
                            onClick={() =>
                              isMobile && handleMobileTap(opt.id, opt)
                            }
                            style={{
                              width: "100%",
                              height: cellHeight,
                              borderRadius: 4,
                              cursor: "pointer",
                              background: isTapStart
                                ? "var(--primary)"
                                : myAvailability.has(opt.id)
                                  ? "#22c55e"
                                  : "var(--border)",
                              transition: "background 0.1s",
                              userSelect: "none",
                              outline: isTapStart
                                ? "2px solid var(--primary)"
                                : "none",
                            }}
                          />
                        ) : (
                          <div style={{ height: cellHeight }} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeatmapGrid({
  poll,
  options,
  allAvailability,
  totalRespondents,
  displayTz,
}: {
  poll: Poll;
  options: PollOption[];
  allAvailability: Record<string, number>;
  totalRespondents: number;
  displayTz: string;
}) {
  const isMobile = useIsMobile();
  const cellHeight = isMobile ? 28 : 20;
  const cellHeightLarge = isMobile ? 48 : 40;
  const getColor = (count: number) => {
    if (count === 0 || totalRespondents === 0) return "var(--border)";
    const ratio = count / totalRespondents;
    if (ratio < 0.33) return "#bfdbfe";
    if (ratio < 0.66) return "#f9a8d4";
    return "#7c3aed";
  };

  const dates = [...new Set(options.map((o) => o.date))].sort();

  if (poll.type === "date_only") {
    return (
      <div>
        <GridHeader title="Group availability" legend={<HeatmapLegend />} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {options.map((opt) => (
                  <th
                    key={opt.id}
                    style={{
                      padding: "4px 8px",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(opt.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {options.map((opt) => (
                  <td key={opt.id} style={{ padding: 4, textAlign: "center" }}>
                    <div
                      style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 6,
                        background: getColor(allAvailability[opt.id] ?? 0),
                        transition: "background 0.3s",
                      }}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p
          style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}
        >
          {totalRespondents} {totalRespondents === 1 ? "person" : "people"}{" "}
          responded
        </p>
      </div>
    );
  }

  const slotsByHour: Record<
    string,
    { mins: number; optsByDate: Record<string, PollOption> }[]
  > = {};
  for (const opt of options) {
    if (!opt.slot_time) continue;
    const parts = opt.slot_time.split(":").map(Number);
    const h = parts[0];
    const m = parts[1];
    const mins = h * 60 + m;

    // Use converted time for the hour label
    const convertedLabel = formatSlotInTz(
      opt.date,
      opt.slot_time,
      poll.timezone,
      displayTz,
    );
    const [timePart, period] = convertedLabel.split(" ");
    const displayH = timePart.split(":")[0];
    const hourKey = `${displayH} ${period}`;

    if (!slotsByHour[hourKey]) slotsByHour[hourKey] = [];
    let slot = slotsByHour[hourKey].find((s) => s.mins === mins);
    if (!slot) {
      slot = { mins, optsByDate: {} };
      slotsByHour[hourKey].push(slot);
    }
    slot.optsByDate[opt.date] = opt;
  }

  const hours = Object.keys(slotsByHour);

  return (
    <div>
      <GridHeader title="Group availability" legend={<HeatmapLegend />} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: 70 }} />
              {dates.map((d) => (
                <th
                  key={d}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 400,
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      marginBottom: 2,
                    }}
                  >
                    {formatDayOfWeek(d)}
                  </div>
                  <div>{formatDate(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => {
              const slots = slotsByHour[hour].sort((a, b) => a.mins - b.mins);
              return slots.map((slot, i) => (
                <tr
                  key={`${hour}-${slot.mins}`}
                  style={{
                    borderTop: i === 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <td
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      paddingRight: 8,
                      whiteSpace: "nowrap",
                      verticalAlign: "middle",
                      paddingTop: i === 0 ? 4 : 0,
                    }}
                  >
                    {i === 0 ? hour : ""}
                  </td>
                  {dates.map((d) => {
                    const opt = slot.optsByDate[d];
                    return (
                      <td key={d} style={{ padding: 2, textAlign: "center" }}>
                        <div
                          style={{
                            width: "100%",
                            height: 20,
                            borderRadius: 4,
                            background: opt
                              ? getColor(allAvailability[opt.id] ?? 0)
                              : "transparent",
                            transition: "background 0.3s",
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
        {totalRespondents} {totalRespondents === 1 ? "person" : "people"}{" "}
        responded
      </p>
    </div>
  );
}

function GridHeader({
  title,
  legend,
}: {
  title: string;
  legend: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
        {title}
      </h2>
      {legend}
    </div>
  );
}

function AvailableLegend() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: "#22c55e",
        }}
      />
      Available
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: "var(--text-secondary)",
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: "#bfdbfe",
        }}
      />{" "}
      Few
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: "#f9a8d4",
        }}
      />{" "}
      Some
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: "#7c3aed",
        }}
      />{" "}
      Most
    </div>
  );
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDayOfWeek(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
  });
}

function addMinsToSlot(slotTime: string, mins: number): string {
  const parts = slotTime.split(":").map(Number);
  const total = parts[0] * 60 + parts[1] + mins;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function parseMins(slotTime: string) {
  const parts = slotTime.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}
