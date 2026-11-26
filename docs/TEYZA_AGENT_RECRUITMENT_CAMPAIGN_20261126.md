# Teyza Field Agent recruitment campaign — draft for approval
Source: release/teyza-marketplace-v61-20261126. Website-only recruitment changes; do not deploy the mobile app or change seller billing for this campaign.

## Meta ad A — local business activation
Primary text: Become a Teyza Field Agent and help shops, food outlets, service providers and other businesses in your area join Teyza. Earn R90 for each qualifying new business registration after owner confirmation and Teyza verification. Apply free, download the app and track your work after approval. Work availability and earnings are not guaranteed; engagement and payment terms apply.
Headline: Become a Teyza Field Agent
Description: R90 per qualifying verified new business. Apply free.
CTA: Apply Now (or Learn More if unavailable).
Destination: https://teyza.co.za/agents.html?utm_source=meta&utm_medium=paid_social&utm_campaign=teyza_agents_pilot&utm_content=local_business

## Meta ad B — community connection
Primary text: Help local businesses get discovered on Teyza. Join the field team, visit owners with permission, guide registration and track your progress in the app. R90 per eligible new verified business; approval and agreed terms apply. No joining fee. No guaranteed work or income.
Headline: Connect businesses in your area
Description: Apply to join Teyza Work.
Destination: https://teyza.co.za/agents.html?utm_source=meta&utm_medium=paid_social&utm_campaign=teyza_agents_pilot&utm_content=community

Creative: use the real Teyza wordmark, existing approved spaza-owner photograph and actual published app screenshots. If using a Shopper screen, label it as such; do not present a mock Agent dashboard as live. Produce 1080×1350 feed and 1080×1920 story assets, with safe margins. Artwork hierarchy: TEYZA / FIELD AGENTS WANTED / R90 PER QUALIFYING VERIFIED BUSINESS / APPLY FREE / APPROVAL AND TERMS APPLY. Include legally reviewed cautionary wording and company/contact details where required; never promise daily/monthly income. No WhatsApp document submission. No payment for recruitment of other agents, downlines, joining fees or recruitment tiers.

## Pilot recommendation (not authorised budget)
Start Durban and Johannesburg only, suggested R100/day per area, seven days. Use inclusive location settings permitted by Meta and classify as employment/recruitment where applicable. Use website Leads if the genuine successful application event is instrumented and verified; otherwise use landing page views only for a limited smoke test and measure actual completed applications internally. Do not send identity documents, ID numbers, names, precise GPS, photos or other recruitment data to Meta. UTM URLs are defined above; attribution persistence and conversion events are not implemented by this PR. Measure landing views, submitted applications, approvals, active agents, verified sellers, approved rewards, actual paid rewards and all-in cost per verified seller. Separate advertising costs from R90 reward obligations. Do not optimise for installs alone.

## Launch gate
- Confirm approved role works in the exact public Android and iOS builds using same Firebase UID.
- Confirm both public store listings, Work social login and secure document upload, owner link, Admin review, and one unique R90 reward with test accounts.
- Check health: ok=true, agentRewardReviewEnabled=true, agentRewardCents=9000, agentCommissionEnabled=false, fieldAgentWorkspace=true, fieldAgentDiscovery=true.
- Run `node --test tools/app-first-release/publish-agents-only.test.cjs` and review mobile/desktop layouts. Deploy the public page using `node tools/app-first-release/publish-agents-only.cjs deploy` only after authenticated Firebase operator approval. Existing scoped publisher clones live Hosting, verifies unrelated files/config, and has rollback. Review the current Work publisher separately: its scope includes homepage and Work UI dependencies. Do not change production without testing.
- Finance and HR must approve written engagement, expenses, reward eligibility, payment timetable, budget and local legal compliance before accepting work. Existing source approves rewards as awaiting payment; old agent_admin_commission_paid action is retired. Implement a verified settlement ledger separately (idempotent paid records and audited payment references), not a false paid state.
- Agent-to-agent invitations: public page sharing only in this release. Future optional single-level source attribution for applications requires server-owned invite codes, validated non-self attribution, consent, and Admin reporting; not paid recruitment.
- Confirm application-to-approval and verified seller metrics, approved creative and budget before launching any campaign. 
