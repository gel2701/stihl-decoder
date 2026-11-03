# AGENTS.md — Repository Guidance for AI Coding Agents

Welcome to `stihl-decoder` (STIHLDecoder.nl).

All coding agents working on this repository must read, adhere to, and execute the repository-specific Agent Skill located at:

[`.agents/skills/stihldecoder-quality-gate/SKILL.md`](.agents/skills/stihldecoder-quality-gate/SKILL.md)

## Key Directives:
1. **Preserve Invariants**: 18,373 canonical parts, 843 SEO parts, 1,024 sitemap URLs, exactly 3 active pilot ASINs.
2. **Staged Testing Workflow**: Run Stage A (`node scripts/check_affiliate_consistency.mjs`) and Stage B (`node tests/affiliate_quality_gate.test.js`) before full production test suites.
3. **Dual-Gate Verification**: Every Amazon offer must pass Gate 1 (Technical) and Gate 2 (Product/Compatibility) via `TwoGateVerifier.js`. Unverified ASINs must fail closed to `ASIN_IDENTITY_UNVERIFIED`.
4. **GS1 Check Digits**: Validate all GTINs with `validateGtin` (`src/affiliate/GtinValidator.js`).
5. **Historical Mismatches**: Consult `src/affiliate/HistoricalMismatches.js` on every cross-reference.
6. **Formulation**: Always `Bevestigde compatibiliteit`, never `Gegarandeerd passend op`.
