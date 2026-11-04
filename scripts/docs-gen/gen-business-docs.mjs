import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. Monetization.md
writeDoc('docs/business/Monetization.md', `# Monetization Strategy & Business Models — career-ops

## Purpose
Establishes the commercialization roadmap, monetization pillars, and business viability for career-ops.

## Scope
Covers open-core SaaS, verified job feeds, executive template marketplaces, and B2B outplacement.

## Overview
While the core of career-ops remains 100% open-source and local-first, substantial commercial opportunity exists in eliminating infrastructure friction (Playwright binaries, proxy rotation) and providing institutional talent solutions.

## Diagrams

\`\`\`mermaid
flowchart TD
    OSS["Open Source Core (Free Forever)\nLocal CLI, Markdown, Go TUI, Local Web"] --> Funnel["Commercial Conversion Funnel"]
    
    subgraph Revenue_Streams ["Revenue Streams"]
        SaaS["CareerOps Cloud ($29 - $49/mo)\nManaged Proxies, Zero-Install Web, Background Sweeps"]
        Feed["Verified High-Signal Feed ($19/mo)\nCurated Ghost-Free Job Feed"]
        B2B["Enterprise Outplacement ($499/license)\nB2B Packages for Tech Layoffs"]
        Marketplace["Executive Asset Marketplace\nCurated LaTeX Templates & Voice Agents"]
    end

    Funnel --> SaaS & Feed & B2B & Marketplace
\`\`\`

## Technical Details

### Commercial Pillars
1. **CareerOps Cloud (Managed SaaS)**:
   - Targets non-technical candidates or professionals on locked-down corporate laptops.
   - Provides a hosted web container with residential IP rotation, pre-installed Playwright browsers, and encrypted sync.
2. **Verified High-Signal Job Feed**:
   - A proprietary feed filtered by the Block G legitimacy engine that guarantees zero ghost postings, active recruiter responsiveness, and transparent salary disclosures.
3. **B2B Outplacement Platform**:
   - Sold to tech companies conducting layoffs. Instead of traditional, outdated outplacement agencies (Lee Hecht Harrison), tech firms gift departing engineers 6 months of CareerOps Pro.

## Best Practices
- Never cripple the open-source core: all local features must remain 100% free and open-source.

## Examples
- Open-core monetization modeled after successful developer platforms like Supabase, Tailscale, and PostHog.

## Future Enhancements
- Reverse recruiter marketplace where vetted candidates sell access to their verified dossiers.
`);

// 2. PricingStrategy.md
writeDoc('docs/business/PricingStrategy.md', `# Pricing Strategy & Tier Matrix — career-ops

## Purpose
Specifies the pricing tiers, packaging, feature entitlement matrix, and revenue projections.

## Scope
Applies to commercial hosted offerings and enterprise licensing.

## Overview
A value-based pricing strategy aligning candidate willingness-to-pay with career transition stakes.

## Diagrams

\`\`\`mermaid
flowchart LR
    Community["Community Edition\n$0 / Free Forever\nLocal-First Core"]
    Pro["Pro Cloud\n$39 / month\nManaged Headless Scanners & Proxy"]
    Executive["Executive Track\n$99 / month\nDeep Leveling & Comp Negotiation"]
    Enterprise["B2B Outplacement\n$499 / license\nBulk Enterprise Layoff Packages"]
\`\`\`

## Technical Details

### Tier Matrix

| Dimension | Community (OSS) | Pro Cloud | Executive Track | Enterprise B2B |
| :--- | :---: | :---: | :---: | :---: |
| **Price** | **$0** | **$39 / mo** | **$99 / mo** | **$499 / seat** |
| **Deployment** | Local Machine | Managed Cloud | Managed Cloud | Managed Cloud |
| **ATS Portals** | 60+ (Local IP) | 60+ (Proxy Pool) | 60+ (Proxy Pool) | Unlimited |
| **AI Model Access** | Bring Your Own Key | Included (Sonnet) | Included (Opus/Thinking) | Included |
| **Autofill Extension**| Open Source | Cloud Sync | Cloud Sync | Managed Enterprise |
| **Negotiation Scripts**| Standard | Advanced | 1-on-1 AI Coach | Cohort Analytics |

## Best Practices
- Offer a frictionless 14-day trial for Pro Cloud without requiring credit cards upfront.

## Examples
- High-intent candidates willingly invest $39–$99/month during active job searches when target salaries exceed $150k+.

## Future Enhancements
- Performance-based pricing (pay on placement) for specialized executive search tracks.
`);

// 3. GrowthLoops.md
writeDoc('docs/business/GrowthLoops.md', `# Viral Growth Loops & Flywheel — career-ops

## Purpose
Defines the product-led growth (PLG) mechanics, viral referral loops, and user acquisition flywheels.

## Scope
Covers candidate sharing, social proof artifacts, and developer community virality.

## Overview
career-ops grows through high-signal word of mouth: candidates who land life-changing roles naturally evangelize the tool to peers.

## Diagrams

\`\`\`mermaid
flowchart TD
    UserLandsJob["Candidate Lands Dream Job via career-ops"] --> HiredBadge["Publishes Proof to Hired Wall & LinkedIn"]
    HiredBadge --> PeerDiscovery["Peers Discover career-ops via High-Signal Post"]
    PeerDiscovery --> CloneAndUse["Peers Clone & Configure Portals"]
    CloneAndUse --> CommunityContrib["Users Contribute New Company Boards to portals.yml"]
    CommunityContrib --> StrongerProduct["Scanner Network Grows Stronger for Everyone"]
    StrongerProduct --> UserLandsJob
\`\`\`

## Technical Details

### Viral Mechanisms
1. **The Ghost Job Exposer**:
   - Candidates generate a redacted, shareable infographic exposing phantom postings:
     > *"Why this job posting scored 1.5/5 on the Ghost Index. Verified by career-ops."*
   - Generates massive engagement across LinkedIn and tech Twitter.
2. **"Hired Wall" Social Proof**:
   - Candidates submit anonymous offer metrics to \`docs/hired-wall.svg\`, celebrating successful negotiations.
3. **Open-Source ATS Database Network Effects**:
   - Every contributor adding a company career board expands the scraper coverage for the entire community.

## Best Practices
- Ensure all public sharing mechanisms default to redacting candidate PII.

## Examples
- Santiago's original announcement post generating hundreds of GitHub stars organically.

## Future Enhancements
- Interactive web badges ("Prepared with career-ops") embedded in candidate personal portfolio sites.
`);

// 4. KPIFramework.md
writeDoc('docs/business/KPIFramework.md', `# Key Performance Indicator (KPI) Framework — career-ops

## Purpose
Establishes the quantitative metrics for measuring product effectiveness, candidate success, and engineering health.

## Scope
Applies to pipeline analytics, funnel calibration, and community health.

## Overview
Success for career-ops is measured not by hours spent in the app, but by how quickly a candidate lands an exceptional job offer with the fewest wasted applications.

## Diagrams

\`\`\`mermaid
flowchart LR
    FunnelMetrics["Funnel Conversion KPIs\n- Eval-to-Apply Ratio\n- Interview Rate\n- Offer Acceptance Rate"]
    VelocityMetrics["Velocity KPIs\n- Rejection Latency\n- Days-to-Offer\n- Follow-Up Compliance"]
    QualityMetrics["Product Quality KPIs\n- Zero Fabrication Rate\n- Scraper Uptime\n- Ghost Detection Accuracy"]
\`\`\`

## Technical Details

### Core Candidate Success Metrics
- **Interview Conversion Rate**: Percentage of submitted applications that advance to a first-round interview (Benchmark: $\ge 15\%$, vs. industry average of $2-3\%$).
- **Application Efficiency (Eval-to-Apply Ratio)**: Percentage of evaluated listings that clear the 4.0 threshold (Target: $10-15\%$).
- **Rejection Latency**: Number of days between application submission and recruiter response.
- **Comp Delta**: Percentage increase between initial recruiter offer and final negotiated compensation package.

### Engineering & Community KPIs
- **Provider Coverage**: Number of supported ATS platforms and public job boards (Target: > 75).
- **Zero-Fabrication Integrity**: 100% pass rate in \`verify-cv-facts.mjs\` fact-checking audits.
- **CI Build Duration**: Kept below 8 minutes.

## Best Practices
- Run \`node stats.mjs\` regularly to track your personal pipeline conversion velocity.

## Examples
\`\`\`bash
# Calculate personal funnel conversion metrics
node stats.mjs --summary
\`\`\`

## Future Enhancements
- Aggregate, privacy-preserving anonymized benchmark reporting comparing candidate conversion rates against global market averages.
`);

console.log('Business docs generation complete.');

