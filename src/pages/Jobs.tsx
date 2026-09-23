import { useEffect, useState } from 'react'
import { Badge, Button, Icon, InlineAlert, LoadState } from '../components/ui'
import { api, ApiError, readStatus } from '../api/client'
import { mediaSrc } from '../lib/view'
import { jobCard, type JobCard } from '../lib/verticals'

const jobTypes = ['All', 'Full-time', 'Part-time', 'Freelance', 'Internship']
const levels = ['Any level', 'Entry', 'Mid', 'Senior', 'Executive']
const remoteQuery = { all: undefined, remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' } as const

const fallbackResponsibilities = [
  'Lead development of features with a strong focus on quality and performance',
  'Collaborate with product and design teams to shape requirements',
  'Participate in code reviews and contribute to engineering best practices',
  'Mentor junior team members where applicable',
]

export default function Jobs() {
  const [activeType, setActiveType] = useState('All')
  const [activeLevel, setActiveLevel] = useState('Any level')
  const [remoteFilter, setRemoteFilter] = useState<'all' | 'remote' | 'hybrid' | 'onsite'>('all')
  const [selected, setSelected] = useState('')
  const [applied, setApplied] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchNonce, setSearchNonce] = useState(0)
  const [rows, setRows] = useState<JobCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [acting, setActing] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const listQuery = {
      query: searchQuery.trim() || undefined,
      type: activeType === 'All' ? undefined : activeType,
      level: activeLevel === 'Any level' ? undefined : activeLevel,
      remote: remoteQuery[remoteFilter],
      limit: 100,
    }
    let unauthorized = false
    const swallow = (promise: Promise<{ job: { id: string } }[]>) =>
      promise.catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) unauthorized = true
        return [] as { job: { id: string } }[]
      })
    Promise.all([
      api.jobs.list(listQuery),
      swallow(api.jobs.saved()),
      swallow(api.jobs.applications()),
    ])
      .then(([jobs, saves, applications]) => {
        if (!active) return
        const cards = jobs.map(jobCard)
        setRows(cards)
        setSaved(saves.map((row) => row.job.id))
        setApplied(applications.map((row) => row.job.id))
        setSelected((current) => (cards.some((job) => job.id === current) ? current : cards[0]?.id ?? ''))
        if (unauthorized) setActionError('Sign in to continue.')
      })
      .catch((cause: unknown) => {
        if (active) setError(readStatus(cause, 'Jobs could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [activeType, activeLevel, remoteFilter, searchQuery, searchNonce])

  const selectedJob = rows.find(j => j.id === selected)

  const toggleApply = async (id: string) => {
    if (applied.includes(id) || acting) return
    setActing(true)
    setActionError('')
    try {
      await api.jobs.apply(id)
      setApplied(prev => prev.includes(id) ? prev : [...prev, id])
    } catch (cause: unknown) {
      setActionError(readStatus(cause, 'Unable to apply to this job.'))
    } finally {
      setActing(false)
    }
  }

  const toggleSave = async (id: string) => {
    setActionError('')
    try {
      const result = await api.jobs.toggleSave(id)
      setSaved(prev => result.saved ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(item => item !== id))
    } catch (cause: unknown) {
      setActionError(readStatus(cause, 'Unable to save this job.'))
    }
  }

  const remoteColors: Record<string, string> = {
    'Remote': 'bg-[#D8F3DC] text-[#1B4332]',
    'Hybrid': 'bg-[#DDEEFF] text-[#2B5F8E]',
    'On-site': 'bg-[#FEF3C7] text-[#92400E]',
  }

  const duties = selectedJob && selectedJob.responsibilities.length > 0 ? selectedJob.responsibilities : fallbackResponsibilities

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">

      {/* Hero */}
      <div className="bg-[#1B2A4A] text-white py-12 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-4xl font-semibold mb-3">Local jobs & gigs</h1>
          <p className="text-white/70 text-lg mb-6">Full-time, part-time, freelance, and one-time work in Atlanta.</p>
          <div className="flex gap-3 max-w-2xl">
            <div className="relative flex-1">
              <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C5CCDA]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Job title, keyword, or company..."
                className="w-full h-12 pl-12 pr-4 bg-white/10 backdrop-blur border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-white/50 focus:bg-white/20 transition-all text-sm"
              />
            </div>
            <div className="relative">
              <Icon name="mapPin" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
              <input
                type="text"
                defaultValue="Atlanta, GA"
                className="h-12 pl-9 pr-4 w-40 bg-white/10 border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:border-white/50"
              />
            </div>
            <Button variant="secondary" size="md" onClick={() => setSearchNonce(n => n + 1)}>Search jobs</Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-[#E8E6DF] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            {/* Job type */}
            <div className="flex gap-1">
              {jobTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeType === t ? 'bg-[#2D6A4F] text-white' : 'bg-[#F5F4EF] text-[#5C6E8A] hover:text-[#1B2A4A]'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-[#E8E6DF]" />

            {/* Remote filter */}
            <div className="flex gap-1">
              {([['all', 'Any'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setRemoteFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${remoteFilter === val ? 'bg-[#1B2A4A] text-white' : 'bg-[#F5F4EF] text-[#5C6E8A] hover:text-[#1B2A4A]'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ml-auto">
              <select
                value={activeLevel}
                onChange={e => setActiveLevel(e.target.value)}
                className="h-9 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-lg text-xs font-medium text-[#1B2A4A] focus:outline-none"
              >
                {levels.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        <InlineAlert message={error} />

        <div className="flex gap-6">
          {/* Job list */}
          <div className="flex-1 md:w-80 md:flex-shrink-0">
            <p className="text-sm text-[#8A9AB5] mb-4">
              {loading ? 'Loading jobs…' : error ? 'Jobs could not be loaded.' : <><span className="font-bold text-[#1B2A4A]">{rows.length}</span> jobs in Atlanta</>}
            </p>
            {loading ? (
              <LoadState loading loadingLabel="Loading jobs…" />
            ) : error ? null : (
              <div className="space-y-3">
                {rows.map(job => {
                  const logo = mediaSrc(job.logo, 'w=80&h=80&fit=crop&auto=format')
                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelected(job.id)}
                      className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all ${selected === job.id ? 'border-[#2D6A4F] shadow-sm' : 'border-[#E8E6DF] hover:border-[#2D6A4F]/40'}`}
                    >
                      {/* Company + logo */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                          {logo && <img src={logo} alt={job.company} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-sm text-[#1B2A4A] leading-tight">{job.title}</h3>
                            <button
                              onClick={e => { e.stopPropagation(); void toggleSave(job.id) }}
                              className="flex-shrink-0"
                            >
                              <Icon name="bookmark" size={14} className={saved.includes(job.id) ? 'fill-[#2D6A4F] stroke-[#2D6A4F]' : 'stroke-[#C5CCDA]'} />
                            </button>
                          </div>
                          <p className="text-xs text-[#8A9AB5]">{job.company}</p>
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <Badge variant="navy" size="sm">{job.type}</Badge>
                        <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${remoteColors[job.remote] ?? 'bg-[#F5F4EF] text-[#5C6E8A]'}`}>{job.remote}</span>
                        {job.verified && <Badge variant="green" size="sm">✓ Verified</Badge>}
                      </div>

                      <div className="flex items-center justify-between text-xs text-[#8A9AB5]">
                        <span>{job.location} · {job.posted}</span>
                        <span className="font-semibold text-[#2D6A4F]">{job.salary}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {!loading && !error && rows.length === 0 && (
              <div className="py-12 text-center">
                <div className="text-4xl mb-3">💼</div>
                <p className="font-semibold text-[#1B2A4A]">No jobs match your filters</p>
                <p className="text-sm text-[#8A9AB5] mt-1">Try removing some filters.</p>
              </div>
            )}
          </div>

          {/* Job detail */}
          {selectedJob && (
            <div className="hidden md:block flex-1">
              <div className="bg-white rounded-3xl border border-[#E8E6DF] p-6 sticky top-24">
                {/* Header */}
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#F5F4EF]">
                    {mediaSrc(selectedJob.logo, 'w=100&h=100&fit=crop&auto=format') && (
                      <img src={mediaSrc(selectedJob.logo, 'w=100&h=100&fit=crop&auto=format')!} alt={selectedJob.company} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h2 className="font-display text-2xl font-semibold text-[#1B2A4A]">{selectedJob.title}</h2>
                    <p className="text-[#5C6E8A]">{selectedJob.company}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-[#8A9AB5]">{selectedJob.location}</span>
                      <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${remoteColors[selectedJob.remote] ?? 'bg-[#F5F4EF] text-[#5C6E8A]'}`}>{selectedJob.remote}</span>
                    </div>
                  </div>
                  <button onClick={() => void toggleSave(selectedJob.id)} className="w-10 h-10 rounded-full bg-[#F5F4EF] flex items-center justify-center hover:bg-[#EEF0F5] transition-colors">
                    <Icon name="bookmark" size={16} className={saved.includes(selectedJob.id) ? 'fill-[#2D6A4F] stroke-[#2D6A4F]' : 'stroke-[#8A9AB5]'} />
                  </button>
                </div>

                {/* Key details */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-[#F0FBF3] rounded-xl p-3 text-center">
                    <p className="font-bold text-[#2D6A4F]">{selectedJob.salary}</p>
                    <p className="text-xs text-[#8A9AB5]">Compensation</p>
                  </div>
                  <div className="bg-[#DDEEFF] rounded-xl p-3 text-center">
                    <p className="font-bold text-[#2B5F8E]">{selectedJob.type}</p>
                    <p className="text-xs text-[#8A9AB5]">Job type</p>
                  </div>
                  <div className="bg-[#FEF3C7] rounded-xl p-3 text-center">
                    <p className="font-bold text-[#92400E]">{selectedJob.level}</p>
                    <p className="text-xs text-[#8A9AB5]">Experience</p>
                  </div>
                </div>

                {/* Description */}
                <div className="mb-5">
                  <h3 className="font-semibold text-[#1B2A4A] mb-2">About the role</h3>
                  <p className="text-sm text-[#5C6E8A] leading-relaxed">{selectedJob.description}</p>
                </div>

                <div className="mb-5">
                  <h3 className="font-semibold text-[#1B2A4A] mb-2">Key responsibilities</h3>
                  <ul className="space-y-2 text-sm text-[#5C6E8A]">
                    {duties.map(duty => (
                      <li key={duty} className="flex items-start gap-2"><span className="text-[#2D6A4F] mt-0.5">•</span>{duty}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-5">
                  <h3 className="font-semibold text-[#1B2A4A] mb-2">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedJob.tags.map(tag => <Badge key={tag} variant="gray">{tag}</Badge>)}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#8A9AB5] mb-5 p-3 bg-[#F5F4EF] rounded-xl">
                  <span>📅 Posted {selectedJob.posted}</span>
                  <span>⏰ Deadline: {selectedJob.deadline}</span>
                  {selectedJob.verified && <span className="text-[#2D6A4F] font-semibold">✓ Verified employer</span>}
                </div>

                <InlineAlert message={actionError} />

                {/* CTA */}
                <div className="flex gap-3 mt-4">
                  <Button
                    variant={applied.includes(selectedJob.id) ? 'soft' : 'primary'}
                    size="lg"
                    fullWidth
                    disabled={acting}
                    onClick={() => void toggleApply(selectedJob.id)}
                  >
                    {applied.includes(selectedJob.id) ? '✓ Applied!' : acting ? 'Applying...' : 'Apply now →'}
                  </Button>
                  <button className="px-4 h-12 rounded-full border border-[#E8E6DF] text-[#5C6E8A] hover:bg-[#F5F4EF] transition-colors">
                    <Icon name="share" size={16} />
                  </button>
                </div>
                <p className="text-xs text-[#C5CCDA] text-center mt-3">
                  🔒 Apply through Neighborly — your info stays private until you decide to share it.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
