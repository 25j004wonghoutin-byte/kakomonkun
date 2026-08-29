---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Show clear, calm feedback after each practice answer"
destination: in-app-preview
aspect: 16:9
language: ja
audience: students
length: 8s
angle: ui-microinteraction
---

## Intent

Preview two answer-feedback microinteractions for the existing past-question
practice flow: a correct response and an incorrect response. The motion should
feel responsive and encouraging without covering the question or delaying the
explanation.

## Customizations

- Reuse the HyperFrames `success-check` and `input-feedback` motion language.
- Keep the existing app's navy, blue, white, green, and red state palette.
- Use real SVG check and cross marks instead of text-based icons.

## Notes

- Correct and incorrect states each stay readable after the motion settles.
- Avoid confetti, full-screen flashes, large camera movement, and excessive bounce.
- The future app implementation must support `prefers-reduced-motion`.
