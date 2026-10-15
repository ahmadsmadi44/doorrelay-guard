# Product feedback and friction log

## Ring Playground and device API

Used for temporary authorization, real device discovery, and testing without physical hardware. Onboarding worked after Amazon sign-in even though Appstore identity verification was unfinished. The discoverable simulated device and short-lived token made initial integration straightforward. I would use it again for prototyping.

Important improvement: make the distinction between Playground access and Appstore identity verification more explicit. A new developer can mistake publishing eligibility for a requirement to try the API.

## Ring WHEP live video

Used to negotiate a receive-only video stream through an Express signaling proxy. Desktop Chrome decoded 1280×720 footage, and the application enrolled and observed a parcel from that stream. Server-side authorization kept the token out of the client-facing media URL.

Critical improvement: provide a clear end-of-scenario signal and configurable scenario duration. The observed package segment ended after roughly 35 seconds and showed a stationary package, which did not provide a removal event for testing. A scenario library with labeled arrival, pickup, occlusion, and return transitions would be useful.

Important improvement: document network/browser requirements and useful frame-readiness checks alongside SDP examples. Receiving a track did not always mean receiving decoded frames. I would use WHEP again, with explicit frame health checks and an independent media worker for a production service.

## Friction log

| Task | Expected versus observed | Severity | Workaround | Suggested change |
|---|---|---|---|---|
| Test Playground before Appstore verification | Expected a clear sandbox access path; publishing verification appeared nearby even though sandbox access worked. | Minor | Sign in and use Playground directly. | Explain separate requirements on the onboarding page. |
| Receive live video | Expected `ontrack` plus successful SDP to imply usable video; the in-app browser had no useful frames. | Major | Use desktop Chrome; require advancing frames with dimensions greater than 32×32. | Publish browser/network troubleshooting and a frame-arrival example. |
| Evaluate parcel removal | Expected a Package scenario with a testable transition; the captured session contained a stationary parcel and then ended. | Major | Keep live integration proof separate from clearly labeled generated movement tests. | Add repeatable, labeled package transitions and longer or looping sessions. |
| Clean up a WHEP session | Expected a simple session path; returned cleanup URLs can contain required query parameters. | Moderate | Preserve the query while validating origin and path. | Include exact Location-header cleanup examples. |

## Other implementation tools

React and TypeScript worked well for the dashboard and typed state model. Express made local authentication and the Ring signaling proxy easy to inspect. Vite provided a simple development/build path; on Windows a production server holding a video file open can interfere with rebuilding its output directory, so stop the server before rebuilding. Node's test runner covered state and HTTP integration without an additional test framework.

The browser's native speech engine proved unreliable in one Windows session: start and completion events disagreed. Fixed, bundled MP3 files and ordinary audio playback events removed that dependency. The app distinguishes successful playback acknowledgment from proof that a person heard it.

Codex assisted with implementation, tests, browser verification, documentation, and debugging. The useful contribution was repeating the actual end-to-end workflow and correcting failures rather than treating unit-test success as proof of physical-camera accuracy.

No AWS runtime service, Alexa+, Bee, or Fire TV integration is claimed.
