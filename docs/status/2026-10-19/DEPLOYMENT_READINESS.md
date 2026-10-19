# Deployment readiness

| Target | Verdict | Conditions |
| --- | --- | --- |
| Local development | READY | Use `/Users/gadimani/Projects/neighborly-main` on APFS. Do not use the damaged T7 `.git`. |
| Private local staging | READY WITH CAUTION | Six containers are healthy and loopback-only. Preserve volumes and use synthetic data. |
| Supervised real-user testing | CONDITIONAL GO | Synthetic accounts, an operator-managed email strategy, scoped reset, and a fresh recovery check are required. |
| Invite-only remote beta | NO-GO | No approved private access gateway, identity controls, email delivery, monitoring, or operational support. |
| Public production | NO-GO | No production host, email provider, secret manager, legal approval, payment system, monitoring/on-call, or approved deployment. |

## Current staging

The six running containers are API, Caddy, RustFS, staging PostgreSQL, staging Redis, and web. They remain running and were not restarted. Published ports are loopback-only. The staging workspace and Docker volumes were not changed.

## Required before production

- Name and approve a deployment target and rollback owner.
- Configure isolated production secrets and a secret-management process.
- Provide real email delivery with retry/monitoring.
- Complete legal/privacy/consent review.
- Decide and implement payments, disputes, refunds, and identity policy.
- Verify migration, backup, object-storage restore, health checks, alerting, and on-call procedures.
- Complete current browser, accessibility, security, load, and user-acceptance testing.
- Obtain explicit deployment approval.
