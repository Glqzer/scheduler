export const COMMON_TIMEZONES = [
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST, UTC-10)' },
  { value: 'America/Anchorage', label: 'Alaska (AKST, UTC-9)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT, UTC-8)' },
  { value: 'America/Denver', label: 'Mountain Time (MT, UTC-7)' },
  { value: 'America/Phoenix', label: 'Arizona (MST, UTC-7)' },
  { value: 'America/Chicago', label: 'Central Time (CT, UTC-6)' },
  { value: 'America/New_York', label: 'Eastern Time (ET, UTC-5)' },
  { value: 'America/Halifax', label: 'Atlantic Time (AT, UTC-4)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT, UTC-3)' },
  { value: 'Atlantic/Azores', label: 'Azores (AZOT, UTC-1)' },
  { value: 'Europe/London', label: 'London (GMT/BST, UTC+0)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET, UTC+1)' },
  { value: 'Europe/Helsinki', label: 'Eastern Europe (EET, UTC+2)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK, UTC+3)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)' },
  { value: 'Asia/Karachi', label: 'Pakistan (PKT, UTC+5)' },
  { value: 'Asia/Dhaka', label: 'Bangladesh (BST, UTC+6)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT, UTC+7)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST, UTC+9)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST, UTC+10)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST, UTC+12)' },
]

export function getLocalTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return 'UTC'
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).formatToParts(new Date())
    return tz
  } catch {
    return 'UTC'
  }
}

export function getLocalTimezoneLabel(): string {
  try {
    const tz = getLocalTimezone()
    const match = COMMON_TIMEZONES.find(t => t.value === tz)
    if (match) return match.label

    const now = new Date()
    const offsetStr = now.toLocaleTimeString('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset'
    }).split(' ').pop() ?? ''

    return `${tz} (${offsetStr})`
  } catch {
    return 'UTC'
  }
}

// Convert a slot time from one timezone to another
// slotTime: "HH:MM:00", date: "YYYY-MM-DD"
export function convertSlotTime(
  date: string,
  slotTime: string,
  fromTz: string,
  toTz: string
): { date: string; time: string } {
  const [h, m] = slotTime.split(':').map(Number)

  // Step 1: Find the UTC ms for this wall clock time in fromTz
  const utcMs = wallClockToUTC(date, h, m, fromTz)

  // Step 2: Format that UTC moment in toTz
  const converted = new Date(utcMs)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: toTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(converted)

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const time = `${get('hour')}:${get('minute')} ${get('dayPeriod')}`

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time,
  }
}

function wallClockToUTC(date: string, h: number, m: number, tz: string): number {
  // Create a UTC date at this time
  const utcGuess = Date.UTC(
    parseInt(date.split('-')[0]),
    parseInt(date.split('-')[1]) - 1,
    parseInt(date.split('-')[2]),
    h, m, 0
  )

  // What does this UTC moment look like in the source timezone?
  const inTz = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(utcGuess))

  // Parse the formatted string back to UTC ms
  const tzDate = new Date(inTz + 'Z') // treat as UTC to parse
  const wallClockMs = tzDate.getTime()

  // The offset is the difference between what we wanted and what we got
  const offset = utcGuess - wallClockMs

  // Apply the offset to get the true UTC time for this wall clock time
  return utcGuess + offset
}

export function formatSlotInTz(date: string, slotTime: string, fromTz: string, toTz: string): string {
  if (fromTz === toTz) {
    const [h, m] = slotTime.split(':').map(Number)
    const period = h < 12 ? 'AM' : 'PM'
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${display}:${String(m).padStart(2, '0')} ${period}`
  }
  return convertSlotTime(date, slotTime, fromTz, toTz).time
}

export function getAllTimezones(): { value: string; label: string }[] {
  const tzNames = (Intl as any).supportedValuesOf?.('timeZone') ?? COMMON_TIMEZONES.map(t => t.value)
  
  return tzNames.map((tz: string) => {
    const now = new Date()
    let offset = ''
    try {
      offset = now.toLocaleTimeString('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset'
      }).split(' ').pop() ?? ''
    } catch {
      offset = 'UTC'
    }
    return { value: tz, label: `${tz.replace(/_/g, ' ')} (${offset})` }
  }).sort((a: { value: string; label: string }, b: { value: string; label: string }) => 
    a.value.localeCompare(b.value)
  )
}