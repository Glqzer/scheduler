import { useState, useEffect, useCallback } from "react";

interface Props {
  selected: Date[];
  onChange: (dates: Date[]) => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dateKey = (d: Date) => d.toISOString().split("T")[0];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getDaysInMonth = (year: number, month: number) => {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const getDatesBetween = (a: Date, b: Date): Date[] => {
  const start = a < b ? a : b;
  const end = a < b ? b : a;
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

export default function CalendarPicker({ selected, onChange }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preDragSelected, setPreDragSelected] = useState<Date[]>([]);

  const days = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = days[0].getDay();

  const dragPreviewKeys = new Set<string>();
  if (dragStart && dragEnd) {
    getDatesBetween(dragStart, dragEnd)
      .filter((d) => d >= today || isSameDay(d, today))
      .forEach((d) => dragPreviewKeys.add(dateKey(d)));
  }

  // Use preDragSelected for the selected keys during drag
  const selectedKeys = new Set(
    (isDragging ? preDragSelected : selected).map(dateKey),
  );

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const commitDrag = useCallback(() => {
    if (dragStart && dragEnd) {
      if (isSameDay(dragStart, dragEnd)) {
        const exists = preDragSelected.some((s) => isSameDay(s, dragStart));
        if (exists) {
          onChange(preDragSelected.filter((s) => !isSameDay(s, dragStart)));
        } else {
          onChange([...preDragSelected, dragStart]);
        }
      } else {
        const range = getDatesBetween(dragStart, dragEnd).filter(
          (d) => d >= today || isSameDay(d, today),
        ); // filter past dates
        const newSelected = [...preDragSelected];
        range.forEach((d) => {
          if (!newSelected.some((s) => isSameDay(s, d))) newSelected.push(d);
        });
        onChange(newSelected);
      }
    }
    setDragStart(null);
    setDragEnd(null);
    setIsDragging(false);
  }, [dragStart, dragEnd, preDragSelected, onChange]);

  useEffect(() => {
    const onMouseUp = () => {
      if (isDragging) commitDrag();
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [isDragging, commitDrag]);

  const handleMouseDown = (date: Date) => {
    if (date < today && !isSameDay(date, today)) return;
    setDragStart(date);
    setDragEnd(date);
    setIsDragging(true);
    setPreDragSelected(selected);
  };

  const handleMouseEnter = (date: Date) => {
    if (!isDragging) return;
    setDragEnd(date);
  };

  // touch support
  const handleTouchStart = (date: Date) => {
    if (date < today && !isSameDay(date, today)) return;
    setDragStart(date);
    setDragEnd(date);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const key = el?.getAttribute("data-date");
    if (key) {
      const [y, m, d] = key.split("-").map(Number);
      setDragEnd(new Date(y, m - 1, d));
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) commitDrag();
  };

  const handleDayClick = (date: Date) => {
    if (date < today && !isSameDay(date, today)) return;
    const exists = selected.some((s) => isSameDay(s, date));
    if (exists) {
      onChange(selected.filter((s) => !isSameDay(s, date)));
    }
  };

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      style={{ userSelect: "none", width: "100%" }}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <button onClick={prevMonth} type="button">
          ‹
        </button>
        <span style={{ fontWeight: 500 }}>{monthLabel}</span>
        <button onClick={nextMonth} type="button">
          ›
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          textAlign: "center",
        }}
      >
        {DAYS.map((d) => (
          <div
            key={d}
            style={{ fontSize: 12, color: "#888", paddingBottom: 4 }}
          >
            {d}
          </div>
        ))}

        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {days.map((date) => {
          const key = dateKey(date);
          const isPast = date < today && !isSameDay(date, today);
          const isSelected = selectedKeys.has(key);
          const isPreview = dragPreviewKeys.has(key);

          let bg = "transparent";
          let color = isPast ? "var(--border)" : "inherit";
          if (isPast) {
            bg = "transparent";
            color = "var(--border)";
          }
          if (isSelected) {
            bg = "#4f46e5";
            color = "white";
          }
          if (isPreview && !isSelected) {
            bg = "#c7d2fe";
            color = "#1e1b4b";
          }

          return (
            <div
              key={key}
              data-date={key}
              onMouseDown={() => handleMouseDown(date)}
              onMouseEnter={() => handleMouseEnter(date)}
              onTouchStart={() => handleTouchStart(date)}
              style={{
                padding: "10px 0",
                borderRadius: 8,
                cursor: isPast ? "default" : "pointer",
                background: bg,
                color,
                fontSize: 15,
                textDecoration: isPast ? "line-through" : "none",
              }}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
