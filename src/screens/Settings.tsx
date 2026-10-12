import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Database, LogIn, LogOut, Palette, Shapes, Target, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { todayKey } from '../lib/dates'
import { useStore } from '../lib/store'
import { Button, Card, ConfirmButton, Dot, Field, Page, Segmented, useToast } from '../ui/kit'
import { useEditors } from '../shell/editors'
import { disablePush } from '../lib/push'
import { NotificationsPanel } from './settings-notifications'
import './settings.css'

const hours = (min: number) => Math.round((min / 60) * 100) / 100

export default function Settings() {
  const { ws, user, updateSettings, loadSample, importWorkspace, resetWorkspace, sync } = useStore()
  const { open } = useEditors()
  const toast = useToast()
  const navigate = useNavigate()
  const s = ws.settings
  const exportData = () => {
    const blob = new Blob([JSON.stringify(ws, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nudge-export-${todayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ name: string; data: unknown } | null>(null)
  const pickBackup = async (file: File | undefined) => {
    if (!file) return
    try { setPendingImport({ name: file.name, data: JSON.parse(await file.text()) }) }
    catch { toast('That file isn’t valid JSON — choose a file made with Export JSON.') }
    if (fileRef.current) fileRef.current.value = ''
  }
  const confirmImport = () => {
    if (!pendingImport) return
    try {
      const next = importWorkspace(pendingImport.data)
      toast(`Backup restored — ${next.sessions.length} sessions, ${next.goals.length} goals, ${next.habits.length} habits`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t read that backup.') }
    setPendingImport(null)
  }


  return (
    <Page eyebrow="Settings" title="Make it yours" subtitle="Targets, notifications, appearance and your account.">
      <div className="settings-grid">
        <Card title={<span className="row"><UserRound size={16} /> Account</span>}>
          <div className="stack-lg">
            <Field label="Display name"><input className="input" value={s.display_name} onChange={e => updateSettings({ display_name: e.target.value })} /></Field>
            {user ? (
              <div className="row-between wrap">
                <div><b>{user.email}</b><div className="muted" style={{ fontSize: 12 }}>{sync === 'error' ? 'Sync paused — changes are kept on this device' : 'Synced across your devices'}</div></div>
                <Button icon={<LogOut size={15} />} onClick={async () => { await disablePush().catch(() => {}); await supabase?.auth.signOut(); navigate('/login') }}>Sign out</Button>
              </div>
            ) : (
              <div className="row-between wrap">
                <span className="muted">Your data is stored on this device. Sign in to sync it across devices.</span>
                <Link className="btn primary" to="/login"><LogIn size={15} /> Sign in or create account</Link>
              </div>
            )}
          </div>
        </Card>

        <Card title={<span className="row"><Palette size={16} /> Appearance</span>}>
          <Segmented value={s.theme} onChange={theme => updateSettings({ theme })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} label="Theme" />
          <div className="form-row" style={{ marginTop: 16 }}>
            <Field label="Timeline starts"><select className="select" value={s.day_start_hour} onChange={e => updateSettings({ day_start_hour: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></Field>
            <Field label="Timeline ends"><select className="select" value={s.day_end_hour} onChange={e => updateSettings({ day_end_hour: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, h) => h + 13).map(h => <option key={h} value={h}>{String(h % 24).padStart(2, '0')}:00</option>)}</select></Field>
          </div>
        </Card>

        <Card title={<span className="row"><Target size={16} /> Productivity targets</span>} sub="Defaults — you can override any single day, week or month from its planner.">
          <div className="form-row">
            <Field label="Daily" hint="(h)"><input className="input" type="number" min={0} step={0.5} value={hours(s.target_minutes_day)} onChange={e => updateSettings({ target_minutes_day: Math.round(Number(e.target.value) * 60) })} /></Field>
            <Field label="Weekly" hint="(h)"><input className="input" type="number" min={0} step={1} value={hours(s.target_minutes_week)} onChange={e => updateSettings({ target_minutes_week: Math.round(Number(e.target.value) * 60) })} /></Field>
            <Field label="Monthly" hint="(h)"><input className="input" type="number" min={0} step={1} value={hours(s.target_minutes_month)} onChange={e => updateSettings({ target_minutes_month: Math.round(Number(e.target.value) * 60) })} /></Field>
            <Field label="Streak minimum" hint="(h/day)"><input className="input" type="number" min={0} step={0.25} value={hours(s.min_minutes_day)} onChange={e => updateSettings({ min_minutes_day: Math.round(Number(e.target.value) * 60) })} /></Field>
          </div>
        </Card>

        <Card title={<span className="row"><Shapes size={16} /> Categories</span>} action={<Button size="sm" onClick={() => open({ kind: 'category' })}>Manage</Button>}>
          <div className="row wrap">{ws.categories.map(c => <span className="chip" key={c.id}><Dot color={c.color} />{c.name}</span>)}</div>
        </Card>

        <NotificationsPanel />

        <Card className="span-2" title={<span className="row"><Database size={16} /> Data</span>}>
          <div className="row wrap">
            <Button onClick={exportData}>Export JSON</Button>
            <Button onClick={() => fileRef.current?.click()}>Import backup…</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => void pickBackup(e.target.files?.[0])} />
            <ConfirmButton size="lg" onConfirm={() => { loadSample(); toast('Sample data loaded') }} confirmLabel="Replace my data with samples">Load sample data</ConfirmButton>
            <ConfirmButton size="lg" onConfirm={() => { resetWorkspace(); toast('Workspace cleared') }} confirmLabel="Yes, delete everything">Start fresh…</ConfirmButton>
            <Button variant="ghost" onClick={() => updateSettings({ onboarded: false })}>Re-run setup</Button>
          </div>
          {pendingImport && (
            <div className="settings-import" role="alert">
              <span>Replace everything with <b>{pendingImport.name}</b>? Your current data{user ? ', including synced data,' : ''} will be overwritten.</span>
              <span className="row">
                <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>Cancel</Button>
                <Button size="sm" variant="danger" onClick={confirmImport}>Replace with backup</Button>
              </span>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Importing, loading samples or starting fresh replaces everything{user ? ', including your synced data' : ' on this device'}.</p>
        </Card>
      </div>
    </Page>
  )
}
