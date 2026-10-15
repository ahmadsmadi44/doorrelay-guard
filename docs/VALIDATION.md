# Validation and developer friction report

Last updated October 14, 2026 (America/Toronto). Version 0.2.0. Windows, Node 22.14, desktop Chrome and Codex in-app browser. No physical Ring hardware was used.

## Automated results

**57 tests passed, 0 failed.** The source archive was also extracted to a new temporary directory, installed with `npm ci`, built, and passed all 57 tests again. See `docs/evidence/clean-install.txt`. `npm test` first compiles TypeScript and builds the frontend, then runs the suite. The HTTP tests start a separate production server with an isolated temporary data directory and stop it afterward; they never erase the household store.

Coverage includes:

- 29 generated appearance cases: steady views, lighting variation, displacement, modest scale and rotation, multiple similar objects, and invalid enrollment.
- Four original pixel regression tests, including uncertainty when the parcel disappears.
- Temporal movement evidence, uncertainty resets, return confirmation, pickup expiration, stale sources/sessions, repeated frames, cooldown, and false-alarm resolution.
- Video ending while pickup or review remains open.
- Real HTTP lifecycle: compiled-page/video serving, local authentication, cross-origin rejection, private-file denial, one-use pairing, disabled audio, warning completion order, duplicate acknowledgments, collection, revocation, report export, image clearing, and restart recovery.

The generated cases are deterministic engineering tests. They are not an independent physical-camera evaluation set and are not a field-accuracy estimate.

## Browser and audio evidence

| Check | Result and boundary |
|---|---|
| Ring device discovery | PASS through DoorRelay's backend using the actual Playground token. |
| Ring WHEP video | PASS in desktop Chrome: decoded dimensions 1280×720, advancing playback, real snowy-doorstep parcel scene. `docs/evidence/ring-live.png` records the result. |
| Ring pixel observation | PASS: manually enrolled the visible parcel and obtained repeated present observations. `docs/evidence/ring-observation.png` records the dashboard. Actual Ring removal detection is not claimed as validated. |
| Basic audible warning | PASS: user paired a speaker, enabled audio, heard the warning, and the browser acknowledged completion. |
| Video → movement → warning → return | PASS: the bundled generated MP4 played through the decoder, was sampled by the matcher, generated an incident, queued a real speech command, received completion acknowledgment, then resolved as returned. `docs/evidence/video-to-warning.png` and `docs/evidence/end-to-end-report.json` capture the evidence. |
| Muted speaker | PASS: browser mute set readiness false; warning endpoint rejected the command. |
| Pickup after video ends | PASS in compiled build: authorization remained active after the 35-second clip ended, and Confirm collection marked it collected. |
| Authorized pickup | PASS: video movement during the window created no additional incident or warning. Resident-confirmed collection was checked in the browser. |
| Occlusion / disappearance | PASS for generated scenes: remained uncertain without a movement incident. |
| Phone-sized layout | PASS at 390×844: no horizontal overflow and pairing controls usable. `docs/evidence/speaker-mobile.png`. |
| Dashboard navigation | PASS: Activity and Overview preserve the media element and observation reference. |

The generated-video run on October 14 logged movement/warning queued at 00:10:46, browser completion at 00:10:49, and stable return at 00:10:54, Toronto time. This is one observed local run, not a latency benchmark. The paired browser was controlled directly during this regression; separate user confirmation established audibility earlier.

## Failures found and fixed

1. **Stream negotiation looked like readiness.** `ontrack` can arrive before video. Enrollment now requires useful decoded dimensions; empty/2×2 frames are rejected, frame arrival times out, and frozen frames do not create fresh observations. Desktop Chrome works where the in-app browser did not.
2. **Ring cleanup lost URL parameters.** Session cleanup now preserves the returned query string while constraining the destination to the Ring origin and device-session path.
3. **Lighting statistics compared different regions.** Both reference and current global lighting measurements now use the same full-frame region.
4. **Search-grid alignment missed a displaced template.** Candidate refinement recovers matches between coarse grid positions.
5. **Refinement favored one of two identical candidates.** Spatially distinct candidates are now independently refined and similarly strong matches stay uncertain.
6. **Video end discarded active pickup authorization.** Observation shutdown now preserves pickup and open review state, cancels pending sound, and prevents stale observations.
7. **Speaker mute/unpair could linger.** Mute sends an immediate readiness update; hidden-page changes update readiness; unpair revokes the backend token. Pending commands are canceled on mute/revocation/replacement.
8. **Development file serving risked exposing local evidence.** Private state, evidence artifacts, environment files, and Git metadata are denied; the production server serves only the built public assets.
9. **An expired pairing code appeared reusable.** The UI now shows a live expiry countdown and an explicit expired state.
10. **Test child startup inherited the Node test-runner context.** The harness now removes that inherited context, so ordinary server output and restart checks work reliably.

## Remaining product limits

- One parcel, one household, one paired output device, with an active foreground dashboard.
- No independent media worker or continuous monitoring. A stream ending never proves a package was removed.
- No real-world removal accuracy claim. The matcher can miss rotation, strong perspective changes, motion blur, occlusion, or a package leaving the frame.
- No field test of OS-level phone locking, Wi-Fi loss, browser battery suspension, or outdoor audibility. Protocol readiness, muted output, command expiry, revocation, and server restart are tested.
- No cloud deployment, push notifications, production multi-user accounts, face recognition, or automatic police/contact notifications.
- The signed-webhook endpoint only verifies and acknowledges; it is explicitly not a background-processing integration.

## Ring developer friction

Playground was accessible without identity verification after normal Amazon sign-in. The portal separately required verification before Appstore publishing. Temporary tokens expire after 30 minutes and must not be shown in recordings. Ring API calls are server-to-server; media is receive-only. Spoken output is supplied by the companion phone/browser, not an undocumented Ring talk-back feature.

## Reproduce

Run `npm ci` then `npm test`. Launch with `Start-DoorRelay.cmd` or `npm start` after building. Follow `docs/DEMO-SCRIPT.md`. Keep Ring proof, original physical footage, and generated fixtures visibly distinct.

## October 14 evening validation

A local review recorder was added and its real Ring output decoded with FFmpeg. The captured Playground package sequence showed a stationary parcel throughout the observed ~35-second media session; it contained no package removal to score. This is positive evidence for stable observation and integration, not removal accuracy. The full-resolution recording is kept locally outside the source archive.

A later warning run exposed a browser speech-engine failure: a completion callback arrived without the required start acknowledgment, while the server had canceled the still-pending command. The speaker UI previously masked that disagreement. The fixed implementation checks the server's returned command status, retains failures until recovery, cancels locally queued output when the server expires it, and uses bundled MP3 audio instead of native speech synthesis. Regression assertions verify that late start/completion acknowledgments report `expired` and never resurrect a canceled warning.

The bundled-audio browser regression passed on October 14 at 20:13 Toronto time: generated-video movement queued a command at 20:13:04, the real paired browser acknowledged completion at 20:13:08, and stable return resolved at 20:13:12. The export was decoded and inspected. A second recorded run authorized pickup before movement and confirmed collection at 20:14:20 with no new warning. All 57 automated tests passed after the final audio change, including the expanded late-acknowledgment HTTP assertions.
