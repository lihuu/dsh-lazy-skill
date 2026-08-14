---
name: example-kit
description: "A reference bundle box. Loading it auto-loads the hello sub-skill."
loadSubskills:
  - hello
---

# example-kit（根 skill）

这是一个**参考示例** box，演示如何把子 skill 通过 `loadSubskills` 自动装配。
本根 skill 的 body 在配置了 `loadSubskills` 时会被忽略；下面只保留这段说明供对照。
