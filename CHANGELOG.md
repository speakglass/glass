# Changelog

## [0.1.9](https://github.com/speakglass/glass/compare/v0.1.8...v0.1.9) (2025-11-20)


### Features

* **api:** add contact inquiry endpoint and Discord notifications ([e41f0cb](https://github.com/speakglass/glass/commit/e41f0cb6be878514be79ad57aabe3470c580898b))
* **api:** implement new memory adapters and extraction helpers ([3888628](https://github.com/speakglass/glass/commit/38886288e4e39ab4bc0330f27effccf9aeca9943))
* **api:** update memory management and billing features ([4c76202](https://github.com/speakglass/glass/commit/4c76202ad9489263f24cbb7be4cfd834de0d2942))
* **config:** update .env.example for Gemini LLM integration ([ca0e2b6](https://github.com/speakglass/glass/commit/ca0e2b678f32fe994cc06a120fbc7b39bea7f85b))
* **deps:** add Google GenAI and OpenAI dependencies ([2b60ca8](https://github.com/speakglass/glass/commit/2b60ca80775449c9f81c60a659261a4351bfd20a))
* **docs:** update README and configuration for Gemini 2.5 Flash integration ([f531bc3](https://github.com/speakglass/glass/commit/f531bc3a60245866270a1de3aef5f3ac72cbf5ce))
* **ui:** enhance conversation capacity management in StartCall component ([d665061](https://github.com/speakglass/glass/commit/d665061b01145dfc6cb3643019c961921958b7e7))
* **ui:** implement screen sharing functionality in StartCall component ([099976f](https://github.com/speakglass/glass/commit/099976f41d54be2c6878a65b7e67f5db170972a0))
* **ui:** update billing form fields and improve user prompts ([dafc228](https://github.com/speakglass/glass/commit/dafc228ba3b6d7dd3ce8fc24cc0859cd81b91f4c))

## [0.1.8](https://github.com/speakglass/glass/compare/v0.1.7...v0.1.8) (2025-11-18)


### Features

* **api:** add InteractionObservedFactEdge and enhance edge handling ([0d385db](https://github.com/speakglass/glass/commit/0d385db4942228c47fa57d751ec4d571a3c9a84a))

## [0.1.7](https://github.com/speakglass/glass/compare/v0.1.6...v0.1.7) (2025-11-18)


### Features

* **api:** add partners API and update environment configuration ([d3c372f](https://github.com/speakglass/glass/commit/d3c372facca0a1d7dbc7d04981f1bca5e07e6944))
* **api:** enhance conversation memory extraction and insights ([a1e18df](https://github.com/speakglass/glass/commit/a1e18df9ac75dd8dfc4e11efb15a69592ff49f25))
* **api:** update language proficiency handling and add memory insights ([37669e2](https://github.com/speakglass/glass/commit/37669e22983351faa0f1c8307f6af4635257e14d))
* **auth:** enhance session cookie configuration for improved security ([94d502e](https://github.com/speakglass/glass/commit/94d502e33cc513003af411b908a355cabbf34b91))
* **auth:** update authentication configuration for Auth.js v5 ([3d8adfd](https://github.com/speakglass/glass/commit/3d8adfd72a6a1079d9eec47432e6e87f482fc1e2))
* **db:** enhance database connection logging and error handling ([16b3d00](https://github.com/speakglass/glass/commit/16b3d0043bff3abb5c20ed54e26abfa0c24890e7))
* **docker:** add Azurite service for local Azure storage emulation ([29f4110](https://github.com/speakglass/glass/commit/29f4110ec5352263a0e67b1bd274d4b587653901))
* **ui:** enhance user menu with usage display and new UsageBar component ([c7a6ada](https://github.com/speakglass/glass/commit/c7a6adad8638b4cc499a87fa6e3a8158514f36f7))


### Bug Fixes

* **deploy:** correct Python indentation in start.sh database check ([4c3b1b3](https://github.com/speakglass/glass/commit/4c3b1b39b7ed16058621a1e3864345d3f2838930))
* **deploy:** print database connection error details ([84d620a](https://github.com/speakglass/glass/commit/84d620adf6ff7f82e6bedf1756b6ae633234ccdd))
* **deploy:** resolve Azure deployment startup and migration issues ([c3afae2](https://github.com/speakglass/glass/commit/c3afae20fd04cd912bfb8645b2ded1153735af07))
* **deploy:** show database connection errors for debugging ([6fe76f0](https://github.com/speakglass/glass/commit/6fe76f0fb3a3984371bc573f18d65d7b3420dde6))
* **deploy:** update startup command path for production deployment ([273ffb9](https://github.com/speakglass/glass/commit/273ffb9c7fafe09bb97e707915bda1297841842c))
* **deploy:** update startup command to use bash for script execution ([908831a](https://github.com/speakglass/glass/commit/908831a9ddef7a964fe3a6428c9924bc61860b29))
* **migrations:** add smart migration state detection to prevent duplicate table errors ([e6149a9](https://github.com/speakglass/glass/commit/e6149a97710842aeb2f35f7996f2a9af16aca671))
* **migrations:** improve upgrade command logging in start script ([878d58b](https://github.com/speakglass/glass/commit/878d58b2d8226b56e009511ad20c9cec1acc23a4))


### Code Refactoring

* **deploy:** simplify migration script ([efa2636](https://github.com/speakglass/glass/commit/efa26365dd775b73f98e448bd78c697d13c98f05))
* **deploy:** simplify startup and migration logic ([bdc4720](https://github.com/speakglass/glass/commit/bdc472052d157526b671bda8c4f17e53cdfc8686))
* **migrations:** simplify to use only environment variable for database URL ([9db3140](https://github.com/speakglass/glass/commit/9db3140b8fa1ea3bde4ffdbe5d0a92f1d1da16aa))
* **start:** improve error handling and code structure ([b1a659d](https://github.com/speakglass/glass/commit/b1a659d48cf47e3be924e850185028885257dcfe))

## [0.1.6](https://github.com/speakglass/glass/compare/v0.1.5...v0.1.6) (2025-11-14)


### Features

* **app_state:** enhance Redis error logging and connection information ([a22cbe1](https://github.com/speakglass/glass/commit/a22cbe1d6639a8dbc6a823a406e469da8469f585))
* **asr:** add ElevenLabs Scribe ASR adapter and update version to 0.1.5 ([65b95f9](https://github.com/speakglass/glass/commit/65b95f9ff034e41fbb517ff0ca02ee8289562ef3))
* **config:** add redis_cluster setting and enhance Redis connection handling ([273749e](https://github.com/speakglass/glass/commit/273749e8d7e8df12a017c81c6d08d7118a2ccb24))
* **config:** add RedisCluster auto-detection and support\n\n- Add GLASS_REDIS_CLUSTER option (true/false/auto)\n- Support redis+cluster scheme and ?cluster=true\n- Auto-detect cluster via CLUSTER INFO probe\n- Create proper async RedisCluster client when needed\n- Improve logs for chosen Redis mode ([8a8a322](https://github.com/speakglass/glass/commit/8a8a322168e623b85c742da9804a612466f4cd6a))
* **config:** update Deepgram settings and enhance AI message duration management ([949bf74](https://github.com/speakglass/glass/commit/949bf743dea129b0142246541d03d6c2aacd997f))
* **config:** update environment configuration and dependencies ([6eee70e](https://github.com/speakglass/glass/commit/6eee70e863e7ae0d39042673a4b3697981a8fc0e))
* **config:** update environment variables and enhance database configuration ([06ee945](https://github.com/speakglass/glass/commit/06ee945485aba969b6b5da0b8b5da73faba62b66))
* **context:** add feedback and translation management to GlassProvider ([a072de7](https://github.com/speakglass/glass/commit/a072de7eb702a12fd9e849a0115979da2c14980f))
* **i18n:** enhance translation support in UI components ([632d31c](https://github.com/speakglass/glass/commit/632d31c4f635af59b4a6a329c9d4a4506f4b1a87))
* **i18n:** implement request-scoped i18n instance and enhance localization support ([8a6dec9](https://github.com/speakglass/glass/commit/8a6dec94597f79d78aed15950fc003a8178f5ba3))
* **llm:** enhance initial greeting generation with scenario-specific options ([1bfea9b](https://github.com/speakglass/glass/commit/1bfea9b4014cd67dae0aa925cd52cbadddebe306))
* **llm:** implement unified suggestion generation and translation features ([6f75a15](https://github.com/speakglass/glass/commit/6f75a157d5a7bc4e99333fdc146c56df7c0ddf59))
* **ui:** add Chat, Controls, Messages, Nav, and Settings components ([7a6359a](https://github.com/speakglass/glass/commit/7a6359ad8c3f8c3d11aa24a400848476b7169df7))
* **ui:** add language examples and pronunciation support in StartCall component ([6a6108a](https://github.com/speakglass/glass/commit/6a6108a491c5fb2d5d5b2d49f4a82894ac355f21))
* **ui:** enhance feedback and translation handling in BottomPanel ([95e9820](https://github.com/speakglass/glass/commit/95e9820b81e104cc4f1c0e7e1328dec1ff031d72))
* **ui:** implement onboarding process for first-time users ([a0a7cf9](https://github.com/speakglass/glass/commit/a0a7cf9913813978b0ba84a07849995561fb384e))
* **ui:** update project structure and add localization support ([c128296](https://github.com/speakglass/glass/commit/c1282967132c804ca487eb24104e99ffdb738e71))


### Bug Fixes

* **build:** add editable install for src layout ([e4e8ef3](https://github.com/speakglass/glass/commit/e4e8ef35be3fb3f98469503bbe926412e3afaf51))
* **build:** add setuptools package discovery for src layout ([2746cff](https://github.com/speakglass/glass/commit/2746cff80785dd9d9002e9d3a5499efa3cb31980))
* **llm:** improve feedback clarity and adjust max tokens limit ([005a3f9](https://github.com/speakglass/glass/commit/005a3f9d08cc2d92b3671eabb65174feec523e2d))
* **llm:** update coaching instructions to ignore STT formatting issues ([270ab6f](https://github.com/speakglass/glass/commit/270ab6fb8450444f512387c2674d818203bc7a1a))
* **ui:** add missing onboarding-tours file and update .gitignore ([d10a1ad](https://github.com/speakglass/glass/commit/d10a1ad23e12b4a77031c596005c93c966f3b870))
* **ui:** adjust BottomPanel and Chat component heights ([88d36b5](https://github.com/speakglass/glass/commit/88d36b593df5dc4be1c82a61a75896eae410d58e))
* **ui:** avoid analyze when no time was available at session start; show waitlist ([49a798f](https://github.com/speakglass/glass/commit/49a798f0b4a27e19eb38d33f8613ec2208bbe387))
* **ui:** correct import path for Settings component ([b4ae238](https://github.com/speakglass/glass/commit/b4ae2389b2ce0f699539fa5985f2c80aa6396530))


### Code Refactoring

* **app_state:** simplify Redis connection handling and remove cluster configuration logic ([59af279](https://github.com/speakglass/glass/commit/59af2799d0f9b378028b14c44515f0bd2d62a6c7))
* **ui:** remove unused handleArchive function and update column creation ([81a7131](https://github.com/speakglass/glass/commit/81a713107e46e60c0b7c4572969572ec9ba41169))

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
