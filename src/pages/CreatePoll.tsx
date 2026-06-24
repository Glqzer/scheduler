import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CalendarPicker from '../components/CalendarPicker'
import { supabase } from '../lib/supabase'

type PollType = 'date_only' | 'date_time'

interface TimeRange {
  start: string
  end: string
}

export default function CreatePoll() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<PollType>('date_only')
  const [selectedDays, setSelectedDays] = useState<Date[]>([])
  const [timeRanges, setTimeRanges] = useState<Record<string, TimeRange>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const dateKey = (d: Date) => d.toISOString().split('T')[0]

  const handleTimeChange = (date: Date, field: 'start' | 'end', value: string) => {
    setTimeRanges(prev => ({
      ...prev,
      [dateKey(date)]: { ...prev[dateKey(date)], [field]: value }
    }))
  }

  const handleSubmit = async () => {
    if (!title.trim()) return setError('Please add a title.')
    if (selectedDays.length === 0) return setError('Please select at least one date.')
    setError('')
    setLoading(true)

    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .insert({ title, description, type })
      .select()
      .single()

    if (pollError || !poll) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    const options = selectedDays.map(date => ({
      poll_id: poll.id,
      date: dateKey(date),
      start_time: type === 'date_time' ? (timeRanges[dateKey(date)]?.start || null) : null,
      end_time: type === 'date_time' ? (timeRanges[dateKey(date)]?.end || null) : null,
    }))

    const { error: optionsError } = await supabase
      .from('poll_options')
      .insert(options)

    if (optionsError) {
      setError('Something went wrong saving the dates.')
      setLoading(false)
      return
    }

    navigate(`/poll/${poll.id}`)
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>Create a poll</h1>

      <div style={{ marginBottom: '1.5rem' }}>
        <label>Title</label>
        <input
          type="text"
          placeholder="e.g. Team lunch"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label>Description (optional)</label>
        <textarea
          placeholder="Any extra details..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label>Type</label>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={() => setType('date_only')}
            style={{ fontWeight: type === 'date_only' ? 'bold' : 'normal' }}
          >
            Dates only
          </button>
          <button
            onClick={() => setType('date_time')}
            style={{ fontWeight: type === 'date_time' ? 'bold' : 'normal' }}
          >
            Dates + times
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label>Select dates</label>
        <CalendarPicker
          selected={selectedDays}
          onChange={days => setSelectedDays(days || [])}
        />
      </div>

      {type === 'date_time' && selectedDays.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label>Time ranges</label>
          {[...selectedDays]
            .sort((a, b) => a.getTime() - b.getTime())
            .map(date => (
              <div key={dateKey(date)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <span style={{ minWidth: 100 }}>
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <input
                  type="time"
                  value={timeRanges[dateKey(date)]?.start || ''}
                  onChange={e => handleTimeChange(date, 'start', e.target.value)}
                />
                <span>to</span>
                <input
                  type="time"
                  value={timeRanges[dateKey(date)]?.end || ''}
                  onChange={e => handleTimeChange(date, 'end', e.target.value)}
                />
              </div>
            ))}
        </div>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Creating...' : 'Create poll'}
      </button>
    </div>
  )
}