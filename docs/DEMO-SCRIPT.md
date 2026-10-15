# Demo runbook · approximately 2 minutes 45 seconds

Use desktop Chrome for Ring. Keep the paired speaker page visible on another device. Start in review-first mode and enable automatic warnings only when showing the controlled example. Do not expose the Playground token in a recording.

| Time | Screen/action | Narration |
|---|---|---|
| 0:00–0:15 | Dashboard and parcel card | “Delivery is only the first handoff. DoorRelay helps a shared household get the parcel safely inside.” |
| 0:15–0:45 | Connections: device discovery, actual Ring video, parcel selection/enrollment | “This is a real Ring Playground API stream. We select the parcel once, then compare its appearance across frames.” |
| 0:45–0:55 | Source switch to Generated test video | “For a repeatable movement-and-return test, I’m switching to this clearly labeled generated clip. It goes through the same video decoder and tracker.” |
| 0:55–1:25 | Play test video, enroll immediately, automatic warning enabled; leave speaker audible | “No pickup is authorized. Sustained movement opens a review and sends one short warning. The timeline distinguishes a command from acknowledged playback. When the parcel returns, stable frames resolve the incident.” |
| 1:25–1:55 | Replay, enroll, Start pickup before second 8; confirm collection | “An authorized pickup gets a two-minute window. Movement during that window creates no new incident. The resident confirms the final handoff.” |
| 1:55–2:15 | Synthetic test scene: enroll, Block the view; mute speaker | “An unclear view stays uncertain. A muted or disconnected speaker is never shown as ready.” |
| 2:15–2:35 | Activity: export; validation report; architecture | “The tests cover tracking, authorization, command expiry, access controls, and restart recovery. The browser must remain open; this is not an always-on service.” |
| 2:35–2:45 | Final dashboard | “DoorRelay joins delivery, review, a measured response, and confirmed custody.” |

Generated clip timing: present 0–8 seconds; moved 8–16; returned 16–24; absent 24–29; present 29–35. Its disappearance segment should produce uncertainty, not another movement warning.

Phone output is the companion browser, not the Ring doorbell. Do not describe unverified movement as proven theft. Record the real warning audio or clearly label it if playback must be demonstrated separately.

Ring sessions end quickly. Set the parcel area before reconnecting, then enroll as soon as the first frame arrives. In the verified snow/doorstep Playground sample, the parcel starts near the lower-left portion of the frame; select what is actually visible rather than relying on a fixed preset.
