# DoorRelay Guard

**Tagline:** From doorstep to safe hands—with a voice when a parcel moves.

## Inspiration

A delivery notification tells you that a parcel arrived. It does not tell you who will bring it inside, whether a movement was authorized, or what happened afterward. DoorRelay connects those steps for shared households.

## What it does

A resident selects a parcel in Ring Playground video or their own footage. DoorRelay compares its appearance across frames, requires sustained evidence of displacement, and opens a before/after review when no pickup is authorized. A paired phone can say, “Please leave the package in the delivery area.” The household timeline records whether the speaker acknowledged playback and whether the parcel returned or was collected.

Residents can claim a collection, open a two-minute pickup window, and confirm custody. Occlusion stays uncertain. A person's appearance is never used to infer identity or authorization.

## How we built it

React and TypeScript provide the dashboard and companion speaker. Express handles access control, Ring API signaling, pickup state, command expiry, and local persistence. Ring access tokens stay in server memory. The browser negotiates receive-only WHEP video, samples frames, and applies reference matching over a limited range of scales and angles. A state machine requires consistent observations before an incident is created.

Warning text is fixed. A short-lived pairing code enrolls a speaker; user-enabled browser audio plays a bundled warning clip. Heartbeats, playback acknowledgments, duplicate suppression, cooldown, and expiration keep “queued” separate from “played.”

## Amazon integration

Primary track: Ring. Actual Playground device discovery, WHEP session creation, 1280×720 video playback in desktop Chrome, and parcel enrollment/observation were verified. Ring streams are receive-only; the phone is the warning output. No unsupported doorbell talk-back is claimed. We are not claiming an AWS mini-challenge integration.

## Challenges and fixes

- Ring session negotiation succeeded in the in-app browser without usable frames. Desktop Chrome received the video. The app now verifies actual dimensions and frame arrival rather than trusting `ontrack`.
- Different-sized or slightly rotated parcels required a broader appearance search. Similar candidates must remain uncertain instead of arbitrarily choosing one.
- Video ending initially canceled active pickup authorizations. Observation shutdown now preserves the resident's pickup and review actions.
- A queued warning is not evidence that a person heard it. We track browser completion separately and confirmed audible playback with the user.

## Accomplishments

The working local demo connects pixels, authorization, incident review, real spoken output, and confirmed collection. The generated video regression flows through the same decoder and detector as a local upload. Ring integration is demonstrated separately with actual API video. The test suite covers appearance matching, ambiguity, state transitions, HTTP access boundaries, playback protocol, and restart behavior.

## Limitations and next steps

This is a foreground, single-household demo with one active parcel. It is not continuous surveillance or a proven theft-prevention system. Matching remains limited under strong viewpoint changes, severe occlusion, or a parcel leaving the frame. We have not measured field accuracy on a diverse set of physical-camera recordings. Automatic warnings are optional; review-first remains the default. Real Ring disappearance/removal detection is not claimed as validated merely because playback and stable parcel observation work.

Future work: a consented real-footage evaluation set, more robust tracking, a resident-independent media worker, and production household authentication and notification delivery.

## Submission assembly

Source repository: https://github.com/ahmadsmadi44/doorrelay-guard (public, MIT license).

Demonstration: https://youtu.be/OM_MheSA-fw (public, 65 seconds). The opening scene is a dramatization (the siren is not an app feature); the app segments use rendered test scenes. Ring Playground playback is shown in the earlier 2:16 walkthrough: https://www.youtube.com/watch?v=0SHVt1pdhqw.

The submission video is public on YouTube.

Account identity verification remains an account-owner step if Ring Appstore publishing is pursued.

Source of submission requirements: https://amazonappdev2026.devpost.com/rules
