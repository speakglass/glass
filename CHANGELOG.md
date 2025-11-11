# Changelog

## [0.1.5](https://github.com/speakglass/glass/compare/v0.1.4...v0.1.5) (2025-11-11)


### Features

* **app_state:** enhance Redis error logging and connection information ([2f9bf55](https://github.com/speakglass/glass/commit/2f9bf55037305c8820d4251d5d66a5001436b562))
* **config:** update Deepgram settings and enhance AI message duration management ([32e72c7](https://github.com/speakglass/glass/commit/32e72c7fc72918ea3ce6308d8137c9f30ce0a95d))
* **context:** add feedback and translation management to GlassProvider ([bee911c](https://github.com/speakglass/glass/commit/bee911c6dc518782c317ce8bbbbb4c7d83ac7045))
* **i18n:** enhance translation support in UI components ([73d86f2](https://github.com/speakglass/glass/commit/73d86f20d4b7b71ea14a4f1d3316273b5dc952d2))
* **i18n:** implement request-scoped i18n instance and enhance localization support ([52623a1](https://github.com/speakglass/glass/commit/52623a17a0e9864e48c27f36ca3b3b8f7ab3e1e3))
* **llm:** enhance initial greeting generation with scenario-specific options ([5c55c7d](https://github.com/speakglass/glass/commit/5c55c7db848ab262e2d2b8586dd55c0840917f5a))
* **ui:** enhance feedback and translation handling in BottomPanel ([b34c61e](https://github.com/speakglass/glass/commit/b34c61ee953c7a79151de72765f865e5ba83c5d7))
* **ui:** update project structure and add localization support ([9bbb4f3](https://github.com/speakglass/glass/commit/9bbb4f373617209e1f2bdcb1d8f367a2166c1354))


### Bug Fixes

* **llm:** improve feedback clarity and adjust max tokens limit ([8c4c746](https://github.com/speakglass/glass/commit/8c4c7462d68067e637b73c831358507048c001b2))
* **ui:** adjust BottomPanel and Chat component heights ([b9c852a](https://github.com/speakglass/glass/commit/b9c852a7dceff5a84e09ab85f2e0ee69c29d7356))

## [0.1.4](https://github.com/speakglass/glass/compare/v0.1.3...v0.1.4) (2025-11-10)


### Features

* **llm:** implement unified suggestion generation and translation features ([90c1cf2](https://github.com/speakglass/glass/commit/90c1cf2ec7013488c9c7f077a769b85301641e53))
* **ui:** implement onboarding process for first-time users ([27ed3e8](https://github.com/speakglass/glass/commit/27ed3e8cb1a2ad9a46fde651ce2e91348f85c004))


### Bug Fixes

* **ui:** add missing onboarding-tours file and update .gitignore ([805668f](https://github.com/speakglass/glass/commit/805668fb383c013a380f29b0d838a091fcd28f0f))

## [0.1.3](https://github.com/speakglass/glass/compare/v0.1.2...v0.1.3) (2025-11-09)


### Bug Fixes

* **build:** add editable install for src layout ([2f82b7b](https://github.com/speakglass/glass/commit/2f82b7bc314eb8880bc1ec34768208a86e96fd62))
* **build:** add setuptools package discovery for src layout ([47f8ad5](https://github.com/speakglass/glass/commit/47f8ad5ce0af219cb127f4356e66a866e2c5e9b3))
* **llm:** update coaching instructions to ignore STT formatting issues ([1ee152c](https://github.com/speakglass/glass/commit/1ee152cb3ed14b4bc336ceb93f290c1647bd3221))

## [0.1.2](https://github.com/speakglass/glass/compare/v0.1.1...v0.1.2) (2025-11-09)


### Features

* **ui:** add language examples and pronunciation support in StartCall component ([e8a9385](https://github.com/speakglass/glass/commit/e8a9385dfcfe49c92161e5b8ad0798dba2fae27e))

## [0.1.1](https://github.com/speakglass/glass/compare/v0.1.0...v0.1.1) (2025-11-09)


### Features

* initialize Glass voice AI assistant ([f4a9055](https://github.com/speakglass/glass/commit/f4a9055211204bafa58040121ce01faf740f2f70))

## [0.1.0] - 2025-10-09

### Features

- Initial public release
- Real-time voice conversation with AI
- Multiple ASR provider support (Deepgram, NVIDIA)
- Multiple LLM provider support (OpenAI)
- WebSocket-based communication
- Session management with Redis
- Next.js web interface with modern UI
- Docker and Docker Compose support

### Documentation

- Comprehensive README with setup instructions
- Community links and contribution guidelines
