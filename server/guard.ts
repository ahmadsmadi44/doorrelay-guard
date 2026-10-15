import { randomUUID } from 'node:crypto';
import type { GuardState, Observation, OutputCommand, SourceKind } from '../shared/types';

export const WARNING = 'Please leave the package in the delivery area.';
export const createState = (): GuardState => ({
  parcel: { name: 'Front door parcel', status: 'unarmed', source: 'synthetic', session: '', claimedBy: null },
  observation: null, pickupUntil: 0, autoWarn: false, incidents: [], timeline: [], commands: [],
});

export class Guard {
  state: GuardState;
  private consecutive = 0;
  private returns = 0;
  private lastObservation = 0;
  constructor(state = createState(), private now = () => Date.now()) { this.state = state; }
  log(title: string, detail: string, tone: 'neutral' | 'good' | 'alert' = 'neutral') {
    this.state.timeline.unshift({ id: randomUUID(), at: this.now(), title, detail, tone });
    this.state.timeline = this.state.timeline.slice(0, 100);
  }
  tick() {
    const now = this.now();
    if (this.state.pickupUntil && this.state.pickupUntil <= now) {
      this.state.pickupUntil = 0;
      if (this.state.parcel.status === 'pickup') this.state.parcel.status = 'armed';
      this.log('Pickup window ended', 'The parcel needs a new authorization before collection.');
    }
    for (const command of this.state.commands) {
      if ((command.status === 'pending' || command.status === 'started') && command.expiresAt < now) {
        command.status = 'expired'; this.log('Warning not confirmed', 'The speaker did not complete this command in time.', 'alert');
      }
    }
    for (const incident of this.state.incidents) if (now - incident.at > 86_400_000) { delete incident.before; delete incident.after; }
  }
  arm(source: SourceKind, reference?: string, name = 'Front door parcel') {
    for (const incident of this.state.incidents) if (incident.status === 'open') incident.status = 'superseded';
    this.state.parcel = { name, source, status: 'armed', session: randomUUID(), reference, claimedBy: null };
    this.state.observation = null; this.state.pickupUntil = 0; this.consecutive = 0; this.returns = 0; this.lastObservation = 0;
    for (const command of this.state.commands) if (command.status === 'pending') command.status = 'expired';
    this.log('Parcel enrolled', `Tracking selected pixels from ${source === 'synthetic' ? 'the synthetic test scene' : source === 'ring' ? 'Ring video' : 'your local video'}.`, 'good');
  }
  disarm() {
    this.state.parcel.status = 'unarmed'; this.state.parcel.session = ''; this.state.observation = null;
    this.state.pickupUntil = 0; this.consecutive = 0;
    for (const command of this.state.commands) if (command.status === 'pending') command.status = 'expired';
    this.log('Tracking stopped', 'Start a new observation session to resume.');
  }
  stopObserving() {
    if (!this.state.parcel.session && !this.state.observation) return;
    this.state.parcel.session = ''; this.state.observation = null; this.consecutive = 0; this.returns = 0;
    if (['armed', 'returned'].includes(this.state.parcel.status)) this.state.parcel.status = 'unarmed';
    for (const command of this.state.commands) if (command.status === 'pending') command.status = 'expired';
    this.log('Video observation ended', 'Video stopped. Any active pickup authorization or unresolved review remains available.');
  }
  pickup() {
    if (!['armed', 'returned', 'review'].includes(this.state.parcel.status)) throw new Error('Enroll a parcel before starting pickup.');
    this.state.pickupUntil = this.now() + 120_000; this.state.parcel.status = 'pickup'; this.consecutive = 0;
    for (const command of this.state.commands) if (command.status === 'pending') command.status = 'expired';
    this.log('Pickup authorized', 'A two-minute collection window is open for this parcel.', 'good');
  }
  collect() {
    if (this.state.parcel.status !== 'pickup' || this.state.pickupUntil <= this.now()) throw new Error('Start a pickup window first.');
    this.state.parcel.status = 'collected'; this.state.pickupUntil = 0;
    this.resolve('authorized'); this.log('Collection confirmed', 'Resident confirmed custody of the parcel.', 'good');
  }
  resolve(status: 'authorized' | 'dismissed' | 'returned') {
    for (const incident of this.state.incidents.filter(i => i.status === 'open')) incident.status = status;
    for (const command of this.state.commands) if (command.status === 'pending') command.status = 'expired';
    if (status === 'returned') this.state.parcel.status = 'returned';
    if (status === 'dismissed') { this.state.parcel.status = 'unarmed'; this.state.parcel.session = ''; }
    this.consecutive = 0; this.returns = 0;
  }
  observe(observation: Observation, speakerReady: boolean) {
    this.tick();
    const p = this.state.parcel;
    if (!p.session || observation.session !== p.session || observation.source !== p.source || ['unarmed', 'collected'].includes(p.status)) return;
    const now = this.now();
    if (this.lastObservation && now - this.lastObservation < 180) return;
    if (now - this.lastObservation > 1800) { this.consecutive = 0; this.returns = 0; }
    this.lastObservation = now;
    this.state.observation = { kind: observation.kind, score: observation.score, at: now };
    if (observation.kind === 'uncertain') { this.consecutive = 0; this.returns = 0; return; }
    if (observation.kind === 'present') {
      this.consecutive = 0;
      if (p.status === 'review' && ++this.returns >= 4) {
        this.resolve('returned'); this.log('Package returned', 'Reference appearance is stable in the delivery spot again.', 'good');
      }
      return;
    }
    this.returns = 0;
    if (this.state.pickupUntil > now || p.status === 'review') { this.consecutive = 0; return; }
    if (++this.consecutive < 4) return;
    const incident = { id: randomUUID(), at: now, source: p.source, status: 'open' as const, before: p.reference, after: observation.image, reason: 'The enrolled parcel appearance moved outside its starting position across four observations.' };
    this.state.incidents.unshift(incident); this.state.incidents = this.state.incidents.slice(0, 30);
    p.status = 'review'; this.consecutive = 0;
    this.log('Unverified package movement', 'No pickup window was active. Review the images before drawing conclusions.', 'alert');
    if (this.state.autoWarn && speakerReady) {
      try { this.warn(incident.id); }
      catch { this.log('Warning held', 'A recent warning is still within the cooldown. Review this movement manually.'); }
    }
    else this.log('Review requested', this.state.autoWarn ? 'The speaker is not ready. No warning was sent.' : 'Automatic warnings are off. You can send one after review.');
  }
  warn(incidentId: string | null = this.state.incidents.find(i => i.status === 'open')?.id ?? null): OutputCommand {
    const now = this.now();
    if (this.state.commands.some(c => now - c.createdAt < 20_000 && c.status !== 'failed')) throw new Error('Please wait 20 seconds between warnings.');
    const command: OutputCommand = { id: randomUUID(), incidentId, text: WARNING, createdAt: now, expiresAt: now + 15_000, status: 'pending' };
    this.state.commands.unshift(command); this.state.commands = this.state.commands.slice(0, 30);
    this.log('Warning queued', 'Waiting for the paired speaker to confirm playback.'); return command;
  }
  acknowledge(id: string, status: 'started' | 'completed' | 'failed', error?: string) {
    this.tick();
    const command = this.state.commands.find(c => c.id === id);
    if (!command || !['pending', 'started'].includes(command.status)) return;
    if (status === 'completed' && command.status !== 'started') throw new Error('Playback must start before completion.');
    if (status === command.status) return;
    command.status = status; command.error = error;
    if (status === 'completed') this.log('Speaker confirmed playback', 'The paired browser reported that the warning finished.', 'good');
    if (status === 'failed') this.log('Warning playback failed', error || 'The speaker could not play the warning.', 'alert');
  }
}
