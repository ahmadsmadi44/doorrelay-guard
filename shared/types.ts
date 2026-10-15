export type SourceKind = 'synthetic' | 'upload' | 'ring';
export type ParcelStatus = 'unarmed' | 'armed' | 'review' | 'pickup' | 'collected' | 'returned';
export type ObservationKind = 'present' | 'moved' | 'uncertain';
export type Box = { x: number; y: number; w: number; h: number };
export interface Observation { kind: ObservationKind; score: number; source: SourceKind; session: string; image?: string }
export interface TimelineEntry { id: string; at: number; title: string; detail: string; tone: 'neutral' | 'good' | 'alert' }
export interface Incident { id: string; at: number; source: SourceKind; status: 'open' | 'returned' | 'authorized' | 'dismissed' | 'superseded'; before?: string; after?: string; reason: string }
export interface OutputCommand { id: string; incidentId: string | null; text: string; createdAt: number; expiresAt: number; status: 'pending' | 'started' | 'completed' | 'failed' | 'expired'; error?: string }
export interface GuardState {
  parcel: { name: string; status: ParcelStatus; source: SourceKind; session: string; reference?: string; claimedBy: string | null };
  observation: { kind: ObservationKind; score: number; at: number } | null;
  pickupUntil: number; autoWarn: boolean; incidents: Incident[]; timeline: TimelineEntry[]; commands: OutputCommand[];
}
export interface Snapshot extends GuardState {
  speaker: { connected: boolean; ready: boolean; lastSeen: number | null };
  ring: { configured: boolean }; observationOnline: boolean; now: number;
}
