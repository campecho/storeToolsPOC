# Security Considerations & Threat Model — In-Store Print & Design Toolset
*Cross-cutting security analysis for the Publisher / Express replacement suite, the format tools (Word, PPTX, PDF), the `.pub → IDML` converter, and the shared conversion/routing engine.*

**Purpose:** Name the security concerns this toolset must address before it handles real customer files at the counter and on the web-to-print storefront, and pair each concern with a concrete mitigation. Intended as project context that feeds a security section of the design docs and an eventual security review.

**Verdict up front:** The defining property of this entire toolset is that **every tool ingests untrusted customer files** — walk-in uploads, anonymous web-to-print self-service, and files pulled from orders — then parses, renders, transforms, stores, returns, and (eventually) writes them back into production. Almost all of the risk follows from that one fact. This is securable with standard but *disciplined* controls: sandboxed out-of-process parsing, malware scanning, content-disarm via the conversion pipeline you're already building, a tightly-scoped AI layer, least-privilege integration tokens, and ephemeral handling of PII. None of it is exotic; the failure mode is treating a print tool as low-risk because it "just edits files," when in practice it is a high-volume untrusted-input parser wired into customer PII, order systems, and the production queue.

---

## Flags

- **[CRITICAL]** — exploitable for code execution, data breach, or production compromise; gate launch on this.
- **[HIGH]** — serious data, integrity, or availability risk; address before GA.
- **[MED]** — meaningful hardening; can follow fast.
- **[INT]** — risk tied to the ecommerce/order/catalog integrations.
- **[AI]** — risk tied to the AI features (highlight-to-change, copywriting, text-to-image, prompt-to-design, AI-file cleanup).
- **[PUBLIC]** — risk amplified on the internet-facing, partly-anonymous web-to-print surface.

---

## TL;DR

1. **Untrusted file ingestion is the whole threat model.** Treat every uploaded or order-fetched file as hostile input. [CRITICAL]
2. **The parse/render stack is a CVE magnet.** `libmspub`, LibreOffice/Collabora, Ghostscript/PDF tooling, ImageMagick, libheif (HEIC), libtiff, librsvg all have memory-corruption RCE history. Parse **out-of-process in a sandbox**, patched aggressively. [CRITICAL]
3. **Archives and XML formats carry their own exploits.** ZIP/IDML/DOCX/PPTX/XLSX/`.puz` → zip-slip, zip bombs, symlink entries; SVG → XXE, embedded script, entity expansion. [CRITICAL]
4. **Scan for malware on ingest *and* on export/write-back.** The shop must not become a malware distribution vector. [HIGH]
5. **The conversion pipeline is also your best sanitizer.** Re-rendering / regenerating to a clean format (PDF/X, flattened raster) is content-disarm-and-reconstruction (CDR) for free — route untrusted files through it. [HIGH]
6. **Prompt injection rides in on customer content.** Document text, OCR, image content, and metadata fed to the AI layer can carry instructions. Severity depends on what the AI can *do* — keep it content-only and away from order/catalog/write APIs. [CRITICAL][AI]
7. **PII is concentrated and sensitive** (VDP/mail-merge address lists, customer files, order data). Minimize, encrypt, expire, and enforce object-level authorization. [HIGH][INT]
8. **It's a web app wired to internal APIs with a public surface** — so IDOR, SSRF, CSRF, and stored XSS all apply, sharpest on the self-service storefront. [HIGH][PUBLIC]
9. **The write-back-to-production path is high-value** — require customer re-approval, audit, and least-privilege scope; keep order-mutation and pricing/promotion capability out of the file tool entirely. [HIGH][INT]
10. **A print service needs a content-moderation/abuse path** for illegal or infringing submissions, sharpest where uploads are anonymous. [MED][PUBLIC]

---

## Part 1 — Threat-model framing

### The central fact
Every tool in this suite exists to take **a file a stranger created** and do something with it. The customer is, in security terms, an untrusted party, and their file is attacker-controlled input. This holds whether the file arrives across the counter on a USB stick, is uploaded through the web-to-print storefront, or is fetched from an existing order. The associate operating the tool is trusted; the customer and their file are not.

### Entry points (attack surfaces, ranked by exposure)
| Entry point | Trust | Notes |
|---|---|---|
| **Web-to-print self-service upload** | Untrusted, often **anonymous** (guest editing) | Internet-facing, unauthenticated, automatable — highest exposure. [PUBLIC] |
| **Counter upload** (USB, email, cloud link) | Untrusted customer file, **trusted associate** present | Human in the loop, but still arbitrary attacker files. |
| **Order-file fetch** (`[INT]`) | File is untrusted; the *fetch* is a privileged internal API call | IDOR / over-broad access is the risk here, not the file alone. |
| **AI prompt path** (`[AI]`) | Associate instruction is trusted; **customer content in the prompt is not** | The injection channel. |
| **Internal integration APIs** (catalog, order mgmt, production queue) | Trusted but powerful | Confused-deputy target if reachable from the AI or a compromised session. |

### Assets to protect
Customer files (which routinely contain SSNs, financials, medical info — people print anything); PII in VDP/merge lists and order records; **order and production integrity** (the right file, unaltered, reaches the press); the in-store endpoints and the store network behind them; and the internal systems the integrations expose.

### Trust boundaries (where to put the walls)
1. **Customer file → parser**: sandbox boundary. Nothing the file can do should escape the parsing jail.
2. **Customer content → AI model**: instruction/data boundary. Document-derived text must never be executable as a command.
3. **Tool → internal APIs**: least-privilege boundary. The file tool gets scoped, read-mostly tokens; high-power actions (write-back, order mutation, promotions/pricing) are separately gated.
4. **One store/associate/customer → another's data**: tenancy/authZ boundary. Object-level checks on every order and file reference.

---

## Part 2 — Risk areas

### 2.1 Malicious / weaponized files [CRITICAL]
The render and conversion stack is exactly what attackers target. `libmspub` parses an *undocumented* binary format (OLE2 + Escher) in C++; LibreOffice/Collabora, Ghostscript-class PDF tooling, ImageMagick, libheif, libtiff, and librsvg all carry long histories of memory-corruption RCE (the ImageMagick "ImageTragick" class, recurring Ghostscript `-dSAFER` sandbox bypasses, libtiff/libheif overflows). A crafted `.pub`, PDF, TIFF, or HEIC is a potential code-execution path on the store PC, not merely a malformed document.

Format-specific hazards:
- **Archive/zipped containers** — ZIP (explicitly in scope per the survey), plus IDML, DOCX, PPTX, XLSX, and `.puz` (a CAB archive, per `PUB_TO_IDML_RESEARCH.md`): **zip-slip / path traversal** (`../../` entries), **zip bombs** (decompression DoS), nested archives, and symlink entries.
- **SVG** (XML): **XXE** (external entity → local file read / SSRF), embedded `<script>` → stored XSS when rendered in a browser viewer, billion-laughs entity expansion.
- **PDF**: embedded JavaScript, launch/embedded-file actions, malformed objects targeting the renderer, malicious embedded fonts.
- **Office files**: VBA macros (docx/xlsm/pptm) that must never execute.
- **OLE2/CFBF containers** (`.pub`, legacy Office): embedded objects and exploit-the-parser payloads.
- **Polyglots / content-type confusion**: a file valid as two types, or whose real content contradicts its claimed MIME/extension.

**Mitigations:** parse and render **out-of-process in a sandbox** — containerized, no network egress, no filesystem write outside a scratch jail, dropped privileges, seccomp, and CPU/memory/time limits; **validate by content-sniffing, not extension**; disable macro/JS/script execution in every engine (LibreOffice macro security high; Ghostscript/ImageMagick `policy.xml` lockdowns; SVG sanitized or rendered with entities disabled); harden archive extraction (canonicalize and confine paths, cap entry count / total size / compression ratio, reject symlinks and absolute paths); and treat the OSS render engines as a **patch-priority dependency** with active SCA monitoring.

### 2.2 Malware / virus [HIGH]
Because files are stored, returned to the customer, and later written into production, an infected file makes the shop a **distribution vector** and a path into internal systems. Scan on ingest (ClamAV or a commercial engine) **before any processing**, and **re-scan on export and before any write-back**. Strip Office macros. Crucially, the conversion you're already building is a strong native mitigation: **regenerating a clean PDF/X or flattening to a known-good raster is content-disarm-and-reconstruction** — active content does not survive the round-trip. Prefer routing untrusted files through that pipeline over passing originals straight through.

### 2.3 Prompt injection — the AI layer [CRITICAL][AI]
Highlight-to-change, AI copywriting, prompt-to-design, and "clean up the customer's AI file" all feed **untrusted customer content** (document text, OCR'd text, image content, embedded metadata) into an LLM alongside the associate's instruction. The customer's content is the injection channel: a line in their flyer reading "ignore previous instructions and…" is indistinguishable from a command once it's concatenated into the prompt. This includes **indirect** injection via image-embedded text and file metadata, not just visible body copy.

Severity is governed entirely by **what the AI layer can do**:
- If it only edits content (change this text, recolor this shape, resize), the worst case is a bad suggestion the associate rejects.
- If it can call the **[INT]** integrations (order lookup, file fetch, catalog, write-back), prompt injection becomes a confused-deputy escalation: exfiltrating another customer's order data, altering a job, or triggering an unintended write.

**Mitigations:** scope the AI to **non-privileged, content-only operations** and keep it away from order/catalog/write APIs; if a privileged action is ever needed, gate it behind explicit associate confirmation. Maintain a hard **instruction-vs-data separation** — document-derived text is data, never command. Keep the human in the loop: your docs already frame highlight-to-change as associate-applied (suggest → associate approves), which is the correct posture — preserve it rather than auto-applying AI output. For any third-party model, require a **no-training data-processing agreement** and redact PII from prompts where feasible. (The pattern your connected commerce tooling already uses — a trusted status section separated from untrusted data sections that must never be followed as instructions — is exactly the discipline to carry into your own AI layer.)

### 2.4 PII & data privacy [HIGH][INT]
PII concentration here is high: VDP/mail-merge address lists (CSV/Excel of names + addresses), customer files (often containing regulated data), order records, and customer accounts linked to saved projects.
- **Minimize and expire.** Customer files and merge data should be ephemeral and auto-purged after the job — not accumulated into a standing PII lake of everything every customer ever printed. Wipe parser scratch/temp files on completion.
- **Object-level authorization** on order-file fetch. Guessable/sequential order IDs are a textbook **IDOR**; an associate must not reach another store's files or an unrelated customer's order. Bind to the existing SSO roles already scoped in the integration plan.
- **Encrypt** in transit and at rest; segregate uploads from application storage.
- **Security-grade audit logging** (your design notes already call for an audit trail — make it tamper-evident): who fetched/modified which file and order, when.
- **VDP lists are concentrated PII** — handle as sensitive datasets with their own retention limits.
- Some customer jobs may involve regulated data (health, financial). This is an operational/legal flag for policy owners, not legal advice.

### 2.5 Web-application & platform security [HIGH][PUBLIC]
It's a browser tool wired into internal APIs with a public self-service surface, so the OWASP basics all apply:
- **IDOR / broken object-level authz** on order and file references.
- **SSRF** — anything that fetches by URL, resolves SVG/PDF external references, or has the conversion engine pull remote assets can be coerced toward internal metadata endpoints and services. Allowlist outbound, block link-local/internal ranges.
- **Stored XSS** — rendering customer SVG/HTML, or even a malicious **filename** (e.g. `<script>` shown in the project gallery), in the UI. Sanitize and encode on output.
- **CSRF** on state-changing actions.
- **Public surface** — the web-to-print side is internet-facing and partly anonymous; add rate limiting, upload-flood/DoS protection, and bot controls, on top of the same malicious-file surface now unauthenticated.
- **Supply chain** — heavy OSS reliance (`libmspub`, LibreOffice/Collabora, SuperDoc, ImageMagick, libheif, PptxViewJS, python-pptx, plus npm/pip trees). Pin, run SCA, patch on a cadence, and settle the **AGPL posture** for any copyleft components you embed (already flagged in the Word and PPTX docs).

### 2.6 Production integrity & content moderation [HIGH/MED][INT][PUBLIC]
- **Write-back integrity** [HIGH][INT]: an altered or swapped file reaching production without re-approval means a wrong or offensive print run. Keep **customer re-approval + audit gating** on the write path (already flagged as a deferred-with-conditions item). Keep order-mutation and any **pricing/promotion** capability out of the file tool's privilege scope entirely.
- **Content moderation / abuse** [MED][PUBLIC]: customers will occasionally submit illegal, infringing, or abhorrent material to print. The service needs a moderation/abuse-reporting path and a clear policy owner — sharpest on the anonymous self-service surface, where there's no associate gate.

### 2.7 In-store endpoint & deployment [MED]
A web tool on **shared** store PCs (HP ProDesk 600 G4, per the hardware notes) means associates and customers cycle through the same station. Enforce **session hygiene** — auto-logout, and clear customer data and temp/scratch files between customers so nothing lingers from the previous job. Kiosk-harden any customer-facing station. If any thick-client or desktop component remains, it inherits local-file-handling and patching responsibilities.

---

## Part 3 — Per-tool risk profile

Each tool ingests untrusted files, but the *dominant* risk differs by engine and scope. The conversion engine and the AI layer carry materially higher risk than the rest.

| Tool | Primary engines | Dominant risks | Notes |
|---|---|---|---|
| **`.pub → IDML` converter** | `libmspub` (C++, undocumented OLE2/Escher), `.puz`=CAB | **Parser RCE** on malformed `.pub`; **zip-slip** on `.puz` unpack | Highest *parser* risk — undocumented binary format, C++ memory safety. Sandbox hard. [CRITICAL] |
| **Shared conversion / routing engine** | LibreOffice headless + format-specific parsers | Aggregates **every** format's parser risk; **SSRF** on asset fetch | Central chokepoint — also the best place to enforce CDR sanitization. [CRITICAL] |
| **Print Design Tool** | Image stack (ImageMagick, libheif, libtiff, librsvg), SVG, PSD/AI/IDML/TIFF import, **AI features** | **Image-decoder RCE**, **SVG XXE/XSS**, **prompt injection**, broadest format surface | Largest attack surface overall; AI layer concentrated here. [CRITICAL][AI] |
| **PDF tool** (CutePDF Pro replacement) | Ghostscript / PDF tooling (e.g. qpdf, Stirling PDF) | **Ghostscript sandbox-bypass RCE**, PDF JS/launch actions, merge/split path handling | PDF is an active-content format; lock the engine down (`-dSAFER`, policy). [CRITICAL] |
| **Word tool** | SuperDoc (native OOXML), JSZip | **Zip-slip / zip-bomb** on `.docx`, macro content, round-trip tampering | Format is open/standardized — lower parser risk; archive + macro hygiene still required. [HIGH] |
| **PPTX tool** | LibreOffice headless render, python-pptx/PptxGenJS | Same archive risks as DOCX; **render-engine RCE** on crafted decks | Render server is the exposure; isolate it. [HIGH] |
| **VDP / mail-merge** | CSV/Excel import, batch output | **PII concentration**, CSV/formula injection, batch-job DoS | Treat merge lists as sensitive datasets; sanitize CSV (formula-injection prefixes). [HIGH][INT] |
| **Order integration** ([INT]) | Catalog / order-mgmt / production APIs | **IDOR**, over-broad tokens, write-back tampering, confused-deputy via AI | Least-privilege tokens; object-level authZ; re-approval gate. [HIGH][INT] |

---

## Part 4 — Consolidated controls checklist

A drop-in requirements list for the design docs and a starting point for security review.

**Untrusted-input handling**
- [ ] Parse/render every customer file **out-of-process in a sandbox** (no network, confined FS, dropped privileges, seccomp, resource caps).
- [ ] Identify file type by **content sniffing**, not extension or client-supplied MIME.
- [ ] Disable macro / JavaScript / script / external-entity execution across all engines (LibreOffice, Ghostscript/IM `policy.xml`, SVG sanitizer, XML parsers with XXE off).
- [ ] Harden archive extraction: path canonicalization + confinement, entry-count / total-size / compression-ratio caps, reject symlinks and absolute paths.
- [ ] Enforce per-file size and processing-time limits (anti-DoS / zip-bomb).

**Malware & sanitization**
- [ ] AV/malware scan on ingest, before processing.
- [ ] Re-scan on export and before any write-back.
- [ ] Strip Office macros; route untrusted files through the **CDR** (re-render/regenerate) pipeline where the workflow allows.

**AI layer**
- [ ] Scope AI to content-only operations; no direct order/catalog/write API access.
- [ ] Hard instruction-vs-data separation; document/image/metadata text is never executed as a command.
- [ ] Associate-approves-output (no silent auto-apply of AI edits).
- [ ] Third-party model under a no-training DPA; PII redaction in prompts where feasible.

**PII & data**
- [ ] Ephemeral customer files and merge data; auto-purge after job; wipe scratch/temp.
- [ ] Encryption in transit and at rest; segregated upload storage.
- [ ] Object-level authorization on every order/file reference (no IDOR).
- [ ] Tamper-evident audit log of file/order access and modification.
- [ ] CSV/Excel formula-injection sanitization on VDP imports.

**Web & platform**
- [ ] SSRF controls: outbound allowlist, block internal/link-local ranges, no fetch-by-arbitrary-URL.
- [ ] Output encoding / sanitization for rendered SVG/HTML and for displayed filenames (anti-XSS).
- [ ] CSRF protection on state-changing actions.
- [ ] Rate limiting, upload-flood protection, and bot controls on the public storefront.
- [ ] SCA + dependency pinning + patch cadence for the OSS render stack; AGPL posture resolved.

**Integration & production**
- [ ] Least-privilege, scoped tokens for catalog/order/production APIs.
- [ ] Customer re-approval + audit gate on write-back to order/production.
- [ ] Pricing/promotion and order-mutation capability excluded from the file tool's scope.

**Endpoint & deployment**
- [ ] Session auto-logout and inter-customer data clearing on shared stations.
- [ ] Kiosk hardening for customer-facing stations.

**Operations**
- [ ] Content-moderation / abuse-reporting path with a named policy owner.
- [ ] Incident-response plan for a returned-infected-file or data-exposure event.

---

## Part 5 — Open decisions (security)

Mirroring how the other docs flag unresolved items — these need an owner before GA:

1. **Sandbox / isolation technology** — container-per-parse vs. microVM (e.g. gVisor/Firecracker-class) for the render stack, and where the conversion engine runs.
2. **Malware-scanning vendor** — ClamAV vs. commercial multi-engine; ingest-only vs. ingest + export.
3. **Data-retention policy** — how long customer files and VDP lists persist, who owns the schedule, and how purge is verified. (Ties to the broader PII-handling decisions in the [INT] plan.)
4. **Third-party AI data agreement** — DPA, no-training guarantee, and redaction approach for any external model touching customer content. (Compounds the existing "keep generative AI low-priority" stance — lower priority also lowers this exposure.)
5. **Content-moderation policy owner** — especially for the anonymous web-to-print surface.
6. **AGPL posture** — already flagged in the Word and PPTX docs for any embedded copyleft engine; it's a security-adjacent dependency decision too (self-hosting vs. licensing affects patch responsibility).

---

*Bottom line: this toolset is, underneath the design-tool framing, a high-volume untrusted-file parser wired into customer PII, order systems, and the production queue. Secure the parse (sandbox + patch + scan), turn the conversion pipeline into a sanitizer (CDR), keep the AI content-only and the integrations least-privilege, and make customer data ephemeral. Do those five things and the rest is conventional web-app hardening. Skip them and a crafted `.pub` or a poisoned flyer becomes code execution on a store PC or a leak of another customer's order.*
